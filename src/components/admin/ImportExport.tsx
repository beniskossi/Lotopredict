"use client"
import { useState, useRef } from "react"
import type React from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAdmin } from "@/contexts/AdminContext"
import { Upload, Download, FileText, CheckCircle, AlertTriangle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export function ImportExport() {
  const { exportData, importData, localData } = useAdmin()
  const [importText, setImportText] = useState("")
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const handleExport = () => {
    try {
      const jsonData = exportData()
      const blob = new Blob([jsonData], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `lotobonheur_export_${new Date().toISOString().split("T")[0]}.json`
      link.click()
      URL.revokeObjectURL(url)

      toast({
        title: "✅ Export réussi",
        description: `${localData.length} tirages exportés avec succès`,
      })
    } catch (error) {
      toast({
        title: "❌ Erreur d'export",
        description: "Impossible de générer le fichier d'export",
        variant: "destructive",
      })
    }
  }

  const handleImportText = async () => {
    if (!importText.trim()) {
      toast({
        title: "❌ Erreur",
        description: "Veuillez coller les données JSON à importer",
        variant: "destructive",
      })
      return
    }

    setIsImporting(true)

    try {
      const success = importData(importText)
      if (success) {
        toast({
          title: "✅ Import réussi",
          description: "Les données ont été importées avec succès",
        })
        setImportText("")
      } else {
        toast({
          title: "❌ Erreur d'import",
          description: "Format de données invalide ou données corrompues",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "❌ Erreur d'import",
        description: "Impossible de traiter les données fournies",
        variant: "destructive",
      })
    } finally {
      setIsImporting(false)
    }
  }

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      const content = e.target?.result as string
      if (content) {
        setImportText(content)

        // Auto-import si c'est du JSON valide
        try {
          JSON.parse(content)
          await handleImportText()
        } catch {
          toast({
            title: "❌ Fichier invalide",
            description: "Le fichier sélectionné ne contient pas de JSON valide",
            variant: "destructive",
          })
        }
      }
    }
    reader.readAsText(file)

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-6">
      {/* Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Download className="h-5 w-5" />
            <span>Exporter les Données</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Exportez toutes vos données de tirages au format JSON pour sauvegarde ou transfert.
            </AlertDescription>
          </Alert>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <h3 className="font-medium">Données disponibles</h3>
              <p className="text-sm text-muted-foreground">
                {localData.length} tirage(s) • {new Set(localData.map((r) => r.draw_name)).size} type(s) de jeu
              </p>
            </div>
            <Button onClick={handleExport} disabled={localData.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Télécharger JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Import */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Upload className="h-5 w-5" />
            <span>Importer des Données</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              L'import fusionnera les nouvelles données avec les existantes. Les doublons seront automatiquement
              ignorés.
            </AlertDescription>
          </Alert>

          {/* Import par fichier */}
          <div className="space-y-2">
            <h3 className="font-medium">Import par fichier</h3>
            <div className="flex items-center space-x-2">
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="flex-1">
                <FileText className="h-4 w-4 mr-2" />
                Sélectionner un fichier JSON
              </Button>
              <input type="file" ref={fileInputRef} onChange={handleFileImport} accept=".json" className="hidden" />
            </div>
          </div>

          {/* Import par texte */}
          <div className="space-y-2">
            <h3 className="font-medium">Import par copier-coller</h3>
            <Textarea
              placeholder="Collez ici le contenu JSON à importer..."
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="min-h-[200px] font-mono text-sm"
            />
            <div className="flex justify-end">
              <Button onClick={handleImportText} disabled={!importText.trim() || isImporting}>
                {isImporting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Import en cours...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Importer les données
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Format d'exemple */}
          <div className="space-y-2">
            <h3 className="font-medium">Format attendu</h3>
            <div className="p-3 bg-muted rounded-lg">
              <pre className="text-xs overflow-x-auto">
                {`[
  {
    "draw_name": "Akwaba",
    "date": "2025-01-15",
    "gagnants": [12, 25, 43, 67, 89],
    "machine": [8, 22, 35, 58, 81]
  }
]`}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
