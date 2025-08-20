
"use client";

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { parseISO } from 'date-fns';
import { Pencil, ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { DRAW_SLUG_BY_SIMPLE_NAME_MAP } from '@/lib/lotoDraws.tsx';
import { fetchLottoResultById, updateLottoResult } from '@/services/lotoData';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { ResultForm } from '@/components/admin/ResultForm';
import type { ManualLottoResultInput } from '@/types/loto';

export default function EditResultPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [initialFormValues, setInitialFormValues] = useState<any>(null);

  const docId = Array.isArray(params.docId) ? params.docId[0] : params.docId;

  useEffect(() => {
    if (!docId) {
        toast({ variant: "destructive", title: "Erreur", description: "ID du document manquant." });
        router.push('/admin/dashboard');
        return;
    }

    const loadResultData = async () => {
        setIsLoading(true);
        try {
            const resultData = await fetchLottoResultById(docId);
            if (!resultData) {
                toast({ variant: "destructive", title: "Erreur", description: "Résultat non trouvé." });
                router.push('/admin/dashboard');
                return;
            }
            
            const simpleDrawName = resultData.apiDrawName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            const matchingSlug = DRAW_SLUG_BY_SIMPLE_NAME_MAP[simpleDrawName];

            setInitialFormValues({
                drawSlug: matchingSlug,
                date: parseISO(resultData.date),
                wn1: resultData.winningNumbers[0],
                wn2: resultData.winningNumbers[1],
                wn3: resultData.winningNumbers[2],
                wn4: resultData.winningNumbers[3],
                wn5: resultData.winningNumbers[4],
                mn1: resultData.machineNumbers?.[0],
                mn2: resultData.machineNumbers?.[1],
                mn3: resultData.machineNumbers?.[2],
                mn4: resultData.machineNumbers?.[3],
                mn5: resultData.machineNumbers?.[4],
            });

        } catch (error) {
            toast({ variant: "destructive", title: "Erreur de chargement", description: "Impossible de charger les données du tirage." });
            router.push('/admin/dashboard');
        } finally {
            setIsLoading(false);
        }
    };

    loadResultData();
  }, [docId, router, toast]);

  const handleSubmit = async (data: ManualLottoResultInput) => {
    if (!docId) return;
    setIsSubmitting(true);
    try {
      await updateLottoResult(docId, data);
      toast({
        title: "Succès",
        description: "Le résultat du tirage a été mis à jour avec succès.",
      });
      router.push('/admin/dashboard');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error.message || "Une erreur est survenue lors de la mise à jour.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (isLoading) {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-primary">Chargement...</h1>
            <Card>
                <CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                </CardContent>
                <CardFooter><Skeleton className="h-10 w-24" /></CardFooter>
            </Card>
        </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-primary flex items-center">
          <Pencil className="mr-3 h-8 w-8" />
          Modifier un Résultat de Tirage
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
          <CardTitle>Détails du Tirage</CardTitle>
          <CardDescription>
            Modifiez les informations ci-dessous et sauvegardez les changements.
          </CardDescription>
        </CardHeader>
        <CardContent>
           {initialFormValues && (
              <ResultForm
                 initialValues={initialFormValues}
                 onSubmit={handleSubmit}
                 isLoading={isLoading}
                 isSubmitting={isSubmitting}
                 submitButtonText={isSubmitting ? "Sauvegarde..." : "Sauvegarder les Modifications"}
              />
            )}
        </CardContent>
      </Card>
    </div>
  );
}
