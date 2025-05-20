
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

const GenerateDrawPredictionsInputSchema = z.object({
  drawName: z.string().describe('The name of the lottery draw.'),
  historicalData: z
    .string()
    .describe(
      'Historical lottery draw data used to generate predictions. Should be a string containing the draw history.'
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
    .describe('A detailed, professional explanation of the methodology and statistical insights used to derive the predictions. This should cover aspects like number frequency, recency, pairings, clusters, and any discerned temporal patterns or anomalies. It should also articulate simulated advanced model interpretations (e.g., "LSTM-like sequence analysis suggests...", "XGBoost-like feature weighting indicates...").'),
  confidenceScore: z.string().describe('A qualitative confidence level for the predictions (e.g., "High", "Medium", "Low", or a numeric score like 3/5). This should reflect the AI\'s assessment of the predictability based on the data.'),
  confidenceReasoning: z.string().describe('A brief explanation for the assigned confidence score, highlighting factors that increase or decrease confidence.'),
});
export type GenerateDrawPredictionsOutput = z.infer<typeof GenerateDrawPredictionsOutputSchema>;

export async function generateDrawPredictions(
  input: GenerateDrawPredictionsInput
): Promise<GenerateDrawPredictionsOutput> {
  return generateDrawPredictionsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateDrawPredictionsPrompt',
  input: {schema: GenerateDrawPredictionsInputSchema},
  output: {schema: GenerateDrawPredictionsOutputSchema},
  prompt: `You are a sophisticated lottery analysis system employing advanced neural network techniques (simulating RNN-LSTM for temporal sequences and XGBoost-like feature importance) to provide expert predictions. Your task is to analyze the provided historical data for the specified lottery draw.

Lottery Draw Name: {{{drawName}}}
User-specified Analysis Period: {{#if analysisPeriod}} {{{analysisPeriod}}} {{else}} Not specified, consider all data. {{/if}}
User-specified Number Weighting: {{#if numberWeighting}} {{{numberWeighting}}} {{else}} Not specified, use balanced approach. {{/if}}

Historical Data:
{{{historicalData}}}

Perform an in-depth analysis considering:
- Number Frequencies: Identify hot (frequent) and cold (infrequent) numbers.
- Recency of Appearance: How recently numbers have been drawn.
- Number Pairings and Clusters: Common groups of numbers appearing together.
- Skip Patterns: Numbers that tend to skip a certain number of draws before reappearing.
- Temporal Trends: Evolution of number frequencies or patterns over time.
- Positional Analysis: (If applicable and data allows) Consider if numbers appear more frequently in specific winning positions.
- Machine Numbers Influence: (If machine numbers are provided in historical data) Analyze any correlation or influence of machine numbers on winning numbers for subsequent draws.

Based on this comprehensive, multi-faceted analysis, provide:
1.  predictions: An array of 5 distinct predicted numbers, each between 1 and 90.
2.  reasoning: A detailed, professional explanation of the methodology. Articulate the specific patterns, statistical insights, and simulated model interpretations (e.g., "LSTM-like sequence analysis suggests...", "XGBoost-like feature weighting indicates...") that led to your selection of each predicted number.
3.  confidenceScore: A qualitative confidence score for these predictions (e.g., "High", "Medium", "Low", or a numeric score like 3/5).
4.  confidenceReasoning: Briefly explain why this confidence level was assigned, considering data quality, pattern clarity, and historical predictability.

Simulate a learning process: If past predictions (hypothetically) were inaccurate, your current analysis should implicitly adjust by more heavily weighing patterns that would have corrected past errors, similar to how backpropagation refines a neural network or gradient boosting improves XGBoost. Focus on precision and avoid over-fitting to very recent or sparse data unless specified by weighting.

Output the results strictly in JSON format, adhering to the output schema. Ensure the JSON is valid and contains no extraneous text.`,
});

const generateDrawPredictionsFlow = ai.defineFlow(
  {
    name: 'generateDrawPredictionsFlow',
    inputSchema: GenerateDrawPredictionsInputSchema,
    outputSchema: GenerateDrawPredictionsOutputSchema,
  },
  async input => {
    // Potentially, pre-process or augment 'historicalData' based on 'analysisPeriod' here
    // For now, the prompt handles the interpretation of these parameters.
    const {output} = await prompt(input);
    return output!;
  }
);
