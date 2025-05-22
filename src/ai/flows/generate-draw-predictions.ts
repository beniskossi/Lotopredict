
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
  analysisPeriod: z.string().optional().describe('The historical period to focus the analysis on (e.g., "last 30 draws", "last 6 months", "all available data").'),
  numberWeighting: z.string().optional().describe('How to weigh numbers based on recency (e.g., "emphasize recent draws", "equal weight to all draws", "long-term trends").'),
});
export type GenerateDrawPredictionsInput = z.infer<typeof GenerateDrawPredictionsInputSchema>;

const GenerateDrawPredictionsOutputSchema = z.object({
  predictions: z
    .array(z.number())
    .length(5)
    .describe('An array of 5 distinct predicted numbers for the lottery draw, each between 1 and 90.'),
  reasoning: z
    .string()
    .describe('A detailed, professional explanation of the methodology and statistical insights used to derive the predictions. This should cover aspects like number frequency, recency, pairings, clusters, and any discerned temporal patterns or anomalies. It should also articulate simulated advanced model interpretations (e.g., "LSTM-like sequence analysis suggests...", "XGBoost-like feature weighting indicates..."). Explicitly mention how derived features like relative frequency over sliding windows (e.g., over 10, 20, 50 draws), mean gaps between appearances, and moving averages of frequencies (e.g., over 5, 10, 20 draws) informed the prediction.'),
  confidenceScore: z.string().describe('A qualitative confidence level for the predictions (e.g., "High", "Medium", "Low", or a numeric score like 3/5). This should reflect the AI\'s assessment of the predictability based on the data.'),
  confidenceReasoning: z.string().describe('A brief explanation for the assigned confidence score, highlighting factors that increase or decrease confidence.'),
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
  prompt: `You are a sophisticated lottery analysis system employing advanced neural network techniques (simulating RNN-LSTM for temporal sequences and XGBoost-like feature importance) to provide expert predictions. Your task is to analyze the provided historical data for the specified lottery draw.

Lottery Draw Name: {{{drawName}}}
User-specified Analysis Period: {{#if analysisPeriod}} {{{analysisPeriod}}} {{else}} Not specified, consider all data. {{/if}}
User-specified Number Weighting: {{#if numberWeighting}} {{{numberWeighting}}} {{else}} Not specified, use balanced approach. {{/if}}

Historical Data:
{{{historicalData}}}

Perform an in-depth analysis considering:
- Number Frequencies: Identify hot (frequent) and cold (infrequent) numbers. Consider frequencies within specific windows (e.g., last 10, 20, 50 draws).
- Recency of Appearance: How recently numbers have been drawn. Explicitly consider the number of draws since the last appearance for each number (gaps between appearances).
- Number Pairings and Clusters: Common groups of numbers appearing together.
- Skip Patterns: Numbers that tend to skip a certain number of draws before reappearing.
- Temporal Trends: Evolution of number frequencies or patterns over time. Analyze this using concepts similar to moving averages of frequencies over different window sizes (e.g., 5, 10, 20 draws).
- Derived Features: Explicitly consider and mention in your reasoning how features like:
    - Relative frequency of numbers over a sliding time window.
    - Mean or median gaps between appearances of specific numbers.
    - Frequent co-occurrences of numbers within the same draw.
- Positional Analysis: (If applicable and data allows) Consider if numbers appear more frequently in specific winning positions.
- Machine Numbers Influence: (If machine numbers are provided in historical data) Analyze any correlation or influence of machine numbers on winning numbers for subsequent draws.

Strive for robust and generalizable patterns, avoiding over-fitting to very recent or sparse data unless specified by user weighting. Your analysis should reflect the depth expected from models optimized via techniques like hyperparameter tuning and temporal cross-validation.

Based on this comprehensive, multi-faceted analysis, provide:
1.  predictions: An array of 5 distinct predicted numbers, each between 1 and 90.
2.  reasoning: A detailed, professional explanation of the methodology. Articulate the specific patterns, statistical insights, and simulated model interpretations (e.g., "LSTM-like sequence analysis suggests...", "XGBoost-like feature weighting indicates...", "Analysis of derived features like mean skip values points to...", "Consideration of number frequencies over the last 20 draws highlights...", "The gap analysis for number X indicates...", "Moving averages of frequencies suggest a trend for number Y...") that led to your selection of each predicted number.
3.  confidenceScore: A qualitative confidence score for these predictions (e.g., "High", "Medium", "Low", or a numeric score like 3/5).
4.  confidenceReasoning: Briefly explain why this confidence level was assigned, considering data quality, pattern clarity, and historical predictability.

Simulate a learning process: If past predictions (hypothetically) were inaccurate, your current analysis should implicitly adjust by more heavily weighing patterns that would have corrected past errors, similar to how backpropagation refines a neural network or gradient boosting improves XGBoost. Focus on precision and avoid over-fitting to very recent or sparse data unless specified by weighting.

Output the results strictly in JSON format, adhering to the output schema. Ensure the JSON is valid and contains no extraneous text.`,
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

