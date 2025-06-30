
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CalendarIcon, PlusCircle, ArrowLeft, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ALL_DRAW_NAMES_MAP } from '@/lib/lotoDraws.tsx';
import type { ManualAddResultFormInput, ManualLottoResultInput } from '@/types/loto';
import { addManualLottoResult } from '@/services/lotoData';
import Link from 'next/link';

const numberSchema = z.preprocess(
  (val) => (String(val).trim() === "" ? undefined : Number(val)),
  z.number({invalid_type_error: "Doit être un nombre."})
    .min(1, "Min 1")
    .max(90, "Max 90")
    .optional()
);

const optionalMachineNumberSchema = z.preprocess(
  (val) => {
    if (val === undefined || val === null || String(val).trim() === "") {
      // If the value from react-hook-form is already undefined (for an empty field),
      // or if it's null, or an empty/whitespace string,
      // then Zod should treat it as undefined for validation purposes.
      return undefined;
    }
    // For any other case (a number, a numeric string, or a non-numeric string that will become NaN),
    // attempt to convert to Number. z.number() will then handle validation or type errors.
    return Number(val);
  },
  z.union([
    z.undefined(),
    z.number({ invalid_type_error: "Doit être un nombre." })
      .min(1, "Min 1")
      .max(90, "Max 90")
  ])
);


const AddResultSchema = z.object({
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
  if (winningNumbers.length !== 5) {
    // This will be caught by individual field 'Requis' if not for a general error
  } else if (new Set(winningNumbers).size !== 5) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Les numéros gagnants doivent être distincts.", path: ["wn1"] });
  }

  const machineNumbers = [data.mn1, data.mn2, data.mn3, data.mn4, data.mn5].filter(n => n !== undefined) as number[];
  
  const providedMachineNumbersCount = machineNumbers.length;

  if (providedMachineNumbersCount > 0 && providedMachineNumbersCount < 5) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Si des numéros machine sont fournis, les 5 doivent être remplis.", path: ["mn1"] });
  } else if (providedMachineNumbersCount === 5) {
    if (new Set(machineNumbers).size !== 5) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Les numéros machine doivent être distincts.", path: ["mn1"] });
    }
    // Check for overlap only if both sets are complete
    if (winningNumbers.length === 5) {
        const wnSet = new Set(winningNumbers);
        for (const mn of machineNumbers) {
          if (wnSet.has(mn)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Un numéro machine ne peut être identique à un numéro gagnant.", path: ["mn1"]});
            break; 
          }
        }
    }
  }
});


export default function AddResultPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof AddResultSchema>>({
    resolver: zodResolver(AddResultSchema),
    defaultValues: {
      drawSlug: '',
      // date: new Date(), // Default to today, or leave undefined for user to pick
    },
  });

  const onSubmit = async (values: z.infer<typeof AddResultSchema>) => {
    setIsLoading(true);
    const winningNumbers = [values.wn1, values.wn2, values.wn3, values.wn4, values.wn5].filter(n => n !== undefined) as number[];
    const machineNumbersRaw = [values.mn1, values.mn2, values.mn3, values.mn4, values.mn5];
    
    // Determine if machineNumbers should be included based on whether ALL mn fields are filled or ALL are empty (undefined)
    const allMnFieldsAreProvided = machineNumbersRaw.every(n => n !== undefined && n !== null && !isNaN(n));
    const allMnFieldsAreEmpty = machineNumbersRaw.every(n => n === undefined);

    let machineNumbers: number[] | undefined;
    if (allMnFieldsAreProvided && machineNumbersRaw.filter(n => n !== undefined).length === 5) {
        machineNumbers = machineNumbersRaw.filter(n => n !== undefined) as number[];
    } else if (allMnFieldsAreEmpty) {
        machineNumbers = undefined; // Explicitly undefined if all are empty
    } else {
        // This case should be caught by superRefine ("Si des numéros machine sont fournis, les 5 doivent être remplis.")
        // but as a safeguard for payload construction:
        machineNumbers = undefined; 
    }


    const payload: ManualLottoResultInput = {
      drawSlug: values.drawSlug,
      date: values.date,
      winningNumbers: winningNumbers,
      machineNumbers: machineNumbers, // This will be undefined if not all 5 are provided, or an array of 5 numbers
    };

    try {
      await addManualLottoResult(payload);
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
      setIsLoading(false);
    }
  };

  const numberInputFields = (fieldPrefix: 'wn' | 'mn', count: number, label: string) => {
    return Array.from({ length: count }, (_, i) => (
      <FormField
        key={`${fieldPrefix}${i + 1}`}
        control={form.control}
        name={`${fieldPrefix}${i + 1}` as keyof ManualAddResultFormInput}
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
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    ));
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
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardHeader>
              <CardTitle>Détails du Tirage</CardTitle>
              <CardDescription>
                Remplissez les informations ci-dessous pour ajouter manuellement un résultat.
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
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                <p className="text-sm text-muted-foreground mb-2">Laissez vide si non applicable ou si vous ne souhaitez pas les entrer. Si vous en entrez un, les 5 sont requis.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  {numberInputFields('mn', 5, 'NM')}
                </div>
                 <FormMessage>{form.formState.errors.mn1?.message?.toString().includes("distincts") && form.formState.errors.mn1?.message}</FormMessage>
                 <FormMessage>{form.formState.errors.mn1?.message?.toString().includes("identique") && form.formState.errors.mn1?.message}</FormMessage>
                 <FormMessage>{form.formState.errors.mn1?.message?.toString().includes("remplis") && form.formState.errors.mn1?.message}</FormMessage>
              </div>

            </CardContent>
            <CardFooter className="flex justify-end">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isLoading ? "Ajout en cours..." : "Ajouter le Résultat"}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
    
