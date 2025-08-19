
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, FileUp, Loader2, CheckCircle, XCircle, ListChecks } from "lucide-react";
import Link from "next/link";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { useToast } from "@/hooks/use-toast";
import { addManualLottoResult, type ManualLottoResultInput } from "@/services/lotoData";
import { DRAW_SLUG_BY_SIMPLE_NAME_MAP } from "@/lib/lotoDraws.tsx";
import { parse as dateFnsParse, isValid as isDateValid } from 'date-fns';

interface ImportResult {
  status: 'success' | 'error';
  message: string;
  originalRecord?: string;
}

interface ProcessedRecord {
  input: ManualLottoResultInput;
  originalLine?: string; // For CSV, to show in errors
  originalIndex?: number; // For JSON, to show in errors
}

export default function AdminImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [importResults, setImportResults] = useState<ImportResult[]>([]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
      setImportResults([]); // Clear previous results when a new file is selected
    } else {
      setFile(null);
    }
  };

  const parseNumbersString = (numbersStr: string, expectedCount: number): number[] | null => {
    if (!numbersStr || typeof numbersStr !== 'string') {
      return expectedCount === 0 ? [] : null; // Allow empty for optional machine numbers
    }
    const numbers = numbersStr.split(';').map(n => n.trim()).filter(n => n !== "").map(Number);
    if (numbers.some(isNaN)) return null;
    if (numbers.some(n => n < 1 || n > 90)) return null;

    if (expectedCount > 0 && numbers.length !== expectedCount) return null;
    if (numbers.length > 0 && numbers.length !== expectedCount && expectedCount !== 0) return null;

    if (numbers.length === 0 && expectedCount === 0) return [];

    return numbers;
  };

  const processRecords = async (records: ProcessedRecord[]): Promise<ImportResult[]> => {
    const results: ImportResult[] = [];
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const displayRecord = record.originalLine || `Ligne JSON ${record.originalIndex! + 1}`;
      try {
        await addManualLottoResult(record.input);
        results.push({ status: 'success', message: `Importation réussie : ${displayRecord}` });
      } catch (error: any) {
        results.push({ status: 'error', message: `Erreur pour ${displayRecord}: ${error.message}`, originalRecord: displayRecord });
      }
    }
    return results;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      toast({
        variant: "destructive",
        title: "Aucun fichier sélectionné",
        description: "Veuillez sélectionner un fichier CSV ou JSON à importer.",
      });
      return;
    }

    setIsLoading(true);
    setImportResults([]);
    const fileContent = await file.text();
    let parsedRecords: ProcessedRecord[] = [];
    let fileParseError = "";

    try {
      if (file.type === "text/csv" || file.name.endsWith(".csv")) {
        const lines = fileContent.split(/\r\n|\n/).filter(line => line.trim() !== ''); // Ignore empty lines
        if (lines.length <= 1) { // Assuming first line is header
           throw new Error("Le fichier CSV est vide ou ne contient que des en-têtes.");
        }
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          const values = line.split(',');
          if (values.length < 3) { 
             fileParseError += `Ligne ${i+1} ignorée: pas assez de colonnes (attendu 3 ou 4). Ligne: "${line}"\n`;
             continue;
          }

          const [dateStr, apiDrawNameFromFile, wnStr, mnStr = ""] = values.map(v => v.trim());
          
          const dateObj = dateFnsParse(dateStr, 'yyyy-MM-dd', new Date());
          if (!isDateValid(dateObj)) {
            fileParseError += `Ligne ${i+1} ignorée: format de date invalide "${dateStr}". Attendu YYYY-MM-DD.\n`;
            continue;
          }

          const normalizedApiDrawName = apiDrawNameFromFile.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
          const drawSlug = DRAW_SLUG_BY_SIMPLE_NAME_MAP[normalizedApiDrawName];
          if (!drawSlug) {
            fileParseError += `Ligne ${i+1} ignorée: nom de tirage inconnu "${apiDrawNameFromFile}".\n`;
            continue;
          }

          const winningNumbers = parseNumbersString(wnStr, 5);
          if (!winningNumbers) {
            fileParseError += `Ligne ${i+1} ignorée: numéros gagnants invalides "${wnStr}". Attendu 5 numéros (1-90) séparés par ';'.\n`;
            continue;
          }
          
          const machineNumbers = parseNumbersString(mnStr, mnStr ? 5 : 0);
          if (mnStr && !machineNumbers) { 
             fileParseError += `Ligne ${i+1} ignorée: numéros machine invalides "${mnStr}". Attendu 5 numéros (1-90) séparés par ';'.\n`;
             continue;
          }

          parsedRecords.push({
            input: { drawSlug, date: dateObj, winningNumbers, machineNumbers: machineNumbers || [] },
            originalLine: line,
            originalIndex: i
          });
        }
      } else if (file.type === "application/json" || file.name.endsWith(".json")) {
        const jsonData: Array<any> = JSON.parse(fileContent);
        if (!Array.isArray(jsonData)) throw new Error("Le fichier JSON doit être un tableau d'objets.");
        if (jsonData.length === 0) throw new Error("Le fichier JSON est un tableau vide.");

        jsonData.forEach((item, index) => {
          if (!item.date || !item.apiDrawName || !item.winningNumbers) {
             fileParseError += `Objet JSON ${index+1} ignoré: champs requis manquants (date, apiDrawName, winningNumbers).\n`;
             return; 
          }
          const dateObj = dateFnsParse(item.date, 'yyyy-MM-dd', new Date());
          if (!isDateValid(dateObj)) {
            fileParseError += `Objet JSON ${index+1} ignoré: format de date invalide "${item.date}". Attendu YYYY-MM-DD.\n`;
            return;
          }
          
          const normalizedApiDrawName = String(item.apiDrawName).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
          const drawSlug = DRAW_SLUG_BY_SIMPLE_NAME_MAP[normalizedApiDrawName];
          if (!drawSlug) {
            fileParseError += `Objet JSON ${index+1} ignoré: nom de tirage inconnu "${item.apiDrawName}".\n`;
            return;
          }

          if (!Array.isArray(item.winningNumbers) || item.winningNumbers.length !== 5 || item.winningNumbers.some((n:any) => typeof n !== 'number' || n < 1 || n > 90)) {
            fileParseError += `Objet JSON ${index+1} ignoré: numéros gagnants invalides. Attendu un tableau de 5 nombres (1-90).\n`;
            return;
          }
          
          let machineNumbers: number[] = [];
          if (item.machineNumbers !== undefined && item.machineNumbers !== null) {
            if (!Array.isArray(item.machineNumbers) || (item.machineNumbers.length > 0 && item.machineNumbers.length !== 5) || item.machineNumbers.some((n:any) => typeof n !== 'number' || n < 1 || n > 90)) {
                 fileParseError += `Objet JSON ${index+1} ignoré: numéros machine invalides. Si fournis, doit être un tableau de 5 nombres (1-90).\n`;
                 return;
            }
            machineNumbers = item.machineNumbers;
          }

          parsedRecords.push({
            input: { drawSlug, date: dateObj, winningNumbers: item.winningNumbers, machineNumbers },
            originalIndex: index
          });
        });
      } else {
        throw new Error("Type de fichier non supporté. Veuillez utiliser CSV ou JSON.");
      }
    } catch (e: any) {
      fileParseError += `Erreur de lecture ou de parsage du fichier: ${e.message}\n`;
    }
    
    let finalResults: ImportResult[] = [];
    if (parsedRecords.length > 0) {
        const processingResults = await processRecords(parsedRecords); 
        finalResults.push(...processingResults);
    }

    if(fileParseError) {
        finalResults.unshift({status: 'error', message: `Erreurs de pré-traitement du fichier:\n${fileParseError.trim()}`});
    }
    
    if (parsedRecords.length === 0 && !fileParseError && finalResults.length === 0) {
        finalResults.push({status: 'error', message: "Aucun enregistrement valide n'a été trouvé dans le fichier."});
    }
    
    setImportResults(finalResults);

    const successCount = finalResults.filter(r => r.status === 'success').length;
    const errorCount = finalResults.length - successCount;

    if (successCount > 0 && errorCount === 0) {
      toast({
        title: "Importation Réussie",
        description: `${successCount} enregistrement(s) importé(s) avec succès.`,
      });
    } else if (successCount > 0) {
       toast({
        variant: "default",
        title: "Importation Partielle",
        description: `${successCount} succès, ${errorCount} erreur(s). Voir les détails ci-dessous.`,
      });
    } else if (finalResults.length > 0) {
      toast({
        variant: "destructive",
        title: "Échec de l'Importation",
        description: `Aucun enregistrement n'a pu être importé. ${errorCount} erreur(s) détectée(s).`,
      });
    }

    setIsLoading(false);
    setFile(null); 
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) {
        fileInput.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-primary flex items-center">
          <FileUp className="mr-3 h-8 w-8" />
          Importer des Données de Tirage
        </h1>
        <Button variant="outline" asChild>
          <Link href="/admin/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour au Tableau de Bord
          </Link>
        </Button>
      </div>

      <Card className="shadow-lg">
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Téléverser un Fichier de Données</CardTitle>
            <CardDescription>
              Sélectionnez un fichier CSV ou JSON contenant les résultats des tirages à importer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="file-upload">Fichier (CSV, JSON)</Label>
              <Input
                id="file-upload"
                type="file"
                accept=".csv,.json"
                onChange={handleFileChange}
                disabled={isLoading}
                className="cursor-pointer file:cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
              />
              {file && <p className="text-sm text-muted-foreground mt-2">Fichier sélectionné : {file.name} ({Math.round(file.size / 1024)} KB)</p>}
            </div>
            <Alert variant="default" className="border-primary/30 bg-primary/5">
              <FileUp className="h-4 w-4 text-primary" />
              <AlertTitle className="text-primary">Format Attendu</AlertTitle>
              <AlertDescription className="text-muted-foreground space-y-1 text-xs">
                <p><strong>CSV :</strong> En-tête requis mais ignoré. Colonnes: <code>date,apiDrawName,winningNumbers,machineNumbers</code>.
                La date doit être au format <code>YYYY-MM-DD</code>.
                <code>apiDrawName</code> est le nom simple du tirage (ex: "Réveil", insensible à la casse et aux accents).
                <code>winningNumbers</code> : 5 numéros (1-90) séparés par ';'.
                <code>machineNumbers</code> : 5 numéros (1-90) séparés par ';'. Optionnel.</p>
                <p><strong>JSON :</strong> Tableau d'objets avec clés <code>date</code> (string <code>YYYY-MM-DD</code>),
                 <code>apiDrawName</code> (string, nom simple),
                 <code>winningNumbers</code> (array de 5 nombres, 1-90).
                 <code>machineNumbers</code> (array de 5 nombres, 1-90). Optionnel.</p>
              </AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button type="submit" disabled={isLoading || !file}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4"/>}
              {isLoading ? "Importation..." : "Lancer l'Importation"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {importResults.length > 0 && (
        <Card className="shadow-lg mt-6">
          <CardHeader>
            <CardTitle className="flex items-center"><ListChecks className="mr-2 h-6 w-6"/>Résultats de l'Importation</CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto space-y-2">
            {importResults.map((result, index) => (
              <Alert key={index} variant={result.status === 'success' ? 'default' : 'destructive'} className={result.status === 'success' ? 'border-green-500/50 bg-green-500/10 text-green-700 [&>svg]:text-green-600' : 'text-destructive [&>svg]:text-destructive'}>
                {result.status === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                <AlertTitle className={result.status === 'success' ? 'text-green-800' : 'text-destructive' }>{result.status === 'success' ? 'Succès' : 'Erreur'}</AlertTitle>
                <AlertDescription className="whitespace-pre-wrap text-xs">{result.message}</AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

    