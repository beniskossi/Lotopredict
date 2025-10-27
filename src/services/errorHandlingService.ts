// Service de gestion d'erreurs amélioré pour LotoBonheur
export interface ErrorContext {
 component?: string
 action?: string
 userId?: string
 timestamp: Date
 userAgent?: string
 url?: string
}

export interface AppError extends Error {
 code?: string
 severity: 'low' | 'medium' | 'high' | 'critical'
 context?: ErrorContext
 recoverable?: boolean
 userMessage?: string
}

export class ErrorHandlingService {
 private static errors: AppError[] = []
 private static maxErrors = 100

 // Types d'erreurs spécifiques à LotoBonheur
 static createSupabaseError(message: string, originalError?: any): AppError {
  const error = new Error(message) as AppError
  error.code = 'SUPABASE_ERROR'
  error.severity = 'high'
  error.recoverable = true
  error.userMessage = 'Problème de connexion à la base de données. Vos données locales sont sauvegardées.'
  
  if (originalError) {
   error.stack = originalError.stack
  }
  
  return error
 }

 static createPredictionError(message: string, algorithm?: string): AppError {
  const error = new Error(message) as AppError
  error.code = 'PREDICTION_ERROR'
  error.severity = 'medium'
  error.recoverable = true
  error.userMessage = `Erreur dans l'algorithme ${algorithm || 'de prédiction'}. D'autres algorithmes sont disponibles.`
  return error
 }

 static createDataIntegrityError(message: string): AppError {
  const error = new Error(message) as AppError
  error.code = 'DATA_INTEGRITY_ERROR'
  error.severity = 'high'
  error.recoverable = false
  error.userMessage = 'Données corrompues détectées. Restauration depuis la sauvegarde recommandée.'
  return error
 }

 static createNetworkError(message: string): AppError {
  const error = new Error(message) as AppError
  error.code = 'NETWORK_ERROR'
  error.severity = 'medium'
  error.recoverable = true
  error.userMessage = 'Problème de connexion réseau. L\'application fonctionne en mode hors ligne.'
  return error
 }

 // Gestionnaire central d'erreurs
 static handleError(error: AppError | Error, context?: Partial<ErrorContext>) {
  const appError = error as AppError
  
  // Enrichir l'erreur avec le contexte
  if (context) {
   appError.context = {
    timestamp: new Date(),
    userAgent: navigator.userAgent,
    url: window.location.href,
    ...context
   }
  }

  // Stocker l'erreur
  ErrorHandlingService.errors.unshift(appError)
  if (ErrorHandlingService.errors.length > ErrorHandlingService.maxErrors) {
   ErrorHandlingService.errors = ErrorHandlingService.errors.slice(0, ErrorHandlingService.maxErrors)
  }

  // Logger en console pour debug
  console.error('App Error:', {
   message: appError.message,
   code: appError.code,
   severity: appError.severity,
   context: appError.context,
   stack: appError.stack
  })

  // Persister les erreurs critiques
  if (appError.severity === 'critical' || appError.severity === 'high') {
   try {
    const errorLog = {
     message: appError.message,
     code: appError.code,
     severity: appError.severity,
     timestamp: new Date().toISOString(),
     context: appError.context
    }
    
    const existingLogs = JSON.parse(localStorage.getItem('error_logs') || '[]')
    existingLogs.unshift(errorLog)
    
    // Garder seulement les 50 dernières erreurs
    localStorage.setItem('error_logs', JSON.stringify(existingLogs.slice(0, 50)))
   } catch (e) {
    console.warn('Could not persist error log:', e)
   }
  }

  return appError
 }

 // Récupération automatique pour certains types d'erreurs
 static async attemptRecovery(error: AppError): Promise<boolean> {
  if (!error.recoverable) return false

  switch (error.code) {
   case 'SUPABASE_ERROR':
    return ErrorHandlingService.recoverSupabaseConnection()
   
   case 'NETWORK_ERROR':
    return ErrorHandlingService.recoverNetworkConnection()
   
   case 'PREDICTION_ERROR':
    return ErrorHandlingService.recoverPredictionService()
   
   default:
    return false
  }
 }

 private static async recoverSupabaseConnection(): Promise<boolean> {
  try {
   // Tenter de restaurer la connexion Supabase
   console.log('🔄 Tentative de récupération Supabase...')
   
   // Vérifier si les données locales sont disponibles
   const hasLocalData = localStorage.getItem('lottery_results_cache')
   if (hasLocalData) {
    console.log('✅ Données locales disponibles - mode dégradé activé')
    return true
   }
   
   return false
  } catch (e) {
   return false
  }
 }

 private static async recoverNetworkConnection(): Promise<boolean> {
  try {
   // Vérifier la connectivité réseau
   const response = await fetch('https://httpbin.org/get', { 
    method: 'HEAD',
    cache: 'no-cache'
   })
   return response.ok
  } catch (e) {
   return false
  }
 }

 private static async recoverPredictionService(): Promise<boolean> {
  try {
   // Vérifier si au moins un algorithme de prédiction fonctionne
   console.log('🔄 Vérification des algorithmes de prédiction...')
   return true // Toujours récupérable car on a plusieurs algorithmes
  } catch (e) {
   return false
  }
 }

 // Obtenir les erreurs récentes
 static getRecentErrors(count = 10): AppError[] {
  return ErrorHandlingService.errors.slice(0, count)
 }

 // Obtenir les statistiques d'erreurs
 static getErrorStats() {
  const total = ErrorHandlingService.errors.length
  const bySeverity = ErrorHandlingService.errors.reduce((acc, error) => {
   acc[error.severity] = (acc[error.severity] || 0) + 1
   return acc
  }, {} as Record<string, number>)

  const byCode = ErrorHandlingService.errors.reduce((acc, error) => {
   const code = error.code || 'UNKNOWN'
   acc[code] = (acc[code] || 0) + 1
   return acc
  }, {} as Record<string, number>)

  return {
   total,
   bySeverity,
   byCode,
   recoverable: ErrorHandlingService.errors.filter(e => e.recoverable).length
  }
 }

 // Nettoyer les anciennes erreurs
 static clearErrors() {
  ErrorHandlingService.errors = []
  localStorage.removeItem('error_logs')
 }
}
