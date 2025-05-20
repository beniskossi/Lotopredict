"use client";

import React from 'react';
import { SidebarProvider, Sidebar, SidebarInset, SidebarHeader, SidebarTrigger, SidebarContent, SidebarFooter } from "@/components/ui/sidebar";
import { SidebarNav } from "./SidebarNav";
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Home, Settings } from 'lucide-react';
import PWAInstallButton from '@/components/PWAInstallButton';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = React.useState(true);

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <Sidebar variant="sidebar" collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="p-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-primary hover:opacity-80 transition-opacity">
            LotoPredict
          </Link>
          <div className="md:hidden">
            <SidebarTrigger />
          </div>
        </SidebarHeader>
        <SidebarContent className="p-0">
          <SidebarNav />
        </SidebarContent>
        <SidebarFooter className="p-4 border-t border-sidebar-border">
           <PWAInstallButton />
          {/* Example footer item */}
          {/* <Button variant="ghost" className="w-full justify-start text-sidebar-foreground">
            <Settings className="mr-2 h-4 w-4" />
            Paramètres
          </Button> */}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6 shadow-sm">
          {/* Ensure trigger is available on mobile to open the Sheet, and on desktop to toggle sidebar state */}
          <div>
            <SidebarTrigger />
          </div>
          <nav className="flex-1">
            {/* Top navigation elements can go here if needed */}
          </nav>
          {/* User profile / settings button could go here */}
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          {children}
        </main>
        <footer className="border-t bg-background px-4 py-6 md:px-6 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} LotoPredict. Tous droits réservés.
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
