import { updateSession } from "@/lib/supabase/middleware"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

export async function middleware(request: NextRequest) {
  // Check if Supabase is configured
  const hasSupabaseConfig = 
    process.env.NEXT_PUBLIC_SUPABASE_URL && 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://placeholder.supabase.co"

  // If Supabase is not configured, allow all requests
  // This enables local admin authentication to work
  if (!hasSupabaseConfig) {
    console.log("[Middleware] Supabase non configuré, autorisation de toutes les requêtes")
    return NextResponse.next()
  }

  // If Supabase is configured, use session-based protection
  try {
    return await updateSession(request)
  } catch (error) {
    console.error("[Middleware] Erreur lors de la mise à jour de session:", error)
    // On error, allow the request to proceed
    // The page-level authentication will handle access control
    return NextResponse.next()
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
