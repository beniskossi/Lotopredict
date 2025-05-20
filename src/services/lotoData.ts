
import type { DrawResult, HistoricalDataEntry, NumberFrequency, NumberCoOccurrence } from '@/types/loto';
import { DRAW_SCHEDULE } from '@/lib/lotoDraws.tsx';
import { format, subMonths, parse as dateFnsParse, isValid } from 'date-fns';
import fr from 'date-fns/locale/fr';

const API_BASE_URL = 'https://lotobonheur.ci/api/results';
const API_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Accept': 'application/json',
  'Referer': 'https://lotobonheur.ci/resultats',
};

// Helper: Create a map from normalized API draw names to canonical app draw names
const canonicalDrawNameMap = new Map<string, string>();
DRAW_SCHEDULE.forEach(daySchedule => {
  daySchedule.draws.forEach(draw => {
    const canonicalName = draw.name; // e.g., "Réveil"
    // For matching, normalize to lowercase and trim.
    const normalizedKey = canonicalName.trim().toLowerCase();
    if (!canonicalDrawNameMap.has(normalizedKey)) {
        canonicalDrawNameMap.set(normalizedKey, canonicalName);
    }
    // For more robust matching including accents, you could add:
    // const accentInsensitiveKey = canonicalName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    // if (normalizedKey !== accentInsensitiveKey && !canonicalDrawNameMap.has(accentInsensitiveKey)) {
    //     canonicalDrawNameMap.set(accentInsensitiveKey, canonicalName);
    // }
  });
});


// Helper to get the API draw name (e.g., "Réveil") from our app's slug (e.g., "lundi-10h-reveil")
// This returns the CANONICAL name as defined in lotoDraws.
function _getApiDrawNameFromSlug(drawSlug: string): string | undefined {
  for (const daySchedule of DRAW_SCHEDULE) {
    for (const draw of daySchedule.draws) {
      if (draw.slug === drawSlug) {
        return draw.name; 
      }
    }
  }
  return undefined;
}

// Helper to parse API date string ("Lundi DD/MM") into "YYYY-MM-DD"
function _parseApiDate(apiDateString: string, contextYear: number): string | null {
  const dayMonthMatch = apiDateString.match(/(\d{2}\/\d{2})$/);
  if (!dayMonthMatch || !dayMonthMatch[1]) {
    console.warn(`Could not extract DD/MM from API date string: ${apiDateString}`);
    return null;
  }
  const dayMonth = dayMonthMatch[1]; 

  const parsedDate = dateFnsParse(`${dayMonth}/${contextYear}`, 'dd/MM/yyyy', new Date(contextYear, 0, 1));

  if (isValid(parsedDate)) {
    return format(parsedDate, 'yyyy-MM-dd');
  } else {
    console.warn(`Invalid date after parsing: ${dayMonth} with year ${contextYear}. Parsed as: ${parsedDate}`);
    return null;
  }
}

function _parseNumbersString(numbersStr: string | null | undefined): number[] {
  if (!numbersStr || typeof numbersStr !== 'string') {
    return [];
  }
  return (numbersStr.match(/\d+/g) || []).map(Number).slice(0, 5);
}

interface RawApiDraw {
  apiDrawName: string; // This will store the CANONICAL draw name
  date: string; // YYYY-MM-DD
  winningNumbers: number[];
  machineNumbers?: number[];
}

async function _fetchAndParseMonthData(yearMonth: string): Promise<RawApiDraw[]> {
  const url = `${API_BASE_URL}?month=${yearMonth}`;
  console.log(`Fetching real data from: ${url}`);
  try {
    const response = await fetch(url, { headers: API_HEADERS });
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status} for ${url}`);
    }
    const data = await response.json();

    if (!data.success || !data.drawsResultsWeekly) {
      console.warn(`API response not successful or missing drawsResultsWeekly for ${yearMonth}:`, data);
      return [];
    }
    
    let contextYear: number;
    const currentMonthStrApi = data.currentMonth; 
    const yearMatch = currentMonthStrApi?.match(/\b(\d{4})\b/);
    if (yearMatch && yearMatch[1]) {
      contextYear = parseInt(yearMatch[1], 10);
    } else {
      contextYear = parseInt(yearMonth.split('-')[0], 10);
      console.warn(`Could not parse year from API's currentMonth field "${currentMonthStrApi}". Using year from request: ${contextYear}`);
    }

    const parsedResults: RawApiDraw[] = [];

    for (const week of data.drawsResultsWeekly) {
      for (const dailyResult of week.drawResultsDaily) {
        const apiDateStr = dailyResult.date; 
        const parsedDate = _parseApiDate(apiDateStr, contextYear);
        if (!parsedDate) {
          console.warn(`Skipping entry due to unparsable date: ${apiDateStr} for year ${contextYear}`);
          continue;
        }

        if (dailyResult.drawResults && dailyResult.drawResults.standardDraws) {
          for (const draw of dailyResult.drawResults.standardDraws) {
            const apiDrawNameFromPayload = draw.drawName;

            if (!apiDrawNameFromPayload || typeof apiDrawNameFromPayload !== 'string') {
              // console.warn(`Skipping draw with invalid name from payload: ${apiDrawNameFromPayload}`);
              continue;
            }
            
            const normalizedApiName = apiDrawNameFromPayload.trim().toLowerCase();
            // For more robust normalization including accents:
            // const normalizedApiName = apiDrawNameFromPayload.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            
            const resolvedCanonicalName = canonicalDrawNameMap.get(normalizedApiName);

            if (!resolvedCanonicalName) {
              // console.log(`Skipping unknown or unmapped draw name from API: '${apiDrawNameFromPayload}' (normalized: '${normalizedApiName}')`);
              continue;
            }
            
            if (draw.winningNumbers && typeof draw.winningNumbers === 'string' && draw.winningNumbers.startsWith('.')) {
              continue;
            }

            const winningNumbers = _parseNumbersString(draw.winningNumbers);
            const machineNumbers = _parseNumbersString(draw.machineNumbers);

            if (winningNumbers.length === 5) {
              parsedResults.push({
                apiDrawName: resolvedCanonicalName, // Use the resolved canonical name
                date: parsedDate, 
                winningNumbers: winningNumbers,
                machineNumbers: machineNumbers.length === 5 ? machineNumbers : undefined,
              });
            }
          }
        }
      }
    }
    return parsedResults;
  } catch (error) {
    console.error(`Error fetching or parsing data for ${yearMonth}:`, error);
    return []; 
  }
}

export const fetchDrawData = async (drawSlug: string): Promise<DrawResult> => {
  const apiDrawName = _getApiDrawNameFromSlug(drawSlug); // This is the canonical name
  if (!apiDrawName) {
    throw new Error(`Unknown draw slug: ${drawSlug}`);
  }
  console.log(`Fetching latest draw data for slug: ${drawSlug} (Canonical API Name: ${apiDrawName})`);

  let attempts = 0;
  let currentDateIter = new Date();

  while (attempts < 2) { 
    const yearMonth = format(currentDateIter, 'yyyy-MM');
    const monthData = await _fetchAndParseMonthData(yearMonth); // monthData now contains canonical apiDrawName
    
    const relevantDraws = monthData
      .filter(d => d.apiDrawName === apiDrawName) // Direct comparison with canonical name
      .sort((a, b) => b.date.localeCompare(a.date)); 

    if (relevantDraws.length > 0) {
      const latestDraw = relevantDraws[0];
      const drawDateObject = dateFnsParse(latestDraw.date, 'yyyy-MM-dd', new Date());
      return {
        date: isValid(drawDateObject) ? format(drawDateObject, 'PPP', { locale: fr }) : 'Date invalide',
        winningNumbers: latestDraw.winningNumbers,
        machineNumbers: latestDraw.machineNumbers,
      };
    }
    
    currentDateIter = subMonths(currentDateIter, 1);
    attempts++;
  }

  throw new Error(`No data found for draw ${apiDrawName} (slug: ${drawSlug}) after checking 2 months.`);
};

export const fetchHistoricalData = async (drawSlug: string, count: number = 20): Promise<HistoricalDataEntry[]> => {
  const apiDrawName = _getApiDrawNameFromSlug(drawSlug); // Canonical name
  if (!apiDrawName) {
    console.error(`No API draw name found for slug: ${drawSlug}`);
    return [];
  }
  console.log(`Fetching historical data for slug: ${drawSlug} (Canonical API Name: ${apiDrawName}), count: ${count}`);

  const allParsedEntries: RawApiDraw[] = [];
  let currentDateIter = new Date();
  const maxMonthsToFetch = 12; 

  for (let i = 0; i < maxMonthsToFetch; i++) {
    const yearMonth = format(currentDateIter, 'yyyy-MM');
    const monthData = await _fetchAndParseMonthData(yearMonth); // monthData has canonical names
    
    // Filter for the specific canonical draw name before pushing
    const relevantDrawsInMonth = monthData.filter(d => d.apiDrawName === apiDrawName);
    allParsedEntries.push(...relevantDrawsInMonth);

    // Deduplication is implicitly handled if monthData only contains unique date/canonicalName pairs
    // but let's ensure sorting and slicing logic is based on the target draw only
    const uniqueEntriesForTargetDraw = Array.from(new Map(
        allParsedEntries
            .filter(entry => entry.apiDrawName === apiDrawName) // ensure we only count for the target draw
            .map(entry => [`${entry.date}-${entry.apiDrawName}`, entry]) 
        ).values()
    );


    if (uniqueEntriesForTargetDraw.length >= count && i > 0) { 
      break; 
    }
    currentDateIter = subMonths(currentDateIter, 1);
  }
  
  // Final processing on all entries collected for the specific draw
  let finalEntries = allParsedEntries
    .filter(entry => entry.apiDrawName === apiDrawName) // Ensure only target draw
    .sort((a, b) => b.date.localeCompare(a.date)); // Sort by date descending
  
  // Deduplicate again after all fetches for this specific draw, just in case
  finalEntries = Array.from(new Map(finalEntries.map(entry => [`${entry.date}-${entry.apiDrawName}`, entry])).values());

  return finalEntries.slice(0, count).map(entry => {
    const entryDateObj = dateFnsParse(entry.date, 'yyyy-MM-dd', new Date());
    return {
      drawName: drawSlug, 
      date: isValid(entryDateObj) ? format(entryDateObj, 'PPP', { locale: fr }) : 'Date invalide',
      winningNumbers: entry.winningNumbers,
      machineNumbers: entry.machineNumbers,
    };
  });
};

export const fetchNumberFrequency = async (drawSlug: string, data?: HistoricalDataEntry[]): Promise<NumberFrequency[]> => {
  console.log(`Calculating number frequency for ${drawSlug}...`);
  const historicalData = data || await fetchHistoricalData(drawSlug, 50); 
  
  if (historicalData.length === 0) {
    console.warn(`No historical data for ${drawSlug} to calculate frequency.`);
    return [];
  }

  const allNumbers = historicalData.flatMap(entry => {
    const nums = [...entry.winningNumbers];
    if (entry.machineNumbers) {
      nums.push(...entry.machineNumbers);
    }
    return nums;
  });

  const frequencyMap: Record<number, number> = {};
  allNumbers.forEach(num => {
    frequencyMap[num] = (frequencyMap[num] || 0) + 1;
  });

  return Object.entries(frequencyMap)
    .map(([numStr, freq]) => ({ number: parseInt(numStr), frequency: freq }))
    .sort((a, b) => b.frequency - a.frequency || a.number - b.number);
};

export const fetchNumberCoOccurrence = async (drawSlug: string, selectedNumber: number, data?: HistoricalDataEntry[]): Promise<NumberCoOccurrence> => {
  console.log(`Calculating co-occurrence for number ${selectedNumber} in ${drawSlug}...`);
  const historicalData = data || await fetchHistoricalData(drawSlug, 50);

  if (historicalData.length === 0) {
    console.warn(`No historical data for ${drawSlug} to calculate co-occurrence.`);
    return { selectedNumber, coOccurrences: [] };
  }

  const coOccurrenceMap: Record<number, number> = {};

  historicalData.forEach(entry => {
    const combinedNumbers = [...entry.winningNumbers];
    if (entry.machineNumbers) {
      combinedNumbers.push(...entry.machineNumbers);
    }
    
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
    .sort((a, b) => b.count - a.count || a.number - b.number)
    .slice(0, 10); 

  return { selectedNumber, coOccurrences };
};

