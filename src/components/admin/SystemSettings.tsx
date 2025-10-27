"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { Settings, Save, RefreshCw, Bell, Lock, Database } from "lucide-react"

export function SystemSettings() {
  const [settings, setSettings] = useState({
    autoSync: true,
    syncInterval: 15,
    enableNotifications: true,
    maintenanceMode: false,
    maxCacheSize: 100,
    sessionTimeout: 30,
  })
  const { toast } = useToast()

  const handleSave = () => {
    toast({
      title: "Paramètres sauvegardés",
      description: "Les paramètres système ont été mis à jour avec succès",
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Paramètres Système</span>
          </CardTitle>
          <CardDescription>Configuration avancée de la plateforme</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Synchronisation */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">Synchronisation</h3>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Synchronisation automatique</Label>
                <p className="text-sm text-muted-foreground">Activer la sync automatique avec l'API externe</p>
              </div>
              <Switch
                checked={settings.autoSync}
                onCheckedChange={(checked) => setSettings({ ...settings, autoSync: checked })}
              />
            </div>

            <div className="space-y-2">
              <Label>Intervalle de synchronisation (minutes)</Label>
              <Input
                type="number"
                value={settings.syncInterval}
                onChange={(e) => setSettings({ ...settings, syncInterval: Number.parseInt(e.target.value) })}
                min={5}
                max={60}
              />
            </div>
          </div>

          {/* Notifications */}
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center space-x-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">Notifications</h3>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Notifications système</Label>
                <p className="text-sm text-muted-foreground">Recevoir des alertes pour les événements importants</p>
              </div>
              <Switch
                checked={settings.enableNotifications}
                onCheckedChange={(checked) => setSettings({ ...settings, enableNotifications: checked })}
              />
            </div>
          </div>

          {/* Sécurité */}
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center space-x-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">Sécurité</h3>
            </div>

            <div className="space-y-2">
              <Label>Timeout de session (minutes)</Label>
              <Input
                type="number"
                value={settings.sessionTimeout}
                onChange={(e) => setSettings({ ...settings, sessionTimeout: Number.parseInt(e.target.value) })}
                min={15}
                max={120}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Mode maintenance</Label>
                <p className="text-sm text-muted-foreground">Désactiver l'accès public à la plateforme</p>
              </div>
              <Switch
                checked={settings.maintenanceMode}
                onCheckedChange={(checked) => setSettings({ ...settings, maintenanceMode: checked })}
              />
            </div>
          </div>

          {/* Cache */}
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center space-x-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">Cache</h3>
            </div>

            <div className="space-y-2">
              <Label>Taille maximale du cache (MB)</Label>
              <Input
                type="number"
                value={settings.maxCacheSize}
                onChange={(e) => setSettings({ ...settings, maxCacheSize: Number.parseInt(e.target.value) })}
                min={50}
                max={500}
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} className="flex items-center space-x-2">
              <Save className="h-4 w-4" />
              <span>Sauvegarder les paramètres</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
