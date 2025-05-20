import type { DrawResult, HistoricalDataEntry, NumberFrequency, NumberCoOccurrence } from '@/types/loto';

// Mock function to simulate fetching draw data
export const fetchDrawData = async (drawSlug: string): Promise<DrawResult> => {
  console.log(`Fetching data for ${drawSlug}... (mocked)`);
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 500));

  // Generate random numbers for mock data
  const generateNumbers = (count: number, max: number): number[] => {
    const numbers = new Set<number>();
    while (numbers.size < count) {
      numbers.add(Math.floor(Math.random() * max) + 1);
    }
    return Array.from(numbers).sort((a, b) => a - b);
  };

  return {
    date: new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' }),
    winningNumbers: generateNumbers(5, 90),
    machineNumbers: generateNumbers(5, 90),
  };
};

// Mock function to fetch historical data for a specific draw
export const fetchHistoricalData = async (drawSlug: string, count: number = 20): Promise<HistoricalDataEntry[]> => {
  console.log(`Fetching historical data for ${drawSlug}... (mocked)`);
  await new Promise(resolve => setTimeout(resolve, 700));

  const generateNumbers = (count: number, max: number): number[] => {
    const numbers = new Set<number>();
    while (numbers.size < count) {
      numbers.add(Math.floor(Math.random() * max) + 1);
    }
    return Array.from(numbers).sort((a, b) => a - b);
  };
  
  const historicalEntries: HistoricalDataEntry[] = [];
  for (let i = 0; i < count; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i * (Math.floor(Math.random()*3)+1) ); // Simulate draws on different past days
    historicalEntries.push({
      drawName: drawSlug, // In a real scenario, this might be part of the stored data
      date: date.toLocaleDateString('fr-FR'),
      winningNumbers: generateNumbers(5, 90),
      machineNumbers: generateNumbers(5, 90),
    });
  }
  return historicalEntries;
};

// Mock function for number frequency statistics
export const fetchNumberFrequency = async (drawSlug: string, data?: HistoricalDataEntry[]): Promise<NumberFrequency[]> => {
  console.log(`Fetching number frequency for ${drawSlug}... (mocked)`);
  const historicalData = data || await fetchHistoricalData(drawSlug, 50); // Use provided data or fetch 50 entries
  
  const allNumbers = historicalData.flatMap(entry => [...entry.winningNumbers, ...entry.machineNumbers]);
  const frequencyMap: Record<number, number> = {};

  allNumbers.forEach(num => {
    frequencyMap[num] = (frequencyMap[num] || 0) + 1;
  });

  return Object.entries(frequencyMap)
    .map(([numStr, freq]) => ({ number: parseInt(numStr), frequency: freq }))
    .sort((a, b) => b.frequency - a.frequency);
};

// Mock function for number co-occurrence
export const fetchNumberCoOccurrence = async (drawSlug: string, selectedNumber: number, data?: HistoricalDataEntry[]): Promise<NumberCoOccurrence> => {
  console.log(`Fetching co-occurrence for number ${selectedNumber} in ${drawSlug}... (mocked)`);
  const historicalData = data || await fetchHistoricalData(drawSlug, 50);

  const coOccurrenceMap: Record<number, number> = {};

  historicalData.forEach(entry => {
    const combinedNumbers = [...entry.winningNumbers, ...entry.machineNumbers];
    if (combinedNumbers.includes(selectedNumber)) {
      combinedNumbers.forEach(num => {
        if (num !== selectedNumber) {
          coOccurrenceMap[num] = (coOccurrenceMap[num] || 0) + 1;
        }
      });
    }
  });
  
  const coOccurrences = Object.entries(coOccurrenceMap)
    .map(([numStr, count]) => ({ number: parseInt(numStr), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Top 10 co-occurring numbers

  return { selectedNumber, coOccurrences };
};
