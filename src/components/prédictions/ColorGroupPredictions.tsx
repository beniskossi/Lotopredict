"use client"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { fetchLotteryResults } from "@/services/lotteryApi"
import { ColorGroupPredictor } from "@/algorithms/colorGroupPredictions"
import { PredictionScoringService } from "@/services/predictionScoringService"
import { NumberBall } from "@/components/ui/NumberBall"
import { Palette, Target, TrendingUp, Zap, BarChart4, Sparkles, Save, Eye } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { ColorGroupPrediction } from "@/algorithms/colorGroupPredictions"

interface ColorGroupPredictionsProps {
  drawName: string
}

export function ColorGroupPredictions({ drawName }: ColorGroupPredictionsProps) {
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null)
  const [savedPredictions, setSavedPredictions] = useState<string[]>([])
  const { toast } = useToast()

  const { data: allResults, isLoading } = useQuery({
    queryKey: ["lottery-results"],
    queryFn: () => fetchLotteryResults(),
  })

  const results = allResults?.filter((r) => r.draw_name === drawName) || []
  const predictions = ColorGroupPredictor.generateAllColorPredictions(results, drawName)
  const analysis = results.length > 0 ? ColorGroupPredictor.analyzeColorDistribution(results) : null
  const recommendation = results.length > 0 ? ColorGroupPredictor.getStrategyRecommendation(results) : null

  const handleSavePrediction = async (prediction: ColorGroupPrediction) => {
    try {
      const predictionId = await PredictionScoringService.savePrediction(
        prediction.algorithm,
        drawName,
        prediction.numbers,
        prediction.confidence,
        prediction.colorStrategy,
        prediction.groupDistribution,
      )

      setSavedPredictions((prev) => [...prev, predictionId])

      toast({
        title: "💾 Prédiction sauvegardée",
        description: `${prediction.algorithm} enregistrée pour suivi automatique`,
        duration: 3000,
      })
    } catch (error) {
      toast({
        title: "❌ Erreur de sauvegarde",
        description: "Impossible de sauvegarder la prédiction",
        variant: "destructive",
      })
    }
  }

  const getStrategyIcon = (strategy: string) => {
    switch (strategy) {
      case "balanced":
        return <BarChart4 className="h-4 w-4" />
      case "momentum":
        return <TrendingUp className="h-4 w-4" />
      case "correlation":
        return <Target className="h-4 w-4" />
      case "hybrid":
        return <Sparkles className="h-4 w-4" />
      default:
        return <Palette className="h-4 w-4" />
    }
  }

  const getStrategyColor = (strategy: string) => {
    switch (strategy) {
      case "balanced":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
      case "momentum":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
      case "correlation":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400"
      case "hybrid":
        return "bg-gradient-to-r from-orange-100 to-yellow-100 text-orange-800 dark:from-orange-900/20 dark:to-yellow-900/20 dark:text-orange-400"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400"
    }
  }

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "low":
        return "text-green-600 dark:text-green-400"
      case "medium":
        return "text-yellow-600 dark:text-yellow-400"
      case "high":
        return "text-red-600 dark:text-red-400"
      default:
        return "text-gray-600 dark:text-gray-400"
    }
  }

  if (isLoading) {
    return (
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <CardTitle>Prédictions par Groupes de Couleurs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-32 bg-muted/50 rounded-lg" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="border-2 border-primary/20 shadow-xl bg-gradient-to-br from-background to-muted/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-3">
                <div className="relative">
                  <Palette className="h-6 w-6 text-primary animate-pulse" />
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-red-400 via-yellow-400 to-blue-400 rounded-full animate-spin" />
                </div>
                <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  Prédictions par Groupes de Couleurs
                </span>
              </CardTitle>
              <p className="text-muted-foreground mt-2">
                Stratégies spécialisées basées sur l'analyse des groupes colorés
              </p>
            </div>
            {recommendation && (
              <div className="text-right">
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                  <Zap className="h-3 w-3 mr-1" />
                  Recommandé: {recommendation.recommended}
                </Badge>
                <div className="text-xs text-muted-foreground mt-1">
                  Confiance: {Math.round(recommendation.confidence * 100)}%
                </div>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {/* Statistiques d'analyse */}
          {analysis && (
            <div className="mb-6 p-4 bg-gradient-to-r from-muted/30 to-muted/50 rounded-xl border">
              <h4 className="font-medium mb-3 flex items-center space-x-2">
                <BarChart4 className="h-4 w-4" />
                <span>Analyse des Groupes de Couleurs</span>
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-lg font-bold text-primary">{analysis.balanceScore.toFixed(1)}</div>
                  <div className="text-muted-foreground">Score Équilibre</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-primary">{analysis.hotGroups.length}</div>
                  <div className="text-muted-foreground">Groupes Chauds</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-primary">{analysis.coldGroups.length}</div>
                  <div className="text-muted-foreground">Groupes Froids</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-primary">
                    {Object.values(analysis.trends).filter((t) => t === "rising").length}
                  </div>
                  <div className="text-muted-foreground">En Hausse</div>
                </div>
              </div>
            </div>
          )}

          <Tabs defaultValue="predictions" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="predictions" className="flex items-center space-x-2">
                <Target className="h-4 w-4" />
                <span>Prédictions</span>
              </TabsTrigger>
              <TabsTrigger value="analysis" className="flex items-center space-x-2">
                <BarChart4 className="h-4 w-4" />
                <span>Analyse Détaillée</span>
              </TabsTrigger>
              <TabsTrigger value="strategies" className="flex items-center space-x-2">
                <Zap className="h-4 w-4" />
                <span>Stratégies</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="predictions" className="space-y-4">
              {predictions.map((prediction, index) => (
                <Card
                  key={index}
                  className={`transition-all duration-300 hover:shadow-lg border-2 cursor-pointer ${
                    selectedStrategy === prediction.colorStrategy
                      ? "border-primary shadow-lg scale-[1.02]"
                      : index === 0
                        ? "border-primary/40 bg-gradient-to-r from-primary/5 to-transparent"
                        : "border-muted hover:border-primary/30"
                  }`}
                  onClick={() =>
                    setSelectedStrategy(selectedStrategy === prediction.colorStrategy ? null : prediction.colorStrategy)
                  }
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {getStrategyIcon(prediction.colorStrategy)}
                        <div>
                          <span className="font-medium">{prediction.algorithm}</span>
                          {index === 0 && (
                            <Badge className="ml-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white">
                              Top Recommandé
                            </Badge>
                          )}
                          {recommendation?.recommended === prediction.colorStrategy && (
                            <Badge className="ml-2 bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                              Stratégie Optimale
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge className={getStrategyColor(prediction.colorStrategy)}>
                          {prediction.colorStrategy.toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className="border-2">
                          Risque: <span className={getRiskColor(prediction.riskLevel)}>{prediction.riskLevel}</span>
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <div className="space-y-6">
                      {/* Prédiction des numéros avec couleurs garanties */}
                      <div className="text-center">
                        <div className="flex items-center justify-center space-x-3 mb-4">
                          {prediction.numbers.map((number, i) => (
                            <NumberBall
                              key={i}
                              number={number}
                              size="xl"
                              animated={index === 0}
                              className="hover:scale-110 transition-transform duration-300 shadow-lg"
                            />
                          ))}
                        </div>
                      </div>

                      {/* Métriques de performance */}
                      <div className="grid grid-cols-3 md:grid-cols-5 gap-4 text-center">
                        <div>
                          <div className="text-lg font-bold text-primary">
                            {Math.round(prediction.confidence * 100)}%
                          </div>
                          <div className="text-xs text-muted-foreground">Confiance</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-primary">{(prediction.score * 100).toFixed(1)}</div>
                          <div className="text-xs text-muted-foreground">Score Algo</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-primary">
                            {prediction.successProbability.toFixed(0)}%
                          </div>
                          <div className="text-xs text-muted-foreground">Probabilité</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-primary">
                            {Object.keys(prediction.groupDistribution).length}
                          </div>
                          <div className="text-xs text-muted-foreground">Groupes</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-primary">
                            {prediction.historicalPerformance
                              ? `${Math.round(prediction.historicalPerformance * 100)}%`
                              : "N/A"}
                          </div>
                          <div className="text-xs text-muted-foreground">Historique</div>
                        </div>
                      </div>

                      {/* Barre de confiance */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>Niveau de confiance algorithmique</span>
                          <span className="font-medium">{Math.round(prediction.confidence * 100)}%</span>
                        </div>
                        <Progress value={prediction.confidence * 100} className="h-3" />
                      </div>

                      {/* Distribution par groupes de couleurs */}
                      <div className="space-y-3">
                        <h4 className="font-medium text-sm">Distribution par Groupes de Couleurs:</h4>
                        <div className="grid grid-cols-3 gap-2">
                          {Object.entries(prediction.groupDistribution).map(([group, count]) => (
                            <div key={group} className="flex items-center space-x-2 p-2 bg-muted/50 rounded-lg">
                              <div
                                className={`w-3 h-3 rounded-full`}
                                style={{ backgroundColor: getGroupColor(group) }}
                              />
                              <span className="text-xs capitalize">{group.replace("-", " ")}</span>
                              <Badge variant="outline" className="text-xs">
                                {count}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Facteurs d'analyse */}
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm flex items-center space-x-2">
                          <Eye className="h-4 w-4" />
                          <span>Facteurs d'Analyse:</span>
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {prediction.factors.map((factor, i) => (
                            <Badge
                              key={i}
                              variant="secondary"
                              className="text-xs hover:bg-primary hover:text-primary-foreground transition-colors cursor-default"
                            >
                              {factor}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between pt-4 border-t">
                        <div className="text-xs text-muted-foreground">
                          Stratégie:{" "}
                          <span className="font-medium capitalize">{prediction.colorStrategy.replace("-", " ")}</span>
                        </div>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSavePrediction(prediction)
                          }}
                          size="sm"
                          className="hover:scale-105 transition-transform"
                        >
                          <Save className="h-4 w-4 mr-2" />
                          Sauvegarder
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="analysis" className="space-y-4">
              {analysis && <ColorAnalysisDetails analysis={analysis} />}
            </TabsContent>

            <TabsContent value="strategies" className="space-y-4">
              <StrategyExplanations recommendation={recommendation} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}

// Composant détails de l'analyse
function ColorAnalysisDetails({ analysis }: { analysis: any }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Distribution des Couleurs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(analysis.distribution).map(([group, count]) => (
              <div key={group} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-4 h-4 rounded-full`} style={{ backgroundColor: getGroupColor(group) }} />
                  <span className="capitalize font-medium">{group.replace("-", " ")}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-24 bg-muted rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{
                        width: `${((count as number) / Math.max(...Object.values(analysis.distribution))) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-green-600">Groupes Chauds</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analysis.hotGroups.map((group: string) => (
                <div
                  key={group}
                  className="flex items-center space-x-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg"
                >
                  <div className={`w-3 h-3 rounded-full`} style={{ backgroundColor: getGroupColor(group) }} />
                  <span className="capitalize text-sm">{group.replace("-", " ")}</span>
                  <Badge className="bg-green-100 text-green-800 text-xs">Chaud</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-blue-600">Groupes Froids</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analysis.coldGroups.map((group: string) => (
                <div key={group} className="flex items-center space-x-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className={`w-3 h-3 rounded-full`} style={{ backgroundColor: getGroupColor(group) }} />
                  <span className="capitalize text-sm">{group.replace("-", " ")}</span>
                  <Badge className="bg-blue-100 text-blue-800 text-xs">Froid</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Composant explications des stratégies
function StrategyExplanations({ recommendation }: { recommendation: any }) {
  const strategies = [
    {
      name: "balanced",
      title: "Stratégie Équilibrée",
      description: "Favorise les groupes sous-représentés pour équilibrer la distribution",
      icon: <BarChart4 className="h-5 w-5" />,
      pros: ["Réduit la variance", "Approche conservatrice", "Bon équilibre risque/récompense"],
      cons: ["Peut manquer les tendances", "Performance moyenne"],
      confidence: "70-85%",
    },
    {
      name: "momentum",
      title: "Stratégie Momentum",
      description: "Mise sur les groupes ayant un élan récent positif",
      icon: <TrendingUp className="h-5 w-5" />,
      pros: ["Suit les tendances", "Potentiel de gains élevés", "Réactif aux changements"],
      cons: ["Plus risqué", "Sensible aux fluctuations"],
      confidence: "55-70%",
    },
    {
      name: "correlation",
      title: "Stratégie Corrélations",
      description: "Exploite les corrélations historiques entre groupes",
      icon: <Target className="h-5 w-5" />,
      pros: ["Basé sur historique", "Patterns identifiés", "Approche analytique"],
      cons: ["Dépend du passé", "Patterns peuvent changer"],
      confidence: "60-80%",
    },
    {
      name: "hybrid",
      title: "Stratégie Hybride",
      description: "Combine toutes les approches avec pondération intelligente",
      icon: <Sparkles className="h-5 w-5" />,
      pros: ["Approche complète", "Diversification", "Meilleure robustesse"],
      cons: ["Plus complexe", "Peut diluer les signaux forts"],
      confidence: "75-90%",
    },
  ]

  return (
    <div className="space-y-4">
      {strategies.map((strategy) => (
        <Card
          key={strategy.name}
          className={`transition-all duration-300 ${
            recommendation?.recommended === strategy.name
              ? "border-2 border-primary bg-gradient-to-r from-primary/5 to-transparent"
              : "hover:shadow-md"
          }`}
        >
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {strategy.icon}
                <div>
                  <CardTitle className="text-lg">{strategy.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{strategy.description}</p>
                </div>
              </div>
              {recommendation?.recommended === strategy.name && (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                  <Zap className="h-3 w-3 mr-1" />
                  Recommandée
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <h4 className="font-medium text-sm text-green-600 mb-2">Avantages</h4>
                <ul className="space-y-1">
                  {strategy.pros.map((pro, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      • {pro}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-sm text-orange-600 mb-2">Inconvénients</h4>
                <ul className="space-y-1">
                  {strategy.cons.map((con, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      • {con}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-sm text-primary mb-2">Confiance Typique</h4>
                <Badge variant="outline" className="text-sm">
                  {strategy.confidence}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// Fonction utilitaire pour obtenir la couleur d'un groupe
function getGroupColor(group: string): string {
  const colors: Record<string, string> = {
    "gris-clair": "#9ca3af",
    bleu: "#3b82f6",
    vert: "#10b981",
    indigo: "#6366f1",
    jaune: "#f59e0b",
    rose: "#ec4899",
    orange: "#f97316",
    gris: "#6b7280",
    rouge: "#ef4444",
  }
  return colors[group] || "#6b7280"
}
