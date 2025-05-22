
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
import { format, parse as dateFnsParse, isValid, getYear } from 'date-fns';
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

  const loadData = useCallback(async (loadMore = false, isFilterAction = false) => {
    if (!loadMore) {
      setIsLoading(true);
      setData([]); // Clear data for new filter or initial load
      setLastDocSnapshot(null); // Reset pagination cursor
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    const params: FetchDrawDataParams = {
      drawSlug,
      pageSize: 10, // Fetch 10 items per page
      startAfterDoc: loadMore ? lastDocSnapshot : null,
    };

    if (isFilterAction && selectedYear && selectedMonth) {
      params.year = parseInt(selectedYear);
      params.month = parseInt(selectedMonth);
    } else if (!isFilterAction && !loadMore && selectedYear && selectedMonth) {
      // Persist filter if it was previously applied and we are not resetting
      params.year = parseInt(selectedYear);
      params.month = parseInt(selectedMonth);
    }


    try {
      const result: FetchDrawDataResult = await fetchDrawData(params);
      
      setData(prevData => {
        const newData = result.results;
        if (loadMore) {
          // Deduplicate when loading more
          const combined = [...prevData, ...newData];
          const uniqueMap = new Map<string, DrawResult>();
          combined.forEach(item => {
            const key = item.docId || `${item.date}-${item.winningNumbers.join(',')}`;
            if(!uniqueMap.has(key)) uniqueMap.set(key, item);
          });
          return Array.from(uniqueMap.values()).sort((a, b) => {
             try {
                const dateA = dateFnsParse(a.date, 'PPP', new Date(), {locale: fr});
                const dateB = dateFnsParse(b.date, 'PPP', new Date(), {locale: fr});
                if (isValid(dateA) && isValid(dateB)) {
                    return dateB.getTime() - dateA.getTime();
                }
            } catch (e) { /* ignore */ }
            return 0;
          });
        }
        return newData; // For initial load or filter change, replace data
      });
      setLastDocSnapshot(result.lastDocSnapshot);

    } catch (err) {
      setError("Erreur lors de la récupération des données.");
      console.error(err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [drawSlug, lastDocSnapshot, selectedYear, selectedMonth]);

  useEffect(() => {
    setSelectedYear('');
    setSelectedMonth('');
    loadData(false, false); // Initial load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawSlug]);


  const handleFilterApply = () => {
    if(selectedYear && selectedMonth){
        setData([]); // Clear previous results before applying filter
        setLastDocSnapshot(null);
        loadData(false, true); // isFilterAction = true
    } else {
        setError("Veuillez sélectionner une année et un mois pour filtrer.");
    }
  };
  
  const handleResetFilters = () => {
    setSelectedYear('');
    setSelectedMonth('');
    setError(null);
    setData([]); // Clear previous results
    setLastDocSnapshot(null);
    loadData(false, false); // Reload initial data without filters
  };

  const handleLoadMore = () => {
    if (lastDocSnapshot) {
      // Determine if a filter is active to pass to loadData
      const filterIsActive = !!(selectedYear && selectedMonth);
      loadData(true, filterIsActive);
    }
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle className="text-2xl text-primary">Historique des Résultats</CardTitle>
            <CardDescription>{drawName} - Affichage des résultats par tranches de 10.</CardDescription>
          </div>
          <Button 
            onClick={() => loadData(false, !!(selectedYear && selectedMonth))} 
            disabled={isLoading || isLoadingMore} 
            variant="outline" 
            size="icon" 
            aria-label="Rafraîchir les données"
          >
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
          <Button onClick={handleFilterApply} disabled={isLoading || isLoadingMore || !selectedYear || !selectedMonth}>
            <CalendarDays className="mr-2 h-4 w-4" /> Appliquer Filtres
          </Button>
          <Button onClick={handleResetFilters} variant="outline" disabled={isLoading || isLoadingMore}>
            Réinitialiser
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading && data.length === 0 ? ( 
          <div className="space-y-8">
            {[...Array(3)].map((_, i) => ( // Show fewer skeletons for quicker initial feel
              <div key={i} className="space-y-4 p-4 border-b border-border last:border-b-0">
                <Skeleton className="h-5 w-32 mb-3" />
                <div>
                  <Skeleton className="h-6 w-1/3 mb-2" />
                  <div className="flex space-x-2">
                    {[...Array(5)].map((_, j) => <Skeleton key={`win-skel-${i}-${j}`} className="w-10 h-10 rounded-full" />)}
                  </div>
                </div>
                { (i % 2 === 0) &&
                <div>
                  <Skeleton className="h-6 w-1/3 mb-2" />
                  <div className="flex space-x-2">
                    {[...Array(5)].map((_, j) => <Skeleton key={`mac-skel-${i}-${j}`} className="w-10 h-10 rounded-full" />)}
                  </div>
                </div>
                }
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
            <div className="mt-6 text-center">
              <p className="text-muted-foreground">
                Pour une analyse plus approfondie, veuillez visiter les sections :
              </p>
              <div className="flex justify-center gap-4 mt-2">
                <Button variant="link" asChild className="text-primary hover:underline">
                  <Link href={`/draw/${drawSlug}?tab=statistiques`} scroll={false}>
                    Statistiques <ExternalLink className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
                <Button variant="link" asChild className="text-primary hover:underline">
                  <Link href={`/draw/${drawSlug}?tab=consulter`} scroll={false}>
                    Consulter Régularité <ExternalLink className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </div>
          </>
        ) : (
           <p className="text-center py-4 text-muted-foreground">
            { (selectedYear && selectedMonth) ? `Aucun résultat trouvé pour ${monthOptions.find(m=>m.value === selectedMonth)?.label || ''} ${selectedYear}.` : "Aucun résultat récent trouvé pour ce tirage."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
