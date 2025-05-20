
"use client";

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Skeleton } from '../ui/skeleton'; // Assuming you have a Skeleton component

interface AdminAuthGuardProps {
  children: ReactNode;
}

export default function AdminAuthGuard({ children }: AdminAuthGuardProps) {
  const { currentUser, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading) {
      if (!currentUser && pathname !== '/admin/login') {
        router.replace('/admin/login');
      } else if (currentUser && pathname === '/admin/login') {
        router.replace('/admin/dashboard');
      }
    }
  }, [currentUser, loading, pathname, router]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Skeleton className="h-8 w-1/2 mb-4" />
        <Skeleton className="h-4 w-1/3 mb-2" />
        <Skeleton className="h-40 w-full max-w-md" />
        <p className="mt-4 text-muted-foreground">Chargement de la session administrateur...</p>
      </div>
    );
  }

  // If user is not logged in and not on login page, children won't be rendered due to redirect.
  // If user is logged in and on login page, children won't be rendered due to redirect.
  // Otherwise, show children.
  if (!currentUser && pathname !== '/admin/login') {
    return null; // Or a loading/redirect indicator, though redirect should handle it
  }
  
  if (currentUser && pathname === '/admin/login') {
     return null; // Or a loading/redirect indicator
  }

  return <>{children}</>;
}
