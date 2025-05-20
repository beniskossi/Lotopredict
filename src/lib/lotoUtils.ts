import type { HistoricalDataEntry } from '@/types/loto';

export const getBallColor = (number: number): string => {
  if (number >= 1 && number <= 9) return 'bg-slate-100 text-slate-900 border-slate-300'; // white
  if (number >= 10 && number <= 19) return 'bg-sky-300 text-sky-900 border-sky-500'; // light blue
  if (number >= 20 && number <= 29) return 'bg-blue-700 text-blue-100 border-blue-900'; // dark blue
  if (number >= 30 && number <= 39) return 'bg-emerald-300 text-emerald-900 border-emerald-500'; // light green
  if (number >= 40 && number <= 49) return 'bg-purple-500 text-purple-100 border-purple-700'; // violet
  if (number >= 50 && number <= 59) return 'bg-indigo-500 text-indigo-100 border-indigo-700'; // indigo
  if (number >= 60 && number <= 69) return 'bg-yellow-400 text-yellow-900 border-yellow-600'; // yellow
  if (number >= 70 && number <= 79) return 'bg-orange-500 text-orange-100 border-orange-700'; // orange
  if (number >= 80 && number <= 90) return 'bg-red-500 text-red-100 border-red-700'; // red
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
