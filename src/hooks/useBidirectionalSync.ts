// Hook personnalisé pour la synchronisation bidirectionnelle
import {useState, useEffect, useCallback} from 'react'
import BidirectionalSyncService from '@/services/bidirectionalSyncService'
import {useToast} from '@/hooks/use-toast'
import type {SyncStatus, SyncConflict, SyncOperation} from '@/services/bidirectionalSyncService'

export function useBidirectionalSync() {
 const [status, setStatus] = useState<SyncStatus | null>(null)
 const [conflicts, setConflicts] = useState<SyncConflict[]>([])
 const [operations, setOperations] = useState<SyncOperation[]>([])
 const [isInitialized, setIsInitialized] = useState(false)
 const {toast} = useToast()

 const syncService = BidirectionalSyncService.getInstance()

 // Initialiser le service
 useEffect(() => {
  const initialize = async () => {
   try {
    await syncService.startBidirectionalSync()
    setIsInitialized(true)
    
    toast({
     title: '🔄 Synchronisation Activée',
     description: 'Synchronisation bidirectionnelle automatique démarrée',
     duration: 3000
    })
   } catch (error) {
    console.error('Erreur initialisation sync:', error)
    toast({
     title: '❌ Erreur Synchronisation',
     description: 'Impossible de démarrer la synchronisation automatique',
     variant: 'destructive'
    })
   }
  }

  initialize()

  // Nettoyer au démontage
  return () => {
   syncService.stopBidirectionalSync()
  }
 }, [])

 // S'abonner aux changements de statut
 useEffect(() => {
  const unsubscribe = syncService.subscribe((newStatus) => {
   setStatus(newStatus)
   
   // Mettre à jour les conflits et opérations
   setConflicts(syncService.getConflicts())
   setOperations(syncService.getOperations())

   // Notifications pour événements importants
   if (newStatus.conflictsDetected > 0 && conflicts.length === 0) {
    toast({
     title: '⚠️ Conflits Détectés',
     description: `${newStatus.conflictsDetected} conflit(s) de données nécessitent une attention`,
     variant: 'destructive',
     duration: 0 // Persistent
    })
   }

   if (newStatus.dataConsistency < 80 && newStatus.dataConsistency > 0) {
    toast({
     title: '🔧 Cohérence Dégradée',
     description: `Cohérence des données: ${newStatus.dataConsistency}%`,
     variant: 'destructive'
    })
   }
  })

  return unsubscribe
 }, [conflicts.length])

 // Forcer une synchronisation
 const forceSync = useCallback(async () => {
  try {
   await syncService.forceBidirectionalSync()
   toast({
    title: '✅ Synchronisation Forcée',
    description: 'Synchronisation complète terminée avec succès'
   })
  } catch (error) {
   toast({
    title: '❌ Erreur Synchronisation',
    description: 'Échec de la synchronisation forcée',
    variant: 'destructive'
   })
  }
 }, [])

 // Résoudre un conflit manuellement
 const resolveConflict = useCallback(async (
  conflictId: string, 
  resolution: 'prefer_local' | 'prefer_remote' | 'merge'
 ) => {
  try {
   await syncService.resolveConflictManually(conflictId, resolution)
   toast({
    title: '✅ Conflit Résolu',
    description: `Conflit résolu en faveur de: ${resolution.replace('prefer_', '')}`
   })
  } catch (error) {
   toast({
    title: '❌ Erreur Résolution',
    description: 'Impossible de résoudre le conflit',
    variant: 'destructive'
   })
  }
 }, [])

 // Mettre à jour la configuration
 const updateConfig = useCallback((config: any) => {
  syncService.updateConfig(config)
  toast({
   title: '⚙️ Configuration Mise à Jour',
   description: 'Paramètres de synchronisation modifiés'
  })
 }, [])

 // Obtenir les diagnostics
 const getDiagnostics = useCallback(async () => {
  return await syncService.getDiagnostics()
 }, [])

 // Redémarrer la synchronisation
 const restartSync = useCallback(async () => {
  try {
   await syncService.stopBidirectionalSync()
   await syncService.startBidirectionalSync()
   toast({
    title: '🔄 Synchronisation Redémarrée',
    description: 'Service de synchronisation redémarré avec succès'
   })
  } catch (error) {
   toast({
    title: '❌ Erreur Redémarrage',
    description: 'Impossible de redémarrer la synchronisation',
    variant: 'destructive'
   })
  }
 }, [])

 return {
  // État
  status,
  conflicts,
  operations,
  isInitialized,
  
  // Actions
  forceSync,
  resolveConflict,
  updateConfig,
  getDiagnostics,
  restartSync,
  
  // Statut computed
  isActive: status?.isActive || false,
  connectionQuality: status?.connectionQuality || 'offline',
  dataConsistency: status?.dataConsistency || 0,
  hasConflicts: conflicts.length > 0,
  pendingOperations: status?.pendingOperations || 0
 }
}
