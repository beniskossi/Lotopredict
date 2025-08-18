
"use client";

import React, { useState, useEffect } from 'react';
import { fetchRecentLottoResults, deleteLottoResult, type FirestoreDrawDoc, constructLottoResultDocId } from '@/services/lotoData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { LotoBall } from '@/components/loto/LotoBall';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ListCollapse, AlertCircle, Trash2 } from "lucide-react";
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const RESULTS_TO_SHOW = 20;

export default function RecentDrawResultsTable() {
  const [results, setResults] = useState<FirestoreDrawDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [resultToDelete, setResultToDelete] = useState<FirestoreDrawDoc | null>(null);
  const { toast } = useToast();

  const loadRecentResults = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRecentLottoResults(RESULTS_TO_SHOW);
      setResults(data);
    } catch (err) {
      console.error("Failed to load recent draw results:", err);
      setError("Impossible de charger les résultats récents.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecentResults();
  }, []);

  const handleDeleteClick = (result: FirestoreDrawDoc) => {
    setResultToDelete(result);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!resultToDelete || !resultToDelete.docId) {
        toast({
            variant: "destructive",
            title: "Erreur de Suppression",
            description: "ID du document manquant pour la suppression.",
        });
        setShowDeleteDialog(false);
        setResultToDelete(null);
        return;
    }

    try {
      await deleteLottoResult(resultToDelete.docId);
      setResults(prevResults => prevResults.filter(r => r.docId !== resultToDelete.docId));
      toast({
        title: "Suppression Réussie",
        description: `Le tirage ${resultToDelete.apiDrawName} du ${format(parseISO(resultToDelete.date), 'dd/MM/yyyy', { locale: fr })} a été supprimé.`,
      });
    } catch (err) {
      console.error("Failed to delete result:", err);
      toast({
        variant: "destructive",
        title: "Échec de la Suppression",
        description: "Une erreur est survenue lors de la suppression du tirage.",
      });
    } finally {
      setShowDeleteDialog(false);
      setResultToDelete(null);
    }
  };


  if (loading) {
    return (
      <div className="space-y-2 mt-4">
        <Skeleton className="h-8 w-1/4" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Erreur</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (results.length === 0) {
    return (
      <Alert className="mt-4">
        <ListCollapse className="h-4 w-4" />
        <AlertTitle>Aucune Donnée</AlertTitle>
        <AlertDescription>
          Aucun résultat de tirage n'a encore été sauvegardé dans Firestore. Les données apparaîtront ici après leur récupération.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <ScrollArea className="h-[400px] mt-4 rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Nom du Tirage</TableHead>
              <TableHead>Numéros Gagnants</TableHead>
              <TableHead>Numéros Machine</TableHead>
              <TableHead>Date Récup.</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((result, index) => (
              <TableRow key={result.docId || `${result.date}-${result.apiDrawName}-${index}`}>
                <TableCell className="whitespace-nowrap">
                  {result.date ? format(parseISO(result.date), 'dd/MM/yyyy', { locale: fr }) : 'Date Inconnue'}
                </TableCell>
                <TableCell>{result.apiDrawName}</TableCell>
                <TableCell>
                  <div className="flex space-x-1">
                    {result.winningNumbers.map(num => <LotoBall key={`win-${num}-${result.docId || index}`} number={num} size="sm" />)}
                  </div>
                </TableCell>
                <TableCell>
                  {result.machineNumbers && result.machineNumbers.length > 0 ? (
                    <div className="flex space-x-1">
                      {result.machineNumbers.map(num => <LotoBall key={`mac-${num}-${result.docId || index}`} number={num} size="sm" />)}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">N/A</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                   {result.fetchedAt ? format(result.fetchedAt.toDate(), 'dd/MM/yy HH:mm', { locale: fr }) : 'N/A'}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(result)} aria-label="Supprimer le tirage">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la Suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le tirage {resultToDelete?.apiDrawName} du {resultToDelete && resultToDelete.date ? format(parseISO(resultToDelete.date), 'dd/MM/yyyy', { locale: fr }) : ''} ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setResultToDelete(null)}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
