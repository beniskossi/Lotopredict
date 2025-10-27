"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { DRAW_SCHEDULES } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Clock } from "lucide-react"

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]

export function DrawSelector() {
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const router = useRouter()

  const drawsByDay = DAYS.map((day) => ({
    day,
    draws: DRAW_SCHEDULES.filter((d) => d.day_of_week === day),
  }))

  const handleDrawSelect = (drawName: string) => {
    router.push(`/tirages/${encodeURIComponent(drawName)}`)
  }

  return (
    <div className="space-y-6">
      {/* Day selector */}
      <div className="flex flex-wrap gap-2">
        {DAYS.map((day) => (
          <Button
            key={day}
            variant={selectedDay === day ? "default" : "outline"}
            onClick={() => setSelectedDay(selectedDay === day ? null : day)}
            className="flex-1 min-w-[120px]"
          >
            {day}
          </Button>
        ))}
      </div>

      {/* Draw list */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {drawsByDay
          .filter((item) => !selectedDay || item.day === selectedDay)
          .map((item) =>
            item.draws.map((draw) => (
              <Card
                key={draw.id}
                className="cursor-pointer transition-all hover:shadow-lg hover:border-primary"
                onClick={() => handleDrawSelect(draw.draw_name)}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{draw.draw_name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>
                      {draw.day_of_week} à {draw.time}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )),
          )}
      </div>
    </div>
  )
}
