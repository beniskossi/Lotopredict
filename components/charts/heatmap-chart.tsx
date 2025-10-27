"use client"

import { useMemo } from "react"
import type { DrawResult } from "@/lib/types"
import { getNumberColorClass } from "@/lib/utils/number-colors"

interface HeatmapChartProps {
  results: DrawResult[]
}

export function HeatmapChart({ results }: HeatmapChartProps) {
  // Calculate co-occurrence matrix
  const coOccurrenceMatrix = useMemo(() => {
    const matrix: number[][] = Array.from({ length: 90 }, () => Array(90).fill(0))

    results.forEach((result) => {
      const numbers = result.winning_numbers
      for (let i = 0; i < numbers.length; i++) {
        for (let j = i + 1; j < numbers.length; j++) {
          const num1 = numbers[i] - 1
          const num2 = numbers[j] - 1
          matrix[num1][num2]++
          matrix[num2][num1]++
        }
      }
    })

    return matrix
  }, [results])

  // Find max value for normalization
  const maxValue = useMemo(() => {
    return Math.max(...coOccurrenceMatrix.flat())
  }, [coOccurrenceMatrix])

  // Get top pairs
  const topPairs = useMemo(() => {
    const pairs: { num1: number; num2: number; count: number }[] = []

    for (let i = 0; i < 90; i++) {
      for (let j = i + 1; j < 90; j++) {
        if (coOccurrenceMatrix[i][j] > 0) {
          pairs.push({
            num1: i + 1,
            num2: j + 1,
            count: coOccurrenceMatrix[i][j],
          })
        }
      }
    }

    return pairs.sort((a, b) => b.count - a.count).slice(0, 20)
  }, [coOccurrenceMatrix])

  return (
    <div className="space-y-6">
      {/* Top pairs list */}
      <div>
        <h3 className="text-sm font-medium mb-3">Top 20 des paires les plus fréquentes</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {topPairs.map((pair, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-muted-foreground w-6">#{idx + 1}</span>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${getNumberColorClass(pair.num1)}`}
                  >
                    {pair.num1}
                  </div>
                  <span className="text-muted-foreground">+</span>
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${getNumberColorClass(pair.num2)}`}
                  >
                    {pair.num2}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-primary">{pair.count}</p>
                <p className="text-xs text-muted-foreground">fois</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Visual heatmap (simplified - showing top 30 numbers) */}
      <div>
        <h3 className="text-sm font-medium mb-3">Matrice de co-occurrence (30 premiers numéros)</h3>
        <div className="overflow-x-auto">
          <div
            className="inline-grid gap-px bg-border p-px rounded-lg"
            style={{ gridTemplateColumns: "repeat(31, 1fr)" }}
          >
            {/* Header row */}
            <div className="bg-muted p-1" />
            {Array.from({ length: 30 }, (_, i) => (
              <div key={i} className="bg-muted p-1 text-center text-xs font-medium">
                {i + 1}
              </div>
            ))}

            {/* Data rows */}
            {Array.from({ length: 30 }, (_, i) => (
              <>
                <div key={`label-${i}`} className="bg-muted p-1 text-center text-xs font-medium">
                  {i + 1}
                </div>
                {Array.from({ length: 30 }, (_, j) => {
                  const value = coOccurrenceMatrix[i][j]
                  const intensity = maxValue > 0 ? value / maxValue : 0
                  return (
                    <div
                      key={`cell-${i}-${j}`}
                      className="bg-card p-1 text-center text-xs"
                      style={{
                        backgroundColor: `hsl(var(--primary) / ${intensity * 0.8})`,
                      }}
                      title={`${i + 1} & ${j + 1}: ${value} fois`}
                    >
                      {value > 0 ? value : ""}
                    </div>
                  )
                })}
              </>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
