
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
  type QueryConstraint,
  type QueryDocumentSnapshot
} from "firebase/firestore";

const RESULTS_COLLECTION_NAME = 'lottoResults';
const DEFAULT_PAGE_SIZE = 10; // Default for DataSection pagination
const MAX_HISTORICAL_FETCH_LIMIT = 100; // Max for stats/AI historical data

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
    const originalSimpleNameLower = draw.name.toLowerCase().trim();
     if (originalSimpleNameLower !== normalizedKey && !canonicalDrawNameMap.has(originalSimpleNameLower)) {
        canonicalDrawNameMap.set(originalSimpleNameLower, draw.name);
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
    } else if (date.includes('/')) { 
        const parts = date.split('/');
        if (parts.length === 3) {
            if (parts[2].length === 4) { 
                parsedDateObj = dateFnsParse(date, 'dd/MM/yyyy', new Date());
            } else { 
                 parsedDateObj = dateFnsParse(date, 'dd/MM/yy', new Date());
            }
        }
    }

    if (parsedDateObj && isValid(parsedDateObj)) {
        formattedDate = format(parsedDateObj, 'yyyy-MM-dd');
    } else {
        // console.warn(`LotoData: Could not robustly parse date "${date}" for doc ID construction. Using sanitized version.`);
        formattedDate = date.replace(/[^0-9-]/g, ''); 
    }
  } catch (e) {
    // console.warn(`LotoData: Exception parsing date "${date}" for doc ID:`, e);
    formattedDate = date.replace(/[^0-9-]/g, '');
  }
  const normalizedIdNamePart = normalizeApiDrawNameForDocId(apiDrawName);
  return `${formattedDate}_${normalizedIdNamePart}`;
}


async function _saveDrawsToFirestore(draws: Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[]): Promise<void> {
  if (!draws || !draws.length) return;

  const currentUser = auth.currentUser;
  const batch = writeBatch(db);
  const unauthenticatedWritePromises: Array<Promise<void>> = [];

  const uniqueDrawsForPayloadMap = new Map<string, Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>>();
  draws.forEach(r => {
    const dateForId = r.date.match(/^\d{4}-\d{2}-\d{2}$/) ? r.date : format(parseISO(r.date), 'yyyy-MM-dd');
    const uniqueKey = constructLottoResultDocId(dateForId, r.apiDrawName);

    const existing = uniqueDrawsForPayloadMap.get(uniqueKey);
    if (!existing || (r.machineNumbers && r.machineNumbers.length > 0 && (!existing.machineNumbers || existing.machineNumbers.length === 0))) {
      uniqueDrawsForPayloadMap.set(uniqueKey, r);
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
      machineNumbers: draw.machineNumbers && draw.machineNumbers.length > 0 ? draw.machineNumbers : [],
    };

    if (currentUser) {
      batch.set(docRef, dataToSave, { merge: true });
    } else {
      // For unauthenticated writes, check existence first to avoid permission errors on merge/update
      // And perform individual writes instead of batching for clearer error handling with security rules
      const promise = (async () => {
        try {
          const docSnap = await getDoc(docRef);
          if (!docSnap.exists()) {
            await setDoc(docRef, dataToSave); 
            // console.log(`LotoData: Unauthenticated: Created doc ${docId}`);
          } else {
            // console.log(`LotoData: Unauthenticated: Doc ${docId} already exists, skipping write.`);
          }
        } catch (e) {
          // console.error(`LotoData: Unauthenticated write/check failed for doc ${docId}:`, e);
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
    // console.error("LotoData: Error committing writes to Firestore:", error);
  }
}

function parseApiDateScraped(apiDateString: string | undefined | null): string | null {
  if (!apiDateString || typeof apiDateString !== 'string') {
    // console.warn(`LotoData: Invalid apiDateString received for parsing: ${apiDateString}`);
    return null;
  }

  const dayMonthMatch = apiDateString.match(/(\d{2}\/\d{2})$/);
  if (!dayMonthMatch || !dayMonthMatch[1]) {
    // console.warn(`LotoData: Could not extract DD/MM from apiDateString: ${apiDateString}`);
    return null;
  }
  const dayMonth = dayMonthMatch[1]; 
  const [dayStr, monthStr] = dayMonth.split('/');
  const day = parseInt(dayStr, 10);
  const month = parseInt(monthStr, 10) - 1; 

  if (isNaN(day) || isNaN(month) || month < 0 || month > 11 || day < 1 || day > 31) {
    // console.warn(`LotoData: Invalid day or month parsed from apiDateString: ${apiDateString} -> day: ${day}, month: ${month + 1}`);
    return null;
  }

  const now = new Date();
  let year = now.getFullYear();
  const tentativeDateThisYear = new Date(year, month, day);
  
  // If the parsed month/day forms a date in the current year that is in the future,
  // assume it's from the previous year. This handles year turnover.
  if (tentativeDateThisYear > now && (month > now.getMonth() || (month === now.getMonth() && day > now.getDate()))) {
      year = year - 1;
  }

  const parsedDate = new Date(year, month, day);
  if (!isValid(parsedDate)) {
    // console.warn(`LotoData: Constructed date is invalid for apiDateString: ${apiDateString} -> ${parsedDate}`);
    return null;
  }
  return format(parsedDate, 'yyyy-MM-dd');
}

function parseNumbersStringScraped(numbersStr: string | null | undefined): number[] {
  if (!numbersStr || typeof numbersStr !== 'string') return [];
  return (numbersStr.split(' - ')
    .map(n => parseInt(n.trim(), 10))
    .filter(n => !isNaN(n) && n >= 1 && n <= 90)
  ).slice(0, 5); 
}

async function _scrapeMainResultsPageData(): Promise<Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[]> {
  // Configuration point: Target URL for scraping
  const url = "https://lotobonheur.ci/resultats";
  // console.log(`LotoData: Starting scrape from ${url}`);
  try {
    const response = await fetch(url, {
      headers: {
        // Configuration point: User-Agent for the request
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html',
      }
    });

    if (!response.ok) {
      // console.error(`LotoData: Failed to fetch ${url}. Status: ${response.status}`);
      return [];
    }
    const htmlContent = await response.text();

    // Configuration point: The ID of the script tag containing the JSON data
    const scriptTagRegex = /<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s;
    const match = htmlContent.match(scriptTagRegex);

    if (!match || !match[1]) {
      // console.error("LotoData: Could not find __NEXT_DATA__ script tag in HTML content.");
      return [];
    }

    let jsonData;
    try {
      jsonData = JSON.parse(match[1]);
    } catch (e) {
      // console.error("LotoData: Failed to parse JSON from __NEXT_DATA__.", e);
      return [];
    }
    
    // Configuration point: Expected path to the weekly draw results within the JSON data
    const expectedJsonPath = 'props.pageProps.resultsData.drawsResultsWeekly';
    if (!jsonData?.props?.pageProps?.resultsData?.drawsResultsWeekly) {
      // console.error(`LotoData: JSON structure from __NEXT_DATA__ is not as expected. Path '${expectedJsonPath}' not found or invalid.`);
      return [];
    }

    const drawsResultsWeekly = jsonData.props.pageProps.resultsData.drawsResultsWeekly;
    if (!Array.isArray(drawsResultsWeekly)) {
      // console.error("LotoData: drawsResultsWeekly is not an array.");
      return [];
    }

    const parsedResults: Omit<FirestoreDrawDoc, 'fetchedAt' | 'docId'>[] = [];

    for (const week of drawsResultsWeekly) {
      if (!week?.drawResultsDaily || !Array.isArray(week.drawResultsDaily)) {
        // console.warn("LotoData: Skipping week due to missing or invalid drawResultsDaily array.", week);
        continue;
      }
      for (const dailyResult of week.drawResultsDaily) {
        const apiDateStr = dailyResult.date;
        const parsedDate = parseApiDateScraped(apiDateStr);
        if (!parsedDate) {
          // console.warn(`LotoData: Skipping daily result due to unparsable date: ${apiDateStr}`);
          continue;
        }

        if (!dailyResult?.drawResults?.standardDraws || !Array.isArray(dailyResult.drawResults.standardDraws)) {
          // console.warn(`LotoData: Skipping daily result for date ${parsedDate} due to missing or invalid standardDraws array.`);
          continue;
        }

        for (const draw of dailyResult.drawResults.standardDraws) {
          const apiDrawNameFromPayload = draw.drawName;
          if (!apiDrawNameFromPayload || typeof apiDrawNameFromPayload !== 'string') {
            // console.warn(`LotoData: Skipping draw due to missing or invalid drawName for date ${parsedDate}.`);
            continue;
          }

          const normalizedApiNameToLookup = apiDrawNameFromPayload
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();

          const resolvedCanonicalName = canonicalDrawNameMap.get(normalizedApiNameToLookup);
          if (!resolvedCanonicalName) {
            // console.warn(`LotoData: Skipping draw "${apiDrawNameFromPayload}" (normalized: "${normalizedApiNameToLookup}") for date ${parsedDate} as it's not in a recognized draw schedule.`);
            continue;
          }

          if (draw.winningNumbers === ". - . - . - . - ." || typeof draw.winningNumbers !== 'string') {
            // console.log(`LotoData: Skipping draw ${resolvedCanonicalName} on ${parsedDate} due to placeholder or invalid winning numbers.`);
            continue;
          }

          const winningNumbers = parseNumbersStringScraped(draw.winningNumbers);
          const machineNumbersParsed = parseNumbersStringScraped(draw.machineNumbers);

          if (winningNumbers.length === 5) {
            parsedResults.push({
              apiDrawName: resolvedCanonicalName,
              date: parsedDate, 
              winningNumbers: winningNumbers,
              machineNumbers: machineNumbersParsed.length === 5 ? machineNumbersParsed : [],
            });
          } else {
            // console.warn(`LotoData: Incomplete winning numbers for ${resolvedCanonicalName} on ${parsedDate}. Found ${winningNumbers.length}, expected 5. Numbers: "${draw.winningNumbers}"`);
          }
        }
      }
    }
    // console.log(`LotoData: Successfully scraped ${parsedResults.length} raw draw results.`);
    if (parsedResults.length > 0) {
      await _saveDrawsToFirestore(parsedResults);
    }
    return parsedResults;
  } catch (error) {
    // console.error(`LotoData: Error during scraping process from ${url}:`, error);
    return [];
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
    // console.error(`LotoData: Unknown draw slug: ${drawSlug}`);
    return { results: [], lastDocSnapshot: null };
  }

  let firestoreDocsFromQuery: FirestoreDrawDoc[] = [];
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
  
  const effectivePageSize = pageSize; // Standard page size
  queryConstraints.push(limit(effectivePageSize * 2)); // Fetch more for deduplication buffer


  if (startAfterDoc) {
    queryConstraints.push(startAfter(startAfterDoc));
  }

  const q = query(collection(db, RESULTS_COLLECTION_NAME), ...queryConstraints);

  try {
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(docSnap => firestoreDocsFromQuery.push({ docId: docSnap.id, ...docSnap.data() } as FirestoreDrawDoc));
  } catch (error) {
    // console.error(`LotoData: Error fetching draws for ${canonicalDrawName} (slug: ${drawSlug}) from Firestore:`, error);
  }

  if (!year && !month && !startAfterDoc && firestoreDocsFromQuery.length < pageSize) {
    // console.log(`LotoData: Insufficient data for ${canonicalDrawName} in Firestore on initial load (got ${firestoreDocsFromQuery.length}, need ${pageSize}). Attempting scrape.`);
    try {
      await _scrapeMainResultsPageData();
      // Re-fetch from Firestore after potential scrape
      firestoreDocsFromQuery = []; 
      const querySnapshotAfterSync = await getDocs(q); 
      querySnapshotAfterSync.forEach(docSnap => firestoreDocsFromQuery.push({ docId: docSnap.id, ...docSnap.data() } as FirestoreDrawDoc));
      // console.log(`LotoData: Re-fetched ${firestoreDocsFromQuery.length} docs for ${canonicalDrawName} after scrape attempt.`);
    } catch (scrapeError) {
      // console.error(`LotoData: Error during scrape or re-fetch for ${canonicalDrawName}:`, scrapeError);
    }
  }
  
  // Deduplication Logic
  const uniqueByCanonicalKeyMap = new Map<string, FirestoreDrawDoc>();
  firestoreDocsFromQuery.forEach(doc => {
    const canonicalKey = constructLottoResultDocId(doc.date, doc.apiDrawName);
    const existing = uniqueByCanonicalKeyMap.get(canonicalKey);
    if (!existing || (doc.fetchedAt && existing.fetchedAt && doc.fetchedAt.toMillis() > existing.fetchedAt.toMillis()) || (doc.fetchedAt && !existing.fetchedAt)) {
      uniqueByCanonicalKeyMap.set(canonicalKey, doc);
    }
  });

  // Further deduplication by content signature (day-month-numbers-year)
  const contentSignatureMap = new Map<string, FirestoreDrawDoc>();
  Array.from(uniqueByCanonicalKeyMap.values()).forEach(doc => {
    if (!doc.date || !doc.winningNumbers) return;
    let dateObj;
    try { dateObj = parseISO(doc.date); if (!isValid(dateObj)) return; } 
    catch (e) { return; }

    const day = format(dateObj, 'dd');
    const monthNum = format(dateObj, 'MM');
    const yearNum = getYear(dateObj);
    const wnString = [...doc.winningNumbers].sort((a, b) => a - b).join(',');
    const mnString = doc.machineNumbers && doc.machineNumbers.length > 0 ? [...doc.machineNumbers].sort((a, b) => a - b).join(',') : 'none';
    const contentSignature = `${doc.apiDrawName}-${day}-${monthNum}-${wnString}-${mnString}`; // Key for same day/month numbers, different years

    const existingEntry = contentSignatureMap.get(contentSignature);
    if (!existingEntry || yearNum > getYear(parseISO(existingEntry.date))) {
        contentSignatureMap.set(contentSignature, doc);
    }
  });

  let processedDocs = Array.from(contentSignatureMap.values());
  processedDocs.sort((a, b) => {
    const dateComparison = b.date.localeCompare(a.date);
    if (dateComparison !== 0) return dateComparison;
    if (a.fetchedAt && b.fetchedAt) return b.fetchedAt.toMillis() - a.fetchedAt.toMillis();
    return 0;
  });

  const finalDocsForPage = processedDocs.slice(0, effectivePageSize);
  let newLastDocSnapshot: QueryDocumentSnapshot<FirestoreDrawDoc> | null = null;
  if (finalDocsForPage.length > 0 && processedDocs.length > effectivePageSize) {
      // Find the original snapshot corresponding to the last item of the page
      const lastItemOnPage = finalDocsForPage[finalDocsForPage.length - 1];
      const originalSnapshot = firestoreDocsFromQuery.find(s => s.docId === lastItemOnPage.docId) as QueryDocumentSnapshot<FirestoreDrawDoc> | undefined;
      if (originalSnapshot) {
          newLastDocSnapshot = originalSnapshot;
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

  if (!year && !month && !startAfterDoc && finalResults.length === 0 && firestoreDocsFromQuery.length === 0) {
    // console.log(`LotoData: No data found for draw ${canonicalDrawName} (slug: ${drawSlug}) after checking Firestore and API.`);
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
    // console.error(`LotoData: Error fetching historical data for ${canonicalDrawName} from Firestore:`, error);
  }

  if (firestoreDocs.length < Math.min(fetchLimit, 10)) {
    // console.log(`LotoData: Insufficient historical data for ${canonicalDrawName} in Firestore. Attempting scrape.`);
    try {
        await _scrapeMainResultsPageData();
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
        // console.log(`LotoData: Re-fetched ${firestoreDocs.length} historical docs for ${canonicalDrawName} after scrape.`);
    } catch (scrapeError) {
        // console.error(`LotoData: Error during historical scrape or re-fetch for ${canonicalDrawName}:`, scrapeError);
    }
  }

  const uniqueByCanonicalKeyMap = new Map<string, FirestoreDrawDoc>();
  firestoreDocs.forEach(doc => {
    const canonicalKey = constructLottoResultDocId(doc.date, doc.apiDrawName);
    const existing = uniqueByCanonicalKeyMap.get(canonicalKey);
     if (!existing || (doc.fetchedAt && existing.fetchedAt && doc.fetchedAt.toMillis() > existing.fetchedAt.toMillis()) || (doc.fetchedAt && !existing.fetchedAt)) {
      uniqueByCanonicalKeyMap.set(canonicalKey, doc);
    }
  });
  
  const contentSignatureMap = new Map<string, FirestoreDrawDoc>();
  Array.from(uniqueByCanonicalKeyMap.values()).forEach(doc => {
    if (!doc.date || !doc.winningNumbers) return;
    let dateObj;
    try { dateObj = parseISO(doc.date); if (!isValid(dateObj)) return; } 
    catch (e) { return; }

    const day = format(dateObj, 'dd');
    const monthNum = format(dateObj, 'MM');
    const yearNum = getYear(dateObj);
    const wnString = [...doc.winningNumbers].sort((a, b) => a - b).join(',');
    const mnString = doc.machineNumbers && doc.machineNumbers.length > 0 ? [...doc.machineNumbers].sort((a, b) => a - b).join(',') : 'none';
    const contentSignature = `${doc.apiDrawName}-${day}-${monthNum}-${wnString}-${mnString}`;

    const existingEntry = contentSignatureMap.get(contentSignature);
    if (!existingEntry || yearNum > getYear(parseISO(existingEntry.date))) {
        contentSignatureMap.set(contentSignature, doc);
    }
  });

  let processedDocs = Array.from(contentSignatureMap.values());
  processedDocs.sort((a, b) => {
      const dateComparison = b.date.localeCompare(a.date);
      if (dateComparison !== 0) return dateComparison;
      if (a.fetchedAt && b.fetchedAt) return b.fetchedAt.toMillis() - a.fetchedAt.toMillis();
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

export interface NumberFrequency {
  number: number;
  frequency: number;
}

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
  let firestoreResults: FirestoreDrawDoc[] = [];
  try {
    const q = query(
      collection(db, RESULTS_COLLECTION_NAME),
      orderBy("date", "desc"),
      orderBy("fetchedAt", "desc"),
      limit(count * 2) 
    );
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(doc => {
        firestoreResults.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc)
    });
  } catch(error) {
      // console.error("LotoData: Error fetching initial recent results:", error);
  }


  const uniqueByCanonicalKeyMap = new Map<string, FirestoreDrawDoc>();
  firestoreResults.forEach(doc => {
      const canonicalKey = constructLottoResultDocId(doc.date, doc.apiDrawName);
      const existing = uniqueByCanonicalKeyMap.get(canonicalKey);
       if (!existing || (doc.fetchedAt && existing.fetchedAt && doc.fetchedAt.toMillis() > existing.fetchedAt.toMillis()) || (doc.fetchedAt && !existing.fetchedAt)) {
        uniqueByCanonicalKeyMap.set(canonicalKey, doc);
      }
  });
  
  const contentSignatureMap = new Map<string, FirestoreDrawDoc>();
  Array.from(uniqueByCanonicalKeyMap.values()).forEach(doc => {
    if (!doc.date || !doc.winningNumbers) return;
    let dateObj;
    try { dateObj = parseISO(doc.date); if (!isValid(dateObj)) return; } 
    catch (e) { return; }

    const day = format(dateObj, 'dd');
    const monthNum = format(dateObj, 'MM');
    const yearNum = getYear(dateObj);
    const wnString = [...doc.winningNumbers].sort((a, b) => a - b).join(',');
    const mnString = doc.machineNumbers && doc.machineNumbers.length > 0 ? [...doc.machineNumbers].sort((a, b) => a - b).join(',') : 'none';
    const contentSignature = `${doc.apiDrawName}-${day}-${monthNum}-${wnString}-${mnString}`;

    const existingEntry = contentSignatureMap.get(contentSignature);
    if (!existingEntry || yearNum > getYear(parseISO(existingEntry.date))) {
        contentSignatureMap.set(contentSignature, doc);
    }
  });

  let processedDocs = Array.from(contentSignatureMap.values());
  return processedDocs
      .sort((a,b) => {
          const dateComparison = b.date.localeCompare(a.date);
          if (dateComparison !== 0) return dateComparison;
          if (a.fetchedAt && b.fetchedAt) return b.fetchedAt.toMillis() - a.fetchedAt.toMillis();
          return 0;
      })
      .slice(0, count);
};

export const fetchAllLottoResultsForExport = async (): Promise<FirestoreDrawDoc[]> => {
   let results: FirestoreDrawDoc[] = [];
  try {
    const q = query(collection(db, RESULTS_COLLECTION_NAME), orderBy("date", "desc"));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(doc => {
      results.push({ docId: doc.id, ...doc.data() } as FirestoreDrawDoc)
    });
  } catch(error) {
      // console.error("LotoData: Error fetching all results for export:", error);
  }

  const uniqueByCanonicalKeyMap = new Map<string, FirestoreDrawDoc>();
  results.forEach(doc => {
      const canonicalKey = constructLottoResultDocId(doc.date, doc.apiDrawName);
      const existing = uniqueByCanonicalKeyMap.get(canonicalKey);
       if (!existing || (doc.fetchedAt && existing.fetchedAt && doc.fetchedAt.toMillis() > existing.fetchedAt.toMillis()) || (doc.fetchedAt && !existing.fetchedAt)) {
        uniqueByCanonicalKeyMap.set(canonicalKey, doc);
      }
  });
  
  const contentSignatureMap = new Map<string, FirestoreDrawDoc>();
  Array.from(uniqueByCanonicalKeyMap.values()).forEach(doc => {
    if (!doc.date || !doc.winningNumbers) return;
    let dateObj;
    try { dateObj = parseISO(doc.date); if (!isValid(dateObj)) return; } 
    catch (e) { return; }

    const day = format(dateObj, 'dd');
    const monthNum = format(dateObj, 'MM');
    const yearNum = getYear(dateObj);
    const wnString = [...doc.winningNumbers].sort((a, b) => a - b).join(',');
    const mnString = doc.machineNumbers && doc.machineNumbers.length > 0 ? [...doc.machineNumbers].sort((a, b) => a - b).join(',') : 'none';
    const contentSignature = `${doc.apiDrawName}-${day}-${monthNum}-${wnString}-${mnString}`;

    const existingEntry = contentSignatureMap.get(contentSignature);
    if (!existingEntry || yearNum > getYear(parseISO(existingEntry.date))) {
        contentSignatureMap.set(contentSignature, doc);
    }
  });
  
  let processedDocs = Array.from(contentSignatureMap.values());
  return processedDocs.sort((a,b) => b.date.localeCompare(a.date));
};

export const deleteLottoResult = async (docId: string): Promise<void> => {
  if (!docId) {
    throw new Error("Document ID is required for deletion.");
  }
  try {
    const docRef = doc(db, RESULTS_COLLECTION_NAME, docId);
    await deleteDoc(docRef);
  } catch (error) {
    // console.error("LotoData: Error deleting lotto result:", error);
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
      // console.log(`LotoData: addManualLottoResult - Identical data already exists for ${docId}. Skipping write.`);
      throw new Error(`Un résultat identique pour le tirage "${getDrawNameBySlug(input.drawSlug) || canonicalDrawName}" à la date du ${format(input.date, 'PPP', {locale: fr})} existe déjà (ID: ${docId}).`);
    }
    // console.log(`LotoData: addManualLottoResult - Data for ${docId} exists but differs. Allowing overwrite/update for manual add.`);
  }
  await setDoc(docRef, dataToSave, {merge: true}); 
}

    
