// Service de synchronisation bidirectionnelle automatique - SYSTÈME COMPLET
import {LotteryResultsService, AuditService, AuthService} from '@/services/supabaseClient'
import {fetchLotteryResults as fetchFromExternalAPI} from '@/services/lotteryApi'
import {IntegratedLotteryService} from '@/services/lotteryApiIntegrated'
import type {DrawResult} from '@/services/lotteryApi'
import type {LotteryResult} from '@/config/supabase'

export interface SyncStatus {
 isActive: boolean
 lastSync: Date | null
 nextSync: Date | null
 syncDirection: 'idle' | 'local-to-supabase' | 'supabase-to-local' | 'external-to-both' | 'bidirectional'
 conflictsDetected: number
 resolvedConflicts: number
 pendingOperations: number
 errorCount: number
 connectionQuality: 'excellent' | 'good' | 'poor' | 'offline'
 dataConsistency: number // 0-100%
}

export interface SyncConflict {
 id: string
 type: 'data_mismatch' | 'timestamp_conflict' | 'duplicate_entry' | 'missing_reference'
 localData: any
 remoteData: any
 detectedAt: Date
 resolved: boolean
 resolution?: 'prefer_local' | 'prefer_remote' | 'merge' | 'manual'
 resolvedAt?: Date
}

export interface SyncOperation {
 id: string
 type: 'INSERT' | 'UPDATE' | 'DELETE' | 'SYNC'
 table: 'lottery_results' | 'predictions' | 'user_preferences' | 'audit_logs'
 data: any
 direction: 'local-to-remote' | 'remote-to-local'
 status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'conflict'
 createdAt: Date
 completedAt?: Date
 error?: string
 retryCount: number
 maxRetries: number
}

class BidirectionalSyncService {
 private static instance: BidirectionalSyncService
 private isRunning = false
 private syncInterval?: NodeJS.Timeout
 private realTimeSubscriptions: any[] = []
 private status: SyncStatus = {
  isActive: false,
  lastSync: null,
  nextSync: null,
  syncDirection: 'idle',
  conflictsDetected: 0,
  resolvedConflicts: 0,
  pendingOperations: 0,
  errorCount: 0,
  connectionQuality: 'offline',
  dataConsistency: 0
 }
 private conflicts: SyncConflict[] = []
 private operations: SyncOperation[] = []
 private listeners: ((status: SyncStatus) => void)[] = []

 // Configuration par défaut
 private config = {
  syncIntervalMs: 30000, // 30 secondes
  realTimeEnabled: true,
  conflictResolution: 'prefer_remote' as 'prefer_local' | 'prefer_remote' | 'manual',
  batchSize: 50,
  maxRetries: 3,
  backoffMultiplier: 2,
  enabledTables: ['lottery_results', 'predictions', 'user_preferences'],
  offlineBatchSize: 100
 }

 static getInstance(): BidirectionalSyncService {
  if (!BidirectionalSyncService.instance) {
   BidirectionalSyncService.instance = new BidirectionalSyncService()
  }
  return BidirectionalSyncService.instance
 }

 // Démarrer la synchronisation automatique
 async startBidirectionalSync(): Promise<void> {
  if (this.isRunning) {
   console.log('🔄 Synchronisation déjà active')
   return
  }

  console.log('🚀 Démarrage synchronisation bidirectionnelle...')
  this.isRunning = true
  this.status.isActive = true

  try {
   // 1. Synchronisation initiale complète
   await this.performFullSync()

   // 2. Démarrer synchronisation périodique
   this.startPeriodicSync()

   // 3. Activer synchronisation temps réel
   if (this.config.realTimeEnabled) {
    await this.setupRealTimeSync()
   }

   // 4. Configurer les observateurs de changements locaux
   this.setupLocalChangeDetection()

   // 5. Démarrer le processeur de conflits
   this.startConflictResolver()

   console.log('✅ Synchronisation bidirectionnelle démarrée')
   this.notifyListeners()

  } catch (error) {
   console.error('❌ Erreur démarrage synchronisation:', error)
   this.status.errorCount++
   this.notifyListeners()
   throw error
  }
 }

 // Arrêter la synchronisation
 async stopBidirectionalSync(): Promise<void> {
  console.log('🛑 Arrêt synchronisation bidirectionnelle...')
  
  this.isRunning = false
  this.status.isActive = false
  this.status.syncDirection = 'idle'

  // Nettoyer les timers
  if (this.syncInterval) {
   clearInterval(this.syncInterval)
   this.syncInterval = undefined
  }

  // Fermer les subscriptions temps réel
  this.realTimeSubscriptions.forEach(subscription => {
   if (subscription?.unsubscribe) {
    subscription.unsubscribe()
   }
  })
  this.realTimeSubscriptions = []

  console.log('✅ Synchronisation arrêtée')
  this.notifyListeners()
 }

 // Synchronisation complète initiale
 private async performFullSync(): Promise<void> {
  console.log('🔄 Synchronisation complète démarrée...')
  this.status.syncDirection = 'bidirectional'

  try {
   // 1. Analyser l'état des données
   const analysis = await this.analyzeDataState()
   
   // 2. Synchroniser depuis l'API externe
   await this.syncFromExternalAPI()
   
   // 3. Synchroniser entre local et Supabase
   await this.syncLocalWithSupabase()
   
   // 4. Calculer la cohérence des données
   this.status.dataConsistency = await this.calculateDataConsistency()
   
   this.status.lastSync = new Date()
   this.status.nextSync = new Date(Date.now() + this.config.syncIntervalMs)
   
   console.log(`✅ Synchronisation complète terminée (cohérence: ${this.status.dataConsistency}%)`)

  } catch (error) {
   console.error('❌ Erreur synchronisation complète:', error)
   this.status.errorCount++
   throw error
  } finally {
   this.status.syncDirection = 'idle'
   this.notifyListeners()
  }
 }

 // Démarrer synchronisation périodique
 private startPeriodicSync(): void {
  this.syncInterval = setInterval(async () => {
   if (navigator.onLine && this.isRunning) {
    try {
     await this.performIncrementalSync()
    } catch (error) {
     console.error('❌ Erreur sync périodique:', error)
     this.status.errorCount++
     this.notifyListeners()
    }
   }
  }, this.config.syncIntervalMs)
 }

 // Synchronisation incrémentale
 private async performIncrementalSync(): Promise<void> {
  if (this.status.pendingOperations > 0) {
   console.log(`🔄 Traitement ${this.status.pendingOperations} opération(s) en attente...`)
   await this.processPendingOperations()
  }

  // Vérifier les changements depuis la dernière synchronisation
  const hasLocalChanges = await this.detectLocalChanges()
  const hasRemoteChanges = await this.detectRemoteChanges()

  if (hasLocalChanges || hasRemoteChanges) {
   console.log(`🔄 Sync incrémentale: local=${hasLocalChanges}, remote=${hasRemoteChanges}`)
   await this.syncChanges(hasLocalChanges, hasRemoteChanges)
  }

  this.status.lastSync = new Date()
  this.status.nextSync = new Date(Date.now() + this.config.syncIntervalMs)
  this.notifyListeners()
 }

 // Configuration synchronisation temps réel avec Supabase
 private async setupRealTimeSync(): Promise<void> {
  console.log('⚡ Configuration synchronisation temps réel...')

  try {
   const {supabase} = await import('@/services/supabaseClient')

   // Écouter les changements sur lottery_results
   const lotterySubscription = supabase
    .channel('lottery_results_changes')
    .on('postgres_changes', {
     event: '*',
     schema: 'public',
     table: 'lottery_results'
    }, (payload) => {
     this.handleRealTimeChange('lottery_results', payload)
    })
    .subscribe()

   // Écouter les changements sur predictions_history
   const predictionsSubscription = supabase
    .channel('predictions_changes')
    .on('postgres_changes', {
     event: '*',
     schema: 'public',
     table: 'predictions_history'
    }, (payload) => {
     this.handleRealTimeChange('predictions', payload)
    })
    .subscribe()

   this.realTimeSubscriptions.push(lotterySubscription, predictionsSubscription)
   console.log('✅ Synchronisation temps réel configurée')

  } catch (error) {
   console.error('❌ Erreur configuration temps réel:', error)
   this.status.errorCount++
  }
 }

 // Gérer les changements temps réel
 private handleRealTimeChange(table: string, payload: any): void {
  console.log(`⚡ Changement temps réel détecté sur ${table}:`, payload.eventType)

  const operation: SyncOperation = {
   id: `realtime_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
   type: payload.eventType.toUpperCase(),
   table: table as any,
   data: payload.new || payload.old,
   direction: 'remote-to-local',
   status: 'pending',
   createdAt: new Date(),
   retryCount: 0,
   maxRetries: this.config.maxRetries
  }

  this.operations.push(operation)
  this.status.pendingOperations++
  
  // Traiter immédiatement si possible
  this.processOperation(operation)
  this.notifyListeners()
 }

 // Détecter changements locaux
 private setupLocalChangeDetection(): void {
  // Observer changements localStorage
  const originalSetItem = localStorage.setItem
  localStorage.setItem = (key: string, value: string) => {
   originalSetItem.call(localStorage, key, value)
   
   if (key.includes('lottery_results') || key.includes('admin_data') || key.includes('predictions')) {
    this.handleLocalChange(key, value)
   }
  }

  // Observer changements dans les données de l'application
  window.addEventListener('storage', (e) => {
   if (e.key && (e.key.includes('lottery_results') || e.key.includes('admin_data'))) {
    this.handleLocalChange(e.key, e.newValue)
   }
  })
 }

 // Gérer changements locaux
 private handleLocalChange(key: string, value: string | null): void {
  if (!value || !this.isRunning) return

  console.log(`📝 Changement local détecté: ${key}`)

  const operation: SyncOperation = {
   id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
   type: 'UPDATE',
   table: this.mapKeyToTable(key),
   data: this.parseLocalData(value),
   direction: 'local-to-remote',
   status: 'pending',
   createdAt: new Date(),
   retryCount: 0,
   maxRetries: this.config.maxRetries
  }

  this.operations.push(operation)
  this.status.pendingOperations++
  
  // Synchroniser avec un léger délai pour éviter les appels excessifs
  setTimeout(() => {
   this.processOperation(operation)
  }, 2000)

  this.notifyListeners()
 }

 // Traiter une opération de synchronisation
 private async processOperation(operation: SyncOperation): Promise<void> {
  operation.status = 'in_progress'

  try {
   switch (operation.direction) {
    case 'local-to-remote':
     await this.syncLocalToRemote(operation)
     break
    case 'remote-to-local':
     await this.syncRemoteToLocal(operation)
     break
   }

   operation.status = 'completed'
   operation.completedAt = new Date()
   this.status.pendingOperations = Math.max(0, this.status.pendingOperations - 1)

  } catch (error) {
   console.error('❌ Erreur traitement opération:', error)
   operation.status = 'failed'
   operation.error = error instanceof Error ? error.message : String(error)
   operation.retryCount++

   if (operation.retryCount < operation.maxRetries) {
    // Programmer un retry avec backoff exponentiel
    setTimeout(() => {
     operation.status = 'pending'
     this.processOperation(operation)
    }, Math.pow(this.config.backoffMultiplier, operation.retryCount) * 1000)
   } else {
    this.status.errorCount++
   }
  }

  this.notifyListeners()
 }

 // Synchroniser local vers Supabase
 private async syncLocalToRemote(operation: SyncOperation): Promise<void> {
  if (operation.table === 'lottery_results') {
   const drawResult = operation.data as DrawResult
   
   const supabaseFormat = {
    draw_name: drawResult.draw_name,
    date: drawResult.date,
    winning_numbers: drawResult.gagnants,
    machine_numbers: drawResult.machine || null
   }

   await LotteryResultsService.addResult(supabaseFormat)
  }

  // Logger l'activité
  const user = await AuthService.getCurrentUser()
  if (user) {
   await AuditService.addLog({
    user_id: user.id,
    action: 'BIDIRECTIONAL_SYNC',
    table_name: operation.table,
    new_data: {
     operation_id: operation.id,
     direction: operation.direction,
     type: operation.type
    }
   })
  }
 }

 // Synchroniser Supabase vers local
 private async syncRemoteToLocal(operation: SyncOperation): Promise<void> {
  if (operation.table === 'lottery_results') {
   const supabaseResult = operation.data as LotteryResult
   
   const localFormat: DrawResult = {
    draw_name: supabaseResult.draw_name,
    date: supabaseResult.date,
    gagnants: supabaseResult.winning_numbers,
    machine: supabaseResult.machine_numbers || undefined
   }

   // Mettre à jour le cache local
   const existingResults = this.getLocalResults()
   const existingIndex = existingResults.findIndex(r => 
    r.draw_name === localFormat.draw_name && r.date === localFormat.date
   )

   if (existingIndex >= 0) {
    existingResults[existingIndex] = localFormat
   } else {
    existingResults.unshift(localFormat)
   }

   this.saveLocalResults(existingResults)
  }
 }

 // Détecter conflits de données
 private async detectConflicts(): Promise<SyncConflict[]> {
  const conflicts: SyncConflict[] = []

  try {
   const localResults = this.getLocalResults()
   const remoteResults = await LotteryResultsService.getAllResults()

   // Comparer les données pour détecter les conflits
   for (const localResult of localResults) {
    const remoteMatch = remoteResults.find(r => 
     r.draw_name === localResult.draw_name && r.date === localResult.date
    )

    if (remoteMatch) {
     // Vérifier si les numéros gagnants diffèrent
     const localNumbers = JSON.stringify(localResult.gagnants.sort())
     const remoteNumbers = JSON.stringify(remoteMatch.winning_numbers.sort())

     if (localNumbers !== remoteNumbers) {
      const conflict: SyncConflict = {
       id: `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
       type: 'data_mismatch',
       localData: localResult,
       remoteData: remoteMatch,
       detectedAt: new Date(),
       resolved: false
      }

      conflicts.push(conflict)
      this.conflicts.push(conflict)
     }
    }
   }

   this.status.conflictsDetected = this.conflicts.filter(c => !c.resolved).length
   
  } catch (error) {
   console.error('❌ Erreur détection conflits:', error)
  }

  return conflicts
 }

 // Résoudre automatiquement les conflits
 private async resolveConflict(conflict: SyncConflict): Promise<void> {
  if (conflict.resolved) return

  try {
   switch (this.config.conflictResolution) {
    case 'prefer_remote':
     await this.applyRemoteData(conflict)
     break
    case 'prefer_local':
     await this.applyLocalData(conflict)
     break
    case 'manual':
     // Marquer pour résolution manuelle
     console.log('🔧 Conflit marqué pour résolution manuelle:', conflict.id)
     return
   }

   conflict.resolved = true
   conflict.resolution = this.config.conflictResolution
   conflict.resolvedAt = new Date()
   this.status.resolvedConflicts++

   console.log(`✅ Conflit résolu automatiquement: ${conflict.id}`)

  } catch (error) {
   console.error('❌ Erreur résolution conflit:', error)
  }
 }

 // Appliquer données distantes
 private async applyRemoteData(conflict: SyncConflict): Promise<void> {
  const remoteResult = conflict.remoteData as LotteryResult
  
  const localFormat: DrawResult = {
   draw_name: remoteResult.draw_name,
   date: remoteResult.date,
   gagnants: remoteResult.winning_numbers,
   machine: remoteResult.machine_numbers || undefined
  }

  const results = this.getLocalResults()
  const index = results.findIndex(r => 
   r.draw_name === localFormat.draw_name && r.date === localFormat.date
  )

  if (index >= 0) {
   results[index] = localFormat
  } else {
   results.unshift(localFormat)
  }

  this.saveLocalResults(results)
 }

 // Appliquer données locales
 private async applyLocalData(conflict: SyncConflict): Promise<void> {
  const localResult = conflict.localData as DrawResult
  
  const supabaseFormat = {
   draw_name: localResult.draw_name,
   date: localResult.date,
   winning_numbers: localResult.gagnants,
   machine_numbers: localResult.machine || null
  }

  // Mettre à jour dans Supabase
  const remoteResult = conflict.remoteData as LotteryResult
  if (remoteResult.id) {
   await LotteryResultsService.updateResult(remoteResult.id, supabaseFormat)
  }
 }

 // Démarrer le résolveur de conflits
 private startConflictResolver(): void {
  setInterval(async () => {
   if (this.isRunning) {
    const unresolvedConflicts = this.conflicts.filter(c => !c.resolved)
    
    for (const conflict of unresolvedConflicts) {
     await this.resolveConflict(conflict)
    }

    // Nettoyer les anciens conflits résolus (garder 100 derniers)
    if (this.conflicts.length > 100) {
     this.conflicts = this.conflicts
      .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())
      .slice(0, 100)
    }
   }
  }, 60000) // Toutes les minutes
 }

 // Calculer cohérence des données
 private async calculateDataConsistency(): Promise<number> {
  try {
   const localResults = this.getLocalResults()
   const remoteResults = await LotteryResultsService.getAllResults()

   if (localResults.length === 0 && remoteResults.length === 0) {
    return 100 // Cohérence parfaite si pas de données
   }

   if (localResults.length === 0 || remoteResults.length === 0) {
    return 0 // Incohérence complète si une source est vide
   }

   let matchingRecords = 0
   const totalRecords = Math.max(localResults.length, remoteResults.length)

   for (const localResult of localResults) {
    const remoteMatch = remoteResults.find(r => 
     r.draw_name === localResult.draw_name && 
     r.date === localResult.date &&
     JSON.stringify(r.winning_numbers.sort()) === JSON.stringify(localResult.gagnants.sort())
    )

    if (remoteMatch) {
     matchingRecords++
    }
   }

   return Math.round((matchingRecords / totalRecords) * 100)

  } catch (error) {
   console.error('❌ Erreur calcul cohérence:', error)
   return 0
  }
 }

 // Méthodes utilitaires
 private getLocalResults(): DrawResult[] {
  try {
   const cached = localStorage.getItem('lottery_results_cache')
   if (cached) {
    const {data} = JSON.parse(cached)
    return Array.isArray(data) ? data : []
   }
  } catch (error) {
   console.error('Erreur lecture cache local:', error)
  }
  return []
 }

 private saveLocalResults(results: DrawResult[]): void {
  try {
   const cacheData = {
    data: results,
    timestamp: Date.now(),
    version: '3.2'
   }
   localStorage.setItem('lottery_results_cache', JSON.stringify(cacheData))
  } catch (error) {
   console.error('Erreur sauvegarde cache local:', error)
  }
 }

 private mapKeyToTable(key: string): SyncOperation['table'] {
  if (key.includes('lottery_results')) return 'lottery_results'
  if (key.includes('predictions')) return 'predictions'
  if (key.includes('preferences')) return 'user_preferences'
  return 'audit_logs'
 }

 private parseLocalData(value: string): any {
  try {
   return JSON.parse(value)
  } catch {
   return value
  }
 }

 private async analyzeDataState(): Promise<any> {
  // Analyser l'état actuel des données
  return {
   localCount: this.getLocalResults().length,
   remoteCount: 0, // À implémenter
   lastLocalUpdate: new Date(),
   lastRemoteUpdate: new Date()
  }
 }

 private async syncFromExternalAPI(): Promise<void> {
  console.log('🌐 Synchronisation depuis API externe...')
  await IntegratedLotteryService.forceSyncWithExternalAPI()
 }

 private async syncLocalWithSupabase(): Promise<void> {
  console.log('🔄 Synchronisation local ↔ Supabase...')
  
  // Détecter et résoudre les conflits
  await this.detectConflicts()
  
  const unresolvedConflicts = this.conflicts.filter(c => !c.resolved)
  for (const conflict of unresolvedConflicts) {
   await this.resolveConflict(conflict)
  }
 }

 private async detectLocalChanges(): Promise<boolean> {
  // Détecter s'il y a eu des changements locaux depuis la dernière sync
  return this.operations.some(op => 
   op.direction === 'local-to-remote' && 
   op.status === 'pending' &&
   op.createdAt > (this.status.lastSync || new Date(0))
  )
 }

 private async detectRemoteChanges(): Promise<boolean> {
  // Détecter s'il y a eu des changements distants
  try {
   const remoteResults = await LotteryResultsService.getAllResults()
   const lastSyncTime = this.status.lastSync || new Date(0)
   
   return remoteResults.some(result => 
    new Date(result.updated_at || result.created_at || 0) > lastSyncTime
   )
  } catch {
   return false
  }
 }

 private async syncChanges(hasLocalChanges: boolean, hasRemoteChanges: boolean): Promise<void> {
  if (hasLocalChanges) {
   console.log('📤 Synchronisation changements locaux...')
   await this.processPendingOperations()
  }

  if (hasRemoteChanges) {
   console.log('📥 Synchronisation changements distants...')
   // Récupérer et appliquer les changements distants
   const remoteResults = await LotteryResultsService.getAllResults()
   // Logique de synchronisation descendante
  }
 }

 private async processPendingOperations(): Promise<void> {
  const pendingOps = this.operations.filter(op => op.status === 'pending')
  
  for (const operation of pendingOps) {
   await this.processOperation(operation)
  }
 }

 // API publique
 getStatus(): SyncStatus {
  // Mettre à jour la qualité de connexion
  this.status.connectionQuality = navigator.onLine ? 
   (this.status.errorCount < 3 ? 'excellent' : 
    this.status.errorCount < 10 ? 'good' : 'poor') : 'offline'

  return {...this.status}
 }

 getConflicts(): SyncConflict[] {
  return [...this.conflicts]
 }

 getOperations(): SyncOperation[] {
  return [...this.operations]
 }

 // Résoudre un conflit manuellement
 async resolveConflictManually(conflictId: string, resolution: 'prefer_local' | 'prefer_remote' | 'merge'): Promise<void> {
  const conflict = this.conflicts.find(c => c.id === conflictId)
  if (!conflict) throw new Error('Conflit non trouvé')

  const originalResolution = this.config.conflictResolution
  this.config.conflictResolution = resolution
  
  await this.resolveConflict(conflict)
  
  this.config.conflictResolution = originalResolution
 }

 // Forcer une synchronisation complète
 async forceBidirectionalSync(): Promise<void> {
  if (!this.isRunning) {
   throw new Error('Service de synchronisation non démarré')
  }

  console.log('🔄 Synchronisation forcée...')
  await this.performFullSync()
 }

 // Configurer les paramètres de synchronisation
 updateConfig(newConfig: Partial<typeof BidirectionalSyncService.prototype.config>): void {
  this.config = {...this.config, ...newConfig}
  console.log('⚙️ Configuration synchronisation mise à jour:', newConfig)
 }

 // S'abonner aux changements de statut
 subscribe(listener: (status: SyncStatus) => void): () => void {
  this.listeners.push(listener)
  return () => {
   const index = this.listeners.indexOf(listener)
   if (index >= 0) {
    this.listeners.splice(index, 1)
   }
  }
 }

 private notifyListeners(): void {
  this.listeners.forEach(listener => {
   try {
    listener(this.getStatus())
   } catch (error) {
    console.error('Erreur notification listener:', error)
   }
  })
 }

 // Méthodes de diagnostic
 async getDiagnostics(): Promise<{
  syncHealth: 'healthy' | 'warning' | 'critical'
  recommendations: string[]
  metrics: Record<string, number>
 }> {
  const status = this.getStatus()
  const unresolvedConflicts = this.conflicts.filter(c => !c.resolved).length
  const failedOperations = this.operations.filter(op => op.status === 'failed').length

  let syncHealth: 'healthy' | 'warning' | 'critical' = 'healthy'
  const recommendations: string[] = []

  if (status.dataConsistency < 80) {
   syncHealth = 'critical'
   recommendations.push('Cohérence des données faible - synchronisation complète recommandée')
  } else if (status.dataConsistency < 95) {
   syncHealth = 'warning'
   recommendations.push('Cohérence des données modérée - vérifier les conflits')
  }

  if (unresolvedConflicts > 5) {
   syncHealth = 'critical'
   recommendations.push(`${unresolvedConflicts} conflits non résolus - intervention manuelle requise`)
  }

  if (failedOperations > 10) {
   syncHealth = 'warning'
   recommendations.push(`${failedOperations} opérations échouées - vérifier la connectivité`)
  }

  return {
   syncHealth,
   recommendations,
   metrics: {
    dataConsistency: status.dataConsistency,
    unresolvedConflicts,
    failedOperations,
    successRate: (this.operations.filter(op => op.status === 'completed').length / Math.max(1, this.operations.length)) * 100
   }
  }
 }
}

export default BidirectionalSyncService
