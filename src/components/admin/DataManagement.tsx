"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAdmin } from "@/contexts/AdminContext"
import { NumberBall } from "@/components/ui/NumberBall"
import { DrawResultModal } from "@/components/admin/DrawResultModal"
import { useEnhancedPersistence } from "@/hooks/useEnhancedPersistence"
import { Plus, Search, Filter, Edit3, Trash2, Database, Save, RefreshCw } from "lucide-react"
import { format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"
import type { DrawResult } from "@/services/lotteryApi"

export function DataManagement() {
  const { localData, deleteDrawResult } = useAdmin()
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedResult, setSelectedResult] = useState<{ result: DrawResult; index: number } | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<"create" | "edit">("create")
  const { toast } = useToast()

  // Utiliser la persistance renforcée pour les données admin
  const {
    data: enhancedData,
    setData: setEnhancedData,
    isSaving,
    lastSaved,
    save: saveManually,
    forceSync,
  } = useEnhancedPersistence("admin_data", localData, {
    autoSave: true,
    type: "admin",
  })

  const resultsPerPage = 15

  const filteredResults = localData.filter(
    (result) =>
      searchTerm === "" ||
      result.draw_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      result.date.includes(searchTerm) ||
      result.gagnants.some((num) => num.toString().includes(searchTerm)),
  )

  const totalPages = Math.ceil(filteredResults.length / resultsPerPage)
  const paginatedResults = filteredResults.slice((currentPage - 1) * resultsPerPage, currentPage * resultsPerPage)

  const handleEdit = (result: DrawResult, index: number) => {
    setSelectedResult({ result, index })
    setModalMode("edit")
    setIsModalOpen(true)
  }

  const handleDelete = (index: number, result: DrawResult) => {
    if (confirm(`Êtes-vous sûr de vouloir supprimer le tirage ${result.draw_name} du ${result.date} ?`)) {
      deleteDrawResult(index)
      toast({
        title: "✅ Suppression réussie",
        description: `Tirage ${result.draw_name} supprimé`,
      })
    }
  }

  const handleCreate = () => {
    setSelectedResult(null)
    setModalMode("create")
    setIsModalOpen(true)
  }

  const handleForceSave = async () => {
    try {
      await saveManually()
    } catch (error) {
      console.error("Erreur sauvegarde manuelle:", error)
    }
  }

  const handleForceSync = async () => {
    try {
      await forceSync()
    } catch (error) {
      console.error("Erreur synchronisation:", error)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <Database className="h-5 w-5" />
                <span>Gestion des Données</span>
                {isSaving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />}
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                {localData.length} tirage(s) en base locale
                {lastSaved && (
                  <span className="ml-2 text-xs">• Dernière sauvegarde: {lastSaved.toLocaleTimeString()}</span>
                )}
              </p>
            </div>
            <div className="flex space-x-2">
              <Button onClick={handleForceSave} variant="outline" size="sm" disabled={isSaving}>
                <Save className="h-4 w-4 mr-2" />
                Sauvegarder
              </Button>
              <Button onClick={handleForceSync} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Synchroniser
              </Button>
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Nouveau Tirage
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Alerte de persistance */}
            <Alert className="border-green-200 bg-green-50 dark:bg-green-900/20">
              <Database className="h-4 w-4" />
              <AlertDescription>
                🔄 **Persistance renforcée activée**: Auto-sauvegarde toutes les 30s, synchronisation automatique avec
                Supabase, et récupération après crash.
                {lastSaved && (
                  <span className="block mt-1 text-xs">Dernière sauvegarde locale: {lastSaved.toLocaleString()}</span>
                )}
              </AlertDescription>
            </Alert>

            {/* Barre de recherche */}
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par nom de tirage, date ou numéro..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="pl-10"
                />
              </div>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Filtres
              </Button>
            </div>

            {/* Statistiques rapides */}
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{localData.length}</div>
                  <div className="text-sm text-muted-foreground">Total tirages</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{new Set(localData.map((r) => r.draw_name)).size}</div>
                  <div className="text-sm text-muted-foreground">Types de jeux</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{new Set(localData.map((r) => r.date)).size}</div>
                  <div className="text-sm text-muted-foreground">Jours différents</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{filteredResults.length}</div>
                  <div className="text-sm text-muted-foreground">Résultats filtrés</div>
                </CardContent>
              </Card>
            </div>

            {/* Liste des résultats */}
            <div className="space-y-2">
              {paginatedResults.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="font-medium mb-2">Aucune donnée trouvée</h3>
                    <p className="text-muted-foreground mb-4">
                      {searchTerm
                        ? "Aucun résultat ne correspond à votre recherche"
                        : "Aucune donnée de tirage disponible"}
                    </p>
                    <Button onClick={handleCreate}>
                      <Plus className="h-4 w-4 mr-2" />
                      Ajouter le premier tirage
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                paginatedResults.map((result, index) => {
                  const globalIndex = (currentPage - 1) * resultsPerPage + index
                  return (
                    <Card
                      key={`${result.draw_name}-${result.date}-${index}`}
                      className="hover:bg-muted/50 transition-colors border-l-4 border-l-primary/20 hover:border-l-primary"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <h3 className="font-medium">{result.draw_name}</h3>
                              <Badge variant="outline">
                                {format(parseISO(result.date), "EEEE d MMMM yyyy", { locale: fr })}
                              </Badge>
                              <Badge className="bg-green-100 text-green-800 text-xs">Sauvegardé</Badge>
                            </div>
                            <div className="flex space-x-2">
                              {result.gagnants.map((number, i) => (
                                <NumberBall key={i} number={number} size="sm" />
                              ))}
                            </div>
                            {result.machine && (
                              <div className="flex items-center space-x-2">
                                <span className="text-xs text-muted-foreground">Machine:</span>
                                {result.machine.map((number, i) => (
                                  <NumberBall key={i} number={number} size="xs" />
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex space-x-2">
                            <Button variant="outline" size="sm" onClick={() => handleEdit(result, globalIndex)}>
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(globalIndex, result)}
                              className="text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })
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

      <DrawResultModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        mode={modalMode}
        initialData={selectedResult}
      />
    </div>
  )
}
