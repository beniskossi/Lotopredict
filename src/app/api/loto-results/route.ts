
import { NextResponse, type NextRequest } from 'next/server';
import { parse, format, getYear as dateFnsGetYear, isValid as isDateValid, setYear as dateFnsSetYear, isFuture, getMonth as dateFnsGetMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { DRAW_SCHEDULE } from '@/lib/lotoDraws.tsx'; // Using the existing draw schedule

// Helper to get all valid simple draw names (e.g., "Réveil", "Étoile")
const VALID_DRAW_NAMES = new Set<string>();
DRAW_SCHEDULE.forEach(daySchedule => {
  daySchedule.draws.forEach(draw => {
    VALID_DRAW_NAMES.add(draw.name);
  });
});

interface ExternalDrawResult {
  drawName: string;
  winningNumbers: string; // e.g., "10 - 20 - 30 - 40 - 50"
  machineNumbers: string; // e.g., "01 - 02 - 03 - 04 - 05"
}

interface ExternalDailyResult {
  date: string; // e.g., "dimanche 04/05"
  drawResults: {
    standardDraws: ExternalDrawResult[];
  };
}

interface ExternalWeekResult {
  drawResultsDaily: ExternalDailyResult[];
}

interface ExternalApiResponse {
  success: boolean;
  drawsResultsWeekly?: ExternalWeekResult[];
  // Other potential fields like currentMonth, message
}

interface ProcessedDrawResult {
  draw_name: string;
  date: string; // YYYY-MM-DD
  gagnants: number[];
  machine: number[];
}

// Helper to convert YYYY-MM to French month-YYYY for the external API
function formatYearMonthForExternalApi(yearMonth: string): string | null {
  // yearMonth is expected as YYYY-MM
  const [year, monthNum] = yearMonth.split('-');
  if (!year || !monthNum) return null;
  const monthIndex = parseInt(monthNum, 10) - 1;
  if (isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) return null;
  
  // Create a date object for the first of that month to format it
  const dateObj = new Date(parseInt(year, 10), monthIndex, 1);
  return format(dateObj, 'MMMM-yyyy', { locale: fr }).toLowerCase(); // e.g., "mai-2025"
}


export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const monthQuery = searchParams.get('month'); // Expected format YYYY-MM e.g. 2025-05

  let externalApiUrl = 'https://lotobonheur.ci/api/results';
  let targetYear: number | null = null;

  if (monthQuery) {
    const [yearStr, monthStr] = monthQuery.split('-');
    if (yearStr && monthStr && /^\d{4}$/.test(yearStr) && /^\d{2}$/.test(monthStr)) {
        targetYear = parseInt(yearStr, 10);
        const formattedMonthForApi = formatYearMonthForExternalApi(monthQuery);
        if (formattedMonthForApi) {
            externalApiUrl = `${externalApiUrl}?month=${formattedMonthForApi}`;
        } else {
            return NextResponse.json({ error: 'Invalid month format provided. Use YYYY-MM.' }, { status: 400 });
        }
    } else {
        return NextResponse.json({ error: 'Invalid month format provided. Use YYYY-MM.' }, { status: 400 });
    }
  }


  try {
    let externalApiResponse;
    try {
      externalApiResponse = await fetch(externalApiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json',
          'Referer': 'https://lotobonheur.ci/resultats',
        },
        // cache: 'no-store', // Ensure fresh data for API route
      });
    } catch (fetchError: any) {
      console.error(`LotoPredict API Route: External API fetch to ${externalApiUrl} failed directly:`, fetchError);
      return NextResponse.json({ error: `Failed to connect to the external lottery API: ${externalApiUrl}. Please check network connectivity or if the external service is down.`, details: fetchError.message }, { status: 503 }); // Service Unavailable
    }


    if (!externalApiResponse.ok) {
      const errorBody = await externalApiResponse.text();
      console.error(`LotoPredict API Route: External API error: ${externalApiResponse.status} ${externalApiResponse.statusText} from ${externalApiUrl}. Body: ${errorBody}`);
      return NextResponse.json({ error: `Failed to fetch data from external API. Status: ${externalApiResponse.status}`, details: errorBody }, { status: externalApiResponse.status });
    }

    let apiData: ExternalApiResponse;
    try {
      apiData = await externalApiResponse.json();
    } catch (jsonError: any) {
        console.error(`LotoPredict API Route: Failed to parse JSON response from ${externalApiUrl}:`, jsonError);
        const textResponse = await externalApiResponse.text(); // Attempt to get text if JSON fails
        console.error(`LotoPredict API Route: Non-JSON response was: ${textResponse.substring(0, 500)}...`);
        return NextResponse.json({ error: 'External API returned non-JSON response or malformed JSON.', details: jsonError.message }, { status: 502 }); // Bad Gateway
    }


    if (!apiData.success || !apiData.drawsResultsWeekly) {
      console.error('LotoPredict API Route: External API response unsuccessful or missing drawsResultsWeekly:', apiData);
      return NextResponse.json({ error: 'External API returned unsuccessful or malformed response structure' }, { status: 502 });
    }

    const results: ProcessedDrawResult[] = [];
    const currentActualYear = dateFnsGetYear(new Date());

    for (const week of apiData.drawsResultsWeekly) {
      for (const dailyResult of week.drawResultsDaily) {
        const apiDateStr = dailyResult.date; // e.g., "dimanche 04/05"
        let drawDateISO: string;

        try {
          const dateParts = apiDateStr.split(' '); // ["dimanche", "04/05"]
          const dayMonth = dateParts.length > 1 ? dateParts[1] : dateParts[0]; // "04/05"
          const [dayStr, monthStr] = dayMonth.split('/');
          const day = parseInt(dayStr, 10);
          const monthIdx = parseInt(monthStr, 10) -1; // month is 0-indexed for Date constructor

          if (isNaN(day) || isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11 || day < 1 || day > 31) {
            console.warn(`LotoPredict API Route: Invalid day/month parsed from API date: ${apiDateStr}`);
            continue;
          }
          
          let yearToUse = targetYear; // Use year from ?month=YYYY-MM if provided
          if (!yearToUse) { // If no month query, infer from current year
            yearToUse = currentActualYear; 
            const currentActualMonth = dateFnsGetMonth(new Date()); // 0-indexed
            // If API month is much later in the year than current month (e.g. current Jan, API Dec), assume previous year.
            if (monthIdx > currentActualMonth && (monthIdx - currentActualMonth > 6) ) { 
                 yearToUse = currentActualYear - 1;
            }
          }
          
          const parsedDate = new Date(yearToUse, monthIdx, day);
          if (!isDateValid(parsedDate)) {
            console.warn(`LotoPredict API Route: Constructed invalid date for: ${apiDateStr} with year ${yearToUse}`);
            continue;
          }
          drawDateISO = format(parsedDate, 'yyyy-MM-dd');

        } catch (e) {
          console.warn(`LotoPredict API Route: Error parsing date string: ${apiDateStr}`, e);
          continue;
        }

        for (const draw of dailyResult.drawResults.standardDraws) {
          const drawName = draw.drawName.trim();
          
          if (!VALID_DRAW_NAMES.has(drawName) || draw.winningNumbers.startsWith('.')) {
            continue;
          }

          const winningNumbers = (draw.winningNumbers.match(/\d+/g) || []).map(Number).slice(0, 5);
          const machineNumbers = (draw.machineNumbers?.match(/\d+/g) || []).map(Number).slice(0, 5);

          if (winningNumbers.length === 5) { 
            results.push({
              draw_name: drawName, 
              date: drawDateISO,
              gagnants: winningNumbers,
              machine: machineNumbers.length === 5 ? machineNumbers : [], 
            });
          }
        }
      }
    }
    
    if (results.length === 0 && monthQuery) {
       return NextResponse.json([], { status: 200 });
    }

    return NextResponse.json(results, { status: 200 });

  } catch (error: any) {
    console.error('LotoPredict API Route: Unhandled error in /api/loto-results GET handler:', error);
    return NextResponse.json({ error: 'Internal server error while processing lottery results.', details: error.message }, { status: 500 });
  }
}

    