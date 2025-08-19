
"use client";

import { useEffect } from 'react';

/**
 * This component handles client-side initializations that need to run once,
 * like registering the service worker. It's kept separate to allow the
 * main RootLayout to be a Server Component for metadata optimization.
 */
export default function AppInitializer() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
          console.log('SW registered: ', registration);
        }).catch(registrationError => {
          console.log('SW registration failed: ', registrationError);
        });
      });
    }
  }, []);

  return null; // This component does not render anything
}
