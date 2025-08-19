
import type { DrawResult, HistoricalDataEntry, FirestoreDrawDoc, ManualLottoResultInput, NumberCoOccurrence, ManualEditResultFormInput } from '@/types/loto';
import { DRAW_SCHEDULE, ALL_DRAW_NAMES_MAP, getDrawNameBySlug, DRAW_SLUG_BY_SIMPLE_NAME_MAP } from '@/lib/lotoDraws.tsx';
import { format, subMonths, parse as dateFnsParse, isValid, getYear, parseISO, lastDayOfMonth, startOfMonth, isFuture } from 'date-fns';
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
  Timestamp,
  startAfter,
  addDoc,
  updateDoc,
  type QueryConstraint,
  type QueryDocumentSnapshot
} from "firebase/firestore";
import {PredictionFeedback} from "@/types/loto";

const RESULTS_COLLECTION_NAME = 'lottoResults';
const PREDICTION_CACHE_COLLECTION_NAME = 'predictionCache';
const PREDICTION_FEEDBACK_COLLECTION_NAME = 'predictionFeedback';

const DEFAULT_PAGE_SIZE = 10;
const MAX_HISTORICAL_FETCH_LIMIT = 100;
const PREDICTION_CACHE_TTL_MINUTES = 60; // Cache predictions for 1 hour


const canonicalDrawNameMap = new Map<string, string>();
DRAW_SCHEDULE.forEach(daySchedule => {
  daySchedule.draws.forEach(draw => {
    const canonicalName = draw.name;
    const normalizedKey = canonicalName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (!canonicalDrawNameMap.has(normalizedKey)) {
      canonicalDrawNameMap.set(normalizedKey, canonicalName);
    }
  });
});

export function getApiDrawNameFromSlug(drawSlug: string): string | undefined {
  for (const daySchedule of DRAW_SCHEDULE) {
    for (const draw of daySchedule.draws) {
      if (draw.slug === drawSlug) {
        return draw.name;
      }
    }
  }
  return undefined;
}

function normalizeApiDrawNameForDocId(apiDrawName: string): string {
 return apiDrawName.replace(/\s+/g, '_').replace(/[^\w-]/g, '');
}

export function constructLottoResultDocId(date: string, apiDrawName: string): string {
  const normalizedName = normalizeApiDrawNameForDocId(apiDrawName);
  const formattedDate = date.replace(/-/g, '');
  return `${formattedDate}_${normalizedName}`;
}

async function _fetchAndProcessExternalApi(yearMonth?: string): Promise<Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[]> {
    const baseUrl = 'https://lotobonheur.ci/api/results';
    let url = baseUrl;

    if (yearMonth) {
        const [year, month] = yearMonth.split('-');
        const monthName = format(new Date(parseInt(year, 10), parseInt(month, 10) - 1), 'MMMM', { locale: fr }).toLowerCase();
        url = `${baseUrl}?month=${monthName}-${year}`;
    }
    
    try {
        const response = await fetch(url, {
             headers: {
                // Simulate a browser User-Agent to avoid being blocked
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
             },
        });

        if (!response.ok) {
            console.error(`External API at ${url} failed with status: ${response.status}`);
            return []; // Fail gracefully, don't throw
        }
        
        const resultsData = await response.json();
        if (!resultsData || !resultsData.success) {
            console.error(`External API at ${url} returned unsuccessful or invalid response`, resultsData);
            return [];
        }

        const drawsResultsWeekly = resultsData.drawsResultsWeekly || [];
        const firestoreReadyResults: Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[] = [];
        const currentYear = getYear(new Date());

        for (const week of drawsResultsWeekly) {
            if (!week.drawResultsDaily) continue;
            for (const dailyResult of week.drawResultsDaily) {
                const dateStr = dailyResult.date;
                const dateParts = dateStr.split(' ');
                // Handle cases like "Lundi 01/07"
                const dayMonth = dateParts.length > 1 ? dateParts[1] : dateParts[0];
                
                let drawDate: Date | null = null;
                try {
                    const parsedDate = dateFnsParse(dayMonth, 'dd/MM', new Date(currentYear, 0, 1));
                     if (isValid(parsedDate) && !isFuture(parsedDate)) {
                        drawDate = parsedDate;
                     } else {
                        // If date is in the future, it's likely from the previous year
                        const pastDate = dateFnsParse(dayMonth, 'dd/MM', new Date(currentYear - 1, 0, 1));
                        if(isValid(pastDate)) drawDate = pastDate;
                     }
                } catch (e) { /* ignore date parse errors */ }

                if (!drawDate) {
                    console.warn(`Could not parse a valid, non-future date from: ${dateStr}`);
                    continue;
                }

                const formattedDate = format(drawDate, 'yyyy-MM-dd');
                const allDrawsForDay = [...(dailyResult.drawResults.standardDraws || []), ...(dailyResult.drawResults.nightDraws || [])];

                for (const draw of allDrawsForDay) {
                   const drawName = draw.drawName ? draw.drawName.trim() : "";
                   if (!drawName) continue;

                   const normalizedApiNameToLookup = drawName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                   const canonicalName = canonicalDrawNameMap.get(normalizedApiNameToLookup);

                   if (!canonicalName) continue;

                   const winningNumbers = draw.winningNumbers?.match(/\d+/g)?.map(Number).slice(0, 5) || [];
                   const machineNumbers = draw.machineNumbers?.match(/\d+/g)?.map(Number).slice(0, 5) || [];

                   if (winningNumbers.length === 5) {
                     firestoreReadyResults.push({
                        apiDrawName: canonicalName,
                        date: formattedDate,
                        winningNumbers: winningNumbers,
                        machineNumbers: machineNumbers.length === 5 ? machineNumbers : [],
                     });
                   }
                }
            }
        }
        return firestoreReadyResults;
    } catch (error) {
        console.error(`Error fetching directly from external API ${url}:`, error);
        return [];
    }
}


async function _saveDrawsToFirestore(draws: Omit<FirestoreDrawDoc, 'fetchedAt'| 'docId'>[]): Promise<void> {
    if (!draws || draws.length === 0) return;

    const batch = writeBatch(db);
    const uniqueDrawsMap = new Map<string, Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>>();

    draws.forEach(draw => {
        const docId = constructLottoResultDocId(draw.date, draw.apiDrawName);
        if (!uniqueDrawsMap.has(docId)) {
            uniqueDrawsMap.set(docId, draw);
        }
    });

    for (const draw of uniqueDrawsMap.values()) {
        const docId = constructLottoResultDocId(draw.date, draw.apiDrawName);
        const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
        
        const dataToSave: Omit<FirestoreDrawDoc, 'docId'> = {
            ...draw,
            fetchedAt: serverTimestamp() as Timestamp,
            machineNumbers: draw.machineNumbers || [],
        };
        
        // Always set with merge to avoid overwriting existing data if run by different contexts
        batch.set(docRef, dataToSave, { merge: true });
    }

    try {
        if (uniqueDrawsMap.size > 0) {
            await batch.commit();
        }
    } catch (error) {
        console.error("Error committing batch writes to Firestore:", error);
    }
}


export interface FetchDrawDataParams {
  drawSlug: string;
  pageSize?: number;
  year?: number;
  month?: number;
  startAfterDoc?: QueryDocumentSnapshot<FirestoreDrawDoc> | null;
}

export interface FetchDrawDataResult {
  results: DrawResult[];
  lastDocSnapshot?: QueryDocumentSnapshot<FirestoreDrawDoc> | null;
}

export const fetchDrawData = async (params: FetchDrawDataParams): Promise<FetchDrawDataResult> => {
  const { drawSlug, pageSize = DEFAULT_PAGE_SIZE, year, month, startAfterDoc = null } = params;
  const canonicalDrawName = getApiDrawNameFromSlug(drawSlug);

  if (!canonicalDrawName) {
    console.error(`Unknown draw slug: ${drawSlug}`);
    return { results: [], lastDocSnapshot: null };
  }

  const queryConstraints: QueryConstraint[] = [
    where("apiDrawName", "==", canonicalDrawName),
    orderBy("date", "desc"),
  ];

  if (year && month) {
    const startDate = startOfMonth(new Date(year, month - 1, 1));
    const endDate = lastDayOfMonth(new Date(year, month - 1, 1));
    queryConstraints.push(where("date", ">=", format(startDate, 'yyyy-MM-dd')));
    queryConstraints.push(where("date", "<=", format(endDate, 'yyyy-MM-dd')));
  } else if (year) {
    queryConstraints.push(where("date", ">=", `${year}-01-01`));
    queryConstraints.push(where("date", "<=", `${year}-12-31`));
  }

  if (startAfterDoc) {
    queryConstraints.push(startAfter(startAfterDoc));
  }

  queryConstraints.push(limit(pageSize));
  const q = query(collection(db, RESULTS_COLLECTION_NAME), ...queryConstraints);
  
  try {
    let querySnapshot = await getDocs(q);

    // If initial query for the page is empty, try to sync from API
    if (querySnapshot.empty && !startAfterDoc) {
        const syncMonth = year && month ? `${year}-${String(month).padStart(2, '0')}` : format(new Date(), 'yyyy-MM');
        const apiData = await _fetchAndProcessExternalApi(syncMonth);
        await _saveDrawsToFirestore(apiData);
        // Retry the query after attempting to sync
        querySnapshot = await getDocs(q);
    }

    const results: DrawResult[] = querySnapshot.docs.map(docSnap => {
      const data = docSnap.data() as FirestoreDrawDoc;
      const dateObj = parseISO(data.date);
      return {
        docId: docSnap.id,
        date: isValid(dateObj) ? format(dateObj, 'PPP', { locale: fr }) : `Date invalide: ${data.date}`,
        winningNumbers: data.winningNumbers,
        machineNumbers: data.machineNumbers && data.machineNumbers.length > 0 ? data.machineNumbers : undefined,
      };
    });
    
    const lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
    
    return { results, lastDocSnapshot: lastVisible };

  } catch (error) {
    console.error(`Error fetching draws for ${canonicalDrawName} (slug: ${drawSlug}):`, error);
    // Return an empty result on error to prevent crashing the UI
    return { results: [], lastDocSnapshot: null };
  }
};


export const fetchHistoricalData = async (drawSlug: string, count: number = 50): Promise<HistoricalDataEntry[]> => {
    const canonicalDrawName = getApiDrawNameFromSlug(drawSlug);
    if (!canonicalDrawName) return [];

    const fetchLimit = Math.min(count, MAX_HISTORICAL_FETCH_LIMIT);

    const q = query(
        collection(db, RESULTS_COLLECTION_NAME),
        where("apiDrawName", "==", canonicalDrawName),
        orderBy("date", "desc"),
        limit(fetchLimit)
    );

    try {
        let querySnapshot = await getDocs(q);

        // If we get no data, try to backfill with API data for the current and previous month
        if (querySnapshot.empty) {
            console.log(`No historical data for ${canonicalDrawName}, attempting to backfill...`);
            const currentMonth = format(new Date(), 'yyyy-MM');
            const prevMonth = format(subMonths(new Date(), 1), 'yyyy-MM');
            const apiDataCurrent = await _fetchAndProcessExternalApi(currentMonth);
            const apiDataPrev = await _fetchAndProcessExternalApi(prevMonth);
            await _saveDrawsToFirestore([...apiDataCurrent, ...apiDataPrev]);
            // Retry query after backfill attempt
            querySnapshot = await getDocs(q);
        }
        
        return querySnapshot.docs.map(doc => {
            const data = doc.data() as FirestoreDrawDoc;
            const dateObj = parseISO(data.date);
            return {
                docId: doc.id,
                drawName: drawSlug,
                date: isValid(dateObj) ? format(dateObj, 'yyyy-MM-dd') : 'Invalid Date', // Return ISO string for processing
                winningNumbers: data.winningNumbers,
                machineNumbers: data.machineNumbers && data.machineNumbers.length > 0 ? data.machineNumbers : [],
            };
        });
    } catch (error) {
        console.error(`Error fetching historical data for ${canonicalDrawName}:`, error);
        return [];
    }
};

export async function fetchNumberCoOccurrence(drawSlug: string, selectedNumber: number, data?: HistoricalDataEntry[]): Promise<NumberCoOccurrence> {
    const historicalData = data || await fetchHistoricalData(drawSlug, MAX_HISTORICAL_FETCH_LIMIT);
    if(historicalData.length === 0) return { selectedNumber, coOccurrences: [] };

    const coOccurrenceMap: Record<number, number> = {};

    historicalData.forEach(entry => {
        const combinedNumbers = [...entry.winningNumbers, ...(entry.machineNumbers || [])];
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
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    return { selectedNumber, coOccurrences };
};

export async function addManualLottoResult(input: ManualLottoResultInput): Promise<string> {
    const { drawSlug, date, winningNumbers, machineNumbers } = input;
    const apiDrawName = getApiDrawNameFromSlug(drawSlug);
    if (!apiDrawName) throw new Error("Invalid draw slug provided.");
    if (!isValid(date)) throw new Error("Invalid date provided.");

    const formattedDate = format(date, 'yyyy-MM-dd');
    const docId = constructLottoResultDocId(formattedDate, apiDrawName);
    const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);

    // Check for duplicates
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        // You can decide to throw an error or just warn and exit
        throw new Error(`Un résultat pour le tirage ${apiDrawName} à la date ${formattedDate} existe déjà.`);
    }

    const dataToSave: Omit<FirestoreDrawDoc, 'docId'> = {
        apiDrawName,
        date: formattedDate,
        winningNumbers,
        machineNumbers: machineNumbers || [],
        fetchedAt: serverTimestamp() as Timestamp
    };

    await setDoc(docRef, dataToSave);
    return docId;
}

export async function updateLottoResult(docId: string, input: ManualLottoResultInput): Promise<void> {
    const { drawSlug, date, winningNumbers, machineNumbers } = input;
    const apiDrawName = getApiDrawNameFromSlug(drawSlug);
    if (!apiDrawName) throw new Error("Invalid draw slug provided.");
    if (!isValid(date)) throw new Error("Invalid date provided.");

    const newFormattedDate = format(date, 'yyyy-MM-dd');
    const newDocId = constructLottoResultDocId(newFormattedDate, apiDrawName);
    
    const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
    
    const dataToUpdate = {
        apiDrawName,
        date: newFormattedDate,
        winningNumbers,
        machineNumbers: machineNumbers || [],
        fetchedAt: serverTimestamp() as Timestamp, // Update the timestamp
    };

    if (docId !== newDocId) {
        // Date or Draw Name has changed, which changes the document ID.
        // We must delete the old document and create a new one.
        const newDocRef = doc(db, RESULTS_COLLECTION_NAME, newDocId);
        const newDocSnap = await getDoc(newDocRef);
        if (newDocSnap.exists()) {
            throw new Error(`Un autre résultat pour le tirage ${apiDrawName} à la date ${newFormattedDate} existe déjà.`);
        }
        
        const batch = writeBatch(db);
        batch.delete(docRef); // Delete the old document
        batch.set(newDocRef, dataToUpdate); // Create the new one
        await batch.commit();

    } else {
        // The ID hasn't changed, we can just update the existing document.
        await updateDoc(docRef, dataToUpdate);
    }
}


export async function deleteLottoResult(docId: string): Promise<void> {
    const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
    await deleteDoc(docRef);
}

export async function fetchRecentLottoResults(count: number): Promise<FirestoreDrawDoc[]> {
    const q = query(
        collection(db, RESULTS_COLLECTION_NAME),
        orderBy("fetchedAt", "desc"),
        limit(count)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc));
}


export async function savePredictionFeedback(feedback: Omit<PredictionFeedback, 'createdAt' | 'id'>): Promise<void> {
    try {
        await addDoc(collection(db, PREDICTION_FEEDBACK_COLLECTION_NAME), {
            ...feedback,
            createdAt: serverTimestamp() as Timestamp,
        });
    } catch (error) {
        console.error("Error saving prediction feedback:", error);
        // Optionally re-throw or handle as needed by the UI
    }
}


/**
 * Fetches a single lotto result by its document ID.
 */
export async function fetchLottoResultById(docId: string): Promise<FirestoreDrawDoc | null> {
    const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { docId: docSnap.id, ...docSnap.data() } as FirestoreDrawDoc;
        }
        return null;
    } catch (error) {
        console.error(`Error fetching document with ID ${docId}:`, error);
        throw error;
    }
}

    