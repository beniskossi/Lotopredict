import { createClient } from "@supabase/supabase-js"

/**
 * Create an admin Supabase client with service role key
 * This client bypasses Row Level Security (RLS) and should only be used for:
 * - Background sync operations
 * - System-level data operations
 * - Admin operations that require elevated privileges
 *
 * ⚠️ WARNING: Never expose this client to the browser/client-side code
 * Only use in server-side code (API routes, server actions, background jobs)
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[Supabase Admin] ❌ Missing environment variables!")
    console.error("[Supabase Admin] Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    throw new Error("Supabase admin client requires service role key")
  }

  console.log("[Supabase Admin] ✅ Creating admin client with service role")

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Check if admin client can be created
 */
export function isAdminClientAvailable(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}
