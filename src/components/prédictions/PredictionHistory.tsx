"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { PredictionScoringService } from "@/services/predictionScoringService"
import { NumberBall } from "@/components/ui/NumberBall"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { History, TrendingUp, Trophy, BarChart4, RefreshCw } from "lucide-react"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import type {
  PredictionHistory as PredictionHistoryType,
  AlgorithmPerformance,
} from "@/services/predictionScoringService"

export function PredictionHistory() {
  const [history, setHistory] = useState<Record<string, PredictionHistoryType>>({})
  const [performances, setPerformances] = useState<Record<string, AlgorithmPerformance>>({})
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    loadData()
  }, [refreshKey])

  const loadData = async () => {
    const historyData = PredictionScoringService.getLocalHistory()
    const performanceData = await PredictionScoringService.getAlgorithmPerformances()

    setHistory(historyData)
    setPerformances(performanceData)
  }

  const handleRefresh = async () => {
    await PredictionScoringService.updateAlgorithmPerformances()
    setRefreshKey((prev) => prev + 1)
  }

  const predictions = Object.values(history).sort(
    (a, b) => new Date(b.predictedAt).getTime() - new Date(a.predictedAt).getTime(),
  )

  const validatedPredictions = predictions.filter((p) => p.isValidated && p.score)
  const globalStats = PredictionScoringService.getGlobalStats()

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case "excellent":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
      case "good":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
      case "average":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"
      case "poor":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400"
    }
  }

  const getGradeIcon = (grade: string) => {
    switch (grade) {
      case "excellent":
        return "🏆"
      case "good":
        return "🥈"
      case "average":
        return "🥉"
      case "poor":
        return "📉"
      default:
        return "⚪"
    }
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "improving":
        return "📈"
      case "stable":
        return "➡️"
      case "declining":
        return "📉"
      default:
        return "⚪"
    }
  }

  // Préparer les données pour les graphiques
  const algorithmChartData = Object.values(performances).map((perf) => ({
    name: perf.algorithmName.substring(0, 15) + (perf.algorithmName.length > 15 ? "..." : ""),
    score: perf.averageScore,
    predictions: perf.totalPredictions,
    excellent: perf.excellentCount,
    good: perf.goodCount,
  }))

  const scoreDistributionData = [
    {
      name: "Excellent (85-100)",
      value:
        globalStats.totalValidated > 0 ? validatedPredictions.filter((p) => p.score!.grade === "excellent").length : 0,
      color: "#10b981",
    },
    {
      name: "Bon (70-84)",
      value: globalStats.totalValidated > 0 ? validatedPredictions.filter((p) => p.score!.grade === "good").length : 0,
      color: "#3b82f6",
    },
    {
      name: "Moyen (50-69)",
      value:
        globalStats.totalValidated > 0 ? validatedPredictions.filter((p) => p.score!.grade === "average").length : 0,
      color: "#f59e0b",
    },
    {
      name: "Faible (0-49)",
      value: globalStats.totalValidated > 0 ? validatedPredictions.filter((p) => p.score!.grade === "poor").length : 0,
      color: "#ef4444",
    },
  ]

  const timelineData = validatedPredictions
    .slice(0, 20)
    .reverse()
    .map((pred, index) => ({
      index: index + 1,
      score: pred.score!.totalScore,
      algorithm: pred.algorithm.substring(0, 10),
      date: format(new Date(pred.predictedAt), "dd/MM"),
    }))

  return (
    <div className="space-y-6">
      <Card className="border-2 border-primary/20 shadow-xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-3">
                <div className="relative">
                  <History className="h-6 w-6 text-primary" />
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-green-400 to-blue-400 rounded-full animate-pulse" />
                </div>
                <span>Historique des Prédictions</span>
              </CardTitle>
              <p className="text-muted-foreground mt-1">Suivi automatique et scoring des performances</p>
            </div>
            <Button
              onClick={handleRefresh}
              variant="outline"
              className="hover:scale-105 transition-transform bg-transparent"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Actualiser
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {/* Statistiques globales */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-primary">{globalStats.totalPredictions}</div>
                <div className="text-sm text-muted-foreground">Total Prédictions</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{globalStats.totalValidated}</div>
                <div className="text-sm text-muted-foreground">Validées</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{globalStats.averageScore.toFixed(1)}</div>
                <div className="text-sm text-muted-foreground">Score Moyen</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-purple-600">{Math.round(globalStats.successRate * 100)}%</div>
                <div className="text-sm text-muted-foreground">Taux Succès</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-lg font-bold text-orange-600">{globalStats.topAlgorithm.substring(0, 12)}</div>
                <div className="text-sm text-muted-foreground">Meilleur Algo</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="history" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="history" className="flex items-center space-x-2">
                <History className="h-4 w-4" />
                <span>Historique</span>
              </TabsTrigger>
              <TabsTrigger value="performance" className="flex items-center space-x-2">
                <TrendingUp className="h-4 w-4" />
                <span>Performances</span>
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex items-center space-x-2">
                <BarChart4 className="h-4 w-4" />
                <span>Analytics</span>
              </TabsTrigger>
              <TabsTrigger value="leaderboard" className="flex items-center space-x-2">
                <Trophy className="h-4 w-4" />
                <span>Classement</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="history" className="space-y-4">
              <div className="space-y-3">
                {predictions.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="font-medium mb-2">Aucune prédiction enregistrée</h3>
                      <p className="text-muted-foreground text-sm">
                        Les prédictions sauvegardées apparaîtront ici avec leur scoring automatique
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  predictions.slice(0, 10).map((prediction, index) => (
                    <Card
                      key={prediction.id}
                      className={`transition-all duration-300 hover:shadow-md ${prediction.isValidated ? "border-green-200 dark:border-green-800" : "border-muted"}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center space-x-3">
                              <Badge variant="outline" className="font-medium">
                                {prediction.algorithm}
                              </Badge>
                              <span className="text-sm text-muted-foreground">{prediction.drawName}</span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(prediction.predictedAt), "dd MMM yyyy HH:mm", { locale: fr })}
                              </span>
                            </div>

                            <div className="flex items-center space-x-4">
                              <div className="flex space-x-1">
                                {prediction.predictedNumbers.map((number, i) => (
                                  <NumberBall key={i} number={number} size="xs" />
                                ))}
                              </div>

                              {prediction.actualResult && (
                                <>
                                  <span className="text-muted-foreground">→</span>
                                  <div className="flex space-x-1">
                                    {prediction.actualResult.map((number, i) => (
                                      <NumberBall
                                        key={i}
                                        number={number}
                                        size="xs"
                                        className={
                                          prediction.predictedNumbers.includes(number) ? "ring-2 ring-green-400" : ""
                                        }
                                      />
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>

                            {prediction.colorStrategy && (
                              <div className="flex items-center space-x-2">
                                <Badge variant="secondary" className="text-xs">
                                  Stratégie: {prediction.colorStrategy}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  Confiance: {Math.round(prediction.confidence * 100)}%
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="text-right space-y-2">
                            {prediction.isValidated && prediction.score ? (
                              <>
                                <Badge className={getGradeColor(prediction.score.grade)}>
                                  {getGradeIcon(prediction.score.grade)} {prediction.score.grade.toUpperCase()}
                                </Badge>
                                <div className="text-2xl font-bold text-primary">
                                  {prediction.score.totalScore.toFixed(1)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {prediction.score.scoreBreakdown.exactMatches} correspondances exactes
                                </div>
                              </>
                            ) : (
                              <Badge variant="outline" className="text-yellow-600">
                                ⏳ En attente
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="performance" className="space-y-6">
              {Object.keys(performances).length > 0 ? (
                <div className="space-y-4">
                  {Object.values(performances).map((perf, index) => (
                    <Card
                      key={perf.algorithmName}
                      className={`cursor-pointer transition-all duration-300 hover:shadow-lg ${selectedAlgorithm === perf.algorithmName ? "border-primary shadow-lg" : "hover:border-primary/30"}`}
                      onClick={() =>
                        setSelectedAlgorithm(selectedAlgorithm === perf.algorithmName ? null : perf.algorithmName)
                      }
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center space-x-3">
                              <span className="font-medium">{perf.algorithmName}</span>
                              <Badge className={`${getTrendIcon(perf.trend)} text-xs`}>
                                {getTrendIcon(perf.trend)} {perf.trend}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-4 gap-4 text-sm">
                              <div>
                                <div className="text-lg font-bold text-primary">{perf.totalPredictions}</div>
                                <div className="text-muted-foreground">Prédictions</div>
                              </div>
                              <div>
                                <div className="text-lg font-bold text-green-600">{perf.averageScore.toFixed(1)}</div>
                                <div className="text-muted-foreground">Score Moyen</div>
                              </div>
                              <div>
                                <div className="text-lg font-bold text-blue-600">{perf.excellentCount}</div>
                                <div className="text-muted-foreground">Excellentes</div>
                              </div>
                              <div>
                                <div className="text-lg font-bold text-purple-600">
                                  {Math.round(perf.confidenceAccuracy * 100)}%
                                </div>
                                <div className="text-muted-foreground">Précision</div>
                              </div>
                            </div>
                          </div>

                          <div className="text-right space-y-2">
                            <div className="text-2xl font-bold text-primary">{perf.averageScore.toFixed(1)}</div>
                            <Progress value={(perf.averageScore / 100) * 100} className="w-24 h-2" />
                            <div className="text-xs text-muted-foreground">Performance</div>
                          </div>
                        </div>

                        {selectedAlgorithm === perf.algorithmName && perf.colorStrategyBreakdown && (
                          <div className="mt-4 pt-4 border-t">
                            <h4 className="font-medium mb-2">Performance par Stratégie Couleur:</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              {Object.entries(perf.colorStrategyBreakdown).map(([strategy, score]) => (
                                <div key={strategy} className="text-center p-2 bg-muted/50 rounded">
                                  <div className="text-sm font-medium">{score.toFixed(1)}</div>
                                  <div className="text-xs text-muted-foreground capitalize">{strategy}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-8 text-center">
                    <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="font-medium mb-2">Aucune performance calculée</h3>
                    <p className="text-muted-foreground text-sm">
                      Les performances apparaîtront après validation des prédictions
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="analytics" className="space-y-6">
              {validatedPredictions.length > 0 ? (
                <div className="space-y-6">
                  {/* Graphique performances par algorithme */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Performance par Algorithme</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={algorithmChartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="score" fill="hsl(var(--primary))" name="Score Moyen" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Distribution des scores */}
                  <div className="grid gap-6 lg:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Distribution des Scores</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={scoreDistributionData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                          
