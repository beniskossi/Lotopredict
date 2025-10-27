// Service de synchronisation en arrière-plan avec optimisations
import {LotteryResultsService, AuditService, AuthService} from '@/services/supabaseClient'
import type {DrawResult} from '@/services/lotteryApi'

export interface BackgroundSyncConfig {
 enabled: boolean
 interval: number // en millisecondes
 maxRetries: number
 retryDelay: number
 compressionEnabled: boolean
 batchSize: number
 priority: 'low' | 'normal' | 'high'
}

export interface SyncQueueItem {
 id: string
 type: 'CREATE' | 'UPDATE' | 'DELETE' | 'BULK_INSERT'
 data: any
 timestamp: Date
 retries: number
 priority: number
 compressed: boolean
}

export interface CompressionStats {
 originalSize: number
 compressedSize: number
 compressionRatio: number
 compressionTime: number
}

export class BackgroundSyncService {
 private static instance: BackgroundSyncService
 private syncQueue: SyncQueueItem[] = []
 private isRunning = false
 private worker: Worker | null = null
 private config: BackgroundSyncConfig = {
  enabled: true,
  interval: 30000, // 30 secondes
  maxRetries: 3,
  retryDelay: 5000, // 5 secondes
  compressionEnabled: true,
  batchSize: 10,
  priority: 'normal'
 }

 private constructor() {
  this.initializeWorker()
  this.loadQueueFromStorage()
  this.startBackgroundSync()
 }

 static getInstance(): BackgroundSyncService {
  if (!BackgroundSyncService.instance) {
   BackgroundSyncService.instance = new BackgroundSyncService()
  }
  return BackgroundSyncService.instance
 }

 // Initialiser le Web Worker pour les tâches en arrière-plan
 private initializeWorker(): void {
  try {
   const workerCode = `
    // Web Worker pour compression et traitement en arrière-plan
    const LZString = {
     compress: function(input) {
      if (input === null || input === undefined) return ''
      let output = ''
      const dictionary = {}
      let w = ''
      let result = []
      let dictSize = 256
      let numBits = 8
      
      for (let i = 0; i < input.length; i++) {
       const c = input.charAt(i)
       const wc = w + c
       
       if (dictionary.hasOwnProperty(wc)) {
        w = wc
       } else {
        if (dictionary.hasOwnProperty(w)) {
         result.push(dictionary[w])
        } else {
         result.push(w.charCodeAt(0))
        }
        dictionary[wc] = dictSize++
        w = c
       }
      }
      
      if (w) {
       if (dictionary.hasOwnProperty(w)) {
        result.push(dictionary[w])
       } else {
        result.push(w.charCodeAt(0))
       }
      }
      
      return JSON.stringify(result)
     },
     
     decompress: function(compressed) {
      if (!compressed) return ''
      try {
       const codes = JSON.parse(compressed)
       if (!Array.isArray(codes)) return compressed
       
       const dictionary = {}
       let w = String.fromCharCode(codes[0])
       let result = w
       let dictSize = 256
       
       for (let i = 1; i < codes.length; i++) {
        const k = codes[i]
        let entry
        
        if (dictionary.hasOwnProperty(k)) {
         entry = dictionary[k]
        } else if (k === dictSize) {
         entry = w + w.charAt(0)
        } else {
         return ''
        }
        
        result += entry
        dictionary[dictSize++] = w + entry.charAt(0)
        w = entry
       }
       
       return result
      } catch (e) {
       return compressed
      }
     }
    }
    
    self.onmessage = function(e) {
     const { action, data, id } = e.data
     
     try {
      switch (action) {
       case 'compress':
        const startTime = performance.now()
        const originalSize = JSON.stringify(data).length
        const compressed = LZString.compress(JSON.stringify(data))
        const compressedSize = compressed.length
        const compressionTime = performance.now() - startTime
        
        self.postMessage({
         id,
         success: true,
         result: {
          compressed,
          stats: {
           originalSize,
           compressedSize,
           compressionRatio: (1 - compressedSize / originalSize) * 100,
           compressionTime
          }
         }
        })
        break
        
       case 'decompress':
        const decompressed = LZString.decompress(data)
        self.postMessage({
         id,
         success: true,
         result: JSON.parse(decompressed)
        })
        break
        
       case 'batch_process':
        const processed = data.map(item => ({
         ...item,
         processed: true,
         processedAt: new Date().toISOString()
        }))
        
        self.postMessage({
         id,
         success: true,
         result: processed
        })
        break
        
       default:
        self.postMessage({
         id,
         success: false,
         error: 'Unknown action'
        })
      }
     } catch (error) {
      self.postMessage({
       id,
       success: false,
       error: error.message
      })
     }
    }
   `

   const blob = new Blob([workerCode], {type: 'application/javascript'})
   this.worker = new Worker(URL.createObjectURL(blob))

   this.worker.onmessage = e => {
    this.handleWorkerMessage(e.data)
   }

   console.log('✅ Web Worker pour synchronisation initialisé')
  } catch (error) {
   console.warn('⚠️ Web Worker non disponible, utilisation du mode principal:', error)
  }
 }

 // Gestion des messages du Web Worker
 private handleWorkerMessage(data: any): void {
  const {id, success, result, error} = data

  if (success) {
   console.log(`✅ Tâche ${id} complétée:`, result)
  } else {
   console.error(`❌ Erreur tâche ${id}:`, error)
  }
 }

 // Charger la queue depuis le stockage local
 private loadQueueFromStorage(): void {
  try {
   const stored = localStorage.getItem('background_sync_queue')
   if (stored) {
    this.syncQueue = JSON.parse(stored).map((item: any) => ({
     ...item,
     timestamp: new Date(item.timestamp)
    }))
    console.log(`📦 ${this.syncQueue.length} éléments chargés dans la queue`)
   }
  } catch (error) {
   console.warn('⚠️ Erreur chargement queue:', error)
   this.syncQueue = []
  }
 }

 // Sauvegarder la queue dans le stockage local
 private saveQueueToStorage(): void {
  try {
   localStorage.setItem('background_sync_queue', JSON.stringify(this.syncQueue))
  } catch (error) {
   console.warn('⚠️ Erreur sauvegarde queue:', error)
  }
 }

 // Ajouter un élément à la queue de synchronisation
 addToQueue(type: SyncQueueItem['type'], data: any, priority: 'low' | 'normal' | 'high' = 'normal'): string {
  const id = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  const priorityValue = priority === 'high' ? 3 : priority === 'normal' ? 2 : 1

  const queueItem: SyncQueueItem = {
   id,
   type,
   data,
   timestamp: new Date(),
   retries: 0,
   priority: priorityValue,
   compressed: false
  }

  // Insérer selon la priorité
  const insertIndex = this.syncQueue.findIndex(item => item.priority < priorityValue)
  if (insertIndex === -1) {
   this.syncQueue.push(queueItem)
  } else {
   this.syncQueue.splice(insertIndex, 0, queueItem)
  }

  this.saveQueueToStorage()
  console.log(`📋 Ajouté à la queue: ${type} (priorité: ${priority})`)

  return id
 }

 // Démarrer la synchronisation en arrière-plan
 startBackgroundSync(): void {
  if (this.isRunning) return

  this.isRunning = true
  console.log('🔄 Synchronisation en arrière-plan démarrée')

  const syncLoop = async () => {
   if (!this.config.enabled || !navigator.onLine) {
    setTimeout(syncLoop, this.config.interval)
    return
   }

   try {
    await this.processSyncQueue()
   } catch (error) {
    console.error('❌ Erreur synchronisation:', error)
   }

   setTimeout(syncLoop, this.config.interval)
  }

  syncLoop()
 }

 // Arrêter la synchronisation
 stopBackgroundSync(): void {
  this.isRunning = false
  console.log('⏹️ Synchronisation en arrière-plan arrêtée')
 }

 // Traiter la queue de synchronisation
 private async processSyncQueue(): Promise<void> {
  if (this.syncQueue.length === 0) return

  console.log(`🔄 Traitement de ${this.syncQueue.length} éléments de la queue`)

  // Prendre un batch d'éléments à traiter
  const batch = this.syncQueue.splice(0, this.config.batchSize)
  const processedItems: string[] = []

  for (const item of batch) {
   try {
    const success = await this.processSyncItem(item)
    
    if (success) {
     processedItems.push(item.id)
     console.log(`✅ Synchronisé: ${item.type} ${item.id}`)
    } else {
     // Remettre en queue avec retry
     item.retries++
     if (item.retries < this.config.maxRetries) {
      item.priority = Math.max(1, item.priority - 1) // Réduire la priorité
      this.syncQueue.push(item)
      console.log(`🔄 Retry ${item.retries}/${this.config.maxRetries}: ${item.id}`)
     } else {
      console.error(`❌ Abandon après ${this.config.maxRetries} tentatives: ${item.id}`)
      await this.handleFailedSync(item)
     }
    }
   } catch (error) {
    console.error(`❌ Erreur traitement ${item.id}:`, error)
    item.retries++
    if (item.retries < this.config.maxRetries) {
     this.syncQueue.push(item)
    }
   }
  }

  // Sauvegarder la queue mise à jour
  this.saveQueueToStorage()

  // Logger l'audit
  if (processedItems.length > 0) {
   try {
    const user = await AuthService.getCurrentUser()
    if (user) {
     await AuditService.addLog({
      user_id: user.id,
      action: 'BACKGROUND_SYNC',
      table_name: 'sync_queue',
      new_data: {
       processed_items: processedItems.length,
       queue_size: this.syncQueue.length
      }
     })
    }
   } catch (error) {
    console.warn('⚠️ Erreur audit log:', error)
   }
  }
 }

 // Traiter un élément de synchronisation
 private async processSyncItem(item: SyncQueueItem): Promise<boolean> {
  try {
   let data = item.data

   // Décompresser si nécessaire
   if (item.compressed) {
    data = await this.decompressData(data)
   }

   switch (item.type) {
    case 'CREATE':
     await this.syncCreate(data)
     break
    case 'UPDATE':
     await this.syncUpdate(data)
     break
    case 'DELETE':
     await this.syncDelete(data)
     break
    case 'BULK_INSERT':
     await this.syncBulkInsert(data)
     break
    default:
     console.warn(`⚠️ Type de sync non reconnu: ${item.type}`)
     return false
   }

   return true
  } catch (error) {
   console.error(`❌ Erreur sync ${item.type}:`, error)
   return false
  }
 }

 // Synchronisation CREATE
 private async syncCreate(data: any): Promise<void> {
  if (data.draw_name && data.gagnants) {
   const supabaseFormat = {
    draw_name: data.draw_name,
    date: data.date,
    winning_numbers: data.gagnants,
    machine_numbers: data.machine || null
   }
   await LotteryResultsService.addResult(supabaseFormat)
  }
 }

 // Synchronisation UPDATE
 private async syncUpdate(data: any): Promise<void> {
  if (data.id && data.updates) {
   await LotteryResultsService.updateResult(data.id, data.updates)
  }
 }

 // Synchronisation DELETE
 private async syncDelete(data: any): Promise<void> {
  if (data.id) {
   await LotteryResultsService.deleteResult(data.id)
  }
 }

 // Synchronisation BULK INSERT
 private async syncBulkInsert(data: any[]): Promise<void> {
  if (Array.isArray(data)) {
   const supabaseData = data.map(item => ({
    draw_name: item.draw_name,
    date: item.date,
    winning_numbers: item.gagnants,
    machine_numbers: item.machine || null
   }))
   
   await LotteryResultsService.syncWithExternalAPI(supabaseData)
  }
 }

 // Compression des données
 async compressData(data: any): Promise<{compressed: string; stats: CompressionStats}> {
  if (!this.config.compressionEnabled) {
   return {
    compressed: JSON.stringify(data),
    stats: {
     originalSize: JSON.stringify(data).length,
     compressedSize: JSON.stringify(data).length,
     compressionRatio: 0,
     compressionTime: 0
    }
   }
  }

  return new Promise((resolve, reject) => {
   if (this.worker) {
    const id = `compress_${Date.now()}`
    
    const timeout = setTimeout(() => {
     reject(new Error('Compression timeout'))
    }, 10000)

    const handler = (e: MessageEvent) => {
     if (e.data.id === id) {
      clearTimeout(timeout)
      this.worker!.removeEventListener('message', handler)
      
      if (e.data.success) {
       resolve(e.data.result)
      } else {
       reject(new Error(e.data.error))
      }
     }
    }

    this.worker.addEventListener('message', handler)
    this.worker.postMessage({action: 'compress', data, id})
   } else {
    // Fallback sans Web Worker
    const originalSize = JSON.stringify(data).length
    const compressed = JSON.stringify(data)
    resolve({
     compressed,
     stats: {
      originalSize,
      compressedSize: compressed.length,
      compressionRatio: 0,
      compressionTime: 0
     }
    })
   }
  })
 }

 // Décompression des données
 async decompressData(compressed: string): Promise<any> {
  if (!this.config.compressionEnabled) {
   return JSON.parse(compressed)
  }

  return new Promise((resolve, reject) => {
   if (this.worker) {
    const id = `decompress_${Date.now()}`
    
    const timeout = setTimeout(() => {
     reject(new Error('Decompression timeout'))
    }, 5000)

    const handler = (e: MessageEvent) => {
     if (e.data.id === id) {
      clearTimeout(timeout)
      this.worker!.removeEventListener('message', handler)
      
      if (e.data.success) {
       resolve(e.data.result)
      } else {
       reject(new Error(e.data.error))
      }
     }
    }

    this.worker.addEventListener('message', handler)
    this.worker.postMessage({action: 'decompress', data: compressed, id})
   } else {
    // Fallback sans Web Worker
    try {
     resolve(JSON.parse(compressed))
    } catch (error) {
     reject(error)
    }
   }
  })
 }

 // Gérer les échecs de synchronisation
 private async handleFailedSync(item: SyncQueueItem): Promise<void> {
  try {
   // Sauvegarder les éléments échoués pour analyse
   const failedItems = JSON.parse(localStorage.getItem('failed_sync_items') || '[]')
   failedItems.push({
    ...item,
    failedAt: new Date().toISOString()
   })
   
   // Garder seulement les 100 derniers échecs
   localStorage.setItem('failed_sync_items', JSON.stringify(failedItems.slice(-100)))
  } catch (error) {
   console.warn('⚠️ Erreur sauvegarde échec sync:', error)
  }
 }

 // Configuration du service
 updateConfig(newConfig: Partial<BackgroundSyncConfig>): void {
  this.config = {...this.config, ...newConfig}
  
  // Sauvegarder la configuration
  localStorage.setItem('background_sync_config', JSON.stringify(this.config))
  
  console.log('⚙️ Configuration mise à jour:', this.config)
 }

 // Obtenir les statistiques
 getStats(): {
  queueSize: number
  totalProcessed: number
  failedItems: number
  compressionEnabled: boolean
  isRunning: boolean
  config: BackgroundSyncConfig
 } {
  const failedItems = JSON.parse(localStorage.getItem('failed_sync_items') || '[]')
  
  return {
   queueSize: this.syncQueue.length,
   totalProcessed: 0, // À implémenter avec un compteur persistant
   failedItems: failedItems.length,
   compressionEnabled: this.config.compressionEnabled,
   isRunning: this.isRunning,
   config: this.config
  }
 }

 // Nettoyer les données
 cleanup(): void {
  this.syncQueue = []
  this.saveQueueToStorage()
  localStorage.removeItem('failed_sync_items')
  console.log('🧹 Queue de synchronisation nettoyée')
 }

 // Forcer la synchronisation immédiate
 async forceSyncNow(): Promise<void> {
  if (this.syncQueue.length === 0) {
   console.log('📭 Aucun élément à synchroniser')
   return
  }

  console.log('⚡ Synchronisation forcée...')
  await this.processSyncQueue()
 }

 // Obtenir l'état de la queue
 getQueueState(): SyncQueueItem[] {
  return [...this.syncQueue] // Copie pour éviter les mutations
 }
}

// Export du singleton
export const backgroundSyncService = BackgroundSyncService.getInstance()
