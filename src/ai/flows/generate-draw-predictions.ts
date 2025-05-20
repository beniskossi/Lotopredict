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
    .describe('An array of 5 predicted numbers for the lottery draw.'),
  reasoning: z
    .string()
    .describe('The reasoning behind the generated predictions, including the analysis of historical data.'),
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
  prompt: `You are an expert lottery analyst. Analyze the historical data provided and predict the next 5 numbers for the lottery draw.

Lottery Draw Name: {{{drawName}}}
Historical Data: {{{historicalData}}}

Provide the predicted numbers and a detailed explanation of your reasoning, including any patterns or trends you identified in the historical data.

IMPORTANT: Make sure the 'predictions' output is an array of 5 distinct numbers between 1 and 90.

Output the results in JSON format, as requested by the output schema. Do not include any extra text in the output, only the JSON. Make sure the JSON is valid.`,
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
