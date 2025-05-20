
import type { Metadata } from 'next';
import { AuthProvider } from '@/contexts/AuthContext';
import AdminAuthGuard from '@/components/admin/AdminAuthGuard';
import AdminHeader from '@/components/admin/AdminHeader';


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
