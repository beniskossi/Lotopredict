"use client"

import { cn } from "@/lib/utils"

import { useSync } from "@/hooks/use-sync"
import { Button } from "@/components/ui/button"
import { RefreshCw, CheckCircle, XCircle, Clock } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { fr } from "date-fns/locale"

export function SyncStatus() {
  const { isSyncing, lastSyncTime, error, performSync } = useSync()

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-sm">
        {error ? (
          <>
            <XCircle className="w-4 h-4 text-destructive" />
            <span className="text-destructive">Erreur de sync</span>
          </>
        ) : isSyncing ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin text-primary" />
            <span className="text-muted-foreground">Synchronisation...</span>
          </>
        ) : lastSyncTime ? (
          <>
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="text-muted-foreground">
              Sync {formatDistanceToNow(new Date(lastSyncTime), { addSuffix: true, locale: fr })}
            </span>
          </>
        ) : (
          <>
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Pas encore synchronisé</span>
          </>
        )}
      </div>

      <Button variant="outline" size="sm" onClick={performSync} disabled={isSyncing}>
        <RefreshCw className={cn("w-4 h-4 mr-2", isSyncing && "animate-spin")} />
        Actualiser
      </Button>
    </div>
  )
}
