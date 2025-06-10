
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
  prompt: `Vous êtes un système d'analyse de loterie expert. Votre rôle est de simuler une Forêt Aléatoire (Random Forest) pour générer des prédictions. Une Forêt Aléatoire combine les résultats de multiples arbres de décision, chacun entraîné sur différentes facettes des données et des caractéristiques, pour réduire le surapprentissage et améliorer la robustesse des prédictions. Votre objectif est de fournir des prédictions professionnelles et une analyse détaillée pour le tirage spécifié, en expliquant comment les différentes stratégies et caractéristiques ont contribué à la décision finale, comme le ferait une Forêt Aléatoire.

Nom du Tirage : {{{drawName}}}
Période d'Analyse Spécifiée par l'Utilisateur : {{#if analysisPeriod}} {{{analysisPeriod}}} {{else}} Non spécifié, considérez toutes les données fournies. {{/if}}
Pondération des Numéros Spécifiée par l'Utilisateur : {{#if numberWeighting}} {{{numberWeighting}}} {{else}} Non spécifié, utilisez une approche équilibrée. {{/if}}

Données Historiques Fournies :
{{{historicalData}}}

Effectuez une analyse approfondie en simulant le calcul et l'utilisation des caractéristiques suivantes pour chaque numéro (1 à 90) :
- Délai moyen avant réapparition : Calculez ou estimez le nombre moyen de tirages avant qu'un numéro réapparaisse. Identifiez les numéros qui sont statistiquement 'en retard' pour une réapparition.
- Fréquence d'apparition : Comptez la fréquence absolue et relative de chaque numéro dans les tirages historiques fournis. Considérez des fenêtres glissantes si pertinent (par exemple, les 10, 20 derniers tirages).
- Numéro le plus fréquent associé :
    - Dans le même tirage : Identifiez les numéros qui apparaissent le plus souvent dans le même tirage qu'un numéro donné.
    - Dans le tirage suivant : Analysez quel numéro a tendance à apparaître dans le tirage *suivant* un tirage où un numéro donné est sorti.
- Numéro + 20 : Pour chaque numéro X apparu dans l'historique, considérez le numéro X+20 (s'il est ≤ 90). Évaluez la fréquence historique de ces numéros dérivés (X+20).
- Comparaison numéros machines/gagnants : Si des numéros machine sont présents dans les données historiques, comparez la fréquence d'apparition des numéros en tant que 'numéro machine' par rapport à leur fréquence en tant que 'numéro gagnant'.
- Multiplication par 1,615 : Pour chaque numéro Y du *dernier tirage fourni dans les données historiques*, calculez Y' = arrondir(Y * 1,615). Si Y' ≤ 90, évaluez la fréquence historique de Y' pour juger de sa pertinence.

Mécanisme d'Apprentissage Simulé (Forêt Aléatoire) :
Votre simulation de Forêt Aléatoire doit :
1.  Calculer ou estimer l'importance de chaque caractéristique dérivée (délai moyen, fréquences diverses, associations, transformations comme +20 ou *1.615, corrélation machine/gagnants).
2.  Simuler la construction de multiples arbres de décision, où chaque arbre pourrait se concentrer sur un sous-ensemble différent de ces caractéristiques ou de périodes de données.
3.  Agréger les "votes" ou les scores de ces arbres simulés pour chaque numéro (1 à 90) afin d'obtenir un score de confiance global.
4.  Expliquer comment vous avez pondéré ou combiné ces différentes stratégies (qui agissent comme des branches de décision ou des arbres individuels) pour arriver à vos prédictions.
5.  Les paramètres fournis par l'utilisateur ('Période d'Analyse' et 'Pondération des Numéros') doivent influencer la manière dont vous pondérez les données historiques ou l'importance des caractéristiques dans votre simulation de Forêt Aléatoire.

Sur la base de cette analyse complète et multi-facettes, veuillez fournir :
1.  predictions: Un tableau de 5 numéros distincts prédits pour le tirage, chaque numéro étant compris entre 1 et 90.
2.  reasoning: Une explication détaillée et professionnelle de la méthodologie. Articulez les schémas spécifiques, les informations statistiques, et les interprétations de votre simulation de Forêt Aléatoire (par exemple, "L'analyse du délai moyen de réapparition suggère que le numéro Z est 'en retard'...", "La stratégie de multiplication par 1,615 appliquée au dernier tirage a mis en évidence le numéro Y'", "La combinaison des scores de fréquence et d'association a fortement favorisé le numéro X dans la Forêt Aléatoire simulée..."). Détaillez comment les caractéristiques telles que le délai moyen, la fréquence (absolue/relative), les associations (même tirage et tirage suivant), la transformation 'numéro + 20', la comparaison machine/gagnants, et la stratégie de multiplication par 1,615 ont été considérées et ont influencé la sélection des numéros prédits.
3.  confidenceScore: Un score de confiance qualitatif pour ces prédictions (par exemple, "Élevé", "Moyen", "Faible", ou un score numérique comme 3/5).
4.  confidenceReasoning: Expliquez brièvement pourquoi ce niveau de confiance a été attribué, en tenant compte de la clarté des tendances identifiées, de la quantité et de la qualité des données historiques fournies, et de la prévisibilité historique apparente du tirage, ainsi que de la convergence des différentes stratégies simulées.

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

