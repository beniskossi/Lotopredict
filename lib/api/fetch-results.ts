import axios, { type AxiosResponse, type AxiosError } from "axios"
import { parse } from "date-fns"
import { createClient } from "@supabase/supabase-js"
import type { PostgrestError } from "@supabase/postgrest-js"
import type { DrawResult } from "@/lib/types"

interface DrawSchedule {
  [day: string]: { [time: string]: string }
}

class NetworkError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
  ) {
    super(message)
    this.name = "NetworkError"
  }
}

class ParsingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ParsingError"
  }
}

class SyncError extends Error {
  constructor(
    message: string,
    public supabaseError?: PostgrestError,
  ) {
    super(message)
    this.name = "SyncError"
  }
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ValidationError"
  }
}

const DRAW_SCHEDULE: DrawSchedule = {
  Lundi: {
    "10:00": "Reveil",
    "13:00": "Etoile",
    "16:00": "Akwaba",
    "18:15": "Monday Special",
  },
  Mardi: {
    "10:00": "La Matinale",
    "13:00": "Emergence",
    "16:00": "Sika",
    "18:15": "Lucky Tuesday",
  },
  Mercredi: {
    "10:00": "Premiere Heure",
    "13:00": "Fortune",
    "16:00": "Baraka",
    "18:15": "Midweek",
  },
  Jeudi: {
    "10:00": "Kado",
    "13:00": "Privilege",
    "16:00": "Monni",
    "18:15": "Fortune Thursday",
  },
  Vendredi: {
    "10:00": "Cash",
    "13:00": "Solution",
    "16:00": "Wari",
    "18:15": "Friday Bonanza",
  },
  Samedi: {
    "10:00": "Soutra",
    "13:00": "Diamant",
    "16:00": "Moaye",
    "18:15": "National",
  },
  Dimanche: {
    "10:00": "Benediction",
    "13:00": "Prestige",
    "16:00": "Awale",
    "18:15": "Espoir",
  },
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: {
        draw_results: [25],
      },
    },
  },
})

async function handleAxiosError(error: AxiosError): Promise<never> {
  if (error.response) {
    throw new NetworkError(
      `Erreur HTTP ${error.response.status}: ${error.response.statusText}`,
      error.response.status,
      error.code,
    )
  } else if (error.request) {
    throw new NetworkError("Aucune réponse du serveur", undefined, error.code)
  } else {
    throw new NetworkError(`Erreur de requête: ${error.message}`, undefined, error.code)
  }
}

async function handleSupabaseError(error: PostgrestError | null): Promise<never> {
  if (!error) {
    throw new SyncError("Erreur inconnue lors de la synchronisation Supabase")
  }
  throw new SyncError(`Erreur Supabase: ${error.message}`, error)
}

export async function fetchLotteryResults(month?: string): Promise<DrawResult[]> {
  const baseUrl = "https://lotobonheur.ci/api/results"
  let response: AxiosResponse

  try {
    response = await axios.get(baseUrl, {
      params: month ? { month } : {},
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
        Referer: "https://lotobonheur.ci/resultats",
      },
      timeout: 10000,
    })
  } catch (error) {
    if (axios.isAxiosError(error)) {
      await handleAxiosError(error)
    }
    throw new NetworkError(`Erreur inattendue lors de la requête: ${(error as Error).message}`)
  }

  const resultsData = response.data

  if (!resultsData.success) {
    throw new ValidationError("Réponse API non réussie")
  }

  const drawsResultsWeekly = resultsData.drawsResultsWeekly

  const validDrawNames = new Set<string>()
  Object.values(DRAW_SCHEDULE).forEach((day) => {
    Object.values(day).forEach((drawName) => validDrawNames.add(drawName))
  })

  const results: DrawResult[] = []

  for (const week of drawsResultsWeekly) {
    const year = week.startDate.split("/")[2]

    for (const dailyResult of week.drawResultsDaily) {
      const dateStr = dailyResult.date
      let drawDate: string

      try {
        const [, dayMonth] = dateStr.split(" ")
        const [day, month] = dayMonth.split("/")
        const parsedDate = parse(`${day}/${month}/${year}`, "dd/MM/yyyy", new Date())
        drawDate = parsedDate.toISOString().split("T")[0]
      } catch (e) {
        throw new ParsingError(`Format de date invalide : ${dateStr}`)
      }

      for (const draw of dailyResult.drawResults.standardDraws) {
        const drawName = draw.drawName

        if (!validDrawNames.has(drawName) || draw.winningNumbers.startsWith(".")) {
          continue
        }

        const winningNumbers = (draw.winningNumbers.match(/\d+/g) || []).map(Number).slice(0, 5)
        const machineNumbers = (draw.machineNumbers?.match(/\d+/g) || []).map(Number).slice(0, 5)

        if (winningNumbers.length !== 5) {
          throw new ValidationError(
            `Données incomplètes pour le tirage ${drawName}: ${winningNumbers.length} numéros gagnants au lieu de 5`,
          )
        }

        results.push({
          draw_name: drawName,
          draw_date: drawDate,
          winning_numbers: winningNumbers,
          machine_numbers: machineNumbers.length === 5 ? machineNumbers : undefined,
        })
      }
    }
  }

  if (results.length === 0) {
    throw new ValidationError("Aucun résultat de tirage valide trouvé pour la période spécifiée.")
  }

  const { error: upsertError } = await supabase
    .from("draw_results")
    .upsert(results, { onConflict: "draw_date,draw_name" })

  if (upsertError) {
    await handleSupabaseError(upsertError)
  }

  return results
}

// Helper function to fetch latest results
export async function fetchLatestResults(): Promise<DrawResult[]> {
  return fetchLotteryResults()
}

// Helper function to fetch results for a specific month
export async function fetchResultsForMonth(month: string): Promise<DrawResult[]> {
  return fetchLotteryResults(month)
}

export async function fetchResultsFromAPI(month: number, year: number): Promise<DrawResult[]> {
  try {
    const response = await fetch("/api/fetch-results", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ month: `${year}-${String(month).padStart(2, "0")}` }),
    })

    const result = await response.json()

    if (!result.success || !result.data) {
      throw new Error(result.error || "Failed to fetch results")
    }

    return result.data as DrawResult[]
  } catch (error) {
    console.error("Error fetching results from API:", error)
    throw error
  }
}

export function subscribeToDrawResults(callback: (payload: any) => void): { unsubscribe: () => void; error?: Error } {
  const channel = supabase
    .channel("draw_results_channel")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "draw_results",
      },
      (payload) => {
        try {
          callback(payload)
        } catch (callbackError) {
          console.error("Erreur dans le callback de mise à jour en temps réel:", callbackError)
        }
      },
    )
    .subscribe((status, err) => {
      if (status === "SUBSCRIPTION_ERROR" || err) {
        const subscriptionError = new Error(`Erreur d'abonnement en temps réel: ${err?.message || status}`)
        console.error(subscriptionError.message)
      }
    })

  return {
    unsubscribe: () => {
      supabase.removeChannel(channel)
    },
  }
}

export { NetworkError, ParsingError, SyncError, ValidationError }
