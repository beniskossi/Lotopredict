
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
});
export type GenerateDrawPredictionsInput = z.infer<typeof GenerateDrawPredictionsInputSchema>;

const GenerateDrawPredictionsOutputSchema = z.object({
  predictions: z
    .array(z.number())
    .length(5)
    .describe('An array of 5 distinct predicted numbers for the lottery draw, each between 1 and 90.'),
  reasoning: z
    .string()
    .describe('A detailed, professional explanation of the methodology and statistical insights used to derive the predictions from the historical data.'),
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
  prompt: `You are a highly skilled professional lottery analyst and forecaster. Your task is to provide expert predictions for the upcoming lottery draw.
Base your analysis on the provided historical data for the specified draw.

Lottery Draw Name: {{{drawName}}}
Historical Data:
{{{historicalData}}}

Your analysis should be thorough and go beyond simple frequency counts. Consider various statistical patterns, including but not limited to:
- Number frequencies (hot and cold numbers)
- Recency of appearance
- Potential number pairings or clusters
- Patterns of numbers skipping draws
- Any other discernible trends or anomalies in the data.

Based on your in-depth analysis, provide 5 distinct predicted numbers between 1 and 90.
Crucially, explain your reasoning in a professional and detailed manner. Articulate the specific patterns and statistical insights that led to your selection of each predicted number. Your reasoning should demonstrate a sophisticated understanding of lottery data analysis.

IMPORTANT:
- The 'predictions' field in your JSON output MUST be an array of exactly 5 distinct integers, each between 1 and 90.
- The 'reasoning' field should clearly explain the methodology and insights used.

Output the results strictly in JSON format, adhering to the output schema. Ensure the JSON is valid and contains no extraneous text.`,
});

const generateDrawPredictionsFlow = ai.defineFlow(
  {
    name: 'generateDrawPredictionsFlow',
    inputSchema: GenerateDrawPredictionsInputSchema,
    outputSchema: GenerateDrawPredictionsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
