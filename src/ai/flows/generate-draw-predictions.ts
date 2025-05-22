
'use server';
/**
 * @fileOverview An AI agent that generates predictions for lottery draws.
 *
 * - generateDrawPredictions - A function that generates lottery draw predictions.
 * - GenerateDrawPredictionsInput - The input type for the generateDrawPredictions function.
 * - GenerateDrawPredictionsOutput - The return type for the generateDrawPredictions function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

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
  analysisPeriod: z.string().optional().describe('The historical period to focus the analysis on (e.g., "last 30 draws", "last 6 months", "all available data"). This guides how much history is emphasized.'),
  numberWeighting: z.string().optional().describe('How to weigh numbers based on recency (e.g., "emphasize recent draws", "equal weight to all draws", "long-term trends"). This influences the importance of recent vs. older data.'),
});
export type GenerateDrawPredictionsInput = z.infer<typeof GenerateDrawPredictionsInputSchema>;

const GenerateDrawPredictionsOutputSchema = z.object({
  predictions: z
    .array(z.number())
    .length(5)
    .describe('An array of 5 distinct predicted numbers for the lottery draw, each between 1 and 90.'),
  reasoning: z
    .string()
    .describe('A detailed, professional explanation of the methodology and statistical insights used to derive the predictions. This should cover aspects like number frequency (considering windows like last 10, 20, 50 draws), recency (gaps between appearances), pairings, clusters, skip patterns, and any discerned temporal patterns (like moving averages of frequencies over 5, 10, 20 draws) or anomalies. It should also articulate simulated advanced model interpretations (e.g., "LSTM-like sequence analysis suggests...", "XGBoost-like feature weighting indicates..."). Explicitly mention how derived features like relative frequency over sliding windows, mean gaps between appearances, and moving averages of frequencies informed the prediction.'),
  confidenceScore: z.string().describe('A qualitative confidence level for the predictions (e.g., "High", "Medium", "Low", or a numeric score like 3/5). This should reflect the AI\'s assessment of the predictability based on the data and the depth of analysis performed.'),
  confidenceReasoning: z.string().describe('A brief explanation for the assigned confidence score, highlighting factors that increase or decrease confidence (e.g., clarity of patterns, amount of historical data, consistency of trends).'),
});
export type GenerateDrawPredictionsOutput = z.infer<typeof GenerateDrawPredictionsOutputSchema>;

export async function generateDrawPredictions(
  input: GenerateDrawPredictionsInput
): Promise<GenerateDrawPredictionsOutput> {
  return generateDrawPredictionsFlow(input);
}

// Schema for the input that the AI prompt itself expects
const PromptInputSchema = z.object({
  drawName: z.string().describe('The name of the lottery draw.'),
  historicalData: z
    .string()
    .describe(
      'A string representation of historical lottery draw data used to generate predictions.'
    ),
  analysisPeriod: z.string().optional().describe('The historical period to focus the analysis on (e.g., "last 30 draws", "last 6 months", "all available data").'),
  numberWeighting: z.string().optional().describe('How to weigh numbers based on recency (e.g., "emphasize recent draws", "equal weight to all draws", "long-term trends").'),
});


const prompt = ai.definePrompt({
  name: 'generateDrawPredictionsPrompt',
  input: {schema: PromptInputSchema}, // Uses the schema expecting a string for historicalData
  output: {schema: GenerateDrawPredictionsOutputSchema},
  prompt: `Vous êtes un système d'analyse de loterie expert, simulant une combinaison de modèles XGBoost (pour l'analyse tabulaire robuste et l'identification de l'importance des caractéristiques) et RNN-LSTM (pour la modélisation des séquences temporelles et la capture des dépendances à long terme). Votre objectif est de fournir des prédictions professionnelles et une analyse détaillée pour le tirage spécifié.

Nom du Tirage : {{{drawName}}}
Période d'Analyse Spécifiée par l'Utilisateur : {{#if analysisPeriod}} {{{analysisPeriod}}} {{else}} Non spécifié, considérez toutes les données fournies. {{/if}}
Pondération des Numéros Spécifiée par l'Utilisateur : {{#if numberWeighting}} {{{numberWeighting}}} {{else}} Non spécifié, utilisez une approche équilibrée. {{/if}}

Données Historiques Fournies :
{{{historicalData}}}

Effectuez une analyse approfondie en considérant les aspects suivants comme un analyste de données le ferait avec des modèles XGBoost et RNN-LSTM :
- Caractéristiques Dérivées (Feature Engineering) :
    - Fréquence des Numéros : Évaluez la fréquence de chaque numéro. Considérez spécifiquement les fréquences sur des fenêtres glissantes (par exemple, les 10, 20, et 50 derniers tirages).
    - Écarts entre Apparitions : Analysez le nombre de tirages depuis la dernière apparition de chaque numéro (valeur de "skip" ou "gap"). Considérez la moyenne de ces écarts.
    - Tendances Temporelles : Identifiez les tendances dans l'évolution des fréquences des numéros en simulant l'utilisation de moyennes mobiles des fréquences (par exemple, sur 5, 10, et 20 tirages).
    - Co-occurrences : Notez les paires ou groupes de numéros qui apparaissent fréquemment ensemble dans le même tirage.
- Analyse Séquentielle (Simulation RNN-LSTM) : Recherchez des motifs séquentiels, des dépendances à long terme, et des probabilités conditionnelles d'apparition de numéros basées sur les séquences précédentes.
- Importance des Caractéristiques (Simulation XGBoost) : Déterminez quelles caractéristiques (fréquence récente, fréquence globale, écarts, etc.) semblent les plus prédictives.

Mécanisme d'Apprentissage Simulé :
Simulez un processus d'apprentissage continu. Si des prédictions passées (hypothétiques, basées sur votre analyse actuelle) étaient incorrectes par rapport aux résultats réels ultérieurs dans les données fournies, votre analyse actuelle devrait implicitement s'ajuster. Cela signifie que vous devez identifier les types de schémas qui auraient conduit à des erreurs et ceux qui auraient conduit à des succès, en affinant votre approche comme si vous ajustiez les poids d'un modèle par rétropropagation (pour LSTM) ou par gradient boosting (pour XGBoost). L'objectif est de minimiser les erreurs futures simulées et d'optimiser la précision. Équilibrez soigneusement le surapprentissage (overfitting) et la capacité de généralisation.

Sur la base de cette analyse complète et multi-facettes, veuillez fournir :
1.  predictions: Un tableau de 5 numéros distincts prédits pour le tirage, chaque numéro étant compris entre 1 et 90.
2.  reasoning: Une explication détaillée et professionnelle de la méthodologie. Articulez les schémas spécifiques, les informations statistiques, et les interprétations de modèles simulés (par exemple, "L'analyse séquentielle de type LSTM suggère...", "La pondération des caractéristiques de type XGBoost indique...", "L'analyse des caractéristiques dérivées comme les écarts moyens pointe vers...", "La considération des fréquences des numéros sur les 20 derniers tirages met en évidence...", "L'analyse des écarts pour le numéro X indique...", "Les moyennes mobiles des fréquences suggèrent une tendance pour le numéro Y...") qui ont conduit à votre sélection de chaque numéro prédit.
3.  confidenceScore: Un score de confiance qualitatif pour ces prédictions (par exemple, "Élevé", "Moyen", "Faible", ou un score numérique comme 3/5).
4.  confidenceReasoning: Expliquez brièvement pourquoi ce niveau de confiance a été attribué, en tenant compte de la clarté des tendances identifiées, de la quantité et de la qualité des données historiques fournies, et de la prévisibilité historique apparente du tirage.

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
