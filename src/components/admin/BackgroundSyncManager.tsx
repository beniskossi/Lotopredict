// Gestionnaire interface pour la synchronisation en arrière-plan
import {useState} from 'react'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Button} from '@/components/ui/button'
import {Badge} from '@/components/ui/badge'
import {Progress} from '@/components/ui/progress'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {Switch} from '@/components/ui/switch'
import {Slider} from '@/components/ui/slider'
import {Alert, AlertDescription} from '@/components/ui/alert'
import {useBackgroundSync} from '@/hooks/useBackgroundSync'
import {ActivityIcon, PlayCircle, PauseCircle, RefreshCw, Trash2, Settings, BarChart3, Zap, Database, Clock, Package} from 'lucide-react'

export function BackgroundSyncManager() {
 const {
  isRunning,
  queueSize,
  stats,
  queue,
  isOnline,
  startSync,
  stopSync,
  forceSync,
  cleanup,
  updateConfig,
  updateStats
 } = useBackgroundSync()

 const [localConfig, setLocalConfig] = useState(stats.config)

 const handleConfigChange = (key: string, value: any) => {
  const newConfig = {...localConfig, [key]: value}
  setLocalConfig(newConfig)
  updateConfig(newConfig)
 }

 const getQueueItemIcon = (type: string) => {
  switch (type) {
   case 'CREATE':
    return '➕'
   case 'UPDATE':
    return '✏️'
   case 'DELETE':
    return '🗑️'
   case 'BULK_INSERT':
    return '📦'
   default:
    return '📄'
  }
 }

 const getPriorityColor = (priority: number) => {
  if (priority >= 3) return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
  if (priority >= 2) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
  return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
 }

 const getPriorityLabel = (priority: number) => {
  if (priority >= 3) return 'Haute'
  if (priority >= 2) return 'Normale'
  return 'Basse'
 }

 const formatInterval = (ms: number) => {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}min`
 }

 return (
  <div className="space-y-6">
   <Card className="border-2 border-primary/20 shadow-xl">
    <CardHeader>
     <div className="flex items-center justify-between">
      <div>
       <CardTitle className="flex items-center space-x-3">
        <div className="relative">
         <ActivityIcon className="h-6 w-6 text-primary" />
         {isRunning && <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse" />}
        </div>
        <span>Synchronisation en Arrière-Plan</span>
       </CardTitle>
       <p className="text-muted-foreground mt-1">Gestion avancée avec compression et optimisations</p>
      </div>
      <div className="flex items-center space-x-2">
       <Badge variant={isOnline ? 'default' : 'destructive'}>
        <Database className="h-3 w-3 mr-1" />
        {isOnline ? 'En ligne' : 'Hors ligne'}
       </Badge>
       <Badge variant={isRunning ? 'default' : 'secondary'}>
        {isRunning ? '🔄 Actif' : '⏸️ Inactif'}
       </Badge>
      </div>
     </div>
    </CardHeader>

    <CardContent>
     {/* Statut et contrôles principaux */}
     <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <Card>
       <CardContent className="p-4 text-center">
        <div className="text-2xl font-bold text-primary">{stats.queueSize}</div>
        <div className="text-sm text-muted-foreground">En attente</div>
       </CardContent>
      </Card>
      <Card>
       <CardContent className="p-4 text-center">
        <div className="text-2xl font-bold text-green-600">{stats.totalProcessed}</div>
        <div className="text-sm text-muted-foreground">Traités</div>
       </CardContent>
      </Card>
      <Card>
       <CardContent className="p-4 text-center">
        <div className="text-2xl font-bold text-red-600">{stats.failedItems}</div>
        <div className="text-sm text-muted-foreground">Échecs</div>
       </CardContent>
      </Card>
      <Card>
       <CardContent className="p-4 text-center">
        <div className="text-lg font-bold text-blue-600">{stats.compressionEnabled ? 'ON' : 'OFF'}</div>
        <div className="text-sm text-muted-foreground">Compression</div>
       </CardContent>
      </Card>
     </div>

     {/* Contrôles */}
     <div className="flex flex-wrap gap-3 mb-6">
      <Button 
       onClick={isRunning ? stopSync : startSync} 
       className={`${isRunning ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'} text-white`}
      >
       {isRunning ? <PauseCircle className="h-4 w-4 mr-2" /> : <PlayCircle className="h-4 w-4 mr-2" />}
       {isRunning ? 'Arrêter' : 'Démarrer'}
      </Button>

      <Button onClick={forceSync} variant="outline" disabled={!isOnline || queueSize === 0}>
       <Zap className="h-4 w-4 mr-2" />
       Forcer Sync
      </Button>

      <Button onClick={updateStats} variant="outline">
       <RefreshCw className="h-4 w-4 mr-2" />
       Actualiser
      </Button>

      <Button onClick={cleanup} variant="outline" className="text-red-600 hover:bg-red-50">
       <Trash2 className="h-4 w-4 mr-2" />
       Nettoyer
      </Button>
     </div>

     {/* Alert status */}
     {!isOnline && (
      <Alert className="mb-6 border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20">
       <Database className="h-4 w-4" />
       <AlertDescription>
        Mode hors ligne - Les éléments seront synchronisés dès que la connexion sera rétablie
       </AlertDescription>
      </Alert>
     )}

     <Tabs defaultValue="queue" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
       <TabsTrigger value="queue" className="flex items-center space-x-2">
        <Package className="h-4 w-4" />
        <span>Queue ({queueSize})</span>
       </TabsTrigger>
       <TabsTrigger value="config" className="flex items-center space-x-2">
        <Settings className="h-4 w-4" />
        <span>Configuration</span>
       </TabsTrigger>
       <TabsTrigger value="analytics" className="flex items-center space-x-2">
        <BarChart3 className="h-4 w-4" />
        <span>Analytics</span>
       </TabsTrigger>
      </TabsList>

      <TabsContent value="queue" className="space-y-4">
       {queue.length === 0 ? (
        <Card>
         <CardContent className="p-8 text-center">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-medium mb-2">Queue vide</h3>
          <p className="text-muted-foreground text-sm">Aucun élément en attente de synchronisation</p>
         </CardContent>
        </Card>
       ) : (
        <div className="space-y-3">
         {queue.slice(0, 10).map((item, index) => (
          <Card key={item.id} className="transition-all duration-300 hover:shadow-md">
           <CardContent className="p-4">
            <div className="flex items-center justify-between">
             <div className="space-y-2 flex-1">
              <div className="flex items-center space-x-3">
               <span className="text-lg">{getQueueItemIcon(item.type)}</span>
               <Badge variant="outline" className="font-medium">
                {item.type}
               </Badge>
               <Badge className={getPriorityColor(item.priority)}>
                {getPriorityLabel(item.priority)}
               </Badge>
               {item.compressed && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                 📦 Compressé
                </Badge>
               )}
              </div>
              <div className="text-sm text-muted-foreground">
               Créé: {item.timestamp.toLocaleString()} • Tentatives: {item.retries}
              </div>
             </div>
             <div className="text-right">
              <div className="text-xs text-muted-foreground">#{index + 1}</div>
             </div>
            </div>
           </CardContent>
          </Card>
         ))}
         
         {queue.length > 10 && (
          <Card>
           <CardContent className="p-4 text-center">
            <p className="text-muted-foreground">
             ... et {queue.length - 10} autre(s) élément(s)
            </p>
           </CardContent>
          </Card>
         )}
        </div>
       )}
      </TabsContent>

      <TabsContent value="config" className="space-y-6">
       <div className="grid gap-6 md:grid-cols-2">
        <Card>
         <CardHeader>
          <CardTitle className="text-lg">Paramètres Généraux</CardTitle>
         </CardHeader>
         <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
           <div>
            <div className="font-medium">Synchronisation activée</div>
            <div className="text-sm text-muted-foreground">Activer/désactiver la sync automatique</div>
           </div>
           <Switch
            checked={localConfig.enabled}
            onCheckedChange={value => handleConfigChange('enabled', value)}
           />
          </div>

          <div className="flex items-center justify-between">
           <div>
            <div className="font-medium">Compression des données</div>
            <div className="text-sm text-muted-foreground">Réduire la taille des données transmises</div>
           </div>
           <Switch
            checked={localConfig.compressionEnabled}
            onCheckedChange={value => handleConfigChange('compressionEnabled', value)}
           />
          </div>
         </CardContent>
        </Card>

        <Card>
         <CardHeader>
          <CardTitle className="text-lg">Performance</CardTitle>
         </CardHeader>
         <CardContent className="space-y-6">
          <div>
           <div className="flex justify-between items-center mb-2">
            <div className="font-medium">Intervalle de synchronisation</div>
            <span className="text-sm text-muted-foreground">{formatInterval(localConfig.interval)}</span>
           </div>
           <Slider
            value={[localConfig.interval]}
            onValueChange={([value]) => handleConfigChange('interval', value)}
            min={5000}
            max={300000}
            step={5000}
            className="w-full"
           />
           <div className="flex justify-between text-xs text-muted-foreground">
            <span>5s</span>
            <span>5min</span>
           </div>
          </div>

          <div>
           <div className="flex justify-between items-center mb-2">
            <div className="font-medium">Taille des lots</div>
            <span className="text-sm text-muted-foreground">{localConfig.batchSize} éléments</span>
           </div>
           <Slider
            value={[localConfig.batchSize]}
            onValueChange={([value]) => handleConfigChange('batchSize', value)}
            min={1}
            max={50}
            step={1}
            className="w-full"
           />
           <div className="flex justify-between text-xs text-muted-foreground">
            <span>1</span>
            <span>50</span>
           </div>
          </div>

          <div>
           <div className="flex justify-between items-center mb-2">
            <div className="font-medium">Tentatives maximum</div>
            <span className="text-sm text-muted-foreground">{localConfig.maxRetries} fois</span>
           </div>
           <Slider
            value={[localConfig.maxRetries]}
            onValueChange={([value]) => handleConfigChange('maxRetries', value)}
            min={1}
            max={10}
            step={1}
            className="w-full"
           />
           <div className="flex justify-between text-xs text-muted-foreground">
            <span>1</span>
            <span>10</span>
           </div>
          </div>
         </CardContent>
        </Card>
       </div>
      </TabsContent>

      <TabsContent value="analytics" className="space-y-6">
       <div className="grid gap-6 md:grid-cols-2">
        <Card>
         <CardHeader>
          <CardTitle className="text-lg">Métriques de Performance</CardTitle>
         </CardHeader>
         <CardContent className="space-y-4">
          <div className="space-y-3">
           <div className="flex justify-between">
            <span className="text-sm">Éléments en queue:</span>
            <span className="font-medium">{stats.queueSize}</span>
           </div>
           <div className="flex justify-between">
            <span className="text-sm">Total traités:</span>
            <span className="font-medium text-green-600">{stats.totalProcessed}</span>
           </div>
           <div className="flex justify-between">
            <span className="text-sm">Échecs:</span>
            <span className="font-medium text-red-600">{stats.failedItems}</span>
           </div>
           <div className="flex justify-between">
            <span className="text-sm">Taux de réussite:</span>
            <span className="font-medium text-blue-600">
             {stats.totalProcessed > 0 ? Math.round(((stats.totalProcessed / (stats.totalProcessed + stats.failedItems)) * 100)) : 0}%
            </span>
           </div>
          </div>
         </CardContent>
        </Card>

        <Card>
         <CardHeader>
          <CardTitle className="text-lg">État du Système</CardTitle>
         </CardHeader>
         <CardContent className="space-y-4">
          <div className="space-y-3">
           <div className="flex items-center justify-between">
            <span className="text-sm">Synchronisation:</span>
            <Badge variant={isRunning ? 'default' : 'secondary'}>
             {isRunning ? '🔄 Active' : '⏸️ Suspendue'}
            </Badge>
           </div>
           <div className="flex items-center justify-between">
            <span className="text-sm">Connexion:</span>
            <Badge variant={isOnline ? 'default' : 'destructive'}>
             {isOnline ? '🌐 En ligne' : '📴 Hors ligne'}
            </Badge>
           </div>
           <div className="flex items-center justify-between">
            <span className="text-sm">Compression:</span>
            <Badge variant={stats.compressionEnabled ? 'default' : 'secondary'}>
             {stats.compressionEnabled ? '📦 Activée' : '📄 Désactivée'}
            </Badge>
           </div>
           <div className="flex items-center justify-between">
            <span className="text-sm">Intervalle:</span>
            <span className="text-sm font-medium">{formatInterval(localConfig.interval)}</span>
           </div>
          </div>
         </CardContent>
        </Card>
       </div>
      </TabsContent>
     </Tabs>
    </CardContent>
   </Card>
  </div>
 )
}
