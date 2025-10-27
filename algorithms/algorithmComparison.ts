import type { DrawResult } from "@/services/lotteryApi";
// MODIFICATION: Importation des nouveaux algorithmes
import { generateAdvancedPredictions } from "@/algorithms/realAdvancedPredictions";
import { SupabaseAdvancedPredictor } from "@/algorithms/advancedSupabasePredictions";
import { ColorGroupPredictor } from "@/algorithms/colorGroupPredictions";

// Interfaces (inchangées)
export interface AlgorithmPrediction {
  id: string;
  name: string;
  numbers: number[];
  confidence: number;
  factors: string[];
  category: string;
  score: number;
  accuracy?: number;
  expectedROI?: number;
  executionTime: number;
  complexity: "low" | "medium" | "high";
  dataRequirement: number; // nombre minimum de tirages requis
  strengths: string[];
  weaknesses: string[];
}

export interface ComparisonMetrics {
  prediction: AlgorithmPrediction;
  overlaps: Array<{
    algorithmId: string;
    algorithmName: string;
    commonNumbers: number[];
    overlapScore: number;
  }>;
  uniqueness: number;
  diversity: number;
  consistency: number;
  reliability: number;
}

export interface ComparisonAnalysis {
  algorithms: ComparisonMetrics[];
  consensus: {
    mostAgreedNumbers: Array<{ number: number; agreementCount: number; agreementScore: number }>;
    leastAgreedNumbers: Array<{ number: number; disagreementScore: number }>;
    averageConfidence: number;
    confidenceRange: { min: number; max: number };
  };
  recommendations: {
    mostReliable: string;
    mostUnique: string;
    bestConsensus: string;
    highestConfidence: string;
    balanced: string;
  };
  riskAssessment: {
    conservative: AlgorithmPrediction[];
    moderate: AlgorithmPrediction[];
    aggressive: AlgorithmPrediction[];
  };
}

export class AlgorithmComparisonService {
  static async generateAllPredictions(results: DrawResult[], drawName: string): Promise<AlgorithmPrediction[]> {
    const startTime = performance.now();
    const predictions: AlgorithmPrediction[] = [];

    try {
      // 1. Nouveaux algorithmes locaux
      console.log("🔄 Génération des prédictions locales améliorées...");
      const localPredictions = generateAdvancedPredictions(results, drawName);

      for (const pred of localPredictions) {
        const localStartTime = performance.now();
        predictions.push({
          id: `local_${pred.category}_${Date.now()}`,
          name: pred.algorithm,
          numbers: pred.numbers,
          confidence: pred.confidence,
          factors: pred.factors,
          category: pred.category,
          score: pred.score,
          accuracy: pred.accuracy,
          executionTime: performance.now() - localStartTime,
          complexity: AlgorithmComparisonService.getComplexity(pred.category),
          dataRequirement: AlgorithmComparisonService.getDataRequirement(pred.category),
          strengths: AlgorithmComparisonService.getStrengths(pred.category),
          weaknesses: AlgorithmComparisonService.getWeaknesses(pred.category),
        });
      }

      // 2. Algorithmes Supabase (inchangé)
      console.log("🔄 Génération prédictions Supabase...");
      try {
        const supabasePredictions = await SupabaseAdvancedPredictor.generateSupabasePredictions(drawName);
        const supabaseStartTime = performance.now();
        for (const pred of supabasePredictions) {
          predictions.push({
            id: `supabase_${pred.category}_${Date.now()}`,
            name: `${pred.algorithm} (Supabase)`,
            numbers: pred.numbers,
            confidence: pred.confidence,
            factors: pred.factors,
            category: `supabase-${pred.category}`,
            score: pred.score,
            accuracy: pred.accuracy,
            executionTime: performance.now() - supabaseStartTime,
            complexity: "high",
            dataRequirement: 100,
            strengths: ["Données temps réel", "Cloud processing", "Mise à jour continue"],
            weaknesses: ["Dépendance réseau", "Latence"],
          });
        }
      } catch (error) {
        console.warn("Prédictions Supabase non disponibles:", error);
      }

      // 3. Algorithmes par couleurs (inchangé)
      console.log("🔄 Génération prédictions couleurs...");
      const colorPredictions = ColorGroupPredictor.generateAllColorPredictions(results, drawName);
      const colorStartTime = performance.now();
      for (const pred of colorPredictions) {
        predictions.push({
          id: `color_${pred.colorStrategy}_${Date.now()}`,
          name: `${pred.algorithm} (Couleurs)`,
          numbers: pred.numbers,
          confidence: pred.confidence,
          factors: pred.factors,
          category: "color-analysis",
          score: pred.score,
          accuracy: pred.historicalPerformance,
          executionTime: performance.now() - colorStartTime,
          complexity: "medium",
          dataRequirement: 50,
          strengths: ["Approche visuelle", "Diversification", "Stratégies multiples"],
          weaknesses: ["Basé sur groupement arbitraire", "Performance variable"],
        });
      }
      
      // 4. Algorithme de consensus (inchangé)
      const consensusPrediction = AlgorithmComparisonService.generateConsensusPrediction(predictions);
      predictions.push(consensusPrediction);

      const totalTime = performance.now() - startTime;
      console.log(`✅ ${predictions.length} prédictions générées en ${totalTime.toFixed(0)}ms`);

      return predictions.sort((a, b) => b.score - a.score);
    } catch (error) {
      console.error("Erreur génération prédictions:", error);
      return [];
    }
  }

  // Le reste de la classe est principalement utilitaire et n'a pas besoin de modifications majeures
  // ... (toutes les autres méthodes de la classe restent ici)
  // ...
    static async compareAlgorithms(results: DrawResult[], drawName: string): Promise<ComparisonAnalysis> {
    const predictions = await AlgorithmComparisonService.generateAllPredictions(results, drawName);

    if (predictions.length === 0) {
      throw new Error("Aucune prédiction disponible pour comparaison");
    }

    const algorithms: ComparisonMetrics[] = predictions.map((prediction) => ({
      prediction,
      overlaps: AlgorithmComparisonService.calculateOverlaps(prediction, predictions),
      uniqueness: AlgorithmComparisonService.calculateUniqueness(prediction, predictions),
      diversity: AlgorithmComparisonService.calculateDiversity(prediction.numbers),
      consistency: AlgorithmComparisonService.calculateConsistency(prediction, results),
      reliability: AlgorithmComparisonService.calculateReliability(prediction),
    }));

    const consensus = AlgorithmComparisonService.analyzeConsensus(predictions);
    const recommendations = AlgorithmComparisonService.generateRecommendations(algorithms);
    const riskAssessment = AlgorithmComparisonService.assessRisk(predictions);

    return {
      algorithms,
      consensus,
      recommendations,
      riskAssessment,
    };
  }

  private static calculateOverlaps(
    target: AlgorithmPrediction,
    allPredictions: AlgorithmPrediction[],
  ): Array<{ algorithmId: string; algorithmName: string; commonNumbers: number[]; overlapScore: number }> {
    return allPredictions
      .filter((pred) => pred.id !== target.id)
      .map((pred) => {
        const commonNumbers = target.numbers.filter((num) => pred.numbers.includes(num));
        const overlapScore = commonNumbers.length / 5;
        return {
          algorithmId: pred.id,
          algorithmName: pred.name,
          commonNumbers,
          overlapScore,
        };
      })
      .sort((a, b) => b.overlapScore - a.overlapScore);
  }

  private static calculateUniqueness(target: AlgorithmPrediction, allPredictions: AlgorithmPrediction[]): number {
    const otherPredictions = allPredictions.filter((pred) => pred.id !== target.id);
    const allOtherNumbers = new Set(otherPredictions.flatMap((pred) => pred.numbers));
    const uniqueNumbers = target.numbers.filter((num) => !allOtherNumbers.has(num));
    return uniqueNumbers.length / target.numbers.length;
  }

  private static calculateDiversity(numbers: number[]): number {
    const ranges = [[1, 18], [19, 36], [37, 54], [55, 72], [73, 90]];
    const rangeCount = ranges.reduce((count, [min, max]) => {
      return count + (numbers.some((num) => num >= min && num <= max) ? 1 : 0);
    }, 0);
    return rangeCount / ranges.length;
  }

  private static calculateConsistency(prediction: AlgorithmPrediction, results: DrawResult[]): number {
    if (results.length === 0) return 0.5;
    const frequencies: Record<number, number> = {};
    results.forEach((result) => {
      result.gagnants.forEach((num) => {
        frequencies[num] = (frequencies[num] || 0) + 1;
      });
    });
    const avgFrequency = Object.values(frequencies).reduce((sum, freq) => sum + freq, 0) / Object.keys(frequencies).length;
    const predictionFrequencies = prediction.numbers.map((num) => frequencies[num] || 0);
    const predictionAvgFreq = predictionFrequencies.reduce((sum, freq) => sum + freq, 0) / predictionFrequencies.length;
    return Math.max(0, 1 - Math.abs(predictionAvgFreq - avgFrequency) / avgFrequency);
  }

  private static calculateReliability(prediction: AlgorithmPrediction): number {
    let reliabilityScore = prediction.confidence * 0.6;
    if (prediction.accuracy) {
      reliabilityScore += prediction.accuracy * 0.3;
    } else {
      reliabilityScore += 0.15;
    }
    const categoryBonus: Record<string, number> = {
      neural: 0.1,
      "supabase-neural": 0.15,
      ml: 0.08,
      "supabase-ml": 0.12,
      bayesian: 0.05,
      statistical: 0.03,
      "color-analysis": 0.02,
      consensus: 0.1,
    };
    reliabilityScore += (categoryBonus[prediction.category] || 0) * 0.1;
    return Math.min(1, reliabilityScore);
  }

  private static analyzeConsensus(predictions: AlgorithmPrediction[]) {
    const numberCounts: Record<number, number> = {};
    const confidenceSum = predictions.reduce((sum, pred) => sum + pred.confidence, 0);
    predictions.forEach((pred) => {
      pred.numbers.forEach((num) => {
        numberCounts[num] = (numberCounts[num] || 0) + 1;
      });
    });
    const mostAgreedNumbers = Object.entries(numberCounts)
      .map(([num, count]) => ({
        number: Number(num),
        agreementCount: count,
        agreementScore: count / predictions.length,
      }))
      .sort((a, b) => b.agreementScore - a.agreementScore)
      .slice(0, 10);
    const leastAgreedNumbers = Object.entries(numberCounts)
      .filter(([, count]) => count === 1)
      .map(([num]) => ({
        number: Number(num),
        disagreementScore: 1,
      }));
    return {
      mostAgreedNumbers,
      leastAgreedNumbers,
      averageConfidence: confidenceSum / predictions.length,
      confidenceRange: {
        min: Math.min(...predictions.map((p) => p.confidence)),
        max: Math.max(...predictions.map((p) => p.confidence)),
      },
    };
  }

  private static generateRecommendations(algorithms: ComparisonMetrics[]) {
    const sorted = {
      byReliability: [...algorithms].sort((a, b) => b.reliability - a.reliability),
      byUniqueness: [...algorithms].sort((a, b) => b.uniqueness - a.uniqueness),
      byConsistency: [...algorithms].sort((a, b) => b.consistency - a.consistency),
      byConfidence: [...algorithms].sort((a, b) => b.prediction.confidence - a.prediction.confidence),
      byBalance: [...algorithms].sort(
        (a, b) => b.reliability + b.consistency + b.diversity - (a.reliability + a.consistency + a.diversity),
      ),
    };
    return {
      mostReliable: sorted.byReliability[0]?.prediction.name || "Aucun",
      mostUnique: sorted.byUniqueness[0]?.prediction.name || "Aucun",
      bestConsensus: algorithms.find((a) => a.prediction.category === "consensus")?.prediction.name || "Consensus",
      highestConfidence: sorted.byConfidence[0]?.prediction.name || "Aucun",
      balanced: sorted.byBalance[0]?.prediction.name || "Aucun",
    };
  }

  private static assessRisk(predictions: AlgorithmPrediction[]) {
    return {
      conservative: predictions.filter((p) => p.confidence <= 0.6 && p.complexity !== "high"),
      moderate: predictions.filter((p) => p.confidence > 0.6 && p.confidence <= 0.8),
      aggressive: predictions.filter((p) => p.confidence > 0.8 || p.complexity === "high"),
    };
  }

  private static generateConsensusPrediction(predictions: AlgorithmPrediction[]): AlgorithmPrediction {
    if (predictions.length === 0) {
      return {
        id: "consensus_fallback", name: "Consensus (Aucune donnée)", numbers: [1, 2, 3, 4, 5], confidence: 0.3, factors: ["Aucune prédiction disponible"], category: "consensus", score: 0.3, executionTime: 1, complexity: "low", dataRequirement: 0, strengths: ["Fallback safety"], weaknesses: ["Aucune donnée"],
      };
    }
    const numberScores: Record<number, number> = {};
    predictions.forEach((pred) => {
      const weight = pred.confidence * pred.score;
      pred.numbers.forEach((num) => {
        numberScores[num] = (numberScores[num] || 0) + weight;
      });
    });
    const consensusNumbers = Object.entries(numberScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([num]) => Number(num))
      .sort((a, b) => a - b);
    const totalWeight = predictions.reduce((sum, pred) => sum + pred.score, 0);
    const weightedConfidence = predictions.reduce((sum, pred) => sum + pred.confidence * pred.score, 0) / totalWeight;
    const consensusFactors = [
      `Basé sur ${predictions.length} algorithmes`, "Pondération par score et confiance", "Agrégation intelligente", `Confiance moyenne: ${(weightedConfidence * 100).toFixed(1)}%`,
    ];
    return {
      id: "consensus_main", name: "Algorithme de Consensus", numbers: consensusNumbers, confidence: Math.min(0.95, weightedConfidence * 1.1), factors: consensusFactors, category: "consensus", score: weightedConfidence * 0.95, accuracy: 0.75, executionTime: predictions.reduce((sum, pred) => sum + pred.executionTime, 0), complexity: "high", dataRequirement: Math.max(...predictions.map((p) => p.dataRequirement)), strengths: ["Combine tous les algorithmes", "Réduit les biais individuels", "Confiance élevée"], weaknesses: ["Complexité élevée", "Temps de calcul", "Dépendance aux données"],
    };
  }

  // MODIFICATION: Mise à jour des métadonnées pour refléter les nouveaux algorithmes
  private static getComplexity(category: string): "low" | "medium" | "high" {
    const complexityMap: Record<string, "low" | "medium" | "high"> = {
      statistical: "medium", // Était 'low'
      bayesian: "medium",
      ml: "high",
      neural: "high", // Représente maintenant la régression, donc 'medium' serait aussi juste
      variance: "high", // Était 'medium'
    };
    return complexityMap[category] || "medium";
  }

  private static getDataRequirement(category: string): number {
    const dataMap: Record<string, number> = {
      statistical: 20,
      bayesian: 30,
      ml: 50,
      neural: 100,
      variance: 50,
    };
    return dataMap[category] || 50;
  }

  private static getStrengths(category: string): string[] {
    const strengthsMap: Record<string, string[]> = {
      statistical: ["Rapide", "Robuste", "Pondéré"],
      bayesian: ["Probabiliste", "Logique", "Basé sur preuves"],
      ml: ["Détecte clusters", "Non-linéaire", "Adaptatif"],
      neural: ["Analyse temporelle", "Prédictif", "Tendance"],
      variance: ["Statistiquement solide", "Analyse de corrélation", "Robuste"],
    };
    return strengthsMap[category] || ["Algorithme spécialisé"];
  }

  private static getWeaknesses(category: string): string[] {
    const weaknessesMap: Record<string, string[]> = {
      statistical: ["Sensible aux outliers", "Linéaire"],
      bayesian: ["Simplifications (Naive)", "Dépend des données initiales"],
      ml: ["K-means sensible à l'init", "Simplifié"],
      neural: ["Régression simple", "Pas un vrai NN"],
      variance: ["Suppose une distribution normale", "Complexe"],
    };
    return weaknessesMap[category] || ["Limitations standard"];
  }
  
    static compareTwo(
    pred1: AlgorithmPrediction,
    pred2: AlgorithmPrediction,
  ): {
    commonNumbers: number[];
    uniqueToPred1: number[];
    uniqueToPred2: number[];
    similarityScore: number;
    confidenceDiff: number;
    recommendation: string;
  } {
    const commonNumbers = pred1.numbers.filter((num) => pred2.numbers.includes(num));
    const uniqueToPred1 = pred1.numbers.filter((num) => !pred2.numbers.includes(num));
    const uniqueToPred2 = pred2.numbers.filter((num) => !pred1.numbers.includes(num));
    const similarityScore = commonNumbers.length / 5;
    const confidenceDiff = Math.abs(pred1.confidence - pred2.confidence);

    let recommendation: string;
    if (similarityScore > 0.6) {
      recommendation = "Prédictions très similaires - forte convergence";
    } else if (similarityScore > 0.2) {
      recommendation = "Convergence partielle - approches complémentaires";
    } else {
      recommendation = "Prédictions divergentes - stratégies différentes";
    }

    return {
      commonNumbers,
      uniqueToPred1,
      uniqueToPred2,
      similarityScore,
      confidenceDiff,
      recommendation,
    };
  }
}
