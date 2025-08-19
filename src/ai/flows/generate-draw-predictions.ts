
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
  prompt: `Vous êtes un système expert en analyse de données de loterie, chargé de générer des prédictions en suivant une méthodologie d'analyse structurée en plusieurs étapes qui simule une approche hybride avancée.

**Nom du Tirage :** {{{drawName}}}

**Données Historiques Fournies :**
{{{historicalData}}}

**Votre Tâche :**
Vous devez suivre rigoureusement les 4 étapes suivantes pour produire votre analyse et vos prédictions. Votre raisonnement final doit clairement refléter les conclusions de chaque étape.

**Étape 1 : Analyse de Fréquence et d'Écarts (Simulation de type XGBoost)**
*   **Objectif :** Évaluer l'importance de chaque numéro individuellement.
*   **Actions :**
    1.  Calculez la **fréquence** de chaque numéro (de 1 à 90) dans l'ensemble des données fournies.
    2.  Identifiez les 10 numéros les plus fréquents ("numéros chauds").
    3.  Identifiez les 10 numéros les moins fréquents ("numéros froids").
    4.  Pour chaque numéro, calculez son **écart actuel** (nombre de tirages depuis sa dernière apparition). Identifiez les numéros avec les plus grands écarts.
*   **Synthèse de l'Étape 1 :** Listez les numéros qui semblent les plus prometteurs en vous basant sur un équilibre entre haute fréquence et écart significatif (un numéro attendu).

**Étape 2 : Analyse des Co-occurrences (Simulation de type Random Forest)**
*   **Objectif :** Identifier les relations et les paires de numéros qui apparaissent souvent ensemble.
*   **Actions :**
    1.  Analysez les données pour trouver les **paires de numéros** qui sont apparues le plus souvent ensemble dans le même tirage.
    2.  Identifiez les **triplets de numéros** les plus fréquents.
*   **Synthèse de l'Étape 2 :** Mettez en évidence les associations de numéros les plus fortes. Ces groupes peuvent renforcer la sélection d'un numéro identifié à l'étape 1.

**Étape 3 : Analyse des Séquences Temporelles (Simulation de type RNN-LSTM)**
*   **Objectif :** Détecter des tendances ou des motifs dans le temps.
*   **Actions :**
    1.  Examinez les tirages les plus récents (les 10-15 derniers) pour identifier des **tendances** : des numéros "chauds" qui continuent de sortir, ou des numéros "froids" qui commencent à apparaître.
    2.  Recherchez des motifs, par exemple, si des numéros d'une certaine dizaine (ex: les 20, les 30) apparaissent plus fréquemment ces derniers temps.
*   **Synthèse de l'Étape 3 :** Décrivez les tendances récentes qui pourraient influencer le prochain tirage.

**Étape 4 : Synthèse Hybride et Génération de la Prédiction Finale**
*   **Objectif :** Agréger les informations des trois étapes précédentes pour formuler la prédiction finale.
*   **Actions :**
    1.  **Pondérez les résultats :** Sélectionnez 5 numéros uniques en vous basant sur la convergence des analyses. Un numéro idéal serait :
        *   Relativement fréquent (Étape 1).
        *   Partie d'une paire ou d'un triplet à forte co-occurrence (Étape 2).
        *   En accord avec une tendance récente (Étape 3) ou ayant un écart de sortie notable (Étape 1).
    2.  **Formulez la prédiction :** Présentez les 5 numéros choisis.
    3.  **Rédigez le raisonnement :** Élaborez un raisonnement détaillé qui explique **comment** vous êtes parvenu à cette sélection en vous référant explicitement aux conclusions des étapes 1, 2 et 3. Par exemple : "Le numéro X a été choisi car il est non seulement l'un des plus fréquents (Étape 1), mais il forme aussi une paire forte avec Y (Étape 2) et est apparu dans les tendances récentes (Étape 3)."
    4.  **Définissez le score de confiance et sa justification :** Attribuez un score de confiance (par exemple, "Élevé", "Moyen", "4/5") et justifiez-le. Une confiance élevée vient d'une forte convergence entre les 3 étapes. Une confiance faible peut résulter de signaux contradictoires.

Produisez les résultats finaux **strictement au format JSON**, en respectant le schéma de sortie. Assurez-vous que le JSON est valide et ne contient aucun texte superflu avant ou après.`,
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
