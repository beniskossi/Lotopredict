"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Download, X } from "lucide-react"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export function PWAPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)

      // Check if user has dismissed the prompt before
      const dismissed = localStorage.getItem("pwa-prompt-dismissed")
      if (!dismissed) {
        setShowPrompt(true)
      }
    }

    window.addEventListener("beforeinstallprompt", handler)

    return () => {
      window.removeEventListener("beforeinstallprompt", handler)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    console.log(`[PWA] User ${outcome} the install prompt`)
    setDeferredPrompt(null)
    setShowPrompt(false)
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    localStorage.setItem("pwa-prompt-dismissed", "true")
  }

  if (!showPrompt) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <Card className="shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Download className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Installer l'application</CardTitle>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleDismiss}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <CardDescription>Installez Loterie PWA pour un accès rapide et une utilisation hors ligne</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button onClick={handleInstall} className="flex-1">
            Installer
          </Button>
          <Button variant="outline" onClick={handleDismiss} className="flex-1 bg-transparent">
            Plus tard
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
