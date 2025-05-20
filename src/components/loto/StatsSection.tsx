"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Skeleton } from "@/components/ui/skeleton";
import { fetchNumberFrequency, fetchHistoricalData } from '@/services/lotoData';
import type { NumberFrequency as NumberFrequencyType, HistoricalDataEntry } from '@/types/loto';
import { getDrawNameBySlug } from '@/lib/lotoDraws';
import { LotoBall } from './LotoBall';
import { Button } from '../ui/button';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsSectionProps {
  drawSlug: string;
}

const CHART_COLOR_1 = "hsl(var(--chart-1))";
const CHART_COLOR_2 = "hsl(var(--chart-2))";

export function StatsSection({ drawSlug }: StatsSectionProps) {
  const [frequencies, setFrequencies] = useState<NumberFrequencyType[]>([]);
  const [historicalData, setHistoricalData] = useState<HistoricalDataEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const hData = await fetchHistoricalData(drawSlug, 50); // Fetch 50 past draws for stats
      setHistoricalData(hData);
      const freqData = await fetchNumberFrequency(drawSlug, hData);
      setFrequencies(freqData);
    } catch (err) {
      setError("Erreur lors du calcul des statistiques.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    loadStats();
  }, [drawSlug]);

  const drawName = getDrawNameBySlug(drawSlug);
  const top5Frequent = frequencies.slice(0, 5);
  const bottom5Frequent = frequencies.slice(-5).reverse();

  const chartData = frequencies.slice(0, 15).map(item => ({ name: item.number.toString(), fréquence: item.frequency }));

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-2xl text-primary">Statistiques de Fréquence</CardTitle>
            <CardDescription>{drawName} - Basé sur les {historicalData.length} derniers tirages</CardDescription>
          </div>
          <Button onClick={loadStats} disabled={isLoading} variant="outline" size="icon">
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            <span className="sr-only">Rafraîchir</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {isLoading ? (
          <>
            <Skeleton className="h-10 w-1/2 mb-4" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-40 w-full" />
          </>
        ) : error ? (
          <p className="text-destructive">{error}</p>
        ) : frequencies.length > 0 ? (
          <>
            <div>
              <h3 className="text-xl font-semibold mb-3 text-foreground">Fréquence des Numéros (Top 15)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)'}}
                    labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                    itemStyle={{ color: CHART_COLOR_1 }}
                  />
                  <Legend wrapperStyle={{ color: 'hsl(var(--foreground))' }} />
                  <Bar dataKey="fréquence" fill={CHART_COLOR_1} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">Numéros les Plus Fréquents</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Numéro</TableHead>
                      <TableHead>Fréquence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {top5Frequent.map(item => (
                      <TableRow key={item.number}>
                        <TableCell><LotoBall number={item.number} size="sm" /></TableCell>
                        <TableCell>{item.frequency}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">Numéros les Moins Fréquents</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Numéro</TableHead>
                      <TableHead>Fréquence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bottom5Frequent.map(item => (
                      <TableRow key={item.number}>
                        <TableCell><LotoBall number={item.number} size="sm" /></TableCell>
                        <TableCell>{item.frequency}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        ) : (
          <p>Pas assez de données pour afficher les statistiques.</p>
        )}
      </CardContent>
    </Card>
  );
}
