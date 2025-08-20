
'use client';

import { auth } from '@/lib/firebase';
import { 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  type AuthError
} from 'firebase/auth';

/**
 * Handles the logic for user login.
 * @param email - The user's email.
 * @param password - The user's password.
 * @returns A promise that resolves on successful login.
 * @throws An error with a user-friendly message on failure.
 */
export async function signIn(email: string, pass: string): Promise<void> {
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    const authError = err as AuthError;
    console.error("Login error:", authError.code);
    if (authError.code === 'auth/user-not-found' || authError.code === 'auth/wrong-password' || authError.code === 'auth/invalid-credential') {
      throw new Error("Email ou mot de passe incorrect.");
    } else {
      throw new Error("Erreur de connexion. Veuillez réessayer.");
    }
  }
}

/**
 * Handles the logic for user logout.
 * @returns A promise that resolves on successful logout.
 * @throws An error with a user-friendly message on failure.
 */
export async function signOut(): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } catch (err) {
    const authError = err as AuthError;
    console.error("Logout error:", authError.code);
    throw new Error("Erreur de déconnexion.");
  }
}
