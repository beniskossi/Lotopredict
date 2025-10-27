// Service de scoring automatique des prédictions - SYSTÈME COMPLET
import {PredictionsService, AuditService, AuthService} from '@/services/supabaseClient'
import type {DrawResult} from '@/services/lotteryApi'
import type {ColorGroupPrediction} from '@/algorithms/colorGroupPredictions'

export interface PredictionScore {
 predictionId: string
 algorithm: string
 drawName: string
 predictedNumbers: number[]
 actualNumbers: number[]
 scoreBreakdown: {
  exactMatches: number
  colorGroupMatches: number
  proximityMatches: number
  distributionAccuracy: number
  algorithmConfidence: number
 }
 totalScore: number
 grade: 'excellent' | 'good' | 'average' | 'poor'
 validatedAt: Date
 userId?: string
}

export interface PredictionHistory {
 id: string
 algorithm: string
 drawName: string
 predictedNumbers: number[]
 predictedAt: Date
 confidence: number
 colorStrategy?: string
 groupDistribution?: Record<string, number>
 actualResult?: number[]
 score?: PredictionScore
 isValidated: boolean
 userId?: string
}

export interface AlgorithmPerformance {
 algorithmName: string
 totalPredictions: number
 averageScore: number
 excellentCount: number
 goodCount: number
 averageCount: number
 poorCount: number
 bestScore: number
 worstScore: number
 trend: 'improving' | 'stable' | 'declining'
 confidenceAccuracy: number
 colorStrategyBreakdown?: Record<string, number>
 lastUpdated: Date
}

export class PredictionScoringService {
 private static readonly SCORE_WEIGHTS = {
  exactMatches: 5,
  colorGroupMatches: 2,
  proximityMatches: 1,
  distributionAccuracy: 3,
  algorithmConfidence: 1
 }

 private static readonly MAX_SCORE = 100
 private static readonly SCORE_THRESHOLDS = {
  excellent: 85,
  good: 70,
  average: 50
 }

 // Sauvegarder une prédiction dans l'historique
 static async savePrediction(
  algorithm: string,
  drawName: string,
  predictedNumbers: number[],
  confidence: number,
  colorStrategy?: string,
  groupDistribution?: Record<string, number>
 ): Promise<string> {
  try {
   const user = await AuthService.getCurrentUser()
   
   const predictionHistory: Omit<PredictionHistory, 'id'> = {
    algorithm,
    drawName,
    predictedNumbers,
    predictedAt: new Date(),
    confidence,
    colorStrategy,
    groupDistribution,
    isValidated: false,
    userId: user?.id
   }

   // Sauvegarder dans Supabase
   const savedPrediction = await PredictionsService.savePrediction({
    user_id: user?.id || 'anonymous',
    draw_name: drawName,
    predicted_numbers: predictedNumbers,
    algorithm_used: algorithm,
    confidence_score: confidence
   })

   // Sauvegarder dans le cache local pour performance
   const localHistory = PredictionScoringService.getLocalHistory()
   const predictionId = savedPrediction.id?.toString() || Date.now().toString()
   
   localHistory[predictionId] = {
    id: predictionId,
    ...predictionHistory
   }
   
   localStorage.setItem('prediction_history', JSON.stringify(localHistory))

   console.log(`💾 Prédiction sauvegardée: ${algorithm} pour ${drawName}`)
   
   return predictionId
  } catch (error) {
   console.error('Erreur sauvegarde prédiction:', error)
   
   // Fallback local
   const localHistory = PredictionScoringService.getLocalHistory()
   const predictionId = Date.now().toString()
   
   localHistory[predictionId] = {
    id: predictionId,
    algorithm,
    drawName,
    predictedNumbers,
    predictedAt: new Date(),
    confidence,
    colorStrategy,
    groupDistribution,
    isValidated: false
   }
   
   localStorage.setItem('prediction_history', JSON.stringify(localHistory))
   return predictionId
  }
 }

 // Valider automatiquement les prédictions avec nouveaux résultats
 static async validatePredictions(newResults: DrawResult[]): Promise<void> {
  try {
   console.log('🔍 Validation automatique des prédictions...')
   
   const unvalidatedPredictions = await PredictionScoringService.getUnvalidatedPredictions()
   let validatedCount = 0

   for (const prediction of unvalidatedPredictions) {
    // Chercher le résultat correspondant
    const matchingResult = newResults.find(result => 
     result.draw_name === prediction.drawName &&
     new Date(result.date) >= prediction.predictedAt
    )

    if (matchingResult) {
     const score = PredictionScoringService.calculateScore(
      prediction.predictedNumbers,
      matchingResult.gagnants,
      prediction.algorithm,
      prediction.confidence,
      prediction.groupDistribution
     )

     await PredictionScoringService.updatePredictionWithScore(prediction.id, matchingResult.gagnants, score)
     validatedCount++
    }
   }

   if (validatedCount > 0) {
    console.log(`✅ ${validatedCount} prédiction(s) validée(s) automatiquement`)
    await PredictionScoringService.updateAlgorithmPerformances()
   }
  } catch (error) {
   console.error('Erreur validation automatique:', error)
  }
 }

 // Calculer le score d'une prédiction
 static calculateScore(
  predictedNumbers: number[],
  actualNumbers: number[],
  algorithm: string,
  confidence: number,
  groupDistribution?: Record<string, number>
 ): PredictionScore {
  const scoreBreakdown = {
   exactMatches: 0,
   colorGroupMatches: 0,
   proximityMatches: 0,
   distributionAccuracy: 0,
   algorithmConfidence: confidence * 10 // Convertir en score sur 10
  }

  // 1. Correspondances exactes
  const exactMatches = predictedNumbers.filter(num => actualNumbers.includes(num))
  scoreBreakdown.exactMatches = exactMatches.length * 2 // 2 points par correspondance exacte

  // 2. Correspondances de groupes de couleurs
  const predictedGroups = predictedNumbers.map(num => PredictionScoringService.getColorGroup(num))
  const actualGroups = actualNumbers.map(num => PredictionScoringService.getColorGroup(num))
  
  const groupMatches = predictedGroups.filter(group => actualGroups.includes(group))
  scoreBreakdown.colorGroupMatches = Math.min(10, groupMatches.length * 2)

  // 3. Correspondances de proximité (±3)
  let proximityMatches = 0
  predictedNumbers.forEach(predNum => {
   const hasProximity = actualNumbers.some(actNum => 
    Math.abs(predNum - actNum) <= 3 && predNum !== actNum
   )
   if (hasProximity) proximityMatches++
  })
  scoreBreakdown.proximityMatches = Math.min(5, proximityMatches)

  // 4. Précision de la distribution par couleurs
  if (groupDistribution) {
   const actualDistribution: Record<string, number> = {}
   actualNumbers.forEach(num => {
    const group = PredictionScoringService.getColorGroup(num)
    actualDistribution[group] = (actualDistribution[group] || 0) + 1
   })

   let distributionError = 0
   Object.keys(groupDistribution).forEach(group => {
    const predicted = groupDistribution[group] || 0
    const actual = actualDistribution[group] || 0
    distributionError += Math.abs(predicted - actual)
   })

   scoreBreakdown.distributionAccuracy = Math.max(0, 10 - distributionError * 2)
  } else {
   scoreBreakdown.distributionAccuracy = 5 // Score neutre
  }

  // Calcul du score total
  const weightedScore = (
   scoreBreakdown.exactMatches * PredictionScoringService.SCORE_WEIGHTS.exactMatches +
   scoreBreakdown.colorGroupMatches * PredictionScoringService.SCORE_WEIGHTS.colorGroupMatches +
   scoreBreakdown.proximityMatches * PredictionScoringService.SCORE_WEIGHTS.proximityMatches +
   scoreBreakdown.distributionAccuracy * PredictionScoringService.SCORE_WEIGHTS.distributionAccuracy +
   scoreBreakdown.algorithmConfidence * PredictionScoringService.SCORE_WEIGHTS.algorithmConfidence
  )

  const totalScore = Math.min(PredictionScoringService.MAX_SCORE, 
   (weightedScore / 12) * 10) // Normaliser sur 100

  // Déterminer le grade
  let grade: 'excellent' | 'good' | 'average' | 'poor'
  if (totalScore >= PredictionScoringService.SCORE_THRESHOLDS.excellent) grade = 'excellent'
  else if (totalScore >= PredictionScoringService.SCORE_THRESHOLDS.good) grade = 'good'
  else if (totalScore >= PredictionScoringService.SCORE_THRESHOLDS.average) grade = 'average'
  else grade = 'poor'

  return {
   predictionId: '',
   algorithm,
   drawName: '',
   predictedNumbers,
   actualNumbers,
   scoreBreakdown,
   totalScore,
   grade,
   validatedAt: new Date()
  }
 }

 // Mettre à jour une prédiction avec son score
 private static async updatePredictionWithScore(
  predictionId: string,
  actualNumbers: number[],
  score: PredictionScore
 ): Promise<void> {
  try {
   // Mettre à jour dans Supabase
   await PredictionsService.updatePredictionResult(
    parseInt(predictionId),
    actualNumbers,
    score.scoreBreakdown.exactMatches
   )

   // Mettre à jour le cache local
   const localHistory = PredictionScoringService.getLocalHistory()
   if (localHistory[predictionId]) {
    localHistory[predictionId].actualResult = actualNumbers
    localHistory[predictionId].score = {...score, predictionId}
    localHistory[predictionId].isValidated = true
    
    localStorage.setItem('prediction_history', JSON.stringify(localHistory))
   }

   // Logger dans l'audit
   const user = await AuthService.getCurrentUser()
   if (user) {
    await AuditService.addLog({
     user_id: user.id,
     action: 'PREDICTION_VALIDATED',
     table_name: 'predictions_history',
     new_data: {
      predictionId,
      algorithm: score.algorithm,
      totalScore: score.totalScore,
      grade: score.grade
     }
    })
   }
  } catch (error) {
   console.error('Erreur mise à jour prédiction:', error)
  }
 }

 // Obtenir l'historique des prédictions
 static getLocalHistory(): Record<string, PredictionHistory> {
  try {
   const stored = localStorage.getItem('prediction_history')
   return stored ? JSON.parse(stored) : {}
  } catch {
   return {}
  }
 }

 // Obtenir les prédictions non validées
 static async getUnvalidatedPredictions(): Promise<PredictionHistory[]> {
  const localHistory = PredictionScoringService.getLocalHistory()
  
  return Object.values(localHistory)
   .filter(prediction => !prediction.isValidated)
   .sort((a, b) => new Date(b.predictedAt).getTime() - new Date(a.predictedAt).getTime())
 }

 // Obtenir les performances des algorithmes
 static async getAlgorithmPerformances(): Promise<Record<string, AlgorithmPerformance>> {
  const localHistory = PredictionScoringService.getLocalHistory()
  const validatedPredictions = Object.values(localHistory)
   .filter(p => p.isValidated && p.score)

  const performanceMap: Record<string, AlgorithmPerformance> = {}

  // Grouper par algorithme
  const algorithmGroups = validatedPredictions.reduce((acc, prediction) => {
   if (!acc[prediction.algorithm]) acc[prediction.algorithm] = []
   acc[prediction.algorithm].push(prediction)
   return acc
  }, {} as Record<string, PredictionHistory[]>)

  // Calculer les performances
  Object.entries(algorithmGroups).forEach(([algorithm, predictions]) => {
   const scores = predictions.map(p => p.score!.totalScore)
   const grades = predictions.map(p => p.score!.grade)
   
   const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length
   const excellentCount = grades.filter(g => g === 'excellent').length
   const goodCount = grades.filter(g => g === 'good').length
   const averageCount = grades.filter(g => g === 'average').length
   const poorCount = grades.filter(g => g === 'poor').length

   // Calculer la tendance
   const recentScores = scores.slice(-5)
   const olderScores = scores.slice(0, -5)
   let trend: 'improving' | 'stable' | 'declining' = 'stable'
   
   if (recentScores.length >= 3 && olderScores.length >= 3) {
    const recentAvg = recentScores.reduce((sum, s) => sum + s, 0) / recentScores.length
    const olderAvg = olderScores.reduce((sum, s) => sum + s, 0) / olderScores.length
    
    if (recentAvg > olderAvg + 5) trend = 'improving'
    else if (recentAvg < olderAvg - 5) trend = 'declining'
   }

   // Calculer précision de confiance
   const confidenceAccuracy = predictions.reduce((sum, p) => {
    const expectedScore = p.confidence * 100
    const actualScore = p.score!.totalScore
    return sum + (1 - Math.abs(expectedScore - actualScore) / 100)
   }, 0) / predictions.length

   // Breakdown par stratégie couleur
   const colorStrategyBreakdown: Record<string, number> = {}
   predictions.forEach(p => {
    if (p.colorStrategy) {
     if (!colorStrategyBreakdown[p.colorStrategy]) colorStrategyBreakdown[p.colorStrategy] = 0
     colorStrategyBreakdown[p.colorStrategy] += p.score!.totalScore
    }
   })

   Object.keys(colorStrategyBreakdown).forEach(strategy => {
    const count = predictions.filter(p => p.colorStrategy === strategy).length
    colorStrategyBreakdown[strategy] /= count
   })

   performanceMap[algorithm] = {
    algorithmName: algorithm,
    totalPredictions: predictions.length,
    averageScore,
    excellentCount,
    goodCount,
    averageCount,
    poorCount,
    bestScore: Math.max(...scores),
    worstScore: Math.min(...scores),
    trend,
    confidenceAccuracy,
    colorStrategyBreakdown,
    lastUpdated: new Date()
   }
  })

  return performanceMap
 }

 // Mettre à jour les performances des algorithmes
 static async updateAlgorithmPerformances(): Promise<void> {
  try {
   const performances = await PredictionScoringService.getAlgorithmPerformances()
   
   // Sauvegarder les performances en cache
   localStorage.setItem('algorithm_performances', JSON.stringify(performances))
   
   console.log('📊 Performances des algorithmes mises à jour')
  } catch (error) {
   console.error('Erreur mise à jour performances:', error)
  }
 }

 // Obtenir le groupe de couleur d'un numéro
 private static getColorGroup(number: number): string {
  if (number >= 1 && number <= 9) return 'gris-clair'
  if (number >= 10 && number <= 19) return 'bleu'
  if (number >= 20 && number <= 29) return 'vert'
  if (number >= 30 && number <= 39) return 'indigo'
  if (number >= 40 && number <= 49) return 'jaune'
  if (number >= 50 && number <= 59) return 'rose'
  if (number >= 60 && number <= 69) return 'orange'
  if (number >= 70 && number <= 79) return 'gris'
  if (number >= 80 && number <= 90) return 'rouge'
  return 'unknown'
 }

 // Obtenir les statistiques globales
 static getGlobalStats(): {
  totalPredictions: number
  totalValidated: number
  averageScore: number
  successRate: number
  topAlgorithm: string
 } {
  const localHistory = PredictionScoringService.getLocalHistory()
  const predictions = Object.values(localHistory)
  const validated = predictions.filter(p => p.isValidated && p.score)
  
  const totalPredictions = predictions.length
  const totalValidated = validated.length
  const averageScore = validated.length > 0 
   ? validated.reduce((sum, p) => sum + p.score!.totalScore, 0) / validated.length 
   : 0
  const successRate = validated.length > 0 
   ? validated.filter(p => p.score!.grade === 'excellent' || p.score!.grade === 'good').length / validated.length 
   : 0

  // Trouver le meilleur algorithme
  const algorithmScores: Record<string, number[]> = {}
  validated.forEach(p => {
   if (!algorithmScores[p.algorithm]) algorithmScores[p.algorithm] = []
   algorithmScores[p.algorithm].push(p.score!.totalScore)
  })

  let topAlgorithm = 'Aucun'
  let bestAvg = 0
  Object.entries(algorithmScores).forEach(([algorithm, scores]) => {
   const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length
   if (avg > bestAvg) {
    bestAvg = avg
    topAlgorithm = algorithm
   }
  })

  return {
   totalPredictions,
   totalValidated,
   averageScore,
   successRate,
   topAlgorithm
  }
 }
}
