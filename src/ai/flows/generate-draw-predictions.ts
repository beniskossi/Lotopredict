
'use server';
/**
 * @fileOverview An AI agent that generates predictions for lottery draws
 * by simulating a hybrid of XGBoost, Random Forest, and RNN-LSTM models.
 *
 * - generateDrawPredictions - A function that generates lottery draw predictions.
 * - GenerateDrawPredictionsInput - The input type for the generateDrawPredictions function.
 * - GenerateDrawPredictionsOutput - The return type for the generateDrawpredictions function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

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
});
export type GenerateDrawPredictionsInput = z.infer<typeof GenerateDrawPredictionsInputSchema>;

const GenerateDrawPredictionsOutputSchema = z.object({
  predictions: z
    .array(z.number())
    .length(5)
    .describe('An array of 5 distinct predicted numbers for the lottery draw, each between 1 and 90.'),
  reasoning: z
    .string()
    .describe('A detailed, professional explanation of the hybrid methodology and statistical insights used to derive the predictions. This should articulate how the simulated XGBoost, Random Forest, and RNN-LSTM models contributed to the final selection.'),
  confidenceScore: z.string().describe('A qualitative confidence level for the predictions (e.g., "High", "Medium", "Low", or a numeric score like 3/5). This should reflect the AI\'s assessment of the predictability based on the data and the simulated analysis performed.'),
  confidenceReasoning: z.string().describe('A brief explanation for the assigned confidence score, highlighting factors that increase or decrease confidence (e.g., convergence of feature importance, amount of historical data).'),
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
});


const prompt = ai.definePrompt({
  name: 'generateDrawPredictionsPrompt',
  input: {schema: PromptInputSchema}, // Uses the schema expecting a string for historicalData
  output: {schema: GenerateDrawPredictionsOutputSchema},
  prompt: `Vous êtes un système expert en analyse de loterie, simulant une **approche hybride avancée** pour générer des prédictions. Votre objectif est de fournir des prédictions professionnelles et une analyse détaillée.

Nom du Tirage : {{{drawName}}}

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
3.  Calculez un **score de confiance global** pour chaque numéro en agrégeant les scores partiels.
4.  Sélectionnez les 5 numéros avec les scores de confiance globaux les plus élevés, en vous assurant qu'ils sont uniques.

Sur la base de cette analyse multi-modèles simulée, veuillez fournir :
1.  predictions: Un tableau de 5 numéros distincts prédits pour le tirage.
2.  reasoning: Une explication détaillée de la méthodologie hybride simulée. Articulez comment chaque modèle (XGBoost pour les fréquences/écarts, Random Forest pour les interactions, RNN-LSTM pour les tendances) a contribué à la sélection finale.
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
      historicalData: formattedHistoricalDataString,
    };
    
    const {output} = await prompt(promptPayload);
    return output!;
  }
);
