
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusCircle, ArrowLeft } from "lucide-react";

export default function AddResultPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-primary flex items-center">
          <PlusCircle className="mr-3 h-8 w-8" />
          Ajouter un Nouveau Résultat de Tirage
        </h1>
        <Button variant="outline" asChild>
          <Link href="/admin/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour au Tableau de Bord
          </Link>
        </Button>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>En Cours de Développement</CardTitle>
          <CardDescription>
            Cette section permettra d'ajouter manuellement les résultats d'un tirage spécifique.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            L'interface pour entrer les détails du tirage (nom, date, numéros gagnants, numéros machine) et la validation des données seront implémentées prochainement.
          </p>
          <div className="mt-6 p-6 border-dashed border-2 border-muted rounded-md text-center">
            <p className="text-sm text-muted-foreground">
              Formulaire d'ajout à venir ici...
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
