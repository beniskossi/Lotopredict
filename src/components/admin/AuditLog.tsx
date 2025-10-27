"use client"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useAdmin } from "@/contexts/AdminContext"
import { Activity, Search, Download } from "lucide-react"
import { format } from "date-fns"
import { fr } from "date-fns/locale"

export function AuditLog() {
  const { auditLog } = useAdmin()
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedAction, setSelectedAction] = useState<string>("all")

  const logsPerPage = 20

  const filteredLogs = auditLog.filter((entry) => {
    const matchesSearch =
      searchTerm === "" ||
      entry.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.action.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesAction = selectedAction === "all" || entry.action === selectedAction

    return matchesSearch && matchesAction
  })

  const totalPages = Math.ceil(filteredLogs.length / logsPerPage)
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * logsPerPage, currentPage * logsPerPage)

  const getActionColor = (action: string) => {
    switch (action) {
      case "CREATE":
        return "bg-green-100 text-green-800 border-green-200"
      case "UPDATE":
        return "bg-blue-100 text-blue-800 border-blue-200"
      case "DELETE":
        return "bg-red-100 text-red-800 border-red-200"
      case "IMPORT":
        return "bg-purple-100 text-purple-800 border-purple-200"
      case "EXPORT":
        return "bg-orange-100 text-orange-800 border-orange-200"
      case "CLEAR":
        return "bg-gray-100 text-gray-800 border-gray-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  const getActionIcon = (action: string) => {
    switch (action) {
      case "CREATE":
        return "➕"
      case "UPDATE":
        return "✏️"
      case "DELETE":
        return "🗑️"
      case "IMPORT":
        return "📥"
      case "EXPORT":
        return "📤"
      case "CLEAR":
        return "🧹"
      default:
        return "📄"
    }
  }

  const exportAuditLog = () => {
    const csvContent = [
      ["Date", "Action", "Détails", "Utilisateur"].join(","),
      ...auditLog.map((entry) =>
        [
          format(entry.timestamp, "yyyy-MM-dd HH:mm:ss"),
          entry.action,
          `"${entry.details.replace(/"/g, '""')}"`,
          entry.user,
        ].join(","),
      ),
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `audit_log_${new Date().toISOString().split("T")[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="h-5 w-5" />
                <span>Journal d'Audit</span>
              </CardTitle>
              <p className="text-muted-foreground mt-1">{auditLog.length} entrée(s) d'audit enregistrée(s)</p>
            </div>
            <Button variant="outline" onClick={exportAuditLog} disabled={auditLog.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Exporter CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Filtres */}
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher dans le journal..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="pl-10"
                />
              </div>
              <select
                value={selectedAction}
                onChange={(e) => {
                  setSelectedAction(e.target.value)
                  setCurrentPage(1)
                }}
                className="px-3 py-2 border rounded-md"
              >
                <option value="all">Toutes les actions</option>
                <option value="CREATE">Créations</option>
                <option value="UPDATE">Modifications</option>
                <option value="DELETE">Suppressions</option>
                <option value="IMPORT">Imports</option>
                <option value="EXPORT">Exports</option>
                <option value="CLEAR">Effacements</option>
              </select>
            </div>

            {/* Statistiques */}
            <div className="grid grid-cols-6 gap-4">
              {["CREATE", "UPDATE", "DELETE", "IMPORT", "EXPORT", "CLEAR"].map((action) => {
                const count = auditLog.filter((entry) => entry.action === action).length
                return (
                  <Card key={action}>
                    <CardContent className="p-3 text-center">
                      <div className="text-lg font-bold">{count}</div>
                      <div className="text-xs text-muted-foreground">
                        {getActionIcon(action)} {action}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Entrées du journal */}
            <div className="space-y-2">
              {paginatedLogs.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="font-medium mb-2">Aucune entrée trouvée</h3>
                    <p className="text-muted-foreground">
                      {searchTerm || selectedAction !== "all"
                        ? "Aucune entrée ne correspond aux filtres sélectionnés"
                        : "Le journal d'audit est vide"}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                paginatedLogs.map((entry) => (
                  <Card key={entry.id} className="hover:bg-muted/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center space-x-2">
                            <Badge className={getActionColor(entry.action)}>
                              {getActionIcon(entry.action)} {entry.action}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {format(entry.timestamp, "EEEE d MMMM yyyy à HH:mm:ss", { locale: fr })}
                            </span>
                          </div>
                          <p className="text-sm">{entry.details}</p>
                          <p className="text-xs text-muted-foreground">Utilisateur: {entry.user}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center space-x-2 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Précédent
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} sur {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Suivant
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
