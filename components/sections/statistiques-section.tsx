"use client"

import { useMemo, useState } from "react"
import { useDrawResults } from "@/hooks/use-sync"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { NumberBall } from "@/components/number-ball"
import { BarChart3, TrendingDown, TrendingUp, Activity } from "lucide-react"
import { FrequencyChart } from "@/components/charts/frequency-chart"
import { HeatmapChart } from "@/components/charts/heatmap-chart"
import type { NumberFrequency } from "@/lib/types"
import { differenceInDays } from "date-fns"

interface StatistiquesSectionProps {
  drawName: string
}

export function StatistiquesSection({ drawName }: StatistiquesSectionProps) {
  const { results, loading } = useDrawResults(drawName)
  const [period, setPeriod] = useState<"all" | "30" | "90" | "180">("all")

  // Filter results by period
  const filteredResults = useMemo(() => {
    if (period === "all") return results

    const days = Number.parseInt(period)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    return results.filter((r) => new Date(r.draw_date) >= cutoffDate)
  }, [results, period])

  // Calculate number frequencies
  const frequencies = useMemo(() => {
    const freqMap = new Map<number, { count: number; lastSeen: string | null }>()

    // Initialize all numbers
    for (let i = 1; i <= 90; i++) {
      freqMap.set(i, { count: 0, lastSeen: null })
    }

    // Count occurrences
    filteredResults.forEach((result) => {
      result.winning_numbers.forEach((num) => {
        const current = freqMap.get(num)!
        freqMap.set(num, {
          count: current.count + 1,
          lastSeen: !current.lastSeen || result.draw_date > current.lastSeen ? result.draw_date : current.lastSeen,
        })
      })
    })

    const now = new Date()
    const frequencies: NumberFrequency[] = Array.from(freqMap.entries()).map(([num, data]) => ({
      number: num,
      frequency: data.count,
      lastSeen: data.lastSeen,
      daysSinceLastSeen: data.lastSeen ? differenceInDays(now, new Date(data.lastSeen)) : 999,
    }))

    return frequencies
  }, [filteredResults])

  // Get top and bottom numbers
  const topNumbers = useMemo(() => {
    return [...frequencies].sort((a, b) => b.frequency - a.frequency).slice(0, 10)
  }, [frequencies])

  const bottomNumbers = useMemo(() => {
    return [...frequencies].sort((a, b) => a.frequency - b.frequency).slice(0, 10)
  }, [frequencies])

  const overdueNumbers = useMemo(() => {
    return [...frequencies]
      .filter((f) => f.lastSeen !== null)
      .sort((a, b) => b.daysSinceLastSeen - a.daysSinceLastSeen)
      .slice(0, 10)
  }, [frequencies])

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">Chargement...</CardContent>
      </Card>
    )
  }

  if (filteredResults.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Aucune donnée disponible pour cette période
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtres</CardTitle>
          <CardDescription>Sélectionnez une période pour analyser les statistiques</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Label htmlFor="period" className="min-w-fit">
              Période
            </Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
              <SelectTrigger id="period" className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tout l'historique</SelectItem>
                <SelectItem value="30">30 derniers jours</SelectItem>
                <SelectItem value="90">90 derniers jours</SelectItem>
                <SelectItem value="180">180 derniers jours</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              {filteredResults.length} tirage{filteredResults.length > 1 ? "s" : ""}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Frequency chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Fréquence des numéros
          </CardTitle>
          <CardDescription>Distribution des apparitions de chaque numéro</CardDescription>
        </CardHeader>
        <CardContent>
          <FrequencyChart data={frequencies} />
        </CardContent>
      </Card>

      {/* Top numbers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            Numéros les plus fréquents
          </CardTitle>
          <CardDescription>Top 10 des numéros qui sortent le plus souvent</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {topNumbers.map((freq, idx) => (
              <div key={freq.number} className="flex flex-col items-center gap-2 p-3 border rounded-lg">
                <span className="text-xs font-medium text-muted-foreground">#{idx + 1}</span>
                <NumberBall number={freq.number} size="md" />
                <div className="text-center">
                  <p className="text-lg font-bold text-primary">{freq.frequency}</p>
                  <p className="text-xs text-muted-foreground">apparitions</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bottom numbers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-red-600" />
            Numéros les moins fréquents
          </CardTitle>
          <CardDescription>Top 10 des numéros qui sortent le moins souvent</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {bottomNumbers.map((freq, idx) => (
              <div key={freq.number} className="flex flex-col items-center gap-2 p-3 border rounded-lg">
                <span className="text-xs font-medium text-muted-foreground">#{idx + 1}</span>
                <NumberBall number={freq.number} size="md" />
                <div className="text-center">
                  <p className="text-lg font-bold text-destructive">{freq.frequency}</p>
                  <p className="text-xs text-muted-foreground">apparitions</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Overdue numbers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-orange-600" />
            Numéros en retard
          </CardTitle>
          <CardDescription>Numéros qui n'ont pas été tirés depuis le plus longtemps</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {overdueNumbers.map((freq) => (
              <div key={freq.number} className="flex flex-col items-center gap-2 p-3 border rounded-lg">
                <NumberBall number={freq.number} size="md" />
                <div className="text-center">
                  <p className="text-lg font-bold text-orange-600">{freq.daysSinceLastSeen}</p>
                  <p className="text-xs text-muted-foreground">jours</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Carte thermique des co-occurrences</CardTitle>
          <CardDescription>Visualisation des numéros qui apparaissent fréquemment ensemble</CardDescription>
        </CardHeader>
        <CardContent>
          <HeatmapChart results={filteredResults} />
        </CardContent>
      </Card>
    </div>
  )
}
