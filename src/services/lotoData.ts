
import type { DrawResult, HistoricalDataEntry, FirestoreDrawDoc, ManualLottoResultInput } from '@/types/loto';
import { DRAW_SCHEDULE, ALL_DRAW_NAMES_MAP, DRAW_SLUG_BY_SIMPLE_NAME_MAP, getDrawNameBySlug } from '@/lib/lotoDraws.tsx';
import { format, subMonths, parse as dateFnsParse, isValid, getYear, parseISO, lastDayOfMonth, startOfMonth, isFuture, getMonth } from 'date-fns';
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
const DEFAULT_PAGE_SIZE = 10; // Default for DataSection pagination
const MAX_HISTORICAL_FETCH_LIMIT = 100; // Max for historical data general fetches

const canonicalDrawNameMap = new Map<string, string>();
DRAW_SCHEDULE.forEach(daySchedule => {
  daySchedule.draws.forEach(draw => {
    const canonicalName = draw.name;
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
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, '_')
    .replace(/[^\w-]/g, '');
}

export function constructLottoResultDocId(date: string, apiDrawName: string): string {
  let formattedDate = date;
  try {
    let parsedDateObj;
    if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        parsedDateObj = parseISO(date);
    } else if (date.includes('.')) {
        parsedDateObj = dateFnsParse(date, 'PPP', new Date(), { locale: fr });
    } else {
        parsedDateObj = parseISO(date);
    }
    
    if (isValid(parsedDateObj)) {
        formattedDate = format(parsedDateObj, 'yyyy-MM-dd');
    } else {
        formattedDate = date.replace(/[^0-9-]/g, '');
    }
  } catch (e) {
    formattedDate = date.replace(/[^0-9-]/g, '');
  }
  const normalizedIdNamePart = normalizeApiDrawNameForDocId(apiDrawName);
  return `${formattedDate}_${normalizedIdNamePart}`;
}

function parseApiDateScraped(apiDateString: string): string | null {
  // Example: "dim. 26/05" or "Jeu. 25/07"
  const dayMonthMatch = apiDateString.match(/(\d{2}\/\d{2})$/);
  if (!dayMonthMatch || !dayMonthMatch[1]) {
    return null;
  }
  const dayMonth = dayMonthMatch[1]; // e.g., "26/05"
  const [dayStr, monthStr] = dayMonth.split('/');
  const day = parseInt(dayStr, 10);
  const month = parseInt(monthStr, 10) - 1; // month is 0-indexed in JS Date

  const now = new Date();
  let year = now.getFullYear();
  
  // Tentatively create date with current year
  const tentativeDate = new Date(year, month, day);

  // If the tentative date (MM/DD) is in the future compared to today, assume it's from the previous year
  // (e.g., if today is Jan 2025, and we see "Dec 20", it's likely Dec 20, 2024)
  // This handles year rollover for dates shown on the page.
  if (month > now.getMonth() || (month === now.getMonth() && day > now.getDate())) {
      year = year -1;
  }
  
  const parsedDate = new Date(year, month, day);
  return isValid(parsedDate) ? format(parsedDate, 'yyyy-MM-dd') : null;
}

function parseNumbersStringScraped(numbersStr: string | null | undefined): number[] {
  if (!numbersStr || typeof numbersStr !== 'string') return [];
  return (numbersStr.split(' - ').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n) && n >= 1 && n <= 90)).slice(0, 5);
}

async function _saveDrawsToFirestore(draws: Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[]): Promise<void> {
  if (!draws.length) return;

  const currentUser = auth.currentUser;
  const batch = writeBatch(db);
  const unauthenticatedWritePromises: Array<Promise<void>> = [];

  const uniqueDrawsForPayloadMap = new Map<string, Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>>();
  draws.forEach(r => {
    const dateForId = r.date.match(/^\d{4}-\d{2}-\d{2}$/) ? r.date : format(parseISO(r.date), 'yyyy-MM-dd');
    const uniqueKey = constructLottoResultDocId(dateForId, r.apiDrawName);
    if (!uniqueDrawsForPayloadMap.has(uniqueKey)) {
      uniqueDrawsForPayloadMap.set(uniqueKey, r);
    } else {
      const existing = uniqueDrawsForPayloadMap.get(uniqueKey)!;
      // Prefer entry with machine numbers if one has them and the other doesn't
      if (r.machineNumbers.length > 0 && existing.machineNumbers.length === 0) {
        uniqueDrawsForPayloadMap.set(uniqueKey, r);
      }
    }
  });
  const uniqueDraws = Array.from(uniqueDrawsForPayloadMap.values());

  for (const draw of uniqueDraws) {
    const dateForDoc = draw.date.match(/^\d{4}-\d{2}-\d{2}$/) ? draw.date : format(parseISO(draw.date), 'yyyy-MM-dd');
    const docId = constructLottoResultDocId(dateForDoc, draw.apiDrawName);
    const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
    const dataToSave: Omit<FirestoreDrawDoc, 'docId'> = {
      ...draw,
      date: dateForDoc,
      fetchedAt: serverTimestamp() as Timestamp,
      machineNumbers: draw.machineNumbers || [],
    };

    if (currentUser) {
      batch.set(docRef, dataToSave, { merge: true });
    } else {
        const promise = (async () => {
        try {
          const docSnap = await getDoc(docRef);
          if (!docSnap.exists()) {
            await setDoc(docRef, dataToSave);
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
      await batch.commit();
    }
    if (unauthenticatedWritePromises.length > 0) {
      await Promise.all(unauthenticatedWritePromises);
    }
  } catch (error) {
    // console.error("Error committing writes to Firestore:", error);
  }
}

async function _scrapeMainResultsPageData(): Promise<Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[]> {
  const url = "https://lotobonheur.ci/resultats";
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html', // Expecting HTML
      }
    });
    if (!response.ok) return [];
    const htmlContent = await response.text();

    const scriptTagRegex = /<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s;
    const match = htmlContent.match(scriptTagRegex);

    if (!match || !match[1]) {
      // console.error("Could not find or parse __NEXT_DATA__ script tag from HTML content.");
      return [];
    }
    const jsonData = JSON.parse(match[1]);
    
    if (!jsonData || !jsonData.props || !jsonData.props.pageProps || !jsonData.props.pageProps.resultsData || !jsonData.props.pageProps.resultsData.drawsResultsWeekly) {
      // console.error("JSON structure from __NEXT_DATA__ is not as expected.");
      return [];
    }

    const drawsResultsWeekly = jsonData.props.pageProps.resultsData.drawsResultsWeekly;
    const parsedResults: Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[] = [];

    for (const week of drawsResultsWeekly) {
      for (const dailyResult of week.drawResultsDaily) {
        const apiDateStr = dailyResult.date; // e.g., "Jeu. 25/07"
        const parsedDate = parseApiDateScraped(apiDateStr); // Returns "YYYY-MM-DD" or null
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
            
            const winningNumbers = parseNumbersStringScraped(draw.winningNumbers);
            const machineNumbersParsed = parseNumbersStringScraped(draw.machineNumbers);

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
    if (parsedResults.length > 0) await _saveDrawsToFirestore(parsedResults);
    return parsedResults;
  } catch (error) {
    // console.error(`Error scraping data from ${url}:`, error);
    return [];
  }
}


// Content-based deduplication helper
const deduplicateByContentAndYear = (docs: FirestoreDrawDoc[]): FirestoreDrawDoc[] => {
  const contentSignatureMap = new Map<string, FirestoreDrawDoc>();
  docs.forEach(doc => {
    if (!doc.date || !doc.apiDrawName || !doc.winningNumbers) return; 

    const dateObj = parseISO(doc.date); 
    if (!isValid(dateObj)) return; 

    const day = format(dateObj, 'dd');
    const month = format(dateObj, 'MM');
    const year = getYear(dateObj);

    const wnString = [...doc.winningNumbers].sort((a, b) => a - b).join(',');
    const mnString = doc.machineNumbers && doc.machineNumbers.length > 0 ? [...doc.machineNumbers].sort((a, b) => a - b).join(',') : 'none';
    // Use canonical draw name for signature
    const canonicalApiDrawName = canonicalDrawNameMap.get(doc.apiDrawName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()) || doc.apiDrawName;
    const contentSignature = `${canonicalApiDrawName}-${day}-${month}-${wnString}-${mnString}`;

    const existingEntry = contentSignatureMap.get(contentSignature);
    if (!existingEntry || year > getYear(parseISO(existingEntry.date))) {
      contentSignatureMap.set(contentSignature, doc);
    } else if (year === getYear(parseISO(existingEntry.date))) {
      if (doc.fetchedAt && existingEntry.fetchedAt && doc.fetchedAt.toMillis() > existingEntry.fetchedAt.toMillis()) {
        contentSignatureMap.set(contentSignature, doc);
      } else if (doc.fetchedAt && !existingEntry.fetchedAt) {
        contentSignatureMap.set(contentSignature, doc);
      }
    }
  });
  return Array.from(contentSignatureMap.values());
};


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
    // console.error(`Unknown draw slug: ${drawSlug}`);
    return { results: [], lastDocSnapshot: null };
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
  queryConstraints.push(orderBy("fetchedAt", "desc"));
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

  if (!year && !month && !startAfterDoc && firestoreDocSnapshots.length < pageSize) {
    await _scrapeMainResultsPageData(); // Try to get latest data
    // Re-fetch from Firestore after potential scrape
    try {
      firestoreDocSnapshots = []; 
      const querySnapshotAfterSync = await getDocs(q);
      querySnapshotAfterSync.forEach(doc => firestoreDocSnapshots.push(doc as QueryDocumentSnapshot<FirestoreDrawDoc>));
    } catch (error) {
      // console.error(`Error re-fetching draws from Firestore after API sync for ${canonicalDrawName}:`, error);
    }
  }
  
  let firestoreDocsData = firestoreDocSnapshots.map(snap => ({ docId: snap.id, ...snap.data() } as FirestoreDrawDoc));
  
  const uniqueByDocIdMap = new Map<string, FirestoreDrawDoc>();
  firestoreDocsData.forEach(doc => {
    if (doc.docId && !uniqueByDocIdMap.has(doc.docId)) {
      uniqueByDocIdMap.set(doc.docId, doc);
    } else if (!doc.docId) {
        const tempKey = constructLottoResultDocId(doc.date, doc.apiDrawName);
        if (!uniqueByDocIdMap.has(tempKey)) uniqueByDocIdMap.set(tempKey, {...doc, docId: tempKey});
    }
  });
  let processedDocs = Array.from(uniqueByDocIdMap.values());
  processedDocs = deduplicateByContentAndYear(processedDocs);

  processedDocs.sort((a, b) => {
    const dateComparison = b.date.localeCompare(a.date);
    if (dateComparison !== 0) return dateComparison;
    if (a.fetchedAt && b.fetchedAt) {
      return b.fetchedAt.toMillis() - a.fetchedAt.toMillis();
    }
    return 0;
  });
  
  // Slice to pageSize *after* all deduplication and sorting
  const finalDocsForPage = processedDocs.slice(0, pageSize);

  const finalResults = finalDocsForPage.map(doc => {
      const drawDateObject = dateFnsParse(doc.date, 'yyyy-MM-dd', new Date());
      return {
        docId: doc.docId || constructLottoResultDocId(doc.date, doc.apiDrawName),
        date: isValid(drawDateObject) ? format(drawDateObject, 'PPP', { locale: fr }) : 'Date invalide',
        winningNumbers: doc.winningNumbers,
        machineNumbers: doc.machineNumbers && doc.machineNumbers.length > 0 ? doc.machineNumbers : undefined,
      };
    });

  // Determine the correct lastDocSnapshot based on the actual documents returned for the page
  const lastVisibleSnapshot = finalDocsForPage.length > 0 && firestoreDocSnapshots.find(snap => snap.id === finalDocsForPage[finalDocsForPage.length-1].docId) 
                                ? firestoreDocSnapshots.find(snap => snap.id === finalDocsForPage[finalDocsForPage.length-1].docId)
                                : null;
  
  // Check if there might be more data beyond what's been processed for this page, only if we fetched full pageSize.
  const hasMorePotentialData = processedDocs.length > pageSize;

  return {
    results: finalResults,
    // Only provide lastDocSnapshot if there's genuinely more data to fetch *after* deduplication
    lastDocSnapshot: hasMorePotentialData && lastVisibleSnapshot ? lastVisibleSnapshot : null,
  };
};


export const fetchHistoricalData = async (drawSlug: string, count: number = 50): Promise<HistoricalDataEntry[]> => {
  const canonicalDrawName = getApiDrawNameFromSlug(drawSlug);
  if (!canonicalDrawName) {
    return [];
  }
  const fetchLimit = Math.min(count, MAX_HISTORICAL_FETCH_LIMIT);
  let firestoreDocs: FirestoreDrawDoc[] = [];
  try {
    const q = query(
      collection(db, RESULTS_COLLECTION_NAME),
      where("apiDrawName", "==", canonicalDrawName),
      orderBy("date", "desc"),
      orderBy("fetchedAt", "desc"),
      limit(fetchLimit * 2) 
    );
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(doc => firestoreDocs.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc));
  } catch (error) {
    // console.error(...);
  }

  if (firestoreDocs.length < fetchLimit) { 
    await _scrapeMainResultsPageData();
    try {
      const qAfterSync = query(
        collection(db, RESULTS_COLLECTION_NAME),
        where("apiDrawName", "==", canonicalDrawName),
        orderBy("date", "desc"),
        orderBy("fetchedAt", "desc"),
        limit(fetchLimit * 2) 
      );
      const querySnapshotAfterSync = await getDocs(qAfterSync);
      firestoreDocs = []; 
      querySnapshotAfterSync.forEach(doc => firestoreDocs.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc));
    } catch (error) {
      // console.error(...);
    }
  }

  const uniqueByDocIdMap = new Map<string, FirestoreDrawDoc>();
  firestoreDocs.forEach(doc => {
    if (doc.docId && !uniqueByDocIdMap.has(doc.docId)) {
      uniqueByDocIdMap.set(doc.docId, doc);
    } else if (!doc.docId) {
        const tempKey = constructLottoResultDocId(doc.date, doc.apiDrawName);
        if (!uniqueByDocIdMap.has(tempKey)) uniqueByDocIdMap.set(tempKey, {...doc, docId: tempKey});
    }
  });

  let processedDocs = Array.from(uniqueByDocIdMap.values());
  processedDocs = deduplicateByContentAndYear(processedDocs);

  processedDocs.sort((a, b) => {
      const dateComparison = b.date.localeCompare(a.date);
      if (dateComparison !== 0) return dateComparison;
      if (a.fetchedAt && b.fetchedAt) {
          return b.fetchedAt.toMillis() - a.fetchedAt.toMillis();
      }
      return 0;
  });

  return processedDocs.slice(0, fetchLimit).map(entry => {
    const entryDateObj = dateFnsParse(entry.date, 'yyyy-MM-dd', new Date());
    return {
      docId: entry.docId || constructLottoResultDocId(entry.date, entry.apiDrawName),
      drawName: drawSlug,
      date: isValid(entryDateObj) ? format(entryDateObj, 'PPP', { locale: fr }) : 'Date invalide',
      winningNumbers: entry.winningNumbers,
      machineNumbers: entry.machineNumbers && entry.machineNumbers.length > 0 ? entry.machineNumbers : undefined,
    };
  });
};

export async function fetchNumberFrequency(drawSlug: string, data?: HistoricalDataEntry[]): Promise<NumberFrequency[]> {
  const historicalData = data || await fetchHistoricalData(drawSlug, MAX_HISTORICAL_FETCH_LIMIT); 
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
  try {
    const q = query(
      collection(db, RESULTS_COLLECTION_NAME),
      orderBy("date", "desc"),
      orderBy("fetchedAt", "desc"), 
      limit(count * 2) 
    );
    const querySnapshot = await getDocs(q);
    let firestoreResults: FirestoreDrawDoc[] = [];
    querySnapshot.forEach(doc => {
        firestoreResults.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc)
    });

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
    throw new Error(`Un résultat pour le tirage "${getDrawNameBySlug(input.drawSlug) || canonicalDrawName}" à la date du ${format(input.date, 'PPP', {locale: fr})} existe déjà (ID: ${docId}).`);
  }
  await setDoc(docRef, dataToSave);
}

    