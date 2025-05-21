
      
import type { DrawResult, HistoricalDataEntry, NumberFrequency, NumberCoOccurrence, FirestoreDrawDoc, ManualLottoResultInput } from '@/types/loto';
import { DRAW_SCHEDULE, ALL_DRAW_NAMES_MAP, DRAW_SLUG_BY_SIMPLE_NAME_MAP } from '@/lib/lotoDraws.tsx';
import { format, subMonths, parse as dateFnsParse, isValid, getYear, parseISO } from 'date-fns';
import fr from 'date-fns/locale/fr';
import { auth, db } from '@/lib/firebase'; // Ensure auth is imported
import {
  collection,
  doc,
  setDoc,
  getDoc, // Import getDoc
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
    // Ensure original name (if different after normalization) also maps
    const originalNormalizedKey = draw.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (originalNormalizedKey !== normalizedKey && !canonicalDrawNameMap.has(originalNormalizedKey)) {
      canonicalDrawNameMap.set(originalNormalizedKey, draw.name); // Map to the same canonical name
    }
  });
});


export function getApiDrawNameFromSlug(drawSlug: string): string | undefined {
  for (const daySchedule of DRAW_SCHEDULE) {
    for (const draw of daySchedule.draws) {
      if (draw.slug === drawSlug) {
        const normalizedScheduleName = draw.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        return canonicalDrawNameMap.get(normalizedScheduleName) || draw.name;
      }
    }
  }
  return undefined;
}

function normalizeApiDrawNameForDocId(apiDrawName: string): string {
 return apiDrawName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/[^\w-]/g, ''); // Remove any non-alphanumeric characters except underscore and hyphen
}

export function constructLottoResultDocId(date: string, apiDrawName: string): string {
  // Expects date in 'yyyy-MM-dd' format or a format parseable to it
  let formattedDate = date; // Initialize with the input
  try {
    // Check if already yyyy-MM-dd
    const isoDateCheck = dateFnsParse(date, 'yyyy-MM-dd', new Date());
    if (!isValid(isoDateCheck) || format(isoDateCheck, 'yyyy-MM-dd') !== date) {
        // Try parsing from PPP if not yyyy-MM-dd
        const pppParsedDate = dateFnsParse(date, 'PPP', new Date(), { locale: fr });
        if (isValid(pppParsedDate)) {
            formattedDate = format(pppParsedDate, 'yyyy-MM-dd');
        } else {
            // Fallback: try to parse as ISO string (e.g., from Date.toISOString())
            const genericParsedDate = parseISO(date); // Handles '2024-07-27T10:00:00.000Z' or '2024-07-27'
            if(isValid(genericParsedDate)) {
                formattedDate = format(genericParsedDate, 'yyyy-MM-dd');
            }
            // If still not valid, formattedDate remains the original 'date' input
            // which might be problematic if it's not 'yyyy-MM-dd'.
        }
    }
  } catch (e) {
    // console.warn("Date parsing for doc ID failed for:", date, ". Using original value.");
  }

  const normalizedIdNamePart = normalizeApiDrawNameForDocId(apiDrawName);
  return `${formattedDate}_${normalizedIdNamePart}`;
}


function parseApiDate(apiDateString: string, contextYear: number): string | null {
  const dayMonthMatch = apiDateString.match(/(\d{2}\/\d{2})$/); 
  if (!dayMonthMatch || !dayMonthMatch[1]) {
    // console.warn(`Could not extract day/month from API date string: ${apiDateString}`);
    return null;
  }
  const dayMonth = dayMonthMatch[1]; // e.g., "25/07"

  // Ensure contextYear is a valid number
  if (isNaN(contextYear) || contextYear < 1900 || contextYear > 2100) {
    // console.warn(`Invalid context year for API date parsing: ${contextYear}`);
    return null;
  }
  
  const parsedDate = dateFnsParse(`${dayMonth}/${contextYear}`, 'dd/MM/yyyy', new Date(contextYear, 0, 1));

  if (isValid(parsedDate)) {
    return format(parsedDate, 'yyyy-MM-dd');
  } else {
    // console.warn(`Failed to parse API date: ${dayMonth}/${contextYear}`);
    return null;
  }
}


function parseNumbersString(numbersStr: string | null | undefined): number[] {
  if (!numbersStr || typeof numbersStr !== 'string') {
    return [];
  }
  return (numbersStr.match(/\d+/g) || []).map(Number).slice(0, 5);
}


async function _saveDrawsToFirestore(draws: Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[]): Promise<void> {
  if (!draws.length) return;
  const batch = writeBatch(db);
  const currentUser = auth.currentUser; 

  for (const draw of draws) {
    const docId = constructLottoResultDocId(draw.date, draw.apiDrawName);
    const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);

    const dataToSave: Omit<FirestoreDrawDoc, 'docId'> = {
      ...draw,
      fetchedAt: serverTimestamp() as Timestamp,
      machineNumbers: draw.machineNumbers || [], 
    };

    if (currentUser) {
      batch.set(docRef, dataToSave, { merge: true });
    } else {
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        batch.set(docRef, dataToSave); 
      }
    }
  }

  try {
    await batch.commit();
    // console.log(`${draws.length} draws processed for Firestore saving.`);
  } catch (error) {
    console.error("Error saving draws to Firestore:", error);
  }
}

async function _fetchAndParseMonthData(yearMonth: string): Promise<Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[]> {
  const url = `${API_BASE_URL}?month=${yearMonth}`;
  try {
    const response = await fetch(url, { 
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://lotobonheur.ci/resultats',
      } 
    });
    if (!response.ok) {
      // console.warn(`API request failed for ${yearMonth} with status: ${response.status}`);
      return [];
    }
    const data = await response.json();

    if (!data.success || !data.drawsResultsWeekly) {
      // console.warn(`API response not successful or missing drawsResultsWeekly for ${yearMonth}`);
      return [];
    }

    let contextYear: number;
    const currentMonthStrApi = data.currentMonth; 
    const yearMatch = currentMonthStrApi?.match(/\b(\d{4})\b/);
    if (yearMatch && yearMatch[1]) {
      contextYear = parseInt(yearMatch[1], 10);
    } else {
      // Fallback to year from yearMonth string if API doesn't provide currentMonth or year
      contextYear = parseInt(yearMonth.split('-')[0], 10);
      if (isNaN(contextYear)) {
        // console.warn(`Could not determine context year for ${yearMonth}. Using current year as last resort.`);
        contextYear = getYear(new Date()); // Last resort
      }
    }


    const parsedResults: Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[] = [];

    for (const week of data.drawsResultsWeekly) {
      for (const dailyResult of week.drawResultsDaily) {
        const apiDateStr = dailyResult.date; 
        const parsedDate = parseApiDate(apiDateStr, contextYear);

        if (!parsedDate) {
          // console.warn(`Skipping daily result due to unparseable date: ${apiDateStr}`);
          continue;
        }

        if (dailyResult.drawResults && dailyResult.drawResults.standardDraws) {
          for (const draw of dailyResult.drawResults.standardDraws) {
            const apiDrawNameFromPayload = draw.drawName; 

            if (!apiDrawNameFromPayload || typeof apiDrawNameFromPayload !== 'string') {
                // console.warn(`Skipping draw due to missing or invalid drawName:`, draw);
                continue;
            }

            const normalizedApiNameToLookup = apiDrawNameFromPayload
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .trim();

            const resolvedCanonicalName = canonicalDrawNameMap.get(normalizedApiNameToLookup);

            if (!resolvedCanonicalName) {
              // console.warn(`Skipping draw, unrecognized API draw name: "${apiDrawNameFromPayload}" (normalized: "${normalizedApiNameToLookup}")`);
              continue;
            }

            // Skip draws with malformed winning numbers (e.g., starting with '.')
            if (draw.winningNumbers && typeof draw.winningNumbers === 'string' && draw.winningNumbers.startsWith('.')) {
              // console.warn(`Skipping draw "${resolvedCanonicalName}" on ${parsedDate} due to malformed winning numbers: ${draw.winningNumbers}`);
              continue;
            }

            const winningNumbers = parseNumbersString(draw.winningNumbers);
            const machineNumbersParsed = parseNumbersString(draw.machineNumbers);

            if (winningNumbers.length === 5) {
              parsedResults.push({
                apiDrawName: resolvedCanonicalName, 
                date: parsedDate, // Should be YYYY-MM-DD
                winningNumbers: winningNumbers,
                machineNumbers: machineNumbersParsed.length === 5 ? machineNumbersParsed : [], 
              });
            } else {
              // console.warn(`Skipping draw "${resolvedCanonicalName}" on ${parsedDate} due to incomplete winning numbers: ${winningNumbers.length} found.`);
            }
          }
        }
      }
    }
    
    // Deduplicate results for the current month's API call before saving
    const uniqueResultsForMonthMap = new Map<string, Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>>();
    parsedResults.forEach(r => {
        const docId = constructLottoResultDocId(r.date, r.apiDrawName);
        if (!uniqueResultsForMonthMap.has(docId)) {
            uniqueResultsForMonthMap.set(docId, r);
        }
    });
    const uniqueResultsForMonth = Array.from(uniqueResultsForMonthMap.values());

    if (uniqueResultsForMonth.length > 0) {
      await _saveDrawsToFirestore(uniqueResultsForMonth);
    }
    return uniqueResultsForMonth;
  } catch (error) {
    console.error(`Error fetching or parsing data for ${yearMonth} from API:`, error);
    return [];
  }
}

export const fetchDrawData = async (drawSlug: string): Promise<DrawResult[]> => {
  const canonicalDrawName = getApiDrawNameFromSlug(drawSlug);
  if (!canonicalDrawName) {
    throw new Error(`Unknown draw slug: ${drawSlug}`);
  }

  const fetchLimit = 3; // Fetch 3 most recent results
  let results: DrawResult[] = [];

  try {
    const q = query(
      collection(db, RESULTS_COLLECTION_NAME),
      where("apiDrawName", "==", canonicalDrawName),
      orderBy("date", "desc"),
      limit(fetchLimit)
    );
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(doc => {
        const firestoreDoc = doc.data() as FirestoreDrawDoc;
        const drawDateObject = dateFnsParse(firestoreDoc.date, 'yyyy-MM-dd', new Date());
        results.push({
            date: isValid(drawDateObject) ? format(drawDateObject, 'PPP', { locale: fr }) : 'Date invalide',
            winningNumbers: firestoreDoc.winningNumbers,
            machineNumbers: firestoreDoc.machineNumbers && firestoreDoc.machineNumbers.length > 0 ? firestoreDoc.machineNumbers : undefined,
        });
    });

    if (results.length >= fetchLimit) {
      return results; 
    }
  } catch (error) {
    console.error(`Error fetching latest draws for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore:`, error);
  }

  // If not enough results from Firestore, try fetching from API
  let attempts = 0;
  const MAX_API_ATTEMPTS = 3; // Check current month and two previous months
  let currentDateIter = new Date();
  let fetchedFromApiAndSaved = false;


  while (attempts < MAX_API_ATTEMPTS && results.length < fetchLimit) {
    const yearMonth = format(currentDateIter, 'yyyy-MM');
    const monthDataFromApi = await _fetchAndParseMonthData(yearMonth); 
    if (monthDataFromApi.length > 0) {
        fetchedFromApiAndSaved = true;
    }
    currentDateIter = subMonths(currentDateIter, 1);
    attempts++;
  }

  // If API was called, re-query Firestore to get the potentially new data
  if (fetchedFromApiAndSaved || results.length < fetchLimit) {
    try {
      results = []; // Reset results to get fresh data from Firestore
      const q = query(
        collection(db, RESULTS_COLLECTION_NAME),
        where("apiDrawName", "==", canonicalDrawName),
        orderBy("date", "desc"),
        limit(fetchLimit)
      );
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach(doc => {
        const firestoreDoc = doc.data() as FirestoreDrawDoc;
        const drawDateObject = dateFnsParse(firestoreDoc.date, 'yyyy-MM-dd', new Date());
        results.push({
            date: isValid(drawDateObject) ? format(drawDateObject, 'PPP', { locale: fr }) : 'Date invalide',
            winningNumbers: firestoreDoc.winningNumbers,
            machineNumbers: firestoreDoc.machineNumbers && firestoreDoc.machineNumbers.length > 0 ? firestoreDoc.machineNumbers : undefined,
        });
      });
    } catch (error) {
      console.error(`Error fetching latest draws for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore after API sync:`, error);
    }
  }
  
  if (results.length > 0) {
    return results;
  }

  // If still no results, throw an error.
  throw new Error(`No data found for draw ${canonicalDrawName} (slug: ${drawSlug}) after checking Firestore and API.`);
};

export const fetchHistoricalData = async (drawSlug: string, count: number = 20): Promise<HistoricalDataEntry[]> => {
  const canonicalDrawName = getApiDrawNameFromSlug(drawSlug);
  if (!canonicalDrawName) {
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
      firestoreResults.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc);
    });
  } catch (error) {
    console.error(`Error fetching historical data for ${canonicalDrawName} from Firestore:`, error);
  }

  // If not enough results from Firestore, try fetching older months from API
  if (firestoreResults.length < count) {
    const needed = count - firestoreResults.length;
    // Estimate draws per month for this specific draw type to decide how many past months to check
    // This is a rough estimate; actual number of draws varies.
    const estimatedDrawsPerMonthOfType = 4; // Assuming roughly one draw per week for a specific type
    let monthsToFetch = Math.min(12, Math.max(1, Math.ceil(needed / estimatedDrawsPerMonthOfType) + 2 )); // Fetch a bit more to be safe, max 12 months

    let dateToFetch = firestoreResults.length > 0 && firestoreResults[firestoreResults.length - 1]?.date
        ? subMonths(dateFnsParse(firestoreResults[firestoreResults.length - 1].date, 'yyyy-MM-dd', new Date()),1)
        : subMonths(new Date(), 1); // Start from last month if no data, or month before last known data

    for (let i = 0; i < monthsToFetch; i++) {
      const yearMonth = format(dateToFetch, 'yyyy-MM');
      // console.log(`Fetching API data for ${canonicalDrawName}, month: ${yearMonth}`);
      await _fetchAndParseMonthData(yearMonth); // Fetches, de-duplicates for the month, and saves all draws for that month
      dateToFetch = subMonths(dateToFetch, 1);
        if (i > 0 && i % 3 === 0) { // Small delay to avoid rapid-fire API calls if fetching many months
            await new Promise(resolve => setTimeout(resolve, 500)); 
        }
    }

    // After API sync, re-query Firestore to get the updated set of historical data
    try {
      const q = query(
        collection(db, RESULTS_COLLECTION_NAME),
        where("apiDrawName", "==", canonicalDrawName),
        orderBy("date", "desc"),
        limit(count) // Still limit to the originally requested count
      );
      const querySnapshotAfterSync = await getDocs(q); 
      firestoreResults = []; // Reset to ensure we only have data from this fresh query
      querySnapshotAfterSync.forEach(doc => { 
        firestoreResults.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc);
      });
    } catch (error) {
      console.error(`Error re-fetching historical data for ${canonicalDrawName} from Firestore after API sync:`, error);
    }
  }

  // Final deduplication of results obtained from Firestore
  // This ensures that if any subtle inconsistencies led to multiple Firestore docs for the same logical draw, they are handled.
  const uniqueDrawsMap = new Map<string, FirestoreDrawDoc>();
  firestoreResults.forEach(result => {
    const keyDate = result.date.trim(); // Date should be YYYY-MM-DD
    const keyName = result.apiDrawName.trim().toLowerCase(); // Normalize name for key
    const uniqueKey = `${keyDate}_${keyName}`;
    if (!uniqueDrawsMap.has(uniqueKey)) {
      uniqueDrawsMap.set(uniqueKey, result);
    }
  });

  // Sort again because Map iteration order is based on insertion order.
  const trulyUniqueFirestoreResults = Array.from(uniqueDrawsMap.values())
                                      .sort((a, b) => b.date.localeCompare(a.date)); // Sort by date desc

  return trulyUniqueFirestoreResults.slice(0, count).map(entry => {
    const entryDateObj = dateFnsParse(entry.date, 'yyyy-MM-dd', new Date());
    return {
      drawName: drawSlug, 
      date: isValid(entryDateObj) ? format(entryDateObj, 'PPP', { locale: fr }) : 'Date invalide',
      winningNumbers: entry.winningNumbers,
      machineNumbers: entry.machineNumbers && entry.machineNumbers.length > 0 ? entry.machineNumbers : undefined,
    };
  });
};


export async function fetchNumberFrequency(drawSlug: string, data?: HistoricalDataEntry[]): Promise<NumberFrequency[]> {
  const historicalData = data || await fetchHistoricalData(drawSlug, 50); 

  if (historicalData.length === 0) {
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
    .sort((a, b) => b.frequency - a.frequency || a.number - b.number); 
};

export async function fetchNumberCoOccurrence(drawSlug: string, selectedNumber: number, data?: HistoricalDataEntry[]): Promise<NumberCoOccurrence> {
  const historicalData = data || await fetchHistoricalData(drawSlug, 50); 

  if (historicalData.length === 0) {
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

  const coOccurrences = Object.entries(coOccurrenceMap)
    .map(([numStr, count]) => ({ number: parseInt(numStr), count }))
    .sort((a, b) => b.count - a.count || a.number - b.number) 
    .slice(0, 10); 

  return { selectedNumber, coOccurrences };
};

export const fetchRecentLottoResults = async (count: number = 20): Promise<FirestoreDrawDoc[]> => {
  try {
    const q = query(
      collection(db, RESULTS_COLLECTION_NAME),
      orderBy("date", "desc"), 
      orderBy("fetchedAt", "desc"), 
      limit(count)
    );
    const querySnapshot = await getDocs(q);
    const results: FirestoreDrawDoc[] = [];
    querySnapshot.forEach(doc => {
      results.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc);
    });
    return results;
  } catch (error) {
    console.error("Error fetching recent lotto results from Firestore:", error);
    return [];
  }
};

export const fetchAllLottoResultsForExport = async (): Promise<FirestoreDrawDoc[]> => {
  try {
    const q = query(
      collection(db, RESULTS_COLLECTION_NAME),
      orderBy("date", "desc")
    );
    const querySnapshot = await getDocs(q);
    const results: FirestoreDrawDoc[] = [];
    querySnapshot.forEach(doc => {
      results.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc);
    });
    return results;
  } catch (error) {
    console.error("Error fetching all lotto results for export from Firestore:", error);
    return [];
  }
};


export const deleteLottoResult = async (docId: string): Promise<void> => {
  if (!docId) {
    console.error("Attempted to delete lotto result with undefined docId.");
    throw new Error("Document ID is required for deletion.");
  }
  try {
    const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error(`Error deleting lotto result with ID ${docId} from Firestore:`, error);
    throw error; 
  }
};

export async function addManualLottoResult(input: ManualLottoResultInput): Promise<void> {
  const canonicalDrawName = getApiDrawNameFromSlug(input.drawSlug);
  if (!canonicalDrawName) {
    throw new Error(`Slug de tirage invalide: ${input.drawSlug}`);
  }

  const formattedDate = format(input.date, 'yyyy-MM-dd'); 
  const docId = constructLottoResultDocId(formattedDate, canonicalDrawName);

  const dataToSave: Omit<FirestoreDrawDoc, 'docId'> = {
    apiDrawName: canonicalDrawName,
    date: formattedDate,
    winningNumbers: input.winningNumbers,
    machineNumbers: input.machineNumbers || [], 
    fetchedAt: serverTimestamp() as Timestamp, 
  };

  const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    throw new Error(`Un résultat pour le tirage "${ALL_DRAW_NAMES_MAP[input.drawSlug] || canonicalDrawName}" à la date du ${format(input.date, 'PPP', {locale: fr})} existe déjà (ID: ${docId}).`);
  }

  await setDoc(docRef, dataToSave);
}

    