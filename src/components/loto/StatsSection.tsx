
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { Skeleton } from "@/components/ui/skeleton";
import { fetchNumberFrequency, fetchHistoricalData } from '@/services/lotoData';
import type { NumberFrequency as NumberFrequencyType, HistoricalDataEntry } from '@/types/loto';
import { getDrawNameBySlug } from '@/lib/lotoDraws.tsx';
import { LotoBall } from './LotoBall';
import { Button } from '../ui/button';
import { RefreshCw, CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface StatsSectionProps {
  drawSlug: string;
}

const CHART_COLOR_1 = "hsl(var(--chart-1))";

export function StatsSection({ drawSlug }: StatsSectionProps) {
  const [allHistoricalData, setAllHistoricalData] = useState<HistoricalDataEntry[]>([]);
  const [filteredFrequencies, setFilteredFrequencies] = useState<NumberFrequencyType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  const drawName = getDrawNameBySlug(drawSlug);

  const loadAllHistoricalData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch a larger dataset for client-side filtering, e.g., 100 past draws
      const hData = await fetchHistoricalData(drawSlug, 100); 
      setAllHistoricalData(hData);
    } catch (err) {
      setError("Erreur lors du chargement des données historiques pour les statistiques.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    loadAllHistoricalData();
  }, [drawSlug]);

  useEffect(() => {
    if (allHistoricalData.length === 0) {
      setFilteredFrequencies([]);
      return;
    }

    const dataToProcess = allHistoricalData.filter(entry => {
      // The date from API is 'PPP' (e.g., "25 juil. 2024"). We need to parse it consistently.
      // Assuming lotoData.ts now stores date as 'yyyy-MM-dd' string or a parsable format like ISO.
      // If dates are 'yyyy-MM-dd' string:
      let entryDate: Date;
      try {
        // First try parsing as ISO, then 'yyyy-MM-dd' if needed
        entryDate = parseISO(entry.date); // If date is already ISO string
        if (!isValid(entryDate)) { // Fallback if not ISO, try 'yyyy-MM-dd' if it was your internal format
             entryDate = parseISO(entry.date); // This needs to match actual date string format
        }
      } catch(e) {
        // Fallback for "25 juil. 2024" format if that's what's in HistoricalDataEntry.date
         const parts = entry.date.split(' ');
         if (parts.length === 3) {
            const day = parts[0];
            const monthStr = parts[1].replace('.', ''); // remove dot from "juil."
            const year = parts[2];
            // This is very brittle, needs proper date parsing based on actual string format
            // For 'fr' locale months like 'janv.', 'févr.', 'juil.'
            const monthIndex = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'].indexOf(monthStr);
            if (monthIndex !== -1) {
                 entryDate = new Date(parseInt(year), monthIndex, parseInt(day));
            } else {
                console.warn("Could not parse date for filtering:", entry.date);
                return true; // include if unparsable for now
            }
         } else {
            console.warn("Could not parse date for filtering:", entry.date);
            return true;
         }
      }
      
      if (!isValid(entryDate)) return true; // If still invalid, include it not to lose data

      const isAfterStartDate = startDate ? entryDate >= new Date(startDate.setHours(0,0,0,0)) : true;
      const isBeforeEndDate = endDate ? entryDate <= new Date(endDate.setHours(23,59,59,999)) : true;
      return isAfterStartDate && isBeforeEndDate;
    });

    const allNumbers = dataToProcess.flatMap(entry => {
      const nums = [...entry.winningNumbers];
      if (entry.machineNumbers) {
        nums.push(...entry.machineNumbers);
      }
      return nums;
    });

    const frequencyMap: Record<number, number> = {};
    allNumbers.forEach(num => {
      frequencyMap[num] = (frequencyMap[num] || 0) + 1;
    });

    const freqs = Object.entries(frequencyMap)
      .map(([numStr, freq]) => ({ number: parseInt(numStr), frequency: freq }))
      .sort((a, b) => b.frequency - a.frequency || a.number - b.number);
    
    setFilteredFrequencies(freqs);

  }, [allHistoricalData, startDate, endDate]);
  
  const isValid = (d: any) => d instanceof Date && !isNaN(d.getTime());


  const top5Frequent = filteredFrequencies.slice(0, 5);
  const bottom5Frequent = filteredFrequencies.slice(-5).reverse();
  const chartData = filteredFrequencies.slice(0, 15).map(item => ({ name: item.number.toString(), fréquence: item.frequency }));

  const clearFilters = () => {
    setStartDate(undefined);
    setEndDate(undefined);
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <CardTitle className="text-2xl text-primary">Statistiques de Fréquence</CardTitle>
            <CardDescription>
              {drawName} - Basé sur les {filteredFrequencies.reduce((acc, curr) => acc + curr.frequency, 0) > 0 ? allHistoricalData.filter(entry => {
                let entryDate: Date;
                 try { entryDate = parseISO(entry.date); } catch { 
                    const parts = entry.date.split(' ');
                     if (parts.length === 3) {
                        const day = parts[0];
                        const monthStr = parts[1].replace('.', '');
                        const year = parts[2];
                        const monthIndex = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'].indexOf(monthStr);
                        entryDate = monthIndex !== -1 ? new Date(parseInt(year), monthIndex, parseInt(day)) : new Date(0);
                     } else { entryDate = new Date(0); }
                 }
                if (!isValid(entryDate)) return true;
                const isAfterStartDate = startDate ? entryDate >= new Date(startDate.setHours(0,0,0,0)) : true;
                const isBeforeEndDate = endDate ? entryDate <= new Date(endDate.setHours(23,59,59,999)) : true;
                return isAfterStartDate && isBeforeEndDate;
              }).length : allHistoricalData.length} derniers tirages analysés.
              {(startDate || endDate) && " (filtrés)"}
            </CardDescription>
          </div>
          <Button onClick={loadAllHistoricalData} disabled={isLoading} variant="outline" size="icon" aria-label="Rafraîchir les données">
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 mt-4 items-center">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full sm:w-[240px] justify-start text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                  aria-label="Choisir la date de début du filtre"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "PPP", { locale: fr }) : <span>Date de début</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                  captionLayout="dropdown-buttons"
                  fromYear={new Date().getFullYear() - 5}
                  toYear={new Date().getFullYear()}
                />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full sm:w-[240px] justify-start text-left font-normal",
                    !endDate && "text-muted-foreground"
                  )}
                  aria-label="Choisir la date de fin du filtre"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "PPP", { locale: fr }) : <span>Date de fin</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  disabled={(date) =>
                    startDate ? date < startDate : false
                  }
                  initialFocus
                  captionLayout="dropdown-buttons"
                  fromYear={new Date().getFullYear() - 5}
                  toYear={new Date().getFullYear()}
                />
              </PopoverContent>
            </Popover>
             {(startDate || endDate) && (
                <Button onClick={clearFilters} variant="ghost" size="sm">Réinitialiser</Button>
            )}
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {isLoading && filteredFrequencies.length === 0 ? (
          <>
            <Skeleton className="h-10 w-1/2 mb-4" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-40 w-full" />
          </>
        ) : error ? (
          <p className="text-destructive">{error}</p>
        ) : filteredFrequencies.length > 0 ? (
          <>
            <div>
              <h3 className="text-xl font-semibold mb-3 text-foreground">Fréquence des Numéros (Top 15)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <RechartsTooltip
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
          <p>Pas assez de données pour afficher les statistiques pour la période sélectionnée ou le tirage.</p>
        )}
      </CardContent>
    </Card>
  );
}
