"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Download, Upload } from "lucide-react"
import { importData, exportData } from "@/lib/api/admin-api"

export function ImportExport() {
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text)

      const response = await importData(data)
      if (response.success) {
        alert(`Importé avec succès: ${response.imported} résultats`)
      }
    } catch (error) {
      console.error("[v0] Import error:", error)
      alert("Erreur lors de l'importation")
    } finally {
      setImporting(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const response = await exportData()
      if (response.success) {
        const dataStr = JSON.stringify(response.data, null, 2)
        const dataBlob = new Blob([dataStr], { type: "application/json" })
        const url = URL.createObjectURL(dataBlob)
        const link = document.createElement("a")
        link.href = url
        link.download = `loterie_export_${new Date().toISOString().split("T")[0]}.json`
        link.click()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error("[v0] Export error:", error)
      alert("Erreur lors de l'exportation")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Importer des données
          </CardTitle>
          <CardDescription>Importer des résultats depuis un fichier JSON</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="import-file">Fichier JSON</Label>
              <Input id="import-file" type="file" accept=".json" onChange={handleImport} disabled={importing} />
            </div>
            {importing && <p className="text-sm text-muted-foreground">Importation en cours...</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Exporter des données
          </CardTitle>
          <CardDescription>Télécharger tous les résultats en JSON</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExport} disabled={exporting}>
            <Download className="w-4 h-4 mr-2" />
            {exporting ? "Exportation..." : "Exporter tout"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
