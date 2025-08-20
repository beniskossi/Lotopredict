
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusCircle, ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { addManualLottoResult } from '@/services/lotoData';
import Link from 'next/link';
import { ResultForm } from '@/components/admin/ResultForm';
import type { ManualLottoResultInput } from '@/types/loto';

export default function AddResultPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (data: ManualLottoResultInput) => {
    setIsSubmitting(true);
    try {
      await addManualLottoResult(data);
      toast({
        title: "Succès",
        description: "Le résultat du tirage a été ajouté avec succès.",
      });
      router.push('/admin/dashboard');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error.message || "Une erreur est survenue lors de l'ajout du résultat.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <CardTitle>Détails du Tirage</CardTitle>
          <CardDescription>
            Remplissez les informations ci-dessous pour ajouter manuellement un résultat.
          </CardDescription>
        </CardHeader>
        <CardContent>
           <ResultForm 
             onSubmit={handleSubmit}
             isLoading={false}
             isSubmitting={isSubmitting}
             submitButtonText={isSubmitting ? "Ajout en cours..." : "Ajouter le Résultat"}
           />
        </CardContent>
      </Card>
    </div>
  );
}
