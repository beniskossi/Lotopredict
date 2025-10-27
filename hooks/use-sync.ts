"use client"

import { useEffect, useState, useCallback } from "react"
import { syncManager } from "@/lib/sync/sync-manager"
import { indexedDB } from "@/lib/db/indexeddb"
import { subscribeToDrawResults } from "@/lib/api/fetch-results"
import type { DrawResult } from "@/lib/types"

export function useSync() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)

    if (typeof window === "undefined") return

    indexedDB.init().catch(console.error)

    const lastSync = localStorage.getItem("lastSyncTimestamp")
    setLastSyncTime(lastSync)

    const { unsubscribe } = subscribeToDrawResults(async (payload) => {
      console.log("[v0] Real-time update received:", payload)

      if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
        await indexedDB.addResult(payload.new as DrawResult)
      } else if (payload.eventType === "DELETE") {
        await indexedDB.deleteResult(payload.old.id)
      }
    })

    performSync()

    return () => {
      unsubscribe()
    }
  }, [])

  const performSync = useCallback(async () => {
    if (typeof window === "undefined" || isSyncing) return

    setIsSyncing(true)
    setError(null)

    try {
      await syncManager.bidirectionalSync()
      const now = new Date().toISOString()
      setLastSyncTime(now)
      localStorage.setItem("lastSyncTimestamp", now)
    } catch (err: any) {
      setError(err.message || "Sync failed")
      console.error("[v0] Sync error:", err)
    } finally {
      setIsSyncing(false)
    }
  }, [isSyncing])

  return {
    isSyncing,
    lastSyncTime,
    error,
    performSync,
    isClient,
  }
}

export function useDrawResults(drawName?: string) {
  const [results, setResults] = useState<DrawResult[]>([])
  const [loading, setLoading] = useState(true)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)

    if (typeof window === "undefined") return

    loadResults()

    const { unsubscribe } = subscribeToDrawResults(async (payload) => {
      if (drawName && payload.new?.draw_name === drawName) {
        await loadResults()
      } else if (!drawName) {
        await loadResults()
      }
    })

    return () => {
      unsubscribe()
    }
  }, [drawName])

  const loadResults = async () => {
    if (typeof window === "undefined") return

    setLoading(true)
    try {
      await indexedDB.init()
      const data = drawName ? await indexedDB.getResultsByDraw(drawName) : await indexedDB.getAllResults()

      setResults(data.sort((a, b) => new Date(b.draw_date).getTime() - new Date(a.draw_date).getTime()))
    } catch (error) {
      console.error("[v0] Error loading results:", error)
    } finally {
      setLoading(false)
    }
  }

  const refresh = () => {
    loadResults()
  }

  return { results, loading, refresh, isClient }
}
