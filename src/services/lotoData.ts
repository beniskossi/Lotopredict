
import type { DrawResult, HistoricalDataEntry, NumberFrequency, NumberCoOccurrence } from '@/types/loto';
import { DRAW_SCHEDULE } from '@/lib/lotoDraws.tsx';
import { format, subMonths, parse as dateFnsParse, isValid, getYear } from 'date-fns';
import fr from 'date-fns/locale/fr';
import { db } from '@/lib/firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  writeBatch,
  serverTimestamp,
  Timestamp
} from "firebase/firestore";

const API_BASE_URL = 'https://lotobonheur.ci/api/results';
const API_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Accept': 'application/json',
  'Referer': 'https://lotobonheur.ci/resultats',
};

const RESULTS_COLLECTION_NAME = 'lottoResults';

const canonicalDrawNameMap = new Map<string, string>();
DRAW_SCHEDULE.forEach(daySchedule => {
  daySchedule.draws.forEach(draw => {
    const canonicalName = draw.name;
    // Normalize: lowercase, no accents, trim
    const normalizedKey = canonicalName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    if (!canonicalDrawNameMap.has(normalizedKey)) {
        canonicalDrawNameMap.set(normalizedKey, canonicalName);
    }
    // Also add a mapping for the name as-is if it's different after normalization,
    // to catch cases where the API might send it already normalized but without accents
    if (canonicalName.toLowerCase().trim() !== normalizedKey) {
        const directNormalizedKey = canonicalName.toLowerCase().trim();
        if (!canonicalDrawNameMap.has(directNormalizedKey)) {
            canonicalDrawNameMap.set(directNormalizedKey, canonicalName);
        }
    }
  });
});

// console.log("Canonical Draw Name Map:", canonicalDrawNameMap);


function _getApiDrawNameFromSlug(drawSlug: string): string | undefined {
  for (const daySchedule of DRAW_SCHEDULE) {
    for (const draw of daySchedule.draws) {
      if (draw.slug === drawSlug) {
        return draw.name; 
      }
    }
  }
  // console.warn(`_getApiDrawNameFromSlug: No draw name found for slug '${drawSlug}'`);
  return undefined;
}

function _parseApiDate(apiDateString: string, contextYear: number): string | null {
  // Expects "Jour DD/MM" e.g. "Lundi 01/07"
  const dayMonthMatch = apiDateString.match(/(\d{2}\/\d{2})$/); // Extracts "01/07"
  if (!dayMonthMatch || !dayMonthMatch[1]) {
    // console.warn(`_parseApiDate: Could not extract DD/MM from '${apiDateString}'`);
    return null;
  }
  const dayMonth = dayMonthMatch[1]; // "01/07"
  
  const parsedDate = dateFnsParse(`${dayMonth}/${contextYear}`, 'dd/MM/yyyy', new Date(contextYear, 0, 1));

  if (isValid(parsedDate)) {
    return format(parsedDate, 'yyyy-MM-dd'); // Returns "YYYY-MM-DD"
  } else {
    // console.warn(`_parseApiDate: Invalid date after parsing '${dayMonth}/${contextYear}'`);
    return null;
  }
}

function _parseNumbersString(numbersStr: string | null | undefined): number[] {
  if (!numbersStr || typeof numbersStr !== 'string') {
    return [];
  }
  // Match numbers separated by non-digits, or just sequences of digits
  return (numbersStr.match(/\d+/g) || []).map(Number).slice(0, 5);
}

interface RawApiDraw {
  apiDrawName: string; // Canonical draw name
  date: string; // YYYY-MM-DD
  winningNumbers: number[];
  machineNumbers?: number[];
}

// Firestore specific document structure (extends RawApiDraw for type safety)
interface FirestoreDrawDoc extends RawApiDraw {
  fetchedAt: Timestamp; // Firestore Timestamp
  // rawApiDate?: string; // Optional: store the original date string from API for debugging
}

const _saveDrawsToFirestore = async (draws: RawApiDraw[]): Promise<void> => {
  if (!draws.length) return;
  const batch = writeBatch(db);
  draws.forEach(draw => {
    // Ensure docId is robust: use normalized name without accents for ID, replace non-alphanumeric.
    const normalizedIdNamePart = draw.apiDrawName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/[^\w-]/g, ''); // Remove any remaining non-alphanumeric (keeps underscore and hyphen)

    const docId = `${draw.date}_${normalizedIdNamePart}`;
    const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
    
    const dataToSave: FirestoreDrawDoc = { // Explicitly type
      ...draw, // draw.apiDrawName is already canonical
      fetchedAt: serverTimestamp() // Firestore Timestamp
    };
    batch.set(docRef, dataToSave, { merge: true }); // merge:true to update if exists, or create
  });
  try {
    await batch.commit();
    // console.log(`Successfully saved ${draws.length} draws to Firestore.`);
  } catch (error) {
    console.error("Error saving draws to Firestore:", error);
  }
};

async function _fetchAndParseMonthData(yearMonth: string): Promise<RawApiDraw[]> {
  const url = `${API_BASE_URL}?month=${yearMonth}`;
  // console.log(`_fetchAndParseMonthData: Fetching from ${url}`);
  try {
    const response = await fetch(url, { headers: API_HEADERS });
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status} for ${url}`);
    }
    const data = await response.json();

    if (!data.success || !data.drawsResultsWeekly) {
      // console.warn(`_fetchAndParseMonthData: API response for ${yearMonth} not successful or missing drawsResultsWeekly.`);
      return [];
    }
    
    let contextYear: number;
    const currentMonthStrApi = data.currentMonth; // e.g., "Juillet 2024"
    const yearMatch = currentMonthStrApi?.match(/\b(\d{4})\b/);
    if (yearMatch && yearMatch[1]) {
      contextYear = parseInt(yearMatch[1], 10);
    } else {
      // Fallback if currentMonth doesn't contain year, use yearMonth from param
      contextYear = parseInt(yearMonth.split('-')[0], 10);
      // console.warn(`_fetchAndParseMonthData: Could not parse year from API's currentMonth field ('${currentMonthStrApi}'). Falling back to year from parameter: ${contextYear}`);
    }
    // console.log(`_fetchAndParseMonthData: Context year for ${yearMonth} is ${contextYear}`);


    const parsedResults: RawApiDraw[] = [];

    for (const week of data.drawsResultsWeekly) {
      for (const dailyResult of week.drawResultsDaily) {
        const apiDateStr = dailyResult.date; // e.g., "Lundi 01/07"
        const parsedDate = _parseApiDate(apiDateStr, contextYear); // Converts to "YYYY-MM-DD"
        
        if (!parsedDate) {
          // console.warn(`Could not parse date from API string: '${apiDateStr}' for year ${contextYear}`);
          continue;
        }

        if (dailyResult.drawResults && dailyResult.drawResults.standardDraws) {
          for (const draw of dailyResult.drawResults.standardDraws) {
            const apiDrawNameFromPayload = draw.drawName; // e.g., "REVEIL", "ETOILE"

            if (!apiDrawNameFromPayload || typeof apiDrawNameFromPayload !== 'string') {
              // console.warn("Skipping draw due to missing or invalid drawName:", draw);
              continue;
            }
            
            const normalizedApiNameToLookup = apiDrawNameFromPayload
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .trim();
            
            const resolvedCanonicalName = canonicalDrawNameMap.get(normalizedApiNameToLookup);

            if (!resolvedCanonicalName) {
              // console.warn(`Skipping API draw: '${apiDrawNameFromPayload}' (normalized: '${normalizedApiNameToLookup}') as it does not map to a canonical name.`);
              continue;
            }
            
            // Skip entries that look like placeholders or invalid data
            if (draw.winningNumbers && typeof draw.winningNumbers === 'string' && draw.winningNumbers.startsWith('.')) {
              // console.warn(`Skipping draw '${resolvedCanonicalName}' on ${parsedDate} due to placeholder winning numbers: '${draw.winningNumbers}'`);
              continue;
            }

            const winningNumbers = _parseNumbersString(draw.winningNumbers);
            const machineNumbers = _parseNumbersString(draw.machineNumbers);

            if (winningNumbers.length === 5) {
              parsedResults.push({
                apiDrawName: resolvedCanonicalName, // Use the canonical name from our map
                date: parsedDate, 
                winningNumbers: winningNumbers,
                machineNumbers: machineNumbers.length === 5 ? machineNumbers : undefined,
                // rawApiDate: apiDateStr // Optional for debugging
              });
            } else {
              // console.warn(`Skipping draw '${resolvedCanonicalName}' on ${parsedDate} due to incomplete winning numbers (found ${winningNumbers.length}):`, winningNumbers);
            }
          }
        }
      }
    }
    if (parsedResults.length > 0) {
      await _saveDrawsToFirestore(parsedResults);
    }
    return parsedResults;
  } catch (error) {
    console.error(`Error fetching or parsing data for ${yearMonth} from API:`, error);
    return []; 
  }
}

export const fetchDrawData = async (drawSlug: string): Promise<DrawResult> => {
  const canonicalDrawName = _getApiDrawNameFromSlug(drawSlug);
  if (!canonicalDrawName) {
    throw new Error(`Unknown draw slug: ${drawSlug}`);
  }

  // 1. Try to fetch from Firestore
  try {
    const q = query(
      collection(db, RESULTS_COLLECTION_NAME), 
      where("apiDrawName", "==", canonicalDrawName), 
      orderBy("date", "desc"), 
      limit(1)
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const firestoreDoc = querySnapshot.docs[0].data() as FirestoreDrawDoc;
      const drawDateObject = dateFnsParse(firestoreDoc.date, 'yyyy-MM-dd', new Date());
      return {
        date: isValid(drawDateObject) ? format(drawDateObject, 'PPP', { locale: fr }) : 'Date invalide',
        winningNumbers: firestoreDoc.winningNumbers,
        machineNumbers: firestoreDoc.machineNumbers,
      };
    }
  } catch (error) {
    console.error(`Error fetching latest draw for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore:`, error);
    // Proceed to API fetch
  }

  // 2. If not in Firestore, fetch from API (current month, then X previous) and save
  let attempts = 0;
  const MAX_API_ATTEMPTS = 3; // Check current + 2 previous months
  let currentDateIter = new Date();
  let fetchedFromApiAndSaved = false;

  // console.log(`fetchDrawData: Initial check for ${canonicalDrawName} (slug: ${drawSlug}) in Firestore failed. Proceeding to API fetch.`);

  while (attempts < MAX_API_ATTEMPTS) {
    const yearMonth = format(currentDateIter, 'yyyy-MM');
    // console.log(`fetchDrawData: Attempt ${attempts + 1}/${MAX_API_ATTEMPTS} - API fetch for month ${yearMonth}`);
    await _fetchAndParseMonthData(yearMonth); 
    fetchedFromApiAndSaved = true; 
    currentDateIter = subMonths(currentDateIter, 1);
    attempts++;
  }

  // 3. After API fetch & save, try Firestore again
  if (fetchedFromApiAndSaved) {
    try {
      // console.log(`fetchDrawData: Re-querying Firestore for ${canonicalDrawName} after API sync.`);
      const q = query(
        collection(db, RESULTS_COLLECTION_NAME), 
        where("apiDrawName", "==", canonicalDrawName), 
        orderBy("date", "desc"), 
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const firestoreDoc = querySnapshot.docs[0].data() as FirestoreDrawDoc;
        const drawDateObject = dateFnsParse(firestoreDoc.date, 'yyyy-MM-dd', new Date());
        return {
          date: isValid(drawDateObject) ? format(drawDateObject, 'PPP', { locale: fr }) : 'Date invalide',
          winningNumbers: firestoreDoc.winningNumbers,
          machineNumbers: firestoreDoc.machineNumbers,
        };
      }
    } catch (error) {
      console.error(`Error fetching latest draw for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore after API sync:`, error);
    }
  }
  
  throw new Error(`No data found for draw ${canonicalDrawName} (slug: ${drawSlug}) after checking Firestore and API (checked last ${MAX_API_ATTEMPTS} months).`);
};

export const fetchHistoricalData = async (drawSlug: string, count: number = 20): Promise<HistoricalDataEntry[]> => {
  const canonicalDrawName = _getApiDrawNameFromSlug(drawSlug);
  if (!canonicalDrawName) {
    // console.warn(`fetchHistoricalData: No canonical name for slug ${drawSlug}. Returning empty array.`);
    return [];
  }

  let firestoreResults: FirestoreDrawDoc[] = [];
  try {
    // console.log(`fetchHistoricalData: Fetching up to ${count} entries for ${canonicalDrawName} from Firestore.`);
    const q = query(
      collection(db, RESULTS_COLLECTION_NAME),
      where("apiDrawName", "==", canonicalDrawName),
      orderBy("date", "desc"),
      limit(count)
    );
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(doc => {
      firestoreResults.push(doc.data() as FirestoreDrawDoc);
    });
    // console.log(`fetchHistoricalData: Found ${firestoreResults.length} entries in Firestore for ${canonicalDrawName}.`);
  } catch (error) {
    console.error(`Error fetching historical data for ${canonicalDrawName} from Firestore:`, error);
  }

  if (firestoreResults.length < count) {
    const needed = count - firestoreResults.length;
    // Estimate months to fetch. Assume ~4-8 draws of a specific type per month (4 weeks * 1-2 occurrences if daily).
    // This is a rough heuristic. Max 12 months to avoid excessive calls.
    const estimatedDrawsPerMonthOfType = 5; // Lowered estimate, more conservative
    let monthsToFetch = Math.min(12, Math.max(1, Math.ceil(needed / estimatedDrawsPerMonthOfType) )); 
    
    // console.log(`fetchHistoricalData: Need ${needed} more entries for ${canonicalDrawName}. Will attempt to fetch ${monthsToFetch} more months from API.`);

    let dateToFetch = firestoreResults.length > 0 
        ? subMonths(dateFnsParse(firestoreResults[firestoreResults.length - 1].date, 'yyyy-MM-dd', new Date()),1) // Start from month before last known entry
        : new Date(); // If no data, start from current month

    for (let i = 0; i < monthsToFetch; i++) {
      const yearMonth = format(dateToFetch, 'yyyy-MM');
      // console.log(`fetchHistoricalData: Fetching API data for ${canonicalDrawName}, month ${yearMonth} (attempt ${i+1}/${monthsToFetch})`);
      await _fetchAndParseMonthData(yearMonth); // Fetches API and saves to Firestore
      dateToFetch = subMonths(dateToFetch, 1);
        if (i > 0 && i % 3 === 0) { // Small delay every few months to be polite to API
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // Re-query Firestore to get the consolidated & sorted list
    try {
      // console.log(`fetchHistoricalData: Re-querying Firestore for ${canonicalDrawName} after API sync to get ${count} entries.`);
      const q = query(
        collection(db, RESULTS_COLLECTION_NAME),
        where("apiDrawName", "==", canonicalDrawName),
        orderBy("date", "desc"),
        limit(count)
      );
      const querySnapshot = await getDocs(q);
      firestoreResults = []; // Reset and fill with new query result
      querySnapshot.forEach(doc => {
        firestoreResults.push(doc.data() as FirestoreDrawDoc);
      });
      // console.log(`fetchHistoricalData: After API sync, found ${firestoreResults.length} entries in Firestore for ${canonicalDrawName}.`);
    } catch (error) {
      console.error(`Error re-fetching historical data for ${canonicalDrawName} from Firestore after API sync:`, error);
    }
  }
  
  return firestoreResults.slice(0, count).map(entry => {
    const entryDateObj = dateFnsParse(entry.date, 'yyyy-MM-dd', new Date());
    return {
      drawName: drawSlug, 
      date: isValid(entryDateObj) ? format(entryDateObj, 'PPP', { locale: fr }) : 'Date invalide',
      winningNumbers: entry.winningNumbers,
      machineNumbers: entry.machineNumbers,
    };
  });
};


export async function fetchNumberFrequency(drawSlug: string, data?: HistoricalDataEntry[]): Promise<NumberFrequency[]> {
  // console.log(`fetchNumberFrequency called for ${drawSlug}`);
  const historicalData = data || await fetchHistoricalData(drawSlug, 50); // Fetch 50 draws for frequency analysis
  
  if (historicalData.length === 0) {
    // console.warn(`fetchNumberFrequency: No historical data for ${drawSlug}.`);
    return [];
  }

  const allNumbers = historicalData.flatMap(entry => {
    const nums = [...entry.winningNumbers];
    if (entry.machineNumbers && entry.machineNumbers.length > 0) { // Check if machineNumbers exist and are not empty
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

export async function fetchNumberCoOccurrence(drawSlug: string, selectedNumber: number, data?: HistoricalDataEntry[]): Promise<NumberCoOccurrence> {
  // console.log(`fetchNumberCoOccurrence called for ${drawSlug}, number ${selectedNumber}`);
  const historicalData = data || await fetchHistoricalData(drawSlug, 50); // Fetch 50 draws for co-occurrence

  if (historicalData.length === 0) {
    // console.warn(`fetchNumberCoOccurrence: No historical data for ${drawSlug}.`);
    return { selectedNumber, coOccurrences: [] };
  }

  const coOccurrenceMap: Record<number, number> = {};

  historicalData.forEach(entry => {
    const combinedNumbers = [...entry.winningNumbers];
    if (entry.machineNumbers && entry.machineNumbers.length > 0) { // Check if machineNumbers exist and are not empty
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
    .slice(0, 10); // Top 10 co-occurring numbers

  return { selectedNumber, coOccurrences };
};

