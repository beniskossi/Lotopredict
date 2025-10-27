"use client"
import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import type { DrawResult } from "@/services/lotteryApi"

interface AdminContextType {
  isAdminMode: boolean
  setAdminMode: (mode: boolean) => void
  adminPassword: string
  setAdminPassword: (password: string) => boolean
  isAuthenticated: boolean
  setAuthenticated: (auth: boolean) => void
  isLoading: boolean
  localData: DrawResult[]
  setLocalData: (data: DrawResult[]) => void
  addDrawResult: (result: DrawResult) => void
  updateDrawResult: (index: number, result: DrawResult) => void
  deleteDrawResult: (index: number) => void
  exportData: () => string
  importData: (jsonData: string) => boolean
  clearAllData: () => void
  auditLog: AuditLogEntry[]
  addAuditEntry: (entry: Omit<AuditLogEntry, "id" | "timestamp">) => void
  sessionTimeout: number
  lastActivity: Date | null
  resetSessionTimeout: () => void
  logout: () => void
}

interface AuditLogEntry {
  id: string
  timestamp: Date
  action: "CREATE" | "UPDATE" | "DELETE" | "IMPORT" | "EXPORT" | "CLEAR" | "LOGIN" | "LOGOUT"
  details: string
  user: string
}

const AdminContext = createContext<AdminContextType | undefined>(undefined)

const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "LotoBonheur2025!"
const STORAGE_KEY = "lotobonheur_admin_data"
const AUDIT_KEY = "lotobonheur_audit_log"
const AUTH_KEY = "lotobonheur_admin_auth"
const SESSION_TIMEOUT = 30 * 60 * 1000

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdminMode, setAdminMode] = useState(false)
  const [adminPassword, setAdminPasswordState] = useState("")
  const [isAuthenticated, setAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [localData, setLocalDataState] = useState<DrawResult[]>([])
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([])
  const [sessionTimeout] = useState(SESSION_TIMEOUT)
  const [lastActivity, setLastActivity] = useState<Date | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    console.log("[v0] AdminContext: Initializing...")

    // Load local data
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setLocalDataState(JSON.parse(stored))
      }
    } catch (error) {
      console.error("Failed to load local data:", error)
    }

    // Load audit log
    try {
      const stored = localStorage.getItem(AUDIT_KEY)
      if (stored) {
        setAuditLog(JSON.parse(stored))
      }
    } catch (error) {
      console.error("Failed to load audit log:", error)
    }

    try {
      const authData = localStorage.getItem(AUTH_KEY)
      console.log("[v0] AdminContext: Checking stored auth data:", authData ? "found" : "not found")

      if (authData) {
        const { authenticated, timestamp, password } = JSON.parse(authData)
        const now = Date.now()
        const elapsed = now - timestamp

        console.log("[v0] AdminContext: Auth data details:", {
          authenticated,
          elapsed,
          timeout: SESSION_TIMEOUT,
          isValid: authenticated && elapsed < SESSION_TIMEOUT,
        })

        if (authenticated && elapsed < SESSION_TIMEOUT) {
          console.log("[v0] AdminContext: Restoring session - setting authenticated to true")
          setAuthenticated(true)
          setAdminPasswordState(password || "")
          setLastActivity(new Date(timestamp))
          console.log("[v0] AdminContext: Session restored successfully")
        } else {
          console.log("[v0] AdminContext: Session expired or invalid, clearing")
          localStorage.removeItem(AUTH_KEY)
        }
      } else {
        console.log("[v0] AdminContext: No auth data found in localStorage")
      }
    } catch (error) {
      console.error("[v0] AdminContext: Failed to restore auth session:", error)
      localStorage.removeItem(AUTH_KEY)
    }

    console.log("[v0] AdminContext: Initialization complete, setting isLoading to false")
    setIsLoading(false)
  }, [])

  useEffect(() => {
    if (!isAuthenticated || !lastActivity) return

    const checkTimeout = setInterval(() => {
      const now = Date.now()
      const elapsed = now - lastActivity.getTime()

      if (elapsed >= SESSION_TIMEOUT) {
        logout()
      }
    }, 60000)

    return () => clearInterval(checkTimeout)
  }, [isAuthenticated, lastActivity])

  const setLocalData = (data: DrawResult[]) => {
    setLocalDataState(data)
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      } catch (error) {
        console.error("Failed to save local data:", error)
      }
    }
  }

  const addAuditEntry = (entry: Omit<AuditLogEntry, "id" | "timestamp">) => {
    const newEntry: AuditLogEntry = {
      ...entry,
      id: Date.now().toString(),
      timestamp: new Date(),
    }
    const updatedLog = [newEntry, ...auditLog].slice(0, 1000)
    setAuditLog(updatedLog)
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(AUDIT_KEY, JSON.stringify(updatedLog))
      } catch (error) {
        console.error("Failed to save audit log:", error)
      }
    }
  }

  const resetSessionTimeout = () => {
    const now = new Date()
    setLastActivity(now)

    if (typeof window !== "undefined") {
      try {
        const authData = localStorage.getItem(AUTH_KEY)
        if (authData) {
          const parsed = JSON.parse(authData)
          localStorage.setItem(
            AUTH_KEY,
            JSON.stringify({
              ...parsed,
              timestamp: now.getTime(),
            }),
          )
        }
      } catch (error) {
        console.error("Failed to update session timeout:", error)
      }
    }
  }

  const logout = () => {
    setAuthenticated(false)
    setAdminPasswordState("")
    setLastActivity(null)

    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(AUTH_KEY)
      } catch (error) {
        console.error("Failed to clear auth data:", error)
      }
    }

    addAuditEntry({
      action: "LOGOUT",
      details: "Déconnexion administrateur",
      user: "Admin",
    })
  }

  const authenticate = (password: string): boolean => {
    console.log("[v0] AdminContext: Authenticating with password...")

    if (password === ADMIN_PASSWORD) {
      console.log("[v0] AdminContext: Password correct - setting authenticated state")
      const now = Date.now()

      if (typeof window !== "undefined") {
        try {
          const authData = {
            authenticated: true,
            timestamp: now,
            password: password,
          }
          localStorage.setItem(AUTH_KEY, JSON.stringify(authData))
          console.log("[v0] AdminContext: Auth state saved to localStorage:", authData)
        } catch (error) {
          console.error("[v0] AdminContext: Failed to save auth data:", error)
          return false
        }
      }

      // Update state after localStorage is saved
      setAuthenticated(true)
      setAdminPasswordState(password)
      setLastActivity(new Date(now))

      addAuditEntry({
        action: "LOGIN",
        details: "Connexion administrateur réussie",
        user: "Admin",
      })

      console.log("[v0] AdminContext: Authentication complete, state updated")
      return true
    }

    console.log("[v0] AdminContext: Password incorrect")
    return false
  }

  const addDrawResult = (result: DrawResult) => {
    const updatedData = [result, ...localData]
    setLocalData(updatedData)
    addAuditEntry({
      action: "CREATE",
      details: `Ajouté tirage ${result.draw_name} du ${result.date}`,
      user: "Admin",
    })
    resetSessionTimeout()
  }

  const updateDrawResult = (index: number, result: DrawResult) => {
    const updatedData = [...localData]
    const oldResult = updatedData[index]
    updatedData[index] = result
    setLocalData(updatedData)
    addAuditEntry({
      action: "UPDATE",
      details: `Modifié tirage ${oldResult.draw_name} du ${oldResult.date}`,
      user: "Admin",
    })
    resetSessionTimeout()
  }

  const deleteDrawResult = (index: number) => {
    const result = localData[index]
    const updatedData = localData.filter((_, i) => i !== index)
    setLocalData(updatedData)
    addAuditEntry({
      action: "DELETE",
      details: `Supprimé tirage ${result.draw_name} du ${result.date}`,
      user: "Admin",
    })
    resetSessionTimeout()
  }

  const exportData = (): string => {
    const exportObj = {
      data: localData,
      exportDate: new Date().toISOString(),
      version: "1.0",
    }
    addAuditEntry({
      action: "EXPORT",
      details: `Export de ${localData.length} tirages`,
      user: "Admin",
    })
    resetSessionTimeout()
    return JSON.stringify(exportObj, null, 2)
  }

  const importData = (jsonData: string): boolean => {
    try {
      const parsed = JSON.parse(jsonData)
      let dataToImport: DrawResult[]

      if (Array.isArray(parsed)) {
        dataToImport = parsed
      } else if (parsed.data && Array.isArray(parsed.data)) {
        dataToImport = parsed.data
      } else {
        throw new Error("Format non reconnu")
      }

      const validData = dataToImport.filter(
        (item) =>
          item.draw_name &&
          item.date &&
          Array.isArray(item.gagnants) &&
          item.gagnants.length === 5 &&
          item.gagnants.every((num) => typeof num === "number" && num >= 1 && num <= 90),
      )

      if (validData.length === 0) {
        throw new Error("Aucune donnée valide trouvée")
      }

      const existingKeys = new Set(localData.map((r) => `${r.draw_name}_${r.date}`))
      const newData = validData.filter((r) => !existingKeys.has(`${r.draw_name}_${r.date}`))

      const mergedData = [...newData, ...localData].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      )

      setLocalData(mergedData)
      addAuditEntry({
        action: "IMPORT",
        details: `Import de ${newData.length} nouveaux tirages (${validData.length - newData.length} doublons ignorés)`,
        user: "Admin",
      })

      resetSessionTimeout()
      return true
    } catch (error) {
      console.error("Erreur import:", error)
      return false
    }
  }

  const clearAllData = () => {
    const count = localData.length
    setLocalData([])
    addAuditEntry({
      action: "CLEAR",
      details: `Suppression de toutes les données (${count} tirages)`,
      user: "Admin",
    })
    resetSessionTimeout()
  }

  const setAdminPassword = (password: string): boolean => {
    console.log("[v0] AdminContext: setAdminPassword called")
    setAdminPasswordState(password)
    const result = authenticate(password)
    console.log("[v0] AdminContext: Authentication result:", result)
    return result
  }

  const value: AdminContextType = {
    isAdminMode,
    setAdminMode,
    adminPassword,
    setAdminPassword,
    isAuthenticated,
    setAuthenticated,
    isLoading,
    localData,
    setLocalData,
    addDrawResult,
    updateDrawResult,
    deleteDrawResult,
    exportData,
    importData,
    clearAllData,
    auditLog,
    addAuditEntry,
    sessionTimeout,
    lastActivity,
    resetSessionTimeout,
    logout,
  }

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

export function useAdmin() {
  const context = useContext(AdminContext)
  if (context === undefined) {
    throw new Error("useAdmin must be used within an AdminProvider")
  }
  return context
}
