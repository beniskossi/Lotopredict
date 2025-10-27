"use client"

import { useState, useMemo } from "react"
import { useDrawResults } from "@/hooks/use-sync"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { NumberBall } from "@/components/number-ball"
import { Search, TrendingUp } from "lucide-react"
import type { NumberAssociation } from "@/lib/types"

interface ConsulterSectionProps {
  drawName: string
}

export function ConsulterSection({ drawName }: ConsulterSectionProps) {
  const { results, loading } = useDrawResults(drawName)
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null)

  // Calculate number associations
  const associations = useMemo(() => {
    if (!selectedNumber || results.length === 0) return []

    const assocMap = new Map<number, { sameDraw: number; nextDraw: number }>()

    results.forEach((result, idx) => {
      const hasNumber = result.winning_numbers.includes(selectedNumber)

      if (hasNumber) {
        // Count co-occurrences in same draw
        result.winning_numbers.forEach((num) => {
          if (num !== selectedNumber) {
            const current = assocMap.get(num) || { sameDraw: 0, nextDraw: 0 }
            assocMap.set(num, { ...current, sameDraw: current.sameDraw + 1 })
          }
        })

        // Count occurrences in next draw
        if (idx > 0) {
          const nextResult = results[idx - 1] // Results are sorted desc by date
          nextResult.winning_numbers.forEach((num) => {
            const current = assocMap.get(num) || { sameDraw: 0, nextDraw: 0 }
            assocMap.set(num, { ...current, nextDraw: current.nextDraw + 1 })
          })
        }
      }
    })

    const associations: NumberAssociation[] = Array.from(assocMap.entries())
      .map(([num, counts]) => ({
        number: num,
        associatedWith: selectedNumber,
        frequency: counts.sameDraw + counts.nextDraw,
        inSameDraw: counts.sameDraw,
        inNextDraw: counts.nextDraw,
      }))
      .sort((a, b) => b.frequency - a.frequency)

    return associations
  }, [selectedNumber, results])

  // Calculate frequency of selected number
  const numberFrequency = useMemo(() => {
    if (!selectedNumber) return 0
    return results.filter((r) => r.winning_numbers.includes(selectedNumber)).length
  }, [selectedNumber, results])

  const handleNumberSelect = (num: number) => {
    setSelectedNumber(num === selectedNumber ? null : num)
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">Chargement...</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Number selector */}
      <Card>
        <CardHeader>
          <CardTitle>Sélectionner un numéro</CardTitle>
          <CardDescription>Choisissez un numéro pour voir ses associations et sa régularité</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-9 gap-2">
            {Array.from({ length: 90 }, (_, i) => i + 1).map((num) => (
              <button
                key={num}
                onClick={() => handleNumberSelect(num)}
                className={`transition-all ${selectedNumber === num ? "scale-110 ring-2 ring-primary ring-offset-2" : ""}`}
              >
                <NumberBall number={num} size="sm" />
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {selectedNumber && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                Régularité du numéro {selectedNumber}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <span className="text-sm font-medium">Fréquence d'apparition</span>
                  <span className="text-2xl font-bold text-primary">
                    {numberFrequency} / {results.length}
                  </span>
                </div>
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <span className="text-sm font-medium">Taux d'apparition</span>
                  <span className="text-2xl font-bold text-primary">
                    {results.length > 0 ? ((numberFrequency / results.length) * 100).toFixed(1) : 0}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Numéros associés prédictifs
              </CardTitle>
              <CardDescription>Numéros qui apparaissent fréquemment avec ou après le {selectedNumber}</CardDescription>
            </CardHeader>
            <CardContent>
              {associations.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">Aucune association trouvée pour ce numéro</p>
              ) : (
                <div className="space-y-3">
                  {associations.slice(0, 15).map((assoc) => (
                    <div
                      key={assoc.number}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <NumberBall number={assoc.number} size="sm" />
                        <div className="text-sm">
                          <p className="font-medium">Numéro {assoc.number}</p>
                          <p className="text-muted-foreground">
                            {assoc.inSameDraw} fois dans le même tirage, {assoc.inNextDraw} fois dans le suivant
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-primary">{assoc.frequency}</p>
                        <p className="text-xs text-muted-foreground">occurrences</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
