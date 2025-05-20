
"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { ShieldCheck, LogOut } from 'lucide-react';

export default function AdminHeader() {
  const { currentUser, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center">
        <div className="mr-4 flex flex-1 items-center">
          <Link className="mr-6 flex items-center space-x-2" href={currentUser ? "/admin/dashboard" : "/admin/login"}>
            <ShieldCheck className="h-6 w-6 text-primary" />
            <span className="hidden font-bold sm:inline-block">
              LotoPredict Admin
            </span>
          </Link>
        </div>
        {currentUser && (
          <Button onClick={logout} variant="outline" size="sm">
            <LogOut className="mr-2 h-4 w-4" />
            Déconnexion
          </Button>
        )}
      </div>
    </header>
  );
}
