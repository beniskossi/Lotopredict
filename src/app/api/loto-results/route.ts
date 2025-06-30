
import { type NextRequest, NextResponse } from 'next/server';
import { format, parse as dateFnsParse, isValid, getYear, getMonth as dateFnsGetMonth } from 'date-fns';
import { fr } from 'date-fns/locale';

// Define interfaces for type safety
interface DrawResult {
  draw_name: string;
  date: string;
  gagnants: number[];
  machine: number[];
}

interface DailyDrawResult {
  date: string;
  drawResults: {
    nightDraws: Array<{ drawName: string; winningNumbers: string; machineNumbers: string }>;
    standardDraws: Array<{ drawName: string; winningNumbers: string; machineNumbers: string }>;
  };
}

interface WeeklyDrawResult {
  startDate: string;
  endDate: string;
  drawResultsDaily: DailyDrawResult[];
}

interface ResultsData {
  status: string;
  drawsResultsWeekly: WeeklyDrawResult[];
  monthYears: string[];
  drawTypes: string[];
  success: boolean;
}

// Draw schedule for standard draws from the external API
const DRAW_SCHEDULE: { [key: string]: { [key: string]: string } } = {
  Lundi: { '10H': 'Reveil', '13H': 'Etoile', '16H': 'Akwaba', '18H15': 'Monday Special' },
  Mardi: { '10H': 'La Matinale', '13H': 'Emergence', '16H': 'Sika', '18H15': 'Lucky Tuesday' },
  Mercredi: { '10H': 'Premiere Heure', '13H': 'Fortune', '16H': 'Baraka', '18H15': 'Midweek' },
  Jeudi: { '10H': 'Kado', '13H': 'Privilege', '16H': 'Monni', '18H15': 'Fortune Thursday' },
  Vendredi: { '10H': 'Cash', '13H': 'Solution', '16H': 'Wari', '18H15': 'Friday Bonanza' },
  Samedi: { '10H': 'Soutra', '13H': 'Diamant', '16H': 'Moaye', '18H15': 'National' },
  Dimanche: { '10H': 'Benediction', '13H': 'Prestige', '16H': 'Awale', '18H15': 'Espoir' },
};

// API route handler using App Router syntax
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month'); // e.g., "YYYY-MM"
  
  const baseUrl = 'https://lotobonheur.ci/api/results';
  let url = baseUrl;

  // Adapt the YYYY-MM format from lotoData.ts to the format expected by the external API (e.g., juin-2024)
  if (month) {
    const monthParts = month.split('-');
    if (monthParts.length === 2 && !isNaN(parseInt(monthParts[0])) && !isNaN(parseInt(monthParts[1]))) {
      const year = parseInt(monthParts[0]);
      const monthIndex = parseInt(monthParts[1]) - 1;
      const monthName = format(new Date(year, monthIndex), 'MMMM', { locale: fr }).toLowerCase();
      url = `${baseUrl}?month=${monthName}-${year}`;
    } else {
      url = `${baseUrl}?month=${month}`; // Assume it's already in the 'monthName-YYYY' format
    }
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://lotobonheur.ci/resultats',
      },
      cache: 'no-store' // Ensure we always get fresh data from the external source
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Error from external API ${url}. Status: ${response.status}, Body: ${errorBody}`);
        return NextResponse.json({ error: 'Failed to fetch results from external API', details: errorBody }, { status: response.status });
    }

    const resultsData: ResultsData = await response.json();
    if (!resultsData.success) {
      return NextResponse.json({ error: 'API returned unsuccessful response' }, { status: 500 });
    }

    const drawsResultsWeekly = resultsData.drawsResultsWeekly || [];

    const validDrawNames = new Set<string>();
    Object.values(DRAW_SCHEDULE).forEach((day) => {
      Object.values(day).forEach((drawName) => validDrawNames.add(drawName));
    });

    const results: DrawResult[] = [];
    const currentYear = getYear(new Date());
    const currentMonthIndex = dateFnsGetMonth(new Date());

    for (const week of drawsResultsWeekly) {
      if (!week.drawResultsDaily) continue;
      for (const dailyResult of week.drawResultsDaily) {
        const dateStr = dailyResult.date;
        let drawDate: string;

        try {
          const dateParts = dateStr.split(' ');
          const dayMonth = dateParts.length > 1 ? dateParts[1] : dateParts[0];
          const [dayStr, monthStr] = dayMonth.split('/');
          const day = parseInt(dayStr);
          const monthIndex = parseInt(monthStr) - 1;
          
          let yearToUse = currentYear;
          if (currentMonthIndex < 3 && monthIndex > 8) { // Heuristic for year transition
              yearToUse = currentYear - 1;
          }
          
          const parsedDate = dateFnsParse(`${day}/${monthIndex + 1}/${yearToUse}`, 'd/M/yyyy', new Date());
          if (!isValid(parsedDate)) continue;
          drawDate = parsedDate.toISOString().split('T')[0];
        } catch (e) {
          continue;
        }

        if (dailyResult.drawResults && dailyResult.drawResults.standardDraws) {
          for (const draw of dailyResult.drawResults.standardDraws) {
            const drawName = draw.drawName ? draw.drawName.trim() : "";
            if (!drawName || !validDrawNames.has(drawName) || (draw.winningNumbers && draw.winningNumbers.startsWith('.'))) {
              continue;
            }

            const winningNumbers = draw.winningNumbers?.match(/\d+/g)?.map(Number).slice(0, 5) || [];
            const machineNumbers = draw.machineNumbers?.match(/\d+/g)?.map(Number).slice(0, 5) || [];

            if (winningNumbers.length === 5) {
              results.push({
                draw_name: drawName,
                date: drawDate,
                gagnants: winningNumbers,
                machine: machineNumbers.length === 5 ? machineNumbers : [],
              });
            }
          }
        }
      }
    }

    if (results.length === 0 && month) {
      return NextResponse.json({ error: 'No valid draw results found for the specified period.' }, { status: 404 });
    }

    return NextResponse.json(results);

  } catch (error: any) {
    console.error(`Generic error fetching ${url}:`, error);
    return NextResponse.json({ error: 'Failed to fetch results due to an internal server error.' }, { status: 500 });
  }
}
