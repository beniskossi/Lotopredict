
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { LotoBall } from "./LotoBall";
import { generateDrawPredictions, type GenerateDrawPredictionsOutput } from '@/ai/flows/generate-draw-predictions';
import { fetchHistoricalData } from '@/services/lotoData';
import type { HistoricalDataEntry } from '@/types/loto';
import { formatHistoricalDataForAI } from '@/lib/lotoUtils';
import { getDrawNameBySlug } from '@/lib/lotoDraws.tsx';
import { Wand2, Loader2, HelpCircle } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from '../ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


interface PredictionSectionProps {
  drawSlug: string;
}

export function PredictionSection({ drawSlug }: PredictionSectionProps) {
  const [predictions, setPredictions] = useState<GenerateDrawPredictionsOutput | null>(null);
  const [historicalDataString, setHistoricalDataString] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const drawNameDisplay = getDrawNameBySlug(drawSlug);

  const loadHistoricalData = useCallback(async () => {
    setIsLoadingHistory(true);
    setError(null);
    try {
      // Fetch a small set of recent historical data for prediction context
      const hData: HistoricalDataEntry[] = await fetchHistoricalData(drawSlug, 10); 
      const formattedData = formatHistoricalDataForAI(hData);
      setHistoricalDataString(formattedData);
    } catch (err) {
      setError("Erreur lors de la récupération des données historiques pour la prédiction.");
      console.error(err);
      toast({
        variant: "destructive",
        title: "Erreur de Données",
        description: "Impossible de charger les données historiques pour la prédiction.",
      });
    } finally {
      setIsLoadingHistory(false);
    }
  }, [drawSlug, toast]);

  useEffect(() => {
    loadHistoricalData();
  }, [loadHistoricalData]);

  const handleGeneratePredictions = async () => {
    if (!historicalDataString.trim() && !isLoadingHistory) {
      toast({
        variant: "destructive",
        title: "Données manquantes",
        description: "Veuillez fournir des données historiques pour générer des prédictions.",
      });
      return;
    }
    if (isLoadingHistory) {
      toast({
        title: "Veuillez patienter",
        description: "Les données historiques sont en cours de chargement.",
      });
      return;
    }

    setIsLoading(true);
    setError(null);
    setPredictions(null);

    try {
      const result = await generateDrawPredictions({
        drawName: drawNameDisplay,
        historicalData: historicalDataString,
      });
      setPredictions(result);
      toast({
        title: "Prédictions Générées",
        description: "Les prédictions IA ont été générées avec succès.",
      });
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
                <Button variant="ghost" size="icon" className="ml-2 w-6 h-6" aria-label="Informations sur les prédictions IA">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-sm">
                  Les prédictions IA sont générées par un modèle d'intelligence artificielle (Gemini)
                  qui analyse les données historiques fournies pour identifier des tendances et des motifs.
                  Le modèle tente de simuler une analyse experte, mais la loterie reste un jeu de hasard.
                  Ces prédictions ne garantissent pas les gains.
                </p>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
          <CardDescription>Prédictions intelligentes pour {drawNameDisplay} basées sur l'analyse des données historiques.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label htmlFor="historicalData" className="block text-sm font-medium text-foreground mb-1">
              Données Historiques (les 10 derniers tirages pour ce type - modifiable si besoin)
            </label>
            {isLoadingHistory ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <ScrollArea className="h-32 w-full rounded-md border p-2">
                <Textarea
                  id="historicalData"
                  value={historicalDataString}
                  onChange={(e) => setHistoricalDataString(e.target.value)}
                  placeholder="Ex: Gagnants: 1,2,3,4,5; Machine: 6,7,8,9,10"
                  rows={5}
                  className="resize-none border-0 shadow-none focus-visible:ring-0"
                  readOnly={isLoadingHistory}
                  aria-describedby="historicalDataHint"
                />
              </ScrollArea>
            )}
            <p id="historicalDataHint" className="text-xs text-muted-foreground mt-1">
              L'IA utilise ces données pour identifier des tendances. Format: "Gagnants: n1,n2..; Machine: m1,m2..".
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
          
          {isLoading && !predictions && (
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
              <div className="flex space-x-2 md:space-x-3 flex-wrap gap-y-2">
                {predictions.predictions.map((num, index) => <LotoBall key={`pred-${num}-${index}`} number={num} />)}
              </div>
              
              <h4 className="text-lg font-semibold text-foreground pt-2">Raisonnement de l'IA :</h4>
              <ScrollArea className="h-40 max-h-60 w-full rounded-md border p-3 bg-muted/50">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{predictions.reasoning}</p>
              </ScrollArea>
              <Alert variant="default" className="bg-accent/10 border-accent/30">
                {/* <Rocket className="h-4 w-4" /> */}
                <AlertTitle className="text-accent">Note Importante</AlertTitle>
                <AlertDescription className="text-accent/80">
                  Ces prédictions sont générées par une IA et basées sur des données historiques. La loterie est un jeu de hasard et les résultats passés ne garantissent pas les résultats futurs. Jouez de manière responsable.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <p className="text-xs text-muted-foreground">
              L'IA apprend continuellement des résultats pour affiner ses prédictions futures.
          </p>
        </CardFooter>
      </Card>
    </TooltipProvider>
  );
}
