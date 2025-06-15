
'use server';
/**
 * @fileOverview An AI agent that generates predictions for lottery draws
 * by simulating an advanced ensemble of statistical models.
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
    .describe('A detailed, professional explanation of the methodology and statistical insights used to derive the predictions. This should articulate how the simulated ensemble (DBN for transitions, Gradient Boosting for probabilities, Clustering for patterns) and the weighted combination of their outputs contributed to the selection. It should also cover how the validation table generation strategy informed the analysis, and how user-defined parameters (analysis period, number weighting) influenced the process.'),
  confidenceScore: z.string().describe('A qualitative confidence level for the predictions (e.g., "High", "Medium", "Low", or a numeric score like 3/5). This should reflect the AI\'s assessment of the predictability based on the data and the depth of simulated analysis performed.'),
  confidenceReasoning: z.string().describe('A brief explanation for the assigned confidence score, highlighting factors that increase or decrease confidence (e.g., clarity of simulated patterns from DBN/Clustering, convergence of simulated model outputs, amount of historical data).'),
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
  analysisPeriod: z.string().optional().describe('The historical period to focus the analysis on.'),
  numberWeighting: z.string().optional().describe('How to weigh numbers based on recency.'),
});


const prompt = ai.definePrompt({
  name: 'generateDrawPredictionsPrompt',
  input: {schema: PromptInputSchema}, // Uses the schema expecting a string for historicalData
  output: {schema: GenerateDrawPredictionsOutputSchema},
  prompt: `Vous êtes un système d'analyse de loterie expert simulant un ensemble avancé de modèles pour générer des prédictions. Votre objectif est de fournir des prédictions professionnelles et une analyse détaillée pour le tirage spécifié, en expliquant comment les différentes composantes simulées de votre système ont contribué à la décision finale.

Nom du Tirage : {{{drawName}}}
Période d'Analyse Spécifiée par l'Utilisateur : {{#if analysisPeriod}} {{{analysisPeriod}}} {{else}} Non spécifié, considérez toutes les données fournies. {{/if}}
Pondération des Numéros Spécifiée par l'Utilisateur : {{#if numberWeighting}} {{{numberWeighting}}} {{else}} Non spécifié, utilisez une approche équilibrée. {{/if}}

Données Historiques Fournies :
{{{historicalData}}}

Votre système simulé est composé des algorithmes suivants :

1.  **Réseau Bayésien Dynamique (DBN) Simulé pour les Motifs de Transition**
    *   **Objectif Simulé** : Modéliser les dépendances temporelles entre les numéros tirés d’un tirage à l’autre, en capturant les transitions probables.
    *   **Caractéristiques Simulées Considérées** : Probabilités conditionnelles des numéros basées sur les tirages précédents, transitions entre groupes de numéros (par plages ou unités), motifs de répétition (numéros apparaissant après certains écarts).

2.  **Gradient Boosting (type LightGBM) Simulé pour la Prédiction de Probabilité**
    *   **Objectif Simulé** : Prédire la probabilité d’apparition de chaque numéro.
    *   **Caractéristiques Simulées Considérées** : Fréquence historique des numéros, écarts entre apparitions, co-occurrences, sommes des numéros tirés, plages et unités des numéros, caractéristiques dérivées (moyenne des écarts).

3.  **Modèle de Clustering Simulé pour Identifier les Motifs de Tirages**
    *   **Objectif Simulé** : Regrouper les tirages similaires pour identifier des profils de tirages et prédire les numéros probables dans des contextes similaires.
    *   **Caractéristiques Simulées Considérées** : Composition des numéros (plages, unités), sommes des numéros, différences internes entre numéros, écarts temporels.

4.  **Modèle d’Ensemble Pondéré Simulé**
    *   **Objectif Simulé** : Combiner les "prédictions" (scores ou probabilités) des trois modèles simulés (DBN, Gradient Boosting, Clustering) pour améliorer la robustesse.
    *   **Méthodologie Simulée** : Attribuer des poids à chaque modèle simulé en fonction de la force perçue de ses signaux dans les données historiques fournies. Calculer un score agrégé pour chaque numéro.

5.  **Génération d'un Tableau de Validation (Analyse Contextuelle)**
    *   **Objectif** : Générer un tableau dérivé des numéros gagnants du dernier tirage pour valider ou contextualiser les prédictions.
    *   **Stratégie** :
        *   Première ligne : Ajouter une constante (par exemple, +1 ou une autre petite valeur) aux numéros gagnants du dernier tirage, ajuster si > 90.
        *   Lignes suivantes : Répéter l’opération sur la ligne précédente (jusqu'à quelques lignes).
        *   Vérification contextuelle : Noter si les numéros prédits par l'ensemble apparaissent dans ce tableau. Analyser les paires (consécutives dans lignes/colonnes/diagonales) pour un contexte supplémentaire. Ceci n'est pas un filtre strict mais un outil d'analyse.

Mécanisme d'Apprentissage et de Prédiction Simulé :
1.  Analysez les données historiques fournies.
2.  Pour chaque numéro (1 à 90), simulez le calcul des caractéristiques pertinentes pour le DBN, le Gradient Boosting, et le Clustering.
3.  Simulez l'obtention de scores ou de probabilités de chaque modèle pour chaque numéro.
4.  Appliquez une simulation de pondération et d'agrégation (Modèle d'Ensemble Pondéré) pour obtenir un score de confiance final pour chaque numéro.
5.  Les paramètres 'Période d'Analyse' et 'Pondération des Numéros' doivent influencer la manière dont vous considérez les données historiques ou l'importance des caractéristiques dans vos simulations.
6.  Sélectionnez les 5 numéros avec les scores agrégés les plus élevés, en assurant leur unicité et en appliquant des contraintes de distribution raisonnables (par exemple, diversité des plages si les signaux le suggèrent).
7.  Simulez la génération du tableau de validation basé sur le dernier tirage fourni pour une analyse contextuelle.

Sur la base de cette analyse complète et multi-facettes simulée, veuillez fournir :
1.  predictions: Un tableau de 5 numéros distincts prédits pour le tirage, chaque numéro étant compris entre 1 et 90.
2.  reasoning: Une explication détaillée et professionnelle de la méthodologie simulée. Articulez comment les informations simulées des modèles DBN, Gradient Boosting, et Clustering, ainsi que leur combinaison pondérée, ont conduit à la sélection des numéros. Mentionnez comment le tableau de validation a été utilisé pour l'analyse contextuelle. Expliquez l'impact des paramètres utilisateur ('Période d'Analyse', 'Pondération des Numéros') sur votre simulation.
3.  confidenceScore: Un score de confiance qualitatif pour ces prédictions (par exemple, "Élevé", "Moyen", "Faible", ou un score numérique comme 3/5).
4.  confidenceReasoning: Expliquez brièvement pourquoi ce niveau de confiance a été attribué, en tenant compte de la clarté des tendances identifiées par vos simulations, de la convergence des "résultats" des différents modèles simulés, et de la quantité/qualité des données historiques.

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

