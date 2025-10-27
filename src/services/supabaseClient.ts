import { createClient } from "@/lib/supabase/client"
import type {
  LotteryResult,
  PredictionHistory,
  UserPreferences,
  AlgorithmPerformance,
  AuditLog,
} from "@/config/supabase"
import { syncLotteryResultsToSupabase } from "@/app/actions/sync-lottery-results"

// Get the Supabase client (browser-side)
function getSupabaseClient() {
  return createClient()
}

// Service pour les résultats de loterie
export class LotteryResultsService {
  static async getAllResults(): Promise<LotteryResult[]> {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.from("lottery_results").select("*").order("date", { ascending: false })

    if (error) throw error
    return data || []
  }

  static async getResultsByDraw(drawName: string): Promise<LotteryResult[]> {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from("lottery_results")
      .select("*")
      .eq("draw_name", drawName)
      .order("date", { ascending: false })

    if (error) throw error
    return data || []
  }

  static async addResult(result: Omit<LotteryResult, "id" | "created_at" | "updated_at">): Promise<LotteryResult> {
    const supabase = getSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from("lottery_results")
      .insert([{ ...result, user_id: user?.id }])
      .select()
      .maybeSingle()

    if (error) throw error
    if (!data) throw new Error("Failed to insert lottery result")
    return data
  }

  static async updateResult(id: string, updates: Partial<LotteryResult>): Promise<LotteryResult> {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.from("lottery_results").update(updates).eq("id", id).select().maybeSingle()

    if (error) throw error
    if (!data) throw new Error("Failed to update lottery result")
    return data
  }

  static async deleteResult(id: string): Promise<void> {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from("lottery_results").delete().eq("id", id)

    if (error) throw error
  }

  static async syncWithExternalAPI(
    results: Omit<LotteryResult, "id" | "created_at" | "updated_at">[],
  ): Promise<{ inserted: number; updated: number }> {
    console.log(`[v0] 🔄 Appel du Server Action pour synchroniser ${results.length} résultats...`)

    // This allows us to use the service role key server-side
    const formattedResults = results.map((result: any) => ({
      draw_name: result.draw_name,
      date: result.date,
      winning_numbers: result.gagnants || result.winning_numbers || [],
      machine_numbers: result.machine || result.machine_numbers || [],
    }))

    try {
      const response = await syncLotteryResultsToSupabase(formattedResults)

      if (!response.success) {
        console.error("[v0] ❌ Échec de la synchronisation:", response.error)
        throw new Error(response.error || "Sync failed")
      }

      console.log(`[v0] ✅ Synchronisation réussie: ${response.inserted} résultats`)

      return {
        inserted: response.inserted,
        updated: 0,
      }
    } catch (error: any) {
      console.error("[v0] ❌ Erreur lors de l'appel du Server Action:", error.message)
      throw error
    }
  }
}

// Service pour l'historique des prédictions
export class PredictionsService {
  static async savePrediction(prediction: Omit<PredictionHistory, "id" | "created_at">): Promise<PredictionHistory> {
    const supabase = getSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from("predictions_history")
      .insert([{ ...prediction, user_id: user?.id }])
      .select()
      .maybeSingle()

    if (error) throw error
    if (!data) throw new Error("Failed to save prediction")
    return data
  }

  static async getUserPredictions(userId: string): Promise<PredictionHistory[]> {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from("predictions_history")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) throw error
    return data || []
  }

  static async updatePredictionResult(id: string, actualResult: number[], matchesCount: number): Promise<void> {
    const supabase = getSupabaseClient()
    const { error } = await supabase
      .from("predictions_history")
      .update({
        actual_result: actualResult,
        matches_count: matchesCount,
        is_winning: matchesCount >= 3,
      })
      .eq("id", id)

    if (error) throw error
  }
}

// Service pour les préférences utilisateur
export class UserPreferencesService {
  static async getUserPreferences(userId: string): Promise<UserPreferences | null> {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.from("user_preferences").select("*").eq("user_id", userId).maybeSingle()

    if (error) throw error
    return data
  }

  static async updateUserPreferences(
    preferences: Omit<UserPreferences, "created_at" | "updated_at">,
  ): Promise<UserPreferences> {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.from("user_preferences").upsert([preferences]).select().maybeSingle()

    if (error) throw error
    if (!data) throw new Error("Failed to update user preferences")
    return data
  }

  static async getPreferences(userId: string): Promise<UserPreferences | null> {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.from("user_preferences").select("*").eq("user_id", userId).single()

    if (error && error.code !== "PGRST116") throw error
    return data
  }

  static async savePreferences(
    preferences: Omit<UserPreferences, "id" | "created_at" | "updated_at">,
  ): Promise<UserPreferences> {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.from("user_preferences").upsert([preferences]).select().single()

    if (error) throw error
    return data
  }
}

// Service pour la performance des algorithmes
export class AlgorithmPerformanceService {
  static async getAllPerformances(): Promise<AlgorithmPerformance[]> {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from("algorithm_performance")
      .select("*")
      .order("accuracy_rate", { ascending: false })

    if (error) throw error
    return data || []
  }

  static async updatePerformance(algorithmName: string, performance: Partial<AlgorithmPerformance>): Promise<void> {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from("algorithm_performance").upsert([
      {
        algorithm_name: algorithmName,
        ...performance,
        last_updated: new Date().toISOString(),
      },
    ])

    if (error) throw error
  }
}

// Service pour les logs d'audit
export class AuditService {
  static async addLog(log: Omit<AuditLog, "id" | "timestamp">): Promise<void> {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from("audit_logs").insert([
      {
        ...log,
        timestamp: new Date().toISOString(),
      },
    ])

    if (error) throw error
  }

  static async getUserLogs(userId: string, limit = 100): Promise<AuditLog[]> {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("user_id", userId)
      .order("timestamp", { ascending: false })
      .limit(limit)

    if (error) throw error
    return data || []
  }
}

// Service d'authentification
export class AuthService {
  static async getCurrentUser() {
    const supabase = getSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user
  }

  static async signInAnonymously() {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    return data
  }

  static async signInWithEmail(email: string, password: string) {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: {
        emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/`,
      },
    })
    if (error) throw error
    return data
  }

  static async signUpWithEmail(email: string, password: string) {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/`,
      },
    })
    if (error) throw error
    return data
  }

  static async signOut() {
    const supabase = getSupabaseClient()
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }
}

export const supabase = getSupabaseClient()
