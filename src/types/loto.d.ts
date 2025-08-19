
import type { LucideIcon } from 'lucide-react';
import type { Timestamp } from 'firebase/firestore';

export type DrawSlug = string; // Added this type for clarity

export interface Draw {
  name: string;
  time: string;
  slug: DrawSlug;
  icon?: LucideIcon;
}

export interface DaySchedule {
  day: string;
  draws: Draw[];
  icon?: LucideIcon;
}

export interface DrawResult {
  docId?: string; 
  date: string; // Display format, e.g., "25 juil. 2024"
  winningNumbers: number[];
  machineNumbers?: number[];
}

export interface HistoricalDataEntry extends DrawResult {
  drawName: DrawSlug; // This is the drawSlug
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

// For Firestore storage
export interface FirestoreDrawDoc {
  docId?: string;
  apiDrawName: string; // Canonical draw name used by the API/system
  date: string; // YYYY-MM-DD format for storage and sorting
  winningNumbers: number[];
  machineNumbers: number[]; // Stored as empty array if not present
  fetchedAt: Timestamp;
}

// For the manual add result form
export interface ManualAddResultFormInput {
  drawSlug: string;
  date: Date;
  wn1?: number;
  wn2?: number;
  wn3?: number;
  wn4?: number;
  wn5?: number;
  mn1?: number;
  mn2?: number;
  mn3?: number;
  mn4?: number;
  mn5?: number;
}

export type ManualEditResultFormInput = ManualAddResultFormInput;


export interface ManualLottoResultInput {
  drawSlug: string;
  date: Date; // JS Date object from form
  winningNumbers: number[];
  machineNumbers?: number[]; // Optional, will be empty array if not provided
}


export interface PredictionFeedback {
    id: string;
    drawSlug: string;
    prediction: number[];
    isRelevant: boolean;
    reasoning?: string; // Optional text feedback
    createdAt: Timestamp;
}
