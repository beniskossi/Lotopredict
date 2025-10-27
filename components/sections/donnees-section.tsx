"use client"

import { useDrawResults } from "@/hooks/use-sync"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberBall } from "@/components/number-ball"
import { Calendar, Download, RefreshCw } from "lucide-react"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { useState } from "react"
import { fetchResultsFromAPI } from "@/lib/api/fetch-results"
import { syncManager } from "@/lib/sync/sync-manager"

interface DonneesSectionProps {
  drawName: string
}

export function DonneesSection({ drawName }: DonneesSectionProps) {
  const { results, loading, refresh } = useDrawResults(drawName)
  const [isFetching, setIsFetching] = useState(false)
  const [fetchMonth, setFetchMonth] = useState(new Date().getMonth() + 1)
  const [fetchYear, setFetchYear] = useState(new Date().getFullYear())

  const handleFetchFromAPI = async () => {
    setIsFetching(true)
    try {
      await fetchResultsFromAPI(fetchMonth, fetchYear)
      await syncManager.syncFromCloud()
      refresh()
    } catch (error) {
      console.error("[v0] Error fetching from API:", error)
    } finally {
      setIsFetching(false)
    }
  }

  const handleExport = () => {
    const dataStr = JSON.stringify(results, null, 2)
    const dataBlob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${drawName}_${new Date().toISOString().split("T")[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Chargement des données...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Fetch controls */}
      <Card>
        <CardHeader>
          <CardTitle>Récupérer les données</CardTitle>
          <CardDescription>Importer les résultats depuis l'API externe</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[120px]">
              <Label htmlFor="month">Mois</Label>
              <Input
                id="month"
                type="number"
                min="1"
                max="12"
                value={fetchMonth}
                onChange={(e) => setFetchMonth(Number.parseInt(e.target.value))}
              />
            </div>
            <div className="flex-1 min-w-[120px]">
              <Label htmlFor="year">Année</Label>
              <Input
                id="year"
                type="number"
                min="2020"
                max="2030"
                value={fetchYear}
                onChange={(e) => setFetchYear(Number.parseInt(e.target.value))}
              />
            </div>
            <Button onClick={handleFetchFromAPI} disabled={isFetching}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              {isFetching ? "Récupération..." : "Récupérer"}
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={results.length === 0}>
              <Download className="w-4 h-4 mr-2" />
              Exporter JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results display */}
      <Card>
        <CardHeader>
          <CardTitle>Historique des tirages</CardTitle>
          <CardDescription>
            {results.length} résultat{results.length > 1 ? "s" : ""} disponible{results.length > 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>Aucun résultat disponible pour ce tirage.</p>
              <p className="text-sm mt-2">Utilisez le bouton "Récupérer" ci-dessus pour importer les données.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {results.map((result) => (
                <Card key={result.id} className="border-l-4 border-l-primary">
                  <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Calendar className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="font-semibold">
                            {format(new Date(result.draw_date), "EEEE d MMMM yyyy", { locale: fr })}
                          </p>
                          <p className="text-sm text-muted-foreground">{result.draw_name}</p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">Numéros Gagnants</p>
                          <div className="flex flex-wrap gap-2">
                            {result.winning_numbers.map((num, idx) => (
                              <NumberBall key={idx} number={num} size="md" />
                            ))}
                          </div>
                        </div>

                        {result.machine_numbers && result.machine_numbers.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-muted-foreground mb-2">Numéros Machine</p>
                            <div className="flex flex-wrap gap-2">
                              {result.machine_numbers.map((num, idx) => (
                                <NumberBall key={idx} number={num} size="md" />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
