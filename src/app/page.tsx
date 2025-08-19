
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
      <Card className="mb-8 shadow-xl overflow-hidden border-primary/20">
        <div className="grid md:grid-cols-2 items-center">
          <div className="p-8 md:p-12">
            <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4 leading-tight">
              Bienvenue sur LotoPredict
            </h1>
            <p className="text-lg text-foreground/90 mb-6">
              Votre expert en analyse de loterie. Explorez les données, découvrez les tendances et laissez notre IA vous guider vers des prédictions intelligentes.
            </p>
            {firstDrawSlug && (
              <Button asChild size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg transform hover:scale-105 transition-transform duration-300">
                <Link href={`/draw/${firstDrawSlug}`}>Commencer l'Exploration</Link>
              </Button>
            )}
          </div>
          <div className="relative h-64 md:h-full min-h-[300px]">
            <Image
              src="https://placehold.co/800x600.png"
              alt="Sphères de loterie abstraites et futuristes"
              layout="fill"
              objectFit="cover"
              data-ai-hint="lottery futuristic abstract"
              priority
            />
             <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent md:bg-gradient-to-r md:from-background md:via-transparent md:to-transparent"></div>
          </div>
        </div>
      </Card>

      <section className="mb-12">
        <h2 className="text-3xl font-semibold text-center text-foreground mb-8">Fonctionnalités Clés</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <FeatureCard
            icon={<DatabaseZap className="h-10 w-10 text-primary mb-4" />}
            title="Données de Tirage"
            description="Accédez aux derniers résultats, y compris les numéros gagnants et machine."
          />
          <FeatureCard
            icon={<BarChart2 className="h-10 w-10 text-primary mb-4" />}
            title="Analyses Statistiques"
            description="Visualisez la fréquence des numéros, identifiez les boules chaudes et froides."
          />
          <FeatureCard
            icon={<CalendarCheck2 className="h-10 w-10 text-primary mb-4" />}
            title="Consultation Facile"
            description="Vérifiez si vos combinaisons ont déjà gagné et explorez les co-occurrences."
          />
          <FeatureCard
            icon={<BrainCircuit className="h-10 w-10 text-primary mb-4" />}
            title="Prédictions par IA"
            description="Obtenez des suggestions intelligentes basées sur des modèles d'analyse avancés."
          />
        </div>
      </section>

      <Card className="bg-card/80 backdrop-blur-sm border-accent/30">
        <CardHeader>
          <CardTitle className="text-center text-2xl text-accent">Prêt à Analyser ?</CardTitle>
          <CardDescription className="text-center text-muted-foreground">
            Naviguez vers un tirage spécifique via le menu latéral pour commencer.
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
    <Card className="text-center p-6 hover:shadow-primary/20 hover:border-primary/40 border-transparent border transition-all duration-300 bg-card transform hover:-translate-y-1">
      <div className="flex justify-center items-center mb-4">{icon}</div>
      <h3 className="text-xl font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </Card>
  );
}
