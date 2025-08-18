// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
// These values are typically sourced from environment variables
// and originate from your Firebase project settings in the Firebase console.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
};

// Initialize Firebase
// This ensures Firebase is initialized only once.
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

// Enable offline persistence for Firestore. This is a good practice for PWAs.
// It helps the app function when offline and can mitigate some "client is offline" errors.
try {
  enableIndexedDbPersistence(db)
    .catch((err) => {
      if (err.code == 'failed-precondition') {
        // This can happen if multiple tabs are open. Persistence is only enabled in one.
        // It's a warning, not a critical error.
        console.warn('Firestore persistence failed to enable. This can happen if you have multiple tabs of this app open.');
      } else if (err.code == 'unimplemented') {
        // The browser does not support all features required for persistence.
        console.warn('Firestore persistence is not supported in this browser.');
      }
    });
} catch (error) {
    console.error("An error occurred while trying to enable Firestore persistence:", error);
}

export { app, db, auth };
