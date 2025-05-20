
"use client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, FileUp, FileDown, Settings, ListChecks, BarChartHorizontalBig, PlusCircle, Edit3, Trash2, ShieldAlert, UserCircle, Download } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import RecentDrawResultsTable from "@/components/admin/RecentDrawResultsTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { fetchAllLottoResultsForExport, type FirestoreDrawDoc } from "@/services/lotoData";

export default function AdminDashboardPage() {
  const { currentUser } = useAuth(); 
  const { toast } = useToast();

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

  const handleFeatureComingSoon = (featureName: string) => {
    toast({
      title: "Fonctionnalité en cours de développement",
      description: `${featureName} sera bientôt disponible.`,
    });
  };

  const convertToCSV = (data: FirestoreDrawDoc[]): string => {
    if (!data || data.length === 0) {
      return "";
    }

    const header = ["docId", "apiDrawName", "date", "winningNumbers", "machineNumbers", "fetchedAt"];
    const rows = data.map(row => {
      const wn = row.winningNumbers.join(';'); 
      const mn = row.machineNumbers ? row.machineNumbers.join(';') : '';
      const fa = row.fetchedAt && (row.fetchedAt as any).toDate ? (row.fetchedAt as any).toDate().toISOString() : '';
      
      // Escape quotes by doubling them, and enclose in quotes
      const sanitize = (str: string | undefined) => str ? `"${String(str).replace(/"/g, '""')}"` : '""';

      return [
        sanitize(row.docId),
        sanitize(row.apiDrawName),
        sanitize(row.date),
        sanitize(wn),
        sanitize(mn),
        sanitize(fa)
      ].join(',');
    });

    return [header.join(','), ...rows].join('\n');
  };

  const downloadCSV = (csvString: string, filename: string) => {
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const handleExportData = async () => {
    toast({
      title: "Exportation en cours...",
      description: "Veuillez patienter pendant la préparation du fichier.",
    });
    try {
      const results = await fetchAllLottoResultsForExport();
      if (results.length === 0) {
        toast({
          variant: "default",
          title: "Aucune donnée à exporter",
          description: "La base de données ne contient aucun résultat de tirage.",
        });
        return;
      }
      const csvString = convertToCSV(results);
      const filename = `loto_predict_export_${new Date().toISOString().split('T')[0]}.csv`;
      downloadCSV(csvString, filename);
      toast({
        title: "Exportation Réussie",
        description: `${results.length} résultats ont été exportés dans ${filename}.`,
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        variant: "destructive",
        title: "Échec de l'Exportation",
        description: "Une erreur est survenue lors de l'exportation des données.",
      });
    }
  };
  
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
            <FeatureTile icon={<Edit3 />} title="Modifier un Résultat" description="Options pour éditer des résultats existants." onClick={() => handleFeatureComingSoon("La modification des résultats")} />
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
          <FeatureTile 
            icon={<FileUp />} 
            title="Importer des Données" 
            description="Importer des résultats depuis un fichier (CSV, JSON)." 
            onClick={() => handleFeatureComingSoon("L'importation de données")}
          />
          <FeatureTile 
            icon={<Download />} 
            title="Exporter les Données" 
            description="Exporter tous les résultats (CSV, JSON)." 
            onClick={handleExportData}
          />
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
          <FeatureTile 
            icon={<BarChartHorizontalBig />} 
            title="Statistiques des Données" 
            description="Visualiser des métriques sur les données stockées." 
            onClick={() => handleFeatureComingSoon("Les statistiques des données")}
          />
          <FeatureTile 
            icon={<ListChecks />} 
            title="Journaux d'Activité" 
            description="Suivre les opérations de synchronisation et les erreurs." 
            onClick={() => handleFeatureComingSoon("Les journaux d'activité")}
          />
        </CardContent>
      </Card>

    </div>
  );
}

interface FeatureTileProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick?: () => void;
}

function FeatureTile({ icon, title, description, onClick }: FeatureTileProps) {
  const tileClasses = `p-4 border rounded-lg h-full flex flex-col ${
    !onClick 
      ? 'bg-muted/50 opacity-60 cursor-not-allowed' 
      : 'bg-card hover:shadow-md transition-shadow cursor-pointer'
  }`;

  const content = (
    <>
      <div className="flex items-center text-primary mb-2">
        {icon}
        <h3 className="ml-2 text-md font-semibold text-foreground">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground flex-grow">{description}</p>
    </>
  );

  if (!onClick) {
    return <div className={tileClasses}>{content}</div>;
  }

  return (
    <div className={tileClasses} onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}
    >
      {content}
    </div>
  );
}
