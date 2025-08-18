
import type { HistoricalDataEntry } from '@/types/loto';

export const getBallColor = (number: number): string => {
  if (number >= 1 && number <= 9) return 'bg-slate-100 text-slate-900 border-slate-300'; // Blanc
  if (number >= 10 && number <= 19) return 'bg-blue-500 text-blue-100 border-blue-700'; // Bleu
  if (number >= 20 && number <= 29) return 'bg-green-500 text-green-100 border-green-700'; // Vert
  if (number >= 30 && number <= 39) return 'bg-indigo-500 text-indigo-100 border-indigo-700'; // Indigo
  if (number >= 40 && number <= 49) return 'bg-yellow-400 text-yellow-900 border-yellow-600'; // Jaune
  if (number >= 50 && number <= 59) return 'bg-pink-500 text-pink-100 border-pink-700'; // Rose
  if (number >= 60 && number <= 69) return 'bg-orange-500 text-orange-100 border-orange-700'; // Orange
  if (number >= 70 && number <= 79) return 'bg-gray-400 text-gray-900 border-gray-600'; // Gris
  if (number >= 80 && number <= 90) return 'bg-red-500 text-red-100 border-red-700'; // Rouge
  return 'bg-gray-400 text-gray-900 border-gray-600'; // Default
};

// Helper to format historical data for the AI model
// Use HistoricalDataEntry which now has machineNumbers as optional
export const formatHistoricalDataForAI = (data: HistoricalDataEntry[]): string => {
  return data.map(entry => {
    let recordString = `Gagnants: ${entry.winningNumbers.join(', ')}`;
    if (entry.machineNumbers && entry.machineNumbers.length > 0) {
      recordString += `; Machine: ${entry.machineNumbers.join(', ')}`;
    }
    return recordString;
  }).join('\n');
};
