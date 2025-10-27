import type { DrawResult } from "@/services/lotteryApi";

// Interfaces (identiques à l'ancien fichier)
interface PredictionAlgorithm {
  name: string;
  description: string;
  weight: number;
  confidence: number;
  category: "statistical" | "ml" | "bayesian" | "neural" | "variance";
}

interface AdvancedPredictionResult {
  numbers: number[];
  confidence: number;
  algorithm: string;
  factors: string[];
  score: number;
  category: "statistical" | "ml" | "bayesian" | "neural" | "variance";
  accuracy?: number;
  expectedROI?: number;
}

// Fonctions utilitaires (certaines améliorées)
function generateRandomPrediction(): number[] {
  const numbers = new Set<number>();
  while (numbers.size < 5) {
    numbers.add(Math.floor(Math.random() * 90) + 1);
  }
  return Array.from(numbers).sort((a, b) => a - b);
}

function generateFallbackPrediction(algorithm: string, category: any): AdvancedPredictionResult {
  return {
    numbers: generateRandomPrediction(),
    confidence: 0.2,
    algorithm: `${algorithm} (Données Insuffisantes)`,
    factors: ["Données insuffisantes", "Mode dégradé"],
    score: 0.2,
    category,
    accuracy: 0.1,
  };
}

function getNumberColorGroup(number: number): string {
    if (number >= 1 && number <= 9) return 'white';
    if (number >= 10 && number <= 19) return 'blue';
    if (number >= 20 && number <= 29) return 'green';
    if (number >= 30 && number <= 39) return 'indigo';
    if (number >= 40 && number <= 49) return 'yellow';
    if (number >= 50 && number <= 59) return 'pink';
    if (number >= 60 && number <= 69) return 'orange';
    if (number >= 70 && number <= 79) return 'gray';
    if (number >= 80 && number <= 90) return 'red';
    return 'unknown';
}

function selectBalancedNumbers(candidates: number[], count: number): number[] {
    if (candidates.length <= count) return candidates;

    const colorGroups: Record<string, number[]> = {};
    candidates.forEach(num => {
        const group = getNumberColorGroup(num);
        if (!colorGroups[group]) {
            colorGroups[group] = [];
        }
        colorGroups[group].push(num);
    });

    const selected: number[] = [];
    const usedGroups: Set<string> = new Set();
    
    // Try to pick one from each available color group first for diversity
    const groupKeys = Object.keys(colorGroups);
    for (let i = 0; i < groupKeys.length && selected.length < count; i++) {
        const group = groupKeys[i];
        if (colorGroups[group].length > 0) {
            const numberToAdd = colorGroups[group].shift();
            if (numberToAdd) {
                selected.push(numberToAdd);
                usedGroups.add(group);
            }
        }
    }

    // Fill remaining spots from the best candidates
    let remainingCandidates = candidates.filter(num => !selected.includes(num));
    while (selected.length < count && remainingCandidates.length > 0) {
        selected.push(remainingCandidates.shift()!);
    }

    return selected.slice(0, count).sort((a, b) => a - b);
}


// --- NOUVEAUX ALGORITHMES AMÉLIORÉS ---

/**
 * 1. Analyse Fréquentielle Pondérée (Améliorée)
 * Prend en compte la récence des tirages avec une décroissance exponentielle.
 * Normalise les scores pour une meilleure comparaison.
 */
export function weightedFrequencyPrediction(results: DrawResult[], drawName: string): AdvancedPredictionResult {
  const drawResults = results.filter((r) => r.draw_name === drawName).slice(0, 100);
  if (drawResults.length < 20) {
    return generateFallbackPrediction("Analyse Fréquentielle", "statistical");
  }

  const weightedFreq: Record<number, number> = {};
  for (let i = 1; i <= 90; i++) weightedFreq[i] = 0;

  let totalWeight = 0;
  drawResults.forEach((result, index) => {
    const weight = Math.exp(-index * 0.05); // Décroissance exponentielle
    totalWeight += weight * result.gagnants.length;
    result.gagnants.forEach((num) => {
      weightedFreq[num] += weight;
    });
  });

  // Normalisation
  for (let i = 1; i <= 90; i++) {
    weightedFreq[i] /= totalWeight;
  }

  const sortedNumbers = Object.entries(weightedFreq)
    .sort(([, a], [, b]) => b - a)
    .map(([num]) => parseInt(num));

  const topCandidates = sortedNumbers.slice(0, 20);
  const prediction = selectBalancedNumbers(topCandidates, 5);
  
  const confidence = Math.min(0.8, Math.max(...Object.values(weightedFreq)) * 10);

  return {
    numbers: prediction.sort((a, b) => a - b),
    confidence,
    algorithm: "Analyse Fréquentielle Pondérée",
    factors: ["Fréquence", "Pondération temporelle", "Normalisation"],
    score: confidence * 0.8,
    category: "statistical",
  };
}

/**
 * 2. Reconnaissance de Patterns (ML Simplifié)
 * Utilise un k-means simplifié pour trouver des clusters de numéros.
 */
export function machineLearningPrediction(results: DrawResult[], drawName: string): AdvancedPredictionResult {
  const drawResults = results.filter((r) => r.draw_name === drawName).slice(0, 200);
  if (drawResults.length < 50) {
    return generateFallbackPrediction("Pattern ML", "ml");
  }

  // k-means simplifié pour trouver des clusters
  const numClusters = 5;
  let centroids = Array.from({ length: numClusters }, () => drawResults[Math.floor(Math.random() * drawResults.length)].gagnants);
  let clusters: number[][][] = [];

  for (let iter = 0; iter < 10; iter++) {
    clusters = Array.from({ length: numClusters }, () => []);
    drawResults.forEach(result => {
      let bestCluster = 0;
      let minDistance = Infinity;
      for (let i = 0; i < numClusters; i++) {
        const distance = result.gagnants.reduce((dist, num, idx) => dist + Math.abs(num - (centroids[i][idx] || 0)), 0);
        if (distance < minDistance) {
          minDistance = distance;
          bestCluster = i;
        }
      }
      clusters[bestCluster].push(result.gagnants);
    });

    centroids = clusters.map(cluster => {
      if (cluster.length === 0) return Array(5).fill(0);
      const avg = Array(5).fill(0);
      cluster.forEach(draw => {
        draw.forEach((num, idx) => avg[idx] += num);
      });
      return avg.map(sum => Math.round(sum / cluster.length));
    });
  }

  const largestCluster = clusters.reduce((largest, current) => current.length > largest.length ? current : largest, []);
  if (largestCluster.length === 0) return generateFallbackPrediction("Pattern ML", "ml");

  const numberScores: Record<number, number> = {};
  largestCluster.flat().forEach(num => {
    numberScores[num] = (numberScores[num] || 0) + 1;
  });

  const prediction = Object.entries(numberScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([num]) => parseInt(num));

  const confidence = Math.min(0.85, (largestCluster.length / drawResults.length) * 1.2);

  return {
    numbers: prediction.sort((a, b) => a - b),
    confidence,
    algorithm: "ML - Clustering k-means",
    factors: ["Clustering", "Détection de groupes", "Centroïdes"],
    score: confidence * 0.85,
    category: "ml",
  };
}

/**
 * 3. Inférence Bayésienne (Naive Bayes Corrigé)
 * Utilise une approche Naive Bayes pour calculer la probabilité de chaque numéro.
 */
export function bayesianPrediction(results: DrawResult[], drawName: string): AdvancedPredictionResult {
  const drawResults = results.filter((r) => r.draw_name === drawName).slice(0, 150);
  if (drawResults.length < 30) {
    return generateFallbackPrediction("Inférence Bayésienne", "bayesian");
  }

  const totalDraws = drawResults.length;
  const numberCounts: Record<number, number> = {};
  for (let i = 1; i <= 90; i++) numberCounts[i] = 0;

  drawResults.forEach(result => {
    result.gagnants.forEach(num => {
      numberCounts[num]++;
    });
  });

  // Prior: probabilité de base de chaque numéro
  const prior = 1 / 90;

  // Likelihood: P(num | 나왔다) - probabilité que le numéro soit tiré
  const likelihood: Record<number, number> = {};
  for (let i = 1; i <= 90; i++) {
    likelihood[i] = (numberCounts[i] + 1) / (totalDraws + 2); // Lissage de Laplace
  }

  // Posterior: P(num | data) ∝ P(data | num) * P(num)
  // Ici, on simplifie en utilisant le likelihood comme score principal
  const posterior = likelihood;

  const prediction = Object.entries(posterior)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([num]) => parseInt(num));

  const confidence = Math.min(0.8, Math.max(...Object.values(posterior)) / (1/90));

  return {
    numbers: prediction.sort((a, b) => a - b),
    confidence,
    algorithm: "Inférence Bayésienne (Naive)",
    factors: ["Probabilité à priori", "Vraisemblance", "Lissage de Laplace"],
    score: confidence * 0.82,
    category: "bayesian",
  };
}

/**
 * 4. Analyse de Séries Temporelles (Régression Linéaire)
 * Simule un réseau de neurones en utilisant une régression linéaire pour prédire la prochaine position.
 */
export function neuralNetworkPrediction(results: DrawResult[], drawName: string): AdvancedPredictionResult {
  const drawResults = results.filter((r) => r.draw_name === drawName).slice(0, 300);
  if (drawResults.length < 100) {
    return generateFallbackPrediction("Analyse Temporelle", "neural");
  }

  const numberPositions: Record<number, number[]> = {};
  for (let i = 1; i <= 90; i++) numberPositions[i] = [];

  drawResults.forEach((result, index) => {
    result.gagnants.forEach(num => {
      numberPositions[num].push(index);
    });
  });

  const nextDrawIndex = drawResults.length;
  const predictions: Record<number, number> = {};

  for (let i = 1; i <= 90; i++) {
    const positions = numberPositions[i];
    if (positions.length < 2) {
      predictions[i] = 0;
      continue;
    }

    // Régression linéaire simple: y = mx + b
    const n = positions.length;
    const sum_x = positions.reduce((a, b) => a + b, 0);
    const sum_y = Array.from({ length: n }, (_, i) => i).reduce((a, b) => a + b, 0);
    const sum_xy = positions.reduce((sum, pos, idx) => sum + pos * idx, 0);
    const sum_xx = positions.reduce((sum, pos) => sum + pos * pos, 0);

    const m = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x);
    const b = (sum_y - m * sum_x) / n;

    const nextAppearance = (m * nextDrawIndex + b);
    predictions[i] = 1 / (1 + Math.abs(nextAppearance - n)); // Proximité de la prochaine apparition attendue
  }

  const sortedPredictions = Object.entries(predictions)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([num]) => parseInt(num));

  const confidence = Math.min(0.9, Math.max(...Object.values(predictions)) * 1.5);

  return {
    numbers: sortedPredictions.sort((a, b) => a - b),
    confidence,
    algorithm: "Séries Temporelles (Régression)",
    factors: ["Régression linéaire", "Prédiction de position", "Analyse de tendance"],
    score: confidence * 0.9,
    category: "neural",
  };
}


/**
 * 5. Analyse de Variance et Corrélation (Corrigée)
 * Utilise ANOVA simplifié et une analyse de corrélation corrigée.
 */
export function varianceAnalysisPrediction(results: DrawResult[], drawName: string): AdvancedPredictionResult {
  const drawResults = results.filter((r) => r.draw_name === drawName).slice(0, 250);
  if (drawResults.length < 50) {
    return generateFallbackPrediction("Analyse de Variance", "variance");
  }

  // ANOVA simplifié: variance des apparitions par jour de la semaine
  const dayGroups: Record<number, number[][]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  drawResults.forEach(r => {
    const day = new Date(r.date).getDay();
    dayGroups[day].push(r.gagnants);
  });

  const numberScores: Record<number, number> = {};
  for (let i = 1; i <= 90; i++) {
    const appearancesByDay = Object.values(dayGroups).map(group =>
      group.flat().filter(num => num === i).length
    );
    const mean = appearancesByDay.reduce((a, b) => a + b, 0) / appearancesByDay.length;
    const variance = appearancesByDay.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / appearancesByDay.length;
    numberScores[i] = 1 / (1 + variance); // Faible variance = score élevé
  }

  // Corrélation corrigée
  const correlations: Record<number, number> = {};
    for (let i = 1; i <= 90; i++) correlations[i] = 0;

    for (let num1 = 1; num1 <= 90; num1++) {
        for (let num2 = num1 + 1; num2 <= 90; num2++) {
            const correlation = calculatePairCorrelation(drawResults, num1, num2);
            if (!isNaN(correlation)) {
                correlations[num1] += Math.abs(correlation);
                correlations[num2] += Math.abs(correlation);
            }
        }
    }

  // Combinaison des scores
  const finalScores: Record<number, number> = {};
    for (let i = 1; i <= 90; i++) {
        finalScores[i] = (numberScores[i] || 0) * 0.6 + (correlations[i] || 0) * 0.4;
    }

  const prediction = Object.entries(finalScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([num]) => parseInt(num));

  const confidence = Math.min(0.85, Math.max(...Object.values(finalScores)));

  return {
    numbers: prediction.sort((a, b) => a - b),
    confidence,
    algorithm: "Analyse Variance & Corrélation",
    factors: ["ANOVA (jour)", "Matrice de corrélation", "Analyse de variance"],
    score: confidence * 0.86,
    category: "variance",
  };
}

// Fonction de corrélation corrigée pour éviter les NaN
function calculatePairCorrelation(results: DrawResult[], num1: number, num2: number): number {
  let both = 0, only1 = 0, only2 = 0, none = 0;
  results.forEach(r => {
    const has1 = r.gagnants.includes(num1);
    const has2 = r.gagnants.includes(num2);
    if (has1 && has2) both++;
    else if (has1) only1++;
    else if (has2) only2++;
    else none++;
  });

  const n = results.length;
  const numerator = (both * none - only1 * only2);
  const denominator = Math.sqrt((both + only1) * (only2 + none) * (both + only2) * (only1 + none));

  if (denominator === 0) return 0; // Éviter la division par zéro
  return numerator / denominator;
}

// Fonction principale qui appelle les nouveaux algorithmes
export function generateAdvancedPredictions(results: DrawResult[], drawName: string): AdvancedPredictionResult[] {
  return [
    weightedFrequencyPrediction(results, drawName),
    machineLearningPrediction(results, drawName),
    bayesianPrediction(results, drawName),
    neuralNetworkPrediction(results, drawName),
    varianceAnalysisPrediction(results, drawName),
  ].sort((a, b) => b.score - a.score);
}
