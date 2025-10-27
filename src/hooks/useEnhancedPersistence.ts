// Hook personnalisé pour la persistance renforcée
import {useState, useEffect, useCallback} from 'react'
import EnhancedPersistenceService, {type DataSnapshot} from '@/services/enhancedPersistence'
import {useToast} from '@/hooks/use-toast'

interface UsePersistenceOptions {
 autoSave?: boolean
 debounceMs?: number
 type: DataSnapshot['type']
}

export function useEnhancedPersistence<T>(
 key: string, 
 initialData: T, 
 options: UsePersistenceOptions
) {
 const [data, setData] = useState<T>(initialData)
 const [isLoading, setIsLoading] = useState(true)
 const [isSaving, setIsSaving] = useState(false)
 const [lastSaved, setLastSaved] = useState<Date | null>(null)
 const {toast} = useToast()

 // Charger les données au montage
 useEffect(() => {
  const loadData = async () => {
   try {
    const snapshot = await EnhancedPersistenceService.retrieveData(key)
    if (snapshot && snapshot.data) {
     setData(snapshot.data)
     setLastSaved(new Date(snapshot.timestamp))
    }
   } catch (error) {
    console.error(`Erreur chargement ${key}:`, error)
   } finally {
    setIsLoading(false)
   }
  }

  loadData()
 }, [key])

 // Sauvegarder manuellement
 const save = useCallback(async (dataToSave?: T) => {
  setIsSaving(true)
  try {
   const saveData = dataToSave || data
   const success = await EnhancedPersistenceService.persistData(key, saveData, options.type)
   
   if (success) {
    setLastSaved(new Date())
    toast({
     title: '✅ Sauvegarde réussie',
     description: `Données ${key} sauvegardées`,
     duration: 2000
    })
   } else {
    throw new Error('Échec sauvegarde')
   }
  } catch (error) {
   toast({
    title: '❌ Erreur sauvegarde',
    description: `Impossible de sauvegarder ${key}`,
    variant: 'destructive'
   })
   throw error
  } finally {
   setIsSaving(false)
  }
 }, [data, key, options.type, toast])

 // Mettre à jour les données avec auto-save optionnel
 const updateData = useCallback((newData: T | ((prev: T) => T)) => {
  const updatedData = typeof newData === 'function' 
   ? (newData as (prev: T) => T)(data)
   : newData

  setData(updatedData)

  // Auto-save si activé
  if (options.autoSave) {
   EnhancedPersistenceService.scheduleAutoSave(key, updatedData, options.type)
  }
 }, [data, key, options.autoSave, options.type])

 // Forcer la synchronisation
 const forceSync = useCallback(async () => {
  try {
   await EnhancedPersistenceService.syncPendingWrites()
   toast({
    title: '🔄 Synchronisation',
    description: 'Données synchronisées avec succès',
    duration: 2000
   })
  } catch (error) {
   toast({
    title: '❌ Erreur sync',
    description: 'Échec de la synchronisation',
    variant: 'destructive'
   })
  }
 }, [toast])

 return {
  data,
  setData: updateData,
  isLoading,
  isSaving,
  lastSaved,
  save,
  forceSync
 }
}
