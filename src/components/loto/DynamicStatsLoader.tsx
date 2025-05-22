
"use client";

import type { DrawSlug } from '@/types/loto';
import dynamic from 'next/dynamic';
import { Skeleton } from "@/components/ui/skeleton";

// Dynamically import StatsSection with ssr: false
const DynamicStatsSectionComponent = dynamic(
  () => import('@/components/loto/StatsSection').then(mod => mod.StatsSection),
  { 
    ssr: false,
    loading: () => (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
        <p>Chargement des statistiques, veuillez patienter...</p>
      </div>
    )
  }
);

interface DynamicStatsLoaderProps {
  drawSlug: DrawSlug; 
}

export default function DynamicStatsLoader({ drawSlug }: DynamicStatsLoaderProps) {
  return <DynamicStatsSectionComponent drawSlug={drawSlug} />;
}
