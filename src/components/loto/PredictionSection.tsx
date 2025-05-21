
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { LotoBall } from "./LotoBall";
import { generateDrawPredictions, type GenerateDrawPredictionsOutput, type GenerateDrawPredictionsInput } from '@/ai/flows/generate-draw-predictions';
import { fetchHistoricalData } from '@/services/lotoData';
import type { HistoricalDataEntry } from '@/types/loto';
import { formatHistoricalDataForAI } from '@/lib/lotoUtils';
import { getDrawNameBySlug } from '@/lib/lotoDraws.tsx';
import { Wand2, Loader2, HelpCircle, Info } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from '../ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PredictionSectionProps {
  drawSlug: string;
}

const analysisPeriodOptions = [
  { value: "last_10_draws", label: "10 derniers tirages" },
  { value: "last_30_draws", label: "30 derniers tirages" },
  { value: "last_50_draws", label: "50 derniers tirages" },
  { value: "all_available", label: "Toutes les données disponibles (max 100)" },
];

const numberWeightingOptions = [
  { value: "emphasize_recent", label: "Privilégier les récents" },
  { value: "equal_weight", label: "Poids égal pour tous" },
  { value: "long_term_trends", label: "Tendances à long terme" },
];


export function PredictionSection({ drawSlug }: PredictionSectionProps) {
  const [predictions, setPredictions] = useState<GenerateDrawPredictionsOutput | null>(null);
  const [historicalDataString, setHistoricalDataString] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const [analysisPeriod, setAnalysisPeriod] = useState<string>(analysisPeriodOptions[1].value); // Default to last 30 draws
  const [numberWeighting, setNumberWeighting] = useState<string>(numberWeightingOptions[0].value); // Default to emphasize recent

  const drawNameDisplay = getDrawNameBySlug(drawSlug);

  const loadHistoricalData = useCallback(async () => {
    setIsLoadingHistory(true);
    setError(null);
    try {
      let historyCount = 10; 
      const selectedPeriodOption = analysisPeriodOptions.find(opt => opt.value === analysisPeriod);

      if (selectedPeriodOption) {
        if (analysisPeriod === "last_30_draws") historyCount = 30;
        else if (analysisPeriod === "last_50_draws") historyCount = 50;
        else if (analysisPeriod === "all_available") historyCount = 100;
      }
      
      const hData: HistoricalDataEntry[] = await fetchHistoricalData(drawSlug, historyCount);
      // Final deduplication layer before formatting for AI
      const uniqueHData = Array.from(
        new Map(hData.map(item => [item.docId || `${item.drawName}-${item.date}`, item])).values()
      );
      const formattedData = formatHistoricalDataForAI(uniqueHData);
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
  }, [drawSlug, toast, analysisPeriod]);

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
      const input: GenerateDrawPredictionsInput = {
        drawName: drawNameDisplay,
        historicalData: historicalDataString,
        analysisPeriod: analysisPeriodOptions.find(opt => opt.value === analysisPeriod)?.label,
        numberWeighting: numberWeightingOptions.find(opt => opt.value === numberWeighting)?.label,
      };
      const result = await generateDrawPredictions(input);
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
            Prédictions IA Avancées
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="ml-2 w-6 h-6" aria-label="Informations sur les prédictions IA">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-sm">
                  Les prédictions sont générées par un modèle d'IA (Gemini) simulant des techniques d'analyse avancées.
                  L'IA analyse les données historiques et les paramètres fournis pour identifier des tendances complexes.
                  La loterie reste un jeu de hasard et ces prédictions ne garantissent pas les gains.
                </p>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
          <CardDescription>Prédictions intelligentes pour {drawNameDisplay} basées sur l'analyse des données historiques et vos paramètres.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="analysisPeriod">Période d'Analyse Historique</Label>
              <Select value={analysisPeriod} onValueChange={setAnalysisPeriod} disabled={isLoading || isLoadingHistory}>
                <SelectTrigger id="analysisPeriod" className="w-full">
                  <SelectValue placeholder="Choisir la période..." />
                </SelectTrigger>
                <SelectContent>
                  {analysisPeriodOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
               <p className="text-xs text-muted-foreground mt-1">Nombre de tirages passés à analyser.</p>
            </div>
            <div>
              <Label htmlFor="numberWeighting">Pondération des Numéros</Label>
              <Select value={numberWeighting} onValueChange={setNumberWeighting} disabled={isLoading || isLoadingHistory}>
                <SelectTrigger id="numberWeighting" className="w-full">
                  <SelectValue placeholder="Choisir la pondération..." />
                </SelectTrigger>
                <SelectContent>
                  {numberWeightingOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
               <p className="text-xs text-muted-foreground mt-1">Comment l'IA doit considérer la récence des numéros.</p>
            </div>
          </div>
          <div>
            <label htmlFor="historicalData" className="block text-sm font-medium text-foreground mb-1">
              Données Historiques (auto-chargées basé sur la période, modifiable si besoin)
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
                  aria-describedby="historicalDataHint"
                  disabled={isLoading || isLoadingHistory}
                />
              </ScrollArea>
            )}
            <p id="historicalDataHint" className="text-xs text-muted-foreground mt-1">
              L'IA utilise ces données. Format: "Gagnants: n1,n2..; Machine: m1,m2..".
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-baseline">
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
              <ScrollArea className="h-40 max-h-60 w-full rounded-md border p-3 bg-muted/50">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{predictions.reasoning}</p>
              </ScrollArea>
              <Alert variant="default" className="bg-accent/10 border-accent/30">
                <AlertTitle className="text-accent flex items-center">
                    <Info className="h-4 w-4 mr-2" /> Note Importante sur l'IA
                </AlertTitle>
                <AlertDescription className="text-accent/80">
                  Ces prédictions sont générées par une IA qui simule des techniques d'analyse avancées. Elle ne s'entraîne pas en temps réel (ex: via rétropropagation) dans cette application. La loterie est un jeu de hasard et les résultats passés ne garantissent pas les résultats futurs. Jouez de manière responsable.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <p className="text-xs text-muted-foreground">
              L'IA est conçue pour exploiter au mieux les données historiques fournies et les paramètres choisis.
          </p>
        </CardFooter>
      </Card>
    </TooltipProvider>
  );
}
