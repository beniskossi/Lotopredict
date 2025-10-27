// Service Worker for Loterie PWA
const CACHE_NAME = "loterie-pwa-v1"
const RUNTIME_CACHE = "loterie-runtime-v1"

// Assets to cache on install
const PRECACHE_ASSETS = ["/", "/tirages", "/manifest.json", "/icon-192.jpg", "/icon-512.jpg"]

// Install event - cache essential assets
self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker...")
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Precaching assets")
      return cache.addAll(PRECACHE_ASSETS)
    }),
  )
  self.skipWaiting()
})

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker...")
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log("[SW] Deleting old cache:", cacheName)
            return caches.delete(cacheName)
          }
        }),
      )
    }),
  )
  self.clients.claim()
})

// Fetch event - network first, fallback to cache
self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return
  }

  // API requests - network first
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone and cache successful responses
          if (response.ok) {
            const responseClone = response.clone()
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseClone)
            })
          }
          return response
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(request)
        }),
    )
    return
  }

  // Static assets - cache first
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(request).then((response) => {
        // Cache successful responses
        if (response.ok) {
          const responseClone = response.clone()
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone)
          })
        }
        return response
      })
    }),
  )
})

// Background sync for offline changes
self.addEventListener("sync", (event) => {
  console.log("[SW] Background sync triggered:", event.tag)

  if (event.tag === "sync-draw-results") {
    event.waitUntil(
      // Trigger sync logic
      fetch("/api/sync", { method: "POST" })
        .then((response) => {
          console.log("[SW] Background sync completed")
          return response
        })
        .catch((error) => {
          console.error("[SW] Background sync failed:", error)
        }),
    )
  }
})

// Push notifications (for future use)
self.addEventListener("push", (event) => {
  console.log("[SW] Push notification received")

  const data = event.data ? event.data.json() : {}
  const title = data.title || "Loterie PWA"
  const options = {
    body: data.body || "Nouveaux résultats disponibles",
    icon: "/icon-192.jpg",
    badge: "/icon-192.jpg",
    data: data.url || "/",
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Notification click handler
self.addEventListener("notificationclick", (event) => {
  console.log("[SW] Notification clicked")
  event.notification.close()

  event.waitUntil(clients.openWindow(event.notification.data || "/"))
})
