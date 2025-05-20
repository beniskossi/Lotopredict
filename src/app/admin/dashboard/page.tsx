
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, Database } from "lucide-react";

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-primary">Tableau de Bord Admin</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Gestion des Résultats des Tirages</CardTitle>
          <CardDescription>
            Cette section est destinée à la gestion (consultation, ajout, modification, suppression) des résultats des tirages stockés.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="default" className="border-primary/50">
            <Database className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary">Données Stockées dans Firestore</AlertTitle>
            <AlertDescription>
              L'application est maintenant configurée pour sauvegarder les résultats des tirages récupérés par API depuis la source externe
              (<code>https://lotobonheur.ci/resultats</code>) dans une base de données Firebase Firestore. Cela ouvre la voie à une gestion centralisée des données.
              L'implémentation complète d'une interface CRUD (Créer, Lire, Mettre à jour, Supprimer) pour ces données
              représente une prochaine étape de développement.
            </AlertDescription>
          </Alert>
          <div className="mt-4 p-4 border rounded-md">
            <p className="text-muted-foreground">
              Contenu futur du tableau de bord :
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground">
              <li>Visualisation des données stockées dans Firestore.</li>
              <li>Interface pour ajouter manuellement de nouveaux résultats (avec validation).</li>
              <li>Options pour modifier ou supprimer des résultats existants (avec confirmation).</li>
              <li>Journaux d'activité de synchronisation ou d'erreurs.</li>
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
           <p className="text-muted-foreground">D'autres outils d'administration pourraient être ajoutés ici, comme la gestion des utilisateurs (si applicable), la configuration de l'application, la gestion des tâches de synchronisation, etc.</p>
        </CardContent>
      </Card>
    </div>
  );
}
