
import type { DrawResult, HistoricalDataEntry, FirestoreDrawDoc, ManualLottoResultInput } from '@/types/loto';
import { DRAW_SCHEDULE, ALL_DRAW_NAMES_MAP, DRAW_SLUG_BY_SIMPLE_NAME_MAP, getDrawNameBySlug } from '@/lib/lotoDraws.tsx';
import { format, subMonths, parse as dateFnsParse, isValid, getYear, parseISO, lastDayOfMonth, startOfMonth } from 'date-fns';
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
  QueryConstraint,
  DocumentSnapshot,
  QueryDocumentSnapshot
} from "firebase/firestore";

const RESULTS_COLLECTION_NAME = 'lottoResults';
const DEFAULT_PAGE_SIZE = 10;

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
  let formattedDate = date;
  try {
    let parsedDateObj;
    if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        parsedDateObj = parseISO(date);
    } else if (date.includes('.')) { // Handle 'PPP' format like "13 mai. 2025"
        // Attempt to parse it, might need more robust handling if months are abbreviated differently
        parsedDateObj = dateFnsParse(date, 'PPP', new Date(), { locale: fr });
    } else { // Fallback, try direct ISO parsing
        parsedDateObj = parseISO(date);
    }
    
    if (isValid(parsedDateObj)) {
        formattedDate = format(parsedDateObj, 'yyyy-MM-dd');
    } else {
        // console.warn("Date parsing for doc ID failed (constructLottoResultDocId):", date, ". Using original value after basic sanitization.");
        formattedDate = date.replace(/[^0-9-]/g, ''); // Basic sanitization
    }
  } catch (e) {
    // console.warn("Date parsing for doc ID threw error (constructLottoResultDocId):", date, e, ". Using original value after basic sanitization.");
    formattedDate = date.replace(/[^0-9-]/g, ''); // Basic sanitization
  }
  const normalizedIdNamePart = normalizeApiDrawNameForDocId(apiDrawName);
  return `${formattedDate}_${normalizedIdNamePart}`;
}


function parseApiDate(apiDateString: string, contextYear: number): string | null {
  const dayMonthMatch = apiDateString.match(/(\d{2}\/\d{2})$/);
  if (!dayMonthMatch || !dayMonthMatch[1]) {
    // console.warn("Could not extract day/month from API date string:", apiDateString);
    return null;
  }
  const dayMonth = dayMonthMatch[1]; // e.g., "25/07"

  if (isNaN(contextYear) || contextYear < 1900 || contextYear > 2100) {
      // console.warn("Invalid contextYear for API date parsing:", contextYear);
      return null;
  }
  // The API date string seems to be 'jour. DD/MM' e.g. 'Jeu. 25/07'
  // We just need DD/MM from it.
  const parsedDate = dateFnsParse(`${dayMonth}/${contextYear}`, 'dd/MM/yyyy', new Date(contextYear, 0, 1)); // Use a fixed date for parsing context
  return isValid(parsedDate) ? format(parsedDate, 'yyyy-MM-dd') : null;
}

function parseNumbersString(numbersStr: string | null | undefined): number[] {
  if (!numbersStr || typeof numbersStr !== 'string') return [];
  return (numbersStr.match(/\d+/g) || []).map(Number).slice(0, 5);
}


async function _saveDrawsToFirestore(draws: Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[]): Promise<void> {
  if (!draws.length) return;

  const currentUser = auth.currentUser;
  const batch = writeBatch(db);
  const unauthenticatedWritePromises: Array<Promise<void>> = [];

  // Deduplicate before saving to Firestore for this specific batch from API
  const uniqueDrawsForMonthMap = new Map<string, Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>>();
  draws.forEach(r => {
    // Ensure date is YYYY-MM-DD before constructing ID
    const dateForId = r.date.match(/^\d{4}-\d{2}-\d{2}$/) ? r.date : format(parseISO(r.date), 'yyyy-MM-dd');
    const uniqueKey = constructLottoResultDocId(dateForId, r.apiDrawName);
    if (!uniqueDrawsForMonthMap.has(uniqueKey)) {
        uniqueDrawsForMonthMap.set(uniqueKey, r);
    }
  });
  const uniqueDraws = Array.from(uniqueDrawsForMonthMap.values());


  for (const draw of uniqueDraws) {
    // Ensure date is YYYY-MM-DD before constructing ID for Firestore document
    const dateForDoc = draw.date.match(/^\d{4}-\d{2}-\d{2}$/) ? draw.date : format(parseISO(draw.date), 'yyyy-MM-dd');
    const docId = constructLottoResultDocId(dateForDoc, draw.apiDrawName);
    const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
    const dataToSave: Omit<FirestoreDrawDoc, 'docId'> = {
      ...draw,
      date: dateForDoc, // Ensure YYYY-MM-DD
      fetchedAt: serverTimestamp() as Timestamp,
      machineNumbers: draw.machineNumbers || [],
    };

    if (currentUser) {
      batch.set(docRef, dataToSave, { merge: true });
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
    if (currentUser && uniqueDraws.length > 0) {
      // Check if batch has operations for current user; batch.set doesn't expose length.
      // A bit of a hack: if uniqueDraws has items and user is logged in, we assume batch has ops.
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

    // Use the year from the yearMonth parameter for context, not from API response
    const contextYear = parseInt(yearMonth.split('-')[0], 10);
     if (isNaN(contextYear) || contextYear < 1900 || contextYear > 2100) {
        // console.error("Invalid year derived from yearMonth for API parsing:", yearMonth);
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

            const normalizedApiNameToLookup = apiDrawNameFromPayload
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .trim();

            const resolvedCanonicalName = canonicalDrawNameMap.get(normalizedApiNameToLookup);
            if (!resolvedCanonicalName) continue;

            // Skip if winningNumbers starts with a period (malformed data)
            if (draw.winningNumbers && typeof draw.winningNumbers === 'string' && draw.winningNumbers.startsWith('.')) continue;

            const winningNumbers = parseNumbersString(draw.winningNumbers);
            const machineNumbersParsed = parseNumbersString(draw.machineNumbers);

            if (winningNumbers.length === 5) {
              parsedResults.push({
                apiDrawName: resolvedCanonicalName,
                date: parsedDate, // Should be YYYY-MM-DD format
                winningNumbers: winningNumbers,
                machineNumbers: machineNumbersParsed.length === 5 ? machineNumbersParsed : [],
              });
            }
          }
        }
      }
    }
    if (parsedResults.length > 0) await _saveDrawsToFirestore(parsedResults);
    return parsedResults;
  } catch (error) {
    // console.error(`Error fetching or parsing data for ${yearMonth}:`, error);
    return [];
  }
}

// Content-based deduplication helper
const deduplicateByContentAndYear = (docs: FirestoreDrawDoc[]): FirestoreDrawDoc[] => {
  const contentSignatureMap = new Map<string, FirestoreDrawDoc>();
  docs.forEach(doc => {
    if (!doc.date || !doc.apiDrawName || !doc.winningNumbers) return; // Skip if essential data is missing

    const dateObj = parseISO(doc.date); // doc.date is YYYY-MM-DD
    if (!isValid(dateObj)) return; // Skip if date is invalid

    const day = format(dateObj, 'dd');
    const month = format(dateObj, 'MM');
    const year = getYear(dateObj);

    const wnString = [...doc.winningNumbers].sort((a, b) => a - b).join(',');
    const mnString = doc.machineNumbers && doc.machineNumbers.length > 0 ? [...doc.machineNumbers].sort((a, b) => a - b).join(',') : 'none';
    const contentSignature = `${doc.apiDrawName}-${day}-${month}-${wnString}-${mnString}`;

    const existingEntry = contentSignatureMap.get(contentSignature);
    if (!existingEntry || year > getYear(parseISO(existingEntry.date))) {
      contentSignatureMap.set(contentSignature, doc);
    } else if (year === getYear(parseISO(existingEntry.date))) {
      // If same year, prefer the one with a more recent fetchedAt timestamp
      if (doc.fetchedAt && existingEntry.fetchedAt && doc.fetchedAt.toMillis() > existingEntry.fetchedAt.toMillis()) {
        contentSignatureMap.set(contentSignature, doc);
      } else if (doc.fetchedAt && !existingEntry.fetchedAt) {
        contentSignatureMap.set(contentSignature, doc); // Prefer if new one has fetchedAt and old one doesn't
      }
    }
  });
  return Array.from(contentSignatureMap.values());
};


export interface FetchDrawDataParams {
  drawSlug: string;
  pageSize?: number;
  year?: number;
  month?: number; // 1-12
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
    throw new Error(`Unknown draw slug: ${drawSlug}`);
  }

  let firestoreDocSnapshots: QueryDocumentSnapshot<FirestoreDrawDoc>[] = [];
  const queryConstraints: QueryConstraint[] = [
    where("apiDrawName", "==", canonicalDrawName),
  ];

  if (year && month) {
    const monthStartDate = startOfMonth(new Date(year, month - 1, 1));
    const monthEndDate = lastDayOfMonth(monthStartDate);
    queryConstraints.push(where("date", ">=", format(monthStartDate, 'yyyy-MM-dd')));
    queryConstraints.push(where("date", "<=", format(monthEndDate, 'yyyy-MM-dd')));
  }

  queryConstraints.push(orderBy("date", "desc"));
  // Do not sort by fetchedAt in the main query if date is the primary sort for filters.
  // Secondary sort by fetchedAt can be done after deduplication if needed.
  // queryConstraints.push(orderBy("fetchedAt", "desc"));
  queryConstraints.push(limit(pageSize));

  if (startAfterDoc) {
    queryConstraints.push(startAfter(startAfterDoc));
  }

  const q = query(collection(db, RESULTS_COLLECTION_NAME), ...queryConstraints);

  try {
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(doc => firestoreDocSnapshots.push(doc as QueryDocumentSnapshot<FirestoreDrawDoc>));
  } catch (error) {
    // console.error(`Error fetching draws for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore:`, error);
  }

  // API Sync Logic (only if no filters are applied and Firestore data is potentially stale/insufficient for the first page)
  if (!year && !month && !startAfterDoc && firestoreDocSnapshots.length < pageSize) {
    let attempts = 0;
    const MONTHS_TO_CHECK_API = 3;
    let currentDateIter = new Date();

    if (firestoreDocSnapshots.length > 0) {
        const oldestFirestoreDateStr = firestoreDocSnapshots[firestoreDocSnapshots.length - 1].data().date;
        try {
            currentDateIter = parseISO(oldestFirestoreDateStr);
        } catch (e) { /* parsing failed, default to current month */ }
    }

    while (attempts < MONTHS_TO_CHECK_API) {
      const yearMonthToFetch = format(currentDateIter, 'yyyy-MM');
      await _fetchAndParseMonthData(yearMonthToFetch);
      currentDateIter = subMonths(currentDateIter, 1);
      attempts++;
      if (attempts < MONTHS_TO_CHECK_API) await new Promise(resolve => setTimeout(resolve, 250));
    }

    try {
      firestoreDocSnapshots = []; // Clear previous results
      const querySnapshotAfterSync = await getDocs(q); // Re-run the original query
      querySnapshotAfterSync.forEach(doc => firestoreDocSnapshots.push(doc as QueryDocumentSnapshot<FirestoreDrawDoc>));
    } catch (error) {
      // console.error(`Error re-fetching draws from Firestore after API sync for ${canonicalDrawName}:`, error);
    }
  }

  // Extract data and perform deduplication
  let firestoreDocsData = firestoreDocSnapshots.map(snap => ({ docId: snap.id, ...snap.data() } as FirestoreDrawDoc));

  // Deduplication: First by docId, then by content signature preferring most recent year
  const uniqueByDocIdMap = new Map<string, FirestoreDrawDoc>();
  firestoreDocsData.forEach(doc => {
    if (doc.docId && !uniqueByDocIdMap.has(doc.docId)) { // Ensure docId is present
      uniqueByDocIdMap.set(doc.docId, doc);
    }
  });
  let processedDocs = Array.from(uniqueByDocIdMap.values());
  processedDocs = deduplicateByContentAndYear(processedDocs);

  // Sort again after deduplication for final presentation order
  processedDocs.sort((a, b) => {
    const dateComparison = b.date.localeCompare(a.date);
    if (dateComparison !== 0) return dateComparison;
    if (a.fetchedAt && b.fetchedAt) {
      return b.fetchedAt.toMillis() - a.fetchedAt.toMillis();
    }
    return 0;
  });

  // The number of results to return should match the pageSize, unless it's the last page
  // However, if filtering, we return what we found up to pageSize
  // If not filtering and after sync, we should have pageSize results unless DB is small.
  // The final slice should be after sorting and deduplication.
  // The number of docs to return is already handled by the `limit(pageSize)` in the query
  // and the fact that `processedDocs` is derived from `firestoreDocSnapshots`.

  const finalResults = processedDocs
    .map(doc => {
      const drawDateObject = dateFnsParse(doc.date, 'yyyy-MM-dd', new Date());
      return {
        docId: doc.docId || constructLottoResultDocId(doc.date, doc.apiDrawName),
        date: isValid(drawDateObject) ? format(drawDateObject, 'PPP', { locale: fr }) : 'Date invalide',
        winningNumbers: doc.winningNumbers,
        machineNumbers: doc.machineNumbers && doc.machineNumbers.length > 0 ? doc.machineNumbers : undefined,
      };
    });

  const lastVisibleSnapshot = firestoreDocSnapshots.length === pageSize ? firestoreDocSnapshots[firestoreDocSnapshots.length - 1] : null;


  if (finalResults.length === 0 && !year && !month && !startAfterDoc) {
    // console.warn(`No data found for draw ${canonicalDrawName} (slug: ${drawSlug}) after checking Firestore and API.`);
  }

  return {
    results: finalResults,
    lastDocSnapshot: lastVisibleSnapshot,
  };
};


export const fetchHistoricalData = async (drawSlug: string, count: number = 50): Promise<HistoricalDataEntry[]> => {
  const canonicalDrawName = getApiDrawNameFromSlug(drawSlug);
  if (!canonicalDrawName) {
    return [];
  }

  let firestoreDocs: FirestoreDrawDoc[] = [];
  try {
    const q = query(
      collection(db, RESULTS_COLLECTION_NAME),
      where("apiDrawName", "==", canonicalDrawName),
      orderBy("date", "desc"),
      orderBy("fetchedAt", "desc"),
      limit(count * 2) // Fetch more for robust deduplication
    );
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(doc => firestoreDocs.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc));
  } catch (error) {
    // console.error(`Error fetching historical data for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore:`, error);
  }

  // Simplified API Sync for historical data - only if initial fetch is very low
  if (firestoreDocs.length < Math.min(count, 10)) { // Sync if we have less than 10 or requested count initially
    const needed = count - firestoreDocs.length;
    const estimatedDrawsPerMonthOfType = 4;
    let monthsToFetch = Math.min(12, Math.max(1, Math.ceil(needed / estimatedDrawsPerMonthOfType) + 2));

    let dateToFetch = firestoreDocs.length > 0 && firestoreDocs[firestoreDocs.length - 1]?.date
        ? subMonths(dateFnsParse(firestoreDocs[firestoreDocs.length - 1].date, 'yyyy-MM-dd', new Date()),1)
        : subMonths(new Date(), 1);

    for (let i = 0; i < monthsToFetch; i++) {
      const yearMonthToFetch = format(dateToFetch, 'yyyy-MM');
      await _fetchAndParseMonthData(yearMonthToFetch);
      dateToFetch = subMonths(dateToFetch, 1);
      if (i > 0 && i % 3 === 0) await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit API calls
    }

    // Re-fetch from Firestore after API sync
    try {
      const qAfterSync = query(
        collection(db, RESULTS_COLLECTION_NAME),
        where("apiDrawName", "==", canonicalDrawName),
        orderBy("date", "desc"),
        orderBy("fetchedAt", "desc"),
        limit(count * 2) // Fetch more again
      );
      const querySnapshotAfterSync = await getDocs(qAfterSync);
      firestoreDocs = []; // Clear previous results
      querySnapshotAfterSync.forEach(doc => firestoreDocs.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc));
    } catch (error) {
      // console.error(`Error re-fetching historical data for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore after API sync:`, error);
    }
  }

  // Deduplication
  const uniqueByDocIdMap = new Map<string, FirestoreDrawDoc>();
  firestoreDocs.forEach(doc => {
    if (doc.docId && !uniqueByDocIdMap.has(doc.docId)) {
      uniqueByDocIdMap.set(doc.docId, doc);
    } else if (!doc.docId) { // Fallback if docId is somehow missing
        const tempKey = constructLottoResultDocId(doc.date, doc.apiDrawName);
        if (!uniqueByDocIdMap.has(tempKey)) uniqueByDocIdMap.set(tempKey, {...doc, docId: tempKey});
    }
  });

  let processedDocs = Array.from(uniqueByDocIdMap.values());
  processedDocs = deduplicateByContentAndYear(processedDocs);

  // Final sort and slice
  processedDocs.sort((a, b) => {
      const dateComparison = b.date.localeCompare(a.date);
      if (dateComparison !== 0) return dateComparison;
      if (a.fetchedAt && b.fetchedAt) {
          return b.fetchedAt.toMillis() - a.fetchedAt.toMillis();
      }
      return 0;
  });

  return processedDocs.slice(0, count).map(entry => {
    const entryDateObj = dateFnsParse(entry.date, 'yyyy-MM-dd', new Date());
    return {
      docId: entry.docId || constructLottoResultDocId(entry.date, entry.apiDrawName),
      drawName: drawSlug, // This is the drawSlug
      date: isValid(entryDateObj) ? format(entryDateObj, 'PPP', { locale: fr }) : 'Date invalide',
      winningNumbers: entry.winningNumbers,
      machineNumbers: entry.machineNumbers && entry.machineNumbers.length > 0 ? entry.machineNumbers : undefined,
    };
  });
};

export async function fetchNumberFrequency(drawSlug: string, data?: HistoricalDataEntry[]): Promise<NumberFrequency[]> {
  const historicalData = data || await fetchHistoricalData(drawSlug, 50); // Fetch 50 by default for stats
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
    .sort((a, b) => b.frequency - a.frequency || a.number - b.number); // Sort by frequency, then by number
};

export async function fetchNumberCoOccurrence(drawSlug: string, selectedNumber: number, data?: HistoricalDataEntry[]): Promise<NumberCoOccurrence> {
  const historicalData = data || await fetchHistoricalData(drawSlug, 50); // Fetch 50 by default
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
    .sort((a, b) => b.count - a.count || a.number - b.number) // Sort by count, then by number
    .slice(0, 10); // Top 10 co-occurrences

  return { selectedNumber, coOccurrences };
};


export const fetchRecentLottoResults = async (count: number = 20): Promise<FirestoreDrawDoc[]> => {
  try {
    const q = query(
      collection(db, RESULTS_COLLECTION_NAME),
      orderBy("date", "desc"),
      orderBy("fetchedAt", "desc"), // Secondary sort for admin view
      limit(count * 2) // Fetch more for deduplication
    );
    const querySnapshot = await getDocs(q);
    let firestoreResults: FirestoreDrawDoc[] = [];
    querySnapshot.forEach(doc => {
        firestoreResults.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc)
    });

    // Deduplication
    const uniqueByDocIdMap = new Map<string, FirestoreDrawDoc>();
    firestoreResults.forEach(doc => {
        if (doc.docId && !uniqueByDocIdMap.has(doc.docId)) {
        uniqueByDocIdMap.set(doc.docId, doc);
        } else if (!doc.docId) {
            const tempKey = constructLottoResultDocId(doc.date, doc.apiDrawName);
            if (!uniqueByDocIdMap.has(tempKey)) uniqueByDocIdMap.set(tempKey, {...doc, docId: tempKey});
        }
    });
    let processedDocs = Array.from(uniqueByDocIdMap.values());
    processedDocs = deduplicateByContentAndYear(processedDocs);


    return processedDocs
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
    // Deduplication for export
    const uniqueByDocIdMap = new Map<string, FirestoreDrawDoc>();
    results.forEach(doc => {
        if (doc.docId && !uniqueByDocIdMap.has(doc.docId)) {
        uniqueByDocIdMap.set(doc.docId, doc);
        } else if (!doc.docId) {
            const tempKey = constructLottoResultDocId(doc.date, doc.apiDrawName);
            if (!uniqueByDocIdMap.has(tempKey)) uniqueByDocIdMap.set(tempKey, {...doc, docId: tempKey});
        }
    });
    let processedDocs = Array.from(uniqueByDocIdMap.values());
    processedDocs = deduplicateByContentAndYear(processedDocs);

    return processedDocs.sort((a,b) => b.date.localeCompare(a.date));
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
    // console.error("Error deleting lotto result:", error);
    throw error; // Re-throw to be handled by caller
  }
};

export async function addManualLottoResult(input: ManualLottoResultInput): Promise<void> {
  const canonicalDrawName = getApiDrawNameFromSlug(input.drawSlug);
  if (!canonicalDrawName) throw new Error(`Slug de tirage invalide: ${input.drawSlug}`);

  const formattedDate = format(input.date, 'yyyy-MM-dd'); // Ensure YYYY-MM-DD for storage
  const docId = constructLottoResultDocId(formattedDate, canonicalDrawName);

  const dataToSave: Omit<FirestoreDrawDoc, 'docId'> = {
    apiDrawName: canonicalDrawName,
    date: formattedDate,
    winningNumbers: input.winningNumbers,
    machineNumbers: input.machineNumbers || [], // Ensure it's an array
    fetchedAt: serverTimestamp() as Timestamp, // Use server timestamp for consistency
  };

  const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    throw new Error(`Un résultat pour le tirage "${getDrawNameBySlug(input.drawSlug) || canonicalDrawName}" à la date du ${format(input.date, 'PPP', {locale: fr})} existe déjà (ID: ${docId}).`);
  }
  await setDoc(docRef, dataToSave);
}
