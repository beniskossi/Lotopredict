
      
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

    if (currentUser) { // Admin or authenticated context
      batch.set(docRef, dataToSave, { merge: true }); // Allow overwrite/update
    } else { // Unauthenticated client-side scraping
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) { // Only create if it doesn't exist
        batch.set(docRef, dataToSave); 
      }
      // If it exists, do nothing to prevent unauthenticated update errors
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
    // Derive contextYear strictly from the yearMonth parameter of the function
    const yearFromParam = parseInt(yearMonth.split('-')[0], 10);
    if (!isNaN(yearFromParam)) {
        contextYear = yearFromParam;
    } else {
        // This case should ideally not happen if yearMonth is always "YYYY-MM"
        console.warn(`Could not parse year from yearMonth parameter: ${yearMonth}. Using current system year as a fallback.`);
        contextYear = getYear(new Date());
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

  const fetchLimit = 3;
  let firestoreDocs: FirestoreDrawDoc[] = [];

  try {
    const q = query(
      collection(db, RESULTS_COLLECTION_NAME),
      where("apiDrawName", "==", canonicalDrawName),
      orderBy("date", "desc"),
      limit(fetchLimit)
    );
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(doc => {
        firestoreDocs.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc);
    });

    if (firestoreDocs.length >= fetchLimit) {
      // Deduplicate and format
      const uniqueDocsMap = new Map<string, FirestoreDrawDoc>();
      firestoreDocs.forEach(doc => {
        if (doc.docId && !uniqueDocsMap.has(doc.docId)) {
          uniqueDocsMap.set(doc.docId, doc);
        }
      });
      return Array.from(uniqueDocsMap.values())
        .sort((a, b) => b.date.localeCompare(a.date)) // Re-sort as Map order might not be guaranteed
        .slice(0, fetchLimit)
        .map(doc => {
          const drawDateObject = dateFnsParse(doc.date, 'yyyy-MM-dd', new Date());
          return {
            date: isValid(drawDateObject) ? format(drawDateObject, 'PPP', { locale: fr }) : 'Date invalide',
            winningNumbers: doc.winningNumbers,
            machineNumbers: doc.machineNumbers && doc.machineNumbers.length > 0 ? doc.machineNumbers : undefined,
          };
        });
    }
  } catch (error) {
    console.error(`Error fetching latest draws for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore:`, error);
  }

  let attempts = 0;
  const MONTHS_TO_CHECK_API = 3; // Current month + 2 previous months
  let currentDateIter = new Date();
  let fetchedFromApiAndSaved = false;

  // Try to fetch from API if Firestore has less than fetchLimit results
  // Only try API if firestoreDocs.length < fetchLimit
  if (firestoreDocs.length < fetchLimit) {
    while (attempts < MONTHS_TO_CHECK_API) {
      const yearMonth = format(currentDateIter, 'yyyy-MM');
      const monthDataFromApi = await _fetchAndParseMonthData(yearMonth); 
      if (monthDataFromApi.length > 0) {
          fetchedFromApiAndSaved = true;
      }
      currentDateIter = subMonths(currentDateIter, 1);
      attempts++;
    }
  }

  if (fetchedFromApiAndSaved || firestoreDocs.length < fetchLimit) {
    try {
      firestoreDocs = []; 
      const q = query(
        collection(db, RESULTS_COLLECTION_NAME),
        where("apiDrawName", "==", canonicalDrawName),
        orderBy("date", "desc"),
        limit(fetchLimit)
      );
      const querySnapshotAfterSync = await getDocs(q);
      querySnapshotAfterSync.forEach(doc => {
        firestoreDocs.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc);
      });
    } catch (error) {
      console.error(`Error fetching latest draws for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore after API sync:`, error);
    }
  }
  
  // Final deduplication and mapping
  const finalUniqueDocsMap = new Map<string, FirestoreDrawDoc>();
  firestoreDocs.forEach(doc => {
    // Ensure doc.docId exists and is a string before using it as a map key
    if (doc.docId && typeof doc.docId === 'string') {
      if (!finalUniqueDocsMap.has(doc.docId)) {
        finalUniqueDocsMap.set(doc.docId, doc);
      }
    } else {
      // Handle cases where docId might be missing or not a string, perhaps by logging or creating a fallback key
      // For now, we'll just ensure a key exists if constructing one is possible, otherwise log and skip.
      const fallbackKey = constructLottoResultDocId(doc.date, doc.apiDrawName);
      if (!finalUniqueDocsMap.has(fallbackKey)) {
          finalUniqueDocsMap.set(fallbackKey, {...doc, docId: fallbackKey}); // Assign the constructed ID
      }
    }
  });

  const finalResults = Array.from(finalUniqueDocsMap.values())
    .sort((a, b) => b.date.localeCompare(a.date)) // Re-sort
    .slice(0, fetchLimit)
    .map(doc => {
      const drawDateObject = dateFnsParse(doc.date, 'yyyy-MM-dd', new Date());
      return {
        date: isValid(drawDateObject) ? format(drawDateObject, 'PPP', { locale: fr }) : 'Date invalide',
        winningNumbers: doc.winningNumbers,
        machineNumbers: doc.machineNumbers && doc.machineNumbers.length > 0 ? doc.machineNumbers : undefined,
      };
    });

  if (finalResults.length > 0) {
    return finalResults;
  }
  
  throw new Error(`No data found for draw ${canonicalDrawName} (slug: ${drawSlug}) after checking Firestore and API for ${MONTHS_TO_CHECK_API} months.`);
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

  if (firestoreResults.length < count) {
    const needed = count - firestoreResults.length;
    const estimatedDrawsPerMonthOfType = 4; 
    let monthsToFetch = Math.min(12, Math.max(1, Math.ceil(needed / estimatedDrawsPerMonthOfType) + 2 )); 

    let dateToFetch = firestoreResults.length > 0 && firestoreResults[firestoreResults.length - 1]?.date
        ? subMonths(dateFnsParse(firestoreResults[firestoreResults.length - 1].date, 'yyyy-MM-dd', new Date()),1)
        : subMonths(new Date(), 1); 

    for (let i = 0; i < monthsToFetch; i++) {
      const yearMonth = format(dateToFetch, 'yyyy-MM');
      await _fetchAndParseMonthData(yearMonth); 
      dateToFetch = subMonths(dateToFetch, 1);
        if (i > 0 && i % 3 === 0) { 
            await new Promise(resolve => setTimeout(resolve, 500)); 
        }
    }

    try {
      const q = query(
        collection(db, RESULTS_COLLECTION_NAME),
        where("apiDrawName", "==", canonicalDrawName),
        orderBy("date", "desc"),
        limit(count) 
      );
      const querySnapshotAfterSync = await getDocs(q); 
      firestoreResults = []; 
      querySnapshotAfterSync.forEach(doc => { 
        firestoreResults.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc);
      });
    } catch (error) {
      console.error(`Error re-fetching historical data for ${canonicalDrawName} from Firestore after API sync:`, error);
    }
  }

  const uniqueDrawsMap = new Map<string, FirestoreDrawDoc>();
  firestoreResults.forEach(result => {
    const uniqueKey = `${result.date.trim()}_${result.apiDrawName.trim().toLowerCase()}`;
    if (!uniqueDrawsMap.has(uniqueKey)) {
      uniqueDrawsMap.set(uniqueKey, result);
    }
  });
  
  const trulyUniqueFirestoreResults = Array.from(uniqueDrawsMap.values())
                                      .sort((a, b) => b.date.localeCompare(a.date)); 

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
  } catch (error)
{
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

    
