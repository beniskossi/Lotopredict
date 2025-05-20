
import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Admin - LotoPredict',
  description: 'Administration dashboard for LotoPredict.',
};

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center">
          <div className="mr-4 hidden md:flex">
            <a className="mr-6 flex items-center space-x-2" href="/admin/dashboard">
              <ShieldCheck className="h-6 w-6 text-primary" />
              <span className="hidden font-bold sm:inline-block">
                LotoPredict Admin
              </span>
            </a>
          </div>
          {/* Add Admin Navigation here if needed */}
        </div>
      </header>
      <main className="flex-1 container mx-auto py-8 px-4">{children}</main>
       <footer className="border-t bg-background px-4 py-6 md:px-6 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} LotoPredict Admin Panel.
        </footer>
    </div>
  );
}
