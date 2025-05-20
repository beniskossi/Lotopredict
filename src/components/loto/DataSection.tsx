"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Skeleton } from "@/components/ui/skeleton";
import { LotoBall } from "./LotoBall";
import { fetchDrawData } from '@/services/lotoData';
import type { DrawResult } from '@/types/loto';
import { RefreshCw } from 'lucide-react';
import { getDrawNameBySlug } from '@/lib/lotoDraws';

interface DataSectionProps {
  drawSlug: string;
}

export function DataSection({ drawSlug }: DataSectionProps) {
  const [data, setData] = useState<DrawResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchDrawData(drawSlug);
      setData(result);
    } catch (err) {
      setError("Erreur lors de la récupération des données.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [drawSlug]);

  const drawName = getDrawNameBySlug(drawSlug);

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-2xl text-primary">Résultats du Tirage</CardTitle>
            <CardDescription>{drawName} - {data?.date || <Skeleton className="h-4 w-32 inline-block" />}</CardDescription>
          </div>
          <Button onClick={loadData} disabled={isLoading} variant="outline" size="icon">
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            <span className="sr-only">Rafraîchir</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-6">
            <div>
              <Skeleton className="h-6 w-1/3 mb-2" />
              <div className="flex space-x-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="w-10 h-10 rounded-full" />)}
              </div>
            </div>
            <div>
              <Skeleton className="h-6 w-1/3 mb-2" />
              <div className="flex space-x-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="w-10 h-10 rounded-full" />)}
              </div>
            </div>
          </div>
        ) : error ? (
          <p className="text-destructive">{error}</p>
        ) : data ? (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">Numéros Gagnants</h3>
              <div className="flex space-x-2 md:space-x-3 flex-wrap gap-y-2">
                {data.winningNumbers.map(num => <LotoBall key={`win-${num}`} number={num} />)}
              </div>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">Numéros Machine</h3>
              <div className="flex space-x-2 md:space-x-3 flex-wrap gap-y-2">
                {data.machineNumbers.map(num => <LotoBall key={`mac-${num}`} number={num} />)}
              </div>
            </div>
          </div>
        ) : (
          <p>Aucune donnée disponible.</p>
        )}
      </CardContent>
    </Card>
  );
}
