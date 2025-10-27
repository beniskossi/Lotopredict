"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"
import { BarChart3, Users, Database, TrendingUp, Activity } from "lucide-react"

interface SystemStats {
  total_users: number
  total_results: number
  total_predictions: number
  total_audit_logs: number
  total_admins: number
  last_result_date: string | null
  last_prediction_date: string | null
}

export function SystemStatistics() {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStatistics()
  }, [])

  const loadStatistics = async () => {
    try {
      setLoading(true)
      const supabase = createClient()

      // Charger les statistiques depuis différentes tables
      const [resultsCount, predictionsCount, auditCount] = await Promise.all([
        supabase.from("lottery_results").select("*", { count: "exact", head: true }),
        supabase.from("predictions_history").select("*", { count: "exact", head: true }),
        supabase.from("audit_logs").select("*", { count: "exact", head: true }),
      ])

      setStats({
        total_users: 0, // Nécessite Admin API
        total_results: resultsCount.count || 0,
        total_predictions: predictionsCount.count || 0,
        total_audit_logs: auditCount.count || 0,
        total_admins: 1,
        last_result_date: null,
        last_prediction_date: null,
      })
    } catch (error) {
      console.error("Erreur chargement statistiques:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">Chargement des statistiques...</div>
        </CardContent>
      </Card>
    )
  }

  const statCards = [
    {
      title: "Résultats de Loterie",
      value: stats?.total_results || 0,
      icon: Database,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Prédictions Générées",
      value: stats?.total_predictions || 0,
      icon: TrendingUp,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Logs d'Audit",
      value: stats?.total_audit_logs || 0,
      icon: Activity,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      title: "Administrateurs",
      value: stats?.total_admins || 0,
      icon: Users,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>Statistiques Système</span>
          </CardTitle>
          <CardDescription>Vue d'ensemble des données et de l'activité de la plateforme</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                  <p className="text-3xl font-bold mt-2">{stat.value.toLocaleString("fr-FR")}</p>
                </div>
                <div className={`${stat.bgColor} p-3 rounded-lg`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
