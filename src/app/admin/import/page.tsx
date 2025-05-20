
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, FileUp, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { useToast } from "@/hooks/use-toast";

export default function AdminImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
    } else {
      setFile(null);
    }
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
    // Placeholder for actual import logic
    // For example, you would read the file content here and send it to a service
    // const fileContent = await file.text();
    // console.log("File content:", fileContent);
    // console.log("File type:", file.type);


    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API call or processing

    toast({
      title: "Importation en cours de développement",
      description: `La logique de traitement et de sauvegarde pour le fichier ${file.name} sera implémentée prochainement.`,
    });

    setIsLoading(false);
    setFile(null);
    // Clear the file input
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
              <AlertDescription className="text-muted-foreground">
                <p className="mb-1"><strong>Pour CSV :</strong> Les colonnes doivent être dans l'ordre: <code>date,apiDrawName,winningNumbers,machineNumbers</code>. La date doit être au format <code>YYYY-MM-DD</code>. Les `winningNumbers` et `machineNumbers` (optionnel) doivent être une chaîne de 5 numéros séparés par des points-virgules (ex: <code>1;2;3;4;5</code>).</p>
                <p><strong>Pour JSON :</strong> Un tableau d'objets. Chaque objet doit avoir les clés suivantes : <code>date</code> (chaîne <code>YYYY-MM-DD</code>), <code>apiDrawName</code> (le nom canonique du tirage, ex: "Réveil"), <code>winningNumbers</code> (tableau de 5 nombres), et optionnellement <code>machineNumbers</code> (tableau de 5 nombres).</p>
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
    </div>
  );
}

