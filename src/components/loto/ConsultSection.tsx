
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchNumberCoOccurrence, fetchHistoricalData, findDrawsByNumbers } from '@/services/lotoData';
import type { NumberCoOccurrence as NumberCoOccurrenceType, HistoricalDataEntry, DrawResult } from '@/types/loto';
import { getDrawNameBySlug } from '@/lib/lotoDraws.tsx';
import { LotoBall } from './LotoBall';
import { Search, HelpCircle, Check, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { parseISO } from 'date-fns';

interface ConsultSectionProps {
  drawSlug: string;
}


const CombinationChecker = ({ drawSlug, drawName }: { drawSlug: string, drawName: string }) => {
  const [numbers, setNumbers] = useState<string[]>(Array(5).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [foundDraws, setFoundDraws] = useState<DrawResult[] | null>(null);
  const { toast } = useToast();

  const handleInputChange = (index: number, value: string) => {
    // Allow only numbers, and max 2 digits
    if (/^\d{0,2}$/.test(value)) {
      const newNumbers = [...numbers];
      newNumbers[index] = value;
      setNumbers(newNumbers);
    }
  };
  
  const handleCheckCombination = async () => {
     setError(null);
     setFoundDraws(null);

     const parsedNumbers = numbers.map(n => parseInt(n, 10)).filter(n => !isNaN(n));

     if (parsedNumbers.length !== 5) {
       setError("Veuillez saisir 5 numéros valides.");
       return;
     }
     
     if (new Set(parsedNumbers).size !== 5) {
       setError("Les numéros saisis doivent être distincts.");
       return;
     }

     if (parsedNumbers.some(n => n < 1 || n > 90)) {
        setError("Chaque numéro doit être compris entre 1 et 90.");
        return;
     }
     
     setIsLoading(true);
     try {
       const results = await findDrawsByNumbers(drawSlug, parsedNumbers);
       setFoundDraws(results);
     } catch (err) {
        console.error(err);
        toast({
            variant: "destructive",
            title: "Erreur de Recherche",
            description: "Une erreur est survenue lors de la vérification de la combinaison."
        });
     } finally {
        setIsLoading(false);
     }
  };

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="text-xl text-primary flex items-center">
            Vérifier une Combinaison
        </CardTitle>
        <CardDescription>Vos numéros ont-ils déjà gagné pour le tirage {drawName} ?</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-5 gap-2">
            {numbers.map((num, index) => (
                <Input
                    key={index}
                    type="text"
                    pattern="\d*"
                    maxLength={2}
                    value={num}
                    onChange={(e) => handleInputChange(index, e.target.value)}
                    placeholder="N°"
                    className="text-center"
                    aria-label={`Numéro ${index + 1}`}
                />
            ))}
        </div>
        <Button onClick={handleCheckCombination} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Vérifier
        </Button>

        {error && <Alert variant="destructive"><p>{error}</p></Alert>}

        {foundDraws !== null && (
            <div className="mt-4 space-y-2">
                <h3 className="font-semibold text-lg">Résultat de la recherche :</h3>
                {foundDraws.length > 0 ? (
                    <Alert variant="default" className="border-green-500/50 bg-green-500/10 text-green-700 [&>svg]:text-green-600">
                        <AlertTitle className="text-green-800">Félicitations !</AlertTitle>
                        <AlertDescription>
                            Cette combinaison est déjà sortie {foundDraws.length} fois :
                            <ul className="list-disc pl-5 mt-2">
                               {foundDraws.map(draw => (
                                   <li key={draw.docId}>Le {draw.date}</li>
                               ))}
                            </ul>
                        </AlertDescription>
                    </Alert>
                ) : (
                    <Alert variant="default">
                        <AlertTitle>Aucun Résultat</AlertTitle>
                        <AlertDescription>
                            Cette combinaison n'a jamais été tirée pour le tirage {drawName}, d'après notre historique.
                        </AlertDescription>
                    </Alert>
                )}
            </div>
        )}
      </CardContent>
    </Card>
  );
}


export function ConsultSection({ drawSlug }: ConsultSectionProps) {
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [coOccurrenceData, setCoOccurrenceData] = useState<NumberCoOccurrenceType | null>(null);
  const [historicalData, setHistoricalData] = useState<HistoricalDataEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadHistorical = async () => {
      setIsLoadingHistory(true);
      setError(null);
      try {
        const hData = await fetchHistoricalData(drawSlug, 100); 
        setHistoricalData(hData);
      } catch (err) {
        setError("Erreur lors du chargement des données historiques.");
        console.error(err);
      } finally {
        setIsLoadingHistory(false);
      }
    };
    loadHistorical();
  }, [drawSlug]);

  const handleSearch = useCallback(async () => {
    const num = parseInt(inputValue);
    if (isNaN(num) || num < 1 || num > 90) {
      setError("Veuillez entrer un numéro valide entre 1 et 90.");
      return;
    }
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
      setSelectedNumber(num);
    } catch (err) {
      setError(`Erreur lors de la recherche de co-occurrences pour le numéro ${num}.`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [drawSlug, inputValue, historicalData]);

  const drawName = getDrawNameBySlug(drawSlug);

  return (
    <TooltipProvider>
      <div className="space-y-8">
        <CombinationChecker drawSlug={drawSlug} drawName={drawName} />
      
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-primary flex items-center">
              Consulter la Régularité d'un Numéro
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="ml-2">
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>
                    Entrez un numéro pour voir à quelle fréquence il est apparu
                    avec d'autres numéros.
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
                  disabled={isLoadingHistory}
                />
              </div>
              <Button onClick={handleSearch} disabled={isLoading || isLoadingHistory || !inputValue}>
                <Search className="mr-2 h-4 w-4" /> Rechercher
              </Button>
            </div>
            {isLoadingHistory && <Skeleton className="h-10 w-full" />}
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
                            <TableCell>{item.count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p>Aucune co-occurrence trouvée pour le numéro {selectedNumber}.</p>
                )}
              </div>
            )}
            {!coOccurrenceData && !error && !isLoading && (
              <p className="text-muted-foreground">Entrez un numéro et cliquez sur "Rechercher" pour voir les co-occurrences.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

    