
import type { DrawResult, HistoricalDataEntry, FirestoreDrawDoc, ManualLottoResultInput } from '@/types/loto';
import { DRAW_SCHEDULE, ALL_DRAW_NAMES_MAP, DRAW_SLUG_BY_SIMPLE_NAME_MAP, getDrawNameBySlug } from '@/lib/lotoDraws.tsx';
import { format, subMonths, parse as dateFnsParse, isValid, getYear, parseISO, lastDayOfMonth, startOfMonth, isFuture, getMonth as dateFnsGetMonth, formatISO } from 'date-fns';
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
  type QueryConstraint,
  type QueryDocumentSnapshot
} from "firebase/firestore";

const RESULTS_COLLECTION_NAME = 'lottoResults';
const DEFAULT_PAGE_SIZE = 10;
const MAX_HISTORICAL_FETCH_LIMIT = 100;

// Map to convert API's simple draw names (e.g., "Réveil") to canonical names used in Firestore.
// It also handles normalization (lowercase, accent removal).
const canonicalDrawNameMap = new Map<string, string>();
DRAW_SCHEDULE.forEach(daySchedule => {
  daySchedule.draws.forEach(draw => {
    const canonicalName = draw.name; // e.g., "Réveil"
    // Normalize for lookup: lowercase, remove accents
    const normalizedKey = canonicalName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    if (!canonicalDrawNameMap.has(normalizedKey)) {
      canonicalDrawNameMap.set(normalizedKey, canonicalName);
    }
    // Also map the original simple name if it's different from normalized, just in case
     if (draw.name.trim().toLowerCase() !== normalizedKey && !canonicalDrawNameMap.has(draw.name.trim().toLowerCase())) {
        canonicalDrawNameMap.set(draw.name.trim().toLowerCase(), draw.name);
    }
  });
});


export function getApiDrawNameFromSlug(drawSlug: string): string | undefined {
  for (const daySchedule of DRAW_SCHEDULE) {
    for (const draw of daySchedule.draws) {
      if (draw.slug === drawSlug) {
        // The draw.name from DRAW_SCHEDULE is already the canonical one we want to store
        return draw.name;
      }
    }
  }
  return undefined;
}

function normalizeApiDrawNameForDocId(apiDrawName: string): string {
 return apiDrawName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, '_')
    .replace(/[^\w-]/g, '');
}

export function constructLottoResultDocId(date: string, apiDrawName: string): string {
  let formattedDate = date; // Assume date is already YYYY-MM-DD
  try {
    const parsedDateObj = parseISO(date); // Ensure it's a valid ISO date string
    if (!isValid(parsedDateObj)) {
        // Fallback for other potential formats if direct ISO parse fails, though it shouldn't at this stage
        let tempDate;
        if (date.includes('.')) {
             tempDate = dateFnsParse(date, 'PPP', new Date(), { locale: fr });
        } else if (date.includes('/')) {
             const parts = date.split('/');
            if (parts.length === 3) {
                tempDate = parts[2].length === 4 ? dateFnsParse(date, 'dd/MM/yyyy', new Date()) : dateFnsParse(date, 'dd/MM/yy', new Date());
            }
        }
        if (tempDate && isValid(tempDate)) formattedDate = format(tempDate, 'yyyy-MM-dd');
        else formattedDate = date.replace(/[^0-9-]/g, ''); // Sanitize if all else fails
    }
  } catch (e) {
    formattedDate = date.replace(/[^0-9-]/g, '');
  }
  const normalizedIdNamePart = normalizeApiDrawNameForDocId(apiDrawName);
  return `${formattedDate}_${normalizedIdNamePart}`;
}

// Interface for the data structure returned by our internal /api/loto-results
interface InternalApiDrawResult {
  draw_name: string; // Simple name like "Réveil"
  date: string; // YYYY-MM-DD
  gagnants: number[];
  machine: number[];
}

// Fetches data from our internal /api/loto-results endpoint, which acts as a proxy
// to the external lottery data source (https://lotobonheur.ci/api/results).
// This function is responsible for retrieving the raw, processed results from the external source.
async function _fetchDataFromInternalApi(yearMonth?: string): Promise<Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[]> {
  let url = '/api/loto-results';
  if (yearMonth) { // yearMonth expected as YYYY-MM
    url += `?month=${yearMonth}`;
  }

  try {
    // console.log(`LotoData: Calling internal API: ${url}`);
    const response = await fetch(url, { cache: 'no-store' }); // Ensure fresh data from internal API too
    if (!response.ok) {
      console.error(`LotoData: Error fetching from internal API ${url}. Status: ${response.status}`);
      const errorBody = await response.text();
      console.error(`LotoData: Internal API error body: ${errorBody}`);
      return [];
    }
    const internalApiResults: InternalApiDrawResult[] = await response.json();
    
    if (!Array.isArray(internalApiResults)) {
        console.error('LotoData: Internal API did not return an array. Response:', internalApiResults);
        return [];
    }

    // console.log(`LotoData: Received ${internalApiResults.length} results from internal API ${url}`);
    
    // Map to FirestoreDrawDoc structure
    const firestoreReadyResults: Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[] = [];
    for (const rawDraw of internalApiResults) {
      const normalizedApiNameToLookup = rawDraw.draw_name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
      
      const canonicalName = canonicalDrawNameMap.get(normalizedApiNameToLookup);

      if (!canonicalName) {
        // console.warn(`LotoData: Skipping draw from internal API "${rawDraw.draw_name}" (normalized: "${normalizedApiNameToLookup}") for date ${rawDraw.date} as it's not in canonicalDrawNameMap.`);
        continue;
      }

      if (!rawDraw.date || !isValid(parseISO(rawDraw.date))) {
        // console.warn(`LotoData: Skipping draw from internal API "${canonicalName}" due to invalid date: ${rawDraw.date}`);
        continue;
      }
      
      firestoreReadyResults.push({
        apiDrawName: canonicalName,
        date: rawDraw.date, // Already YYYY-MM-DD
        winningNumbers: rawDraw.gagnants,
        machineNumbers: rawDraw.machine || [], // Ensure it's an array
      });
    }
    return firestoreReadyResults;

  } catch (error) {
    console.error(`LotoData: Error calling or processing data from internal API ${url}:`, error);
    return [];
  }
}

// Saves the draws (fetched from the external source via the internal API) into the Firestore database.
// This function handles the "synchronization" part, ensuring Firestore is updated with the latest results.
async function _saveDrawsToFirestore(draws: Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[]): Promise<void> {
  if (!draws || !draws.length) return;

  const currentUser = auth.currentUser;
  const batch = writeBatch(db);
  const unauthenticatedWritePromises: Array<Promise<void>> = [];

  const uniqueDrawsForPayloadMap = new Map<string, Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>>();
  draws.forEach(r => {
    const uniqueKey = constructLottoResultDocId(r.date, r.apiDrawName); // Date is YYYY-MM-DD
    const existing = uniqueDrawsForPayloadMap.get(uniqueKey);
    // Prefer new entry if existing has no machine numbers and new one does, or if it's simply not there.
    if (!existing || (r.machineNumbers && r.machineNumbers.length > 0 && (!existing.machineNumbers || existing.machineNumbers.length === 0))) {
      uniqueDrawsForPayloadMap.set(uniqueKey, r);
    }
  });
  const uniqueDraws = Array.from(uniqueDrawsForPayloadMap.values());

  for (const draw of uniqueDraws) {
    const docId = constructLottoResultDocId(draw.date, draw.apiDrawName);
    const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);

    const dataToSave: Omit<FirestoreDrawDoc, 'docId'> = {
      ...draw,
      fetchedAt: serverTimestamp() as Timestamp,
      machineNumbers: draw.machineNumbers && draw.machineNumbers.length > 0 ? draw.machineNumbers : [],
    };

    if (currentUser) {
      batch.set(docRef, dataToSave, { merge: true });
    } else {
       // For unauthenticated writes, check existence first to avoid overwriting potentially more complete data
       // (though merge:true would handle some of this, being explicit is safer for unauth).
       const promise = (async () => {
        try {
          const docSnap = await getDoc(docRef);
          if (!docSnap.exists()) {
            await setDoc(docRef, dataToSave);
            // console.log(`LotoData: Unauthenticated: Created doc ${docId}`);
          } else {
            // Potentially merge if new data is more complete (e.g., adds machine numbers)
            const existingData = docSnap.data() as FirestoreDrawDoc;
            if (dataToSave.machineNumbers.length > 0 && (!existingData.machineNumbers || existingData.machineNumbers.length === 0)) {
                 await setDoc(docRef, dataToSave, { merge: true });
                //  console.log(`LotoData: Unauthenticated: Merged machine numbers into ${docId}`);
            } else {
                // console.log(`LotoData: Unauthenticated: Doc ${docId} already exists, skipping write or no new info to merge.`);
            }
          }
        } catch (e) {
          console.error(`LotoData: Unauthenticated write/check failed for doc ${docId}:`, e);
        }
      })();
      unauthenticatedWritePromises.push(promise);
    }
  }

  try {
    if (currentUser && uniqueDraws.length > 0) {
      await batch.commit();
      // console.log(`LotoData: Authenticated: Batch committed ${uniqueDraws.length} draws.`);
    }
    if (unauthenticatedWritePromises.length > 0) {
      await Promise.all(unauthenticatedWritePromises);
      // console.log(`LotoData: Unauthenticated: Processed ${unauthenticatedWritePromises.length} potential writes.`);
    }
  } catch (error) {
    console.error("LotoData: Error committing writes to Firestore:", error);
  }
}


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
    console.error(`LotoData: Unknown draw slug: ${drawSlug}`);
    return { results: [], lastDocSnapshot: null };
  }

  let firestoreQueryDocs: QueryDocumentSnapshot<FirestoreDrawDoc>[] = [];
  const queryConstraints: QueryConstraint[] = [where("apiDrawName", "==", canonicalDrawName)];

  // let targetYearMonth: string | undefined = undefined; // Not directly used for query if date objects are used
  if (year && month) {
    // targetYearMonth = `${year}-${month.toString().padStart(2, '0')}`;
    const monthStartDate = startOfMonth(new Date(year, month - 1, 1));
    const monthEndDate = lastDayOfMonth(monthStartDate);
    queryConstraints.push(where("date", ">=", format(monthStartDate, 'yyyy-MM-dd')));
    queryConstraints.push(where("date", "<=", format(monthEndDate, 'yyyy-MM-dd')));
  }
  queryConstraints.push(orderBy("date", "desc"));
  queryConstraints.push(orderBy("fetchedAt", "desc")); // Secondary sort for consistent pagination

  if (startAfterDoc) {
    queryConstraints.push(startAfter(startAfterDoc));
  }
  queryConstraints.push(limit(pageSize * 2)); // Fetch more for deduplication buffer

  const q = query(collection(db, RESULTS_COLLECTION_NAME), ...queryConstraints);

  try {
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(docSnap => firestoreQueryDocs.push(docSnap as QueryDocumentSnapshot<FirestoreDrawDoc>));
  } catch (error) {
    console.error(`LotoData: Error fetching draws for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore:`, error);
  }
  
  // Always attempt to fetch and sync from the internal API on initial load for a given view (no pagination, no date filter).
  // This ensures the data displayed is as up-to-date as possible with the external source.
  if (!year && !month && !startAfterDoc) {
    // console.log(`LotoData: Initial load for ${canonicalDrawName}. Fetching latest from internal API for potential sync.`);
    try {
      const currentYearMonth = format(new Date(), 'yyyy-MM');
      const previousYearMonth = format(subMonths(new Date(), 1), 'yyyy-MM');

      // Fetch for current and previous month to ensure coverage around month transitions
      const apiDataCurrentMonth = await _fetchDataFromInternalApi(currentYearMonth);
      const apiDataPreviousMonth = await _fetchDataFromInternalApi(previousYearMonth);
      
      const combinedApiData = [...apiDataCurrentMonth, ...apiDataPreviousMonth];
      
      // Deduplicate API data before saving (in case of overlap between months or API issues)
      const uniqueApiDataMap = new Map<string, Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>>();
      combinedApiData.forEach(item => {
        const key = constructLottoResultDocId(item.date, item.apiDrawName);
        if (!uniqueApiDataMap.has(key)) {
            uniqueApiDataMap.set(key, item);
        }
      });
      const newApiDataToSync = Array.from(uniqueApiDataMap.values());


      if (newApiDataToSync.length > 0) {
        // console.log(`LotoData: ${newApiDataToSync.length} new/updated results fetched from internal API for ${canonicalDrawName} (current/prev months). Synchronizing with Firestore.`);
        await _saveDrawsToFirestore(newApiDataToSync);
        
        // Re-fetch from Firestore after potential save to include new data and respect pagination
        firestoreQueryDocs = []; // Clear previous query results
        const querySnapshotAfterSync = await getDocs(q); // q is the original query with all constraints
        querySnapshotAfterSync.forEach(docSnap => firestoreQueryDocs.push(docSnap as QueryDocumentSnapshot<FirestoreDrawDoc>));
        // console.log(`LotoData: Re-fetched ${firestoreQueryDocs.length} docs for ${canonicalDrawName} from Firestore after internal API sync.`);
      } else {
        // console.log(`LotoData: No new data from internal API for ${canonicalDrawName} during initial load sync.`);
      }
    } catch (apiError) {
      console.error(`LotoData: Error during internal API fetch or re-query for ${canonicalDrawName}:`, apiError);
    }
  }


  const finalUniqueDocsMap = new Map<string, FirestoreDrawDoc>();
  firestoreQueryDocs.forEach(docSnap => {
    const docData = { docId: docSnap.id, ...docSnap.data() } as FirestoreDrawDoc;
    const canonicalKey = constructLottoResultDocId(docData.date, docData.apiDrawName); // docData.date is YYYY-MM-DD
    const existing = finalUniqueDocsMap.get(canonicalKey);
    // Prefer existing if new one doesn't have fetchedAt or if existing fetchedAt is later
    if (!existing || 
        (docData.fetchedAt && typeof docData.fetchedAt.toMillis === 'function' && 
         (!existing.fetchedAt || typeof existing.fetchedAt.toMillis !== 'function' || docData.fetchedAt.toMillis() > existing.fetchedAt.toMillis()))
    ) {
        finalUniqueDocsMap.set(canonicalKey, docData);
    }
  });

  const contentSignatureMap = new Map<string, FirestoreDrawDoc>();
  Array.from(finalUniqueDocsMap.values()).forEach(doc => {
    if (!doc.date || !doc.winningNumbers) return;
    let dateObj;
    try { dateObj = parseISO(doc.date); if (!isValid(dateObj)) return; }
    catch (e) { console.warn("LotoData: Invalid date encountered during content signature generation:", doc.date); return; }

    const day = format(dateObj, 'dd');
    const monthNumFormat = format(dateObj, 'MM'); // Renamed to avoid conflict
    const yearNum = getYear(dateObj);
    const wnString = [...doc.winningNumbers].sort((a, b) => a - b).join(',');
    const mnString = doc.machineNumbers && doc.machineNumbers.length > 0 ? [...doc.machineNumbers].sort((a, b) => a - b).join(',') : 'none';
    const contentSignature = `${doc.apiDrawName}-${day}-${monthNumFormat}-${yearNum}-${wnString}-${mnString}`; // Added year to signature

    const existingEntry = contentSignatureMap.get(contentSignature);
    if (!existingEntry || 
        (doc.fetchedAt && typeof doc.fetchedAt.toMillis === 'function' && 
         (!existingEntry.fetchedAt || typeof existingEntry.fetchedAt.toMillis !== 'function' || doc.fetchedAt.toMillis() > existingEntry.fetchedAt.toMillis()))
    ) {
        contentSignatureMap.set(contentSignature, doc);
    }
  });

  let processedDocs = Array.from(contentSignatureMap.values());
  processedDocs.sort((a, b) => {
    const dateComparison = b.date.localeCompare(a.date); // Dates are YYYY-MM-DD
    if (dateComparison !== 0) return dateComparison;
    
    const aFetchedAtValid = a.fetchedAt && typeof a.fetchedAt.toMillis === 'function';
    const bFetchedAtValid = b.fetchedAt && typeof b.fetchedAt.toMillis === 'function';

    if (aFetchedAtValid && bFetchedAtValid) {
      return b.fetchedAt.toMillis() - a.fetchedAt.toMillis();
    } else if (bFetchedAtValid) {
      return 1; // b has valid fetchedAt, prefer it (more recent)
    } else if (aFetchedAtValid) {
      return -1; // a has valid fetchedAt, prefer it
    }
    return 0; // If neither has a valid fetchedAt or they are identical
  });

  const finalDocsForPage = processedDocs.slice(0, pageSize);
  let newLastDocSnapshot: QueryDocumentSnapshot<FirestoreDrawDoc> | null = null;

  if (finalDocsForPage.length > 0 && processedDocs.length > pageSize) {
    const lastItemOnPageDocId = finalDocsForPage[finalDocsForPage.length - 1].docId;
    if(lastItemOnPageDocId){
         // Find the original snapshot from the query that corresponds to this docId
        const originalSnapshot = firestoreQueryDocs.find(snap => snap.id === lastItemOnPageDocId);
        if (originalSnapshot) {
            newLastDocSnapshot = originalSnapshot;
        }
    }
  }


  const finalResults = finalDocsForPage.map(doc => {
      let drawDateObject;
      try { drawDateObject = parseISO(doc.date); } // doc.date is YYYY-MM-DD
      catch (e) { /* ignore parse error for display, will show invalid */ }
      return {
        docId: doc.docId || constructLottoResultDocId(doc.date, doc.apiDrawName),
        date: (drawDateObject && isValid(drawDateObject)) ? format(drawDateObject, 'PPP', { locale: fr }) : `Date invalide: ${doc.date}`,
        winningNumbers: doc.winningNumbers,
        machineNumbers: doc.machineNumbers && doc.machineNumbers.length > 0 ? doc.machineNumbers : undefined,
      };
    });

  if (!year && !month && !startAfterDoc && finalResults.length === 0 && firestoreQueryDocs.length === 0) {
    // console.log(`LotoData: No data found for draw ${canonicalDrawName} (slug: ${drawSlug}) after checking Firestore and internal API.`);
  }

  return {
    results: finalResults,
    lastDocSnapshot: newLastDocSnapshot,
  };
};

export const fetchHistoricalData = async (drawSlug: string, count: number = 50): Promise<HistoricalDataEntry[]> => {
  const canonicalDrawName = getApiDrawNameFromSlug(drawSlug);
  if (!canonicalDrawName) {
    return [];
  }
  const fetchLimit = Math.min(count, MAX_HISTORICAL_FETCH_LIMIT);
  let firestoreDocs: FirestoreDrawDoc[] = [];

  const q = query(
    collection(db, RESULTS_COLLECTION_NAME),
    where("apiDrawName", "==", canonicalDrawName),
    orderBy("date", "desc"),
    orderBy("fetchedAt", "desc"),
    limit(fetchLimit * 2) // Fetch more for deduplication buffer
  );

  try {
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(doc => firestoreDocs.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc));
  } catch (error) {
    console.error(`LotoData: Error fetching historical data for ${canonicalDrawName} from Firestore:`, error);
  }

  // If Firestore has very few initial results, try to fetch from API.
  if (firestoreDocs.length < Math.min(fetchLimit, 10)) {
    // console.log(`LotoData: Insufficient historical data for ${canonicalDrawName}. Attempting sync via internal API.`);
    try {
        const currentYearMonth = format(new Date(), 'yyyy-MM');
        const previousYearMonth = format(subMonths(new Date(), 1), 'yyyy-MM');

        const apiDataCurrentMonth = await _fetchDataFromInternalApi(currentYearMonth);
        const apiDataPreviousMonth = await _fetchDataFromInternalApi(previousYearMonth);
        
        const combinedApiData = [...apiDataCurrentMonth, ...apiDataPreviousMonth];
        const uniqueApiDataMap = new Map<string, Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>>();
        combinedApiData.forEach(item => {
            const key = constructLottoResultDocId(item.date, item.apiDrawName);
            if (!uniqueApiDataMap.has(key)) {
                uniqueApiDataMap.set(key, item);
            }
        });
        const newApiDataToSync = Array.from(uniqueApiDataMap.values());

        if (newApiDataToSync.length > 0) {
            await _saveDrawsToFirestore(newApiDataToSync);
            // Re-query after saving
            const querySnapshotAfterSync = await getDocs(q);
            firestoreDocs = [];
            querySnapshotAfterSync.forEach(doc => firestoreDocs.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc));
            // console.log(`LotoData: Re-fetched ${firestoreDocs.length} historical docs for ${canonicalDrawName} after internal API sync.`);
        }
    } catch (apiError) {
        console.error(`LotoData: Error during historical sync via internal API for ${canonicalDrawName}:`, apiError);
    }
  }

  const finalUniqueDocsMap = new Map<string, FirestoreDrawDoc>();
  firestoreDocs.forEach(doc => {
    const canonicalKey = constructLottoResultDocId(doc.date, doc.apiDrawName);
    const existing = finalUniqueDocsMap.get(canonicalKey);
     if (!existing || 
        (doc.fetchedAt && typeof doc.fetchedAt.toMillis === 'function' && 
         (!existing.fetchedAt || typeof existing.fetchedAt.toMillis !== 'function' || doc.fetchedAt.toMillis() > existing.fetchedAt.toMillis()))
    ) {
      finalUniqueDocsMap.set(canonicalKey, doc);
    }
  });
  
  const contentSignatureMap = new Map<string, FirestoreDrawDoc>();
  Array.from(finalUniqueDocsMap.values()).forEach(doc => {
    if (!doc.date || !doc.winningNumbers) return;
    let dateObj;
    try { dateObj = parseISO(doc.date); if (!isValid(dateObj)) return; }
    catch (e) { console.warn("LotoData: Invalid date encountered during content signature generation (historical):", doc.date); return; }

    const day = format(dateObj, 'dd');
    const monthNumFormat = format(dateObj, 'MM');
    const yearNum = getYear(dateObj);
    const wnString = [...doc.winningNumbers].sort((a, b) => a - b).join(',');
    const mnString = doc.machineNumbers && doc.machineNumbers.length > 0 ? [...doc.machineNumbers].sort((a, b) => a - b).join(',') : 'none';
    const contentSignature = `${doc.apiDrawName}-${day}-${monthNumFormat}-${yearNum}-${wnString}-${mnString}`; // Added year

    const existingEntry = contentSignatureMap.get(contentSignature);
    if (!existingEntry || 
        (doc.fetchedAt && typeof doc.fetchedAt.toMillis === 'function' && 
         (!existingEntry.fetchedAt || typeof existingEntry.fetchedAt.toMillis !== 'function' || doc.fetchedAt.toMillis() > existingEntry.fetchedAt.toMillis()))
    ) {
        contentSignatureMap.set(contentSignature, doc);
    }
  });

  let processedDocs = Array.from(contentSignatureMap.values());
  processedDocs.sort((a, b) => {
      const dateComparison = b.date.localeCompare(a.date); // Dates are YYYY-MM-DD
      if (dateComparison !== 0) return dateComparison;
      
      const aFetchedAtValid = a.fetchedAt && typeof a.fetchedAt.toMillis === 'function';
      const bFetchedAtValid = b.fetchedAt && typeof b.fetchedAt.toMillis === 'function';

      if (aFetchedAtValid && bFetchedAtValid) {
        return b.fetchedAt.toMillis() - a.fetchedAt.toMillis();
      } else if (bFetchedAtValid) {
        return 1; 
      } else if (aFetchedAtValid) {
        return -1;
      }
      return 0;
  });

  return processedDocs.slice(0, fetchLimit).map(entry => {
    let entryDateObj;
    try { entryDateObj = parseISO(entry.date); } // entry.date is YYYY-MM-DD
    catch (e) { /* ignore */ }
    return {
      docId: entry.docId || constructLottoResultDocId(entry.date, entry.apiDrawName),
      drawName: drawSlug, // drawSlug is the slug from the function param
      date: (entryDateObj && isValid(entryDateObj)) ? format(entryDateObj, 'PPP', { locale: fr }) : `Date invalide: ${entry.date}`,
      winningNumbers: entry.winningNumbers,
      machineNumbers: entry.machineNumbers && entry.machineNumbers.length > 0 ? entry.machineNumbers : undefined,
    };
  });
};

export interface NumberCoOccurrence {
  selectedNumber: number;
  coOccurrences: Array<{
    number: number;
    count: number;
  }>;
}

export async function fetchNumberCoOccurrence(drawSlug: string, selectedNumber: number, data?: HistoricalDataEntry[]): Promise<NumberCoOccurrence> {
  const historicalData = data || await fetchHistoricalData(drawSlug, MAX_HISTORICAL_FETCH_LIMIT);
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
    .slice(0, 10); // Show top 10 co-occurrences

  return { selectedNumber, coOccurrences };
};

export const fetchRecentLottoResults = async (count: number = 20): Promise<FirestoreDrawDoc[]> => {
  let firestoreResults: FirestoreDrawDoc[] = [];
  const q = query(
      collection(db, RESULTS_COLLECTION_NAME),
      orderBy("date", "desc"),
      orderBy("fetchedAt", "desc"),
      limit(count * 2) // Fetch more for deduplication
    );
  try {
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(doc => {
        firestoreResults.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc)
    });
  } catch(error) {
      console.error("LotoData: Error fetching initial recent results:", error);
  }

  const finalUniqueDocsMap = new Map<string, FirestoreDrawDoc>();
  firestoreResults.forEach(doc => {
      const canonicalKey = constructLottoResultDocId(doc.date, doc.apiDrawName);
      const existing = finalUniqueDocsMap.get(canonicalKey);
       if (!existing || 
        (doc.fetchedAt && typeof doc.fetchedAt.toMillis === 'function' && 
         (!existing.fetchedAt || typeof existing.fetchedAt.toMillis !== 'function' || doc.fetchedAt.toMillis() > existing.fetchedAt.toMillis()))
    ) {
        finalUniqueDocsMap.set(canonicalKey, doc);
      }
  });
  
  const contentSignatureMap = new Map<string, FirestoreDrawDoc>();
  Array.from(finalUniqueDocsMap.values()).forEach(doc => {
    if (!doc.date || !doc.winningNumbers) return;
    let dateObj;
    try { dateObj = parseISO(doc.date); if (!isValid(dateObj)) return; }
    catch (e) { console.warn("LotoData: Invalid date encountered during content signature generation (recent):", doc.date); return; }

    const day = format(dateObj, 'dd');
    const monthNumFormat = format(dateObj, 'MM');
    const yearNum = getYear(dateObj);
    const wnString = [...doc.winningNumbers].sort((a, b) => a - b).join(',');
    const mnString = doc.machineNumbers && doc.machineNumbers.length > 0 ? [...doc.machineNumbers].sort((a, b) => a - b).join(',') : 'none';
    const contentSignature = `${doc.apiDrawName}-${day}-${monthNumFormat}-${yearNum}-${wnString}-${mnString}`; // Added year

    const existingEntry = contentSignatureMap.get(contentSignature);
     if (!existingEntry || 
        (doc.fetchedAt && typeof doc.fetchedAt.toMillis === 'function' && 
         (!existingEntry.fetchedAt || typeof existingEntry.fetchedAt.toMillis !== 'function' || doc.fetchedAt.toMillis() > existingEntry.fetchedAt.toMillis()))
    ) {
        contentSignatureMap.set(contentSignature, doc);
    }
  });

  let processedDocs = Array.from(contentSignatureMap.values());
  return processedDocs
      .sort((a,b) => {
          const dateComparison = b.date.localeCompare(a.date); // Dates are YYYY-MM-DD
          if (dateComparison !== 0) return dateComparison;
          
          const aFetchedAtValid = a.fetchedAt && typeof a.fetchedAt.toMillis === 'function';
          const bFetchedAtValid = b.fetchedAt && typeof b.fetchedAt.toMillis === 'function';

          if (aFetchedAtValid && bFetchedAtValid) {
            return b.fetchedAt.toMillis() - a.fetchedAt.toMillis();
          } else if (bFetchedAtValid) {
            return 1; 
          } else if (aFetchedAtValid) {
            return -1;
          }
          return 0;
      })
      .slice(0, count);
};

export const fetchAllLottoResultsForExport = async (): Promise<FirestoreDrawDoc[]> => {
   let results: FirestoreDrawDoc[] = [];
  const q = query(collection(db, RESULTS_COLLECTION_NAME), orderBy("date", "desc"), orderBy("fetchedAt", "desc"));
  try {
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(doc => {
      results.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc)
    });
  } catch(error) {
      console.error("LotoData: Error fetching all results for export:", error);
  }

  const finalUniqueDocsMap = new Map<string, FirestoreDrawDoc>();
  results.forEach(doc => {
      const canonicalKey = constructLottoResultDocId(doc.date, doc.apiDrawName);
      const existing = finalUniqueDocsMap.get(canonicalKey);
       if (!existing || 
        (doc.fetchedAt && typeof doc.fetchedAt.toMillis === 'function' && 
         (!existing.fetchedAt || typeof existing.fetchedAt.toMillis !== 'function' || doc.fetchedAt.toMillis() > existing.fetchedAt.toMillis()))
    ) {
        finalUniqueDocsMap.set(canonicalKey, doc);
      }
  });
  
  const contentSignatureMap = new Map<string, FirestoreDrawDoc>();
  Array.from(finalUniqueDocsMap.values()).forEach(doc => {
    if (!doc.date || !doc.winningNumbers) return;
    let dateObj;
    try { dateObj = parseISO(doc.date); if (!isValid(dateObj)) return; }
    catch (e) { console.warn("LotoData: Invalid date encountered during content signature generation (export):", doc.date); return; }

    const day = format(dateObj, 'dd');
    const monthNumFormat = format(dateObj, 'MM');
    const yearNum = getYear(dateObj);
    const wnString = [...doc.winningNumbers].sort((a, b) => a - b).join(',');
    const mnString = doc.machineNumbers && doc.machineNumbers.length > 0 ? [...doc.machineNumbers].sort((a, b) => a - b).join(',') : 'none';
    const contentSignature = `${doc.apiDrawName}-${day}-${monthNumFormat}-${yearNum}-${wnString}-${mnString}`; // Added year

    const existingEntry = contentSignatureMap.get(contentSignature);
    if (!existingEntry || 
        (doc.fetchedAt && typeof doc.fetchedAt.toMillis === 'function' && 
         (!existingEntry.fetchedAt || typeof existingEntry.fetchedAt.toMillis !== 'function' || doc.fetchedAt.toMillis() > existingEntry.fetchedAt.toMillis()))
    ) {
        contentSignatureMap.set(contentSignature, doc);
    }
  });
  
  let processedDocs = Array.from(contentSignatureMap.values());
  return processedDocs.sort((a,b) => {
    const dateComparison = b.date.localeCompare(a.date); // Dates are YYYY-MM-DD
    if (dateComparison !== 0) return dateComparison;
    
    const aFetchedAtValid = a.fetchedAt && typeof a.fetchedAt.toMillis === 'function';
    const bFetchedAtValid = b.fetchedAt && typeof b.fetchedAt.toMillis === 'function';

    if (aFetchedAtValid && bFetchedAtValid) {
      return b.fetchedAt.toMillis() - a.fetchedAt.toMillis();
    } else if (bFetchedAtValid) {
      return 1; 
    } else if (aFetchedAtValid) {
      return -1;
    }
    return 0;
  });
};

export const deleteLottoResult = async (docId: string): Promise<void> => {
  if (!docId) {
    throw new Error("Document ID is required for deletion.");
  }
  try {
    const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("LotoData: Error deleting lotto result:", error);
    throw error; // Re-throw to allow UI to handle it
  }
};

export async function addManualLottoResult(input: ManualLottoResultInput): Promise<void> {
  const canonicalDrawName = getApiDrawNameFromSlug(input.drawSlug);
  if (!canonicalDrawName) throw new Error(`Slug de tirage invalide: ${input.drawSlug}`);

  const formattedDate = format(input.date, 'yyyy-MM-dd'); // Store date in YYYY-MM-DD
  const docId = constructLottoResultDocId(formattedDate, canonicalDrawName);

  const dataToSave: Omit<FirestoreDrawDoc, 'docId'> = {
    apiDrawName: canonicalDrawName,
    date: formattedDate,
    winningNumbers: input.winningNumbers,
    machineNumbers: input.machineNumbers && input.machineNumbers.length > 0 ? input.machineNumbers : [],
    fetchedAt: serverTimestamp() as Timestamp, // Use server timestamp
  };

  const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    const existingData = docSnap.data() as FirestoreDrawDoc;
    // Compare content to decide if it's truly an identical result
    const wnInputSorted = [...input.winningNumbers].sort((a,b) => a-b);
    const wnExistingSorted = [...existingData.winningNumbers].sort((a,b) => a-b);
    const wnMatch = wnInputSorted.length === wnExistingSorted.length && wnInputSorted.every((val, index) => val === wnExistingSorted[index]);
    
    const mnInput = input.machineNumbers && input.machineNumbers.length > 0 ? [...input.machineNumbers].sort((a,b) => a-b) : [];
    const mnExisting = existingData.machineNumbers && existingData.machineNumbers.length > 0 ? [...existingData.machineNumbers].sort((a,b) => a-b) : [];
    const mnMatch = mnInput.length === mnExisting.length && mnInput.every((val, index) => val === mnExisting[index]);

    if (wnMatch && mnMatch) {
      // console.log(`LotoData: addManualLottoResult - Identical data already exists for ${docId}. Skipping write.`);
      throw new Error(`Un résultat identique pour le tirage "${getDrawNameBySlug(input.drawSlug) || canonicalDrawName}" à la date du ${format(input.date, 'PPP', {locale: fr})} existe déjà (ID: ${docId}).`);
    }
    // console.log(`LotoData: addManualLottoResult - Data for ${docId} exists but differs. Allowing overwrite/update for manual add.`);
  }
  // If doc doesn't exist, or if content differs, set (or overwrite) the document.
  await setDoc(docRef, dataToSave, {merge: true}); // Use merge:true to be safe, though setDoc on new is fine.
}

    
