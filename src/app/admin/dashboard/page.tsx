
"use client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, FileUp, FileDown, Settings, ListChecks, BarChartHorizontalBig, PlusCircle, Edit3, Trash2, ShieldAlert, UserCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import RecentDrawResultsTable from "@/components/admin/RecentDrawResultsTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function AdminDashboardPage() {
  const { currentUser } = useAuth(); 

  if (!currentUser) {
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
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-primary">Tableau de Bord Admin</h1>
        {currentUser && (
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <UserCircle className="h-5 w-5" />
            <span>{currentUser.email}</span>
          </div>
        )}
      </div>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center text-xl">
            <Database className="mr-2 h-5 w-5 text-primary" />
            Gestion des Résultats des Tirages (Firestore)
          </CardTitle>
          <CardDescription>
            Les résultats des tirages récupérés par API depuis <code>https://lotobonheur.ci/resultats</code> sont sauvegardés dans une base de données Firebase Firestore.
            Cette section affiche les derniers résultats et permettra à terme une gestion complète (CRUD).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
           <h3 className="text-lg font-semibold text-foreground">Résultats Récents Sauvegardés</h3>
           <RecentDrawResultsTable />
          <Alert variant="default" className="border-primary/50 mt-6">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary">Développement Futur : Interface CRUD</AlertTitle>
            <AlertDescription>
              Interface CRUD : Une interface complète (Créer, Lire, Mettre à jour, Supprimer) pour ces données est prévue. La suppression est maintenant possible via le tableau ci-dessus.
            </AlertDescription>
          </Alert>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            <Link href="/admin/results/add" passHref>
              <FeatureTile icon={<PlusCircle />} title="Ajouter un Résultat" description="Interface pour ajouter manuellement de nouveaux résultats (avec validation)." />
            </Link>
            <FeatureTile icon={<Edit3 />} title="Modifier un Résultat" description="Options pour éditer des résultats existants." disabled />
            <FeatureTile icon={<Trash2 />} title="Supprimer un Résultat" description="Suppression possible via le tableau des résultats récents." />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center text-xl">
            <Settings className="mr-2 h-5 w-5 text-primary" />
            Import / Export des Données
          </CardTitle>
          <CardDescription>
            Fonctionnalités pour importer des lots de données historiques ou exporter les données stockées.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FeatureTile icon={<FileUp />} title="Importer des Données" description="Importer des résultats depuis un fichier (CSV, JSON)." disabled />
          <FeatureTile icon={<FileDown />} title="Exporter les Données" description="Exporter tous les résultats (CSV, JSON)." disabled />
        </CardContent>
      </Card>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center text-xl">
            <BarChartHorizontalBig className="mr-2 h-5 w-5 text-primary" />
            Outils d'Analyse et de Maintenance
          </CardTitle>
          <CardDescription>
            Statistiques sur les données gérées, journaux d'activité et de synchronisation.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FeatureTile icon={<BarChartHorizontalBig />} title="Statistiques des Données" description="Visualiser des métriques sur les données stockées." disabled />
          <FeatureTile icon={<ListChecks />} title="Journaux d'Activité" description="Suivre les opérations de synchronisation et les erreurs." disabled />
        </CardContent>
      </Card>

    </div>
  );
}

interface FeatureTileProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
}

function FeatureTile({ icon, title, description, disabled }: FeatureTileProps) {
  const content = (
    <div className={`p-4 border rounded-lg h-full flex flex-col ${disabled ? 'bg-muted/50 opacity-60 cursor-not-allowed' : 'bg-card hover:shadow-md transition-shadow'}`}>
      <div className="flex items-center text-primary mb-2">
        {icon}
        <h3 className="ml-2 text-md font-semibold text-foreground">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground flex-grow">{description}</p>
      {disabled && <p className="text-xs text-primary mt-1">(Prochainement)</p>}
    </div>
  );

  return disabled ? content : <div className="cursor-pointer h-full">{content}</div>;
}
