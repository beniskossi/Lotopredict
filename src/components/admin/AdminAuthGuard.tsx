
"use client";

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Skeleton } from '../ui/skeleton';
import { Loader2 } from 'lucide-react';

interface AdminAuthGuardProps {
  children: ReactNode;
}

export default function AdminAuthGuard({ children }: AdminAuthGuardProps) {
  const { currentUser, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return; // Don't do anything while loading

    const isAuthPage = pathname === '/admin/login';
    
    // If not logged in and not on the login page, redirect to login
    if (!currentUser && !isAuthPage) {
      router.replace('/admin/login');
    }
    
    // If logged in and on the login page, redirect to dashboard
    if (currentUser && isAuthPage) {
      router.replace('/admin/dashboard');
    }

  }, [currentUser, loading, pathname, router]);


  // While loading, show a loading screen for protected pages
  if (loading && pathname !== '/admin/login') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Chargement de la session administrateur...</p>
      </div>
    );
  }

  // If we are on a protected page and there's no user, return null to prevent flicker
  if (!currentUser && pathname !== '/admin/login') {
      return null;
  }
  
  // If we are on the login page and there is a user, return null to prevent flicker
  if (currentUser && pathname === '/admin/login') {
     return null;
  }
  
  // Otherwise, the user is in the correct state for the current page
  return <>{children}</>;
}
