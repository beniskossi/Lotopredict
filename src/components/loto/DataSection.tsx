
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Skeleton } from "@/components/ui/skeleton";
import { LotoBall } from "./LotoBall";
import { fetchDrawData, type FetchDrawDataParams, type FetchDrawDataResult } from '@/services/lotoData';
import type { DrawResult, FirestoreDrawDoc } from '@/types/loto';
import { RefreshCw, ExternalLink, ChevronDown, CalendarDays } from 'lucide-react';
import { getDrawNameBySlug } from '@/lib/lotoDraws.tsx';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { ScrollArea } from '../ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface DataSectionProps {
  drawSlug: string;
}

const generateYearOptions = () => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let year = currentYear; year >= 2015; year--) {
    years.push({ value: year.toString(), label: year.toString() });
  }
  return years;
};

const monthOptions = Array.from({ length: 12 }, (_, i) => ({
  value: (i + 1).toString(),
  label: format(new Date(2000, i), 'MMMM', { locale: fr }), // Use a fixed year for month name generation
}));


export function DataSection({ drawSlug }: DataSectionProps) {
  const [data, setData] = useState<DrawResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDocSnapshot, setLastDocSnapshot] = useState<QueryDocumentSnapshot<FirestoreDrawDoc> | null | undefined>(undefined);

  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  const yearOptions = useMemo(() => generateYearOptions(), []);
  const drawName = getDrawNameBySlug(drawSlug);

  const loadData = useCallback(async (loadMore = false) => {
    if (!loadMore) {
      setIsLoading(true);
      setLastDocSnapshot(null); // Reset pagination cursor for new filter or initial load
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    const params: FetchDrawDataParams = {
      drawSlug,
      pageSize: 10,
      startAfterDoc: loadMore ? lastDocSnapshot : null,
      year: selectedYear ? parseInt(selectedYear) : undefined,
      month: selectedMonth ? parseInt(selectedMonth) : undefined,
    };

    try {
      const result: FetchDrawDataResult = await fetchDrawData(params);
      setData(prevData => loadMore ? [...prevData, ...result.results] : result.results);
      setLastDocSnapshot(result.lastDocSnapshot);
    } catch (err) {
      setError("Erreur lors de la récupération des données.");
      console.error(err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [drawSlug, lastDocSnapshot, selectedYear, selectedMonth]);

  const handleFilterOrInitialLoad = useCallback(() => {
     setData([]); 
     loadData(false);
  }, [loadData]);


  useEffect(() => {
    handleFilterOrInitialLoad();
  }, [drawSlug, selectedYear, selectedMonth, handleFilterOrInitialLoad]);

  
  const handleResetFilters = () => {
    setSelectedYear('');
    setSelectedMonth('');
  };

  const handleLoadMore = () => {
    if (lastDocSnapshot) {
      loadData(true);
    }
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle className="text-2xl text-primary">Historique des Résultats</CardTitle>
            <CardDescription>{drawName}</CardDescription>
          </div>
          <Button onClick={() => loadData()} disabled={isLoading || isLoadingMore} variant="outline" size="icon" aria-label="Rafraîchir les données">
            <RefreshCw className={cn("h-4 w-4", (isLoading || isLoadingMore) && "animate-spin")} />
          </Button>
        </div>
        <div className="mt-4 flex flex-col sm:flex-row gap-4 items-end flex-wrap">
          <div>
            <Label htmlFor="year-select">Année</Label>
            <Select value={selectedYear} onValueChange={setSelectedYear} disabled={isLoading || isLoadingMore}>
              <SelectTrigger id="year-select" className="w-full sm:w-[180px]">
                <SelectValue placeholder="Choisir une année" />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="month-select">Mois</Label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth} disabled={isLoading || isLoadingMore}>
              <SelectTrigger id="month-select" className="w-full sm:w-[180px]">
                <SelectValue placeholder="Choisir un mois" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleResetFilters} variant="outline" disabled={isLoading || isLoadingMore}>
            Réinitialiser
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading && data.length === 0 ? ( 
          <div className="space-y-8">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="space-y-4 p-4 border-b border-border last:border-b-0">
                <Skeleton className="h-5 w-32 mb-3" />
                <div>
                  <Skeleton className="h-6 w-1/3 mb-2" />
                  <div className="flex space-x-2">
                    {[...Array(5)].map((_, j) => <Skeleton key={`win-skel-${i}-${j}`} className="w-10 h-10 rounded-full" />)}
                  </div>
                </div>
                <div>
                  <Skeleton className="h-6 w-1/3 mb-2" />
                  <div className="flex space-x-2">
                    {[...Array(5)].map((_, j) => <Skeleton key={`mac-skel-${i}-${j}`} className="w-10 h-10 rounded-full" />)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="text-destructive text-center py-4">{error}</p>
        ) : data && data.length > 0 ? (
          <>
            <ScrollArea className="h-[600px] w-full pr-4">
              <div className="space-y-8">
                {data.map((draw) => (
                  <div key={draw.docId || `${draw.date}-${draw.winningNumbers.join('-')}`} className="space-y-4 p-4 border-b border-border last:border-b-0 rounded-md shadow-sm bg-card/50">
                    <p className="text-lg font-semibold text-primary">{draw.date}</p>
                    <div>
                      <h3 className="text-xl font-semibold mb-2 text-foreground">Numéros Gagnants</h3>
                      <div className="flex space-x-2 md:space-x-3 flex-wrap gap-y-2">
                        {draw.winningNumbers.map(num => <LotoBall key={`win-${num}-${draw.docId || draw.date}`} number={num} />)}
                      </div>
                    </div>
                    {draw.machineNumbers && draw.machineNumbers.length > 0 && (
                      <div>
                        <h3 className="text-xl font-semibold mb-2 text-foreground">Numéros Machine</h3>
                        <div className="flex space-x-2 md:space-x-3 flex-wrap gap-y-2">
                          {draw.machineNumbers.map(num => <LotoBall key={`mac-${num}-${draw.docId || draw.date}`} number={num} />)}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            {lastDocSnapshot && (
              <div className="mt-6 text-center">
                <Button onClick={handleLoadMore} disabled={isLoadingMore}>
                  {isLoadingMore ? 'Chargement...' : 'Charger Plus'} <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        ) : (
          <p className="text-center py-4 text-muted-foreground">
            Aucun résultat trouvé pour ce tirage ou ces filtres.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
