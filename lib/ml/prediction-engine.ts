import type { DrawResult, PredictionResult } from "@/lib/types"

interface NumberScore {
  number: number
  score: number
  frequency: number
  recency: number
  trend: number
}

export class PredictionEngine {
  // XGBoost-inspired: Statistical analysis with frequency and gaps
  private xgboostPredict(results: DrawResult[]): number[] {
    const scores = new Map<number, number>()

    // Initialize all numbers
    for (let i = 1; i <= 90; i++) {
      scores.set(i, 0)
    }

    // Calculate frequency scores
    const frequencyMap = new Map<number, number>()
    results.forEach((result) => {
      result.winning_numbers.forEach((num) => {
        frequencyMap.set(num, (frequencyMap.get(num) || 0) + 1)
      })
    })

    // Calculate gap scores (days since last appearance)
    const gapMap = new Map<number, number>()
    const now = new Date()
    results.forEach((result) => {
      result.winning_numbers.forEach((num) => {
        if (!gapMap.has(num)) {
          const daysSince = Math.floor((now.getTime() - new Date(result.draw_date).getTime()) / (1000 * 60 * 60 * 24))
          gapMap.set(num, daysSince)
        }
      })
    })

    // Combine scores
    for (let i = 1; i <= 90; i++) {
      const frequency = frequencyMap.get(i) || 0
      const gap = gapMap.get(i) || 999

      // Higher frequency = higher score
      // Larger gap = higher score (overdue numbers)
      const score = frequency * 0.4 + Math.min(gap / 10, 10) * 0.6

      scores.set(i, score)
    }

    // Return top 10 numbers
    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([num]) => num)
  }

  // Random Forest-inspired: Validation through number interactions
  private randomForestPredict(results: DrawResult[]): number[] {
    const scores = new Map<number, number>()

    // Initialize
    for (let i = 1; i <= 90; i++) {
      scores.set(i, 0)
    }

    // Analyze co-occurrence patterns
    const coOccurrence = new Map<number, Map<number, number>>()

    results.forEach((result) => {
      const numbers = result.winning_numbers
      for (let i = 0; i < numbers.length; i++) {
        for (let j = i + 1; j < numbers.length; j++) {
          const num1 = numbers[i]
          const num2 = numbers[j]

          if (!coOccurrence.has(num1)) coOccurrence.set(num1, new Map())
          if (!coOccurrence.has(num2)) coOccurrence.set(num2, new Map())

          const map1 = coOccurrence.get(num1)!
          const map2 = coOccurrence.get(num2)!

          map1.set(num2, (map1.get(num2) || 0) + 1)
          map2.set(num1, (map2.get(num1) || 0) + 1)
        }
      }
    })

    // Score based on strong associations
    for (let i = 1; i <= 90; i++) {
      const associations = coOccurrence.get(i)
      if (associations) {
        const totalAssociations = Array.from(associations.values()).reduce((sum, count) => sum + count, 0)
        scores.set(i, totalAssociations)
      }
    }

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([num]) => num)
  }

  // RNN-LSTM-inspired: Temporal pattern detection
  private rnnLstmPredict(results: DrawResult[]): number[] {
    const scores = new Map<number, number>()

    // Initialize
    for (let i = 1; i <= 90; i++) {
      scores.set(i, 0)
    }

    // Analyze recent trends (last 10 draws weighted more)
    const recentResults = results.slice(0, Math.min(10, results.length))

    recentResults.forEach((result, idx) => {
      const weight = 1 - idx * 0.08 // Decay weight for older results
      result.winning_numbers.forEach((num) => {
        scores.set(num, (scores.get(num) || 0) + weight)
      })
    })

    // Look for sequential patterns
    for (let i = 0; i < results.length - 1; i++) {
      const current = results[i].winning_numbers
      const next = results[i + 1].winning_numbers

      // Numbers that appeared after certain numbers
      current.forEach((num) => {
        next.forEach((nextNum) => {
          scores.set(nextNum, (scores.get(nextNum) || 0) + 0.5)
        })
      })
    }

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([num]) => num)
  }

  // Hybrid approach: Combine all methods
  public generatePrediction(
    results: DrawResult[],
    method: "xgboost" | "random-forest" | "rnn-lstm" | "hybrid",
  ): PredictionResult {
    if (results.length < 5) {
      throw new Error("Insufficient data for prediction (minimum 5 draws required)")
    }

    let predictedNumbers: number[]
    let confidence: number

    switch (method) {
      case "xgboost":
        predictedNumbers = this.xgboostPredict(results).slice(0, 5)
        confidence = Math.min(0.65 + results.length * 0.001, 0.85)
        break

      case "random-forest":
        predictedNumbers = this.randomForestPredict(results).slice(0, 5)
        confidence = Math.min(0.6 + results.length * 0.001, 0.8)
        break

      case "rnn-lstm":
        predictedNumbers = this.rnnLstmPredict(results).slice(0, 5)
        confidence = Math.min(0.55 + results.length * 0.001, 0.75)
        break

      case "hybrid":
        // Combine all three methods
        const xgb = this.xgboostPredict(results)
        const rf = this.randomForestPredict(results)
        const rnn = this.rnnLstmPredict(results)

        // Score each number by how many methods selected it
        const combinedScores = new Map<number, number>()

        xgb.forEach((num, idx) => combinedScores.set(num, (combinedScores.get(num) || 0) + (10 - idx) * 1.2))
        rf.forEach((num, idx) => combinedScores.set(num, (combinedScores.get(num) || 0) + (10 - idx) * 1.0))
        rnn.forEach((num, idx) => combinedScores.set(num, (combinedScores.get(num) || 0) + (10 - idx) * 0.8))

        predictedNumbers = Array.from(combinedScores.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([num]) => num)

        confidence = Math.min(0.7 + results.length * 0.001, 0.88)
        break
    }

    return {
      numbers: predictedNumbers,
      confidence,
      method,
      timestamp: new Date().toISOString(),
    }
  }

  // Generate multiple predictions for comparison
  public generateMultiplePredictions(results: DrawResult[]): PredictionResult[] {
    return [
      this.generatePrediction(results, "hybrid"),
      this.generatePrediction(results, "xgboost"),
      this.generatePrediction(results, "random-forest"),
      this.generatePrediction(results, "rnn-lstm"),
    ]
  }
}

export const predictionEngine = new PredictionEngine()
