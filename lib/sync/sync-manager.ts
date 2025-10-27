"use client"

import { createClient } from "@/lib/supabase/client"
import { indexedDB } from "@/lib/db/indexeddb"
import type { DrawResult } from "@/lib/types"

export class SyncManager {
  private supabase = createClient()
  private syncInProgress = false

  private isClient(): boolean {
    return typeof window !== "undefined"
  }

  // Sync from Supabase to IndexedDB
  async syncFromCloud(): Promise<void> {
    if (!this.isClient() || this.syncInProgress) return

    try {
      this.syncInProgress = true
      console.log("[v0] Starting sync from cloud to local...")

      const lastSync = this.isClient() ? localStorage.getItem("lastSyncTimestamp") : null

      let query = this.supabase.from("draw_results").select("*").order("updated_at", { ascending: false })

      if (lastSync) {
        query = query.gt("updated_at", lastSync)
      }

      const { data, error } = await query

      if (error) throw error

      if (data && data.length > 0) {
        console.log(`[v0] Syncing ${data.length} results from cloud...`)
        await indexedDB.addResults(data as DrawResult[])
        if (this.isClient()) {
          localStorage.setItem("lastSyncTimestamp", new Date().toISOString())
        }
      } else {
        console.log("[v0] No new data to sync from cloud")
      }

      console.log("[v0] Sync from cloud completed")
    } catch (error) {
      console.error("[v0] Error syncing from cloud:", error)
      throw error
    } finally {
      this.syncInProgress = false
    }
  }

  // Sync from IndexedDB to Supabase (pending changes)
  async syncToCloud(): Promise<void> {
    if (!this.isClient() || this.syncInProgress) return

    try {
      this.syncInProgress = true
      console.log("[v0] Starting sync from local to cloud...")

      const pendingItems = await indexedDB.getPendingSyncItems()

      if (pendingItems.length === 0) {
        console.log("[v0] No pending items to sync")
        return
      }

      console.log(`[v0] Syncing ${pendingItems.length} pending items...`)

      for (const item of pendingItems) {
        try {
          switch (item.operation) {
            case "create":
            case "update":
              const { error: upsertError } = await this.supabase.from("draw_results").upsert(item.data)

              if (upsertError) throw upsertError
              break

            case "delete":
              const { error: deleteError } = await this.supabase.from("draw_results").delete().eq("id", item.data.id)

              if (deleteError) throw deleteError
              break
          }

          await indexedDB.markSyncItemComplete(item.id)
          console.log(`[v0] Successfully synced item ${item.id}`)
        } catch (error) {
          console.error(`[v0] Error syncing item ${item.id}:`, error)
          // Continue with other items even if one fails
        }
      }

      console.log("[v0] Sync to cloud completed")
    } catch (error) {
      console.error("[v0] Error syncing to cloud:", error)
      throw error
    } finally {
      this.syncInProgress = false
    }
  }

  // Bidirectional sync
  async bidirectionalSync(): Promise<void> {
    if (!this.isClient()) {
      console.warn("[v0] Sync not available (server-side context)")
      return
    }

    console.log("[v0] Starting bidirectional sync...")

    // First sync pending local changes to cloud
    await this.syncToCloud()

    // Then sync new cloud data to local
    await this.syncFromCloud()

    console.log("[v0] Bidirectional sync completed")
  }
}

export const syncManager = new SyncManager()
