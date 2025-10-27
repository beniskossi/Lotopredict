"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { UserPreferencesService } from "@/services/supabaseClient"
import type { User } from "@supabase/supabase-js"
import type { UserPreferences } from "@/config/supabase"

interface SupabaseContextType {
  user: User | null
  loading: boolean
  preferences: UserPreferences | null
  isAuthenticated: boolean
  isConfigured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signInAnonymously: () => Promise<void>
  signOut: () => Promise<void>
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>
  connectionStatus: "connected" | "connecting" | "error" | "offline" | "not_configured"
  error: string | null
  clearError: () => void
}

const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined)

const SESSION_STORAGE_KEY = "supabase_session_backup"

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [preferences, setPreferences] = useState<UserPreferences | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "connecting" | "error" | "offline" | "not_configured"
  >("connecting")
  const [error, setError] = useState<string | null>(null)
  const [isConfigured] = useState(isSupabaseConfigured())

  useEffect(() => {
    // If Supabase is not configured, skip initialization
    if (!isConfigured) {
      console.log("[SupabaseContext] Supabase non configuré, mode local uniquement")
      setConnectionStatus("not_configured")
      setLoading(false)
      return
    }

    const supabase = createClient()

    const initializeAuth = async () => {
      try {
        setConnectionStatus("connecting")
        setError(null)

        // Try to restore session from sessionStorage
        const storedSession = typeof window !== "undefined" ? sessionStorage.getItem(SESSION_STORAGE_KEY) : null
        if (storedSession) {
          try {
            const session = JSON.parse(storedSession)
            setUser(session.user)
            if (session.user) {
              await loadUserPreferences(session.user.id)
            }
          } catch (e) {
            console.error("[SupabaseContext] Échec restauration session:", e)
            sessionStorage.removeItem(SESSION_STORAGE_KEY)
          }
        }

        // Get current session from Supabase
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) {
          console.error("[SupabaseContext] Erreur session:", sessionError)
          setError(`Erreur de session: ${sessionError.message}`)
          setConnectionStatus("error")
        } else {
          setUser(session?.user || null)

          if (session && typeof window !== "undefined") {
            sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
          }

          if (session?.user) {
            await loadUserPreferences(session.user.id)
          }

          setConnectionStatus(session ? "connected" : "offline")
        }
      } catch (error) {
        console.error("[SupabaseContext] Erreur initialisation auth:", error)
        const errorMessage = error instanceof Error ? error.message : "Erreur d'initialisation"
        setError(errorMessage)
        setConnectionStatus("error")
      } finally {
        setLoading(false)
      }
    }

    initializeAuth()

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("[SupabaseContext] Changement état auth:", event, session?.user?.id)

      setUser(session?.user || null)

      if (session && typeof window !== "undefined") {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
      } else if (typeof window !== "undefined") {
        sessionStorage.removeItem(SESSION_STORAGE_KEY)
      }

      if (session?.user) {
        await loadUserPreferences(session.user.id)
        setConnectionStatus("connected")
      } else {
        setPreferences(null)
        setConnectionStatus("offline")
      }

      if (event === "SIGNED_OUT") {
        setPreferences(null)
        if (typeof window !== "undefined") {
          sessionStorage.removeItem(SESSION_STORAGE_KEY)
        }
      }

      if (event === "TOKEN_REFRESHED") {
        console.log("[SupabaseContext] Token rafraîchi avec succès")
      }

      if (event === "SIGNED_IN") {
        setError(null)
      }

      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [isConfigured])

  const loadUserPreferences = async (userId: string) => {
    try {
      const prefs = await UserPreferencesService.getPreferences(userId)
      setPreferences(prefs)
    } catch (error) {
      console.error("[SupabaseContext] Erreur chargement préférences:", error)
      // Don't set error state for preferences, it's not critical
    }
  }

  const signIn = async (email: string, password: string) => {
    if (!isConfigured) {
      throw new Error("Supabase n'est pas configuré. Utilisez l'authentification locale.")
    }

    try {
      setLoading(true)
      setError(null)
      const supabase = createClient()

      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })

      if (signInError) {
        let errorMessage = signInError.message
        
        if (signInError.message.includes("Invalid login credentials")) {
          errorMessage = "Email ou mot de passe incorrect"
        } else if (signInError.message.includes("Email not confirmed")) {
          errorMessage = "Veuillez confirmer votre email avant de vous connecter"
        } else if (signInError.message.includes("Email link is invalid")) {
          errorMessage = "Le lien de confirmation a expiré"
        } else if (signInError.message.includes("User not found")) {
          errorMessage = "Aucun compte trouvé avec cet email"
        }
        
        throw new Error(errorMessage)
      }

      console.log("[SupabaseContext] Connexion réussie:", data.user?.id)
      setConnectionStatus("connected")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur de connexion"
      setError(errorMessage)
      console.error("[SupabaseContext] Erreur connexion:", error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const signUp = async (email: string, password: string) => {
    if (!isConfigured) {
      throw new Error("Supabase n'est pas configuré. Utilisez l'authentification locale.")
    }

    try {
      setLoading(true)
      setError(null)
      const supabase = createClient()

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/admin`,
        },
      })

      if (signUpError) {
        let errorMessage = signUpError.message
        
        if (signUpError.message.includes("already registered")) {
          errorMessage = "Cet email est déjà enregistré"
        } else if (signUpError.message.includes("Password should be")) {
          errorMessage = "Le mot de passe doit contenir au moins 6 caractères"
        }
        
        throw new Error(errorMessage)
      }

      console.log("[SupabaseContext] Inscription réussie:", data.user?.id)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur d'inscription"
      setError(errorMessage)
      console.error("[SupabaseContext] Erreur inscription:", error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const signInAnonymously = async () => {
    if (!isConfigured) {
      throw new Error("Supabase n'est pas configuré")
    }

    try {
      setLoading(true)
      setError(null)
      const supabase = createClient()
      const { error: anonError } = await supabase.auth.signInAnonymously()

      if (anonError) {
        throw new Error(anonError.message)
      }

      console.log("[SupabaseContext] Connexion anonyme réussie")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur de connexion anonyme"
      setError(errorMessage)
      console.error("[SupabaseContext] Erreur connexion anonyme:", error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    if (!isConfigured) {
      return
    }

    try {
      setLoading(true)
      setError(null)
      const supabase = createClient()
      const { error: signOutError } = await supabase.auth.signOut()

      if (signOutError) {
        throw new Error(signOutError.message)
      }

      if (typeof window !== "undefined") {
        sessionStorage.removeItem(SESSION_STORAGE_KEY)
      }

      setUser(null)
      setPreferences(null)
      setConnectionStatus("offline")

      console.log("[SupabaseContext] Déconnexion réussie")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur de déconnexion"
      setError(errorMessage)
      console.error("[SupabaseContext] Erreur déconnexion:", error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const updatePreferences = async (prefs: Partial<UserPreferences>) => {
    if (!user) {
      setError("Vous devez être connecté pour mettre à jour les préférences")
      return
    }

    try {
      setError(null)
      const updatedPrefs = await UserPreferencesService.savePreferences({
        user_id: user.id,
        theme: "system",
        notifications_enabled: true,
        favorite_draws: [],
        alert_settings: {},
        ...preferences,
        ...prefs,
      })

      setPreferences(updatedPrefs)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur de mise à jour des préférences"
      setError(errorMessage)
      console.error("[SupabaseContext] Erreur mise à jour préférences:", error)
      throw error
    }
  }

  const clearError = () => {
    setError(null)
  }

  const value: SupabaseContextType = {
    user,
    loading,
    preferences,
    isAuthenticated: !!user,
    isConfigured,
    signIn,
    signUp,
    signInAnonymously,
    signOut,
    updatePreferences,
    connectionStatus,
    error,
    clearError,
  }

  return <SupabaseContext.Provider value={value}>{children}</SupabaseContext.Provider>
}

export function useSupabase() {
  const context = useContext(SupabaseContext)
  if (context === undefined) {
    throw new Error("useSupabase must be used within a SupabaseProvider")
  }
  return context
}
