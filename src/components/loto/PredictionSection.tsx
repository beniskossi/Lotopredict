
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { LotoBall } from "./LotoBall";
import { generateDrawPredictions, type GenerateDrawPredictionsOutput, type GenerateDrawPredictionsInput, type HistoricalEntry } from '@/ai/flows/generate-draw-predictions';
import { fetchHistoricalData } from '@/services/lotoData';
import type { HistoricalDataEntry } from '@/types/loto';
import { getDrawNameBySlug } from '@/lib/lotoDraws.tsx';
import { Wand2, Loader2, HelpCircle, Info } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from '../ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PredictionSectionProps {
  drawSlug: string;
}

export function PredictionSection({ drawSlug }: PredictionSectionProps) {
  const [predictions, setPredictions] = useState<GenerateDrawPredictionsOutput | null>(null);
  const [historicalData, setHistoricalData] = useState<string>(''); // For display in Textarea
  const [rawHistoricalEntries, setRawHistoricalEntries] = useState<HistoricalDataEntry[]>([]); // For passing to AI
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const drawNameDisplay = getDrawNameBySlug(drawSlug);

  const formatHistoricalDataForDisplay = (data: HistoricalDataEntry[]): string => {
    return data.map(entry => {
      let recordString = `Date: ${entry.date}, Gagnants: ${entry.winningNumbers.join(', ')}`;
      if (entry.machineNumbers && entry.machineNumbers.length > 0) {
        recordString += `; Machine: ${entry.machineNumbers.join(', ')}`;
      }
      return recordString;
    }).join('\n');
  };

  const loadHistoricalData = useCallback(async () => {
    setIsLoadingHistory(true);
    setError(null);
    try {
      const hData = await fetchHistoricalData(drawSlug, 50); // Fetch last 50 for AI context
      setRawHistoricalEntries(hData);
      setHistoricalData(formatHistoricalDataForDisplay(hData));
    } catch (err) {
      setError("Erreur lors de la récupération des données historiques pour la prédiction.");
      console.error(err);
      toast({
        variant: "destructive",
        title: "Erreur de Données",
        description: "Impossible de charger les données historiques.",
      });
    } finally {
      setIsLoadingHistory(false);
    }
  }, [drawSlug, toast]);

  useEffect(() => {
    loadHistoricalData();
  }, [loadHistoricalData]);

  const handleGeneratePredictions = async () => {
    if (rawHistoricalEntries.length === 0) {
      toast({
        variant: "destructive",
        title: "Données manquantes",
        description: "Les données historiques sont nécessaires pour générer des prédictions.",
      });
      return;
    }

    setIsLoading(true);
    setError(null);
    setPredictions(null);

    try {
      // Map rawHistoricalEntries to the structure expected by the Genkit flow
      const historicalEntriesForFlow: HistoricalEntry[] = rawHistoricalEntries.map(entry => ({
        date: entry.date,
        winningNumbers: entry.winningNumbers,
        machineNumbers: entry.machineNumbers,
      }));

      const input: GenerateDrawPredictionsInput = {
        drawName: drawNameDisplay,
        historicalData: historicalEntriesForFlow,
      };
      const result = await generateDrawPredictions(input);
      setPredictions(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Une erreur inconnue est survenue.";
      setError(`Erreur lors de la génération des prédictions: ${errorMessage}`);
      console.error(err);
      toast({
        variant: "destructive",
        title: "Erreur de Prédiction",
        description: `Impossible de générer les prédictions: ${errorMessage}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TooltipProvider>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl text-primary flex items-center">
            Prédictions IA
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="ml-2">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="max-w-xs">
                  Prédictions générées par une IA simulant des techniques d'analyse avancées (XGBoost, Random Forest, RNN-LSTM).
                  La loterie reste un jeu de hasard.
                </p>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
          <CardDescription>Prédictions intelligentes pour {drawNameDisplay} basées sur l'analyse des données.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label htmlFor="historicalData" className="block text-sm font-medium text-foreground mb-1">
              Données Historiques (50 derniers tirages)
            </label>
            {isLoadingHistory ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <ScrollArea className="h-32 w-full rounded-md border p-2">
                <Textarea
                  id="historicalData"
                  value={historicalData}
                  readOnly
                  placeholder="Les données historiques seront chargées ici..."
                  rows={5}
                  className="resize-none"
                  aria-describedby="historicalDataHint"
                />
              </ScrollArea>
            )}
            <p id="historicalDataHint" className="text-xs text-muted-foreground mt-1">
              L'IA utilise ces données pour ses prédictions.
            </p>
          </div>

          <Button onClick={handleGeneratePredictions} disabled={isLoading || isLoadingHistory} className="w-full md:w-auto">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            Générer les Prédictions
          </Button>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Erreur</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {isLoading && (
              <div className="space-y-4 pt-4">
                <Skeleton className="h-8 w-1/2" />
                <div className="flex space-x-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="w-10 h-10 rounded-full" />)}
                </div>
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-20 w-full" />
              </div>
          )}

          {predictions && (
            <div className="pt-4 space-y-4">
              <h3 className="text-xl font-semibold text-foreground">Prédictions Suggérées :</h3>
              <div className="flex space-x-2 md:space-x-3">
                {predictions.predictions.map((num, index) => <LotoBall key={`pred-${num}-${index}`} number={num} />)}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <h4 className="text-lg font-semibold text-foreground">Score de Confiance :</h4>
                    <p className="text-lg text-primary font-bold">{predictions.confidenceScore}</p>
                </div>
                <div>
                    <h4 className="text-sm font-semibold text-foreground">Justification de la Confiance :</h4>
                    <p className="text-sm text-muted-foreground">{predictions.confidenceReasoning}</p>
                </div>
              </div>
              
              <h4 className="text-lg font-semibold text-foreground pt-2">Raisonnement Détaillé de l'IA :</h4>
              <ScrollArea className="h-40 w-full rounded-md border p-3 bg-muted/50">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{predictions.reasoning}</p>
              </ScrollArea>
              <Alert variant="default">
                <Info className="h-4 w-4" />
                <AlertTitle>Note sur l'IA</AlertTitle>
                <AlertDescription>
                  Ces prédictions sont générées par une IA et ne garantissent pas les gains. Jouez de manière responsable.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <p className="text-xs text-muted-foreground">
              Les résultats passés n'influencent pas les résultats futurs.
          </p>
        </CardFooter>
      </Card>
    </TooltipProvider>
  );
}
