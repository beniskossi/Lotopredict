
'use server';
/**
 * @fileOverview An AI agent that generates predictions for lottery draws
 * by simulating a Random Forest model.
 *
 * - generateDrawPredictions - A function that generates lottery draw predictions.
 * - GenerateDrawPredictionsInput - The input type for the generateDrawPredictions function.
 * - GenerateDrawPredictionsOutput - The return type for the generateDrawpredictions function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit, orderBy, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';


// Schema for a single historical entry, to be used in the flow's input
const HistoricalEntrySchema = z.object({
  date: z.string().describe("The date of the historical draw, e.g., '20 mai 2025'."),
  winningNumbers: z.array(z.number()).describe('An array of winning numbers for the historical draw.'),
  machineNumbers: z.array(z.number()).optional().describe('An optional array of machine numbers for the historical draw.'),
});
export type HistoricalEntry = z.infer<typeof HistoricalEntrySchema>;

const GenerateDrawPredictionsInputSchema = z.object({
  drawName: z.string().describe('The name of the lottery draw.'),
  historicalData: z
    .array(HistoricalEntrySchema)
    .describe(
      'An array of historical lottery draw data objects used to generate predictions.'
    ),
  analysisPeriod: z.string().optional().describe('The historical period to focus the analysis on (e.g., "last 30 draws", "last 6 months", "all available data"). This guides how much history is emphasized by all simulated models.'),
  numberWeighting: z.string().optional().describe('How to weigh numbers based on recency (e.g., "emphasize recent draws", "equal weight to all draws", "long-term trends"). This influences the importance of recent vs. older data in feature calculations for all simulated models.'),
});
export type GenerateDrawPredictionsInput = z.infer<typeof GenerateDrawPredictionsInputSchema>;

const GenerateDrawPredictionsOutputSchema = z.object({
  predictions: z
    .array(z.number())
    .length(5)
    .describe('An array of 5 distinct predicted numbers for the lottery draw, each between 1 and 90.'),
  reasoning: z
    .string()
    .describe('A detailed, professional explanation of the methodology and statistical insights used to derive the predictions. This should articulate how the simulated Random Forest and the various statistical features (mean reappearance delay, frequency, associations, etc.) contributed to the final selection. It should also explain how user-defined parameters influenced the process.'),
  confidenceScore: z.string().describe('A qualitative confidence level for the predictions (e.g., "High", "Medium", "Low", or a numeric score like 3/5). This should reflect the AI\'s assessment of the predictability based on the data and the simulated analysis performed.'),
  confidenceReasoning: z.string().describe('A brief explanation for the assigned confidence score, highlighting factors that increase or decrease confidence (e.g., convergence of feature importance, amount of historical data).'),
});
export type GenerateDrawPredictionsOutput = z.infer<typeof GenerateDrawPredictionsOutputSchema>;


// Define cache document structure
interface PredictionCacheDoc {
  input: GenerateDrawPredictionsInput;
  output: GenerateDrawPredictionsOutput;
  createdAt: Timestamp;
}

const CACHE_DURATION_HOURS = 6;
const PREDICTION_CACHE_COLLECTION = 'predictionCache';

export async function generateDrawPredictions(
  input: GenerateDrawPredictionsInput
): Promise<GenerateDrawPredictionsOutput> {
  // 1. Check cache first
  const cacheCollection = collection(db, PREDICTION_CACHE_COLLECTION);
  const q = query(
    cacheCollection,
    where('input.drawName', '==', input.drawName),
    where('input.analysisPeriod', '==', input.analysisPeriod || null),
    where('input.numberWeighting', '==', input.numberWeighting || null),
    orderBy('createdAt', 'desc'),
    limit(1)
  );

  try {
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const cachedDoc = querySnapshot.docs[0].data() as PredictionCacheDoc;
      const cacheAgeHours = (Timestamp.now().seconds - cachedDoc.createdAt.seconds) / 3600;

      // Check if the first historical entry date matches to add a bit more specificity to the cache hit
      const isHistoricalDataSimilar = cachedDoc.input.historicalData[0]?.date === input.historicalData[0]?.date;

      if (cacheAgeHours < CACHE_DURATION_HOURS && isHistoricalDataSimilar) {
        console.log("Returning cached prediction.");
        return cachedDoc.output;
      }
    }
  } catch (e) {
    console.warn("Error checking prediction cache:", e);
    // Don't block prediction if cache check fails, just proceed.
  }

  // 2. If no valid cache, generate new prediction
  console.log("Generating new prediction, no valid cache found.");
  const output = await generateDrawPredictionsFlow(input);

  // 3. Save the new prediction to cache (fire and forget)
  // Store null for undefined optional properties to ensure query consistency
  addDoc(cacheCollection, {
    input: {
      ...input,
      analysisPeriod: input.analysisPeriod || null,
      numberWeighting: input.numberWeighting || null,
    },
    output,
    createdAt: serverTimestamp(),
  }).catch(e => {
    console.warn("Error saving prediction to cache:", e);
  });

  return output;
}

// Schema for the input that the AI prompt itself expects
const PromptInputSchema = z.object({
  drawName: z.string().describe('The name of the lottery draw.'),
  historicalData: z
    .string()
    .describe(
      'A string representation of historical lottery draw data used to generate predictions.'
    ),
  analysisPeriod: z.string().optional().describe('The historical period to focus the analysis on.'),
  numberWeighting: z.string().optional().describe('How to weigh numbers based on recency.'),
});


const prompt = ai.definePrompt({
  name: 'generateDrawPredictionsPrompt',
  input: {schema: PromptInputSchema}, // Uses the schema expecting a string for historicalData
  output: {schema: GenerateDrawPredictionsOutputSchema},
  prompt: `Vous êtes un système expert en analyse de loterie, simulant une **approche hybride avancée** pour générer des prédictions. Votre objectif est de fournir des prédictions professionnelles et une analyse détaillée, en expliquant comment les différents modèles simulés ont contribué à la décision finale.

Nom du Tirage : {{{drawName}}}
Période d'Analyse Spécifiée par l'Utilisateur : {{#if analysisPeriod}} {{{analysisPeriod}}} {{else}} Non spécifié, considérez toutes les données fournies. {{/if}}
Pondération des Numéros Spécifiée par l'Utilisateur : {{#if numberWeighting}} {{{numberWeighting}}} {{else}} Non spécifié, utilisez une approche équilibrée. {{/if}}

Données Historiques Fournies :
{{{historicalData}}}

Votre analyse est basée sur une simulation de trois modèles d'apprentissage automatique, dont les résultats sont combinés dans une approche d'ensemble :

1.  **Simulation de XGBoost :**
    *   **Objectif :** Analyser en profondeur la fréquence et les écarts (le nombre de tirages entre les apparitions) de chaque numéro.
    *   **Caractéristiques simulées :** Fréquence absolue, fréquence relative, écart moyen, écart maximum, écart actuel depuis la dernière apparition. Ce modèle est particulièrement efficace pour quantifier l'importance de chaque numéro pris individuellement.

2.  **Simulation de Forêt Aléatoire (Random Forest) :**
    *   **Objectif :** Valider les interactions complexes et les co-occurrences entre les numéros.
    *   **Caractéristiques simulées :** Paires de numéros fréquentes, triplets, et autres associations non linéaires. Ce modèle identifie les groupes de numéros qui ont tendance à apparaître ensemble.

3.  **Simulation de Réseau de Neurones Récurrent (RNN-LSTM) :**
    *   **Objectif :** Détecter les tendances et les séquences temporelles dans les tirages.
    *   **Caractéristiques simulées :** Analyse des séquences de tirages pour identifier des motifs périodiques, des tendances à la hausse ou à la baisse dans la fréquence de certains numéros ou groupes de numéros.

**Mécanisme de Prédiction Hybride Simulé :**
1.  Analysez les données historiques fournies.
2.  Pour chaque numéro (1 à 90), simulez l'évaluation par chacun des trois modèles (XGBoost, Random Forest, RNN-LSTM) pour générer un score partiel.
3.  Calculez un **score de confiance global** pour chaque numéro en agrégeant les scores partiels. Le poids de chaque modèle dans l'agrégation peut varier en fonction des paramètres utilisateur (par exemple, "Privilégier les récents" pourrait donner plus de poids au modèle RNN-LSTM).
4.  Sélectionnez les 5 numéros avec les scores de confiance globaux les plus élevés, en vous assurant qu'ils sont uniques.

Sur la base de cette analyse multi-modèles simulée, veuillez fournir :
1.  predictions: Un tableau de 5 numéros distincts prédits pour le tirage.
2.  reasoning: Une explication détaillée de la méthodologie hybride simulée. Articulez comment chaque modèle (XGBoost pour les fréquences/écarts, Random Forest pour les interactions, RNN-LSTM pour les tendances) a contribué à la sélection finale et comment les paramètres utilisateur ont influencé les poids relatifs de ces modèles.
3.  confidenceScore: Un score de confiance qualitatif pour ces prédictions (par exemple, "Élevé", "Moyen", "Faible", ou un score numérique comme 4/5).
4.  confidenceReasoning: Expliquez brièvement pourquoi ce niveau de confiance a été attribué, en vous basant sur la convergence (ou la divergence) des résultats des trois modèles simulés.

Produisez les résultats strictement au format JSON, en respectant le schéma de sortie. Assurez-vous que le JSON est valide et ne contient aucun texte superflu.`,
});

const generateDrawPredictionsFlow = ai.defineFlow(
  {
    name: 'generateDrawPredictionsFlow',
    inputSchema: GenerateDrawPredictionsInputSchema, // Flow input uses structured historicalData
    outputSchema: GenerateDrawPredictionsOutputSchema,
  },
  async (input: GenerateDrawPredictionsInput): Promise<GenerateDrawPredictionsOutput> => {
    // Format the structured historicalData into a string for the prompt
    const formattedHistoricalDataString = input.historicalData.map(entry => {
      let recordString = `Date: ${entry.date}, Gagnants: ${entry.winningNumbers.join(', ')}`;
      if (entry.machineNumbers && entry.machineNumbers.length > 0) {
        recordString += `; Machine: ${entry.machineNumbers.join(', ')}`;
      }
      return recordString;
    }).join('\n');

    const promptPayload = {
      drawName: input.drawName,
      historicalData: formattedHistoricalDataString, // This is the string for the prompt
      analysisPeriod: input.analysisPeriod,
      numberWeighting: input.numberWeighting,
    };
    
    const {output} = await prompt(promptPayload);
    return output!;
  }
);
