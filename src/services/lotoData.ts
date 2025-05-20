
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
    // Normalize: lowercase, no accents, trim for the key
    const normalizedKey = canonicalName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .toLowerCase()
      .trim();
    if (!canonicalDrawNameMap.has(normalizedKey)) {
        canonicalDrawNameMap.set(normalizedKey, canonicalName); // Map normalized to canonical
    }
  });
});


function _getApiDrawNameFromSlug(drawSlug: string): string | undefined {
  for (const daySchedule of DRAW_SCHEDULE) {
    for (const draw of daySchedule.draws) {
      if (draw.slug === drawSlug) {
        return draw.name; // This is the canonical name from our schedule
      }
    }
  }
  return undefined;
}

function _parseApiDate(apiDateString: string, contextYear: number): string | null {
  const dayMonthMatch = apiDateString.match(/(\d{2}\/\d{2})$/); 
  if (!dayMonthMatch || !dayMonthMatch[1]) {
    // console.warn(`_parseApiDate: Could not extract day/month from API date string: ${apiDateString}`);
    return null;
  }
  const dayMonth = dayMonthMatch[1]; 
  
  // Try parsing with the provided contextYear
  const parsedDate = dateFnsParse(`${dayMonth}/${contextYear}`, 'dd/MM/yyyy', new Date(contextYear, 0, 1));

  if (isValid(parsedDate)) {
    return format(parsedDate, 'yyyy-MM-dd'); 
  } else {
    // console.warn(`_parseApiDate: Failed to parse date ${dayMonth}/${contextYear} as dd/MM/yyyy. Original API string: ${apiDateString}`);
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
  apiDrawName: string; // This should be the canonical name from DRAW_SCHEDULE
  date: string; // YYYY-MM-DD
  winningNumbers: number[];
  machineNumbers?: number[]; // Made optional here to align with DrawResult
  // rawApiDate?: string; // Keep for debugging if needed
}

interface FirestoreDrawDoc extends RawApiDraw {
  fetchedAt: Timestamp; // Or FieldValue for serverTimestamp
}

const _saveDrawsToFirestore = async (draws: RawApiDraw[]): Promise<void> => {
  if (!draws.length) return;
  const batch = writeBatch(db);
  draws.forEach(draw => {
    // Use the canonical name for the ID, normalized
    const normalizedIdNamePart = draw.apiDrawName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/[^\w-]/g, ''); // Remove any other non-alphanumeric chars except hyphen

    const docId = `${draw.date}_${normalizedIdNamePart}`;
    const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
    
    const dataToSave: FirestoreDrawDoc = { 
      ...draw, 
      fetchedAt: serverTimestamp() 
    };
    batch.set(docRef, dataToSave, { merge: true }); // Merge true to avoid overwriting fetchedAt if only updating results
  });
  try {
    await batch.commit();
    // console.log(`${draws.length} draws saved to Firestore.`);
  } catch (error) {
    console.error("Error saving draws to Firestore:", error);
    // Potentially re-throw or handle more gracefully
  }
};

async function _fetchAndParseMonthData(yearMonth: string): Promise<RawApiDraw[]> {
  const url = `${API_BASE_URL}?month=${yearMonth}`;
  // console.log(`Fetching API data for month: ${yearMonth} from ${url}`);
  try {
    const response = await fetch(url, { headers: API_HEADERS });
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status} for ${url}`);
    }
    const data = await response.json();

    if (!data.success || !data.drawsResultsWeekly) {
      // console.warn(`API call for ${yearMonth} did not return success or drawsResultsWeekly.`);
      return [];
    }
    
    let contextYear: number;
    const currentMonthStrApi = data.currentMonth; // e.g., "Juillet 2024"
    const yearMatch = currentMonthStrApi?.match(/\b(\d{4})\b/);
    if (yearMatch && yearMatch[1]) {
      contextYear = parseInt(yearMatch[1], 10);
    } else {
      // Fallback to year from yearMonth if API's currentMonth is not parsable
      contextYear = parseInt(yearMonth.split('-')[0], 10);
      // console.warn(`Could not parse year from API's currentMonth ('${currentMonthStrApi}'), falling back to year from request: ${contextYear}`);
    }


    const parsedResults: RawApiDraw[] = [];

    for (const week of data.drawsResultsWeekly) {
      for (const dailyResult of week.drawResultsDaily) {
        const apiDateStr = dailyResult.date; // e.g., "Jeudi 25/07"
        const parsedDate = _parseApiDate(apiDateStr, contextYear); // Pass context year
        
        if (!parsedDate) {
          // console.warn(`Skipping daily result due to unparsable date: ${apiDateStr}`);
          continue;
        }

        // Assuming dailyResult.drawResults.standardDraws is the array of draws for the day
        if (dailyResult.drawResults && dailyResult.drawResults.standardDraws) {
          for (const draw of dailyResult.drawResults.standardDraws) {
            const apiDrawNameFromPayload = draw.drawName; // e.g., "KADO", "PRIVILEGE"

            if (!apiDrawNameFromPayload || typeof apiDrawNameFromPayload !== 'string') {
              // console.warn('Skipping draw due to missing or invalid drawName in API payload:', draw);
              continue;
            }
            
            // Normalize the API draw name for lookup
            const normalizedApiNameToLookup = apiDrawNameFromPayload
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "") // Remove accents
              .toLowerCase()
              .trim();
            
            const resolvedCanonicalName = canonicalDrawNameMap.get(normalizedApiNameToLookup);

            if (!resolvedCanonicalName) {
              // console.warn(`No canonical mapping found for API draw name: '${apiDrawNameFromPayload}' (normalized: '${normalizedApiNameToLookup}')`);
              continue; // Skip if we don't have a mapping for this draw name
            }
            
            // Skip if winningNumbers is missing or malformed (e.g., starts with ".")
            if (draw.winningNumbers && typeof draw.winningNumbers === 'string' && draw.winningNumbers.startsWith('.')) {
              // console.warn(`Skipping draw '${resolvedCanonicalName}' on ${parsedDate} due to malformed winning numbers: ${draw.winningNumbers}`);
              continue;
            }

            const winningNumbers = _parseNumbersString(draw.winningNumbers);
            const machineNumbersParsed = _parseNumbersString(draw.machineNumbers);

            if (winningNumbers.length === 5) {
              const validMachineNumbers = machineNumbersParsed.length === 5 ? machineNumbersParsed : [];
              parsedResults.push({
                apiDrawName: resolvedCanonicalName, // Use the canonical name from our schedule
                date: parsedDate, // YYYY-MM-DD
                winningNumbers: winningNumbers,
                machineNumbers: validMachineNumbers,
                // rawApiDate: apiDateStr // For debugging if needed
              });
            } else {
              // console.warn(`Skipping draw '${resolvedCanonicalName}' on ${parsedDate} due to incomplete winning numbers (found ${winningNumbers.length}):`, winningNumbers);
            }
          }
        }
      }
    }
    // console.log(`Parsed ${parsedResults.length} results from API for ${yearMonth}`);
    if (parsedResults.length > 0) {
      await _saveDrawsToFirestore(parsedResults);
    }
    return parsedResults;
  } catch (error) {
    console.error(`Error fetching or parsing data for ${yearMonth} from API:`, error);
    return []; // Return empty array on error to allow fallback to Firestore or next month
  }
}

// Fetches the single most recent draw result for a given drawSlug
export const fetchDrawData = async (drawSlug: string): Promise<DrawResult> => {
  const canonicalDrawName = _getApiDrawNameFromSlug(drawSlug);
  if (!canonicalDrawName) {
    throw new Error(`Unknown draw slug: ${drawSlug}`);
  }
  // console.log(`fetchDrawData called for slug: ${drawSlug}, canonical name: ${canonicalDrawName}`);

  // 1. Try fetching from Firestore first
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
      // console.log(`Found latest draw for ${canonicalDrawName} in Firestore:`, firestoreDoc);
      const drawDateObject = dateFnsParse(firestoreDoc.date, 'yyyy-MM-dd', new Date());
      return {
        date: isValid(drawDateObject) ? format(drawDateObject, 'PPP', { locale: fr }) : 'Date invalide',
        winningNumbers: firestoreDoc.winningNumbers,
        machineNumbers: firestoreDoc.machineNumbers,
      };
    }
    // console.log(`No data found in Firestore for ${canonicalDrawName}. Will try API.`);
  } catch (error) {
    console.error(`Error fetching latest draw for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore:`, error);
    // Proceed to API fetch
  }

  // 2. If not in Firestore, or error, fetch from API (current month, then previous months)
  let attempts = 0;
  const MAX_API_ATTEMPTS = 3; // Check current month + 2 previous months
  let currentDateIter = new Date();
  let fetchedFromApiAndSaved = false;


  while (attempts < MAX_API_ATTEMPTS) {
    const yearMonth = format(currentDateIter, 'yyyy-MM');
    // console.log(`Attempt ${attempts + 1}/${MAX_API_ATTEMPTS}: Fetching API data for ${canonicalDrawName}, month ${yearMonth}`);
    await _fetchAndParseMonthData(yearMonth); // This function now saves to Firestore
    fetchedFromApiAndSaved = true; // Mark that we've interacted with the API and potentially saved new data

    // After fetching and saving a month, check Firestore again for the specific draw
    try {
        const qCheck = query(
          collection(db, RESULTS_COLLECTION_NAME), 
          where("apiDrawName", "==", canonicalDrawName),
          // Ensure we are looking within the month we just fetched or more recent
          where("date", ">=", format(new Date(currentDateIter.getFullYear(), currentDateIter.getMonth(), 1), 'yyyy-MM-dd')),
          where("date", "<=", format(new Date(currentDateIter.getFullYear(), currentDateIter.getMonth() + 1, 0), 'yyyy-MM-dd')), // To end of this month
          orderBy("date", "desc"), 
          limit(1)
        );
        const checkSnapshot = await getDocs(qCheck);
        if (!checkSnapshot.empty) {
           const firestoreDoc = checkSnapshot.docs[0].data() as FirestoreDrawDoc;
           // console.log(`Found draw ${canonicalDrawName} in Firestore after API fetch for month ${yearMonth}:`, firestoreDoc);
           const drawDateObject = dateFnsParse(firestoreDoc.date, 'yyyy-MM-dd', new Date());
            return {
                date: isValid(drawDateObject) ? format(drawDateObject, 'PPP', { locale: fr }) : 'Date invalide',
                winningNumbers: firestoreDoc.winningNumbers,
                machineNumbers: firestoreDoc.machineNumbers,
            };
        }
    } catch (error) {
        console.error(`Error checking Firestore for ${canonicalDrawName} after fetching month ${yearMonth}:`, error);
    }

    currentDateIter = subMonths(currentDateIter, 1);
    attempts++;
  }

  // 3. One last check in Firestore after all API attempts
  if (fetchedFromApiAndSaved) {
    // console.log(`Final check in Firestore for ${canonicalDrawName} after all API attempts.`);
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
        // console.log(`Found latest draw for ${canonicalDrawName} in Firestore (final check):`, firestoreDoc);
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
  
  throw new Error(`No data found for draw ${canonicalDrawName} (slug: ${drawSlug}) after checking Firestore and API.`);
};

export const fetchHistoricalData = async (drawSlug: string, count: number = 20): Promise<HistoricalDataEntry[]> => {
  const canonicalDrawName = _getApiDrawNameFromSlug(drawSlug);
  if (!canonicalDrawName) {
    // console.warn(`fetchHistoricalData: Unknown draw slug: ${drawSlug}`);
    return [];
  }
  // console.log(`fetchHistoricalData called for slug: ${drawSlug}, canonical name: ${canonicalDrawName}, count: ${count}`);

  let firestoreResults: FirestoreDrawDoc[] = [];
  try {
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
    // console.log(`Initial fetch from Firestore for ${canonicalDrawName} found ${firestoreResults.length} entries.`);
  } catch (error) {
    console.error(`Error fetching historical data for ${canonicalDrawName} from Firestore:`, error);
    // Continue, as we might fetch from API
  }

  // If not enough data in Firestore, fetch from API for older months
  if (firestoreResults.length < count) {
    const needed = count - firestoreResults.length;
    // Estimate how many months to go back, assuming ~4-5 relevant draws per month.
    // Be conservative to avoid excessive API calls. Max 12 months back.
    const estimatedDrawsPerMonthOfType = 5; // How many times this specific draw type occurs per month
    let monthsToFetch = Math.min(12, Math.max(1, Math.ceil(needed / estimatedDrawsPerMonthOfType) )); 
    
    // Determine the starting month for API fetching
    let dateToFetch = firestoreResults.length > 0 
        ? subMonths(dateFnsParse(firestoreResults[firestoreResults.length - 1].date, 'yyyy-MM-dd', new Date()),1) // Start from month before the oldest we have
        : new Date(); // If no data, start from current month

    // console.log(`Need ${needed} more entries for ${canonicalDrawName}. Will try fetching up to ${monthsToFetch} older months from API, starting around ${format(dateToFetch, 'yyyy-MM')}.`);

    for (let i = 0; i < monthsToFetch; i++) {
      const yearMonth = format(dateToFetch, 'yyyy-MM');
      // console.log(`Fetching historical from API: month ${yearMonth} for ${canonicalDrawName}.`);
      await _fetchAndParseMonthData(yearMonth); // Saves to Firestore
      dateToFetch = subMonths(dateToFetch, 1);
        // Optional: Add a small delay to be polite to the API if fetching many months
        if (i > 0 && i % 3 === 0) { // e.g., delay every 3 months
            // console.log("Pausing for 500ms during historical API fetch...");
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // After API fetches, re-query Firestore to get the combined and sorted data
    try {
      // console.log(`Re-querying Firestore for ${canonicalDrawName} after historical API sync.`);
      const q = query(
        collection(db, RESULTS_COLLECTION_NAME),
        where("apiDrawName", "==", canonicalDrawName),
        orderBy("date", "desc"),
        limit(count) // Get up to the originally requested count
      );
      const querySnapshot = await getDocs(q);
      firestoreResults = []; // Reset and repopulate
      querySnapshot.forEach(doc => {
        firestoreResults.push(doc.data() as FirestoreDrawDoc);
      });
      // console.log(`After historical API sync, Firestore now has ${firestoreResults.length} entries for ${canonicalDrawName}.`);
    } catch (error) {
      console.error(`Error re-fetching historical data for ${canonicalDrawName} from Firestore after API sync:`, error);
    }
  }
  
  // Map Firestore documents to the expected HistoricalDataEntry format
  return firestoreResults.slice(0, count).map(entry => {
    const entryDateObj = dateFnsParse(entry.date, 'yyyy-MM-dd', new Date());
    return {
      drawName: drawSlug, // Use the original slug for consistency in the app
      date: isValid(entryDateObj) ? format(entryDateObj, 'PPP', { locale: fr }) : 'Date invalide',
      winningNumbers: entry.winningNumbers,
      machineNumbers: entry.machineNumbers,
    };
  });
};


export async function fetchNumberFrequency(drawSlug: string, data?: HistoricalDataEntry[]): Promise<NumberFrequency[]> {
  const historicalData = data || await fetchHistoricalData(drawSlug, 50); // Default to 50 entries for frequency
  
  if (historicalData.length === 0) {
    // console.warn(`fetchNumberFrequency: No historical data for ${drawSlug}, returning empty array.`);
    return [];
  }

  const allNumbers = historicalData.flatMap(entry => {
    const nums = [...entry.winningNumbers];
    if (entry.machineNumbers && entry.machineNumbers.length > 0) { 
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
    .sort((a, b) => b.frequency - a.frequency || a.number - b.number); // Primary sort by freq, secondary by number
};

export async function fetchNumberCoOccurrence(drawSlug: string, selectedNumber: number, data?: HistoricalDataEntry[]): Promise<NumberCoOccurrence> {
  const historicalData = data || await fetchHistoricalData(drawSlug, 50); // Default to 50 entries for co-occurrence

  if (historicalData.length === 0) {
    // console.warn(`fetchNumberCoOccurrence: No historical data for ${drawSlug}, returning empty coOccurrences.`);
    return { selectedNumber, coOccurrences: [] };
  }

  const coOccurrenceMap: Record<number, number> = {};

  historicalData.forEach(entry => {
    const combinedNumbers = [...entry.winningNumbers];
    if (entry.machineNumbers && entry.machineNumbers.length > 0) { 
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
  
  // Get top 10 co-occurring numbers
  const coOccurrences = Object.entries(coOccurrenceMap)
    .map(([numStr, count]) => ({ number: parseInt(numStr), count }))
    .sort((a, b) => b.count - a.count || a.number - b.number) // Primary sort by count, secondary by number
    .slice(0, 10); 

  return { selectedNumber, coOccurrences };
};

