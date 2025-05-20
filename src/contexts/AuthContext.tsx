
"use client";

import type { User } from 'firebase/auth';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth } from '@/lib/firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  type AuthError
} from 'firebase/auth';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!loading && !currentUser && pathname?.startsWith('/admin') && pathname !== '/admin/login') {
      router.push('/admin/login');
    }
    if (!loading && currentUser && pathname === '/admin/login') {
      router.push('/admin/dashboard');
    }
  }, [currentUser, loading, pathname, router]);

  const login = async (email: string, pass: string) => {
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      // onAuthStateChanged will handle currentUser state and redirection
    } catch (err) {
      const authError = err as AuthError;
      console.error("Login error:", authError);
      if (authError.code === 'auth/user-not-found' || authError.code === 'auth/wrong-password' || authError.code === 'auth/invalid-credential') {
        setError("Email ou mot de passe incorrect.");
      } else {
        setError("Erreur de connexion. Veuillez réessayer.");
      }
      setLoading(false); // Ensure loading is false on error
    }
    // setLoading will be set to false by onAuthStateChanged
  };

  const logout = async () => {
    setLoading(true);
    setError(null);
    try {
      await firebaseSignOut(auth);
      setCurrentUser(null); // Explicitly set user to null
      router.push('/admin/login'); // Redirect to login after logout
    } catch (err) {
      const authError = err as AuthError;
      console.error("Logout error:", authError);
      setError("Erreur de déconnexion.");
    } finally {
      setLoading(false);
    }
  };

  const value = {
    currentUser,
    loading,
    login,
    logout,
    error,
  };

  // Render children only if loading is false and (user is authenticated for admin pages OR it's a non-admin page OR it's the login page)
  const isAdminPage = pathname?.startsWith('/admin');
  const isLoginPage = pathname === '/admin/login';

  if (loading && isAdminPage && !isLoginPage) {
      return (
        <div className="flex justify-center items-center min-h-screen">
          <p>Chargement de la session admin...</p>
        </div>
      );
  }


  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
