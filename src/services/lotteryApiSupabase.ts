import { syncLotteryResultsToSupabase } from "@/app/actions/sync-lottery-results"
import { LotteryResultsService, AuditService, AuthService } from "@/services/supabaseClient"
import type { DrawResult } from "@/services/lotteryApi"
import type { LotteryResult } from "@/config/supabase"

/**
 * Configuration for retry logic
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
}

/**
 * Custom error types for better error handling
 */
class SyncError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable = true,
  ) {
    super(message)
    this.name = "SyncError"
  }
}

/**
 * Utility function to implement exponential backoff retry logic
 * @param fn - The async function to retry
 * @param retries - Number of retries remaining
 * @param delay - Current delay in milliseconds
 * @returns Promise with the result of the function
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = RETRY_CONFIG.maxRetries,
  delay: number = RETRY_CONFIG.initialDelayMs,
): Promise<T> {
  try {
    return await fn()
  } catch (error: any) {
    // Don't retry if no retries left or error is not retryable
    if (retries <= 0 || (error instanceof SyncError && !error.retryable)) {
      throw error
    }

    console.log(`⚠️ Tentative échouée, nouvelle tentative dans ${delay}ms... (${retries} restantes)`)

    // Wait before retrying
    await new Promise((resolve) => setTimeout(resolve, delay))

    // Retry with exponential backoff
    const nextDelay = Math.min(delay * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs)
    return retryWithBackoff(fn, retries - 1, nextDelay)
  }
}

// Adaptateur pour convertir entre les formats API et Supabase
class SupabaseLotteryAdapter {
  // Convertir DrawResult vers LotteryResult
  static toSupabaseFormat(drawResult: DrawResult): Omit<LotteryResult, "id" | "created_at" | "updated_at"> {
    return {
      draw_name: drawResult.draw_name,
      date: drawResult.date,
      winning_numbers: drawResult.gagnants,
      machine_numbers: drawResult.machine || undefined,
    }
  }

  // Convertir LotteryResult vers DrawResult
  static toApiFormat(lotteryResult: LotteryResult): DrawResult {
    return {
      draw_name: lotteryResult.draw_name,
      date: lotteryResult.date,
      gagnants: lotteryResult.winning_numbers,
      machine: lotteryResult.machine_numbers || undefined,
    }
  }
}

// Version Supabase de l'API de loterie
export async function fetchLotteryResultsFromSupabase(): Promise<DrawResult[]> {
  try {
    console.log("📊 Récupération des données depuis Supabase...")

    const supabaseResults = await LotteryResultsService.getAllResults()

    // Convertir au format attendu par l'application
    const results = supabaseResults.map((result) => SupabaseLotteryAdapter.toApiFormat(result))

    console.log(`✅ ${results.length} résultats récupérés depuis Supabase`)

    // Logger l'activité
    const user = await AuthService.getCurrentUser()
    if (user) {
      await AuditService.addLog({
        user_id: user.id,
        action: "FETCH_RESULTS",
        table_name: "lottery_results",
        new_data: { results_count: results.length },
      })
    }

    return results
  } catch (error) {
    console.error("❌ Erreur lors de la récupération depuis Supabase:", error)
    throw new Error("Impossible de récupérer les données depuis Supabase")
  }
}

/**
 * Synchronize lottery results from external API to Supabase database
 *
 * This function handles the complete synchronization process with:
 * - Server-side sync using service role key (bypasses RLS)
 * - Batch operations for optimal performance
 * - Automatic retry logic with exponential backoff
 * - Detailed error logging and categorization
 * - Graceful degradation on partial failures
 * - Audit logging for tracking sync operations
 *
 * @param apiResults - Array of lottery results from external API
 * @returns Object containing success status and sync statistics
 * @throws SyncError if synchronization fails after all retries
 */
export async function syncExternalApiToSupabase(
  apiResults: DrawResult[],
): Promise<{ success: boolean; stats: { inserted: number; updated: number; failed: number } }> {
  console.log(`🔄 Démarrage de la synchronisation de ${apiResults.length} résultats vers Supabase...`)

  // Step 1: Validate input data
  if (!Array.isArray(apiResults) || apiResults.length === 0) {
    console.warn("⚠️ Aucune donnée à synchroniser")
    return { success: true, stats: { inserted: 0, updated: 0, failed: 0 } }
  }

  // Step 2: Validate each result has required fields
  const validResults = apiResults.filter((result) => {
    const isValid = result.draw_name && result.date && Array.isArray(result.gagnants) && result.gagnants.length === 5
    if (!isValid) {
      console.warn(`⚠️ Résultat invalide ignoré:`, result)
    }
    return isValid
  })

  if (validResults.length === 0) {
    throw new SyncError("Aucun résultat valide à synchroniser", "INVALID_DATA", false)
  }

  console.log(`✓ ${validResults.length}/${apiResults.length} résultats validés`)

  // Step 3: Prepare data for Server Action (no conversion needed, Server Action handles it)
  const resultsForSync = validResults.map((result) => ({
    draw_name: result.draw_name,
    date: result.date,
    winning_numbers: result.gagnants,
    machine_numbers: result.machine || [],
  }))

  // Step 4: Call Server Action with retry logic
  let stats = { inserted: 0, updated: 0, failed: 0 }

  try {
    stats = await retryWithBackoff(
      async () => {
        try {
          console.log(`📤 Appel du Server Action pour synchronisation...`)
          const result = await syncLotteryResultsToSupabase(resultsForSync)

          if (!result.success) {
            throw new SyncError(result.error || "Sync failed", "SYNC_ERROR", true)
          }

          const inserted = result.inserted
          const failed = resultsForSync.length - inserted

          console.log(`✓ Synchronisation terminée: ${inserted} insérés, ${failed} échecs`)

          return {
            inserted,
            updated: 0, // Server Action uses upsert, so we count all as inserted
            failed,
          }
        } catch (error: any) {
          // Categorize errors for better handling
          if (error.code === "PGRST301" || error.message?.includes("JWT")) {
            throw new SyncError("Erreur d'authentification Supabase", "AUTH_ERROR", false)
          } else if (error.message?.includes("network") || error.message?.includes("fetch")) {
            throw new SyncError("Erreur réseau lors de la synchronisation", "NETWORK_ERROR", true)
          } else {
            console.warn(`⚠️ Erreur partielle de synchronisation: ${error.message}`)
            throw error // Re-throw to trigger retry
          }
        }
      },
      1,
      500,
    )

    console.log(`✅ Synchronisation terminée:`)
    console.log(`   - ${stats.inserted} résultats traités`)
    console.log(`   - ${stats.updated} résultats mis à jour`)
    if (stats.failed > 0) {
      console.log(`   - ${stats.failed} résultats échoués`)
    }

    // Step 5: Log audit trail
    try {
      const user = await AuthService.getCurrentUser()
      if (user) {
        await AuditService.addLog({
          user_id: user.id,
          action: "SYNC_API",
          table_name: "lottery_results",
          new_data: {
            api_results_count: apiResults.length,
            valid_results: validResults.length,
            inserted: stats.inserted,
            updated: stats.updated,
            failed: stats.failed,
          },
        })
      }
    } catch (auditError) {
      console.warn("⚠️ Échec du logging d'audit (non critique):", auditError)
    }

    return { success: true, stats }
  } catch (error: any) {
    console.error("❌ Échec définitif de la synchronisation après toutes les tentatives:", error)

    try {
      const user = await AuthService.getCurrentUser()
      if (user) {
        await AuditService.addLog({
          user_id: user.id,
          action: "SYNC_FAILED",
          table_name: "lottery_results",
          new_data: {
            error: error.message,
            code: error.code,
            attempted_count: apiResults.length,
          },
        })
      }
    } catch (auditError) {
      console.warn("⚠️ Impossible de logger l'échec:", auditError)
    }

    throw error
  }
}

// Version hybride qui essaie Supabase en premier, puis l'API externe
export async function fetchLotteryResultsHybrid(): Promise<DrawResult[]> {
  try {
    // Essayer d'abord Supabase
    const supabaseResults = await fetchLotteryResultsFromSupabase()

    if (supabaseResults.length > 0) {
      console.log("📊 Utilisation des données Supabase")
      return supabaseResults
    } else {
      console.log("📊 Aucune donnée Supabase, récupération depuis l'API externe...")

      // Importer la fonction originale
      const { fetchLotteryResults } = await import("@/services/lotteryApi")
      const apiResults = await fetchLotteryResults()

      // Synchroniser vers Supabase pour la prochaine fois
      await syncExternalApiToSupabase(apiResults)

      return apiResults
    }
  } catch (error) {
    console.error("❌ Erreur dans fetchLotteryResultsHybrid:", error)

    // Fallback vers l'API externe
    try {
      const { fetchLotteryResults } = await import("@/services/lotteryApi")
      return await fetchLotteryResults()
    } catch (fallbackError) {
      console.error("❌ Erreur fallback API externe:", fallbackError)
      throw new Error("Impossible de récupérer les données de loterie")
    }
  }
}

export { SupabaseLotteryAdapter }
