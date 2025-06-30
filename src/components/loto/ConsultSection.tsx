
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchNumberCoOccurrence, fetchHistoricalData } from '@/services/lotoData';
import type { NumberCoOccurrence as NumberCoOccurrenceType, HistoricalDataEntry } from '@/types/loto';
import { getDrawNameBySlug } from '@/lib/lotoDraws.ts';
import { LotoBall } from './LotoBall';
import { Search, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from '@/lib/utils';

interface ConsultSectionProps {
  drawSlug: string;
}

// Helper function to determine background intensity for heatmap-like effect
const getCountCellStyle = (count: number, maxCount: number): React.CSSProperties => {
  if (maxCount === 0 || count === 0) return {};
  const intensity = Math.min(1, Math.max(0.1, count / maxCount)); 
  // Using accent HSL values from globals.css: --accent: 39 100% 50%;
  // We will vary the alpha channel of the accent color.
  return {
    backgroundColor: `hsla(var(--accent-h, 39), var(--accent-s, 100%), var(--accent-l, 50%), ${intensity * 0.7 + 0.1})`,
  };
};


export function ConsultSection({ drawSlug }: ConsultSectionProps) {
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [coOccurrenceData, setCoOccurrenceData] = useState<NumberCoOccurrenceType | null>(null);
  const [historicalData, setHistoricalData] = useState<HistoricalDataEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadHistorical = async () => {
      setIsLoading(true);
      try {
        const hData = await fetchHistoricalData(drawSlug, 50); 
        setHistoricalData(hData);
      } catch (err) {
        setError("Erreur lors du chargement des données historiques.");
        console.error(err);
      }
      setIsLoading(false);
    };
    loadHistorical();
  }, [drawSlug]);

  const executeSearch = useCallback(async (numberToSearchStr: string) => {
    const num = parseInt(numberToSearchStr);
    if (isNaN(num) || num < 1 || num > 90) {
      setError("Veuillez entrer un numéro valide entre 1 et 90.");
      setCoOccurrenceData(null);
      setSelectedNumber(null); // Clear selected number display if input is invalid
      return;
    }
    setSelectedNumber(num); // Update the number displayed as a LotoBall
    setError(null);
    setIsLoading(true);
    try {
      if (historicalData.length === 0 && !isLoading) { // check isLoading to avoid race condition on initial load
        setError("Données historiques non chargées ou en cours de chargement. Veuillez patienter ou rafraîchir.");
        setIsLoading(false);
        return;
      }
      const result = await fetchNumberCoOccurrence(drawSlug, num, historicalData);
      setCoOccurrenceData(result);
    } catch (err) {
      setError(`Erreur lors de la recherche de co-occurrences pour le numéro ${num}.`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [drawSlug, historicalData, isLoading]); // Added isLoading to dependencies

  const handleSearchButtonClick = useCallback(() => {
    executeSearch(inputValue);
  }, [inputValue, executeSearch]);

  const handleGridNumberClick = useCallback((number: number) => {
    setInputValue(number.toString());
    executeSearch(number.toString());
  }, [executeSearch]);


  const drawName = getDrawNameBySlug(drawSlug);
  const maxCoOccurrenceCount = coOccurrenceData?.coOccurrences.reduce((max, item) => Math.max(max, item.count), 0) || 0;

  const numberGrid = Array.from({ length: 90 }, (_, i) => i + 1);

  return (
    <TooltipProvider>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl text-primary flex items-center">
            Consulter la Régularité d'un Numéro
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="ml-2 w-6 h-6" aria-label="Informations sur les co-occurrences">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-sm">
                  Entrez un numéro (1-90) ou cliquez sur un numéro dans la grille ci-dessous.
                  La section "Co-occurrences" montre à quelle fréquence ce numéro est apparu
                  avec d'autres numéros spécifiques lors des tirages précédents pour ce même type de jeu.
                  Les cellules de comptage sont colorées pour un effet de type heatmap : plus la couleur est intense, plus la co-occurrence est fréquente.
                  Cela peut aider à identifier des paires ou groupes de numéros qui sortent souvent ensemble.
                </p>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
          <CardDescription>{drawName} - Fréquence d'apparition avec d'autres numéros.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 items-start sm:items-end">
            <div className="flex-grow w-full sm:w-auto">
              <label htmlFor="numberInput" className="block text-sm font-medium text-foreground mb-1">
                Numéro à analyser (1-90)
              </label>
              <Input
                id="numberInput"
                type="number"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ex: 45"
                min="1"
                max="90"
                className="max-w-xs"
                aria-describedby="numberInputHint"
              />
              <p id="numberInputHint" className="sr-only">Entrez un numéro entre 1 et 90.</p>
            </div>
            <Button onClick={handleSearchButtonClick} disabled={isLoading || historicalData.length === 0} className="w-full sm:w-auto">
              <Search className="mr-2 h-4 w-4" /> Rechercher
            </Button>
          </div>

          <div>
            <h4 className="text-md font-medium text-foreground mb-2">Ou choisissez un numéro :</h4>
            <div className="flex flex-wrap gap-1.5">
              {numberGrid.map(num => (
                <Button
                  key={`grid-${num}`}
                  variant={inputValue === num.toString() && selectedNumber === num ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-8 w-8 p-0",
                    inputValue === num.toString() && selectedNumber === num && "ring-2 ring-primary ring-offset-2",
                     "transition-all"
                  )}
                  onClick={() => handleGridNumberClick(num)}
                  disabled={isLoading || historicalData.length === 0}
                  aria-label={`Analyser le numéro ${num}`}
                >
                  {num}
                </Button>
              ))}
            </div>
          </div>

          {isLoading && !coOccurrenceData && <Skeleton className="h-40 w-full mt-4" />}
          {error && <p className="text-destructive mt-4">{error}</p>}

          {coOccurrenceData && selectedNumber !== null && (
            <div className="mt-4">
              <h3 className="text-xl font-semibold mb-3 text-foreground">
                Co-occurrences pour le numéro <LotoBall number={selectedNumber} size="sm" /> (Top 10)
              </h3>
              {coOccurrenceData.coOccurrences.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">Numéro</TableHead>
                        <TableHead>Nombre d'apparitions communes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {coOccurrenceData.coOccurrences.map(item => (
                        <TableRow key={item.number}>
                          <TableCell><LotoBall number={item.number} size="sm" /></TableCell>
                          <TableCell 
                            style={getCountCellStyle(item.count, maxCoOccurrenceCount)}
                            className="transition-colors duration-300 text-center font-medium"
                          >
                            {item.count}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p>Aucune co-occurrence significative trouvée pour le numéro {selectedNumber} dans les données analysées.</p>
              )}
            </div>
          )}
           {!isLoading && !coOccurrenceData && !error && historicalData.length > 0 && !selectedNumber &&(
            <p className="text-muted-foreground mt-4">Entrez un numéro et cliquez sur "Rechercher" ou sélectionnez un numéro dans la grille pour voir ses co-occurrences.</p>
          )}
          {!isLoading && historicalData.length === 0 && !error && (
              <p className="text-muted-foreground mt-4">Chargement des données historiques initiales en cours... Veuillez patienter.</p>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
