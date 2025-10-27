import type { DrawResult } from "@/services/lotteryApi"

export interface ValidationResult {
  meanScore: number
  stdDeviation: number
  minScore: number
  maxScore: number
  foldScores: number[]
  confidence: number
}

/**
 * Service de validation statistique pour les algorithmes de prédiction
 */
export class StatisticalValidator {
  /**
   * Validation croisée temporelle (Time Series Cross-Validation)
   * Plus appropriée pour les séries temporelles que la validation croisée classique
   */
  static async timeSeriesValidation(
    algorithm: (data: DrawResult[]) => number[],
    data: DrawResult[],
    minTrainSize: number,
    testSize: number,
  ): Promise<ValidationResult> {
    const foldScores: number[] = []

    // Créer des fenêtres temporelles croissantes
    for (let i = minTrainSize; i < data.length - testSize; i += testSize) {
      const trainData = data.slice(0, i)
      const testData = data.slice(i, i + testSize)

      try {
        const prediction = algorithm(trainData)
        const score = this.evaluatePrediction(prediction, testData)
        foldScores.push(score)
      } catch (error) {
        console.error("Erreur validation fold:", error)
        foldScores.push(0)
      }
    }

    // Calculer les statistiques
    const meanScore = foldScores.reduce((sum, score) => sum + score, 0) / foldScores.length
    const variance = foldScores.reduce((sum, score) => sum + Math.pow(score - meanScore, 2), 0) / foldScores.length
    const stdDeviation = Math.sqrt(variance)
    const minScore = Math.min(...foldScores)
    const maxScore = Math.max(...foldScores)

    // Confiance basée sur la stabilité des scores
    const confidence = Math.max(0, 1 - stdDeviation / meanScore)

    return {
      meanScore,
      stdDeviation,
      minScore,
      maxScore,
      foldScores,
      confidence,
    }
  }

  /**
   * Évalue une prédiction par rapport aux données de test
   */
  private static evaluatePrediction(prediction: number[], testData: DrawResult[]): number {
    let totalMatches = 0
    let totalPossible = 0

    testData.forEach((result) => {
      const matches = prediction.filter((num) => result.gagnants.includes(num)).length
      totalMatches += matches
      totalPossible += result.gagnants.length
    })

    return totalPossible > 0 ? totalMatches / totalPossible : 0
  }
}
