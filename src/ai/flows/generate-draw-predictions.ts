
'use server';
/**
 * @fileOverview An AI agent that generates predictions for lottery draws
 * by simulating a Random Forest model.
 *
 * - generateDrawPredictions - A function that generates lottery draw predictions.
 * - GenerateDrawPredictionsInput - The input type for the generateDrawPredictions function.
 * - GenerateDrawPredictionsOutput - The return type for the generateDrawPredictions function.
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
  prompt: `Vous êtes un système expert en analyse de loterie simulant un modèle de Forêt Aléatoire (Random Forest) pour générer des prédictions. Votre objectif est de fournir des prédictions professionnelles et une analyse détaillée, expliquant comment les différentes caractéristiques statistiques ont influencé la décision finale du modèle simulé.

Nom du Tirage : {{{drawName}}}
Période d'Analyse Spécifiée par l'Utilisateur : {{#if analysisPeriod}} {{{analysisPeriod}}} {{else}} Non spécifié, considérez toutes les données fournies. {{/if}}
Pondération des Numéros Spécifiée par l'Utilisateur : {{#if numberWeighting}} {{{numberWeighting}}} {{else}} Non spécifié, utilisez une approche équilibrée. {{/if}}

Données Historiques Fournies :
{{{historicalData}}}

Votre simulation de Forêt Aléatoire est entraînée sur la base des caractéristiques suivantes, calculées pour chaque numéro (de 1 à 90) :

1.  **Délai moyen avant réapparition** : Le nombre moyen de tirages qu'il faut à un numéro pour réapparaître après sa dernière sortie. Ceci permet d'identifier les numéros potentiellement "en retard".
2.  **Fréquence d'apparition** : La fréquence absolue (nombre total d'apparitions) de chaque numéro dans les données historiques fournies.
3.  **Numéro le plus fréquent associé** : Pour un numéro donné, identifier le numéro qui est apparu le plus souvent dans le même tirage que lui.
4.  **Stratégie "Numéro + 20"** : Pour chaque numéro, calculer la fréquence de sa contrepartie "numéro + 20" (si le résultat est inférieur ou égal à 90) dans les tirages passés.
5.  **Corrélation Machine/Gagnants** : Si des numéros "machine" sont fournis, analyser la fréquence à laquelle un numéro apparaît en tant que numéro machine par rapport à sa fréquence en tant que numéro gagnant.
6.  **Stratégie de Multiplication par 1,615 (Ratio d'Or)** : Pour chaque numéro du dernier tirage, le multiplier par 1,615, arrondir à l'entier le plus proche, et si le résultat est inférieur ou égal à 90, considérer la fréquence historique de ce numéro dérivé comme une caractéristique.

Mécanisme d'Apprentissage et de Prédiction Simulé (Forêt Aléatoire) :
1.  Analysez les données historiques fournies.
2.  Pour chaque numéro (1 à 90), simulez le calcul de toutes les caractéristiques décrites ci-dessus.
3.  Simulez un entraînement de multiples arbres de décision, chacun sur un sous-ensemble aléatoire des données et des caractéristiques. Les paramètres utilisateur ('Période d'Analyse', 'Pondération des Numéros') influencent l'importance (le poids) accordée à certaines caractéristiques ou à certaines parties des données.
4.  À partir de cet ensemble d'arbres simulé, obtenez un score de confiance agrégé pour chaque numéro.
5.  Sélectionnez les 5 numéros avec les scores agrégés les plus élevés, en vous assurant qu'ils sont uniques.

Sur la base de cette analyse complète et multi-facettes simulée, veuillez fournir :
1.  predictions: Un tableau de 5 numéros distincts prédits pour le tirage, chaque numéro étant compris entre 1 et 90.
2.  reasoning: Une explication détaillée et professionnelle de la méthodologie simulée. Articulez comment l'analyse des caractéristiques (fréquence, délais, associations, +20, multiplication par 1,615, etc.) et le processus de décision de la Forêt Aléatoire simulée ont conduit à la sélection des numéros. Expliquez l'impact des paramètres utilisateur sur votre simulation.
3.  confidenceScore: Un score de confiance qualitatif pour ces prédictions (par exemple, "Élevé", "Moyen", "Faible", ou un score numérique comme 3/5).
4.  confidenceReasoning: Expliquez brièvement pourquoi ce niveau de confiance a été attribué, en tenant compte de la clarté des tendances identifiées par vos simulations et de la convergence des "résultats" des différentes caractéristiques.

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


