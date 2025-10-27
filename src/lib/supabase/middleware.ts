import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If Supabase is not configured, allow all requests
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === "https://placeholder.supabase.co") {
    return supabaseResponse
  }

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    })

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error && error.message !== "Auth session missing!") {
      console.error("[Middleware] Erreur auth:", error.message)
    }

    // Only protect admin routes if user is not authenticated via Supabase
    // Note: Local admin authentication is handled at the page level
    if (request.nextUrl.pathname.startsWith("/admin") && !user) {
      // Check if this is an API route or a page request
      const isApiRoute = request.nextUrl.pathname.startsWith("/api")

      if (!isApiRoute) {
        // For page requests, redirect to auth page
        // The auth page will show both Supabase and local admin options
        const url = request.nextUrl.clone()
        url.pathname = "/auth"
        url.searchParams.set("redirect", request.nextUrl.pathname)
        return NextResponse.redirect(url)
      }
    }

    return supabaseResponse
  } catch (error) {
    console.error("[Middleware] Erreur inattendue:", error)
    return supabaseResponse
  }
}
