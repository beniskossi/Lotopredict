
import type { DaySchedule } from '@/types/loto';
import { CalendarDays, Clock, Star, Moon, Sun, Zap, Gem, Award, Gift, Puzzle, Lightbulb, BarChartBig, TrendingUp, BrainCircuit, History, CheckCircle, Target } from 'lucide-react';
import type React from 'react';

// Helper icons - these are simple placeholders or Lucide icons.
// In a real app, you might use custom SVGs.
const HandshakeIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M11 17a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2M7 11.5 10.5 8M7 8.5l3.5 3.5"/><path d="m14 12.5 3.5 3.5M14 16l3.5-3.5"/><path d="M13 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2Z"/></svg>
);
const CoinsIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="8" cy="8" r="6"/><path d="M18.09 10.72A6 6 0 1 1 12 20.59"/><path d="M12 12c0 2.76 2.24 5 5 5s5-2.24 5-5-2.24-5-5-5c-.78 0-1.5.18-2.13.5"/></svg>
);
const BanknoteIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
);
const CreditCardIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
);
const WalletIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
 <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M20 12V8H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4"/><path d="M4 18c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2h16v4c0 1.1-.9 2-2 2H6"/><path d="M18 12.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z"/></svg>
);
const PartyPopperIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M5.32.32a.5.5 0 0 0-.64.64L7 8l-2.65 2.65a.5.5 0 0 0 0 .7l.7.7a.5.5 0 0 0 .7 0L8 9.7l2.65 2.65a.5.5 0 0 0 .7 0l.7-.7a.5.5 0 0 0 0-.7L9.4 8l2.3-2.3a.5.5 0 0 0 0-.71l-.7-.7a.5.5 0 0 0-.71 0L8 6.61 5.32.32Z"/><path d="m15.5 12.5 3.5 3.5M15.5 16l3.5-3.5"/><path d="m14 18 6-6"/><path d="m8 14 6-6"/></svg>
);
const ShieldIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
);
const SunriseIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
 <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 2L12 6"/><path d="M5.2 8.2L2.4 5.4"/><path d="M2 12H6"/><path d="M5.2 15.8L2.4 18.6"/><path d="M12 18V22"/><path d="M18.8 15.8L21.6 18.6"/><path d="M22 12H18"/><path d="M18.8 8.2L21.6 5.4"/><path d="M16 18a4 4 0 0 0-8 0"/></svg>
);
const FlagIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>
);
const SparklesIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
);
const Dice5Icon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M16 8h.01"/><path d="M8 8h.01"/><path d="M12 12h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/></svg>
);
const HeartIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5 2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
);

export const DRAW_SCHEDULE: DaySchedule[] = [
  {
    day: 'Lundi',
    icon: CalendarDays,
    draws: [
      { name: 'Réveil', time: '10H', slug: 'lundi-10h-reveil', icon: Clock },
      { name: 'Étoile', time: '13H', slug: 'lundi-13h-etoile', icon: Star },
      { name: 'Akwaba', time: '16H', slug: 'lundi-16h-akwaba', icon: HandshakeIcon },
      { name: 'Monday Special', time: '18H15', slug: 'lundi-18h15-monday-special', icon: Moon },
    ],
  },
  {
    day: 'Mardi',
    icon: CalendarDays,
    draws: [
      { name: 'La Matinale', time: '10H', slug: 'mardi-10h-la-matinale', icon: Sun },
      { name: 'Émergence', time: '13H', slug: 'mardi-13h-emergence', icon: Zap },
      { name: 'Sika', time: '16H', slug: 'mardi-16h-sika', icon: CoinsIcon },
      { name: 'Lucky Tuesday', time: '18H15', slug: 'mardi-18h15-lucky-tuesday', icon: Target },
    ],
  },
  {
    day: 'Mercredi',
    icon: CalendarDays,
    draws: [
      { name: 'Première Heure', time: '10H', slug: 'mercredi-10h-premiere-heure', icon: Clock },
      { name: 'Fortune', time: '13H', slug: 'mercredi-13h-fortune', icon: Gem },
      { name: 'Baraka', time: '16H', slug: 'mercredi-16h-baraka', icon: Award },
      { name: 'Midweek', time: '18H15', slug: 'mercredi-18h15-midweek', icon: Puzzle },
    ],
  },
  {
    day: 'Jeudi',
    icon: CalendarDays,
    draws: [
      { name: 'Kado', time: '10H', slug: 'jeudi-10h-kado', icon: Gift },
      { name: 'Privilège', time: '13H', slug: 'jeudi-13h-privilege', icon: Award },
      { name: 'Monni', time: '16H', slug: 'jeudi-16h-monni', icon: BanknoteIcon },
      { name: 'Fortune Thursday', time: '18H15', slug: 'jeudi-18h15-fortune-thursday', icon: TrendingUp },
    ],
  },
  {
    day: 'Vendredi',
    icon: CalendarDays,
    draws: [
      { name: 'Cash', time: '10H', slug: 'vendredi-10h-cash', icon: CreditCardIcon },
      { name: 'Solution', time: '13H', slug: 'vendredi-13h-solution', icon: Lightbulb },
      { name: 'Wari', time: '16H', slug: 'vendredi-16h-wari', icon: WalletIcon },
      { name: 'Friday Bonanza', time: '18H15', slug: 'vendredi-18h15-friday-bonanza', icon: PartyPopperIcon },
    ],
  },
  {
    day: 'Samedi',
    icon: CalendarDays,
    draws: [
      { name: 'Soutra', time: '10H', slug: 'samedi-10h-soutra', icon: ShieldIcon },
      { name: 'Diamant', time: '13H', slug: 'samedi-13h-diamant', icon: Gem },
      { name: 'Moaye', time: '16H', slug: 'samedi-16h-moaye', icon: SunriseIcon },
      { name: 'National', time: '18H15', slug: 'samedi-18h15-national', icon: FlagIcon },
    ],
  },
  {
    day: 'Dimanche',
    icon: CalendarDays,
    draws: [
      { name: 'Bénédiction', time: '10H', slug: 'dimanche-10h-benediction', icon: SparklesIcon },
      { name: 'Prestige', time: '13H', slug: 'dimanche-13h-prestige', icon: Award },
      { name: 'Awalé', time: '16H', slug: 'dimanche-16h-awale', icon: Dice5Icon },
      { name: 'Espoir', time: '18H15', slug: 'dimanche-18h15-espoir', icon: HeartIcon },
    ],
  },
];


export const ALL_DRAW_SLUGS = DRAW_SCHEDULE.flatMap(daySchedule => daySchedule.draws.map(draw => draw.slug));

export const ALL_DRAW_NAMES_MAP = DRAW_SCHEDULE.reduce((acc, daySchedule) => {
  daySchedule.draws.forEach(draw => {
    acc[draw.slug] = `${daySchedule.day} ${draw.time} - ${draw.name}`;
  });
  return acc;
}, {} as Record<string, string>);

export const getDrawNameBySlug = (slug: string): string => {
  return ALL_DRAW_NAMES_MAP[slug] || "Tirage Inconnu";
};

export const ICONS_MAP = {
  donnees: History,
  consulter: CheckCircle,
  statistiques: BarChartBig,
  prediction: BrainCircuit,
} as const;

export const DRAW_SLUG_BY_SIMPLE_NAME_MAP = DRAW_SCHEDULE.reduce((acc, day) => {
    day.draws.forEach(draw => {
        // Normalize: lowercase, remove accents, trim whitespace
        const normalizedName = draw.name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
        acc[normalizedName] = draw.slug;
    });
    return acc;
}, {} as Record<string, string>);
