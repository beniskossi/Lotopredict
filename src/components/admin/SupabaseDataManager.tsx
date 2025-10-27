"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { LotteryResultsService, AuditService } from "@/services/supabaseClient"
import { IntegratedLotteryService } from "@/services/lotteryApiIntegrated"
import { useSupabase } from "@/contexts/SupabaseContext"
import { Database, Cloud, RefreshCw, Download, Upload, CheckCircle, AlertTriangle, Wifi } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export function SupabaseDataManager() {
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle")
  const [syncProgress, setSyncProgress] = useState(0)
  const [stats, setStats] = useState({
    supabaseCount: 0,
    localCount: 0,
    lastSync: null as Date | null,
  })
  const { user, connectionStatus } = useSupabase()
  const { toast } = useToast()

  // Charger les statistiques au montage
  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      // Compter les enregistrements Supabase
      const supabaseResults = await LotteryResultsService.getAllResults()

      // Obtenir le statut de synchronisation
      const syncStat = IntegratedLotteryService.getSyncStatus()

      setStats({
        supabaseCount: supabaseResults.length,
        localCount: syncStat.hasLocalData ? 1 : 0,
        lastSync: syncStat.lastSync,
      })
    } catch (error) {
      console.error("Erreur lors du chargement des stats:", error)
    }
  }

  const handleSyncFromAPI = async () => {
    setSyncStatus("syncing")
    setSyncProgress(0)

    try {
      // Démarrer la synchronisation
      setSyncProgress(20)
      const result = await IntegratedLotteryService.forceSyncWithExternalAPI()
      setSyncProgress(80)

      // Mettre à jour les stats
      await loadStats()
      setSyncProgress(100)

      // Logger l'activité
      if (user) {
        await AuditService.addLog({
          user_id: user.id,
          action: "SYNC_API_TO_SUPABASE",
          table_name: "lottery_results",
          new_data: result.stats,
        })
      }

      setSyncStatus("success")
      toast({
        title: "✅ Synchronisation réussie",
        description: `${result.stats.inserted} ajoutés, ${result.stats.updated} mis à jour`,
      })
    } catch (error) {
      console.error("Erreur de synchronisation:", error)
      setSyncStatus("error")
      toast({
        title: "❌ Erreur de synchronisation",
        description: "Impossible de synchroniser avec l'API externe",
        variant: "destructive",
      })
    }
  }

  const handleExportSupabase = async () => {
    try {
      const results = await LotteryResultsService.getAllResults()

      const exportData = {
        exported_at: new Date().toISOString(),
        total_records: results.length,
        data: results,
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `supabase_export_${new Date().toISOString().split("T")[0]}.json`
      link.click()
      URL.revokeObjectURL(url)

      // Logger l'activité
      if (user) {
        await AuditService.addLog({
          user_id: user.id,
          action: "EXPORT_SUPABASE",
          table_name: "lottery_results",
          new_data: { records_exported: results.length },
        })
      }

      toast({
        title: "✅ Export réussi",
        description: `${results.length} enregistrements exportés`,
      })
    } catch (error) {
      console.error("Erreur d'export:", error)
      toast({
        title: "❌ Erreur d'export",
        description: "Impossible d'exporter les données",
        variant: "destructive",
      })
    }
  }

  const testConnectivity = async () => {
    try {
      const connectivity = await IntegratedLotteryService.checkConnectivity()

      toast({
        title: "🔍 Test de connectivité",
        description: `Supabase: ${connectivity.supabase ? "✅" : "❌"} | API externe: ${connectivity.external ? "✅" : "❌"}`,
      })
    } catch (error) {
      toast({
        title: "❌ Erreur de test",
        description: "Impossible de tester la connectivité",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Statut de connexion */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Database className="h-5 w-5" />
            <span>Gestion Supabase</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold">{stats.supabaseCount}</div>
              <div className="text-sm text-muted-foreground">Enregistrements Supabase</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="flex items-center justify-center space-x-2">
                <Wifi className={`h-4 w-4 ${connectionStatus === "connected" ? "text-green-500" : "text-red-500"}`} />
                <Badge variant={connectionStatus === "connected" ? "default" : "destructive"}>
                  {connectionStatus === "connected" ? "Connecté" : "Déconnecté"}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground mt-1">Statut Supabase</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-sm font-medium">{stats.lastSync ? stats.lastSync.toLocaleString() : "Jamais"}</div>
              <div className="text-sm text-muted-foreground">Dernière sync</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions de synchronisation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <RefreshCw className="h-5 w-5" />
            <span>Synchronisation des Données</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {syncStatus === "syncing" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Synchronisation en cours...</span>
                <span>{syncProgress}%</span>
              </div>
              <Progress value={syncProgress} className="h-2" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Button
              onClick={handleSyncFromAPI}
              disabled={syncStatus === "syncing" || connectionStatus !== "connected"}
              className="w-full"
            >
              <Cloud className="h-4 w-4 mr-2" />
              Sync API → Supabase
            </Button>

            <Button onClick={testConnectivity} variant="outline" className="w-full bg-transparent">
              <Wifi className="h-4 w-4 mr-2" />
              Test Connectivité
            </Button>
          </div>

          {syncStatus === "success" && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>Synchronisation terminée avec succès</AlertDescription>
            </Alert>
          )}

          {syncStatus === "error" && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>Erreur lors de la synchronisation. Vérifiez votre connexion.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Outils d'export/import */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Download className="h-5 w-5" />
            <span>Outils d'Export/Import</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Button
              onClick={handleExportSupabase}
              variant="outline"
              disabled={connectionStatus !== "connected"}
              className="w-full bg-transparent"
            >
              <Download className="h-4 w-4 mr-2" />
              Exporter Supabase
            </Button>

            <Button variant="outline" disabled className="w-full bg-transparent">
              <Upload className="h-4 w-4 mr-2" />
              Importer (Bientôt)
            </Button>
          </div>

          <Alert>
            <Database className="h-4 w-4" />
            <AlertDescription>
              Les données sont automatiquement sauvegardées sur Supabase avec chiffrement et sauvegardes automatiques.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}
