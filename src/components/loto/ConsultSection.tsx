
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchNumberCoOccurrence, fetchHistoricalData } from '@/services/lotoData';
import type { NumberCoOccurrence as NumberCoOccurrenceType, HistoricalDataEntry } from '@/types/loto';
import { getDrawNameBySlug } from '@/lib/lotoDraws.tsx';
import { LotoBall } from './LotoBall';
import { Search, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from '@/lib/utils';

interface ConsultSectionProps {
  drawSlug: string;
}

// Helper function to determine background intensity for heatmap-like effect
const getCountCellStyle = (count: number, maxCount: number): React.CSSProperties => {
  if (maxCount === 0) return {};
  const intensity = Math.min(1, Math.max(0.1, count / maxCount)); // Ensure intensity is between 0.1 and 1
  // Using HSL for --accent color and varying lightness or alpha
  // Assuming --accent: H S L;
  // For demonstration, let's use a fixed base color (e.g., primary or accent) and vary opacity.
  // This will need to be adjusted based on your actual theme.
  // Using accent color with varying alpha
  const accentHsl = "var(--accent)"; // e.g. "39 100% 50%"
  return {
    backgroundColor: `hsla(${accentHsl}, ${intensity * 0.7 + 0.1})`, // alpha from 0.1 to 0.8
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

  const handleSearch = useCallback(async () => {
    const num = parseInt(inputValue);
    if (isNaN(num) || num < 1 || num > 90) {
      setError("Veuillez entrer un numéro valide entre 1 et 90.");
      setCoOccurrenceData(null);
      setSelectedNumber(null);
      return;
    }
    setSelectedNumber(num);
    setError(null);
    setIsLoading(true);
    try {
      if (historicalData.length === 0) {
        setError("Données historiques non chargées. Veuillez patienter ou rafraîchir.");
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
  }, [drawSlug, inputValue, historicalData]);

  const drawName = getDrawNameBySlug(drawSlug);
  const maxCoOccurrenceCount = coOccurrenceData?.coOccurrences.reduce((max, item) => Math.max(max, item.count), 0) || 0;

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
                  La section "Co-occurrences" montre à quelle fréquence le numéro que vous avez recherché est apparu
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
          <div className="flex space-x-2 items-end">
            <div className="flex-grow">
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
            <Button onClick={handleSearch} disabled={isLoading || historicalData.length === 0}>
              <Search className="mr-2 h-4 w-4" /> Rechercher
            </Button>
          </div>

          {isLoading && !coOccurrenceData && <Skeleton className="h-40 w-full" />}
          {error && <p className="text-destructive">{error}</p>}

          {coOccurrenceData && selectedNumber !== null && (
            <div>
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
                            className="transition-colors duration-300"
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
           {!isLoading && !coOccurrenceData && !error && historicalData.length > 0 && (
            <p className="text-muted-foreground">Entrez un numéro et cliquez sur "Rechercher" pour voir ses co-occurrences.</p>
          )}
          {!isLoading && historicalData.length === 0 && !error && (
              <p className="text-muted-foreground">Chargement des données historiques en cours...</p>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
