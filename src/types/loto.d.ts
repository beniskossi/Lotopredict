import type { LucideIcon } from 'lucide-react';

export interface Draw {
  name: string;
  time: string;
  slug: string; 
  icon?: LucideIcon;
}

export interface DaySchedule {
  day: string;
  draws: Draw[];
  icon?: LucideIcon;
}

export interface DrawResult {
  date: string;
  winningNumbers: number[];
  machineNumbers?: number[]; // Made optional
}

export interface HistoricalDataEntry extends DrawResult {
  drawName: string;
}

export interface NumberFrequency {
  number: number;
  frequency: number;
}

export interface NumberCoOccurrence {
  selectedNumber: number;
  coOccurrences: Array<{
    number: number;
    count: number;
  }>;
}
