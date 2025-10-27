// Interface de contrôle pour la synchronisation en arrière-plan
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { backgroundSync } from '@/services/backgroundSyncManager'
import { CompressionService } from '@/services/compressionService'
import { SYNC_STRATEGIES } from '@/config/backgroundSync'
import { 
  Activity, 
  Settings, 
  Cloud, 
  Zap, 
  Database, 
  FileArchive, 
  AlertTriangle,
  CheckCircle,
  Clock,
  Wifi,
  WifiOff,
  BarChart3,
  TrendingUp,
  RefreshCw
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export function BackgroundSyncControl() {
  const [status, setStatus] = useState(backgroundSync.getStatus())
  const [compressionStats, setCompressionStats] = useState(CompressionService.getStats())
  const [conflicts, setConflicts] = useState(backgroundSync.getConflicts())
  const [refreshKey, setRefreshKey] = useState(0)
  const { toast } = useToast()

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(backgroundSync.getStatus())
      setCompressionStats(CompressionService.getStats())
      setConflicts(backgroundSync.getConflicts())
    }, 2000)

    return () => clearInterval(interval)
  }, [refreshKey])

  const handleStrategyChange = (strategyKey: string) => {
    try {
      backgroundSync.setStrategy(strategyKey as keyof typeof SYNC_STRATEGIES)
      toast({
        title: '✅ Stratégie mise à jour',
        description: `Synchronisation configurée: ${SYNC_STRATEGIES[strategyKey as keyof typeof SYNC_STRATEGIES].name}`,
        duration: 3000
      })
    } catch (error) {
      toast({
        title: '❌ Erreur',
        description: 'Impossible de changer la stratégie de synchronisation',
        variant: 'destructive'
      })
    }
  }

  const handleForceSync = async () => {
    try {
      const success = await backgroundSync.forceSync()
      if (success) {
        toast({
          title: '🔄 Synchronisation lancée',
          description: 'Synchronisation manuelle en cours...',
          duration: 3000
        })
      } else {
        throw new Error('Échec synchronisation')
      }
    } catch (error) {
      toast({
        title: '❌ Erreur de synchronisation',
        description: 'Impossible de lancer la synchronisation manuelle',
        variant: 'destructive'
      })
    }
  }

  const handleToggleSync = (enabled: boolean) => {
    try {
      backgroundSync.updateConfig({ enableBackgroundSync: enabled })
      toast({
        title: enabled ? '▶️ Synchronisation activée' : '⏸️ Synchronisation désactivée',
        description: enabled ? 'La synchronisation automatique est maintenant active' : 'La synchronisation automatique est désactivée',
        duration: 3000
      })
    } catch (error) {
      toast({
        title: '❌ Erreur',
        description: 'Impossible de modifier la configuration',
        variant: 'destructive'
      })
    }
  }

  const handleToggleCompression = (enabled: boolean) => {
    try {
      backgroundSync.updateConfig({ compressionEnabled: enabled })
      toast({
        title: enabled ? '🗜️ Compression activée' : '📦 Compression désactivée',
        description: enabled ? 'Les données seront compressées avant synchronisation' : 'Les données seront synchronisées sans compression',
        duration: 3000
      })
    } catch (error) {
      toast({
        title: '❌ Erreur',
        description: 'Impossible de modifier la configuration de compression',
        variant: 'destructive'
      })
    }
  }

  const handleCompressionLevelChange = (level: number[]) => {
    try {
      backgroundSync.updateConfig({ compressionLevel: level[0] })
    } catch (error) {
      console.error('Erreur changement niveau compression:', error)
    }
  }

  const handleBatchSizeChange = (size: number[]) => {
    try {
      backgroundSync.updateConfig({ batchSize: size[0] })
    } catch (error) {
      console.error('Erreur changement taille lot:', error)
    }
  }

  const handleClearConflicts = () => {
    try {
      backgroundSync.clearResolvedConflicts()
      setConflicts(backgroundSync.getConflicts())
      toast({
        title: '🧹 Conflits nettoyés',
        description: 'Les conflits résolus ont été supprimés',
        duration: 2000
      })
    } catch (error) {
      toast({
        title: '❌ Erreur',
        description: 'Impossible de nettoyer les conflits',
        variant: 'destructive'
      })
    }
  }

  const getStatusColor = (isActive: boolean, isOnline: boolean) => {
    if (!isOnline) return 'text-red-600'
    if (isActive) return 'text-green-600'
    return 'text-yellow-600'
  }

  const getStatusIcon = (isActive: boolean, isOnline: boolean, syncInProgress: boolean) => {
    if (syncInProgress) return <RefreshCw className="h-4 w-4 animate-spin" />
    if (!isOnline) return <WifiOff className="h-4 w-4" />
    if (isActive) return <CheckCircle className="h-4 w-4" />
    return <AlertTriangle className="h-4 w-4" />
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}min`
  }

  return (
    <div className="space-y-6">
      <Card className="border-2 border-primary/20 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center space-x-3">
            <div className="relative">
              <Activity className="h-6 w-6 text-primary" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-green-400 to-blue-400 rounded-full animate-pulse" />
            </div>
            <span>Synchronisation en Arrière-plan</span>
          </CardTitle>
          <p className="text-muted-foreground">Contrôle avancé de la synchronisation automatique avec compression</p>
        </CardHeader>

        <CardContent>
          {/* Statut général */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center space-x-2 mb-2">
                  {getStatusIcon(status.isActive, status.isOnline, status.syncInProgress)}
                  <span className={`font-medium ${getStatusColor(status.isActive, status.isOnline)}`}>
                    {status.syncInProgress ? 'En cours' : status.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">Synchronisation</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-primary">{status.queueSize}</div>
                <div className="text-sm text-muted-foreground">En file</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{status.metrics.successfulSyncs}</div>
                <div className="text-sm text-muted-foreground">Réussies</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{formatBytes(status.metrics.dataTransferred)}</div>
                <div className="text-sm text-muted-foreground">Transférées</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="control" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="control" className="flex items-center space-x-2">
                <Settings className="h-4 w-4" />
                <span>Contrôle</span>
              </TabsTrigger>
              <TabsTrigger value="compression" className="flex items-center space-x-2">
                <FileArchive className="h-4 w-4" />
                <span>Compression</span>
              </TabsTrigger>
              <TabsTrigger value="metrics" className="flex items-center space-x-2">
                <BarChart3 className="h-4 w-4" />
                <span>Métriques</span>
              </TabsTrigger>
              <TabsTrigger value="conflicts" className="flex items-center space-x-2">
                <AlertTriangle className="h-4 w-4" />
                <span>Conflits</span>
                {conflicts.filter(c => !c.resolved).length > 0 && (
                  <Badge variant="destructive" className="ml-1">
                    {conflicts.filter(c => !c.resolved).length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="control" className="space-y-6">
              {/* Contrôles principaux */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Synchronisation automatique</Label>
                    <p className="text-sm text-muted-foreground">Active la synchronisation en arrière-plan</p>
                  </div>
                  <Switch
                    checked={status.isActive}
                    onCheckedChange={handleToggleSync}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Stratégie de synchronisation</Label>
                  <Select onValueChange={handleStrategyChange} defaultValue="regular">
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir une stratégie" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SYNC_STRATEGIES).map(([key, strategy]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex flex-col">
                            <span>{strategy.name}</span>
                            <span className="text-xs text-muted-foreground">{strategy.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex space-x-2">
                  <Button onClick={handleForceSync} disabled={!status.isOnline || status.syncInProgress}>
                    <Cloud className="h-4 w-4 mr-2" />
                    Synchroniser maintenant
                  </Button>
                  <Button variant="outline" onClick={() => setRefreshKey(prev => prev + 1)}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Actualiser
                  </Button>
                </div>
              </div>

              {/* Informations de synchronisation */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Stratégie actuelle:</span>
                  <Badge variant="outline">{status.currentStrategy}</Badge>
                </div>
                
                {status.lastSync && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Dernière synchronisation:</span>
                    <span className="text-sm text-muted-foreground">
                      {format(status.lastSync, 'dd/MM/yyyy HH:mm:ss', { locale: fr })}
                    </span>
                  </div>
                )}

                {status.nextSync && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Prochaine synchronisation:</span>
                    <span className="text-sm text-muted-foreground">
                      {format(status.nextSync, 'dd/MM/yyyy HH:mm:ss', { locale: fr })}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Connexion réseau:</span>
                  <div className="flex items-center space-x-2">
                    {status.isOnline ? <Wifi className="h-4 w-4 text-green-600" /> : <WifiOff className="h-4 w-4 text-red-600" />}
                    <span className={`text-sm ${status.isOnline ? 'text-green-600' : 'text-red-600'}`}>
                      {status.isOnline ? 'En ligne' : 'Hors ligne'}
                    </span>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="compression" className="space-y-6">
              {/* Configuration compression */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Compression des données</Label>
                    <p className="text-sm text-muted-foreground">Compresse les données avant synchronisation</p>
                  </div>
                  <Switch
                    checked={compressionStats.totalCompressions > 0}
                    onCheckedChange={handleToggleCompression}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Niveau de compression (1-9)</Label>
                  <Slider
                    value={[6]}
                    onValueChange={handleCompressionLevelChange}
                    max={9}
                    min={1}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Rapide</span>
                    <span>Optimal</span>
                    <span>Maximum</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Taille des lots (1-100)</Label>
                  <Slider
                    value={[50]}
                    onValueChange={handleBatchSizeChange}
                    max={100}
                    min={1}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Petit</span>
                    <span>Moyen</span>
                    <span>Grand</span>
                  </div>
                </div>
              </div>

              {/* Statistiques de compression */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600">{compressionStats.totalCompressions}</div>
                    <div className="text-sm text-muted-foreground">Compressions</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {(compressionStats.averageCompressionRatio * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted-foreground">Ratio moyen</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {formatBytes(compressionStats.totalOriginalSize)}
                    </div>
                    <div className="text-sm text-muted-foreground">Taille originale</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {formatBytes(compressionStats.totalCompressedSize)}
                    </div>
                    <div className="text-sm text-muted-foreground">Taille compressée</div>
                  </CardContent>
                </Card>
              </div>

              {compressionStats.totalCompressions > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Économie d'espace:</span>
                    <span className="text-sm font-bold text-green-600">
                      {formatBytes(compressionStats.totalOriginalSize - compressionStats.totalCompressedSize)}
                    </span>
                  </div>
                  <Progress 
                    value={(1 - compressionStats.averageCompressionRatio) * 100} 
                    className="h-3"
                  />
                  <div className="text-xs text-muted-foreground text-center">
                    Temps moyen de compression: {formatDuration(compressionStats.averageCompressionTime)}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="metrics" className="space-y-6">
              {/* Métriques détaillées */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center space-x-2">
                      <TrendingUp className="h-5 w-5" />
                      <span>Performance</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm">Synchronisations totales:</span>
                      <span className="font-medium">{status.metrics.totalSyncs}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Taux de réussite:</span>
                      <span className="font-medium text-green-600">
                        {status.metrics.totalSyncs > 0 
                          ? `${Math.round((status.metrics.successfulSyncs / status.metrics.totalSyncs) * 100)}%`
                          : '0%'
                        }
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Temps moyen:</span>
                      <span className="font-medium">{formatDuration(status.metrics.averageSyncTime)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Utilisation réseau:</span>
                      <span className="font-medium">{status.metrics.networkUsage.toFixed(2)} MB</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center space-x-2">
                      <Database className="h-5 w-5" />
                      <span>Impact Système</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm">Impact batterie:</span>
                      <Badge className={
                        status.metrics.batteryImpact === 'low' ? 'bg-green-100 text-green-800' :
                        status.metrics.batteryImpact === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }>
                        {status.metrics.batteryImpact === 'low' ? 'Faible' :
                         status.metrics.batteryImpact === 'medium' ? 'Moyen' : 'Élevé'}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Ratio compression:</span>
                      <span className="font-medium text-blue-600">
                        {(status.metrics.compressionRatio * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Données transférées:</span>
                      <span className="font-medium">{formatBytes(status.metrics.dataTransferred)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Échecs:</span>
                      <span className="font-medium text-red-600">{status.metrics.failedSyncs}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="conflicts" className="space-y-4">
              {/* Gestion des conflits */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Conflits de synchronisation</h4>
                  <p className="text-sm text-muted-foreground">
                    {conflicts.length} conflit(s) détecté(s), {conflicts.filter(c => !c.resolved).length} non résolu(s)
                  </p>
                </div>
                {conflicts.filter(c => c.resolved).length > 0 && (
                  <Button variant="outline" onClick={handleClearConflicts}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Nettoyer résolus
                  </Button>
                )}
              </div>

              {conflicts.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                    <h3 className="font-medium mb-2">Aucun conflit détecté</h3>
                    <p className="text-muted-foreground text-sm">
                      Toutes les synchronisations se sont déroulées sans conflit
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {conflicts.map((conflict, index) => (
                    <Card key={conflict.id} className={`border-l-4 ${conflict.resolved ? 'border-l-green-500 bg-green-50/50' : 'border-l-red-500 bg-red-50/50'}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-sm">Conflit #{index + 1}</span>
                              <Badge variant={conflict.resolved ? "default" : "destructive"}>
                                {conflict.resolved ? 'Résolu' : 'Non résolu'}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {conflict.conflictType.replace('_', ' ')}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {format(conflict.timestamp, 'dd/MM/yyyy HH:mm:ss', { locale: fr })}
                            </p>
                          </div>
                          {!conflict.resolved && (
                            <Button size="sm" variant="outline">
                              <Settings className="h-4 w-4 mr-2" />
                              Résoudre
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
