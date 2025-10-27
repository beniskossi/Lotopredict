"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { NumberBall } from "@/components/number-ball"
import { Plus, Trash2, Edit, Save, X } from "lucide-react"
import { fetchResults, createResult, updateResult, deleteResult } from "@/lib/api/admin-api"
import { DRAW_SCHEDULES } from "@/lib/types"
import type { DrawResult } from "@/lib/types"

export function ResultsManager() {
  const [results, setResults] = useState<DrawResult[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const [formData, setFormData] = useState({
    draw_name: "",
    draw_date: "",
    winning_numbers: [0, 0, 0, 0, 0],
    machine_numbers: [0, 0, 0, 0, 0],
  })

  useEffect(() => {
    loadResults()
  }, [])

  const loadResults = async () => {
    setLoading(true)
    try {
      const response = await fetchResults(1, 50)
      if (response.success) {
        setResults(response.data)
      }
    } catch (error) {
      console.error("[v0] Error loading results:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    try {
      const response = await createResult(formData as any)
      if (response.success) {
        await loadResults()
        setIsCreating(false)
        resetForm()
      }
    } catch (error) {
      console.error("[v0] Error creating result:", error)
    }
  }

  const handleUpdate = async (id: string) => {
    try {
      const response = await updateResult({ ...formData, id } as any)
      if (response.success) {
        await loadResults()
        setEditingId(null)
        resetForm()
      }
    } catch (error) {
      console.error("[v0] Error updating result:", error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce résultat ?")) return

    try {
      const response = await deleteResult(id)
      if (response.success) {
        await loadResults()
      }
    } catch (error) {
      console.error("[v0] Error deleting result:", error)
    }
  }

  const startEdit = (result: DrawResult) => {
    setEditingId(result.id)
    setFormData({
      draw_name: result.draw_name,
      draw_date: result.draw_date,
      winning_numbers: result.winning_numbers,
      machine_numbers: result.machine_numbers || [0, 0, 0, 0, 0],
    })
  }

  const resetForm = () => {
    setFormData({
      draw_name: "",
      draw_date: "",
      winning_numbers: [0, 0, 0, 0, 0],
      machine_numbers: [0, 0, 0, 0, 0],
    })
  }

  const updateNumber = (type: "winning" | "machine", index: number, value: number) => {
    const key = type === "winning" ? "winning_numbers" : "machine_numbers"
    const newNumbers = [...formData[key]]
    newNumbers[index] = value
    setFormData({ ...formData, [key]: newNumbers })
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">Chargement...</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Gestion des résultats</CardTitle>
              <CardDescription>Ajouter, modifier ou supprimer des résultats de tirages</CardDescription>
            </div>
            <Button onClick={() => setIsCreating(!isCreating)}>
              {isCreating ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              {isCreating ? "Annuler" : "Nouveau"}
            </Button>
          </div>
        </CardHeader>

        {isCreating && (
          <CardContent className="border-t">
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tirage</Label>
                  <Select value={formData.draw_name} onValueChange={(v) => setFormData({ ...formData, draw_name: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      {DRAW_SCHEDULES.map((draw) => (
                        <SelectItem key={draw.id} value={draw.draw_name}>
                          {draw.draw_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={formData.draw_date}
                    onChange={(e) => setFormData({ ...formData, draw_date: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label>Numéros gagnants</Label>
                <div className="flex gap-2 mt-2">
                  {formData.winning_numbers.map((num, idx) => (
                    <Input
                      key={idx}
                      type="number"
                      min="1"
                      max="90"
                      value={num || ""}
                      onChange={(e) => updateNumber("winning", idx, Number.parseInt(e.target.value) || 0)}
                      className="w-16"
                    />
                  ))}
                </div>
              </div>

              <Button onClick={handleCreate}>
                <Save className="w-4 h-4 mr-2" />
                Créer
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="space-y-3">
        {results.map((result) => (
          <Card key={result.id}>
            <CardContent className="pt-6">
              {editingId === result.id ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Tirage</Label>
                      <Select
                        value={formData.draw_name}
                        onValueChange={(v) => setFormData({ ...formData, draw_name: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DRAW_SCHEDULES.map((draw) => (
                            <SelectItem key={draw.id} value={draw.draw_name}>
                              {draw.draw_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Date</Label>
                      <Input
                        type="date"
                        value={formData.draw_date}
                        onChange={(e) => setFormData({ ...formData, draw_date: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Numéros gagnants</Label>
                    <div className="flex gap-2 mt-2">
                      {formData.winning_numbers.map((num, idx) => (
                        <Input
                          key={idx}
                          type="number"
                          min="1"
                          max="90"
                          value={num || ""}
                          onChange={(e) => updateNumber("winning", idx, Number.parseInt(e.target.value) || 0)}
                          className="w-16"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={() => handleUpdate(result.id)}>
                      <Save className="w-4 h-4 mr-2" />
                      Enregistrer
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingId(null)
                        resetForm()
                      }}
                    >
                      Annuler
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{result.draw_name}</p>
                    <p className="text-sm text-muted-foreground">{result.draw_date}</p>
                    <div className="flex gap-2 mt-2">
                      {result.winning_numbers.map((num, idx) => (
                        <NumberBall key={idx} number={num} size="sm" />
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => startEdit(result)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(result.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
