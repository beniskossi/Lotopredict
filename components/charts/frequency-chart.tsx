"use client"

import { useMemo } from "react"
import type { NumberFrequency } from "@/lib/types"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"

interface FrequencyChartProps {
  data: NumberFrequency[]
}

export function FrequencyChart({ data }: FrequencyChartProps) {
  const chartData = useMemo(() => {
    return data
      .map((d) => ({
        number: d.number,
        frequency: d.frequency,
      }))
      .sort((a, b) => a.number - b.number)
  }, [data])

  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="number"
          className="text-xs"
          tick={{ fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(value) => (value % 10 === 0 ? value : "")}
        />
        <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
          labelStyle={{ color: "hsl(var(--foreground))" }}
        />
        <Bar dataKey="frequency" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
