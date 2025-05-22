
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
    if (numbers.some(isNaN) || (expectedCount > 0 && numbers.length !== expectedCount)) {
      return null; // Invalid numbers or wrong count
    }
    if (numbers.length === 0 && expectedCount > 0) return null; // if required but empty
    if (numbers.length > 0 && numbers.length !== expectedCount && expectedCount !== 0) return null; // if partially filled but not meeting count for required
    if (numbers.length === 0 && expectedCount === 0) return []; // Correctly handle empty optional machine numbers

    // Basic range check
    if (numbers.some(n => n < 1 || n > 90)) return null;
    
    return numbers;
  };

  const processRecords = async (records: ProcessedRecord[]): Promise<ImportResult[]> => {
    const results: ImportResult[] = [];
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const displayRecord = record.originalLine || `JSON Record ${record.originalIndex! + 1}`;
      try {
        await addManualLottoResult(record.input);
        results.push({ status: 'success', message: `Record importé avec succès: ${displayRecord}` });
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
        const lines = fileContent.split(/\r\n|\n/);
        if (lines.length <= 1 && lines[0].trim() === "") { // Handle empty or header-only CSV
           throw new Error("Le fichier CSV est vide ou ne contient que des en-têtes.");
        }
        // const header = lines[0]; // Assuming first line is header, not strictly validated
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line.trim()) continue; // Skip empty lines
          const values = line.split(',');
          if (values.length < 3) { 
             fileParseError += `Ligne ${i+1} ignorée: nombre de colonnes insuffisant. Attendu au moins 3 (date,apiDrawName,winningNumbers), obtenu ${values.length}. Ligne: "${line}"\n`;
             continue;
          }

          const [dateStr, apiDrawNameFromFile, wnStr, mnStr = ""] = values.map(v => v.trim());
          
          const dateObj = dateFnsParse(dateStr, 'yyyy-MM-dd', new Date());
          if (!isDateValid(dateObj)) {
            fileParseError += `Ligne ${i+1} ignorée: Format de date invalide "${dateStr}". Attendu YYYY-MM-DD.\n`;
            continue;
          }

          const normalizedApiDrawName = apiDrawNameFromFile.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
          const drawSlug = DRAW_SLUG_BY_SIMPLE_NAME_MAP[normalizedApiDrawName];
          if (!drawSlug) {
            fileParseError += `Ligne ${i+1} ignorée: Nom de tirage "${apiDrawNameFromFile}" non reconnu.\n`;
            continue;
          }

          const winningNumbers = parseNumbersString(wnStr, 5);
          if (!winningNumbers) {
            fileParseError += `Ligne ${i+1} ignorée: Numéros gagnants invalides "${wnStr}". Attendu 5 numéros (1-90) séparés par ';'.\n`;
            continue;
          }
          
          const machineNumbers = parseNumbersString(mnStr, mnStr ? 5 : 0); // Expect 5 if mnStr is provided, 0 otherwise
          if (mnStr && !machineNumbers) { 
             fileParseError += `Ligne ${i+1} ignorée: Numéros machine invalides "${mnStr}". Si fournis, 5 numéros (1-90) séparés par ';' sont attendus.\n`;
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
            fileParseError += `Objet JSON ${index+1} ignoré: Format de date invalide "${item.date}". Attendu YYYY-MM-DD.\n`;
            return;
          }
          
          const normalizedApiDrawName = String(item.apiDrawName).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
          const drawSlug = DRAW_SLUG_BY_SIMPLE_NAME_MAP[normalizedApiDrawName];
          if (!drawSlug) {
            fileParseError += `Objet JSON ${index+1} ignoré: Nom de tirage "${item.apiDrawName}" non reconnu.\n`;
            return;
          }

          if (!Array.isArray(item.winningNumbers) || item.winningNumbers.length !== 5 || item.winningNumbers.some((n:any) => typeof n !== 'number' || n < 1 || n > 90)) {
            fileParseError += `Objet JSON ${index+1} ignoré: Numéros gagnants invalides. Attendu un tableau de 5 nombres (1-90).\n`;
            return;
          }
          
          let machineNumbers: number[] = [];
          if (item.machineNumbers !== undefined && item.machineNumbers !== null) { // Check for presence
            if (!Array.isArray(item.machineNumbers) || (item.machineNumbers.length > 0 && item.machineNumbers.length !== 5) || item.machineNumbers.some((n:any) => typeof n !== 'number' || n < 1 || n > 90)) {
                 fileParseError += `Objet JSON ${index+1} ignoré: Numéros machine invalides. Si fournis, doit être un tableau de 5 nombres (1-90).\n`;
                 return;
            }
            machineNumbers = item.machineNumbers.length === 0 && item.machineNumbers !== undefined ? [] : item.machineNumbers; // Allow empty array if explicitly passed
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
        const processingResults = await processRecords(parsedRecords.filter(pr => pr.input.drawSlug)); 
        finalResults.push(...processingResults);
    }

    if(fileParseError) {
        finalResults.unshift({status: 'error', message: `Erreurs de pré-traitement ou de formatage du fichier:\n${fileParseError.trim()}`});
    }
    
    if (parsedRecords.length === 0 && !fileParseError && finalResults.length === 0) {
        finalResults.push({status: 'error', message: "Aucun enregistrement valide n'a été trouvé dans le fichier pour l'importation."});
    }
    
    setImportResults(finalResults);

    const successCount = finalResults.filter(r => r.status === 'success').length;
    const errorDuringProcessingCount = finalResults.filter(r => r.status === 'error' && r.message.startsWith('Erreur pour')).length;
    const fileLevelErrorCount = finalResults.filter(r => r.status === 'error' && !r.message.startsWith('Erreur pour')).length;


    if (successCount > 0 && errorDuringProcessingCount === 0 && fileLevelErrorCount === 0) {
      toast({
        title: "Importation Réussie",
        description: `${successCount} enregistrement(s) importé(s) avec succès.`,
      });
    } else if (successCount > 0) {
       toast({
        variant: "default",
        title: "Importation Partielle",
        description: `${successCount} enregistrement(s) importé(s). ${errorDuringProcessingCount + fileLevelErrorCount} erreur(s) au total. Voir détails ci-dessous.`,
      });
    } else if (finalResults.length > 0) { // Only errors
      toast({
        variant: "destructive",
        title: "Échec de l'Importation",
        description: `Aucun enregistrement n'a pu être importé. ${errorDuringProcessingCount + fileLevelErrorCount} erreur(s). Voir détails ci-dessous.`,
      });
    }
    // If finalResults is empty (e.g. empty file was submitted and caught early), a toast might have already been shown or no action needed.

    setIsLoading(false);
    setFile(null); // Clear the file from state
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) {
        fileInput.value = ''; // Reset the file input field
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
              Assurez-vous que le format du fichier correspond aux spécifications attendues.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="file-upload">Choisir un fichier (CSV, JSON)</Label>
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
              <AlertTitle className="text-primary">Format Attendu pour les Fichiers</AlertTitle>
              <AlertDescription className="text-muted-foreground space-y-1 text-xs">
                <p><strong>Pour CSV :</strong> Ligne d'en-tête ignorée. Les colonnes doivent être dans cet ordre : <code>date,apiDrawName,winningNumbers,machineNumbers</code>.
                La date doit être au format <code>YYYY-MM-DD</code>.
                <code>apiDrawName</code> est le nom simple du tirage (ex: "Réveil", "Étoile", insensible à la casse et aux accents).
                <code>winningNumbers</code> : chaîne de 5 numéros (1-90) séparés par des points-virgules (ex: <code>1;2;3;4;5</code>). Requis.
                <code>machineNumbers</code> : chaîne de 5 numéros (1-90) séparés par des points-virgules. Optionnel ; laissez vide ou omettez la colonne si non applicable.</p>
                <p><strong>Pour JSON :</strong> Un tableau d'objets. Chaque objet doit avoir :
                 <code>date</code> (chaîne <code>YYYY-MM-DD</code>),
                 <code>apiDrawName</code> (chaîne, nom simple du tirage, ex: "Réveil", insensible à la casse et aux accents),
                 <code>winningNumbers</code> (tableau de 5 nombres, 1-90). Requis.
                 <code>machineNumbers</code> (tableau de 5 nombres, 1-90). Optionnel ; peut être un tableau vide ou omis si non applicable.</p>
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

