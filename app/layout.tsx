import type React from "react"
import type { Metadata } from "next"

import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

import { PWAPrompt } from "@/components/pwa-prompt"
import { PWAInitializer } from "@/components/pwa-initializer"

import { Plus_Jakarta_Sans, IBM_Plex_Mono, Geist as V0_Font_Geist, Geist_Mono as V0_Font_Geist_Mono, Source_Serif_4 as V0_Font_Source_Serif_4 } from 'next/font/google'

// Initialize fonts
const _geist = V0_Font_Geist({ subsets: ['latin'], weight: ["100","200","300","400","500","600","700","800","900"] })
const _geistMono = V0_Font_Geist_Mono({ subsets: ['latin'], weight: ["100","200","300","400","500","600","700","800","900"] })
const _sourceSerif_4 = V0_Font_Source_Serif_4({ subsets: ['latin'], weight: ["200","300","400","500","600","700","800","900"] })

const plusJakarta = Plus_Jakarta_Sans({ subsets: ["latin"] })
const ibmPlexMono = IBM_Plex_Mono({ weight: ["400", "500", "600", "700"], subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Loterie PWA - Analyse et Prédictions",
  description: "Application d'analyse des résultats de loterie avec statistiques avancées et prédictions ML",
  generator: "v0.app",
  manifest: "/manifest.json",
  themeColor: "#7033ff",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Loterie PWA",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr">
      <head>
        <link rel="icon" href="/icon-192.jpg" />
        <link rel="apple-touch-icon" href="/icon-192.jpg" />
      </head>
      <body className={`font-sans antialiased ${plusJakarta.className} ${ibmPlexMono.className}`}>
        <PWAInitializer />
        {children}
        <PWAPrompt />
        <Analytics />
      </body>
    </html>
  )
}
