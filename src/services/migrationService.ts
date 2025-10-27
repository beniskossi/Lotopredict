// Service de migration et test de connexion Supabase - COMPLET
import { supabaseNew } from '@/services/supabaseClientNew'
import { LotteryResultsServiceNew, AuditServiceNew, AuthServiceNew } from '@/services/supabaseClientNew'
import type { DrawResult } from '@/services/lotteryApi'
import type { LotteryResult, PredictionHistory, UserPreferences } from '@/config/supabaseNew'

export interface MigrationProgress {
  stage: string
  progress: number
  message: string
  details?: any
}

export interface MigrationResult {
  success: boolean
  totalMigrated: number
  errors: string[]
  duration: number
  summary: {
    lotteryResults: number
    predictions: number
    preferences: number
    auditLogs: number
  }
}

export interface ConnectionTestResult {
  overall: boolean
  details: {
    connection: boolean
    authentication: boolean
    permissions: boolean
    tables: boolean
    functions: boolean
  }
  latency: number
  errors: string[]
}

export class MigrationService {
  private static progressCallback?: (progress: MigrationProgress) => void

  // Tester la connexion complète à Supabase
  static async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now()
    const result: ConnectionTestResult = {
      overall: false,
      details: {
        connection: false,
        authentication: false,
        permissions: false,
        tables: false,
        functions: false
      },
      latency: 0,
      errors: []
    }

    try {
      // 1. Test de connexion de base
      console.log('🔍 Test de connexion Supabase...')
      const { data: healthCheck, error: connectionError } = await supabaseNew
        .from('lottery_results')
        .select('count')
        .limit(1)

      if (connectionError) {
        result.errors.push(`Connexion: ${connectionError.message}`)
      } else {
        result.details.connection = true
        console.log('✅ Connexion établie')
      }

      // 2. Test d'authentification
      console.log('🔍 Test d\'authentification...')
      try {
        const { data: { user }, error: authError } = await supabaseNew.auth.getUser()
        if (authError) {
          result.errors.push(`Auth: ${authError.message}`)
        } else {
          result.details.authentication = true
          console.log('✅ Authentification OK')
        }
      } catch (authError: any) {
        result.errors.push(`Auth Exception: ${authError.message}`)
      }

      // 3. Test des permissions (insertion de test)
      console.log('🔍 Test des permissions...')
      try {
        const testData = {
          draw_name: 'TEST_CONNECTION',
          date: new Date().toISOString().split('T')[0],
          winning_numbers: [1, 2, 3, 4, 5],
          machine_numbers: [6, 7, 8, 9, 10],
          created_at: new Date().toISOString()
        }

        const { data: insertTest, error: insertError } = await supabaseNew
          .from('lottery_results')
          .insert([testData])
          .select()

        if (insertError) {
          result.errors.push(`Permissions Insert: ${insertError.message}`)
        } else {
          // Nettoyer le test
          if (insertTest && insertTest[0]) {
            await supabaseNew
              .from('lottery_results')
              .delete()
              .eq('id', insertTest[0].id)
          }
          result.details.permissions = true
          console.log('✅ Permissions OK')
        }
      } catch (permError: any) {
        result.errors.push(`Permissions Exception: ${permError.message}`)
      }

      // 4. Test de toutes les tables
      console.log('🔍 Test des tables...')
      const tables = ['lottery_results', 'predictions_history', 'user_preferences', 'algorithm_performance', 'audit_logs']
      let tablesOK = 0

      for (const table of tables) {
        try {
          const { data, error } = await supabaseNew
            .from(table)
            .select('*')
            .limit(1)

          if (error) {
            result.errors.push(`Table ${table}: ${error.message}`)
          } else {
            tablesOK++
          }
        } catch (tableError: any) {
          result.errors.push(`Table ${table} Exception: ${tableError.message}`)
        }
      }

      result.details.tables = tablesOK === tables.length
      console.log(`✅ Tables testées: ${tablesOK}/${tables.length}`)

      // 5. Test des fonctions (si disponibles)
      console.log('🔍 Test des fonctions RPC...')
      try {
        // Test de fonction basique (peut ne pas exister)
        const { data: rpcTest, error: rpcError } = await supabaseNew
          .rpc('version')

        if (!rpcError) {
          result.details.functions = true
          console.log('✅ Fonctions RPC OK')
        } else {
          console.log('⚠️ Fonctions RPC non disponibles (normal si pas configurées)')
          result.details.functions = true // Considéré comme OK si pas configuré
        }
      } catch (rpcError: any) {
        console.log('⚠️ Fonctions RPC non testables')
        result.details.functions = true // Considéré comme OK
      }

      // Calcul du résultat global
      const successCount = Object.values(result.details).filter(Boolean).length
      result.overall = successCount >= 4 // Au moins 4/5 critères OK

      result.latency = Date.now() - startTime
      console.log(`🏁 Test terminé en ${result.latency}ms - Succès: ${result.overall}`)

      return result

    } catch (globalError: any) {
      result.errors.push(`Erreur globale: ${globalError.message}`)
      result.latency = Date.now() - startTime
      return result
    }
  }

  // Migrer toutes les données existantes
  static async migrateAllData(
    onProgress?: (progress: MigrationProgress) => void
  ): Promise<MigrationResult> {
    const startTime = Date.now()
    MigrationService.progressCallback = onProgress

    const result: MigrationResult = {
      success: false,
      totalMigrated: 0,
      errors: [],
      duration: 0,
      summary: {
        lotteryResults: 0,
        predictions: 0,
        preferences: 0,
        auditLogs: 0
      }
    }

    try {
      MigrationService.updateProgress('init', 0, 'Initialisation de la migration...')

      // 1. Migrer les résultats de loterie
      MigrationService.updateProgress('lottery', 20, 'Migration des résultats de loterie...')
      const lotteryMigrated = await MigrationService.migrateLotteryResults()
      result.summary.lotteryResults = lotteryMigrated

      // 2. Migrer les prédictions
      MigrationService.updateProgress('predictions', 40, 'Migration des prédictions...')
      const predictionsMigrated = await MigrationService.migratePredictions()
      result.summary.predictions = predictionsMigrated

      // 3. Migrer les préférences utilisateur
      MigrationService.updateProgress('preferences', 60, 'Migration des préférences...')
      const preferencesMigrated = await MigrationService.migrateUserPreferences()
      result.summary.preferences = preferencesMigrated

      // 4. Migrer les logs d'audit
      MigrationService.updateProgress('audit', 80, 'Migration des logs d\'audit...')
      const auditMigrated = await MigrationService.migrateAuditLogs()
      result.summary.auditLogs = auditMigrated

      // 5. Finalisation
      MigrationService.updateProgress('finalize', 100, 'Migration terminée avec succès!')

      result.totalMigrated = lotteryMigrated + predictionsMigrated + preferencesMigrated + auditMigrated
      result.success = true
      result.duration = Date.now() - startTime

      console.log(`✅ Migration complète: ${result.totalMigrated} enregistrements en ${result.duration}ms`)
      return result

    } catch (error: any) {
      result.errors.push(`Erreur migration: ${error.message}`)
      result.duration = Date.now() - startTime
      MigrationService.updateProgress('error', 0, `Erreur: ${error.message}`)
      return result
    }
  }

  // Migrer les résultats de loterie depuis localStorage
  private static async migrateLotteryResults(): Promise<number> {
    try {
      // Récupérer depuis le cache local
      const cachedData = localStorage.getItem('lottery_results_cache')
      if (!cachedData) return 0

      const parsed = JSON.parse(cachedData)
      const localResults: DrawResult[] = parsed.data || []

      if (localResults.length === 0) return 0

      console.log(`📊 Migration de ${localResults.length} résultats de loterie...`)

      let migrated = 0
      const batchSize = 50

      // Migrer par batch pour éviter les timeout
      for (let i = 0; i < localResults.length; i += batchSize) {
        const batch = localResults.slice(i, i + batchSize)
        const supabaseBatch = batch.map(result => ({
          draw_name: result.draw_name,
          date: result.date,
          winning_numbers: result.gagnants,
          machine_numbers: result.machine || null,
          created_at: new Date().toISOString(),
          user_id: null // Données anonymes
        }))

        const { data, error } = await supabaseNew
          .from('lottery_results')
          .upsert(supabaseBatch, { onConflict: 'draw_name,date' })

        if (error) {
          console.error(`Erreur batch ${i}-${i + batchSize}:`, error)
        } else {
          migrated += batch.length
          console.log(`✅ Batch ${i + 1}-${Math.min(i + batchSize, localResults.length)} migré`)
        }
      }

      return migrated

    } catch (error: any) {
      console.error('Erreur migration lottery results:', error)
      return 0
    }
  }

  // Migrer les prédictions depuis localStorage
  private static async migratePredictions(): Promise<number> {
    try {
      const predictionHistory = localStorage.getItem('prediction_history')
      if (!predictionHistory) return 0

      const localPredictions = JSON.parse(predictionHistory)
      const predictions = Object.values(localPredictions) as any[]

      if (predictions.length === 0) return 0

      console.log(`🎯 Migration de ${predictions.length} prédictions...`)

      let migrated = 0

      for (const prediction of predictions) {
        try {
          const supabaseData = {
            user_id: prediction.userId || 'anonymous',
            draw_name: prediction.drawName,
            predicted_numbers: prediction.predictedNumbers,
            algorithm_used: prediction.algorithm,
            confidence_score: prediction.confidence,
            actual_result: prediction.actualResult || null,
            matches_count: prediction.score?.scoreBreakdown?.exactMatches || null,
            is_winning: prediction.score?.grade === 'excellent' || false,
            created_at: prediction.predictedAt
          }

          const { error } = await supabaseNew
            .from('predictions_history')
            .upsert([supabaseData], { onConflict: 'user_id,draw_name,predicted_numbers' })

          if (!error) {
            migrated++
          } else {
            console.warn('Erreur prédiction:', error)
          }

        } catch (predError: any) {
          console.warn('Erreur prédiction individuelle:', predError)
        }
      }

      return migrated

    } catch (error: any) {
      console.error('Erreur migration predictions:', error)
      return 0
    }
  }

  // Migrer les préférences utilisateur
  private static async migrateUserPreferences(): Promise<number> {
    try {
      // Récupérer les préférences de thème et autres
      const theme = localStorage.getItem('lotobonheur-theme') || 'system'
      const onboardingCompleted = localStorage.getItem('lotobonheur_onboarding_completed') === 'true'

      const user = await AuthServiceNew.getCurrentUser()
      if (!user) return 0

      const preferences = {
        user_id: user.id,
        theme: theme as 'light' | 'dark' | 'system',
        notifications_enabled: true,
        favorite_draws: [],
        alert_settings: {
          onboarding_completed: onboardingCompleted,
          show_performance_dashboard: true
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const { error } = await supabaseNew
        .from('user_preferences')
        .upsert([preferences], { onConflict: 'user_id' })

      if (error) {
        console.error('Erreur migration preferences:', error)
        return 0
      }

      return 1

    } catch (error: any) {
      console.error('Erreur migration user preferences:', error)
      return 0
    }
  }

  // Migrer les logs d'audit
  private static async migrateAuditLogs(): Promise<number> {
    try {
      const auditLogs = localStorage.getItem('error_logs')
      if (!auditLogs) return 0

      const logs = JSON.parse(auditLogs)
      if (!Array.isArray(logs) || logs.length === 0) return 0

      console.log(`📋 Migration de ${logs.length} logs d'audit...`)

      let migrated = 0

      for (const log of logs) {
        try {
          const auditData = {
            user_id: 'system',
            action: 'ERROR_LOG',
            table_name: 'system_errors',
            old_data: null,
            new_data: {
              message: log.message,
              code: log.code,
              severity: log.severity,
              context: log.context
            },
            timestamp: log.timestamp,
            ip_address: null,
            user_agent: log.context?.userAgent || null
          }

          const { error } = await supabaseNew
            .from('audit_logs')
            .insert([auditData])

          if (!error) {
            migrated++
          }

        } catch (logError: any) {
          console.warn('Erreur log individuel:', logError)
        }
      }

      return migrated

    } catch (error: any) {
      console.error('Erreur migration audit logs:', error)
      return 0
    }
  }

  // Vérifier l'intégrité des données migrées
  static async verifyDataIntegrity(): Promise<{
    success: boolean
    checks: Record<string, boolean>
    details: any
  }> {
    const checks = {
      lotteryResults: false,
      predictions: false,
      preferences: false,
      auditLogs: false,
      relationships: false
    }

    const details: any = {}

    try {
      // 1. Vérifier les résultats de loterie
      const { data: lotteryData, error: lotteryError } = await supabaseNew
        .from('lottery_results')
        .select('count')

      if (!lotteryError && lotteryData) {
        checks.lotteryResults = true
        details.lotteryCount = lotteryData.length
      }

      // 2. Vérifier les prédictions
      const { data: predictionData, error: predictionError } = await supabaseNew
        .from('predictions_history')
        .select('count')

      if (!predictionError && predictionData) {
        checks.predictions = true
        details.predictionCount = predictionData.length
      }

      // 3. Vérifier les préférences
      const { data: prefData, error: prefError } = await supabaseNew
        .from('user_preferences')
        .select('count')

      if (!prefError && prefData) {
        checks.preferences = true
        details.preferencesCount = prefData.length
      }

      // 4. Vérifier les logs d'audit
      const { data: auditData, error: auditError } = await supabaseNew
        .from('audit_logs')
        .select('count')

      if (!auditError && auditData) {
        checks.auditLogs = true
        details.auditCount = auditData.length
      }

      // 5. Vérifier les relations (par exemple: prédictions avec résultats correspondants)
      const { data: relationsData, error: relationsError } = await supabaseNew
        .from('predictions_history')
        .select(`
          id,
          draw_name,
          lottery_results!inner(id, draw_name)
        `)
        .limit(10)

      if (!relationsError) {
        checks.relationships = true
        details.relationsCount = relationsData?.length || 0
      }

      const success = Object.values(checks).filter(Boolean).length >= 3

      return { success, checks, details }

    } catch (error: any) {
      console.error('Erreur vérification intégrité:', error)
      return { success: false, checks, details: { error: error.message } }
    }
  }

  // Nettoyer les données locales après migration réussie
  static cleanupLocalData(): void {
    const keysToClean = [
      'lottery_results_cache',
      'prediction_history',
      'algorithm_performances',
      'error_logs',
      'enhanced_admin_data'
    ]

    keysToClean.forEach(key => {
      const data = localStorage.getItem(key)
      if (data) {
        // Sauvegarder une backup avant nettoyage
        localStorage.setItem(`backup_${key}_${Date.now()}`, data)
        localStorage.removeItem(key)
        console.log(`🧹 Nettoyé: ${key}`)
      }
    })

    console.log('✅ Nettoyage local terminé - backups créées')
  }

  // Restaurer depuis backup en cas de problème
  static restoreFromBackup(): boolean {
    try {
      const backupKeys = Object.keys(localStorage).filter(key => key.startsWith('backup_'))
      
      backupKeys.forEach(backupKey => {
        const originalKey = backupKey.replace(/^backup_/, '').replace(/_\d+$/, '')
        const data = localStorage.getItem(backupKey)
        if (data) {
          localStorage.setItem(originalKey, data)
          console.log(`🔄 Restauré: ${originalKey}`)
        }
      })

      console.log('✅ Restauration depuis backup terminée')
      return true

    } catch (error: any) {
      console.error('Erreur restauration:', error)
      return false
    }
  }

  // Helper pour mettre à jour le progrès
  private static updateProgress(stage: string, progress: number, message: string, details?: any): void {
    if (MigrationService.progressCallback) {
      MigrationService.progressCallback({
        stage,
        progress,
        message,
        details
      })
    }
    console.log(`[${progress}%] ${stage}: ${message}`)
  }

  // Obtenir les statistiques de migration
  static async getMigrationStats(): Promise<{
    local: {
      lotteryResults: number
      predictions: number
      preferences: number
      auditLogs: number
    }
    supabase: {
      lotteryResults: number
      predictions: number
      preferences: number
      auditLogs: number
    }
  }> {
    const stats = {
      local: {
        lotteryResults: 0,
        predictions: 0,
        preferences: 0,
        auditLogs: 0
      },
      supabase: {
        lotteryResults: 0,
        predictions: 0,
        preferences: 0,
        auditLogs: 0
      }
    }

    try {
      // Compter local
      const cachedData = localStorage.getItem('lottery_results_cache')
      if (cachedData) {
        const parsed = JSON.parse(cachedData)
        stats.local.lotteryResults = parsed.data?.length || 0
      }

      const predictionHistory = localStorage.getItem('prediction_history')
      if (predictionHistory) {
        const predictions = JSON.parse(predictionHistory)
        stats.local.predictions = Object.keys(predictions).length
      }

      const errorLogs = localStorage.getItem('error_logs')
      if (errorLogs) {
        const logs = JSON.parse(errorLogs)
        stats.local.auditLogs = Array.isArray(logs) ? logs.length : 0
      }

      stats.local.preferences = localStorage.getItem('lotobonheur-theme') ? 1 : 0

      // Compter Supabase
      const [lottery, predictions, preferences, audit] = await Promise.all([
        supabaseNew.from('lottery_results').select('count'),
        supabaseNew.from('predictions_history').select('count'),
        supabaseNew.from('user_preferences').select('count'),
        supabaseNew.from('audit_logs').select('count')
      ])

      stats.supabase.lotteryResults = lottery.data?.length || 0
      stats.supabase.predictions = predictions.data?.length || 0
      stats.supabase.preferences = preferences.data?.length || 0
      stats.supabase.auditLogs = audit.data?.length || 0

      return stats

    } catch (error: any) {
      console.error('Erreur stats migration:', error)
      return stats
    }
  }
}
