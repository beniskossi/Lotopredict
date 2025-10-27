import { createClient as createSupabaseClient } from "@supabase/supabase-js"

let clientInstance: ReturnType<typeof createSupabaseClient> | null = null

export function createClient() {
  // Return cached instance if available
  if (clientInstance) {
    return clientInstance
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("[Supabase Client] ⚠️ Variables d'environnement Supabase non configurées")
    console.warn("[Supabase Client] L'authentification locale reste disponible")
    console.warn("[Supabase Client] Pour activer Supabase, configurez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY")

    // Return a placeholder client that will fail gracefully
    // This allows the app to work with local authentication only
    if (typeof window === "undefined") {
      // Server-side: return placeholder for build
      return createSupabaseClient("https://placeholder.supabase.co", "placeholder-anon-key")
    }
    
    // Client-side: return placeholder that logs warnings
    clientInstance = createSupabaseClient("https://placeholder.supabase.co", "placeholder-anon-key")
    return clientInstance
  }

  // Validate URL format
  try {
    new URL(supabaseUrl)
  } catch (error) {
    console.error("[Supabase Client] ❌ URL Supabase invalide:", supabaseUrl)
    throw new Error("URL Supabase invalide. Vérifiez votre configuration.")
  }

  console.log("[Supabase Client] ✅ Initialisation avec:", supabaseUrl)

  clientInstance = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
    },
  })

  return clientInstance
}

// Helper to check if Supabase is properly configured
export function isSupabaseConfigured(): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  return !!(
    supabaseUrl && 
    supabaseAnonKey && 
    supabaseUrl !== "https://placeholder.supabase.co" &&
    supabaseAnonKey !== "placeholder-anon-key"
  )
}
