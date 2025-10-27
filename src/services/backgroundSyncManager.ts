// Gestionnaire de synchronisation en arrière-plan avec optimisations
import { CompressionService, type CompressionResult } from "./compressionService"
import { LotteryResultsService } from "./supabaseClient"
import { SYNC_STRATEGIES, type BackgroundSyncConfig, type SyncMetrics } from "@/config/backgroundSync"
import type { DrawResult } from "./lotteryApi"

export interface SyncQueueItem {
  id: string
  type: "create" | "update" | "delete" | "bulk"
  data: any
  priority: "high" | "normal" | "low"
  timestamp: Date
  retries: number
  compressed?: CompressionResult
  originalSize?: number
}

export interface SyncStatus {
  isActive: boolean
  currentStrategy: string
  queueSize: number
  isOnline: boolean
  lastSync: Date | null
  nextSync: Date | null
  syncInProgress: boolean
  metrics: SyncMetrics
}

export interface SyncConflict {
  id: string
  localData: any
  remoteData: any
  conflictType: "update_conflict" | "delete_conflict" | "version_conflict"
  timestamp: Date
  resolved: boolean
}

export class BackgroundSyncManager {
  private static instance: BackgroundSyncManager | null = null
  private config: BackgroundSyncConfig
  private syncQueue: SyncQueueItem[] = []
  private metrics: SyncMetrics
  private intervalId: number | null = null
  private serviceWorker: ServiceWorker | null = null
  private webWorker: Worker | null = null
  private conflicts: SyncConflict[] = []
  private isProcessing = false
  private isRunning = false

  constructor() {
    this.syncQueue = []
    this.isRunning = false
    this.intervalId = null
    this.config = {
      syncIntervalMinutes: 15,
      maxRetries: 3,
      batchSize: 50,
      enableCompression: true,
      enableDeltaSync: true,
      priorityMode: "balanced",
      networkConditions: "auto",
    }
    this.metrics = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      averageSyncTime: 0,
      dataTransferred: 0,
      compressionRatio: 0,
      lastSyncTimestamp: null,
      networkUsage: 0,
      batteryImpact: "low",
    }

    if (typeof window !== "undefined") {
      this.loadConfig()
      this.loadMetrics()
      this.loadQueue()
      this.setupEventListeners()
      this.initializeWorkers()
    }
  }

  static getInstance(): BackgroundSyncManager {
    if (!BackgroundSyncManager.instance) {
      BackgroundSyncManager.instance = new BackgroundSyncManager()
    }
    return BackgroundSyncManager.instance
  }

  // Initialiser la synchronisation
  async initialize(): Promise<void> {
    console.log("🔄 Initialisation du gestionnaire de sync en arrière-plan...")

    if (this.config.enableBackgroundSync) {
      await this.startSync()
    }

    // Traiter la queue existante
    if (this.syncQueue.length > 0) {
      console.log(`📦 ${this.syncQueue.length} éléments en file d'attente`)
      await this.processQueue()
    }
  }

  // Démarrer la synchronisation automatique
  async startSync(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }

    if (this.config.syncIntervalMinutes > 0) {
      const syncInterval = this.config.syncIntervalMinutes * 60 * 1000 // Convert minutes to milliseconds
      this.intervalId = window.setInterval(async () => {
        if (!this.isProcessing && navigator.onLine) {
          await this.performSync()
        }
      }, syncInterval)
    }

    console.log(`✅ Synchronisation démarrée (intervalle: ${this.config.syncIntervalMinutes} minutes)`)
  }

  // Arrêter la synchronisation
  stopSync(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    console.log("⏹️ Synchronisation arrêtée")
  }

  // Ajouter un élément à la queue
  async enqueue(item: Omit<SyncQueueItem, "id" | "timestamp" | "retries">): Promise<void> {
    const queueItem: SyncQueueItem = {
      ...item,
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      retries: 0,
    }

    // Compresser les données si activé
    if (this.config.enableCompression && item.data) {
      try {
        const compressionResult = await CompressionService.compressGzip(item.data)
        queueItem.compressed = compressionResult
        queueItem.originalSize = compressionResult.originalSize

        console.log(
          `🗜️ Données compressées: ${compressionResult.originalSize} → ${compressionResult.compressedSize} bytes (${(compressionResult.compressionRatio * 100).toFixed(1)}%)`,
        )
      } catch (error) {
        console.warn("Échec compression, ajout sans compression:", error)
      }
    }

    // Insérer selon la priorité
    if (queueItem.priority === "high") {
      this.syncQueue.unshift(queueItem)
    } else {
      this.syncQueue.push(queueItem)
    }

    // Limiter la taille de la queue
    if (this.syncQueue.length > this.config.offlineQueueSize) {
      const removed = this.syncQueue.pop()
      console.warn("Queue pleine, élément supprimé:", removed?.id)
    }

    this.saveQueue()

    // Traiter immédiatement si priorité haute et en ligne
    if (queueItem.priority === "high" && navigator.onLine && !this.isProcessing) {
      await this.processQueue()
    }
  }

  // Traiter la queue de synchronisation
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.syncQueue.length === 0 || !navigator.onLine) {
      return
    }

    this.isProcessing = true
    const startTime = performance.now()
    let processedItems = 0
    let dataTransferred = 0

    try {
      // Traiter par lots
      const batchSize = Math.min(this.config.batchSize, this.syncQueue.length)
      const batch = this.syncQueue.splice(0, batchSize)

      console.log(`🔄 Traitement d'un lot de ${batch.length} éléments...`)

      for (const item of batch) {
        try {
          await this.processSyncItem(item)
          processedItems++

          if (item.compressed) {
            dataTransferred += item.compressed.compressedSize
          } else if (item.originalSize) {
            dataTransferred += item.originalSize
          }
        } catch (error) {
          console.error(`❌ Échec traitement élément ${item.id}:`, error)

          item.retries++
          if (item.retries < this.config.maxRetries) {
            // Remettre en queue avec délai
            setTimeout(() => {
              this.syncQueue.push(item)
              this.saveQueue()
            }, this.config.retryDelay * item.retries)
          } else {
            console.error(`💀 Élément ${item.id} abandonné après ${this.config.maxRetries} tentatives`)
            this.metrics.failedSyncs++
          }
        }
      }

      // Mettre à jour les métriques
      const syncTime = performance.now() - startTime
      this.updateMetrics(processedItems, syncTime, dataTransferred)

      this.saveQueue()

      console.log(`✅ Lot traité: ${processedItems}/${batch.length} éléments en ${syncTime.toFixed(0)}ms`)
    } catch (error) {
      console.error("❌ Erreur traitement queue:", error)
      this.metrics.failedSyncs++
    } finally {
      this.isProcessing = false
    }
  }

  // Traiter un élément de synchronisation
  private async processSyncItem(item: SyncQueueItem): Promise<void> {
    let data = item.data

    // Décompresser si nécessaire
    if (item.compressed) {
      try {
        data = await CompressionService.decompress(item.compressed)
      } catch (error) {
        console.error("Erreur décompression:", error)
        throw error
      }
    }

    switch (item.type) {
      case "create":
        await this.handleCreate(data)
        break
      case "update":
        await this.handleUpdate(data)
        break
      case "delete":
        await this.handleDelete(data)
        break
      case "bulk":
        await this.handleBulk(data)
        break
    }
  }

  // Gestionnaires spécifiques
  private async handleCreate(data: any): Promise<void> {
    if (data.draw_name && data.date && data.gagnants) {
      const supabaseFormat = {
        draw_name: data.draw_name,
        date: data.date,
        winning_numbers: data.gagnants,
        machine_numbers: data.machine || null,
      }

      await LotteryResultsService.addResult(supabaseFormat)
    }
  }

  private async handleUpdate(data: any): Promise<void> {
    if (data.id) {
      await LotteryResultsService.updateResult(data.id, data.updates)
    }
  }

  private async handleDelete(data: any): Promise<void> {
    if (data.id) {
      await LotteryResultsService.deleteResult(data.id)
    }
  }

  private async handleBulk(data: any): Promise<void> {
    if (Array.isArray(data.items)) {
      for (const item of data.items) {
        await this.processSyncItem({
          id: item.id || `bulk_${Date.now()}`,
          type: item.type,
          data: item.data,
          priority: "normal",
          timestamp: new Date(),
          retries: 0,
        })
      }
    }
  }

  // Synchronisation forcée manuelle
  async forceSync(): Promise<boolean> {
    try {
      await this.performSync()
      return true
    } catch (error) {
      console.error("Erreur synchronisation forcée:", error)
      return false
    }
  }

  // Effectuer une synchronisation complète
  private async performSync(): Promise<void> {
    if (!navigator.onLine) {
      console.log("📴 Hors ligne - synchronisation reportée")
      return
    }

    const startTime = performance.now()

    try {
      // 1. Traiter la queue locale
      await this.processQueue()

      // 2. Récupérer les mises à jour du serveur
      await this.pullUpdatesFromServer()

      // 3. Résoudre les conflits
      await this.resolveConflicts()

      const syncTime = performance.now() - startTime
      this.metrics.lastSyncTimestamp = new Date()

      console.log(`✅ Synchronisation complète en ${syncTime.toFixed(0)}ms`)
    } catch (error) {
      console.error("❌ Erreur synchronisation:", error)
      this.metrics.failedSyncs++
    }
  }

  // Récupérer les mises à jour du serveur
  private async pullUpdatesFromServer(): Promise<void> {
    try {
      const lastSync = this.metrics.lastSyncTimestamp

      // Récupérer les nouvelles données depuis la dernière sync
      const updates = await LotteryResultsService.getAllResults()

      if (updates.length > 0) {
        console.log(`📥 ${updates.length} mises à jour reçues du serveur`)

        // Traiter les mises à jour et détecter les conflits
        await this.processServerUpdates(updates)
      }
    } catch (error) {
      console.error("Erreur récupération mises à jour serveur:", error)
    }
  }

  // Traiter les mises à jour du serveur
  private async processServerUpdates(updates: any[]): Promise<void> {
    const localData = this.getLocalData()

    for (const update of updates) {
      const localItem = localData.find((item) => item.draw_name === update.draw_name && item.date === update.date)

      if (localItem) {
        // Détecter les conflits
        if (this.hasConflict(localItem, update)) {
          this.conflicts.push({
            id: `conflict_${Date.now()}`,
            localData: localItem,
            remoteData: update,
            conflictType: "update_conflict",
            timestamp: new Date(),
            resolved: false,
          })
        }
      } else {
        // Nouvelle donnée - l'ajouter localement
        this.addToLocalData(update)
      }
    }
  }

  // Détecter les conflits
  private hasConflict(localData: any, remoteData: any): boolean {
    // Comparer les numéros gagnants
    if (JSON.stringify(localData.gagnants?.sort()) !== JSON.stringify(remoteData.winning_numbers?.sort())) {
      return true
    }

    // Comparer les numéros machine
    if (JSON.stringify(localData.machine?.sort()) !== JSON.stringify(remoteData.machine_numbers?.sort())) {
      return true
    }

    return false
  }

  // Résoudre les conflits automatiquement
  private async resolveConflicts(): Promise<void> {
    const unresolvedConflicts = this.conflicts.filter((c) => !c.resolved)

    for (const conflict of unresolvedConflicts) {
      try {
        // Stratégie: prioriser les données du serveur (last-write-wins)
        await this.resolveConflict(conflict, "server-wins")
        conflict.resolved = true
      } catch (error) {
        console.error("Erreur résolution conflit:", error)
      }
    }

    if (unresolvedConflicts.length > 0) {
      console.log(`🔧 ${unresolvedConflicts.length} conflit(s) résolus automatiquement`)
    }
  }

  // Résoudre un conflit spécifique
  private async resolveConflict(
    conflict: SyncConflict,
    strategy: "server-wins" | "local-wins" | "merge",
  ): Promise<void> {
    switch (strategy) {
      case "server-wins":
        // Utiliser les données du serveur
        this.updateLocalData(conflict.remoteData)
        break
      case "local-wins":
        // Envoyer les données locales au serveur
        await this.enqueue({
          type: "update",
          data: conflict.localData,
          priority: "high",
        })
        break
      case "merge":
        // Fusionner les données (stratégie complexe)
        const merged = this.mergeConflictData(conflict.localData, conflict.remoteData)
        this.updateLocalData(merged)
        break
    }
  }

  // Fusionner les données en conflit
  private mergeConflictData(localData: any, remoteData: any): any {
    // Stratégie de fusion simple : prendre le plus récent
    const localTime = new Date(localData.updated_at || localData.date).getTime()
    const remoteTime = new Date(remoteData.updated_at || remoteData.date).getTime()

    return remoteTime > localTime ? remoteData : localData
  }

  // Configuration
  updateConfig(newConfig: Partial<BackgroundSyncConfig>): void {
    this.config = { ...this.config, ...newConfig }
    this.saveConfig()

    // Redémarrer avec la nouvelle configuration
    if (this.config.enableBackgroundSync) {
      this.startSync()
    } else {
      this.stopSync()
    }
  }

  setStrategy(strategyName: keyof typeof SYNC_STRATEGIES): void {
    const strategy = SYNC_STRATEGIES[strategyName]
    if (strategy) {
      this.updateConfig({
        syncIntervalMinutes: strategy.intervalMinutes,
        enableBackgroundSync: strategy.intervalMinutes > 0,
      })
      console.log(`🔄 Stratégie de sync changée: ${strategy.name}`)
    }
  }

  // Métriques et statut
  getStatus(): SyncStatus {
    return {
      isActive: this.intervalId !== null,
      currentStrategy: this.getCurrentStrategy(),
      queueSize: this.syncQueue.length,
      isOnline: navigator.onLine,
      lastSync: this.metrics.lastSyncTimestamp,
      nextSync: this.getNextSyncTime(),
      syncInProgress: this.isProcessing,
      metrics: { ...this.metrics },
    }
  }

  getConflicts(): SyncConflict[] {
    return [...this.conflicts]
  }

  clearResolvedConflicts(): void {
    this.conflicts = this.conflicts.filter((c) => !c.resolved)
  }

  // Méthodes utilitaires privées
  private getCurrentStrategy(): string {
    for (const [key, strategy] of Object.entries(SYNC_STRATEGIES)) {
      if (strategy.intervalMinutes === this.config.syncIntervalMinutes) {
        return strategy.name
      }
    }
    return "Personnalisé"
  }

  private getNextSyncTime(): Date | null {
    if (!this.intervalId || !this.metrics.lastSyncTimestamp) return null
    return new Date(this.metrics.lastSyncTimestamp.getTime() + this.config.syncIntervalMinutes * 60 * 1000)
  }

  private updateMetrics(processed: number, syncTime: number, dataTransferred: number): void {
    this.metrics.totalSyncs++
    this.metrics.successfulSyncs += processed
    this.metrics.averageSyncTime =
      (this.metrics.averageSyncTime * (this.metrics.totalSyncs - 1) + syncTime) / this.metrics.totalSyncs
    this.metrics.dataTransferred += dataTransferred
    this.metrics.networkUsage += dataTransferred / (1024 * 1024) // Convert to MB

    // Calculer le ratio de compression moyen
    const compressionStats = CompressionService.getStats()
    if (compressionStats.totalCompressions > 0) {
      this.metrics.compressionRatio = compressionStats.averageCompressionRatio
    }

    this.saveMetrics()
  }

  // Gestion des workers
  private async initializeWorkers(): Promise<void> {
    if (this.config.enableServiceWorker && "serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js")
        this.serviceWorker = registration.active
        console.log("✅ Service Worker initialisé")
      } catch (error) {
        console.warn("Service Worker non disponible:", error)
      }
    }

    if (this.config.enableWebWorker && "Worker" in window) {
      try {
        // Note: Le Web Worker nécessiterait un fichier séparé
        console.log("🔧 Web Worker disponible pour optimisations futures")
      } catch (error) {
        console.warn("Web Worker non disponible:", error)
      }
    }
  }

  private setupEventListeners(): void {
    if (typeof window === "undefined") return

    window.addEventListener("online", () => {
      console.log("🌐 Connexion rétablie - reprise de la sync")
      if (this.config.enableBackgroundSync) {
        this.performSync()
      }
    })

    window.addEventListener("offline", () => {
      console.log("📴 Hors ligne - mode queue activé")
    })

    // Écouter la visibilité de la page
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        // Page redevenue visible - synchroniser
        if (this.config.enableBackgroundSync && this.syncQueue.length > 0) {
          this.processQueue()
        }
      }
    })
  }

  // Persistance
  private saveConfig(): void {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return

    try {
      localStorage.setItem("background_sync_config", JSON.stringify(this.config))
    } catch (e) {
      console.warn("Impossible de sauvegarder la config:", e)
    }
  }

  private loadConfig(): void {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return

    try {
      const saved = localStorage.getItem("background_sync_config")
      if (saved) {
        this.config = { ...this.config, ...JSON.parse(saved) }
      }
    } catch (e) {
      console.warn("Impossible de charger la config:", e)
    }
  }

  private saveMetrics(): void {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return

    try {
      localStorage.setItem("background_sync_metrics", JSON.stringify(this.metrics))
    } catch (e) {
      console.warn("Impossible de sauvegarder les métriques:", e)
    }
  }

  private loadMetrics(): void {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return

    try {
      const saved = localStorage.getItem("background_sync_metrics")
      if (saved) {
        const loadedMetrics = JSON.parse(saved)
        this.metrics = {
          ...this.metrics,
          ...loadedMetrics,
          lastSyncTimestamp: loadedMetrics.lastSyncTimestamp ? new Date(loadedMetrics.lastSyncTimestamp) : null,
        }
      }
    } catch (e) {
      console.warn("Impossible de charger les métriques:", e)
    }
  }

  private saveQueue(): void {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return

    try {
      localStorage.setItem("background_sync_queue", JSON.stringify(this.syncQueue))
    } catch (e) {
      console.warn("Impossible de sauvegarder la queue:", e)
    }
  }

  private loadQueue(): void {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return

    try {
      const saved = localStorage.getItem("background_sync_queue")
      if (saved) {
        const loadedQueue = JSON.parse(saved)
        this.syncQueue = loadedQueue.map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp),
        }))
      }
    } catch (e) {
      console.warn("Impossible de charger la queue:", e)
    }
  }

  private getLocalData(): any[] {
    try {
      const cached = localStorage.getItem("lottery_results_cache")
      if (cached) {
        const { data } = JSON.parse(cached)
        return Array.isArray(data) ? data : []
      }
    } catch (e) {
      console.warn("Erreur lecture données locales:", e)
    }
    return []
  }

  private addToLocalData(item: any): void {
    try {
      const localData = this.getLocalData()
      localData.push(item)

      const cacheData = {
        data: localData,
        timestamp: Date.now(),
        version: "3.2",
      }
      localStorage.setItem("lottery_results_cache", JSON.stringify(cacheData))
    } catch (e) {
      console.warn("Erreur ajout données locales:", e)
    }
  }

  private updateLocalData(item: any): void {
    try {
      const localData = this.getLocalData()
      const index = localData.findIndex((d) => d.draw_name === item.draw_name && d.date === item.date)

      if (index >= 0) {
        localData[index] = item
      } else {
        localData.push(item)
      }

      const cacheData = {
        data: localData,
        timestamp: Date.now(),
        version: "3.2",
      }
      localStorage.setItem("lottery_results_cache", JSON.stringify(cacheData))
    } catch (e) {
      console.warn("Erreur mise à jour données locales:", e)
    }
  }

  // Méthodes publiques pour l'intégration
  async addDrawResult(drawResult: DrawResult): Promise<void> {
    await this.enqueue({
      type: "create",
      data: drawResult,
      priority: "high",
    })
  }

  async updateDrawResult(id: number, updates: Partial<DrawResult>): Promise<void> {
    await this.enqueue({
      type: "update",
      data: { id, updates },
      priority: "normal",
    })
  }

  async deleteDrawResult(id: number): Promise<void> {
    await this.enqueue({
      type: "delete",
      data: { id },
      priority: "normal",
    })
  }

  async bulkOperation(items: any[]): Promise<void> {
    await this.enqueue({
      type: "bulk",
      data: { items },
      priority: "normal",
    })
  }

  // Nettoyage
  destroy(): void {
    this.stopSync()
    this.saveQueue()
    this.saveMetrics()
    this.saveConfig()

    if (this.webWorker) {
      this.webWorker.terminate()
    }

    BackgroundSyncManager.instance = null
    console.log("🧹 BackgroundSyncManager détruit")
  }
}

// Instance globale
export const backgroundSync = BackgroundSyncManager.getInstance()
