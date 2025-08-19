
"use client";

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CalendarIcon, Pencil, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ALL_DRAW_NAMES_MAP, DRAW_SCHEDULE } from '@/lib/lotoDraws.tsx';
import type { ManualEditResultFormInput, ManualLottoResultInput, FirestoreDrawDoc } from '@/types/loto';
import { fetchLottoResultById, updateLottoResult } from '@/services/lotoData';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';

const numberSchema = z.preprocess(
  (val) => (String(val).trim() === "" ? undefined : Number(val)),
  z.number({invalid_type_error: "Doit être un nombre."})
    .min(1, "Min 1")
    .max(90, "Max 90")
    .optional()
);

const optionalMachineNumberSchema = z.preprocess(
  (val) => (String(val).trim() === "" ? undefined : Number(val)),
  z.union([
    z.undefined(),
    z.number({ invalid_type_error: "Doit être un nombre." })
      .min(1, "Min 1")
      .max(90, "Max 90")
  ])
);

const EditResultSchema = z.object({
  drawSlug: z.string().min(1, "Veuillez sélectionner un tirage."),
  date: z.date({
    required_error: "Veuillez sélectionner une date.",
    invalid_type_error: "Format de date invalide.",
  }),
  wn1: numberSchema.refine(val => val !== undefined, { message: "Requis" }),
  wn2: numberSchema.refine(val => val !== undefined, { message: "Requis" }),
  wn3: numberSchema.refine(val => val !== undefined, { message: "Requis" }),
  wn4: numberSchema.refine(val => val !== undefined, { message: "Requis" }),
  wn5: numberSchema.refine(val => val !== undefined, { message: "Requis" }),
  mn1: optionalMachineNumberSchema,
  mn2: optionalMachineNumberSchema,
  mn3: optionalMachineNumberSchema,
  mn4: optionalMachineNumberSchema,
  mn5: optionalMachineNumberSchema,
})
.superRefine((data, ctx) => {
  const winningNumbers = [data.wn1, data.wn2, data.wn3, data.wn4, data.wn5].filter(n => n !== undefined) as number[];
  if (new Set(winningNumbers).size !== 5) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Les numéros gagnants doivent être distincts.", path: ["wn1"] });
  }

  const machineNumbers = [data.mn1, data.mn2, data.mn3, data.mn4, data.mn5].filter(n => n !== undefined) as number[];
  if (machineNumbers.length > 0 && machineNumbers.length < 5) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Si des numéros machine sont fournis, les 5 doivent être remplis.", path: ["mn1"] });
  } else if (machineNumbers.length === 5) {
    if (new Set(machineNumbers).size !== 5) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Les numéros machine doivent être distincts.", path: ["mn1"] });
    }
    const wnSet = new Set(winningNumbers);
    for (const mn of machineNumbers) {
      if (wnSet.has(mn)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Un numéro machine ne peut être identique à un numéro gagnant.", path: ["mn1"]});
        break; 
      }
    }
  }
});


export default function EditResultPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  const docId = Array.isArray(params.docId) ? params.docId[0] : params.docId;

  const form = useForm<z.infer<typeof EditResultSchema>>({
    resolver: zodResolver(EditResultSchema),
  });

  useEffect(() => {
    if (!docId) {
        toast({ variant: "destructive", title: "Erreur", description: "ID du document manquant." });
        router.push('/admin/dashboard');
        return;
    }

    const loadResultData = async () => {
        setIsFetching(true);
        try {
            const resultData = await fetchLottoResultById(docId);
            if (!resultData) {
                toast({ variant: "destructive", title: "Erreur", description: "Résultat non trouvé." });
                router.push('/admin/dashboard');
                return;
            }

            const drawSlug = Object.keys(DRAW_SLUG_BY_SIMPLE_NAME_MAP).find(key => 
                DRAW_SLUG_BY_SIMPLE_NAME_MAP[key] === Object.keys(ALL_DRAW_NAMES_MAP).find(slug => 
                    ALL_DRAW_NAMES_MAP[slug].toLowerCase().includes(resultData.apiDrawName.toLowerCase())
                )
            );
            
            const simpleDrawName = resultData.apiDrawName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            const matchingSlug = DRAW_SLUG_BY_SIMPLE_NAME_MAP[simpleDrawName];

            form.reset({
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
            setIsFetching(false);
        }
    };

    loadResultData();
  }, [docId, form, router, toast]);

  const onSubmit = async (values: z.infer<typeof EditResultSchema>) => {
    if (!docId) return;
    setIsLoading(true);
    const winningNumbers = [values.wn1, values.wn2, values.wn3, values.wn4, values.wn5].filter(n => n !== undefined) as number[];
    const machineNumbersRaw = [values.mn1, values.mn2, values.mn3, values.mn4, values.mn5];
    const machineNumbers = machineNumbersRaw.every(n => n !== undefined) ? machineNumbersRaw.filter(n => n !== undefined) as number[] : [];

    const payload: ManualLottoResultInput = {
      drawSlug: values.drawSlug,
      date: values.date,
      winningNumbers: winningNumbers,
      machineNumbers: machineNumbers.length === 5 ? machineNumbers : undefined,
    };

    try {
      await updateLottoResult(docId, payload);
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
      setIsLoading(false);
    }
  };

  const numberInputFields = (fieldPrefix: 'wn' | 'mn', count: number, label: string) => {
    return Array.from({ length: count }, (_, i) => (
      <FormField
        key={`${fieldPrefix}${i + 1}`}
        control={form.control}
        name={`${fieldPrefix}${i + 1}` as keyof ManualEditResultFormInput}
        render={({ field }) => (
          <FormItem className="flex-1 min-w-[60px]">
            <FormLabel htmlFor={`${fieldPrefix}${i + 1}`}>{label} {i + 1}</FormLabel>
            <FormControl>
              <Input
                id={`${fieldPrefix}${i + 1}`}
                type="number"
                placeholder="1-90"
                {...field}
                onChange={e => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                value={field.value === undefined ? '' : field.value}
                disabled={isFetching}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    ));
  };
  
  if (isFetching) {
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
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardHeader>
              <CardTitle>Détails du Tirage</CardTitle>
              <CardDescription>
                Modifiez les informations ci-dessous et sauvegardez les changements.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="drawSlug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nom du Tirage</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionner un type de tirage" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(ALL_DRAW_NAMES_MAP).map(([slug, name]) => (
                            <SelectItem key={slug} value={slug}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Date du Tirage</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? (
                                format(field.value, "PPP", { locale: fr })
                              ) : (
                                <span>Choisir une date</span>
                              )}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date > new Date() || date < new Date("2000-01-01")
                            }
                            initialFocus
                            locale={fr}
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">Numéros Gagnants (Requis)</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  {numberInputFields('wn', 5, 'NG')}
                </div>
                 <FormMessage>{form.formState.errors.wn1?.message?.toString().includes("distincts") && form.formState.errors.wn1?.message}</FormMessage>

              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">Numéros Machine (Optionnel)</h3>
                 <p className="text-sm text-muted-foreground mb-2">Laissez vide si non applicable. Si vous en entrez un, les 5 sont requis.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  {numberInputFields('mn', 5, 'NM')}
                </div>
                 <FormMessage>{form.formState.errors.mn1?.message?.toString().includes("distincts") && form.formState.errors.mn1?.message}</FormMessage>
                 <FormMessage>{form.formState.errors.mn1?.message?.toString().includes("identique") && form.formState.errors.mn1?.message}</FormMessage>
                 <FormMessage>{form.formState.errors.mn1?.message?.toString().includes("remplis") && form.formState.errors.mn1?.message}</FormMessage>
              </div>

            </CardContent>
            <CardFooter className="flex justify-end">
              <Button type="submit" disabled={isLoading || isFetching}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isLoading ? "Sauvegarde..." : "Sauvegarder les Modifications"}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
