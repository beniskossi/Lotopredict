
import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { parse } from 'date-fns';

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

// Draw schedule for standard draws
const DRAW_SCHEDULE: { [key: string]: { [key: string]: string } } = {
  Lundi: {
    '10H': 'Reveil',
    '13H': 'Etoile',
    '16H': 'Akwaba',
    '18H15': 'Monday Special',
  },
  Mardi: {
    '10H': 'La Matinale',
    '13H': 'Emergence',
    '16H': 'Sika',
    '18H15': 'Lucky Tuesday',
  },
  Mercredi: {
    '10H': 'Premiere Heure',
    '13H': 'Fortune',
    '16H': 'Baraka',
    '18H15': 'Midweek',
  },
  Jeudi: {
    '10H': 'Kado',
    '13H': 'Privilege',
    '16H': 'Monni',
    '18H15': 'Fortune Thursday',
  },
  Vendredi: {
    '10H': 'Cash',
    '13H': 'Solution',
    '16H': 'Wari',
    '18H15': 'Friday Bonanza',
  },
  Samedi: {
    '10H': 'Soutra',
    '13H': 'Diamant',
    '16H': 'Moaye',
    '18H15': 'National',
  },
  Dimanche: {
    '10H': 'Benediction',
    '13H': 'Prestige',
    '16H': 'Awale',
    '18H15': 'Espoir',
  },
};

// API route handler
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const month = req.query.month as string; // e.g., "mai-2025"
  const baseUrl = 'https://lotobonheur.ci/api/results';
  const url = month ? `${baseUrl}?month=${month}` : baseUrl;

  try {
    // Fetch the API directly
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://lotobonheur.ci/resultats',
      },
      timeout: 10000, // 10 seconds timeout
    });

    // Parse JSON response
    const resultsData: ResultsData = response.data;
    if (!resultsData.success) {
      return res.status(500).json({ error: 'API returned unsuccessful response' });
    }

    const drawsResultsWeekly = resultsData.drawsResultsWeekly;
    if (!drawsResultsWeekly) {
      // Handle cases where drawsResultsWeekly might be missing, even if success is true
      console.warn('API response successful but drawsResultsWeekly is missing.');
      return res.status(200).json([]); // Return empty array or appropriate response
    }


    // Valid draw names
    const validDrawNames = new Set<string>();
    Object.values(DRAW_SCHEDULE).forEach((day) => {
      Object.values(day).forEach((drawName) => validDrawNames.add(drawName));
    });

    const results: DrawResult[] = [];

    // Process draw results
    for (const week of drawsResultsWeekly) {
      if (!week.drawResultsDaily) continue; // Skip if a week has no daily results
      for (const dailyResult of week.drawResultsDaily) {
        const dateStr = dailyResult.date;
        let drawDate: string;

        try {
          // Parse date (e.g., "dimanche 04/05" to "2025-05-04")
          // This part has a hardcoded year "2025", which needs to be addressed for other years.
          const dateParts = dateStr.split(' ');
          const dayMonth = dateParts.length > 1 ? dateParts[1] : dateParts[0]; // "04/05"
          const [day, monthStr] = dayMonth.split('/');
          const parsedDate = parse(`${day}/${monthStr}/2025`, 'dd/MM/yyyy', new Date()); // HARDCODED YEAR
          drawDate = parsedDate.toISOString().split('T')[0];
        } catch (e) {
          console.warn(`Invalid date format: ${dateStr}, error: ${e}`);
          continue;
        }

        // Process standard draws
        if (dailyResult.drawResults && dailyResult.drawResults.standardDraws) {
          for (const draw of dailyResult.drawResults.standardDraws) {
            const drawName = draw.drawName ? draw.drawName.trim() : "";
            if (!drawName || !validDrawNames.has(drawName) || (draw.winningNumbers && draw.winningNumbers.startsWith('.'))) {
              continue; // Skip invalid or placeholder draws
            }

            // Parse numbers
            const winningNumbers = draw.winningNumbers
              ?.match(/\d+/g)
              ?.map(Number)
              .slice(0, 5) || [];
            const machineNumbers = draw.machineNumbers
              ?.match(/\d+/g)
              ?.map(Number)
              .slice(0, 5) || [];

            // Validate data - ensure 5 winning numbers, machine numbers can be empty or 5
            if (winningNumbers.length === 5 && (machineNumbers.length === 0 || machineNumbers.length === 5)) {
              results.push({
                draw_name: drawName,
                date: drawDate,
                gagnants: winningNumbers,
                machine: machineNumbers.length === 5 ? machineNumbers : [], // Store empty array if not 5
              });
            } else {
              // console.warn(`Incomplete data for draw ${drawName} on ${drawDate}: WN-${winningNumbers.length}, MN-${machineNumbers.length}`);
            }
          }
        }
      }
    }

    if (results.length === 0 && month) { // Only return 404 if a specific month was requested and no data found
      return res.status(404).json({ error: 'No valid draw results found for the specified period.' });
    }

    return res.status(200).json(results);
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      console.error(`Axios error fetching ${url}: ${error.message}`, error.toJSON());
      if (error.response) {
        return res.status(error.response.status).json({ error: 'Failed to fetch results from external API', details: error.response.data });
      } else if (error.request) {
        return res.status(503).json({ error: 'No response from external API. Service might be unavailable.' });
      }
    }
    console.error(`Generic error fetching ${url}:`, error);
    return res.status(500).json({ error: 'Failed to fetch results due to an internal server error.' });
  }
}
