
import type { DrawResult, HistoricalDataEntry, NumberFrequency, NumberCoOccurrence, FirestoreDrawDoc, ManualLottoResultInput } from '@/types/loto';
import { DRAW_SCHEDULE, ALL_DRAW_NAMES_MAP, DRAW_SLUG_BY_SIMPLE_NAME_MAP } from '@/lib/lotoDraws.tsx';
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
  let formattedDate = date;
  try {
    // Check if already yyyy-MM-dd
    const isoDateCheck = dateFnsParse(date, 'yyyy-MM-dd', new Date());
    if (!isValid(isoDateCheck) || format(isoDateCheck, 'yyyy-MM-dd') !== date) {
        // If not, try parsing from PPP
        const pppParsedDate = dateFnsParse(date, 'PPP', new Date(), { locale: fr });
        if (isValid(pppParsedDate)) {
            formattedDate = format(pppParsedDate, 'yyyy-MM-dd');
        } else {
            // console.warn('Date format for doc ID construction is not yyyy-MM-dd or PPP:', date);
            // Fallback to trying ISO parse if original wasn't yyyy-MM-dd and PPP failed
            const genericParsedDate = parseISO(date);
            if(isValid(genericParsedDate)) {
                formattedDate = format(genericParsedDate, 'yyyy-MM-dd');
            } else {
                // console.warn('Final fallback date parsing failed for doc ID construction:', date);
            }
        }
    }
  } catch (e) {
    // console.error("Date parsing failed for doc ID construction:", date, e);
  }

  const normalizedIdNamePart = normalizeApiDrawNameForDocId(apiDrawName);
  return `${formattedDate}_${normalizedIdNamePart}`;
}


function parseApiDate(apiDateString: string, contextYear: number): string | null {
  // Expects format "Jour JJ/MM" e.g. "Lun. 20/05"
  const dayMonthMatch = apiDateString.match(/(\d{2}\/\d{2})$/); // Extracts "JJ/MM"
  if (!dayMonthMatch || !dayMonthMatch[1]) {
    // console.warn("Could not extract JJ/MM from API date string:", apiDateString);
    return null;
  }
  const dayMonth = dayMonthMatch[1]; // "JJ/MM"

  // Use the provided contextYear for parsing
  const parsedDate = dateFnsParse(`${dayMonth}/${contextYear}`, 'dd/MM/yyyy', new Date(contextYear, 0, 1)); // Use a fixed date for reference to avoid month/year overflow issues

  if (isValid(parsedDate)) {
    return format(parsedDate, 'yyyy-MM-dd');
  } else {
    // console.warn("Failed to parse API date:", `${dayMonth}/${contextYear}`);
    return null;
  }
}


function parseNumbersString(numbersStr: string | null | undefined): number[] {
  if (!numbersStr || typeof numbersStr !== 'string') {
    return [];
  }
  // Matches sequences of digits, handles various separators like '-', ',', ' ', or none.
  return (numbersStr.match(/\d+/g) || []).map(Number).slice(0, 5);
}


async function _saveDrawsToFirestore(draws: Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[]): Promise<void> {
  if (!draws.length) return;
  const batch = writeBatch(db);
  draws.forEach(draw => {
    const docId = constructLottoResultDocId(draw.date, draw.apiDrawName);
    const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);

    // Ensure machineNumbers is always an array, even if empty
    const dataToSave: Omit<FirestoreDrawDoc, 'docId'> = {
      ...draw,
      fetchedAt: serverTimestamp() as Timestamp,
      machineNumbers: draw.machineNumbers || [], // Ensure it's an array
    };
    batch.set(docRef, dataToSave, { merge: true }); // merge: true to update if exists, or create
  });
  try {
    await batch.commit();
    // console.log(`${draws.length} draws saved/updated in Firestore.`);
  } catch (error) {
    console.error("Error saving draws to Firestore:", error);
    // Potentially re-throw or handle as per application's error strategy
  }
};

async function _fetchAndParseMonthData(yearMonth: string): Promise<Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[]> {
  const url = `${API_BASE_URL}?month=${yearMonth}`;
  // console.log(`Fetching API data for month: ${yearMonth} from URL: ${url}`);
  try {
    const response = await fetch(url, { headers: API_HEADERS });
    if (!response.ok) {
      // console.warn(`API request failed for ${yearMonth} with status: ${response.status}`);
      return [];
    }
    const data = await response.json();

    if (!data.success || !data.drawsResultsWeekly) {
      // console.warn(`API response not successful or missing drawsResultsWeekly for ${yearMonth}:`, data);
      return [];
    }

    let contextYear: number;
    // Try to get year from currentMonth field (e.g., "Mai 2024")
    const currentMonthStrApi = data.currentMonth; // e.g., "Mai 2024" or "Juin 2023"
    const yearMatch = currentMonthStrApi?.match(/\b(\d{4})\b/);
    if (yearMatch && yearMatch[1]) {
      contextYear = parseInt(yearMatch[1], 10);
    } else {
      // Fallback to year from yearMonth string if currentMonth is not as expected
      contextYear = parseInt(yearMonth.split('-')[0], 10);
      // console.warn(`Could not parse year from API's currentMonth field "${currentMonthStrApi}", defaulting to year from request: ${contextYear}`);
    }


    const parsedResults: Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[] = [];

    for (const week of data.drawsResultsWeekly) {
      for (const dailyResult of week.drawResultsDaily) {
        const apiDateStr = dailyResult.date; // e.g., "Lun. 20/05"
        const parsedDate = parseApiDate(apiDateStr, contextYear);

        if (!parsedDate) {
          // console.warn(`Skipping daily result due to unparsable date: ${apiDateStr}`);
          continue;
        }

        if (dailyResult.drawResults && dailyResult.drawResults.standardDraws) {
          for (const draw of dailyResult.drawResults.standardDraws) {
            const apiDrawNameFromPayload = draw.drawName; // e.g., "REVEIL" or "ETOILE"

            if (!apiDrawNameFromPayload || typeof apiDrawNameFromPayload !== 'string') {
                // console.warn("Skipping draw due to missing or invalid drawName:", draw);
                continue;
            }

            // Normalize the draw name from API before looking up in our canonical map
            const normalizedApiNameToLookup = apiDrawNameFromPayload
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .trim();

            const resolvedCanonicalName = canonicalDrawNameMap.get(normalizedApiNameToLookup);

            if (!resolvedCanonicalName) {
              // console.warn(`Skipping draw with unrecognized normalized name: "${normalizedApiNameToLookup}" (Original: "${apiDrawNameFromPayload}")`);
              continue;
            }

            // Skip if winning numbers start with a '.', indicating no result
            if (draw.winningNumbers && typeof draw.winningNumbers === 'string' && draw.winningNumbers.startsWith('.')) {
              // console.log(`Skipping draw ${resolvedCanonicalName} on ${parsedDate} due to placeholder winning numbers.`);
              continue;
            }

            const winningNumbers = parseNumbersString(draw.winningNumbers);
            const machineNumbersParsed = parseNumbersString(draw.machineNumbers);

            if (winningNumbers.length === 5) {
              parsedResults.push({
                apiDrawName: resolvedCanonicalName, // Use the canonical name
                date: parsedDate,
                winningNumbers: winningNumbers,
                machineNumbers: machineNumbersParsed.length === 5 ? machineNumbersParsed : [], // Store empty array if not 5
              });
            } else {
              // console.warn(`Skipping draw ${resolvedCanonicalName} on ${parsedDate} due to incomplete winning numbers:`, winningNumbers);
            }
          }
        }
      }
    }
    
    // Deduplicate parsedResults for this month's fetch before saving
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

  const fetchLimit = 3;
  let results: DrawResult[] = [];

  // 1. Try to fetch from Firestore first
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
      return results; // Found enough in Firestore
    }
  } catch (error) {
    console.error(`Error fetching latest draws for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore:`, error);
    // Continue to API fetch if Firestore fails or has insufficient data
  }

  // 2. If not enough data in Firestore, try fetching from API for recent months
  let attempts = 0;
  const MAX_API_ATTEMPTS = 3; // Check current month + 2 previous months
  let currentDateIter = new Date();
  let fetchedFromApiAndSaved = false;

  // Determine how many more results are needed
  // const neededFromApi = fetchLimit - results.length;

  while (attempts < MAX_API_ATTEMPTS && results.length < fetchLimit) {
    const yearMonth = format(currentDateIter, 'yyyy-MM');
    // console.log(`Attempting API fetch for ${canonicalDrawName}, month: ${yearMonth}, needed: ${fetchLimit - results.length}`);
    const monthDataFromApi = await _fetchAndParseMonthData(yearMonth); // This function now saves to Firestore
    if (monthDataFromApi.length > 0) {
        fetchedFromApiAndSaved = true;
        // No need to directly use monthDataFromApi here, rely on subsequent Firestore query
    }
    currentDateIter = subMonths(currentDateIter, 1);
    attempts++;
  }

  // 3. After API sync (if any), query Firestore again to get the latest consolidated data
  if (fetchedFromApiAndSaved || results.length < fetchLimit) {
    // console.log(`Re-querying Firestore for ${canonicalDrawName} after API sync or if initial fetch was insufficient.`);
    try {
      results = []; // Clear previous results to get fresh data from Firestore
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

  throw new Error(`No data found for draw ${canonicalDrawName} (slug: ${drawSlug}) after checking Firestore and API (checked ${MAX_API_ATTEMPTS} months).`);
};

export const fetchHistoricalData = async (drawSlug: string, count: number = 20): Promise<HistoricalDataEntry[]> => {
  const canonicalDrawName = getApiDrawNameFromSlug(drawSlug);
  if (!canonicalDrawName) {
    // console.warn(`fetchHistoricalData: Unknown draw slug: ${drawSlug}`);
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
    // console.log(`fetchHistoricalData: Fetched ${firestoreResults.length} initial results from Firestore for ${canonicalDrawName}.`);
  } catch (error) {
    console.error(`Error fetching historical data for ${canonicalDrawName} from Firestore:`, error);
  }

  // If Firestore has fewer than 'count' results, try fetching older data from API
  if (firestoreResults.length < count) {
    // console.log(`fetchHistoricalData: Firestore has ${firestoreResults.length}/${count} for ${canonicalDrawName}. Fetching more from API.`);
    const needed = count - firestoreResults.length;
    const estimatedDrawsPerMonthOfType = 4; // Estimate ~4 draws of a specific type per month
    let monthsToFetch = Math.min(12, Math.max(1, Math.ceil(needed / estimatedDrawsPerMonthOfType) + 2 )); // Fetch a bit more to be safe

    let dateToFetch = firestoreResults.length > 0 && firestoreResults[firestoreResults.length - 1]?.date
        ? subMonths(dateFnsParse(firestoreResults[firestoreResults.length - 1].date, 'yyyy-MM-dd', new Date()),1)
        : subMonths(new Date(), 1); // Start from the month before the oldest fetched, or last month

    for (let i = 0; i < monthsToFetch; i++) {
      const yearMonth = format(dateToFetch, 'yyyy-MM');
      // console.log(`fetchHistoricalData: Fetching API for ${canonicalDrawName}, month: ${yearMonth}`);
      await _fetchAndParseMonthData(yearMonth); // This saves to Firestore
      dateToFetch = subMonths(dateToFetch, 1);
        // Optional: add a small delay to avoid overwhelming the API, though less critical with few months
        if (i > 0 && i % 3 === 0) { // e.g., pause every 3 months
            // console.log("Pausing briefly during multi-month API fetch...");
            await new Promise(resolve => setTimeout(resolve, 500)); // 500ms pause
        }
    }

    // After API sync, re-query Firestore to get the updated full list up to 'count'
    // console.log(`fetchHistoricalData: Re-querying Firestore for ${canonicalDrawName} after API sync.`);
    try {
      const q = query(
        collection(db, RESULTS_COLLECTION_NAME),
        where("apiDrawName", "==", canonicalDrawName),
        orderBy("date", "desc"),
        limit(count)
      );
      const querySnapshotAfterSync = await getDocs(q); // Renamed to avoid confusion
      firestoreResults = []; // Reset and populate with fresh data
      querySnapshotAfterSync.forEach(doc => { // Use the new snapshot
        firestoreResults.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc);
      });
      // console.log(`fetchHistoricalData: Fetched ${firestoreResults.length} results from Firestore for ${canonicalDrawName} after sync.`);
    } catch (error) {
      console.error(`Error re-fetching historical data for ${canonicalDrawName} from Firestore after API sync:`, error);
    }
  }

  // Deduplicate firestoreResults by docId before mapping and returning
  const uniqueFirestoreResultsMap = new Map<string, FirestoreDrawDoc>();
  firestoreResults.forEach(result => {
    if (result.docId && !uniqueFirestoreResultsMap.has(result.docId)) {
      uniqueFirestoreResultsMap.set(result.docId, result);
    } else if (!result.docId) {
      // This case should ideally not happen if data is always fetched/saved with docId
      // For safety, create a synthetic ID for deduplication, and use it for the result
      const syntheticId = constructLottoResultDocId(result.date, result.apiDrawName);
      if (!uniqueFirestoreResultsMap.has(syntheticId)) {
          uniqueFirestoreResultsMap.set(syntheticId, {...result, docId: syntheticId});
      }
    }
  });
  const trulyUniqueFirestoreResults = Array.from(uniqueFirestoreResultsMap.values())
                                      .sort((a,b) => b.date.localeCompare(a.date)); // Re-sort by date after dedupe

  return trulyUniqueFirestoreResults.slice(0, count).map(entry => {
    const entryDateObj = dateFnsParse(entry.date, 'yyyy-MM-dd', new Date());
    return {
      drawName: drawSlug, // Use the slug as the drawName in HistoricalDataEntry
      date: isValid(entryDateObj) ? format(entryDateObj, 'PPP', { locale: fr }) : 'Date invalide',
      winningNumbers: entry.winningNumbers,
      machineNumbers: entry.machineNumbers && entry.machineNumbers.length > 0 ? entry.machineNumbers : undefined,
    };
  });
};


export async function fetchNumberFrequency(drawSlug: string, data?: HistoricalDataEntry[]): Promise<NumberFrequency[]> {
  const historicalData = data || await fetchHistoricalData(drawSlug, 50); // Fetch more data for stats

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
    .sort((a, b) => b.frequency - a.frequency || a.number - b.number); // Primary sort by freq, secondary by num
};

export async function fetchNumberCoOccurrence(drawSlug: string, selectedNumber: number, data?: HistoricalDataEntry[]): Promise<NumberCoOccurrence> {
  const historicalData = data || await fetchHistoricalData(drawSlug, 50); // Fetch more data for co-occurrence

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
    .sort((a, b) => b.count - a.count || a.number - b.number) // Primary sort by count, secondary by num
    .slice(0, 10); // Top 10 co-occurring numbers

  return { selectedNumber, coOccurrences };
};

export const fetchRecentLottoResults = async (count: number = 20): Promise<FirestoreDrawDoc[]> => {
  try {
    const q = query(
      collection(db, RESULTS_COLLECTION_NAME),
      orderBy("date", "desc"), // Primarily order by date
      orderBy("fetchedAt", "desc"), // Then by fetched time for same-day entries if any
      limit(count)
    );
    const querySnapshot = await getDocs(q);
    const results: FirestoreDrawDoc[] = [];
    querySnapshot.forEach(doc => {
      // Ensure docId is included
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
    throw error; // Re-throw to allow UI to handle it
  }
};

export async function addManualLottoResult(input: ManualLottoResultInput): Promise<void> {
  const canonicalDrawName = getApiDrawNameFromSlug(input.drawSlug);
  if (!canonicalDrawName) {
    throw new Error(`Slug de tirage invalide: ${input.drawSlug}`);
  }

  const formattedDate = format(input.date, 'yyyy-MM-dd'); // Store date in YYYY-MM-DD format
  const docId = constructLottoResultDocId(formattedDate, canonicalDrawName);

  const dataToSave: Omit<FirestoreDrawDoc, 'docId'> = {
    apiDrawName: canonicalDrawName,
    date: formattedDate,
    winningNumbers: input.winningNumbers,
    machineNumbers: input.machineNumbers || [], // Ensure it's an array
    fetchedAt: serverTimestamp() as Timestamp, // Use server timestamp
  };

  // Check if document already exists
  const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    // Handle the case where a draw already exists.
    // You might want to throw an error, or allow overwriting, or skip.
    // For now, let's throw an error to prevent accidental duplicates from manual entry.
    throw new Error(`Un résultat pour le tirage "${ALL_DRAW_NAMES_MAP[input.drawSlug] || canonicalDrawName}" à la date du ${format(input.date, 'PPP', {locale: fr})} existe déjà (ID: ${docId}).`);
  }

  await setDoc(docRef, dataToSave);
}
