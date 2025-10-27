import {createClient} from '@supabase/supabase-js'
import {SUPABASE_CONFIG} from '@/config/supabaseNew'
import type {LotteryResultNew, PredictionHistoryNew, UserPreferencesNew, AlgorithmPerformanceNew, AuditLogNew, SyncStatusNew} from '@/config/supabaseNew'

// Créer le client Supabase avec nouvelle configuration
const supabaseClientNew = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
 auth: {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true
 },
 realtime: {
  params: {
   eventsPerSecond: 10
  }
 }
})

// Service pour les résultats de loterie avec nouvelles fonctionnalités
export class LotteryResultsServiceNew {
 // Récupérer tous les résultats avec pagination
 static async getAllResults(limit = 1000, offset = 0): Promise<LotteryResultNew[]> {
  const {data, error} = await supabaseClientNew
   .from('lottery_results')
   .select('*')
   .order('date', {ascending: false})
   .range(offset, offset + limit - 1)

  if (error) throw error
  return data || []
 }

 // Récupérer résultats par tirage avec cache intelligent
 static async getResultsByDraw(drawName: string, useCache = true): Promise<LotteryResultNew[]> {
  if (useCache) {
   const cached = localStorage.getItem(`draw_cache_${drawName}`)
   if (cached) {
    const {data, timestamp} = JSON.parse(cached)
    if (Date.now() - timestamp < 300000) { // 5 minutes de cache
     return data
    }
   }
  }

  const {data, error} = await supabaseClientNew
   .from('lottery_results')
   .select('*')
   .eq('draw_name', drawName)
   .order('date', {ascending: false})

  if (error) throw error

  // Mettre en cache
  if (useCache) {
   localStorage.setItem(`draw_cache_${drawName}`, JSON.stringify({
    data,
    timestamp: Date.now()
   }))
  }

  return data || []
 }

 // Ajouter résultat avec validation avancée
 static async addResult(result: Omit<LotteryResultNew, 'id' | 'created_at' | 'updated_at'>): Promise<LotteryResultNew> {
  // Validation des données
  if (!result.draw_name || !result.date || !result.winning_numbers) {
   throw new Error('Données de tirage incomplètes')
  }

  if (result.winning_numbers.length !== 5) {
   throw new Error('Exactement 5 numéros gagnants requis')
  }

  if (result.winning_numbers.some(n => n < 1 || n > 90)) {
   throw new Error('Les numéros doivent être entre 1 et 90')
  }

  // Vérifier les doublons
  const existing = await LotteryResultsServiceNew.checkDuplicate(result.draw_name, result.date)
  if (existing) {
   throw new Error('Ce tirage existe déjà dans la base de données')
  }

  const {data, error} = await supabaseClientNew
   .from('lottery_results')
   .insert([{
    ...result,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
   }])
   .select()
   .single()

  if (error) throw error
  
  // Invalider le cache
  localStorage.removeItem(`draw_cache_${result.draw_name}`)
  
  return data
 }

 // Mise à jour avec gestion des conflits
 static async updateResult(id: number, updates: Partial<LotteryResultNew>): Promise<LotteryResultNew> {
  // Récupérer la version actuelle pour détecter les conflits
  const {data: current} = await supabaseClientNew
   .from('lottery_results')
   .select('updated_at')
   .eq('id', id)
   .single()

  const {data, error} = await supabaseClientNew
   .from('lottery_results')
   .update({
    ...updates,
    updated_at: new Date().toISOString()
   })
   .eq('id', id)
   .select()
   .single()

  if (error) throw error
  return data
 }

 // Suppression avec audit trail
 static async deleteResult(id: number, reason = 'Manuel'): Promise<void> {
  // Récupérer les données avant suppression pour l'audit
  const {data: toDelete} = await supabaseClientNew
   .from('lottery_results')
   .select('*')
   .eq('id', id)
   .single()

  const {error} = await supabaseClientNew
   .from('lottery_results')
   .delete()
   .eq('id', id)

  if (error) throw error

  // Logger la suppression
  if (toDelete) {
   await AuditServiceNew.addLog({
    action: 'DELETE_RESULT',
    table_name: 'lottery_results',
    record_id: id,
    old_data: toDelete,
    details: `Suppression: ${reason}`
   })
  }
 }

 // Vérifier doublons
 static async checkDuplicate(drawName: string, date: string): Promise<boolean> {
  const {data} = await supabaseClientNew
   .from('lottery_results')
   .select('id')
   .eq('draw_name', drawName)
   .eq('date', date)
   .limit(1)

  return (data?.length || 0) > 0
 }

 // Synchronisation par lot avec gestion des erreurs
 static async batchSync(results: Omit<LotteryResultNew, 'id' | 'created_at' | 'updated_at'>[]): Promise<{inserted: number; updated: number; errors: any[]}> {
  let inserted = 0
  let updated = 0
  const errors: any[] = []

  for (const result of results) {
   try {
    const existing = await LotteryResultsServiceNew.checkDuplicate(result.draw_name, result.date)
    
    if (existing) {
     // Mettre à jour si différent
     const existingData = await supabaseClientNew
      .from('lottery_results')
      .select('*')
      .eq('draw_name', result.draw_name)
      .eq('date', result.date)
      .single()

     if (existingData.data) {
      const numbersChanged = JSON.stringify(existingData.data.winning_numbers.sort()) !== JSON.stringify(result.winning_numbers.sort())
      
      if (numbersChanged) {
       await LotteryResultsServiceNew.updateResult(existingData.data.id, result)
       updated++
      }
     }
    } else {
     await LotteryResultsServiceNew.addResult(result)
     inserted++
    }
   } catch (error) {
    errors.push({result, error})
   }
  }

  return {inserted, updated, errors}
 }

 // Obtenir statistiques
 static async getStats(): Promise<{
  totalResults: number
  uniqueDraws: number
  dateRange: {oldest: string; newest: string}
  lastUpdate: string
 }> {
  const {data: counts} = await supabaseClientNew
   .from('lottery_results')
   .select('id', {count: 'exact', head: true})

  const {data: draws} = await supabaseClientNew
   .from('lottery_results')
   .select('draw_name')

  const {data: dates} = await supabaseClientNew
   .from('lottery_results')
   .select('date, updated_at')
   .order('date', {ascending: false})
   .limit(1)

  const {data: oldestDate} = await supabaseClientNew
   .from('lottery_results')
   .select('date')
   .order('date', {ascending: true})
   .limit(1)

  return {
   totalResults: counts?.length || 0,
   uniqueDraws: new Set(draws?.map(d => d.draw_name)).size,
   dateRange: {
    oldest: oldestDate?.[0]?.date || '',
    newest: dates?.[0]?.date || ''
   },
   lastUpdate: dates?.[0]?.updated_at || ''
  }
 }
}

// Service pour l'historique des prédictions avec scoring
export class PredictionsServiceNew {
 // Sauvegarder prédiction avec métadonnées complètes
 static async savePrediction(prediction: Omit<PredictionHistoryNew, 'id' | 'created_at'>): Promise<PredictionHistoryNew> {
  const {data, error} = await supabaseClientNew
   .from('predictions_history')
   .insert([{
    ...prediction,
    created_at: new Date().toISOString()
   }])
   .select()
   .single()

  if (error) throw error
  return data
 }

 // Récupérer prédictions utilisateur avec filtres avancés
 static async getUserPredictions(
  userId: string, 
  filters?: {
   drawName?: string
   algorithm?: string
   dateFrom?: string
   dateTo?: string
   isValidated?: boolean
  }
 ): Promise<PredictionHistoryNew[]> {
  let query = supabaseClientNew
   .from('predictions_history')
   .select('*')
   .eq('user_id', userId)

  if (filters?.drawName) query = query.eq('draw_name', filters.drawName)
  if (filters?.algorithm) query = query.eq('algorithm_used', filters.algorithm)
  if (filters?.dateFrom) query = query.gte('created_at', filters.dateFrom)
  if (filters?.dateTo) query = query.lte('created_at', filters.dateTo)
  if (filters?.isValidated !== undefined) query = query.eq('is_winning', filters.isValidated)

  const {data, error} = await query.order('created_at', {ascending: false})

  if (error) throw error
  return data || []
 }

 // Mettre à jour avec résultat réel et scoring
 static async updatePredictionResult(
  id: number, 
  actualResult: number[], 
  matchesCount: number,
  scoreDetails?: any
 ): Promise<void> {
  const {error} = await supabaseClientNew
   .from('predictions_history')
   .update({
    actual_result: actualResult,
    matches_count: matchesCount,
    is_winning: matchesCount >= 3,
    score_details: scoreDetails,
    validated_at: new Date().toISOString()
   })
   .eq('id', id)

  if (error) throw error
 }

 // Obtenir statistiques des prédictions
 static async getPredictionStats(userId?: string): Promise<{
  totalPredictions: number
  averageMatches: number
  bestScore: number
  winningPredictions: number
  algorithmBreakdown: Record<string, number>
 }> {
  let query = supabaseClientNew.from('predictions_history').select('*')
  
  if (userId) {
   query = query.eq('user_id', userId)
  }

  const {data, error} = await query

  if (error) throw error

  const predictions = data || []
  const validatedPredictions = predictions.filter(p => p.actual_result)

  const algorithmBreakdown = predictions.reduce((acc, pred) => {
   acc[pred.algorithm_used] = (acc[pred.algorithm_used] || 0) + 1
   return acc
  }, {} as Record<string, number>)

  return {
   totalPredictions: predictions.length,
   averageMatches: validatedPredictions.length > 0 
    ? validatedPredictions.reduce((sum, p) => sum + (p.matches_count || 0), 0) / validatedPredictions.length 
    : 0,
   bestScore: Math.max(...validatedPredictions.map(p => p.matches_count || 0), 0),
   winningPredictions: predictions.filter(p => p.is_winning).length,
   algorithmBreakdown
  }
 }

 // Validation automatique des prédictions
 static async validatePendingPredictions(): Promise<{validated: number; errors: any[]}> {
  // Récupérer prédictions non validées
  const {data: pending} = await supabaseClientNew
   .from('predictions_history')
   .select('*')
   .is('actual_result', null)
   .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Plus de 24h

  if (!pending) return {validated: 0, errors: []}

  let validated = 0
  const errors: any[] = []

  for (const prediction of pending) {
   try {
    // Chercher le résultat correspondant
    const {data: result} = await supabaseClientNew
     .from('lottery_results')
     .select('winning_numbers')
     .eq('draw_name', prediction.draw_name)
     .gte('date', prediction.created_at)
     .limit(1)

    if (result && result[0]) {
     const matches = prediction.predicted_numbers.filter(num => 
      result[0].winning_numbers.includes(num)
     ).length

     await PredictionsServiceNew.updatePredictionResult(
      prediction.id,
      result[0].winning_numbers,
      matches
     )
     validated++
    }
   } catch (error) {
    errors.push({prediction: prediction.id, error})
   }
  }

  return {validated, errors}
 }
}

// Service pour les performances des algorithmes
export class AlgorithmPerformanceServiceNew {
 // Récupérer toutes les performances avec cache
 static async getAllPerformances(): Promise<AlgorithmPerformanceNew[]> {
  const cached = localStorage.getItem('algorithm_performances_cache')
  if (cached) {
   const {data, timestamp} = JSON.parse(cached)
   if (Date.now() - timestamp < 600000) { // 10 minutes de cache
    return data
   }
  }

  const {data, error} = await supabaseClientNew
   .from('algorithm_performance')
   .select('*')
   .order('accuracy_rate', {ascending: false})

  if (error) throw error

  // Mettre en cache
  localStorage.setItem('algorithm_performances_cache', JSON.stringify({
   data: data || [],
   timestamp: Date.now()
  }))

  return data || []
 }

 // Mettre à jour performances avec validation
 static async updatePerformance(
  algorithmName: string, 
  performance: Partial<AlgorithmPerformanceNew>
 ): Promise<void> {
  const {error} = await supabaseClientNew
   .from('algorithm_performance')
   .upsert([{
    algorithm_name: algorithmName,
    ...performance,
    last_updated: new Date().toISOString()
   }])

  if (error) throw error

  // Invalider le cache
  localStorage.removeItem('algorithm_performances_cache')
 }

 // Calculer performances depuis les prédictions
 static async calculatePerformanceFromPredictions(): Promise<Record<string, any>> {
  const {data: predictions} = await supabaseClientNew
   .from('predictions_history')
   .select('algorithm_used, matches_count, confidence_score, is_winning')
   .not('actual_result', 'is', null)

  if (!predictions) return {}

  const performanceMap: Record<string, any> = {}

  const algorithmGroups = predictions.reduce((acc, pred) => {
   if (!acc[pred.algorithm_used]) acc[pred.algorithm_used] = []
   acc[pred.algorithm_used].push(pred)
   return acc
  }, {} as Record<string, any[]>)

  for (const [algorithm, preds] of Object.entries(algorithmGroups)) {
   const totalPredictions = preds.length
   const successfulPredictions = preds.filter(p => p.is_winning).length
   const avgMatches = preds.reduce((sum, p) => sum + (p.matches_count || 0), 0) / totalPredictions
   const avgConfidence = preds.reduce((sum, p) => sum + p.confidence_score, 0) / totalPredictions

   performanceMap[algorithm] = {
    algorithm_name: algorithm,
    total_predictions: totalPredictions,
    successful_predictions: successfulPredictions,
    accuracy_rate: (successfulPredictions / totalPredictions) * 100,
    avg_matches: avgMatches,
    avg_confidence: avgConfidence,
    last_updated: new Date().toISOString()
   }

   // Mettre à jour dans la base
   await AlgorithmPerformanceServiceNew.updatePerformance(algorithm, performanceMap[algorithm])
  }

  return performanceMap
 }
}

// Service pour les préférences utilisateur
export class UserPreferencesServiceNew {
 // Récupérer préférences avec défauts
 static async getPreferences(userId: string): Promise<UserPreferencesNew | null> {
  const {data, error} = await supabaseClientNew
   .from('user_preferences')
   .select('*')
   .eq('user_id', userId)
   .single()

  if (error && error.code !== 'PGRST116') throw error
  
  // Retourner préférences par défaut si aucune trouvée
  if (!data) {
   return {
    user_id: userId,
    theme: 'system',
    notifications_enabled: true,
    favorite_draws: [],
    sync_settings: {
     auto_sync: true,
     sync_interval: 30,
     conflict_resolution: 'prefer_remote'
    },
    prediction_settings: {
     default_algorithm: 'hybrid',
     show_confidence: true,
     save_automatically: true
    }
   }
  }

  return data
 }

 // Sauvegarder préférences avec validation
 static async savePreferences(preferences: Omit<UserPreferencesNew, 'id' | 'created_at' | 'updated_at'>): Promise<UserPreferencesNew> {
  const {data, error} = await supabaseClientNew
   .from('user_preferences')
   .upsert([{
    ...preferences,
    updated_at: new Date().toISOString()
   }])
   .select()
   .single()

  if (error) throw error
  return data
 }

 // Mettre à jour paramètres spécifiques
 static async updateSyncSettings(userId: string, syncSettings: any): Promise<void> {
  const {error} = await supabaseClientNew
   .from('user_preferences')
   .update({
    sync_settings: syncSettings,
    updated_at: new Date().toISOString()
   })
   .eq('user_id', userId)

  if (error) throw error
 }
}

// Service pour les logs d'audit avec recherche avancée
export class AuditServiceNew {
 // Ajouter log avec contexte enrichi
 static async addLog(log: Omit<AuditLogNew, 'id' | 'timestamp'>): Promise<void> {
  const {error} = await supabaseClientNew
   .from('audit_logs')
   .insert([{
    ...log,
    timestamp: new Date().toISOString(),
    ip_address: await AuditServiceNew.getClientIP(),
    user_agent: navigator.userAgent
   }])

  if (error) throw error
 }

 // Récupérer logs avec filtres avancés
 static async getLogs(
  filters?: {
   userId?: string
   action?: string
   tableName?: string
   dateFrom?: string
   dateTo?: string
   limit?: number
  }
 ): Promise<AuditLogNew[]> {
  let query = supabaseClientNew.from('audit_logs').select('*')

  if (filters?.userId) query = query.eq('user_id', filters.userId)
  if (filters?.action) query = query.eq('action', filters.action)
  if (filters?.tableName) query = query.eq('table_name', filters.tableName)
  if (filters?.dateFrom) query = query.gte('timestamp', filters.dateFrom)
  if (filters?.dateTo) query = query.lte('timestamp', filters.dateTo)

  const {data, error} = await query
   .order('timestamp', {ascending: false})
   .limit(filters?.limit || 100)

  if (error) throw error
  return data || []
 }

 // Obtenir IP client (approximative)
 private static async getClientIP(): Promise<string> {
  try {
   const response = await fetch('https://api.ipify.org?format=json')
   const data = await response.json()
   return data.ip
  } catch {
   return 'unknown'
  }
 }

 // Statistiques d'audit
 static async getAuditStats(): Promise<{
  totalLogs: number
  actionBreakdown: Record<string, number>
  recentActivity: number
 }> {
  const {data: logs} = await supabaseClientNew
   .from('audit_logs')
   .select('action, timestamp')

  if (!logs) return {totalLogs: 0, actionBreakdown: {}, recentActivity: 0}

  const actionBreakdown = logs.reduce((acc, log) => {
   acc[log.action] = (acc[log.action] || 0) + 1
   return acc
  }, {} as Record<string, number>)

  const recentActivity = logs.filter(log => 
   new Date(log.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
  ).length

  return {
   totalLogs: logs.length,
   actionBreakdown,
   recentActivity
  }
 }
}

// Service d'authentification amélioré
export class AuthServiceNew {
 // Obtenir utilisateur actuel avec informations enrichies
 static async getCurrentUser() {
  const {data: {user}} = await supabaseClientNew.auth.getUser()
  
  if (user) {
   // Récupérer les préférences utilisateur
   const preferences = await UserPreferencesServiceNew.getPreferences(user.id)
   return {
    ...user,
    preferences
   }
  }
  
  return user
 }

 // Connexion avec audit trail
 static async signInWithEmail(email: string, password: string) {
  const {data, error} = await supabaseClientNew.auth.signInWithPassword({
   email,
   password
  })

  if (error) throw error

  // Logger la connexion
  if (data.user) {
   await AuditServiceNew.addLog({
    user_id: data.user.id,
    action: 'USER_LOGIN',
    details: `Connexion utilisateur: ${email}`
   })
  }

  return data
 }

 // Inscription avec configuration initiale
 static async signUpWithEmail(email: string, password: string) {
  const {data, error} = await supabaseClientNew.auth.signUp({
   email,
   password
  })

  if (error) throw error

  // Créer préférences par défaut
  if (data.user) {
   await UserPreferencesServiceNew.savePreferences({
    user_id: data.user.id,
    theme: 'system',
    notifications_enabled: true,
    favorite_draws: [],
    sync_settings: {
     auto_sync: true,
     sync_interval: 30,
     conflict_resolution: 'prefer_remote'
    },
    prediction_settings: {
     default_algorithm: 'hybrid',
     show_confidence: true,
     save_automatically: true
    }
   })

   await AuditServiceNew.addLog({
    user_id: data.user.id,
    action: 'USER_SIGNUP',
    details: `Inscription nouvel utilisateur: ${email}`
   })
  }

  return data
 }

 // Déconnexion avec nettoyage
 static async signOut() {
  const user = await AuthServiceNew.getCurrentUser()
  
  const {error} = await supabaseClientNew.auth.signOut()
  
  if (error) throw error

  // Nettoyer le cache local
  localStorage.removeItem('algorithm_performances_cache')
  Object.keys(localStorage).forEach(key => {
   if (key.startsWith('draw_cache_')) {
    localStorage.removeItem(key)
   }
  })

  // Logger la déconnexion
  if (user) {
   await AuditServiceNew.addLog({
    user_id: user.id,
    action: 'USER_LOGOUT',
    details: 'Déconnexion utilisateur'
   })
  }
 }

 // Connexion anonyme pour invités
 static async signInAnonymously() {
  const {data, error} = await supabaseClientNew.auth.signInAnonymously()
  
  if (error) throw error

  if (data.user) {
   await AuditServiceNew.addLog({
    user_id: data.user.id,
    action: 'ANONYMOUS_LOGIN',
    details: 'Connexion anonyme'
   })
  }

  return data
 }
}

// Service pour le statut de synchronisation
export class SyncStatusServiceNew {
 // Mettre à jour le statut de synchronisation
 static async updateSyncStatus(status: Omit<SyncStatusNew, 'id' | 'updated_at'>): Promise<void> {
  const {error} = await supabaseClientNew
   .from('sync_status')
   .upsert([{
    ...status,
    updated_at: new Date().toISOString()
   }])

  if (error) throw error
 }

 // Récupérer le dernier statut
 static async getLatestSyncStatus(): Promise<SyncStatusNew | null> {
  const {data, error} = await supabaseClientNew
   .from('sync_status')
   .select('*')
   .order('updated_at', {ascending: false})
   .limit(1)
   .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
 }

 // Obtenir historique des synchronisations
 static async getSyncHistory(limit = 50): Promise<SyncStatusNew[]> {
  const {data, error} = await supabaseClientNew
   .from('sync_status')
   .select('*')
   .order('updated_at', {ascending: false})
   .limit(limit)

  if (error) throw error
  return data || []
 }
}

export {supabaseClientNew as supabase}
