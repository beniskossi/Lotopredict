
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, FileUp, Download, Settings, ListChecks, BarChartHorizontalBig, PlusCircle, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import RecentDrawResultsTable from "@/components/admin/RecentDrawResultsTable";

export default function AdminDashboardPage() {
  const { currentUser } = useAuth(); 

  if (!currentUser) {
    // This part is largely handled by AdminAuthGuard, but serves as a fallback.
    return (
      <div className="space-y-6 text-center">
        <h1 className="text-2xl font-bold text-primary">Accès non autorisé</h1>
        <p>Vous devez être connecté pour accéder à cette page.</p>
        <Button asChild>
          <Link href="/admin/login">Se connecter</Link>
        </Button>
      </div>
    );
  }
  
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-primary">Tableau de Bord Admin</h1>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-xl">
            <Database className="mr-2 h-5 w-5" />
            Gestion des Données de Tirage
          </CardTitle>
          <CardDescription>
            Ajoutez, importez ou supprimez des résultats de tirages. Visualisez les données les plus récentes stockées dans Firestore.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
           <Button asChild variant="outline">
              <Link href="/admin/results/add">
                <PlusCircle className="mr-2 h-4 w-4" /> Ajouter un Résultat
              </Link>
           </Button>
           <Button asChild variant="outline">
               <Link href="/admin/import">
                <FileUp className="mr-2 h-4 w-4" /> Importer des Données
               </Link>
          </Button>
          <Button variant="destructive" disabled>
            <Trash2 className="mr-2 h-4 w-4" /> Supprimer par Lot (à venir)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
            <CardTitle>Derniers Résultats Enregistrés</CardTitle>
            <CardDescription>Aperçu des 20 derniers résultats de tirage enregistrés dans la base de données.</CardDescription>
        </CardHeader>
        <CardContent>
            <RecentDrawResultsTable />
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-xl">
            <BarChartHorizontalBig className="mr-2 h-5 w-5" />
            Outils d'Analyse et de Maintenance
          </CardTitle>
          <CardDescription>
            Statistiques sur les données gérées, journaux d'activité et de synchronisation.
            (Fonctionnalités à venir)
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button variant="outline" disabled>
             <BarChartHorizontalBig className="mr-2 h-4 w-4" /> Statistiques des Données
          </Button>
          <Button variant="outline" disabled>
            <ListChecks className="mr-2 h-4 w-4" /> Journaux d'Activité
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
