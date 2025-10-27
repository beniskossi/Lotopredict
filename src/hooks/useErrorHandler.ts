import {useCallback} from 'react'
import {useToast} from '@/hooks/use-toast'
import {ErrorHandlingService, type AppError} from '@/services/errorHandlingService'

export function useErrorHandler() {
 const {toast} = useToast()

 const handleError = useCallback((error: Error | AppError, context?: {
  component?: string
  action?: string
 }) => {
  const appError = ErrorHandlingService.handleError(error, context)
  
  // Afficher un toast à l'utilisateur
  if (appError.userMessage) {
   toast({
    title: getErrorTitle(appError),
    description: appError.userMessage,
    variant: appError.severity === 'critical' || appError.severity === 'high' ? 'destructive' : 'default',
    duration: appError.severity === 'critical' ? 0 : 5000 // Les erreurs critiques restent affichées
   })
  }

  // Tenter une récupération automatique
  if (appError.recoverable) {
   ErrorHandlingService.attemptRecovery(appError).then(recovered => {
    if (recovered) {
     toast({
      title: '✅ Récupération réussie',
      description: 'Le problème a été résolu automatiquement.',
      duration: 3000
     })
    }
   })
  }

  return appError
 }, [toast])

 const handleAsyncError = useCallback(async function<T>(
  asyncOperation: () => Promise<T>,
  context?: {component?: string; action?: string}
 ): Promise<T | null> {
  try {
   return await asyncOperation()
  } catch (error) {
   handleError(error as Error, context)
   return null
  }
 }, [handleError])

 return {
  handleError,
  handleAsyncError,
  getErrorStats: ErrorHandlingService.getErrorStats,
  getRecentErrors: ErrorHandlingService.getRecentErrors,
  clearErrors: ErrorHandlingService.clearErrors
 }
}

function getErrorTitle(error: AppError): string {
 switch (error.severity) {
  case 'critical':
   return '🚨 Erreur Critique'
  case 'high':
   return '⚠️ Erreur Importante'
  case 'medium':
   return '⚠️ Problème Détecté'
  case 'low':
   return 'ℹ️ Avertissement'
  default:
   return '⚠️ Erreur'
 }
}
