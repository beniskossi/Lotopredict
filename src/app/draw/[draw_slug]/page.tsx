import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataSection } from "@/components/loto/DataSection";
import { StatsSection } from "@/components/loto/StatsSection";
import { ConsultSection } from "@/components/loto/ConsultSection";
import { PredictionSection } from "@/components/loto/PredictionSection";
import { ALL_DRAW_SLUGS, getDrawNameBySlug, ICONS_MAP } from "@/lib/lotoDraws";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import type { Metadata } from 'next';

type DrawPageProps = {
  params: { draw_slug: string };
};

export async function generateStaticParams() {
  return ALL_DRAW_SLUGS.map((slug) => ({
    draw_slug: slug,
  }));
}

export async function generateMetadata({ params }: DrawPageProps): Promise<Metadata> {
  const drawName = getDrawNameBySlug(params.draw_slug);
  return {
    title: `${drawName} - LotoPredict`,
    description: `Données, statistiques, et prédictions pour le tirage ${drawName}.`,
  };
}


export default function DrawPage({ params }: DrawPageProps) {
  const { draw_slug } = params;

  if (!ALL_DRAW_SLUGS.includes(draw_slug)) {
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl text-destructive flex items-center justify-center">
              <AlertTriangle className="mr-2 h-6 w-6" /> Tirage non trouvé
            </CardTitle>
          </CardHeader>
          <CardDescription>Le tirage que vous recherchez ({draw_slug}) n'existe pas ou est incorrect.</CardDescription>
        </Card>
      </div>
    );
  }

  const TABS_CONFIG = [
    { value: "donnees", label: "Données", Icon: ICONS_MAP.donnees, component: <DataSection drawSlug={draw_slug} /> },
    { value: "statistiques", label: "Statistiques", Icon: ICONS_MAP.statistiques, component: <StatsSection drawSlug={draw_slug} /> },
    { value: "consulter", label: "Consulter", Icon: ICONS_MAP.consulter, component: <ConsultSection drawSlug={draw_slug} /> },
    { value: "prediction", label: "Prédiction IA", Icon: ICONS_MAP.prediction, component: <PredictionSection drawSlug={draw_slug} /> },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-primary">{getDrawNameBySlug(draw_slug)}</h1>
      
      <Tabs defaultValue="donnees" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-6">
          {TABS_CONFIG.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs sm:text-sm">
              <tab.Icon className="mr-1.5 h-4 w-4 hidden sm:inline-block" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS_CONFIG.map(tab => (
          <TabsContent key={tab.value} value={tab.value}>
            {tab.component}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
