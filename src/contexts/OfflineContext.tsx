"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { IntegratedLotteryService } from "@/services/lotteryApiIntegrated"

interface OfflineContextType {
  isOnline: boolean
  lastSync: Date | null
  syncData: () => Promise<void>
  apiStatus: "connected" | "error" | "loading"
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined)

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof window !== "undefined") {
      return navigator.onLine
    }
    return true
  })
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [apiStatus, setApiStatus] = useState<"connected" | "error" | "loading">("loading")

  useEffect(() => {
    setIsOnline(navigator.onLine)

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  const syncData = async () => {
    console.log("[v0] Démarrage de syncData...")

    if (!isOnline) {
      console.warn("[v0] Tentative de sync hors ligne")
      throw new Error("Pas de connexion internet")
    }

    setApiStatus("loading")
    const syncStartTime = Date.now()
    let progressInterval: NodeJS.Timeout | null = null

    try {
      console.log("[v0] Appel de forceSyncWithExternalAPI...")

      progressInterval = setInterval(() => {
        const elapsed = Date.now() - syncStartTime
        console.log(`[v0] Synchronisation en cours... ${Math.floor(elapsed / 1000)}s écoulées`)
      }, 3000)

      const result = await IntegratedLotteryService.forceSyncWithExternalAPI()

      if (progressInterval) clearInterval(progressInterval)
      const syncDuration = Date.now() - syncStartTime

      if (result.success) {
        setLastSync(new Date())
        setApiStatus("connected")

        console.log(`[v0] ✅ Synchronisation réussie en ${syncDuration}ms:`)
        console.log(`[v0]    - ${result.stats.inserted} résultats en cache`)
        console.log(`[v0]    - Supabase: synchronisation en arrière-plan`)

        if (result.stats.inserted === 0 && result.stats.updated === 0) {
          console.log("[v0] ℹ️ Aucune nouvelle donnée, base à jour")
        }
      } else {
        console.warn("[v0] ⚠️ Synchronisation partielle - utilisation du cache")
        setApiStatus("connected")
        setLastSync(new Date())
      }
    } catch (error: any) {
      if (progressInterval) clearInterval(progressInterval)

      const syncDuration = Date.now() - syncStartTime
      console.error(`[v0] ❌ Erreur de synchronisation après ${syncDuration}ms:`, error)

      if (error.message?.includes("network") || error.message?.includes("fetch")) {
        console.error("[v0] Erreur réseau détectée")
        setApiStatus("error")
        setLastSync(new Date())
        console.log("[v0] 💾 Utilisation des données en cache")
      } else if (error.code === "AUTH_ERROR") {
        console.error("[v0] Erreur d'authentification")
        setApiStatus("error")
        throw new Error("Erreur d'authentification. Reconnectez-vous.")
      } else {
        console.error("[v0] Erreur inconnue:", error)
        setApiStatus("error")
        setLastSync(new Date())
        console.log("[v0] 💾 Utilisation des données en cache")
      }
    }
  }

  useEffect(() => {
    if (isOnline && !lastSync) {
      syncData().catch(() => {
        console.log("Première tentative de connexion échouée, utilisation des données locales/Supabase")
      })
    }
  }, [isOnline])

  return (
    <OfflineContext.Provider value={{ isOnline, lastSync, syncData, apiStatus }}>{children}</OfflineContext.Provider>
  )
}

export function useOffline() {
  const context = useContext(OfflineContext)
  if (context === undefined) {
    throw new Error("useOffline must be used within an OfflineProvider")
  }
  return context
}
