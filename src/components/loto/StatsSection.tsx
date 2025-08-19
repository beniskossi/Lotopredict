
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Skeleton } from "@/components/ui/skeleton";
import { fetchHistoricalData } from '@/services/lotoData';
import type { NumberFrequency as NumberFrequencyType, HistoricalDataEntry } from '@/types/loto';
import { getDrawNameBySlug } from '@/lib/lotoDraws.tsx';
import { LotoBall } from './LotoBall';
import { Button } from '../ui/button';
import { RefreshCw, CalendarIcon, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';


interface StatsSectionProps {
  drawSlug: string;
}

const CHART_COLOR_1 = "hsl(var(--chart-1))";
const PIE_CHART_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--muted))"];


export function StatsSection({ drawSlug }: StatsSectionProps) {
  const [allHistoricalData, setAllHistoricalData] = useState<HistoricalDataEntry[]>([]);
  const [filteredFrequencies, setFilteredFrequencies] = useState<NumberFrequencyType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{from?: Date, to?: Date}>({});
  
  const barChartRef = useRef<HTMLDivElement>(null);
  const drawName = getDrawNameBySlug(drawSlug);

  const loadAllHistoricalData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const hData = await fetchHistoricalData(drawSlug, 200); 
      setAllHistoricalData(hData);
    } catch (err) {
      setError("Erreur lors du chargement des données historiques pour les statistiques.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [drawSlug]);
  
  useEffect(() => {
    loadAllHistoricalData();
  }, [loadAllHistoricalData]);
  

  useEffect(() => {
    if (allHistoricalData.length === 0) {
      setFilteredFrequencies([]);
      return;
    }

    const dataToProcess = allHistoricalData.filter(entry => {
      if (!entry.date || !isValid(parseISO(entry.date))) return false;
      const entryDate = parseISO(entry.date);
      const isAfterStartDate = dateRange.from ? entryDate >= dateRange.from : true;
      const isBeforeEndDate = dateRange.to ? entryDate <= dateRange.to : true;
      return isAfterStartDate && isBeforeEndDate;
    });

    const allNumbersFromProcessedData = dataToProcess.flatMap(entry => [
        ...entry.winningNumbers, 
        ...(entry.machineNumbers || [])
    ]);

    const frequencyMap: Record<number, number> = {};
    allNumbersFromProcessedData.forEach(num => {
      frequencyMap[num] = (frequencyMap[num] || 0) + 1;
    });

    const freqs = Object.entries(frequencyMap)
      .map(([numStr, freq]) => ({ number: parseInt(numStr), frequency: freq }))
      .sort((a, b) => b.frequency - a.frequency || a.number - b.number);
    
    setFilteredFrequencies(freqs);
  }, [allHistoricalData, dateRange]);
  
  const top5Frequent = useMemo(() => filteredFrequencies.slice(0, 5), [filteredFrequencies]);
  const bottom5Frequent = useMemo(() => filteredFrequencies.slice(-5).reverse(), [filteredFrequencies]);
  const barChartData = useMemo(() => filteredFrequencies.slice(0, 15).map(item => ({ name: item.number.toString(), fréquence: item.frequency })), [filteredFrequencies]);

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
    setDateRange({});
  }

  const handleExportCSV = () => {
    if (filteredFrequencies.length === 0) return;
    setIsExporting(true);

    const headers = ["Numero", "Frequence"];
    const rows = filteredFrequencies.map(f => [f.number, f.frequency]);
    
    let csvContent = "data:text/csv;charset=utf-8," 
        + headers.join(",") + "\n" 
        + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const fileName = `statistiques_${drawSlug}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExporting(false);
  };
  
  const handleExportPDF = async () => {
     if (filteredFrequencies.length === 0 || !barChartRef.current) return;
     setIsExporting(true);
     
     const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
     
     // Dynamically import html2canvas only when needed
     const html2canvas = (await import('html2canvas')).default;
     
     const canvas = await html2canvas(barChartRef.current, { scale: 2 });
     const imgData = canvas.toDataURL('image/png');
     
     // PDF Title
     pdf.setFontSize(18);
     pdf.text(`Statistiques pour: ${drawName}`, 14, 22);
     pdf.setFontSize(11);
     pdf.setTextColor(100);
     const dateFilterText = dateRange.from 
        ? `Période du ${format(dateRange.from, 'dd/MM/yyyy')} au ${dateRange.to ? format(dateRange.to, 'dd/MM/yyyy') : 'maintenant'}`
        : 'Toutes les données';
     pdf.text(dateFilterText, 14, 30);
     
     // Add chart image
     const imgProps = pdf.getImageProperties(imgData);
     const pdfWidth = pdf.internal.pageSize.getWidth();
     const imgWidth = pdfWidth - 28; // with margins
     const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
     pdf.addImage(imgData, 'PNG', 14, 40, imgWidth, imgHeight);

     // Add tables
    const tableStartY = 40 + imgHeight + 10;
    autoTable(pdf, {
        startY: tableStartY,
        head: [['Numéro', 'Fréquence (Top 5)']],
        body: top5Frequent.map(f => [f.number, f.frequency]),
        theme: 'striped',
        headStyles: { fillColor: [51, 102, 204] },
    });
    
    autoTable(pdf, {
        startY: (pdf as any).lastAutoTable.finalY + 10,
        head: [['Numéro', 'Fréquence (Flop 5)']],
        body: bottom5Frequent.map(f => [f.number, f.frequency]),
        theme: 'striped',
        headStyles: { fillColor: [255, 99, 132] },
    });


     const fileName = `statistiques_${drawSlug}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
     pdf.save(fileName);
     setIsExporting(false);
  };


  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl text-primary">Statistiques de Fréquence</CardTitle>
              <CardDescription>
                {drawName} - Basé sur les {allHistoricalData.length} derniers tirages.
                {(dateRange.from || dateRange.to) && " (filtrés)"}
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
                    id="date"
                    variant={"outline"}
                    className={cn(
                      "w-full sm:w-[300px] justify-start text-left font-normal",
                      !dateRange.from && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "LLL dd, y", { locale: fr })} -{" "}
                          {format(dateRange.to, "LLL dd, y", { locale: fr })}
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd, y", { locale: fr })
                      )
                    ) : (
                      <span>Choisir une période</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                    locale={fr}
                    disabled={(date) => date > new Date() || date < new Date("2015-01-01")}
                  />
                </PopoverContent>
              </Popover>
              {(dateRange.from || dateRange.to) && (
                  <Button onClick={clearFilters} variant="ghost" size="sm">Réinitialiser</Button>
              )}
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
          ) : filteredFrequencies.length > 0 ? (
            <>
              <div ref={barChartRef} className="bg-card p-4 rounded-md">
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
              </div>

            </>
          ) : (
            <p className="text-center py-4 text-muted-foreground">
             Pas de données pour la période sélectionnée. Veuillez ajuster les filtres ou rafraîchir les données.
            </p>
          )}
        </CardContent>
         <CardFooter className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleExportCSV} disabled={isExporting || isLoading || filteredFrequencies.length === 0}>
                {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Exporter en CSV
            </Button>
            <Button variant="outline" onClick={handleExportPDF} disabled={isExporting || isLoading || filteredFrequencies.length === 0}>
                {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Exporter en PDF
            </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
