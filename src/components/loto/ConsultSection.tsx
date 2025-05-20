"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchNumberCoOccurrence, fetchHistoricalData } from '@/services/lotoData';
import type { NumberCoOccurrence as NumberCoOccurrenceType, HistoricalDataEntry } from '@/types/loto';
import { getDrawNameBySlug } from '@/lib/lotoDraws';
import { LotoBall } from './LotoBall';
import { Search } from 'lucide-react';

interface ConsultSectionProps {
  drawSlug: string;
}

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
        const hData = await fetchHistoricalData(drawSlug, 50); // Fetch 50 past draws
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

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl text-primary">Consulter la Régularité d'un Numéro</CardTitle>
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
            />
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
                      <TableCell>{item.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
  );
}
