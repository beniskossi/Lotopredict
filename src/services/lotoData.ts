
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
  deleteDoc,
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

// Create a map for canonical draw names to handle variations (e.g., accents, case)
const canonicalDrawNameMap = new Map<string, string>();
DRAW_SCHEDULE.forEach(daySchedule => {
  daySchedule.draws.forEach(draw => {
    const canonicalName = draw.name;
    // Normalize for the key: lowercase, no accents, trim
    const normalizedKey = canonicalName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") 
      .toLowerCase()
      .trim();
    if (!canonicalDrawNameMap.has(normalizedKey)) {
        canonicalDrawNameMap.set(normalizedKey, canonicalName); 
    }
    // Also map the original name (normalized) to itself in case it's already canonical and used for lookup
    const originalNormalizedKey = draw.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (!canonicalDrawNameMap.has(originalNormalizedKey)) {
      canonicalDrawNameMap.set(originalNormalizedKey, draw.name);
    }
  });
});


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

function _normalizeApiDrawNameForDocId(apiDrawName: string): string {
 return apiDrawName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") 
    .replace(/\s+/g, '_') 
    .replace(/[^\w-]/g, ''); 
}

export function constructLottoResultDocId(date: string, apiDrawName: string): string {
  // Ensure date is in YYYY-MM-DD format
  let formattedDate = date;
  try {
    const parsedInputDate = dateFnsParse(date, 'yyyy-MM-dd', new Date());
    if (!isValid(parsedInputDate)) {
        // Attempt to parse from PPP if not yyyy-MM-dd
        const pppParsedDate = dateFnsParse(date, 'PPP', new Date(), { locale: fr });
        if (isValid(pppParsedDate)) {
            formattedDate = format(pppParsedDate, 'yyyy-MM-dd');
        } else {
            throw new Error('Invalid date format for doc ID construction');
        }
    } // If already yyyy-MM-dd, it will pass through
  } catch (e) {
    // If date is already in yyyy-MM-dd, parse will still work or it's truly invalid
    const testValid = dateFnsParse(date, 'yyyy-MM-dd', new Date());
    if (!isValid(testValid)) {
        console.error("Date parsing failed for doc ID construction:", date, e);
        // Fallback or throw, for now, let's throw to signal critical issue
        throw new Error('Date is not in expected yyyy-MM-dd or PPP format for doc ID');
    }
  }


  const normalizedIdNamePart = _normalizeApiDrawNameForDocId(apiDrawName);
  return `${formattedDate}_${normalizedIdNamePart}`;
}


function _parseApiDate(apiDateString: string, contextYear: number): string | null {
  const dayMonthMatch = apiDateString.match(/(\d{2}\/\d{2})$/); 
  if (!dayMonthMatch || !dayMonthMatch[1]) {
    // console.warn("Could not extract DD/MM from API date string:", apiDateString);
    return null;
  }
  const dayMonth = dayMonthMatch[1]; 
  
  const parsedDate = dateFnsParse(`${dayMonth}/${contextYear}`, 'dd/MM/yyyy', new Date(contextYear, 0, 1));

  if (isValid(parsedDate)) {
    return format(parsedDate, 'yyyy-MM-dd'); 
  } else {
    // console.warn("Failed to parse date:", `${dayMonth}/${contextYear}`);
    return null;
  }
}


function _parseNumbersString(numbersStr: string | null | undefined): number[] {
  if (!numbersStr || typeof numbersStr !== 'string') {
    return [];
  }
  return (numbersStr.match(/\d+/g) || []).map(Number).slice(0, 5);
}

export interface FirestoreDrawDoc {
  docId?: string; // Added to store the document ID
  apiDrawName: string; 
  date: string; // YYYY-MM-DD
  winningNumbers: number[];
  machineNumbers: number[]; 
  fetchedAt: Timestamp;
}

const _saveDrawsToFirestore = async (draws: Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[]): Promise<void> => {
  if (!draws.length) return;
  const batch = writeBatch(db);
  draws.forEach(draw => {
    const docId = constructLottoResultDocId(draw.date, draw.apiDrawName);
    const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
    
    const dataToSave: Omit<FirestoreDrawDoc, 'docId'> = { 
      ...draw, 
      fetchedAt: serverTimestamp() as Timestamp // Let Firestore handle timestamp generation
    };
    batch.set(docRef, dataToSave, { merge: true }); // Use merge to prevent overwriting if doc exists but update is desired
  });
  try {
    await batch.commit();
    // console.log(`${draws.length} draws successfully saved to Firestore.`);
  } catch (error) {
    console.error("Error saving draws to Firestore:", error);
    // Potentially re-throw or handle more gracefully
  }
};

// Fetches data for a specific month (e.g., "2023-10") from the external API, parses it, and saves to Firestore.
async function _fetchAndParseMonthData(yearMonth: string): Promise<Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[]> {
  const url = `${API_BASE_URL}?month=${yearMonth}`;
  // console.log(`Fetching data from API: ${url}`);
  try {
    const response = await fetch(url, { headers: API_HEADERS });
    if (!response.ok) {
      // console.error(`API request failed with status ${response.status} for ${url}`);
      throw new Error(`API request failed with status ${response.status} for ${url}`);
    }
    const data = await response.json();

    if (!data.success || !data.drawsResultsWeekly) {
      // console.warn(`API response for ${yearMonth} was not successful or drawsResultsWeekly is missing.`);
      return [];
    }
    
    let contextYear: number;
    const currentMonthStrApi = data.currentMonth; // e.g., "OCTOBRE 2023"
    const yearMatch = currentMonthStrApi?.match(/\b(\d{4})\b/);
    if (yearMatch && yearMatch[1]) {
      contextYear = parseInt(yearMatch[1], 10);
    } else {
      // Fallback to parsing from yearMonth string if currentMonth is missing or malformed
      contextYear = parseInt(yearMonth.split('-')[0], 10);
      // console.warn(`Could not parse year from API's currentMonth string "${currentMonthStrApi}". Falling back to year from request: ${contextYear}`);
    }


    const parsedResults: Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[] = [];

    for (const week of data.drawsResultsWeekly) {
      for (const dailyResult of week.drawResultsDaily) {
        const apiDateStr = dailyResult.date; // e.g., "Lundi 25/09"
        const parsedDate = _parseApiDate(apiDateStr, contextYear); // Pass context year
        
        if (!parsedDate) {
          // console.warn(`Skipping daily result due to unparsable date: ${apiDateStr}`);
          continue;
        }

        if (dailyResult.drawResults && dailyResult.drawResults.standardDraws) {
          for (const draw of dailyResult.drawResults.standardDraws) {
            const apiDrawNameFromPayload = draw.drawName; // e.g., "REVEIL"

            if (!apiDrawNameFromPayload || typeof apiDrawNameFromPayload !== 'string') {
              // console.warn("Skipping draw due to missing or invalid drawName in API payload:", draw);
              continue;
            }
            
            // Normalize API draw name for lookup in our canonical map
            const normalizedApiNameToLookup = apiDrawNameFromPayload
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "") // Remove accents
              .toLowerCase()
              .trim();
            
            const resolvedCanonicalName = canonicalDrawNameMap.get(normalizedApiNameToLookup);

            if (!resolvedCanonicalName) {
              // console.warn(`Skipping draw with unrecognized API name "${apiDrawNameFromPayload}" (normalized: "${normalizedApiNameToLookup}")`);
              continue; // Skip if the draw name from API doesn't map to a known canonical name
            }
            
            // Skip if winning numbers are malformed (e.g., starts with '.')
            if (draw.winningNumbers && typeof draw.winningNumbers === 'string' && draw.winningNumbers.startsWith('.')) {
              // console.warn(`Skipping draw ${resolvedCanonicalName} on ${parsedDate} due to malformed winning numbers: ${draw.winningNumbers}`);
              continue;
            }

            const winningNumbers = _parseNumbersString(draw.winningNumbers);
            const machineNumbersParsed = _parseNumbersString(draw.machineNumbers);

            if (winningNumbers.length === 5) {
              parsedResults.push({
                apiDrawName: resolvedCanonicalName, // Use our canonical name
                date: parsedDate, // YYYY-MM-DD
                winningNumbers: winningNumbers,
                machineNumbers: machineNumbersParsed.length === 5 ? machineNumbersParsed : [], // Ensure machineNumbers is an array
              });
            } else {
              // console.warn(`Skipping draw ${resolvedCanonicalName} on ${parsedDate} due to incomplete winning numbers: ${winningNumbers.length} found.`);
            }
          }
        }
      }
    }
    // console.log(`Parsed ${parsedResults.length} results for month ${yearMonth}.`);
    if (parsedResults.length > 0) {
      await _saveDrawsToFirestore(parsedResults);
    }
    return parsedResults;
  } catch (error) {
    console.error(`Error fetching or parsing data for ${yearMonth} from API:`, error);
    return []; // Return empty array on error to allow other functions to proceed
  }
}

export const fetchDrawData = async (drawSlug: string): Promise<DrawResult> => {
  const canonicalDrawName = _getApiDrawNameFromSlug(drawSlug);
  if (!canonicalDrawName) {
    throw new Error(`Unknown draw slug: ${drawSlug}`);
  }

  // Try to fetch from Firestore first
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
      // console.log(`Fetched latest draw for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore.`);
      const drawDateObject = dateFnsParse(firestoreDoc.date, 'yyyy-MM-dd', new Date());
      return {
        date: isValid(drawDateObject) ? format(drawDateObject, 'PPP', { locale: fr }) : 'Date invalide',
        winningNumbers: firestoreDoc.winningNumbers,
        machineNumbers: firestoreDoc.machineNumbers,
      };
    }
  } catch (error) {
    console.error(`Error fetching latest draw for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore:`, error);
    // Proceed to API fetch if Firestore read fails
  }

  // If not in Firestore, fetch from API (current month and previous two months)
  // console.log(`No data in Firestore for ${canonicalDrawName} (slug: ${drawSlug}). Fetching from API...`);
  let attempts = 0;
  const MAX_API_ATTEMPTS = 3; // Check current month and previous two months
  let currentDateIter = new Date();
  let fetchedFromApiAndSaved = false;


  while (attempts < MAX_API_ATTEMPTS) {
    const yearMonth = format(currentDateIter, 'yyyy-MM');
    // console.log(`Attempt ${attempts + 1}/${MAX_API_ATTEMPTS}: Fetching API data for ${canonicalDrawName}, month ${yearMonth}`);
    await _fetchAndParseMonthData(yearMonth); // This function now saves to Firestore
    fetchedFromApiAndSaved = true; // Mark that we've attempted to fetch and save

    // After fetching and saving, try to get the specific draw from Firestore again
    try {
        const qCheck = query(
          collection(db, RESULTS_COLLECTION_NAME), 
          where("apiDrawName", "==", canonicalDrawName),
          // Filter by the month we just fetched for relevance
          where("date", ">=", format(new Date(currentDateIter.getFullYear(), currentDateIter.getMonth(), 1), 'yyyy-MM-dd')),
          where("date", "<=", format(new Date(currentDateIter.getFullYear(), currentDateIter.getMonth() + 1, 0), 'yyyy-MM-dd')), 
          orderBy("date", "desc"), 
          limit(1)
        );
        const checkSnapshot = await getDocs(qCheck);
        if (!checkSnapshot.empty) {
           const firestoreDoc = checkSnapshot.docs[0].data() as FirestoreDrawDoc;
           // console.log(`Found ${canonicalDrawName} in Firestore after fetching month ${yearMonth}.`);
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

  // If after all API attempts, we still haven't found it, one last check in Firestore
  if (fetchedFromApiAndSaved) {
    // console.log(`After ${MAX_API_ATTEMPTS} API fetch attempts, re-checking Firestore for ${canonicalDrawName}.`);
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
        // console.log(`Found ${canonicalDrawName} in Firestore on final check.`);
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
  
  // console.error(`No data found for draw ${canonicalDrawName} (slug: ${drawSlug}) after checking Firestore and API.`);
  throw new Error(`No data found for draw ${canonicalDrawName} (slug: ${drawSlug}) after checking Firestore and API.`);
};

export const fetchHistoricalData = async (drawSlug: string, count: number = 20): Promise<HistoricalDataEntry[]> => {
  const canonicalDrawName = _getApiDrawNameFromSlug(drawSlug);
  if (!canonicalDrawName) {
    // console.warn(`Unknown draw slug for historical data: ${drawSlug}`);
    return [];
  }

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
      // Add docId to the object
      firestoreResults.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc);
    });
    // console.log(`Fetched ${firestoreResults.length} historical entries for ${canonicalDrawName} from Firestore (requested ${count}).`);
  } catch (error) {
    console.error(`Error fetching historical data for ${canonicalDrawName} from Firestore:`, error);
    // Proceed to API fetch if Firestore read fails or returns insufficient data
  }

  // If Firestore has fewer results than requested, fetch more from API
  if (firestoreResults.length < count) {
    // console.log(`Firestore has ${firestoreResults.length} entries for ${canonicalDrawName}, need ${count}. Fetching more from API.`);
    const needed = count - firestoreResults.length;
    const estimatedDrawsPerMonthOfType = 5; // Rough estimate
    // Fetch at least one month, or more if many entries are needed. Cap at a reasonable number (e.g., 12 months) to avoid excessive API calls.
    let monthsToFetch = Math.min(12, Math.max(1, Math.ceil(needed / estimatedDrawsPerMonthOfType) )); 
    
    // Determine the starting month for API fetching.
    // If we have some results, start from the month before the oldest result.
    // Otherwise, start from the current month.
    let dateToFetch = firestoreResults.length > 0 
        ? subMonths(dateFnsParse(firestoreResults[firestoreResults.length - 1].date, 'yyyy-MM-dd', new Date()),1) 
        : new Date(); 

    // console.log(`Will attempt to fetch up to ${monthsToFetch} past months for ${canonicalDrawName}, starting from ${format(dateToFetch, 'yyyy-MM')}.`);

    for (let i = 0; i < monthsToFetch; i++) {
      const yearMonth = format(dateToFetch, 'yyyy-MM');
      // console.log(`Fetching historical data from API for ${canonicalDrawName}, month ${yearMonth}`);
      await _fetchAndParseMonthData(yearMonth); // This saves to Firestore
      dateToFetch = subMonths(dateToFetch, 1);
        // Simple delay to be polite to the API, especially if fetching many months
        if (i > 0 && i % 3 === 0) { // e.g., pause after every 3 months fetched
            // console.log("Pausing for 500ms during historical data fetch...");
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // After fetching from API, re-query Firestore to get the complete set of data
    try {
      // console.log(`Re-fetching historical data for ${canonicalDrawName} from Firestore after API sync.`);
      const q = query(
        collection(db, RESULTS_COLLECTION_NAME),
        where("apiDrawName", "==", canonicalDrawName),
        orderBy("date", "desc"),
        limit(count) // Limit to the originally requested count
      );
      const querySnapshot = await getDocs(q);
      firestoreResults = []; // Reset and populate with fresh data
      querySnapshot.forEach(doc => {
        firestoreResults.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc);
      });
      // console.log(`Fetched ${firestoreResults.length} historical entries for ${canonicalDrawName} from Firestore after API sync.`);
    } catch (error) {
      console.error(`Error re-fetching historical data for ${canonicalDrawName} from Firestore after API sync:`, error);
    }
  }
  
  // Transform Firestore documents to HistoricalDataEntry format
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
  const historicalData = data || await fetchHistoricalData(drawSlug, 50); // Default to 50 for stats
  
  if (historicalData.length === 0) {
    // console.warn(`No historical data to calculate frequency for ${drawSlug}`);
    return [];
  }

  const allNumbers = historicalData.flatMap(entry => {
    const nums = [...entry.winningNumbers];
    if (entry.machineNumbers && entry.machineNumbers.length > 0) { // Ensure machineNumbers exists and is not empty
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
    .sort((a, b) => b.frequency - a.frequency || a.number - b.number); // Sort by frequency then number
};

export async function fetchNumberCoOccurrence(drawSlug: string, selectedNumber: number, data?: HistoricalDataEntry[]): Promise<NumberCoOccurrence> {
  const historicalData = data || await fetchHistoricalData(drawSlug, 50); // Default to 50 for co-occurrence stats

  if (historicalData.length === 0) {
    // console.warn(`No historical data to calculate co-occurrence for ${drawSlug}, number ${selectedNumber}`);
    return { selectedNumber, coOccurrences: [] };
  }

  const coOccurrenceMap: Record<number, number> = {};

  historicalData.forEach(entry => {
    const combinedNumbers = [...entry.winningNumbers];
    if (entry.machineNumbers && entry.machineNumbers.length > 0) { // Ensure machineNumbers exists
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
    .sort((a, b) => b.count - a.count || a.number - b.number) // Sort by count then number
    .slice(0, 10); // Take top 10 co-occurring numbers

  return { selectedNumber, coOccurrences };
};

/**
 * Fetches a specified number of recent lottery results from Firestore, across all draw types.
 * Includes the document ID for each result.
 * @param count The number of recent results to fetch.
 * @returns A promise that resolves to an array of FirestoreDrawDoc.
 */
export const fetchRecentLottoResults = async (count: number = 20): Promise<FirestoreDrawDoc[]> => {
  try {
    const q = query(
      collection(db, RESULTS_COLLECTION_NAME),
      orderBy("date", "desc"), // Primary sort by date
      orderBy("fetchedAt", "desc"), // Secondary sort for draws on the same date
      limit(count)
    );
    const querySnapshot = await getDocs(q);
    const results: FirestoreDrawDoc[] = [];
    querySnapshot.forEach(doc => {
      results.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc); // Include doc.id
    });
    // console.log(`Fetched ${results.length} recent lotto results from Firestore.`);
    return results;
  } catch (error) {
    console.error("Error fetching recent lotto results from Firestore:", error);
    return []; // Return empty array on error
  }
};

/**
 * Deletes a lottery result document from Firestore by its ID.
 * @param docId The ID of the document to delete.
 * @returns A promise that resolves when the deletion is complete.
 */
export const deleteLottoResult = async (docId: string): Promise<void> => {
  if (!docId) {
    console.error("Attempted to delete lotto result with undefined docId.");
    throw new Error("Document ID is required for deletion.");
  }
  try {
    const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
    await deleteDoc(docRef);
    // console.log(`Lotto result with ID ${docId} successfully deleted from Firestore.`);
  } catch (error) {
    console.error(`Error deleting lotto result with ID ${docId} from Firestore:`, error);
    throw error; // Re-throw the error to be handled by the caller
  }
};
