"use client"

import { useEffect } from "react"
import { registerServiceWorker } from "@/lib/pwa/register-sw"

export function PWAInitializer() {
  useEffect(() => {
    registerServiceWorker()
  }, [])

  return null
}
