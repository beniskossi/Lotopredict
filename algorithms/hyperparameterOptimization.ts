// Service d'optimisation des hyperparamètres pour les algorithmes de prédiction
import type { DrawResult } from "@/services/lotteryApi"

export interface HyperparameterConfig {
  decayRate?: number
  seasonalWeight?: number
  clusterWeight?: number
  patternWeight?: number
  cyclicalWeight?: number
  [key: string]: number | undefined
}

export interface OptimizationResult {
  bestParams: HyperparameterConfig
  bestScore: number
  allResults: Array<{ params: HyperparameterConfig; score: number }>
  convergenceHistory: number[]
  iterations: number
  duration: number
}

export interface OptimizationProgress {
  iteration: number
  totalIterations: number
  currentBestScore: number
  currentParams: HyperparameterConfig
}

/**
 * Service d'optimisation des hyperparamètres
 */
export class HyperparameterOptimizer {
  /**
   * Grid Search - Recherche exhaustive dans une grille de paramètres
   */
  static async gridSearch(
    algorithm: (params: HyperparameterConfig, data: DrawResult[]) => number[],
    data: DrawResult[],
    paramGrid: Record<string, number[]>,
    onProgress?: (progress: OptimizationProgress) => void,
  ): Promise<OptimizationResult> {
    const startTime = Date.now()
    const allResults: Array<{ params: HyperparameterConfig; score: number }> = []
    const convergenceHistory: number[] = []

    // Générer toutes les combinaisons
    const combinations = this.generateCombinations(paramGrid)
    const totalIterations = combinations.length

    console.log(`🔍 Grid Search: ${totalIterations} combinaisons à tester`)

    for (let i = 0; i < combinations.length; i++) {
      const params = combinations[i]
      const score = await this.evaluateParams(algorithm, params, data)
      allResults.push({ params, score })

      // Mettre à jour l'historique de convergence
      const currentBest = Math.max(...allResults.map((r) => r.score))
      convergenceHistory.push(currentBest)

      // Callback de progression
      if (onProgress) {
        onProgress({
          iteration: i + 1,
          totalIterations,
          currentBestScore: currentBest,
          currentParams: params,
        })
      }

      // Log tous les 10%
      if ((i + 1) % Math.ceil(totalIterations / 10) === 0) {
        console.log(`  Progress: ${(((i + 1) / totalIterations) * 100).toFixed(1)}% - Best: ${currentBest.toFixed(4)}`)
      }
    }

    // Trouver le meilleur
    allResults.sort((a, b) => b.score - a.score)
    const bestResult = allResults[0]

    const duration = Date.now() - startTime
    console.log(`✅ Grid Search terminé en ${(duration / 1000).toFixed(2)}s`)
    console.log(`   Meilleur score: ${bestResult.score.toFixed(4)}`)
    console.log(`   Meilleurs paramètres:`, bestResult.params)

    return {
      bestParams: bestResult.params,
      bestScore: bestResult.score,
      allResults,
      convergenceHistory,
      iterations: totalIterations,
      duration,
    }
  }

  /**
   * Random Search - Plus efficace que grid search pour grands espaces
   */
  static async randomSearch(
    algorithm: (params: HyperparameterConfig, data: DrawResult[]) => number[],
    data: DrawResult[],
    paramRanges: Record<string, [number, number]>,
    iterations = 100,
    onProgress?: (progress: OptimizationProgress) => void,
  ): Promise<OptimizationResult> {
    const startTime = Date.now()
    const allResults: Array<{ params: HyperparameterConfig; score: number }> = []
    const convergenceHistory: number[] = []

    console.log(`🎲 Random Search: ${iterations} itérations`)

    for (let i = 0; i < iterations; i++) {
      const params = this.sampleRandomParams(paramRanges)
      const score = await this.evaluateParams(algorithm, params, data)
      allResults.push({ params, score })

      const currentBest = Math.max(...allResults.map((r) => r.score))
      convergenceHistory.push(currentBest)

      if (onProgress) {
        onProgress({
          iteration: i + 1,
          totalIterations: iterations,
          currentBestScore: currentBest,
          currentParams: params,
        })
      }

      if ((i + 1) % Math.ceil(iterations / 10) === 0) {
        console.log(`  Progress: ${(((i + 1) / iterations) * 100).toFixed(1)}% - Best: ${currentBest.toFixed(4)}`)
      }
    }

    allResults.sort((a, b) => b.score - a.score)
    const bestResult = allResults[0]

    const duration = Date.now() - startTime
    console.log(`✅ Random Search terminé en ${(duration / 1000).toFixed(2)}s`)
    console.log(`   Meilleur score: ${bestResult.score.toFixed(4)}`)
    console.log(`   Meilleurs paramètres:`, bestResult.params)

    return {
      bestParams: bestResult.params,
      bestScore: bestResult.score,
      allResults,
      convergenceHistory,
      iterations,
      duration,
    }
  }

  // ============ FONCTIONS UTILITAIRES ============

  /**
   * Génère toutes les combinaisons possibles de paramètres
   */
  private static generateCombinations(paramGrid: Record<string, number[]>): HyperparameterConfig[] {
    const keys = Object.keys(paramGrid)
    const combinations: HyperparameterConfig[] = []

    function generate(index: number, current: HyperparameterConfig) {
      if (index === keys.length) {
        combinations.push({ ...current })
        return
      }

      const key = keys[index]
      for (const value of paramGrid[key]) {
        current[key] = value
        generate(index + 1, current)
      }
    }

    generate(0, {})
    return combinations
  }

  /**
   * Échantillonne des paramètres aléatoires dans les plages données
   */
  private static sampleRandomParams(paramRanges: Record<string, [number, number]>): HyperparameterConfig {
    const params: HyperparameterConfig = {}

    for (const [key, [min, max]] of Object.entries(paramRanges)) {
      params[key] = Math.random() * (max - min) + min
    }

    return params
  }

  /**
   * Évalue les paramètres en utilisant une métrique simple
   */
  private static async evaluateParams(
    algorithm: (params: HyperparameterConfig, data: DrawResult[]) => number[],
    params: HyperparameterConfig,
    data: DrawResult[],
  ): Promise<number> {
    try {
      // Évaluation simple basée sur la diversité et la distribution
      const prediction = algorithm(params, data)

      // Score basé sur la diversité des numéros
      const diversity = new Set(prediction).size / prediction.length

      // Score basé sur la distribution (éviter les clusters)
      let spreadScore = 0
      for (let i = 1; i < prediction.length; i++) {
        spreadScore += Math.abs(prediction[i] - prediction[i - 1])
      }
      spreadScore = Math.min(1, spreadScore / (90 * prediction.length))

      return diversity * 0.5 + spreadScore * 0.5
    } catch (error) {
      console.error("Erreur évaluation paramètres:", error)
      return 0
    }
  }
}

/**
 * Configuration centralisée des hyperparamètres par défaut
 */
export const DEFAULT_HYPERPARAMETERS = {
  weightedFrequency: {
    decayRate: 0.05,
    seasonalWeight: 0.1,
  },
  machineLearning: {
    clusterWeight: 0.33,
    patternWeight: 0.33,
    cyclicalWeight: 0.33,
  },
}

/**
 * Plages de recherche recommandées pour chaque algorithme
 */
export const RECOMMENDED_PARAM_RANGES = {
  weightedFrequency: {
    decayRate: [0.01, 0.15] as [number, number],
    seasonalWeight: [0.05, 0.2] as [number, number],
  },
  machineLearning: {
    clusterWeight: [0.2, 0.5] as [number, number],
    patternWeight: [0.2, 0.5] as [number, number],
    cyclicalWeight: [0.2, 0.5] as [number, number],
  },
}
