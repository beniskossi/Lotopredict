
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Skeleton } from "@/components/ui/skeleton";
import { fetchHistoricalData } from '@/services/lotoData';
import type { NumberFrequency as NumberFrequencyType, HistoricalDataEntry } from '@/types/loto';
import { getDrawNameBySlug } from '@/lib/lotoDraws.ts';
import { LotoBall } from './LotoBall';
import { Button } from '../ui/button';
import { RefreshCw, CalendarIcon, Search, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format, parseISO, parse as dateFnsParse, isValid as isDateValid } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useToast } from "@/hooks/use-toast";


interface StatsSectionProps {
  drawSlug: string;
}

const CHART_COLOR_1 = "hsl(var(--chart-1))";
const CHART_COLOR_2 = "hsl(var(--chart-2))";
const CHART_COLOR_3 = "hsl(var(--chart-3))";
const CHART_COLOR_4 = "hsl(var(--chart-4))";
const CHART_COLOR_5 = "hsl(var(--chart-5))";
const PIE_CHART_COLORS = [CHART_COLOR_1, CHART_COLOR_2, CHART_COLOR_3, CHART_COLOR_4, CHART_COLOR_5, "hsl(var(--muted))"];


export function StatsSection({ drawSlug }: StatsSectionProps) {
  const [allHistoricalData, setAllHistoricalData] = useState<HistoricalDataEntry[]>([]);
  const [filteredFrequencies, setFilteredFrequencies] = useState<NumberFrequencyType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [timelineNumber, setTimelineNumber] = useState<string>('');
  const [timelineData, setTimelineData] = useState<Array<{ date: string; count: number }>>([]);
  const { toast } = useToast();

  const drawName = getDrawNameBySlug(drawSlug);

  const loadAllHistoricalData = async () => {
    setIsLoading(true);
    setError(null);
    try {
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
  
  const parseHistoricalDate = (dateStr: string): Date | null => {
    // Try parsing common formats, PPP (e.g., "25 juil. 2024") which is used for display,
    // and 'yyyy-MM-dd' which is used internally by the service.
    let parsedDate = dateFnsParse(dateStr, 'PPP', new Date(), { locale: fr });
    if (isDateValid(parsedDate)) return parsedDate;

    parsedDate = parseISO(dateStr); // Try ISO format
    if (isDateValid(parsedDate)) return parsedDate;
    
    // Fallback for "DD Mois. YYYY" when month is abbreviated like "juil."
    const parts = dateStr.split(' ');
    if (parts.length === 3) {
      const day = parts[0];
      const monthStr = parts[1].replace('.', '');
      const year = parts[2];
      const monthIndex = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'].indexOf(monthStr.toLowerCase());
      if (monthIndex !== -1) {
        parsedDate = new Date(parseInt(year), monthIndex, parseInt(day));
        if (isDateValid(parsedDate)) return parsedDate;
      }
    }
    console.warn("Could not parse date for filtering:", dateStr);
    return null;
  };


  useEffect(() => {
    if (allHistoricalData.length === 0) {
      setFilteredFrequencies([]);
      setTimelineData([]);
      return;
    }

    const dataToProcess = allHistoricalData.filter(entry => {
      const entryDate = parseHistoricalDate(entry.date);
      if (!entryDate) return false; // Exclude if date couldn't be parsed

      const isAfterStartDate = startDate ? entryDate >= new Date(new Date(startDate).setHours(0,0,0,0)) : true;
      const isBeforeEndDate = endDate ? entryDate <= new Date(new Date(endDate).setHours(23,59,59,999)) : true;
      return isAfterStartDate && isBeforeEndDate;
    }).sort((a,b) => { // Ensure data is sorted by date for timeline
        const dateA = parseHistoricalDate(a.date);
        const dateB = parseHistoricalDate(b.date);
        if (!dateA || !dateB) return 0;
        return dateA.getTime() - dateB.getTime();
    });

    const allNumbersFromProcessedData = dataToProcess.flatMap(entry => {
      const nums = [...entry.winningNumbers];
      if (entry.machineNumbers) {
        nums.push(...entry.machineNumbers);
      }
      return nums;
    });

    const frequencyMap: Record<number, number> = {};
    allNumbersFromProcessedData.forEach(num => {
      frequencyMap[num] = (frequencyMap[num] || 0) + 1;
    });

    const freqs = Object.entries(frequencyMap)
      .map(([numStr, freq]) => ({ number: parseInt(numStr), frequency: freq }))
      .sort((a, b) => b.frequency - a.frequency || a.number - b.number);
    
    setFilteredFrequencies(freqs);

    // Process timeline data if a number is selected
    const numToTrack = parseInt(timelineNumber);
    if (!isNaN(numToTrack) && numToTrack >= 1 && numToTrack <= 90) {
      const newTimelineData = dataToProcess.map(entry => {
        const entryDate = parseHistoricalDate(entry.date);
        let count = 0;
        if (entry.winningNumbers.includes(numToTrack)) count++;
        if (entry.machineNumbers && entry.machineNumbers.includes(numToTrack)) count++;
        return {
          date: entryDate ? format(entryDate, 'dd/MM/yy') : 'N/A',
          count: count
        };
      });
      setTimelineData(newTimelineData);
    } else {
      setTimelineData([]);
    }

  }, [allHistoricalData, startDate, endDate, timelineNumber]);
  
  const top5Frequent = filteredFrequencies.slice(0, 5);
  const bottom5Frequent = filteredFrequencies.slice(-5).reverse();
  const barChartData = filteredFrequencies.slice(0, 15).map(item => ({ name: item.number.toString(), fréquence: item.frequency }));

  const donutChartData = useMemo(() => {
    if (top5Frequent.length === 0) return [];
    const topNumbersData = top5Frequent.map(item => ({ name: `N° ${item.number}`, value: item.frequency }));
    const totalFrequency = filteredFrequencies.reduce((sum, item) => sum + item.frequency, 0);
    const top5Frequency = topNumbersData.reduce((sum, item) => sum + item.value, 0);
    const otherFrequency = totalFrequency - top5Frequency;
    
    const chartData = [...topNumbersData];
    if (otherFrequency > 0) {
        chartData.push({ name: "Autres", value: otherFrequency });
    }
    return chartData;
  }, [top5Frequent, filteredFrequencies]);


  const clearFilters = () => {
    setStartDate(undefined);
    setEndDate(undefined);
  }

  const handleExport = (formatType: 'CSV' | 'PDF') => {
    toast({
      title: "Fonctionnalité en cours de développement",
      description: `L'exportation en ${formatType} sera bientôt disponible.`,
    });
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl text-primary">Statistiques de Fréquence</CardTitle>
              <CardDescription>
                {drawName} - Basé sur les {
                  allHistoricalData.filter(entry => {
                    const entryDate = parseHistoricalDate(entry.date);
                    if (!entryDate) return false;
                    const isAfterStartDate = startDate ? entryDate >= new Date(new Date(startDate).setHours(0,0,0,0)) : true;
                    const isBeforeEndDate = endDate ? entryDate <= new Date(new Date(endDate).setHours(23,59,59,999)) : true;
                    return isAfterStartDate && isBeforeEndDate;
                  }).length
                } derniers tirages analysés.
                {(startDate || endDate) && " (filtrés)"}
              </CardDescription>
            </div>
            <Button onClick={loadAllHistoricalData} disabled={isLoading} variant="outline" size="icon" aria-label="Rafraîchir les données">
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mt-4 items-center flex-wrap">
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
                    locale={fr}
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
                    locale={fr}
                  />
                </PopoverContent>
              </Popover>
              {(startDate || endDate) && (
                  <Button onClick={clearFilters} variant="ghost" size="sm">Réinitialiser Dates</Button>
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
                  <BarChart data={barChartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
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
                  <h3 className="text-lg font-semibold mb-2 text-foreground">Numéros les Plus Fréquents (Top 5)</h3>
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
                  <h3 className="text-lg font-semibold mb-2 text-foreground">Numéros les Moins Fréquents (Top 5)</h3>
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
              
              <div>
                <h3 className="text-xl font-semibold mb-3 text-foreground">Distribution des Fréquences (Top 5 vs Autres)</h3>
                {donutChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                        <Pie
                        data={donutChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={100}
                        innerRadius={60} // This makes it a donut chart
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        >
                        {donutChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]} />
                        ))}
                        </Pie>
                        <RechartsTooltip
                            contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)'}}
                            labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                        />
                        <Legend />
                    </PieChart>
                    </ResponsiveContainer>
                ) : <p className="text-muted-foreground">Données insuffisantes pour le graphique en donut.</p>}
              </div>

            </>
          ) : (
            <p>Pas assez de données pour afficher les statistiques pour la période sélectionnée ou le tirage.</p>
          )}
        </CardContent>
         <CardFooter className="flex-col items-start space-y-4">
          <div className="flex items-center space-x-2">
            <Button onClick={() => handleExport('CSV')} variant="outline" disabled>
              <Download className="mr-2 h-4 w-4" /> Exporter en CSV
            </Button>
            <Button onClick={() => handleExport('PDF')} variant="outline" disabled>
              <Download className="mr-2 h-4 w-4" /> Exporter en PDF
            </Button>
          </div>
           <p className="text-xs text-muted-foreground">
            L'exportation des données sera bientôt disponible.
          </p>
        </CardFooter>
      </Card>

      {/* Section for Timeline Chart */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl text-primary">Évolution de la Fréquence d'un Numéro</CardTitle>
          <CardDescription>Suivez l'apparition d'un numéro spécifique au fil du temps pour ce tirage.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2 mb-4 items-end">
            <div className="flex-grow sm:max-w-xs">
              <Label htmlFor="timelineNumberInput">Numéro à suivre (1-90)</Label>
              <Input
                id="timelineNumberInput"
                type="number"
                value={timelineNumber}
                onChange={(e) => setTimelineNumber(e.target.value)}
                placeholder="Ex: 23"
                min="1"
                max="90"
              />
            </div>
            {/* Search button removed as timeline updates on input change */}
          </div>
          {isLoading ? <Skeleton className="h-64 w-full" /> : 
           timelineData.length > 0 && parseInt(timelineNumber) >=1 && parseInt(timelineNumber) <=90 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timelineData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" allowDecimals={false} domain={[0, 'dataMax + 1']}/>
                <RechartsTooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)'}}
                  labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                  itemStyle={{ color: CHART_COLOR_2 }}
                />
                <Legend wrapperStyle={{ color: 'hsl(var(--foreground))' }} />
                <Line type="monotone" dataKey="count" name={`Apparitions N° ${timelineNumber}`} stroke={CHART_COLOR_2} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground">
              {timelineNumber && (parseInt(timelineNumber) < 1 || parseInt(timelineNumber) > 90)
                ? "Veuillez entrer un numéro valide (1-90)."
                : timelineNumber 
                  ? `Aucune donnée d'apparition pour le numéro ${timelineNumber} dans la période sélectionnée.`
                  : "Entrez un numéro pour voir son évolution."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
