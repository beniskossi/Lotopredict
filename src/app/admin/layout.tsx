
import type { Metadata } from 'next';
import { ShieldCheck, LogOut } from 'lucide-react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import AdminAuthGuard from '@/components/admin/AdminAuthGuard';


export const metadata: Metadata = {
  title: 'Admin - LotoPredict',
  description: 'Administration dashboard for LotoPredict.',
};


function AdminHeader() {
  // This component will be rendered within AuthProvider, so useAuth is safe here.
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


export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthProvider>
        <AdminAuthGuard>
            <div className="flex min-h-screen flex-col">
            <AdminHeader />
            <main className="flex-1 container mx-auto py-8 px-4">{children}</main>
            <footer className="border-t bg-background px-4 py-6 md:px-6 text-center text-sm text-muted-foreground">
                © {new Date().getFullYear()} LotoPredict Admin Panel.
            </footer>
            </div>
        </AdminAuthGuard>
    </AuthProvider>
  );
}
