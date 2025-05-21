
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
    const isoDateCheck = dateFnsParse(date, 'yyyy-MM-dd', new Date());
    if (!isValid(isoDateCheck) || format(isoDateCheck, 'yyyy-MM-dd') !== date) {
        const pppParsedDate = dateFnsParse(date, 'PPP', new Date(), { locale: fr });
        if (isValid(pppParsedDate)) {
            formattedDate = format(pppParsedDate, 'yyyy-MM-dd');
        } else {
            const genericParsedDate = parseISO(date);
            if(isValid(genericParsedDate)) {
                formattedDate = format(genericParsedDate, 'yyyy-MM-dd');
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
  const dayMonthMatch = apiDateString.match(/(\d{2}\/\d{2})$/); 
  if (!dayMonthMatch || !dayMonthMatch[1]) {
    return null;
  }
  const dayMonth = dayMonthMatch[1]; 

  const parsedDate = dateFnsParse(`${dayMonth}/${contextYear}`, 'dd/MM/yyyy', new Date(contextYear, 0, 1));

  if (isValid(parsedDate)) {
    return format(parsedDate, 'yyyy-MM-dd');
  } else {
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
  const currentUser = auth.currentUser; // Get current auth state

  for (const draw of draws) {
    const docId = constructLottoResultDocId(draw.date, draw.apiDrawName);
    const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);

    const dataToSave: Omit<FirestoreDrawDoc, 'docId'> = {
      ...draw,
      fetchedAt: serverTimestamp() as Timestamp,
      machineNumbers: draw.machineNumbers || [], 
    };

    if (currentUser) {
      // If user is authenticated (admin), allow create or update
      batch.set(docRef, dataToSave, { merge: true });
    } else {
      // If user is not authenticated (public scraping context)
      // Only write if the document does not already exist to avoid permission errors on update
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        batch.set(docRef, dataToSave); // This is a create operation
      } else {
        // Optional: log that an update was skipped for an unauthenticated user
        // console.log(`Unauthenticated context: Document ${docId} already exists. Skipping update.`);
      }
    }
  }

  try {
    await batch.commit();
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
      return [];
    }
    const data = await response.json();

    if (!data.success || !data.drawsResultsWeekly) {
      return [];
    }

    let contextYear: number;
    const currentMonthStrApi = data.currentMonth; 
    const yearMatch = currentMonthStrApi?.match(/\b(\d{4})\b/);
    if (yearMatch && yearMatch[1]) {
      contextYear = parseInt(yearMatch[1], 10);
    } else {
      contextYear = parseInt(yearMonth.split('-')[0], 10);
    }


    const parsedResults: Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[] = [];

    for (const week of data.drawsResultsWeekly) {
      for (const dailyResult of week.drawResultsDaily) {
        const apiDateStr = dailyResult.date; 
        const parsedDate = parseApiDate(apiDateStr, contextYear);

        if (!parsedDate) {
          continue;
        }

        if (dailyResult.drawResults && dailyResult.drawResults.standardDraws) {
          for (const draw of dailyResult.drawResults.standardDraws) {
            const apiDrawNameFromPayload = draw.drawName; 

            if (!apiDrawNameFromPayload || typeof apiDrawNameFromPayload !== 'string') {
                continue;
            }

            const normalizedApiNameToLookup = apiDrawNameFromPayload
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .trim();

            const resolvedCanonicalName = canonicalDrawNameMap.get(normalizedApiNameToLookup);

            if (!resolvedCanonicalName) {
              continue;
            }

            if (draw.winningNumbers && typeof draw.winningNumbers === 'string' && draw.winningNumbers.startsWith('.')) {
              continue;
            }

            const winningNumbers = parseNumbersString(draw.winningNumbers);
            const machineNumbersParsed = parseNumbersString(draw.machineNumbers);

            if (winningNumbers.length === 5) {
              parsedResults.push({
                apiDrawName: resolvedCanonicalName, 
                date: parsedDate,
                winningNumbers: winningNumbers,
                machineNumbers: machineNumbersParsed.length === 5 ? machineNumbersParsed : [], 
              });
            }
          }
        }
      }
    }
    
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

  let attempts = 0;
  const MAX_API_ATTEMPTS = 3; 
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

  if (fetchedFromApiAndSaved || results.length < fetchLimit) {
    try {
      results = []; 
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

  const uniqueFirestoreResultsMap = new Map<string, FirestoreDrawDoc>();
  firestoreResults.forEach(result => {
    if (result.docId && !uniqueFirestoreResultsMap.has(result.docId)) {
      uniqueFirestoreResultsMap.set(result.docId, result);
    } else if (!result.docId) {
      const syntheticId = constructLottoResultDocId(result.date, result.apiDrawName);
      if (!uniqueFirestoreResultsMap.has(syntheticId)) {
          uniqueFirestoreResultsMap.set(syntheticId, {...result, docId: syntheticId});
      }
    }
  });
  const trulyUniqueFirestoreResults = Array.from(uniqueFirestoreResultsMap.values())
                                      .sort((a,b) => b.date.localeCompare(a.date)); 

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

