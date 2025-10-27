// Interface de test de connexion et migration - COMPOSANT COMPLET
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MigrationService, type ConnectionTestResult, type MigrationResult, type MigrationProgress } from '@/services/migrationService'
import { useToast } from '@/hooks/use-toast'
import { 
  TestTube, 
  Database, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  Wifi, 
  Shield, 
  Table, 
  Zap, 
  Download, 
  Upload,
  Trash2,
  RotateCcw,
  BarChart3,
  Clock,
  TrendingUp
} from 'lucide-react'

export function MigrationTestInterface() {
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null)
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null)
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null)
  const [verificationResult, setVerificationResult] = useState<any>(null)
  const [migrationStats, setMigrationStats] = useState<any>(null)
  
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [isMigrating, setIsMigrating] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isLoadingStats, setIsLoadingStats] = useState(false)

  const { toast } = useToast()

  // Charger les stats au montage
  useEffect(() => {
    loadMigrationStats()
  }, [])

  const loadMigrationStats = async () => {
    setIsLoadingStats(true)
    try {
      const stats = await MigrationService.getMigrationStats()
      setMigrationStats(stats)
    } catch (error: any) {
      console.error('Erreur chargement stats:', error)
    } finally {
      setIsLoadingStats(false)
    }
  }

  // Test de connexion
  const handleConnectionTest = async () => {
    setIsTestingConnection(true)
    setConnectionResult(null)

    try {
      toast({
        title: '🔍 Test de connexion',
        description: 'Vérification de la connexion Supabase en cours...',
        duration: 3000
      })

      const result = await MigrationService.testConnection()
      setConnectionResult(result)

      if (result.overall) {
        toast({
          title: '✅ Test réussi',
          description: `Connexion Supabase OK (${result.latency}ms)`,
          duration: 4000
        })
      } else {
        toast({
          title: '❌ Test échoué',
          description: `${result.errors.length} erreur(s) détectée(s)`,
          variant: 'destructive',
          duration: 5000
        })
      }

    } catch (error: any) {
      toast({
        title: '❌ Erreur test',
        description: error.message,
        variant: 'destructive'
      })
    } finally {
      setIsTestingConnection(false)
    }
  }

  // Migration des données
  const handleMigration = async () => {
    if (!connectionResult?.overall) {
      toast({
        title: '⚠️ Test de connexion requis',
        description: 'Veuillez d\'abord tester la connexion avec succès',
        variant: 'destructive'
      })
      return
    }

    setIsMigrating(true)
    setMigrationResult(null)
    setMigrationProgress(null)

    try {
      toast({
        title: '🚀 Migration démarrée',
        description: 'Migration des données vers Supabase...',
        duration: 3000
      })

      const result = await MigrationService.migrateAllData((progress) => {
        setMigrationProgress(progress)
      })

      setMigrationResult(result)

      if (result.success) {
        toast({
          title: '✅ Migration réussie',
          description: `${result.totalMigrated} enregistrements migrés en ${(result.duration / 1000).toFixed(1)}s`,
          duration: 5000
        })
        
        // Recharger les stats
        await loadMigrationStats()
      } else {
        toast({
          title: '❌ Migration échouée',
          description: `${result.errors.length} erreur(s) rencontrée(s)`,
          variant: 'destructive',
          duration: 5000
        })
      }

    } catch (error: any) {
      toast({
        title: '❌ Erreur migration',
        description: error.message,
        variant: 'destructive'
      })
    } finally {
      setIsMigrating(false)
      setMigrationProgress(null)
    }
  }

  // Vérification de l'intégrité
  const handleVerification = async () => {
    setIsVerifying(true)
    setVerificationResult(null)

    try {
      toast({
        title: '🔍 Vérification',
        description: 'Vérification de l\'intégrité des données...',
        duration: 3000
      })

      const result = await MigrationService.verifyDataIntegrity()
      setVerificationResult(result)

      if (result.success) {
        toast({
          title: '✅ Vérification réussie',
          description: 'Données intègres et cohérentes',
          duration: 4000
        })
      } else {
        toast({
          title: '⚠️ Problèmes détectés',
          description: 'Certaines vérifications ont échoué',
          variant: 'destructive'
        })
      }

    } catch (error: any) {
      toast({
        title: '❌ Erreur vérification',
        description: error.message,
        variant: 'destructive'
      })
    } finally {
      setIsVerifying(false)
    }
  }

  // Nettoyage des données locales
  const handleCleanup = () => {
    if (confirm('⚠️ Êtes-vous sûr de vouloir nettoyer les données locales ? Une sauvegarde sera créée.')) {
      try {
        MigrationService.cleanupLocalData()
        toast({
          title: '🧹 Nettoyage effectué',
          description: 'Données locales nettoyées avec backup',
          duration: 4000
        })
        loadMigrationStats()
      } catch (error: any) {
        toast({
          title: '❌ Erreur nettoyage',
          description: error.message,
          variant: 'destructive'
        })
      }
    }
  }

  // Restauration depuis backup
  const handleRestore = () => {
    if (confirm('🔄 Restaurer les données depuis les backups locaux ?')) {
      try {
        const success = MigrationService.restoreFromBackup()
        if (success) {
          toast({
            title: '✅ Restauration réussie',
            description: 'Données restaurées depuis les backups',
            duration: 4000
          })
          loadMigrationStats()
        } else {
          toast({
            title: '⚠️ Restauration partielle',
            description: 'Certains backups non disponibles',
            variant: 'destructive'
          })
        }
      } catch (error: any) {
        toast({
          title: '❌ Erreur restauration',
          description: error.message,
          variant: 'destructive'
        })
      }
    }
  }

  const getStatusIcon = (status: boolean) => {
    return status ? (
      <CheckCircle className="h-4 w-4 text-green-600" />
    ) : (
      <AlertTriangle className="h-4 w-4 text-red-600" />
    )
  }

  const getStatusBadge = (status: boolean, label: string) => {
    return (
      <Badge 
        variant={status ? 'default' : 'destructive'}
        className={status ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' : ''}
      >
        {getStatusIcon(status)}
        <span className="ml-1">{label}</span>
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="border-2 border-primary/20 shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center space-x-3">
            <div className="relative">
              <TestTube className="h-6 w-6 text-primary" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-green-400 to-blue-400 rounded-full animate-pulse" />
            </div>
            <span>Test de Connexion & Migration</span>
          </CardTitle>
          <p className="text-muted-foreground">
            Interface complète pour tester Supabase et migrer vos données existantes
          </p>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="connection" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="connection" className="flex items-center space-x-2">
                <Wifi className="h-4 w-4" />
                <span>Connexion</span>
              </TabsTrigger>
              <TabsTrigger value="migration" className="flex items-center space-x-2">
                <Upload className="h-4 w-4" />
                <span>Migration</span>
              </TabsTrigger>
              <TabsTrigger value="verification" className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4" />
                <span>Vérification</span>
              </TabsTrigger>
              <TabsTrigger value="management" className="flex items-center space-x-2">
                <Database className="h-4 w-4" />
                <span>Gestion</span>
              </TabsTrigger>
            </TabsList>

            {/* Onglet Test de Connexion */}
            <TabsContent value="connection" className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Test de Connexion Supabase</h3>
                <Button 
                  onClick={handleConnectionTest} 
                  disabled={isTestingConnection}
                  className="hover:scale-105 transition-transform"
                >
                  {isTestingConnection ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <TestTube className="h-4 w-4 mr-2" />
                  )}
                  {isTestingConnection ? 'Test en cours...' : 'Tester la Connexion'}
                </Button>
              </div>

              {connectionResult && (
                <div className="space-y-4">
                  {/* Résultat global */}
                  <Alert className={connectionResult.overall ? 'border-green-200 bg-green-50 dark:bg-green-900/20' : 'border-red-200 bg-red-50 dark:bg-red-900/20'}>
                    {getStatusIcon(connectionResult.overall)}
                    <AlertDescription className="ml-2">
                      <strong>Test {connectionResult.overall ? 'RÉUSSI' : 'ÉCHOUÉ'}</strong> - 
                      Latence: {connectionResult.latency}ms
                    </AlertDescription>
                  </Alert>

                  {/* Détails des tests */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Wifi className="h-4 w-4" />
                            <span className="text-sm font-medium">Connexion</span>
                          </div>
                          {getStatusBadge(connectionResult.details.connection, connectionResult.details.connection ? 'OK' : 'Échec')}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Shield className="h-4 w-4" />
                            <span className="text-sm font-medium">Authentification</span>
                          </div>
                          {getStatusBadge(connectionResult.details.authentication, connectionResult.details.authentication ? 'OK' : 'Échec')}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Database className="h-4 w-4" />
                            <span className="text-sm font-medium">Permissions</span>
                          </div>
                          {getStatusBadge(connectionResult.details.permissions, connectionResult.details.permissions ? 'OK' : 'Échec')}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Table className="h-4 w-4" />
                            <span className="text-sm font-medium">Tables</span>
                          </div>
                          {getStatusBadge(connectionResult.details.tables, connectionResult.details.tables ? 'OK' : 'Échec')}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Zap className="h-4 w-4" />
                            <span className="text-sm font-medium">Fonctions</span>
                          </div>
                          {getStatusBadge(connectionResult.details.functions, connectionResult.details.functions ? 'OK' : 'N/A')}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Erreurs détaillées */}
                  {connectionResult.errors.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg text-red-600">Erreurs Détectées</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {connectionResult.errors.map((error, index) => (
                            <div key={index} className="p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                              <code className="text-sm text-red-800 dark:text-red-400">{error}</code>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Onglet Migration */}
            <TabsContent value="migration" className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Migration des Données</h3>
                <Button 
                  onClick={handleMigration} 
                  disabled={isMigrating || !connectionResult?.overall}
                  className="hover:scale-105 transition-transform"
                >
                  {isMigrating ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {isMigrating ? 'Migration...' : 'Démarrer Migration'}
                </Button>
              </div>

              {/* Prérequis */}
              {!connectionResult?.overall && (
                <Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Veuillez d'abord réussir le test de connexion avant de migrer les données.
                  </AlertDescription>
                </Alert>
              )}

              {/* Statistiques avant migration */}
              {migrationStats && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Aperçu des Données</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-medium mb-3 text-blue-600">📱 Données Locales</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm">Résultats Loterie:</span>
                            <Badge variant="outline">{migrationStats.local.lotteryResults}</Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm">Prédictions:</span>
                            <Badge variant="outline">{migrationStats.local.predictions}</Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm">Préférences:</span>
                            <Badge variant="outline">{migrationStats.local.preferences}</Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm">Logs Audit:</span>
                            <Badge variant="outline">{migrationStats.local.auditLogs}</Badge>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-3 text-green-600">☁️ Données Supabase</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm">Résultats Loterie:</span>
                            <Badge variant="outline">{migrationStats.supabase.lotteryResults}</Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm">Prédictions:</span>
                            <Badge variant="outline">{migrationStats.supabase.predictions}</Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm">Préférences:</span>
                            <Badge variant="outline">{migrationStats.supabase.preferences}</Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm">Logs Audit:</span>
                            <Badge variant="outline">{migrationStats.supabase.auditLogs}</Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Progrès de migration */}
              {migrationProgress && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Progrès de Migration</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{migrationProgress.message}</span>
                        <span className="text-sm text-muted-foreground">{migrationProgress.progress}%</span>
                      </div>
                      <Progress value={migrationProgress.progress} className="h-3" />
                      <div className="text-xs text-muted-foreground">
                        Étape: {migrationProgress.stage}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Résultat de migration */}
              {migrationResult && (
                <Card>
                  <CardHeader>
                    <CardTitle className={`text-lg ${migrationResult.success ? 'text-green-600' : 'text-red-600'}`}>
                      Résultat de Migration
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <Alert className={migrationResult.success ? 'border-green-200 bg-green-50 dark:bg-green-900/20' : 'border-red-200 bg-red-50 dark:bg-red-900/20'}>
                        {getStatusIcon(migrationResult.success)}
                        <AlertDescription className="ml-2">
                          <strong>Migration {migrationResult.success ? 'RÉUSSIE' : 'ÉCHOUÉE'}</strong> - 
                          {migrationResult.totalMigrated} enregistrements migrés en {(migrationResult.duration / 1000).toFixed(1)}s
                        </AlertDescription>
                      </Alert>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-3 bg-muted/50 rounded-lg">
                          <div className="text-lg font-bold text-primary">{migrationResult.summary.lotteryResults}</div>
                          <div className="text-sm text-muted-foreground">Résultats Loterie</div>
                        </div>
                        <div className="text-center p-3 bg-muted/50 rounded-lg">
                          <div className="text-lg font-bold text-primary">{migrationResult.summary.predictions}</div>
                          <div className="text-sm text-muted-foreground">Prédictions</div>
                        </div>
                        <div className="text-center p-3 bg-muted/50 rounded-lg">
                          <div className="text-lg font-bold text-primary">{migrationResult.summary.preferences}</div>
                          <div className="text-sm text-muted-foreground">Préférences</div>
                        </div>
                        <div className="text-center p-3 bg-muted/50 rounded-lg">
                          <div className="text-lg font-bold text-primary">{migrationResult.summary.auditLogs}</div>
                          <div className="text-sm text-muted-foreground">Logs Audit</div>
                        </div>
                      </div>

                      {migrationResult.errors.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-medium text-red-600">Erreurs de Migration:</h4>
                          {migrationResult.errors.map((error, index) => (
                            <div key={index} className="p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                              <code className="text-sm text-red-800 dark:text-red-400">{error}</code>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Onglet Vérification */}
            <TabsContent value="verification" className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Vérification d'Intégrité</h3>
                <Button 
                  onClick={handleVerification} 
                  disabled={isVerifying}
                  className="hover:scale-105 transition-transform"
                >
                  {isVerifying ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  {isVerifying ? 'Vérification...' : 'Vérifier Intégrité'}
                </Button>
              </div>

              {verificationResult && (
                <div className="space-y-4">
                  <Alert className={verificationResult.success ? 'border-green-200 bg-green-50 dark:bg-green-900/20' : 'border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20'}>
                    {getStatusIcon(verificationResult.success)}
                    <AlertDescription className="ml-2">
                      <strong>Vérification {verificationResult.success ? 'RÉUSSIE' : 'PARTIELLE'}</strong> - 
                      Intégrité des données {verificationResult.success ? 'confirmée' : 'nécessite attention'}
                    </AlertDescription>
                  </Alert>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Résultats Loterie</span>
                          {getStatusBadge(verificationResult.checks.lotteryResults, verificationResult.checks.lotteryResults ? 'OK' : 'Erreur')}
                        </div>
                        {verificationResult.details.lotteryCount !== undefined && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {verificationResult.details.lotteryCount} enregistrements
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Prédictions</span>
                          {getStatusBadge(verificationResult.checks.predictions, verificationResult.checks.predictions ? 'OK' : 'Erreur')}
                        </div>
                        {verificationResult.details.predictionCount !== undefined && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {verificationResult.details.predictionCount} enregistrements
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Préférences</span>
                          {getStatusBadge(verificationResult.checks.preferences, verificationResult.checks.preferences ? 'OK' : 'Erreur')}
                        </div>
                        {verificationResult.details.preferencesCount !== undefined && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {verificationResult.details.preferencesCount} enregistrements
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Logs Audit</span>
                          {getStatusBadge(verificationResult.checks.auditLogs, verificationResult.checks.auditLogs ? 'OK' : 'Erreur')}
                        </div>
                        {verificationResult.details.auditCount !== undefined && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {verificationResult.details.auditCount} enregistrements
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Relations</span>
                          {getStatusBadge(verificationResult.checks.relationships, verificationResult.checks.relationships ? 'OK' : 'Erreur')}
                        </div>
                        {verificationResult.details.relationsCount !== undefined && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {verificationResult.details.relationsCount} relations testées
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Onglet Gestion */}
            <TabsContent value="management" className="space-y-6">
              <h3 className="text-lg font-medium">Gestion des Données</h3>
              
              <div className="grid gap-4 md:grid-cols-2">
                {/* Actions de nettoyage */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center space-x-2">
                      <Trash2 className="h-5 w-5 text-orange-600" />
                      <span>Nettoyage Local</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Nettoie les données locales après migration réussie. Une sauvegarde sera créée automatiquement.
                    </p>
                    <Button onClick={handleCleanup} variant="outline" className="w-full">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Nettoyer Données Locales
                    </Button>
                  </CardContent>
                </Card>

                {/* Actions de restauration */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center space-x-2">
                      <RotateCcw className="h-5 w-5 text-blue-600" />
                      <span>Restauration</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Restaure les données depuis les sauvegardes locales en cas de problème.
                    </p>
                    <Button onClick={handleRestore} variant="outline" className="w-full">
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Restaurer depuis Backup
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Statistiques de migration */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center space-x-2">
                    <BarChart3 className="h-5 w-5" />
                    <span>Statistiques Migration</span>
                    <Button onClick={loadMigrationStats} size="sm" variant="outline" disabled={isLoadingStats}>
                      {isLoadingStats ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {migrationStats ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-4 gap-4">
                        <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                          <div className="text-2xl font-bold text-blue-600">
                            {migrationStats.local.lotteryResults + migrationStats.local.predictions + migrationStats.local.preferences + migrationStats.local.auditLogs}
                          </div>
                          <div className="text-sm text-muted-foreground">Total Local</div>
                        </div>
                        <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                          <div className="text-2xl font-bold text-green-600">
                            {migrationStats.supabase.lotteryResults + migrationStats.supabase.predictions + migrationStats.supabase.preferences + migrationStats.supabase.auditLogs}
                          </div>
                          <div className="text-sm text-muted-foreground">Total Supabase</div>
                        </div>
                        <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                          <div className="text-2xl font-bold text-purple-600">
                            {Math.round((migrationStats.supabase.lotteryResults + migrationStats.supabase.predictions + migrationStats.supabase.preferences + migrationStats.supabase.auditLogs) / Math.max(1, migrationStats.local.lotteryResults + migrationStats.local.predictions + migrationStats.local.preferences + migrationStats.local.auditLogs) * 100)}%
                          </div>
                          <div className="text-sm text-muted-foreground">Migré</div>
                        </div>
                        <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                          <div className="text-2xl font-bold text-orange-600">
                            <Clock className="h-6 w-6 mx-auto" />
                          </div>
                          <div className="text-sm text-muted-foreground">En Temps Réel</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">Chargement des statistiques...</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
