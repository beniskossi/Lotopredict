"use client";

import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { useToast } from "@/hooks/use-toast";
import { Download, CheckCircle } from "lucide-react";
import { useState, useEffect } from "react";

export default function PWAInstallButton() {
  const { canInstall, triggerInstallPrompt } = usePWAInstall();
  const { toast } = useToast();
  const [isInstalled, setIsInstalled] = useState(false); // Track if PWA is already installed

  useEffect(() => {
    // Check if the app is already running in standalone mode (installed)
    if (typeof window !== "undefined" && window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }
  }, []);

  const handleInstallClick = async () => {
    const installed = await triggerInstallPrompt();
    if (installed) {
      toast({
        title: "Installation Réussie",
        description: "LotoPredict a été ajouté à votre écran d'accueil.",
      });
      setIsInstalled(true); // Update state after successful installation
    } else {
      toast({
        variant: "default",
        title: "Installation Annulée",
        description: "Vous pourrez installer l'application plus tard.",
      });
    }
  };

  if (isInstalled) {
    return (
      <Button variant="ghost" className="w-full justify-start text-sidebar-foreground cursor-default" disabled>
        <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
        Application Installée
      </Button>
    );
  }

  if (!canInstall) {
    return null; // Don't show the button if PWA is not installable or already installed
  }

  return (
    <Button onClick={handleInstallClick} variant="outline" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
      <Download className="mr-2 h-4 w-4" />
      Installer l'Application
    </Button>
  );
}
