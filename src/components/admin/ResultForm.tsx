
"use client";

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CalendarIcon, Loader2 } from 'lucide-react';
import type { ManualLottoResultInput, ResultFormInput } from '@/types/loto';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ALL_DRAW_NAMES_MAP } from '@/lib/lotoDraws.tsx';

// --- Validation Schema ---
const numberSchema = z.preprocess(
  (val) => (String(val).trim() === "" ? undefined : Number(val)),
  z.number({invalid_type_error: "Doit être un nombre."})
    .min(1, "Min 1")
    .max(90, "Max 90")
    .optional()
);

const optionalMachineNumberSchema = z.preprocess(
  (val) => (val === undefined || val === null || String(val).trim() === "" ? undefined : Number(val)),
  z.union([
    z.undefined(),
    z.number({ invalid_type_error: "Doit être un nombre." }).min(1, "Min 1").max(90, "Max 90")
  ])
);

const ResultFormSchema = z.object({
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
  if (winningNumbers.length === 5 && new Set(winningNumbers).size !== 5) {
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

type ResultFormValues = z.infer<typeof ResultFormSchema>;

// --- Component Props ---
interface ResultFormProps {
    initialValues?: Partial<ResultFormValues>;
    onSubmit: (data: ManualLottoResultInput) => Promise<void>;
    isLoading: boolean;
    isSubmitting: boolean;
    submitButtonText: string;
}


// --- The Reusable Form Component ---
export function ResultForm({ initialValues, onSubmit, isLoading, isSubmitting, submitButtonText }: ResultFormProps) {
    const form = useForm<ResultFormValues>({
        resolver: zodResolver(ResultFormSchema),
        defaultValues: initialValues || { drawSlug: '' },
    });
    
    const handleFormSubmit = async (values: ResultFormValues) => {
        const winningNumbers = [values.wn1, values.wn2, values.wn3, values.wn4, values.wn5].filter(n => n !== undefined) as number[];
        const machineNumbersRaw = [values.mn1, values.mn2, values.mn3, values.mn4, values.mn5];
        const machineNumbers = machineNumbersRaw.every(n => n !== undefined) ? machineNumbersRaw.filter(n => n !== undefined) as number[] : [];

        const payload: ManualLottoResultInput = {
            drawSlug: values.drawSlug,
            date: values.date,
            winningNumbers: winningNumbers,
            machineNumbers: machineNumbers.length === 5 ? machineNumbers : [],
        };

        await onSubmit(payload);
    };

    const numberInputFields = (fieldPrefix: 'wn' | 'mn', count: number, label: string) => {
        return Array.from({ length: count }, (_, i) => (
          <FormField
            key={`${fieldPrefix}${i + 1}`}
            control={form.control}
            name={`${fieldPrefix}${i + 1}` as keyof ResultFormValues}
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
                    value={field.value ?? ''}
                    disabled={isLoading || isSubmitting}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ));
    };

    return (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)}>
             <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="drawSlug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nom du Tirage</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value} disabled={isLoading || isSubmitting}>
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
                              className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                              disabled={isLoading || isSubmitting}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? (format(field.value, "PPP", { locale: fr })) : (<span>Choisir une date</span>)}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date > new Date() || date < new Date("2000-01-01")}
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
            </div>
            <div className="flex justify-end pt-6">
               <Button type="submit" disabled={isLoading || isSubmitting}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {submitButtonText}
                </Button>
            </div>
          </form>
        </Form>
    );
}
