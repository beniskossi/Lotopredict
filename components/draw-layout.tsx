"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { SyncStatus } from "@/components/sync-status"
import { DonneesSection } from "@/components/sections/donnees-section"
import { ConsulterSection } from "@/components/sections/consulter-section"
import { StatistiquesSection } from "@/components/sections/statistiques-section"
import { PredictionSection } from "@/components/sections/prediction-section"

interface DrawLayoutProps {
  drawName: string
}

export function DrawLayout({ drawName }: DrawLayoutProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("donnees")

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => router.push("/tirages")}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Retour
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{drawName}</h1>
                <p className="text-sm text-muted-foreground">Analyse et statistiques du tirage</p>
              </div>
            </div>
            <SyncStatus />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="donnees">Données</TabsTrigger>
              <TabsTrigger value="consulter">Consulter</TabsTrigger>
              <TabsTrigger value="statistiques">Statistiques</TabsTrigger>
              <TabsTrigger value="prediction">Prédiction</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsContent value="donnees" className="mt-0">
            <DonneesSection drawName={drawName} />
          </TabsContent>

          <TabsContent value="consulter" className="mt-0">
            <ConsulterSection drawName={drawName} />
          </TabsContent>

          <TabsContent value="statistiques" className="mt-0">
            <StatistiquesSection drawName={drawName} />
          </TabsContent>

          <TabsContent value="prediction" className="mt-0">
            <PredictionSection drawName={drawName} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
