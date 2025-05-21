
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Skeleton } from "@/components/ui/skeleton";
import { LotoBall } from "./LotoBall";
import { fetchDrawData } from '@/services/lotoData';
import type { DrawResult } from '@/types/loto';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { getDrawNameBySlug } from '@/lib/lotoDraws.tsx';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface DataSectionProps {
  drawSlug: string;
}

export function DataSection({ drawSlug }: DataSectionProps) {
  const [data, setData] = useState<DrawResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchDrawData(drawSlug);
      // Final client-side deduplication before setting state
      const uniqueResults = Array.from(
        new Map(result.map(item => [item.docId || `${item.date}`, item])).values()
      );
      setData(uniqueResults);
    } catch (err) {
      setError("Erreur lors de la récupération des données.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawSlug]);

  const drawName = getDrawNameBySlug(drawSlug);

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-2xl text-primary">Derniers Résultats du Tirage</CardTitle>
            <CardDescription>{drawName} - Affichage des {data ? data.length : 'derniers'} résultats les plus récents.</CardDescription>
          </div>
          <Button onClick={loadData} disabled={isLoading} variant="outline" size="icon" aria-label="Rafraîchir les données">
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="space-y-8">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-4 p-4 border-b border-border last:border-b-0">
                <Skeleton className="h-5 w-32 mb-3" /> {/* Date Skeleton */}
                <div>
                  <Skeleton className="h-6 w-1/3 mb-2" /> {/* Title Skeleton */}
                  <div className="flex space-x-2">
                    {[...Array(5)].map((_, j) => <Skeleton key={`win-skel-${i}-${j}`} className="w-10 h-10 rounded-full" />)}
                  </div>
                </div>
                <div>
                  <Skeleton className="h-6 w-1/3 mb-2" /> {/* Title Skeleton */}
                  <div className="flex space-x-2">
                    {[...Array(5)].map((_, j) => <Skeleton key={`mac-skel-${i}-${j}`} className="w-10 h-10 rounded-full" />)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="text-destructive">{error}</p>
        ) : data && data.length > 0 ? (
          <>
            <div className="space-y-8">
              {data.map((draw, index) => (
                <div key={draw.docId || `${draw.date}-${index}`} className="space-y-4 p-4 border-b border-border last:border-b-0 rounded-md shadow-sm bg-card/50">
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
            <div className="mt-6 text-center">
              <p className="text-muted-foreground">
                Pour consulter l'historique complet et des analyses détaillées, veuillez visiter les sections :
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
          <p>Aucun résultat récent trouvé pour ce tirage.</p>
        )}
      </CardContent>
    </Card>
  );
}
