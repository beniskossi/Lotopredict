
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from "lucide-react";

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-primary">Tableau de Bord Admin</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Gestion des Résultats des Tirages</CardTitle>
          <CardDescription>
            Cette section est destinée à la gestion (ajout, modification, suppression) des résultats des tirages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Terminal className="h-4 w-4" />
            <AlertTitle>Fonctionnalité en cours de développement</AlertTitle>
            <AlertDescription>
              Actuellement, l'application récupère les données depuis une source externe.
              Pour gérer les résultats ici, une base de données backend (par exemple, Firebase Firestore)
              et une logique de manipulation des données seraient nécessaires. Ceci représente une modification
              architecturale majeure.
            </AlertDescription>
          </Alert>
          <div className="mt-4 p-4 border rounded-md">
            <p className="text-muted-foreground">
              Contenu futur du tableau de bord :
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground">
              <li>Liste des tirages récents avec options d'édition/suppression.</li>
              <li>Formulaire pour ajouter manuellement de nouveaux résultats.</li>
              <li>Statistiques sur les données gérées.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Autres Outils d'Administration</CardTitle>
        </CardHeader>
        <CardContent>
           <p className="text-muted-foreground">D'autres outils d'administration pourraient être ajoutés ici, comme la gestion des utilisateurs (si applicable), la configuration de l'application, etc.</p>
        </CardContent>
      </Card>
    </div>
  );
}
