
import type { DrawResult, HistoricalDataEntry, NumberFrequency, NumberCoOccurrence, FirestoreDrawDoc, ManualLottoResultInput } from '@/types/loto';
import { DRAW_SCHEDULE, ALL_DRAW_NAMES_MAP, DRAW_SLUG_BY_SIMPLE_NAME_MAP } from '@/lib/lotoDraws.tsx';
import { format, subMonths, parse as dateFnsParse, isValid, getYear, parseISO } from 'date-fns';
import fr from 'date-fns/locale/fr';
import { auth, db } from '@/lib/firebase';
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
const RESULTS_COLLECTION_NAME = 'lottoResults';

const canonicalDrawNameMap = new Map<string, string>();
DRAW_SCHEDULE.forEach(daySchedule => {
  daySchedule.draws.forEach(draw => {
    const canonicalName = draw.name;
    // Normalize with accent removal for robust mapping
    const normalizedKey = canonicalName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    if (!canonicalDrawNameMap.has(normalizedKey)) {
      canonicalDrawNameMap.set(normalizedKey, canonicalName);
    }
    // Also map the original name if it's different from the normalized one (e.g. includes accents but is used in API)
    const originalNormalizedKey = draw.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (originalNormalizedKey !== normalizedKey && !canonicalDrawNameMap.has(originalNormalizedKey)) {
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
    .replace(/[^\w-]/g, ''); // Remove any non-alphanumeric characters except hyphens
}

export function constructLottoResultDocId(date: string, apiDrawName: string): string {
  // Ensure date is YYYY-MM-DD
  let formattedDate = date;
  try {
    // Check if it's already YYYY-MM-DD
    const isoDateCheck = dateFnsParse(date, 'yyyy-MM-DD', new Date());
    if (!isValid(isoDateCheck) || format(isoDateCheck, 'yyyy-MM-dd') !== date) {
        // Try parsing from 'PPP' format (e.g., "13 mai 2025")
        const pppParsedDate = dateFnsParse(date, 'PPP', new Date(), { locale: fr });
        if (isValid(pppParsedDate)) {
            formattedDate = format(pppParsedDate, 'yyyy-MM-dd');
        } else {
            // Fallback: try generic ISO parsing
            const genericParsedDate = parseISO(date); // Handles YYYY-MM-DDTHH:mm:ss.sssZ etc.
            if(isValid(genericParsedDate)) {
                formattedDate = format(genericParsedDate, 'yyyy-MM-dd');
            } else {
                // console.warn("Date parsing for doc ID failed for:", date, ". Using original value.");
            }
        }
    }
  } catch (e) {
    // console.warn("Date parsing for doc ID failed for:", date, ". Using original value.");
  }
  const normalizedIdNamePart = normalizeApiDrawNameForDocId(apiDrawName);
  return `${formattedDate}_${normalizedIdNamePart}`;
}

// Helper to parse API date string (e.g., "Jeu. 25/07") to "YYYY-MM-DD"
function parseApiDate(apiDateString: string, contextYear: number): string | null {
  // Regex to find "DD/MM" at the end of the string
  const dayMonthMatch = apiDateString.match(/(\d{2}\/\d{2})$/);
  if (!dayMonthMatch || !dayMonthMatch[1]) {
    // console.warn(`Could not extract DD/MM from API date string: ${apiDateString}`);
    return null;
  }
  const dayMonth = dayMonthMatch[1]; // "DD/MM"

  // Validate contextYear
  if (isNaN(contextYear) || contextYear < 1900 || contextYear > 2100) {
      // console.error(`Invalid contextYear: ${contextYear} for API date string: ${apiDateString}`);
      return null;
  }
  const parsedDate = dateFnsParse(`${dayMonth}/${contextYear}`, 'dd/MM/yyyy', new Date(contextYear, 0, 1)); // Provide a reference date in the context year
  return isValid(parsedDate) ? format(parsedDate, 'yyyy-MM-dd') : null;
}

// Helper to parse "01-02-03-04-05" into [1, 2, 3, 4, 5]
function parseNumbersString(numbersStr: string | null | undefined): number[] {
  if (!numbersStr || typeof numbersStr !== 'string') return [];
  // Match sequences of digits, then convert to numbers.
  // Slice(0,5) ensures we only take the first 5 numbers if more are accidentally present.
  return (numbersStr.match(/\d+/g) || []).map(Number).slice(0, 5);
}


async function _saveDrawsToFirestore(draws: Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[]): Promise<void> {
  if (!draws.length) return;

  const currentUser = auth.currentUser;
  const batch = writeBatch(db);
  let batchHasOperations = false;
  const unauthenticatedWritePromises: Array<Promise<void>> = [];

  for (const draw of draws) {
    const docId = constructLottoResultDocId(draw.date, draw.apiDrawName);
    const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
    const dataToSave: Omit<FirestoreDrawDoc, 'docId'> = {
      ...draw,
      fetchedAt: serverTimestamp() as Timestamp,
      machineNumbers: draw.machineNumbers || [], // Ensure machineNumbers is always an array
    };

    if (currentUser) {
      batch.set(docRef, dataToSave, { merge: true }); // Allow overwrite/merge for admin
      batchHasOperations = true;
    } else {
      // For unauthenticated, only create if document doesn't exist to avoid permission errors on update
      const promise = (async () => {
        try {
          const docSnap = await getDoc(docRef);
          if (!docSnap.exists()) {
            // Using setDoc directly here instead of batch for unauthenticated,
            // to ensure each operation is more atomic from client rule perspective.
            await setDoc(docRef, dataToSave);
          }
        } catch (e) {
          // console.error(`Failed unauthenticated write for doc ${docId}:`, e);
        }
      })();
      unauthenticatedWritePromises.push(promise);
    }
  }

  try {
    if (batchHasOperations) {
      await batch.commit();
    }
    if (unauthenticatedWritePromises.length > 0) {
      await Promise.all(unauthenticatedWritePromises);
    }
    // console.log(`${draws.length} draws processed for Firestore saving.`);
  } catch (error) {
    // console.error("Error committing writes to Firestore:", error);
  }
}


// Fetches and parses data for a specific YYYY-MM from the API
async function _fetchAndParseMonthData(yearMonth: string): Promise<Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[]> {
  const url = `${API_BASE_URL}?month=${yearMonth}`; // e.g., "2024-01"
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://lotobonheur.ci/resultats', // As observed in browser requests
      }
    });
    if (!response.ok) {
      // console.error(`API request failed for ${yearMonth} with status: ${response.status}`);
      return [];
    }
    const data = await response.json();
    if (!data.success || !data.drawsResultsWeekly) {
      // console.warn(`API response for ${yearMonth} not successful or missing drawsResultsWeekly.`);
      return [];
    }

    // Determine contextYear strictly from the yearMonth parameter
    const contextYear = parseInt(yearMonth.split('-')[0], 10);
     if (isNaN(contextYear) || contextYear < 1900 || contextYear > 2100) {
        // console.error(`Invalid year parsed from yearMonth parameter: ${yearMonth}. Aborting month parse.`);
        return [];
    }


    const parsedResults: Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[] = [];
    for (const week of data.drawsResultsWeekly) {
      for (const dailyResult of week.drawResultsDaily) {
        const apiDateStr = dailyResult.date; // e.g., "Jeu. 25/07"
        const parsedDate = parseApiDate(apiDateStr, contextYear); // Returns "YYYY-MM-DD" or null
        if (!parsedDate) continue;

        if (dailyResult.drawResults && dailyResult.drawResults.standardDraws) {
          for (const draw of dailyResult.drawResults.standardDraws) {
            const apiDrawNameFromPayload = draw.drawName;
            if (!apiDrawNameFromPayload || typeof apiDrawNameFromPayload !== 'string') continue;

            // Normalize API draw name for lookup in our canonical map
            const normalizedApiNameToLookup = apiDrawNameFromPayload
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "") // Remove accents
              .toLowerCase()
              .trim();

            const resolvedCanonicalName = canonicalDrawNameMap.get(normalizedApiNameToLookup);
            if (!resolvedCanonicalName) {
              // console.warn(`Unrecognized draw name from API: '${apiDrawNameFromPayload}' (normalized: '${normalizedApiNameToLookup}') for date ${parsedDate}`);
              continue;
            }
            if (draw.winningNumbers && typeof draw.winningNumbers === 'string' && draw.winningNumbers.startsWith('.')) {
                // console.warn(`Skipping draw ${resolvedCanonicalName} on ${parsedDate} due to invalid winning numbers format: ${draw.winningNumbers}`);
                continue;
            }


            const winningNumbers = parseNumbersString(draw.winningNumbers);
            const machineNumbersParsed = parseNumbersString(draw.machineNumbers);

            if (winningNumbers.length === 5) {
              parsedResults.push({
                apiDrawName: resolvedCanonicalName,
                date: parsedDate, // "YYYY-MM-DD"
                winningNumbers: winningNumbers,
                machineNumbers: machineNumbersParsed.length === 5 ? machineNumbersParsed : [], // Store empty array if not 5
              });
            }
          }
        }
      }
    }
    // Deduplicate results for the month before saving to prevent redundant writes
    const uniqueResultsForMonthMap = new Map<string, Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>>();
    parsedResults.forEach(r => {
        const docId = constructLottoResultDocId(r.date, r.apiDrawName);
        if (!uniqueResultsForMonthMap.has(docId)) {
            uniqueResultsForMonthMap.set(docId, r);
        }
    });
    const uniqueResultsForMonth = Array.from(uniqueResultsForMonthMap.values());

    if (uniqueResultsForMonth.length > 0) await _saveDrawsToFirestore(uniqueResultsForMonth);
    return uniqueResultsForMonth; // Return the (potentially empty) list of parsed results from this month
  } catch (error) {
    // console.error(`Error fetching or parsing data for ${yearMonth} from API:`, error);
    return [];
  }
}

export const fetchDrawData = async (drawSlug: string): Promise<DrawResult[]> => {
  const fetchLimit = 3;
  const canonicalDrawName = getApiDrawNameFromSlug(drawSlug);
  if (!canonicalDrawName) {
    console.error(`Unknown draw slug: ${drawSlug}`);
    throw new Error(`Unknown draw slug: ${drawSlug}`);
  }

  let firestoreDocs: FirestoreDrawDoc[] = [];
  try {
    const q = query(
      collection(db, RESULTS_COLLECTION_NAME),
      where("apiDrawName", "==", canonicalDrawName),
      orderBy("date", "desc"),
      limit(fetchLimit)
    );
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(doc => firestoreDocs.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc));
  } catch (error) {
    console.error(`Error fetching latest draws for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore:`, error);
    // Don't rethrow, try API sync
  }

  // If Firestore has fewer than fetchLimit results, try to sync with API for recent months
  if (firestoreDocs.length < fetchLimit) {
    let attempts = 0;
    const MONTHS_TO_CHECK_API = 3; // Check current month and two previous
    let currentDateIter = new Date(); // Start with current month

    while (attempts < MONTHS_TO_CHECK_API) {
      const yearMonth = format(currentDateIter, 'yyyy-MM');
      await _fetchAndParseMonthData(yearMonth); // Fetches and saves to Firestore
      currentDateIter = subMonths(currentDateIter, 1); // Go to previous month
      attempts++;
      if (attempts < MONTHS_TO_CHECK_API) await new Promise(resolve => setTimeout(resolve, 250)); // Small delay between month fetches
    }

    // After API sync attempt, re-query Firestore to get the latest data
    try {
      firestoreDocs = []; // Clear previous results to get fresh ones
      const qAfterSync = query(
        collection(db, RESULTS_COLLECTION_NAME),
        where("apiDrawName", "==", canonicalDrawName),
        orderBy("date", "desc"),
        limit(fetchLimit)
      );
      const querySnapshotAfterSync = await getDocs(qAfterSync);
      querySnapshotAfterSync.forEach(doc => firestoreDocs.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc));
    } catch (error) {
      console.error(`Error re-fetching latest draws for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore after API sync:`, error);
    }
  }

  // Deduplicate final results
  const finalUniqueDocsMap = new Map<string, FirestoreDrawDoc>();
  firestoreDocs.forEach(doc => {
    const key = doc.docId || constructLottoResultDocId(doc.date, doc.apiDrawName); // Fallback if docId is somehow missing
    if (!finalUniqueDocsMap.has(key)) {
      finalUniqueDocsMap.set(key, {...doc, docId: key }); // Ensure docId is part of the object
    }
  });

  // Sort again as Map iteration order isn't guaranteed for sorting purposes
  const finalResults = Array.from(finalUniqueDocsMap.values())
    .sort((a, b) => b.date.localeCompare(a.date)) // Sort YYYY-MM-DD strings
    .slice(0, fetchLimit)
    .map(doc => {
      const drawDateObject = dateFnsParse(doc.date, 'yyyy-MM-dd', new Date());
      return {
        docId: doc.docId, // Pass docId
        date: isValid(drawDateObject) ? format(drawDateObject, 'PPP', { locale: fr }) : 'Date invalide',
        winningNumbers: doc.winningNumbers,
        machineNumbers: doc.machineNumbers && doc.machineNumbers.length > 0 ? doc.machineNumbers : undefined,
      };
    });

  if (finalResults.length > 0) return finalResults;
  // If still no data after all attempts
  throw new Error(`No data found for draw ${canonicalDrawName} (slug: ${drawSlug}) after checking Firestore and API.`);
};


export const fetchHistoricalData = async (drawSlug: string, count: number = 20): Promise<HistoricalDataEntry[]> => {
  const canonicalDrawName = getApiDrawNameFromSlug(drawSlug);
  if (!canonicalDrawName) {
    console.warn(`No canonical draw name for slug: ${drawSlug}`);
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
    querySnapshot.forEach(doc => firestoreResults.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc));
  } catch (error) {
    console.error(`Error fetching historical data for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore:`, error);
  }

  // If we don't have enough data, try fetching older months from API
  if (firestoreResults.length < count) {
    const needed = count - firestoreResults.length;
    // Estimate how many months to go back. Each month has ~4 draws of a specific type.
    const estimatedDrawsPerMonthOfType = 4; // Rough estimate
    // Add a buffer of 2 months to be safe, max 12 months back to avoid excessive fetching.
    let monthsToFetch = Math.min(12, Math.max(1, Math.ceil(needed / estimatedDrawsPerMonthOfType) + 2));

    // Determine the starting month for fetching older data
    let dateToFetch = firestoreResults.length > 0 && firestoreResults[firestoreResults.length - 1]?.date
        ? subMonths(dateFnsParse(firestoreResults[firestoreResults.length - 1].date, 'yyyy-MM-dd', new Date()),1) // Start from month before the oldest fetched
        : subMonths(new Date(), 1); // Or start from last month if no data yet

    for (let i = 0; i < monthsToFetch; i++) {
      const yearMonth = format(dateToFetch, 'yyyy-MM');
      await _fetchAndParseMonthData(yearMonth);
      dateToFetch = subMonths(dateToFetch, 1);
      // Small delay to avoid overwhelming the API
      if (i > 0 && i % 3 === 0) await new Promise(resolve => setTimeout(resolve, 500));
    }

    // After API sync, re-query Firestore to get the full set of data up to 'count'
    try {
      const qAfterSync = query(
        collection(db, RESULTS_COLLECTION_NAME),
        where("apiDrawName", "==", canonicalDrawName),
        orderBy("date", "desc"),
        limit(count)
      );
      const querySnapshotAfterSync = await getDocs(qAfterSync);
      firestoreResults = []; // Reset and repopulate
      querySnapshotAfterSync.forEach(doc => firestoreResults.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc));
    } catch (error) {
      console.error(`Error re-fetching historical data for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore after API sync:`, error);
    }
  }

  // Deduplicate and format for output
  const uniqueDrawsMap = new Map<string, FirestoreDrawDoc>();
  firestoreResults.forEach(result => {
    // Use a more robust key for deduplication, normalizing name and date
    const uniqueKey = `${result.date.trim().toLowerCase()}_${result.apiDrawName.trim().toLowerCase()}`;
    if (!uniqueDrawsMap.has(uniqueKey)) {
      uniqueDrawsMap.set(uniqueKey, {...result, docId: result.docId || constructLottoResultDocId(result.date, result.apiDrawName) });
    }
  });

  // Sort again after deduplication via Map, then slice
  const trulyUniqueFirestoreResults = Array.from(uniqueDrawsMap.values())
    .sort((a, b) => b.date.localeCompare(a.date)); // Sort YYYY-MM-DD strings

  return trulyUniqueFirestoreResults.slice(0, count).map(entry => {
    const entryDateObj = dateFnsParse(entry.date, 'yyyy-MM-dd', new Date());
    return {
      docId: entry.docId,
      drawName: drawSlug, // Use the original slug for consistency in HistoricalDataEntry
      date: isValid(entryDateObj) ? format(entryDateObj, 'PPP', { locale: fr }) : 'Date invalide',
      winningNumbers: entry.winningNumbers,
      machineNumbers: entry.machineNumbers && entry.machineNumbers.length > 0 ? entry.machineNumbers : undefined,
    };
  });
};

export async function fetchNumberFrequency(drawSlug: string, data?: HistoricalDataEntry[]): Promise<NumberFrequency[]> {
  const historicalData = data || await fetchHistoricalData(drawSlug, 50); // Fetch more data for stats
  if (historicalData.length === 0) return [];

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
  if (historicalData.length === 0) return { selectedNumber, coOccurrences: [] };

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
    .slice(0, 10); // Top 10 co-occurrences

  return { selectedNumber, coOccurrences };
};


export const fetchRecentLottoResults = async (count: number = 20): Promise<FirestoreDrawDoc[]> => {
  try {
    const q = query(
      collection(db, RESULTS_COLLECTION_NAME),
      orderBy("date", "desc"),
      orderBy("fetchedAt", "desc"), // Secondary sort for draws on the same date
      limit(count)
    );
    const querySnapshot = await getDocs(q);
    const results: FirestoreDrawDoc[] = [];
    querySnapshot.forEach(doc => {
      results.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc)
    });
    return results;
  } catch (error) {
    console.error("Error fetching recent lotto results from Firestore:", error);
    return [];
  }
};

export const fetchAllLottoResultsForExport = async (): Promise<FirestoreDrawDoc[]> => {
  try {
    const q = query(collection(db, RESULTS_COLLECTION_NAME), orderBy("date", "desc"));
    const querySnapshot = await getDocs(q);
    const results: FirestoreDrawDoc[] = [];
    querySnapshot.forEach(doc => {
      results.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc)
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
  if (!canonicalDrawName) throw new Error(`Slug de tirage invalide: ${input.drawSlug}`);

  const formattedDate = format(input.date, 'yyyy-MM-dd'); // Ensure date is in YYYY-MM-DD
  const docId = constructLottoResultDocId(formattedDate, canonicalDrawName);

  const dataToSave: Omit<FirestoreDrawDoc, 'docId'> = {
    apiDrawName: canonicalDrawName,
    date: formattedDate,
    winningNumbers: input.winningNumbers,
    machineNumbers: input.machineNumbers || [],
    fetchedAt: serverTimestamp() as Timestamp, // Use server timestamp
  };

  const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    // Provide a more user-friendly message for duplicates
    throw new Error(`Un résultat pour le tirage "${ALL_DRAW_NAMES_MAP[input.drawSlug] || canonicalDrawName}" à la date du ${format(input.date, 'PPP', {locale: fr})} existe déjà (ID: ${docId}).`);
  }
  await setDoc(docRef, dataToSave);
}
