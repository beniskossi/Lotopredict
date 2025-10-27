"use client"

import { useState, useMemo } from "react"
import { useDrawResults } from "@/hooks/use-sync"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { NumberBall } from "@/components/number-ball"
import { Sparkles, TrendingUp, BarChart3, Activity, Zap, AlertCircle } from "lucide-react"
import { predictionEngine } from "@/lib/ml/prediction-engine"
import type { PredictionResult } from "@/lib/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface PredictionSectionProps {
  drawName: string
}

export function PredictionSection({ drawName }: PredictionSectionProps) {
  const { results, loading } = useDrawResults(drawName)
  const [predictions, setPredictions] = useState<PredictionResult[]>([])
  const [isGenerating, setIsGenerating] = useState(false)

  const canPredict = useMemo(() => results.length >= 5, [results])

  const handleGeneratePredictions = () => {
    if (!canPredict) return

    setIsGenerating(true)
    try {
      const newPredictions = predictionEngine.generateMultiplePredictions(results)
      setPredictions(newPredictions)
    } catch (error) {
      console.error("[v0] Prediction error:", error)
    } finally {
      setIsGenerating(false)
    }
  }

  const getMethodIcon = (method: string) => {
    switch (method) {
      case "hybrid":
        return <Zap className="w-4 h-4" />
      case "xgboost":
        return <BarChart3 className="w-4 h-4" />
      case "random-forest":
        return <TrendingUp className="w-4 h-4" />
      case "rnn-lstm":
        return <Activity className="w-4 h-4" />
      default:
        return <Sparkles className="w-4 h-4" />
    }
  }

  const getMethodName = (method: string) => {
    switch (method) {
      case "hybrid":
        return "Hybride (Recommandé)"
      case "xgboost":
        return "XGBoost"
      case "random-forest":
        return "Random Forest"
      case "rnn-lstm":
        return "RNN-LSTM"
      default:
        return method
    }
  }

  const getMethodDescription = (method: string) => {
    switch (method) {
      case "hybrid":
        return "Combine les trois algorithmes pour une prédiction équilibrée et robuste"
      case "xgboost":
        return "Analyse statistique des fréquences et écarts d'apparition"
      case "random-forest":
        return "Validation des interactions et co-occurrences entre numéros"
      case "rnn-lstm":
        return "Détection des tendances temporelles et motifs séquentiels"
      default:
        return ""
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">Chargement...</CardContent>
      </Card>
    )
  }

  if (!canPredict) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Données insuffisantes</AlertTitle>
        <AlertDescription>
          Au moins 5 tirages sont nécessaires pour générer des prédictions. Actuellement : {results.length} tirage
          {results.length > 1 ? "s" : ""}.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Generate button */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Générer des prédictions
          </CardTitle>
          <CardDescription>
            Utilisez les algorithmes d'apprentissage automatique pour prédire les prochains numéros
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              <p>
                Basé sur {results.length} tirage{results.length > 1 ? "s" : ""} historique
                {results.length > 1 ? "s" : ""}
              </p>
              <p className="mt-1">4 méthodes de prédiction disponibles</p>
            </div>
            <Button onClick={handleGeneratePredictions} disabled={isGenerating} size="lg">
              <Sparkles className={`w-4 h-4 mr-2 ${isGenerating ? "animate-spin" : ""}`} />
              {isGenerating ? "Génération..." : "Générer les prédictions"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Predictions display */}
      {predictions.length > 0 && (
        <div className="space-y-4">
          {predictions.map((prediction, idx) => (
            <Card key={idx} className={prediction.method === "hybrid" ? "border-primary border-2" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getMethodIcon(prediction.method)}
                    <div>
                      <CardTitle className="text-lg">{getMethodName(prediction.method)}</CardTitle>
                      <CardDescription className="mt-1">{getMethodDescription(prediction.method)}</CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant={prediction.method === "hybrid" ? "default" : "secondary"}
                    className="text-sm px-3 py-1"
                  >
                    {(prediction.confidence * 100).toFixed(0)}% confiance
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                  {prediction.numbers.map((num, numIdx) => (
                    <div key={numIdx} className="flex flex-col items-center gap-2">
                      <NumberBall number={num} size="lg" />
                      <span className="text-xs text-muted-foreground">#{numIdx + 1}</span>
                    </div>
                  ))}
                </div>

                {prediction.method === "hybrid" && (
                  <div className="mt-4 p-3 bg-primary/10 rounded-lg">
                    <p className="text-sm text-primary font-medium">
                      Recommandation : Cette prédiction combine les forces de tous les algorithmes pour un résultat
                      optimal.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Avertissement</AlertTitle>
        <AlertDescription>
          Les prédictions sont basées sur des analyses statistiques et des algorithmes d'apprentissage automatique.
          Elles ne garantissent pas de résultats et doivent être utilisées à titre informatif uniquement. Les jeux de
          hasard comportent des risques.
        </AlertDescription>
      </Alert>
    </div>
  )
}
