
import { NextResponse, type NextRequest } from 'next/server';
import { parse, format, getYear as dateFnsGetYear, isValid as isDateValid, setYear as dateFnsSetYear, isFuture } from 'date-fns';
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
    const response = await fetch(externalApiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://lotobonheur.ci/resultats',
      },
      // cache: 'no-store', // Ensure fresh data for API route
    });

    if (!response.ok) {
      console.error(`External API error: ${response.status} ${response.statusText} from ${externalApiUrl}`);
      return NextResponse.json({ error: `Failed to fetch data from external API. Status: ${response.status}` }, { status: response.status });
    }

    const apiData: ExternalApiResponse = await response.json();

    if (!apiData.success || !apiData.drawsResultsWeekly) {
      console.error('External API response unsuccessful or missing drawsResultsWeekly:', apiData);
      return NextResponse.json({ error: 'External API returned unsuccessful or malformed response' }, { status: 502 });
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
          const month = parseInt(monthStr, 10) -1; // month is 0-indexed for Date constructor

          if (isNaN(day) || isNaN(month) || month < 0 || month > 11 || day < 1 || day > 31) {
            console.warn(`Invalid day/month parsed from API date: ${apiDateStr}`);
            continue;
          }
          
          let yearToUse = targetYear; // Use year from ?month=YYYY-MM if provided
          if (!yearToUse) { // If no month query, infer from current year
            yearToUse = currentActualYear;
            let tempDate = new Date(yearToUse, month, day);
            if (isDateValid(tempDate) && isFuture(tempDate) && tempDate > new Date()) { // check if it's also greater than today
                 yearToUse = currentActualYear - 1;
            }
          }
          
          const parsedDate = new Date(yearToUse, month, day);
          if (!isDateValid(parsedDate)) {
            console.warn(`Constructed invalid date for: ${apiDateStr} with year ${yearToUse}`);
            continue;
          }
          drawDateISO = format(parsedDate, 'yyyy-MM-dd');

        } catch (e) {
          console.warn(`Error parsing date string: ${apiDateStr}`, e);
          continue;
        }

        for (const draw of dailyResult.drawResults.standardDraws) {
          const drawName = draw.drawName.trim();
          
          if (!VALID_DRAW_NAMES.has(drawName) || draw.winningNumbers.startsWith('.')) {
            continue;
          }

          const winningNumbers = (draw.winningNumbers.match(/\d+/g) || []).map(Number).slice(0, 5);
          const machineNumbers = (draw.machineNumbers?.match(/\d+/g) || []).map(Number).slice(0, 5);

          if (winningNumbers.length === 5) { // Machine numbers are optional for a valid entry based on previous logic
            results.push({
              draw_name: drawName, // This is the simple name like "Réveil"
              date: drawDateISO,
              gagnants: winningNumbers,
              machine: machineNumbers.length === 5 ? machineNumbers : [], // Store as empty if not 5
            });
          } else {
            // console.warn(`Incomplete winning numbers for ${drawName} on ${drawDateISO}`);
          }
        }
      }
    }
    
    if (results.length === 0 && monthQuery) {
      // It's okay to return empty if a specific month had no data, don't 404
       return NextResponse.json([], { status: 200 });
    }


    return NextResponse.json(results, { status: 200 });

  } catch (error: any) {
    console.error('Error in /api/loto-results:', error);
    return NextResponse.json({ error: 'Internal server error while fetching lottery results.', details: error.message }, { status: 500 });
  }
}
