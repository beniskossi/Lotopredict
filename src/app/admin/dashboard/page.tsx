
"use client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Database, FileUp, FileDown, Settings, ListChecks, BarChartHorizontalBig, PlusCircle, Edit3, Trash2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function AdminDashboardPage() {
  const { currentUser } = useAuth(); // currentUser might be null initially until auth state is loaded

  if (!currentUser) {
     // This should ideally be handled by AdminAuthGuard, but as a fallback:
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
      <p className="text-muted-foreground">Bienvenue, {currentUser.email} !</p>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center text-xl">
            <Database className="mr-2 h-5 w-5 text-primary" />
            Gestion des Résultats des Tirages (Firestore)
          </CardTitle>
          <CardDescription>
            Les résultats des tirages récupérés par API depuis <code>https://lotobonheur.ci/resultats</code> sont sauvegardés dans une base de données Firebase Firestore.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="default" className="border-primary/50">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary">Développement Futur : Interface CRUD</AlertTitle>
            <AlertDescription>
              Une interface complète (Créer, Lire, Mettre à jour, Supprimer) pour ces données est prévue. Pour l'instant, les données sont automatiquement ajoutées par le système de récupération.
            </AlertDescription>
          </Alert>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureTile icon={<ListChecks />} title="Visualiser les Données" description="Consulter les résultats stockés." disabled />
            <FeatureTile icon={<PlusCircle />} title="Ajouter un Résultat" description="Interface pour ajouter manuellement de nouveaux résultats (avec validation)." disabled />
            <FeatureTile icon={<Edit3 />} title="Modifier un Résultat" description="Options pour éditer des résultats existants." disabled />
            <FeatureTile icon={<Trash2 />} title="Supprimer un Résultat" description="Options pour supprimer des résultats (avec confirmation)." disabled />
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
  return (
    <div className={`p-4 border rounded-lg ${disabled ? 'bg-muted/50 opacity-60 cursor-not-allowed' : 'bg-card hover:shadow-md'}`}>
      <div className="flex items-center text-primary mb-2">
        {icon}
        <h3 className="ml-2 text-md font-semibold text-foreground">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      {disabled && <p className="text-xs text-primary mt-1">(Prochainement)</p>}
    </div>
  );
}
