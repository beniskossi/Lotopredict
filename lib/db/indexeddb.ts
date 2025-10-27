import type { DrawResult } from "@/lib/types"

const DB_NAME = "LoteriePWA"
const DB_VERSION = 1
const STORE_NAME = "draw_results"
const SYNC_STORE = "sync_queue"

export class IndexedDBManager {
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null

  private isClient(): boolean {
    return typeof window !== "undefined" && typeof window.indexedDB !== "undefined"
  }

  async init(): Promise<void> {
    if (!this.isClient()) {
      console.warn("[v0] IndexedDB not available (server-side context)")
      return Promise.resolve()
    }

    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Store for draw results
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" })
          store.createIndex("draw_name", "draw_name", { unique: false })
          store.createIndex("draw_date", "draw_date", { unique: false })
          store.createIndex("updated_at", "updated_at", { unique: false })
        }

        // Store for sync queue (offline changes)
        if (!db.objectStoreNames.contains(SYNC_STORE)) {
          const syncStore = db.createObjectStore(SYNC_STORE, { keyPath: "id", autoIncrement: true })
          syncStore.createIndex("timestamp", "timestamp", { unique: false })
          syncStore.createIndex("synced", "synced", { unique: false })
        }
      }
    })

    return this.initPromise
  }

  async getAllResults(): Promise<DrawResult[]> {
    if (!this.isClient() || !this.db) {
      if (this.isClient()) await this.init()
      if (!this.db) return []
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly")
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async getResultsByDraw(drawName: string): Promise<DrawResult[]> {
    if (!this.isClient() || !this.db) {
      if (this.isClient()) await this.init()
      if (!this.db) return []
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly")
      const store = transaction.objectStore(STORE_NAME)
      const index = store.index("draw_name")
      const request = index.getAll(drawName)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async addResult(result: DrawResult): Promise<void> {
    if (!this.isClient() || !this.db) {
      if (this.isClient()) await this.init()
      if (!this.db) return
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite")
      const store = transaction.objectStore(STORE_NAME)
      const request = store.put(result)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async addResults(results: DrawResult[]): Promise<void> {
    if (!this.isClient() || !this.db) {
      if (this.isClient()) await this.init()
      if (!this.db) return
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite")
      const store = transaction.objectStore(STORE_NAME)

      results.forEach((result) => store.put(result))

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }

  async deleteResult(id: string): Promise<void> {
    if (!this.isClient() || !this.db) {
      if (this.isClient()) await this.init()
      if (!this.db) return
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite")
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(id)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async clearAll(): Promise<void> {
    if (!this.isClient() || !this.db) {
      if (this.isClient()) await this.init()
      if (!this.db) return
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite")
      const store = transaction.objectStore(STORE_NAME)
      const request = store.clear()

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // Sync queue management
  async addToSyncQueue(operation: "create" | "update" | "delete", data: any): Promise<void> {
    if (!this.isClient() || !this.db) {
      if (this.isClient()) await this.init()
      if (!this.db) return
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([SYNC_STORE], "readwrite")
      const store = transaction.objectStore(SYNC_STORE)
      const request = store.add({
        operation,
        data,
        timestamp: new Date().toISOString(),
        synced: 0, // Use 0 instead of false for IndexedDB compatibility
      })

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getPendingSyncItems(): Promise<any[]> {
    if (!this.isClient() || !this.db) {
      if (this.isClient()) await this.init()
      if (!this.db) return []
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([SYNC_STORE], "readonly")
      const store = transaction.objectStore(SYNC_STORE)
      const index = store.index("synced")
      const request = index.getAll(0) // Use 0 instead of false

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async markSyncItemComplete(id: number): Promise<void> {
    if (!this.isClient() || !this.db) {
      if (this.isClient()) await this.init()
      if (!this.db) return
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([SYNC_STORE], "readwrite")
      const store = transaction.objectStore(SYNC_STORE)
      const request = store.delete(id)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
}

export const indexedDB = new IndexedDBManager()
