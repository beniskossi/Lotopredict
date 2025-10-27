// Service de persistance renforcée avec auto-save et synchronisation
import {LotteryResultsService, AuditService, AuthService} from '@/services/supabaseClient'
import type {DrawResult} from '@/services/lotteryApi'

export interface PersistenceConfig {
 autoSaveInterval: number
 maxRetries: number
 cacheExpiration: number
 enableBackup: boolean
}

export interface DataSnapshot {
 id: string
 timestamp: Date
 data: any
 type: 'admin' | 'preferences' | 'draw_result' | 'prediction'
 userId?: string
 checksum: string
}

class EnhancedPersistenceService {
 private static config: PersistenceConfig = {
  autoSaveInterval: 30000, // 30 secondes
  maxRetries: 3,
  cacheExpiration: 24 * 60 * 60 * 1000, // 24 heures
  enableBackup: true
 }

 private static autoSaveTimers = new Map<string, NodeJS.Timeout>()
 private static pendingWrites = new Map<string, any>()
 private static isOnline = navigator.onLine

 // Initialiser la persistance renforcée
 static async initialize(): Promise<void> {
  console.log('🔧 Initialisation de la persistance renforcée...')

  // Écouter les changements de connectivité
  window.addEventListener('online', () => {
   EnhancedPersistenceService.isOnline = true
   EnhancedPersistenceService.syncPendingWrites()
  })

  window.addEventListener('offline', () => {
   EnhancedPersistenceService.isOnline = false
  })

  // Écouter les événements de fermeture de page
  window.addEventListener('beforeunload', () => {
   EnhancedPersistenceService.flushAllPendingWrites()
  })

  // Récupérer les données en cas de crash
  await EnhancedPersistenceService.recoverFromCrash()

  console.log('✅ Persistance renforcée initialisée')
 }

 // Auto-save des données avec debouncing
 static scheduleAutoSave(key: string, data: any, type: DataSnapshot['type']): void {
  // Annuler le timer précédent
  if (EnhancedPersistenceService.autoSaveTimers.has(key)) {
   clearTimeout(EnhancedPersistenceService.autoSaveTimers.get(key)!)
  }

  // Programmer la sauvegarde
  const timer = setTimeout(async () => {
   await EnhancedPersistenceService.persistData(key, data, type)
   EnhancedPersistenceService.autoSaveTimers.delete(key)
  }, EnhancedPersistenceService.config.autoSaveInterval)

  EnhancedPersistenceService.autoSaveTimers.set(key, timer)
  console.log(`⏰ Auto-save programmé pour ${key} dans ${EnhancedPersistenceService.config.autoSaveInterval}ms`)
 }

 // Persister les données avec retry et backup
 static async persistData(key: string, data: any, type: DataSnapshot['type']): Promise<boolean> {
  const user = await AuthService.getCurrentUser()
  const snapshot: DataSnapshot = {
   id: key,
   timestamp: new Date(),
   data,
   type,
   userId: user?.id,
   checksum: EnhancedPersistenceService.calculateChecksum(data)
  }

  try {
   console.log(`💾 Persistance des données ${key} (${type})...`)

   // 1. Sauvegarder localement immédiatement
   await EnhancedPersistenceService.saveToLocalStorage(key, snapshot)

   // 2. Sauvegarder sur Supabase si en ligne
   if (EnhancedPersistenceService.isOnline) {
    await EnhancedPersistenceService.saveToSupabase(snapshot)
   } else {
    // Marquer comme en attente si hors ligne
    EnhancedPersistenceService.pendingWrites.set(key, snapshot)
   }

   // 3. Créer un backup si activé
   if (EnhancedPersistenceService.config.enableBackup) {
    await EnhancedPersistenceService.createBackup(snapshot)
   }

   console.log(`✅ Données ${key} persistées avec succès`)
   return true

  } catch (error) {
   console.error(`❌ Erreur persistance ${key}:`, error)
   
   // Ajouter aux écritures en attente pour retry
   EnhancedPersistenceService.pendingWrites.set(key, snapshot)
   return false
  }
 }

 // Sauvegarder en localStorage avec vérification d'intégrité
 private static async saveToLocalStorage(key: string, snapshot: DataSnapshot): Promise<void> {
  try {
   const serialized = JSON.stringify(snapshot)
   localStorage.setItem(`enhanced_${key}`, serialized)
   
   // Vérifier l'intégrité immédiatement
   const verified = localStorage.getItem(`enhanced_${key}`)
   if (!verified || JSON.parse(verified).checksum !== snapshot.checksum) {
    throw new Error('Erreur d\'intégrité localStorage')
   }

  } catch (error) {
   console.error(`❌ Erreur localStorage ${key}:`, error)
   throw error
  }
 }

 // Sauvegarder sur Supabase selon le type
 private static async saveToSupabase(snapshot: DataSnapshot): Promise<void> {
  switch (snapshot.type) {
   case 'draw_result':
    await EnhancedPersistenceService.saveDrawResultToSupabase(snapshot)
    break
   case 'preferences':
    await EnhancedPersistenceService.savePreferencesToSupabase(snapshot)
    break
   case 'admin':
    await EnhancedPersistenceService.saveAdminDataToSupabase(snapshot)
    break
   case 'prediction':
    await EnhancedPersistenceService.savePredictionToSupabase(snapshot)
    break
  }
 }

 // Sauvegarder un résultat de tirage
 private static async saveDrawResultToSupabase(snapshot: DataSnapshot): Promise<void> {
  const drawResult = snapshot.data as DrawResult
  
  const supabaseFormat = {
   draw_name: drawResult.draw_name,
   date: drawResult.date,
   winning_numbers: drawResult.gagnants,
   machine_numbers: drawResult.machine || null,
   user_id: snapshot.userId,
   created_manually: true
  }

  await LotteryResultsService.addResult(supabaseFormat)
  
  // Log dans l'audit
  if (snapshot.userId) {
   await AuditService.addLog({
    user_id: snapshot.userId,
    action: 'MANUAL_DRAW_SAVE',
    table_name: 'lottery_results',
    new_data: supabaseFormat
   })
  }
 }

 // Sauvegarder les préférences utilisateur
 private static async savePreferencesToSupabase(snapshot: DataSnapshot): Promise<void> {
  // Implémenter sauvegarde préférences
  console.log('💾 Sauvegarde préférences Supabase:', snapshot.data)
 }

 // Sauvegarder les données admin
 private static async saveAdminDataToSupabase(snapshot: DataSnapshot): Promise<void> {
  // Les données admin restent locales par sécurité, mais on log l'activité
  if (snapshot.userId) {
   await AuditService.addLog({
    user_id: snapshot.userId,
    action: 'ADMIN_DATA_UPDATE',
    table_name: 'local_admin',
    new_data: {
     data_type: 'admin_preferences',
     timestamp: snapshot.timestamp,
     checksum: snapshot.checksum
    }
   })
  }
 }

 // Sauvegarder une prédiction
 private static async savePredictionToSupabase(snapshot: DataSnapshot): Promise<void> {
  // Implémenter sauvegarde prédictions
  console.log('💾 Sauvegarde prédiction Supabase:', snapshot.data)
 }

 // Créer un backup local
 private static async createBackup(snapshot: DataSnapshot): Promise<void> {
  try {
   const backupKey = `backup_${snapshot.id}_${Date.now()}`
   localStorage.setItem(backupKey, JSON.stringify(snapshot))
   
   // Nettoyer les anciens backups (garder les 10 derniers)
   EnhancedPersistenceService.cleanOldBackups(snapshot.id)
   
  } catch (error) {
   console.warn('⚠️ Impossible de créer backup:', error)
  }
 }

 // Nettoyer les anciens backups
 private static cleanOldBackups(dataId: string): void {
  const backupKeys = Object.keys(localStorage)
   .filter(key => key.startsWith(`backup_${dataId}_`))
   .sort()

  if (backupKeys.length > 10) {
   const toDelete = backupKeys.slice(0, backupKeys.length - 10)
   toDelete.forEach(key => localStorage.removeItem(key))
  }
 }

 // Synchroniser les écritures en attente
 static async syncPendingWrites(): Promise<void> {
  if (!EnhancedPersistenceService.isOnline || EnhancedPersistenceService.pendingWrites.size === 0) {
   return
  }

  console.log(`🔄 Synchronisation de ${EnhancedPersistenceService.pendingWrites.size} écritures en attente...`)

  for (const [key, snapshot] of EnhancedPersistenceService.pendingWrites) {
   try {
    await EnhancedPersistenceService.saveToSupabase(snapshot)
    EnhancedPersistenceService.pendingWrites.delete(key)
    console.log(`✅ Synchronisation ${key} réussie`)
   } catch (error) {
    console.error(`❌ Échec synchronisation ${key}:`, error)
   }
  }
 }

 // Vider toutes les écritures en attente (au cas où)
 static async flushAllPendingWrites(): Promise<void> {
  for (const [key, data] of EnhancedPersistenceService.autoSaveTimers) {
   clearTimeout(data)
   // Sauvegarder immédiatement en localStorage
   try {
    const pendingData = EnhancedPersistenceService.pendingWrites.get(key)
    if (pendingData) {
     await EnhancedPersistenceService.saveToLocalStorage(key, pendingData)
    }
   } catch (error) {
    console.error(`❌ Échec flush ${key}:`, error)
   }
  }
  EnhancedPersistenceService.autoSaveTimers.clear()
 }

 // Récupérer après un crash
 static async recoverFromCrash(): Promise<void> {
  try {
   console.log('🔄 Vérification récupération après crash...')

   // Chercher les données non synchronisées
   const enhancedKeys = Object.keys(localStorage)
    .filter(key => key.startsWith('enhanced_'))

   for (const key of enhancedKeys) {
    try {
     const data = localStorage.getItem(key)
     if (data) {
      const snapshot: DataSnapshot = JSON.parse(data)
      
      // Vérifier si la donnée est récente (moins de 1 heure)
      const age = Date.now() - new Date(snapshot.timestamp).getTime()
      if (age < 60 * 60 * 1000) { // 1 heure
       console.log(`🔄 Récupération donnée récente: ${key}`)
       EnhancedPersistenceService.pendingWrites.set(snapshot.id, snapshot)
      }
     }
    } catch (error) {
     console.warn(`⚠️ Donnée corrompue ignorée: ${key}`)
     localStorage.removeItem(key)
    }
   }

   // Synchroniser si en ligne
   if (EnhancedPersistenceService.isOnline) {
    await EnhancedPersistenceService.syncPendingWrites()
   }

  } catch (error) {
   console.error('❌ Erreur récupération crash:', error)
  }
 }

 // Calculer checksum pour vérification d'intégrité
 private static calculateChecksum(data: any): string {
  const str = JSON.stringify(data)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
   const char = str.charCodeAt(i)
   hash = ((hash << 5) - hash) + char
   hash = hash & hash // Convertir en 32bit integer
  }
  return hash.toString(16)
 }

 // Récupérer données avec validation
 static async retrieveData(key: string): Promise<DataSnapshot | null> {
  try {
   const data = localStorage.getItem(`enhanced_${key}`)
   if (!data) return null

   const snapshot: DataSnapshot = JSON.parse(data)
   
   // Vérifier l'intégrité
   const calculatedChecksum = EnhancedPersistenceService.calculateChecksum(snapshot.data)
   if (calculatedChecksum !== snapshot.checksum) {
    console.warn(`⚠️ Données corrompues détectées pour ${key}`)
    return null
   }

   // Vérifier expiration
   const age = Date.now() - new Date(snapshot.timestamp).getTime()
   if (age > EnhancedPersistenceService.config.cacheExpiration) {
    console.log(`⏰ Données expirées pour ${key}`)
    localStorage.removeItem(`enhanced_${key}`)
    return null
   }

   return snapshot

  } catch (error) {
   console.error(`❌ Erreur récupération ${key}:`, error)
   return null
  }
 }

 // Obtenir statistiques de persistance
 static getPersistenceStats(): {localStorage: number, pendingWrites: number, backups: number} {
  const localStorageKeys = Object.keys(localStorage).filter(key => key.startsWith('enhanced_')).length
  const backupKeys = Object.keys(localStorage).filter(key => key.startsWith('backup_')).length
  
  return {
   localStorage: localStorageKeys,
   pendingWrites: EnhancedPersistenceService.pendingWrites.size,
   backups: backupKeys
  }
 }
}

export default EnhancedPersistenceService
