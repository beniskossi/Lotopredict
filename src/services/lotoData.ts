
import type { DrawResult, HistoricalDataEntry, FirestoreDrawDoc, ManualLottoResultInput } from '@/types/loto';
import { DRAW_SCHEDULE, ALL_DRAW_NAMES_MAP, getDrawNameBySlug } from '@/lib/lotoDraws.tsx';
import { format, subMonths, parse as dateFnsParse, isValid, getYear, parseISO, lastDayOfMonth, startOfMonth, isFuture, getMonth as dateFnsGetMonth } from 'date-fns';
import fr from 'date-fns/locale/fr';
import { auth, db } from '@/lib/firebase';
import axios from 'axios';
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
  type QueryConstraint,
  type QueryDocumentSnapshot
} from "firebase/firestore";
import type { GenerateDrawPredictionsOutput } from '@/ai/flows/generate-draw-predictions';

const RESULTS_COLLECTION_NAME = 'lottoResults';
const DEFAULT_PAGE_SIZE = 10;
const MAX_HISTORICAL_FETCH_LIMIT = 100;

const canonicalDrawNameMap = new Map<string, string>();
DRAW_SCHEDULE.forEach(daySchedule => {
  daySchedule.draws.forEach(draw => {
    const canonicalName = draw.name;
    const normalizedKey = canonicalName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (!canonicalDrawNameMap.has(normalizedKey)) {
      canonicalDrawNameMap.set(normalizedKey, canonicalName);
    }
    if (draw.name.trim().toLowerCase() !== normalizedKey && !canonicalDrawNameMap.has(draw.name.trim().toLowerCase())) {
        canonicalDrawNameMap.set(draw.name.trim().toLowerCase(), draw.name);
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
 return apiDrawName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_').replace(/[^\w-]/g, '');
}

export function constructLottoResultDocId(date: string, apiDrawName: string): string {
  let formattedDate = date; // Assume date is already YYYY-MM-DD
  try {
    const parsedDateObj = parseISO(date);
    if (!isValid(parsedDateObj)) {
        formattedDate = date.replace(/[^0-9-]/g, ''); // Sanitize
    }
  } catch (e) {
    formattedDate = date.replace(/[^0-9-]/g, '');
  }
  const normalizedIdNamePart = normalizeApiDrawNameForDocId(apiDrawName);
  return `${formattedDate}_${normalizedIdNamePart}`;
}


// This function now fetches DIRECTLY from the external API, bypassing any internal API route.
async function _fetchAndProcessExternalApi(yearMonth?: string): Promise<Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[]> {
  const baseUrl = 'https://lotobonheur.ci/api/results';
  let url = baseUrl;

  // Adapt the YYYY-MM format to the format expected by the external API (e.g., juillet-2024)
  if (yearMonth) {
    const [year, month] = yearMonth.split('-');
    const monthName = format(new Date(parseInt(year), parseInt(month) - 1), 'MMMM', { locale: fr }).toLowerCase();
    url = `${baseUrl}?month=${monthName}-${year}`;
  }

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://lotobonheur.ci/resultats',
      },
      timeout: 15000,
    });
    
    const resultsData = response.data;
    if (!resultsData || !resultsData.success) {
      console.error(`External API at ${url} returned unsuccessful or invalid response`, resultsData);
      return [];
    }

    const drawsResultsWeekly = resultsData.drawsResultsWeekly || [];
    const firestoreReadyResults: Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[] = [];
    const currentYear = getYear(new Date());
    const currentMonthIndex = dateFnsGetMonth(new Date()); // 0-11

    for (const week of drawsResultsWeekly) {
      if (!week.drawResultsDaily) continue;
      for (const dailyResult of week.drawResultsDaily) {
        const dateStr = dailyResult.date; // e.g., "Lundi 29/07"
        let drawDate: Date | null = null;
        
        try {
          const dateParts = dateStr.split(' ');
          const dayMonth = dateParts.length > 1 ? dateParts[1] : dateParts[0]; // "29/07"
          const [dayStr, monthStr] = dayMonth.split('/');
          const day = parseInt(dayStr);
          const monthIndex = parseInt(monthStr) - 1; // 0-11
          
          let yearToUse = currentYear;
          // Heuristic: if we are in Jan/Feb/Mar and see a date for Oct/Nov/Dec, it's likely from the previous year.
          if (currentMonthIndex < 3 && monthIndex > 8) {
              yearToUse = currentYear - 1;
          }
          
          const parsedDate = dateFnsParse(`${day}/${monthIndex + 1}/${yearToUse}`, 'd/M/yyyy', new Date());
          if (isValid(parsedDate)) {
            drawDate = parsedDate;
          }
        } catch (e) {
          // ignore date parse errors and continue
        }

        if (!drawDate) {
          console.warn(`LotoData: Could not parse date: ${dateStr}`);
          continue;
        }

        const formattedDate = format(drawDate, 'yyyy-MM-dd');

        // Combine standard and night draws for processing
        const allDrawsForDay = [...(dailyResult.drawResults.standardDraws || []), ...(dailyResult.drawResults.nightDraws || [])];

        for (const draw of allDrawsForDay) {
           const drawName = draw.drawName ? draw.drawName.trim() : "";
           if (!drawName || (draw.winningNumbers && draw.winningNumbers.startsWith('.'))) {
              continue; // Skip invalid or placeholder draws
           }

           const normalizedApiNameToLookup = drawName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
           const canonicalName = canonicalDrawNameMap.get(normalizedApiNameToLookup);

           if (!canonicalName) {
             continue; // Draw name not recognized in our schedule
           }

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
    console.error(`LotoData: Error fetching directly from external API ${url}:`, error);
    return [];
  }
}

async function _saveDrawsToFirestore(draws: Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[]): Promise<void> {
  if (!draws || !draws.length) return;

  const currentUser = auth.currentUser;
  const batch = writeBatch(db);
  const unauthenticatedWritePromises: Array<Promise<void>> = [];

  const uniqueDrawsForPayloadMap = new Map<string, Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>>();
  draws.forEach(r => {
    const uniqueKey = constructLottoResultDocId(r.date, r.apiDrawName);
    const existing = uniqueDrawsForPayloadMap.get(uniqueKey);
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
       const promise = (async () => {
        try {
          const docSnap = await getDoc(docRef);
          if (!docSnap.exists()) {
            await setDoc(docRef, dataToSave);
          } else {
            const existingData = docSnap.data() as FirestoreDrawDoc;
            if (dataToSave.machineNumbers.length > 0 && (!existingData.machineNumbers || existingData.machineNumbers.length === 0)) {
                 await setDoc(docRef, dataToSave, { merge: true });
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
    }
    if (unauthenticatedWritePromises.length > 0) {
      await Promise.all(unauthenticatedWritePromises);
    }
  } catch (error) {
    console.error("LotoData: Error committing writes to Firestore:", error);
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
    console.error(`LotoData: Unknown draw slug: ${drawSlug}`);
    return { results: [], lastDocSnapshot: null };
  }

  let firestoreQueryDocs: QueryDocumentSnapshot<FirestoreDrawDoc>[] = [];
  const queryConstraints: QueryConstraint[] = [where("apiDrawName", "==", canonicalDrawName)];

  let targetYearMonth: string | undefined = undefined;
  if (year && month) {
    targetYearMonth = `${year}-${month.toString().padStart(2, '0')}`;
    const monthStartDate = startOfMonth(new Date(year, month - 1, 1));
    const monthEndDate = lastDayOfMonth(monthStartDate);
    queryConstraints.push(where("date", ">=", format(monthStartDate, 'yyyy-MM-dd')));
    queryConstraints.push(where("date", "<=", format(monthEndDate, 'yyyy-MM-dd')));
  }
  queryConstraints.push(orderBy("date", "desc"));
  queryConstraints.push(orderBy("fetchedAt", "desc"));

  if (startAfterDoc) {
    queryConstraints.push(startAfter(startAfterDoc));
  }
  queryConstraints.push(limit(pageSize * 2));

  const q = query(collection(db, RESULTS_COLLECTION_NAME), ...queryConstraints);

  try {
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(docSnap => firestoreQueryDocs.push(docSnap as QueryDocumentSnapshot<FirestoreDrawDoc>));
  } catch (error) {
    console.error(`LotoData: Error fetching draws for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore:`, error);
  }

  let shouldSync = false;
  if (year && month) {
    // If we filtered for a specific month and got no results, try to sync that month.
    if (firestoreQueryDocs.length === 0) {
        shouldSync = true;
    }
  } else if (!startAfterDoc) {
    // On any initial load (not paginating), always try a sync.
    shouldSync = true;
  }

  if (shouldSync) {
    try {
      // Determine which months to sync.
      const monthsToSync: string[] = [];
      if (targetYearMonth) { // Syncing a specific month that returned no results
        monthsToSync.push(targetYearMonth);
      } else { // Standard initial load sync
        monthsToSync.push(format(new Date(), 'yyyy-MM'));
        monthsToSync.push(format(subMonths(new Date(), 1), 'yyyy-MM'));
      }

      const syncPromises = monthsToSync.map(ym => _fetchAndProcessExternalApi(ym));
      const resultsFromApi = (await Promise.all(syncPromises)).flat();
      
      const uniqueApiDataMap = new Map<string, Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>>();
      resultsFromApi.forEach(item => {
        const key = constructLottoResultDocId(item.date, item.apiDrawName);
        if (!uniqueApiDataMap.has(key)) {
            uniqueApiDataMap.set(key, item);
        }
      });
      const newApiDataToSync = Array.from(uniqueApiDataMap.values());

      if (newApiDataToSync.length > 0) {
        await _saveDrawsToFirestore(newApiDataToSync);
        
        firestoreQueryDocs = [];
        const querySnapshotAfterSync = await getDocs(q);
        querySnapshotAfterSync.forEach(docSnap => firestoreQueryDocs.push(docSnap as QueryDocumentSnapshot<FirestoreDrawDoc>));
      }
    } catch (apiError) {
      console.error(`LotoData: Error during external API sync for ${canonicalDrawName}:`, apiError);
    }
  }

  const finalUniqueDocsMap = new Map<string, FirestoreDrawDoc>();
  firestoreQueryDocs.forEach(docSnap => {
    const docData = { docId: docSnap.id, ...docSnap.data() } as FirestoreDrawDoc;
    const canonicalKey = constructLottoResultDocId(docData.date, docData.apiDrawName);
    const existing = finalUniqueDocsMap.get(canonicalKey);
    if (!existing || (docData.fetchedAt && typeof docData.fetchedAt.toMillis === 'function' && (!existing.fetchedAt || typeof existing.fetchedAt.toMillis !== 'function' || docData.fetchedAt.toMillis() > existing.fetchedAt.toMillis()))) {
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
    const monthNumFormat = format(dateObj, 'MM');
    const yearNum = getYear(dateObj);
    const wnString = [...doc.winningNumbers].sort((a, b) => a - b).join(',');
    const mnString = doc.machineNumbers && doc.machineNumbers.length > 0 ? [...doc.machineNumbers].sort((a, b) => a - b).join(',') : 'none';
    const contentSignature = `${doc.apiDrawName}-${day}-${monthNumFormat}-${yearNum}-${wnString}-${mnString}`;

    const existingEntry = contentSignatureMap.get(contentSignature);
    if (!existingEntry || (doc.fetchedAt && typeof doc.fetchedAt.toMillis === 'function' && (!existingEntry.fetchedAt || typeof existingEntry.fetchedAt.toMillis !== 'function' || doc.fetchedAt.toMillis() > existingEntry.fetchedAt.toMillis()))) {
        contentSignatureMap.set(contentSignature, doc);
    }
  });

  let processedDocs = Array.from(contentSignatureMap.values());
  processedDocs.sort((a, b) => {
    const dateComparison = b.date.localeCompare(a.date);
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

  const finalDocsForPage = processedDocs.slice(0, pageSize);
  let newLastDocSnapshot: QueryDocumentSnapshot<FirestoreDrawDoc> | null = null;

  if (finalDocsForPage.length > 0 && processedDocs.length > pageSize) {
    const lastItemOnPageDocId = finalDocsForPage[finalDocsForPage.length - 1].docId;
    if(lastItemOnPageDocId){
        const originalSnapshot = firestoreQueryDocs.find(snap => snap.id === lastItemOnPageDocId);
        if (originalSnapshot) {
            newLastDocSnapshot = originalSnapshot;
        }
    }
  }

  const finalResults = finalDocsForPage.map(doc => {
      let drawDateObject;
      try { drawDateObject = parseISO(doc.date); }
      catch (e) { /* ignore */ }
      return {
        docId: doc.docId || constructLottoResultDocId(doc.date, doc.apiDrawName),
        date: (drawDateObject && isValid(drawDateObject)) ? format(drawDateObject, 'PPP', { locale: fr }) : `Date invalide: ${doc.date}`,
        winningNumbers: doc.winningNumbers,
        machineNumbers: doc.machineNumbers && doc.machineNumbers.length > 0 ? doc.machineNumbers : undefined,
      };
    });

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
    limit(fetchLimit * 2)
  );

  try {
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(doc => firestoreDocs.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc));
  } catch (error) {
    console.error(`LotoData: Error fetching historical data for ${canonicalDrawName} from Firestore:`, error);
  }

  if (firestoreDocs.length < Math.min(fetchLimit, 10)) {
    try {
        const monthsToSync: string[] = [format(new Date(), 'yyyy-MM'), format(subMonths(new Date(), 1), 'yyyy-MM')];
        const syncPromises = monthsToSync.map(ym => _fetchAndProcessExternalApi(ym));
        const newApiDataToSync = (await Promise.all(syncPromises)).flat().filter(d => d.apiDrawName === canonicalDrawName);

        if (newApiDataToSync.length > 0) {
            await _saveDrawsToFirestore(newApiDataToSync);
            const querySnapshotAfterSync = await getDocs(q);
            firestoreDocs = [];
            querySnapshotAfterSync.forEach(doc => firestoreDocs.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc));
        }
    } catch (apiError) {
        console.error(`LotoData: Error during historical sync via external API for ${canonicalDrawName}:`, apiError);
    }
  }

  const finalUniqueDocsMap = new Map<string, FirestoreDrawDoc>();
  firestoreDocs.forEach(doc => {
    const canonicalKey = constructLottoResultDocId(doc.date, doc.apiDrawName);
    const existing = finalUniqueDocsMap.get(canonicalKey);
     if (!existing || (doc.fetchedAt && typeof doc.fetchedAt.toMillis === 'function' && (!existing.fetchedAt || typeof existing.fetchedAt.toMillis !== 'function' || doc.fetchedAt.toMillis() > existing.fetchedAt.toMillis()))) {
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
    const contentSignature = `${doc.apiDrawName}-${day}-${monthNumFormat}-${yearNum}-${wnString}-${mnString}`;

    const existingEntry = contentSignatureMap.get(contentSignature);
    if (!existingEntry || (doc.fetchedAt && typeof doc.fetchedAt.toMillis === 'function' && (!existingEntry.fetchedAt || typeof existingEntry.fetchedAt.toMillis !== 'function' || doc.fetchedAt.toMillis() > existingEntry.fetchedAt.toMillis()))) {
        contentSignatureMap.set(contentSignature, doc);
    }
  });

  let processedDocs = Array.from(contentSignatureMap.values());
  processedDocs.sort((a, b) => {
      const dateComparison = b.date.localeCompare(a.date);
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
    try { entryDateObj = parseISO(entry.date); }
    catch (e) { /* ignore */ }
    return {
      docId: entry.docId || constructLottoResultDocId(entry.date, entry.apiDrawName),
      drawName: drawSlug,
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
    .slice(0, 10);

  return { selectedNumber, coOccurrences };
};

export const fetchRecentLottoResults = async (count: number = 20): Promise<FirestoreDrawDoc[]> => {
  let firestoreResults: FirestoreDrawDoc[] = [];
  const q = query(
      collection(db, RESULTS_COLLECTION_NAME),
      orderBy("date", "desc"),
      orderBy("fetchedAt", "desc"),
      limit(count * 2)
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
       if (!existing || (doc.fetchedAt && typeof doc.fetchedAt.toMillis === 'function' && (!existing.fetchedAt || typeof existing.fetchedAt.toMillis !== 'function' || doc.fetchedAt.toMillis() > existing.fetchedAt.toMillis()))) {
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
    const contentSignature = `${doc.apiDrawName}-${day}-${monthNumFormat}-${yearNum}-${wnString}-${mnString}`;

    const existingEntry = contentSignatureMap.get(contentSignature);
     if (!existingEntry || (doc.fetchedAt && typeof doc.fetchedAt.toMillis === 'function' && (!existingEntry.fetchedAt || typeof existingEntry.fetchedAt.toMillis !== 'function' || doc.fetchedAt.toMillis() > existingEntry.fetchedAt.toMillis()))) {
        contentSignatureMap.set(contentSignature, doc);
    }
  });

  let processedDocs = Array.from(contentSignatureMap.values());
  return processedDocs
      .sort((a,b) => {
          const dateComparison = b.date.localeCompare(a.date);
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
       if (!existing || (doc.fetchedAt && typeof doc.fetchedAt.toMillis === 'function' && (!existing.fetchedAt || typeof existing.fetchedAt.toMillis !== 'function' || doc.fetchedAt.toMillis() > existing.fetchedAt.toMillis()))) {
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
    const contentSignature = `${doc.apiDrawName}-${day}-${monthNumFormat}-${yearNum}-${wnString}-${mnString}`;

    const existingEntry = contentSignatureMap.get(contentSignature);
    if (!existingEntry || (doc.fetchedAt && typeof doc.fetchedAt.toMillis === 'function' && (!existingEntry.fetchedAt || typeof existingEntry.fetchedAt.toMillis !== 'function' || doc.fetchedAt.toMillis() > existingEntry.fetchedAt.toMillis()))) {
        contentSignatureMap.set(contentSignature, doc);
    }
  });
  
  let processedDocs = Array.from(contentSignatureMap.values());
  return processedDocs.sort((a,b) => {
    const dateComparison = b.date.localeCompare(a.date);
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
    machineNumbers: input.machineNumbers && input.machineNumbers.length > 0 ? input.machineNumbers : [],
    fetchedAt: serverTimestamp() as Timestamp,
  };

  const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    const existingData = docSnap.data() as FirestoreDrawDoc;
    const wnInputSorted = [...input.winningNumbers].sort((a,b) => a-b);
    const wnExistingSorted = [...existingData.winningNumbers].sort((a,b) => a-b);
    const wnMatch = wnInputSorted.length === wnExistingSorted.length && wnInputSorted.every((val, index) => val === wnExistingSorted[index]);
    
    const mnInput = input.machineNumbers && input.machineNumbers.length > 0 ? [...input.machineNumbers].sort((a,b) => a-b) : [];
    const mnExisting = existingData.machineNumbers && existingData.machineNumbers.length > 0 ? [...existingData.machineNumbers].sort((a,b) => a-b) : [];
    const mnMatch = mnInput.length === mnExisting.length && mnInput.every((val, index) => val === mnExisting[index]);

    if (wnMatch && mnMatch) {
      throw new Error(`Un résultat identique pour le tirage "${getDrawNameBySlug(input.drawSlug) || canonicalDrawName}" à la date du ${format(input.date, 'PPP', {locale: fr})} existe déjà (ID: ${docId}).`);
    }
  }
  await setDoc(docRef, dataToSave, {merge: true});
}

export interface PredictionFeedbackPayload extends GenerateDrawPredictionsOutput {
  drawSlug: string;
  feedback: 'relevant' | 'not_relevant';
  analysisPeriodUsed?: string;
  numberWeightingUsed?: string;
}

export async function savePredictionFeedback(data: PredictionFeedbackPayload): Promise<void> {
  try {
    const feedbackCollectionRef = collection(db, 'predictionFeedback');
    await addDoc(feedbackCollectionRef, {
      ...data,
      feedbackTimestamp: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error saving prediction feedback:", error);
    throw new Error("Failed to save feedback.");
  }
}
