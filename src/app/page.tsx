
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DRAW_SCHEDULE } from "@/lib/lotoDraws.tsx";
import { BarChart2, BrainCircuit, CalendarCheck2, DatabaseZap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  const firstDrawSlug = DRAW_SCHEDULE[0]?.draws[0]?.slug;

  return (
    <div className="container mx-auto py-8 px-4">
      <Card className="mb-8 shadow-xl overflow-hidden">
        <div className="grid md:grid-cols-2 items-center">
          <div className="p-8 md:p-12">
            <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">
              Bienvenue sur LotoPredict
            </h1>
            <p className="text-lg text-foreground mb-6">
              Votre expert en analyse de loterie, statistiques avancées et prédictions intelligentes pour Loto Bonheur.
              Explorez les données, découvrez les tendances et laissez notre IA vous guider.
            </p>
            {firstDrawSlug && (
              <Button asChild size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Link href={`/draw/${firstDrawSlug}`}>Commencer l'exploration</Link>
              </Button>
            )}
          </div>
          <div className="relative h-64 md:h-full min-h-[300px]">
            <Image
              src="https://placehold.co/800x600.png"
              alt="Quatre boules de loterie colorées épelant le mot LOTO"
              layout="fill"
              objectFit="cover"
              data-ai-hint="LOTO lottery balls"
              priority
            />
             <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-transparent md:bg-gradient-to-t md:from-background md:via-transparent md:to-transparent"></div>
          </div>
        </div>
      </Card>

      <section className="mb-12">
        <h2 className="text-3xl font-semibold text-center text-foreground mb-8">Fonctionnalités Clés</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <FeatureCard
            icon={<DatabaseZap className="h-10 w-10 text-primary mb-3" />}
            title="Données de Tirage Actuelles"
            description="Accédez aux derniers résultats des tirages, y compris les numéros gagnants et machine."
          />
          <FeatureCard
            icon={<BarChart2 className="h-10 w-10 text-primary mb-3" />}
            title="Analyses Statistiques"
            description="Visualisez la fréquence des numéros, identifiez les boules chaudes et froides."
          />
          <FeatureCard
            icon={<CalendarCheck2 className="h-10 w-10 text-primary mb-3" />}
            title="Régularité des Numéros"
            description="Consultez la fréquence d'apparition d'un numéro avec d'autres."
          />
          <FeatureCard
            icon={<BrainCircuit className="h-10 w-10 text-primary mb-3" />}
            title="Prédictions IA"
            description="Obtenez des prédictions intelligentes basées sur des modèles d'apprentissage automatique."
          />
        </div>
      </section>

      <Card className="bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-center text-2xl text-accent">Prêt à Gagner ?</CardTitle>
          <CardDescription className="text-center text-muted-foreground">
            Naviguez vers un tirage spécifique via le menu latéral pour commencer votre analyse.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
           <p className="text-sm text-muted-foreground">
             LotoPredict est un outil d'analyse et ne garantit pas les gains. Jouez de manière responsable.
           </p>
        </CardContent>
      </Card>
    </div>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <Card className="text-center p-6 hover:shadow-lg transition-shadow duration-300 bg-card">
      <div className="flex justify-center items-center mb-4">{icon}</div>
      <h3 className="text-xl font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </Card>
  );
}
