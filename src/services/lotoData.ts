
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
    const originalSimpleName = draw.name.toLowerCase().trim();
     if (originalSimpleName !== normalizedKey && !canonicalDrawNameMap.has(originalSimpleName)) {
        canonicalDrawNameMap.set(originalSimpleName, draw.name);
    }
    const originalSimpleNameNormalized = draw.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (originalSimpleNameNormalized !== normalizedKey && !canonicalDrawNameMap.has(originalSimpleNameNormalized)) {
        canonicalDrawNameMap.set(originalSimpleNameNormalized, draw.name);
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
    const isoDateCheck = dateFnsParse(date, 'yyyy-MM-DD', new Date());
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
    // console.warn("Date parsing for doc ID failed for:", date, ". Using original value.");
  }
  const normalizedIdNamePart = normalizeApiDrawNameForDocId(apiDrawName);
  return `${formattedDate}_${normalizedIdNamePart}`;
}

// Helper to parse API date string (e.g., "Jeu. 25/07") to "YYYY-MM-DD"
function parseApiDate(apiDateString: string, contextYear: number): string | null {
  const dayMonthMatch = apiDateString.match(/(\d{2}\/\d{2})$/);
  if (!dayMonthMatch || !dayMonthMatch[1]) {
    return null;
  }
  const dayMonth = dayMonthMatch[1]; 

  if (isNaN(contextYear) || contextYear < 1900 || contextYear > 2100) {
      return null;
  }
  const parsedDate = dateFnsParse(`${dayMonth}/${contextYear}`, 'dd/MM/yyyy', new Date(contextYear, 0, 1));
  return isValid(parsedDate) ? format(parsedDate, 'yyyy-MM-dd') : null;
}

// Helper to parse "01-02-03-04-05" into [1, 2, 3, 4, 5]
function parseNumbersString(numbersStr: string | null | undefined): number[] {
  if (!numbersStr || typeof numbersStr !== 'string') return [];
  return (numbersStr.match(/\d+/g) || []).map(Number).slice(0, 5);
}


async function _saveDrawsToFirestore(draws: Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[]): Promise<void> {
  if (!draws.length) return;

  const currentUser = auth.currentUser; // Get current auth state
  const batch = writeBatch(db);
  let batchHasOperations = false;
  const unauthenticatedWritePromises: Array<Promise<void>> = [];

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
      batchHasOperations = true;
    } else {
      // For unauthenticated, only create if document doesn't exist to avoid permission errors on update
      const promise = (async () => {
        try {
          const docSnap = await getDoc(docRef);
          if (!docSnap.exists()) {
            await setDoc(docRef, dataToSave); // Individual set for unauthenticated create
          }
        } catch (e) {
           // console.error(`Failed unauthenticated write attempt for doc ${docId}:`, e);
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
  } catch (error) {
    // console.error("Error committing writes to Firestore:", error);
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
    if (!response.ok) return [];
    const data = await response.json();
    if (!data.success || !data.drawsResultsWeekly) return [];

    const contextYear = parseInt(yearMonth.split('-')[0], 10);
     if (isNaN(contextYear) || contextYear < 1900 || contextYear > 2100) {
        return [];
    }

    const parsedResults: Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[] = [];
    for (const week of data.drawsResultsWeekly) {
      for (const dailyResult of week.drawResultsDaily) {
        const apiDateStr = dailyResult.date;
        const parsedDate = parseApiDate(apiDateStr, contextYear);
        if (!parsedDate) continue;

        if (dailyResult.drawResults && dailyResult.drawResults.standardDraws) {
          for (const draw of dailyResult.drawResults.standardDraws) {
            const apiDrawNameFromPayload = draw.drawName;
            if (!apiDrawNameFromPayload || typeof apiDrawNameFromPayload !== 'string') continue;

            const normalizedApiNameToLookup = apiDrawNameFromPayload
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .trim();

            const resolvedCanonicalName = canonicalDrawNameMap.get(normalizedApiNameToLookup);
            if (!resolvedCanonicalName) continue;
            if (draw.winningNumbers && typeof draw.winningNumbers === 'string' && draw.winningNumbers.startsWith('.')) continue;

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
        const uniqueKey = constructLottoResultDocId(r.date, r.apiDrawName);
        if (!uniqueResultsForMonthMap.has(uniqueKey)) {
            uniqueResultsForMonthMap.set(uniqueKey, r);
        }
    });
    const uniqueResultsForMonth = Array.from(uniqueResultsForMonthMap.values());

    if (uniqueResultsForMonth.length > 0) await _saveDrawsToFirestore(uniqueResultsForMonth);
    return uniqueResultsForMonth;
  } catch (error) {
    return [];
  }
}

export const fetchDrawData = async (drawSlug: string): Promise<DrawResult[]> => {
  const fetchLimit = 3;
  const canonicalDrawName = getApiDrawNameFromSlug(drawSlug);
  if (!canonicalDrawName) {
    throw new Error(`Unknown draw slug: ${drawSlug}`);
  }

  let firestoreDocs: FirestoreDrawDoc[] = [];
  try {
    const q = query(
      collection(db, RESULTS_COLLECTION_NAME),
      where("apiDrawName", "==", canonicalDrawName),
      orderBy("date", "desc"),
      limit(fetchLimit * 2) // Fetch a bit more initially to help with deduplication
    );
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(doc => firestoreDocs.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc));
  } catch (error) {
    // console.error(`Error fetching latest draws for ${canonicalDrawName} from Firestore:`, error);
  }
  
  const initialFirestoreCount = firestoreDocs.filter(doc => {
      const canonicalKey = constructLottoResultDocId(doc.date, doc.apiDrawName);
      const docKey = doc.docId || constructLottoResultDocId(doc.date, doc.apiDrawName);
      return canonicalKey === docKey; // Count only those that would match their canonical key
  }).length;


  if (initialFirestoreCount < fetchLimit) {
    let attempts = 0;
    const MONTHS_TO_CHECK_API = 3; 
    let currentDateIter = new Date(); 

    while (attempts < MONTHS_TO_CHECK_API) {
      const yearMonth = format(currentDateIter, 'yyyy-MM');
      await _fetchAndParseMonthData(yearMonth); 
      currentDateIter = subMonths(currentDateIter, 1); 
      attempts++;
      if (attempts < MONTHS_TO_CHECK_API) await new Promise(resolve => setTimeout(resolve, 250)); 
    }

    try {
      firestoreDocs = []; 
      const qAfterSync = query(
        collection(db, RESULTS_COLLECTION_NAME),
        where("apiDrawName", "==", canonicalDrawName),
        orderBy("date", "desc"),
        limit(fetchLimit * 2) // Fetch more again after sync
      );
      const querySnapshotAfterSync = await getDocs(qAfterSync);
      querySnapshotAfterSync.forEach(doc => firestoreDocs.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc));
    } catch (error) {
      // console.error(`Error re-fetching latest draws from Firestore after API sync:`, error);
    }
  }

  const finalUniqueDocsMap = new Map<string, FirestoreDrawDoc>();
  firestoreDocs.forEach(doc => {
    // Use a key based on content (date and normalized name) for deduplication
    const canonicalKey = constructLottoResultDocId(doc.date, doc.apiDrawName);
    if (!finalUniqueDocsMap.has(canonicalKey)) {
      finalUniqueDocsMap.set(canonicalKey, { ...doc, docId: doc.docId || canonicalKey });
    } else {
      // If duplicate canonicalKey, prefer the one with a more recent fetchedAt timestamp, if available
      const existingDoc = finalUniqueDocsMap.get(canonicalKey)!;
      if (doc.fetchedAt && (!existingDoc.fetchedAt || doc.fetchedAt.toMillis() > existingDoc.fetchedAt.toMillis())) {
        finalUniqueDocsMap.set(canonicalKey, { ...doc, docId: doc.docId || canonicalKey });
      }
    }
  });

  const trulyUniqueFirestoreResults = Array.from(finalUniqueDocsMap.values())
    .sort((a, b) => {
      const dateComparison = b.date.localeCompare(a.date);
      if (dateComparison !== 0) return dateComparison;
      if (a.fetchedAt && b.fetchedAt) {
        return b.fetchedAt.toMillis() - a.fetchedAt.toMillis();
      }
      return 0;
    });
  
  if (trulyUniqueFirestoreResults.length === 0 && firestoreDocs.length > 0 && canonicalDrawName) {
      // This case indicates all fetched docs might have been 'duplicates' of each other by canonicalKey,
      // or something else went wrong. To avoid throwing error if API simply has no data,
      // we check if original firestoreDocs was empty.
  } else if (trulyUniqueFirestoreResults.length === 0 && canonicalDrawName) {
     throw new Error(`No data found for draw ${canonicalDrawName} (slug: ${drawSlug}) after checking Firestore and API.`);
  }


  return trulyUniqueFirestoreResults
    .slice(0, fetchLimit) 
    .map(doc => {
      const drawDateObject = dateFnsParse(doc.date, 'yyyy-MM-dd', new Date());
      return {
        docId: doc.docId, 
        date: isValid(drawDateObject) ? format(drawDateObject, 'PPP', { locale: fr }) : 'Date invalide',
        winningNumbers: doc.winningNumbers,
        machineNumbers: doc.machineNumbers && doc.machineNumbers.length > 0 ? doc.machineNumbers : undefined,
      };
    });
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
      limit(count * 2) // Fetch more to allow for robust deduplication
    );
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(doc => firestoreResults.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc));
  } catch (error) {
    // console.error(`Error fetching historical data for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore:`, error);
  }

  if (firestoreResults.length < count) {
    const needed = count - firestoreResults.length;
    const estimatedDrawsPerMonthOfType = 4; 
    let monthsToFetch = Math.min(12, Math.max(1, Math.ceil(needed / estimatedDrawsPerMonthOfType) + 2));

    let dateToFetch = firestoreResults.length > 0 && firestoreResults[firestoreResults.length - 1]?.date
        ? subMonths(dateFnsParse(firestoreResults[firestoreResults.length - 1].date, 'yyyy-MM-dd', new Date()),1)
        : subMonths(new Date(), 1); 

    for (let i = 0; i < monthsToFetch; i++) {
      const yearMonth = format(dateToFetch, 'yyyy-MM');
      await _fetchAndParseMonthData(yearMonth);
      dateToFetch = subMonths(dateToFetch, 1);
      if (i > 0 && i % 3 === 0) await new Promise(resolve => setTimeout(resolve, 500));
    }

    try {
      const qAfterSync = query(
        collection(db, RESULTS_COLLECTION_NAME),
        where("apiDrawName", "==", canonicalDrawName),
        orderBy("date", "desc"),
        limit(count * 2) // Fetch more again
      );
      const querySnapshotAfterSync = await getDocs(qAfterSync);
      firestoreResults = []; 
      querySnapshotAfterSync.forEach(doc => firestoreResults.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc));
    } catch (error) {
      // console.error(`Error re-fetching historical data for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore after API sync:`, error);
    }
  }

  const uniqueDrawsMap = new Map<string, FirestoreDrawDoc>();
  firestoreResults.forEach(result => {
    const canonicalKey = constructLottoResultDocId(result.date, result.apiDrawName);
    if (!uniqueDrawsMap.has(canonicalKey)) {
      uniqueDrawsMap.set(canonicalKey, {...result, docId: result.docId || canonicalKey });
    } else {
        const existingDoc = uniqueDrawsMap.get(canonicalKey)!;
        if (result.fetchedAt && (!existingDoc.fetchedAt || result.fetchedAt.toMillis() > existingDoc.fetchedAt.toMillis())) {
            uniqueDrawsMap.set(canonicalKey, { ...result, docId: result.docId || canonicalKey });
        }
    }
  });

  const trulyUniqueFirestoreResults = Array.from(uniqueDrawsMap.values())
    .sort((a, b) => {
        const dateComparison = b.date.localeCompare(a.date);
        if (dateComparison !== 0) return dateComparison;
        if (a.fetchedAt && b.fetchedAt) {
            return b.fetchedAt.toMillis() - a.fetchedAt.toMillis();
        }
        return 0;
    });

  return trulyUniqueFirestoreResults.slice(0, count).map(entry => {
    const entryDateObj = dateFnsParse(entry.date, 'yyyy-MM-dd', new Date());
    return {
      docId: entry.docId,
      drawName: drawSlug, 
      date: isValid(entryDateObj) ? format(entryDateObj, 'PPP', { locale: fr }) : 'Date invalide',
      winningNumbers: entry.winningNumbers,
      machineNumbers: entry.machineNumbers && entry.machineNumbers.length > 0 ? entry.machineNumbers : undefined,
    };
  });
};

export async function fetchNumberFrequency(drawSlug: string, data?: HistoricalDataEntry[]): Promise<NumberFrequency[]> {
  const historicalData = data || await fetchHistoricalData(drawSlug, 50); 
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
    .sort((a, b) => b.frequency - a.frequency || a.number - b.number); 
};

export async function fetchNumberCoOccurrence(drawSlug: string, selectedNumber: number, data?: HistoricalDataEntry[]): Promise<NumberCoOccurrence> {
  const historicalData = data || await fetchHistoricalData(drawSlug, 50); 
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
      limit(count * 2) // Fetch more for deduplication
    );
    const querySnapshot = await getDocs(q);
    let firestoreResults: FirestoreDrawDoc[] = [];
    querySnapshot.forEach(doc => {
        firestoreResults.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc)
    });

    const uniqueDrawsMap = new Map<string, FirestoreDrawDoc>();
    firestoreResults.forEach(result => {
      const canonicalKey = constructLottoResultDocId(result.date, result.apiDrawName);
      if (!uniqueDrawsMap.has(canonicalKey)) {
        uniqueDrawsMap.set(canonicalKey, {...result, docId: result.docId || canonicalKey });
      } else {
        const existingDoc = uniqueDrawsMap.get(canonicalKey)!;
        if (result.fetchedAt && (!existingDoc.fetchedAt || result.fetchedAt.toMillis() > existingDoc.fetchedAt.toMillis())) {
            uniqueDrawsMap.set(canonicalKey, { ...result, docId: result.docId || canonicalKey });
        }
      }
    });
    return Array.from(uniqueDrawsMap.values())
        .sort((a,b) => {
            const dateComparison = b.date.localeCompare(a.date);
            if (dateComparison !== 0) return dateComparison;
            if (a.fetchedAt && b.fetchedAt) {
                return b.fetchedAt.toMillis() - a.fetchedAt.toMillis();
            }
            return 0;
        })
        .slice(0, count);
  } catch (error) {
    // console.error("Error fetching recent lotto results from Firestore:", error);
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
     // Deduplicate results after fetching for export as well
    const uniqueDrawsMap = new Map<string, FirestoreDrawDoc>();
    results.forEach(result => {
      const canonicalKey = constructLottoResultDocId(result.date, result.apiDrawName);
      if (!uniqueDrawsMap.has(canonicalKey)) {
        uniqueDrawsMap.set(canonicalKey, {...result, docId: result.docId || canonicalKey });
      } else {
        const existingDoc = uniqueDrawsMap.get(canonicalKey)!;
        if (result.fetchedAt && (!existingDoc.fetchedAt || result.fetchedAt.toMillis() > existingDoc.fetchedAt.toMillis())) {
            uniqueDrawsMap.set(canonicalKey, { ...result, docId: result.docId || canonicalKey });
        }
      }
    });
    return Array.from(uniqueDrawsMap.values()).sort((a,b) => b.date.localeCompare(a.date));
  } catch (error) {
    // console.error("Error fetching all lotto results for export from Firestore:", error);
    return [];
  }
};

export const deleteLottoResult = async (docId: string): Promise<void> => {
  if (!docId) {
    throw new Error("Document ID is required for deletion.");
  }
  try {
    const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
    await deleteDoc(docRef);
  } catch (error) {
    throw error; 
  }
};

export async function addManualLottoResult(input: ManualLottoResultInput): Promise<void> {
  const canonicalDrawName = getApiDrawNameFromSlug(input.drawSlug);
  if (!canonicalDrawName) throw new Error(`Slug de tirage invalide: ${input.drawSlug}`);

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

    