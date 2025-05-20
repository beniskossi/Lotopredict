
"use client";

import React, { useState, useEffect } from 'react';
import { fetchRecentLottoResults, type FirestoreDrawDoc } from '@/services/lotoData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { LotoBall } from '@/components/loto/LotoBall';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ListCollapse, AlertCircle } from "lucide-react";
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ScrollArea } from '../ui/scroll-area';

const RESULTS_TO_SHOW = 20;

export default function RecentDrawResultsTable() {
  const [results, setResults] = useState<FirestoreDrawDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadRecentResults = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchRecentLottoResults(RESULTS_TO_SHOW);
        setResults(data);
      } catch (err) {
        console.error("Failed to load recent draw results:", err);
        setError("Impossible de charger les résultats récents.");
      } finally {
        setLoading(false);
      }
    };
    loadRecentResults();
  }, []);

  if (loading) {
    return (
      <div className="space-y-2 mt-4">
        <Skeleton className="h-8 w-1/4" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Erreur</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (results.length === 0) {
    return (
      <Alert className="mt-4">
        <ListCollapse className="h-4 w-4" />
        <AlertTitle>Aucune Donnée</AlertTitle>
        <AlertDescription>
          Aucun résultat de tirage n'a encore été sauvegardé dans Firestore. Les données apparaîtront ici après leur récupération.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <ScrollArea className="h-[400px] mt-4 rounded-md border">
      <Table>
        <TableHeader className="sticky top-0 bg-card">
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Nom du Tirage</TableHead>
            <TableHead>Numéros Gagnants</TableHead>
            <TableHead>Numéros Machine</TableHead>
            <TableHead>Date Récup.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((result, index) => (
            <TableRow key={`${result.date}-${result.apiDrawName}-${index}`}>
              <TableCell className="whitespace-nowrap">
                {format(parseISO(result.date), 'dd/MM/yyyy', { locale: fr })}
              </TableCell>
              <TableCell>{result.apiDrawName}</TableCell>
              <TableCell>
                <div className="flex space-x-1">
                  {result.winningNumbers.map(num => <LotoBall key={`win-${num}-${index}`} number={num} size="sm" />)}
                </div>
              </TableCell>
              <TableCell>
                {result.machineNumbers && result.machineNumbers.length > 0 ? (
                  <div className="flex space-x-1">
                    {result.machineNumbers.map(num => <LotoBall key={`mac-${num}-${index}`} number={num} size="sm" />)}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">N/A</span>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                 {result.fetchedAt ? format(result.fetchedAt.toDate(), 'dd/MM/yy HH:mm', { locale: fr }) : 'N/A'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
