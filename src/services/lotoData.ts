
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

// Create a map for canonical draw names to handle variations (e.g., accents, case)
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
    // Also map the original name to itself in case it's already canonical and used for lookup
    if (!canonicalDrawNameMap.has(canonicalName.toLowerCase().trim())) {
      canonicalDrawNameMap.set(canonicalName.toLowerCase().trim(), canonicalName);
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


function _parseNumbersString(numbersStr: string | null | undefined): number[] {
  if (!numbersStr || typeof numbersStr !== 'string') {
    return [];
  }
  return (numbersStr.match(/\d+/g) || []).map(Number).slice(0, 5);
}

export interface FirestoreDrawDoc {
  apiDrawName: string; 
  date: string; // YYYY-MM-DD
  winningNumbers: number[];
  machineNumbers: number[]; // Ensure it's always an array, possibly empty
  fetchedAt: Timestamp;
}

const _saveDrawsToFirestore = async (draws: Omit<FirestoreDrawDoc, 'fetchedAt'>[]): Promise<void> => {
  if (!draws.length) return;
  const batch = writeBatch(db);
  draws.forEach(draw => {
    const normalizedIdNamePart = draw.apiDrawName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") 
        .replace(/\s+/g, '_') 
        .replace(/[^\w-]/g, ''); 

    const docId = `${draw.date}_${normalizedIdNamePart}`;
    const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
    
    const dataToSave: FirestoreDrawDoc = { 
      ...draw, 
      fetchedAt: serverTimestamp() as Timestamp
    };
    batch.set(docRef, dataToSave, { merge: true }); 
  });
  try {
    await batch.commit();
  } catch (error) {
    console.error("Error saving draws to Firestore:", error);
  }
};

async function _fetchAndParseMonthData(yearMonth: string): Promise<Omit<FirestoreDrawDoc, 'fetchedAt'>[]> {
  const url = `${API_BASE_URL}?month=${yearMonth}`;
  try {
    const response = await fetch(url, { headers: API_HEADERS });
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status} for ${url}`);
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


    const parsedResults: Omit<FirestoreDrawDoc, 'fetchedAt'>[] = [];

    for (const week of data.drawsResultsWeekly) {
      for (const dailyResult of week.drawResultsDaily) {
        const apiDateStr = dailyResult.date; 
        const parsedDate = _parseApiDate(apiDateStr, contextYear); 
        
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

            const winningNumbers = _parseNumbersString(draw.winningNumbers);
            const machineNumbersParsed = _parseNumbersString(draw.machineNumbers);

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
  }

  let attempts = 0;
  const MAX_API_ATTEMPTS = 3; 
  let currentDateIter = new Date();
  let fetchedFromApiAndSaved = false;


  while (attempts < MAX_API_ATTEMPTS) {
    const yearMonth = format(currentDateIter, 'yyyy-MM');
    await _fetchAndParseMonthData(yearMonth); 
    fetchedFromApiAndSaved = true; 

    try {
        const qCheck = query(
          collection(db, RESULTS_COLLECTION_NAME), 
          where("apiDrawName", "==", canonicalDrawName),
          where("date", ">=", format(new Date(currentDateIter.getFullYear(), currentDateIter.getMonth(), 1), 'yyyy-MM-dd')),
          where("date", "<=", format(new Date(currentDateIter.getFullYear(), currentDateIter.getMonth() + 1, 0), 'yyyy-MM-dd')), 
          orderBy("date", "desc"), 
          limit(1)
        );
        const checkSnapshot = await getDocs(qCheck);
        if (!checkSnapshot.empty) {
           const firestoreDoc = checkSnapshot.docs[0].data() as FirestoreDrawDoc;
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

  if (fetchedFromApiAndSaved) {
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
      console.error(`Error fetching latest draw for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore after API sync:`, error);
    }
  }
  
  throw new Error(`No data found for draw ${canonicalDrawName} (slug: ${drawSlug}) after checking Firestore and API.`);
};

export const fetchHistoricalData = async (drawSlug: string, count: number = 20): Promise<HistoricalDataEntry[]> => {
  const canonicalDrawName = _getApiDrawNameFromSlug(drawSlug);
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
      firestoreResults.push(doc.data() as FirestoreDrawDoc);
    });
  } catch (error) {
    console.error(`Error fetching historical data for ${canonicalDrawName} from Firestore:`, error);
  }

  if (firestoreResults.length < count) {
    const needed = count - firestoreResults.length;
    const estimatedDrawsPerMonthOfType = 5; 
    let monthsToFetch = Math.min(12, Math.max(1, Math.ceil(needed / estimatedDrawsPerMonthOfType) )); 
    
    let dateToFetch = firestoreResults.length > 0 
        ? subMonths(dateFnsParse(firestoreResults[firestoreResults.length - 1].date, 'yyyy-MM-dd', new Date()),1) 
        : new Date(); 

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
      const querySnapshot = await getDocs(q);
      firestoreResults = []; 
      querySnapshot.forEach(doc => {
        firestoreResults.push(doc.data() as FirestoreDrawDoc);
      });
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

/**
 * Fetches a specified number of recent lottery results from Firestore, across all draw types.
 * @param count The number of recent results to fetch.
 * @returns A promise that resolves to an array of FirestoreDrawDoc.
 */
export const fetchRecentLottoResults = async (count: number = 20): Promise<FirestoreDrawDoc[]> => {
  try {
    const q = query(
      collection(db, RESULTS_COLLECTION_NAME),
      orderBy("date", "desc"), // Order by date string (YYYY-MM-DD)
      // Consider adding a secondary sort by fetchedAt if dates can be identical and order matters
      // orderBy("fetchedAt", "desc"), 
      limit(count)
    );
    const querySnapshot = await getDocs(q);
    const results: FirestoreDrawDoc[] = [];
    querySnapshot.forEach(doc => {
      results.push(doc.data() as FirestoreDrawDoc);
    });
    return results;
  } catch (error) {
    console.error("Error fetching recent lotto results from Firestore:", error);
    return []; // Return empty array on error
  }
};

