import { DrawSelector } from "@/components/draw-selector"
import { SyncStatus } from "@/components/sync-status"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function TiragesPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Loterie PWA</h1>
              <p className="text-sm text-muted-foreground">Analyse et prédictions des tirages</p>
            </div>
            <SyncStatus />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Sélectionner un tirage</CardTitle>
            <CardDescription>
              Choisissez un jour et un tirage pour consulter les données et statistiques
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DrawSelector />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
