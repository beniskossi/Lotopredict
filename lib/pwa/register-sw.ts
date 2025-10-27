"use client"

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    console.log("[PWA] Service workers not supported")
    return
  }

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      })

      console.log("[PWA] Service worker registered:", registration.scope)

      // Check for updates periodically
      setInterval(() => {
        registration.update()
      }, 60000) // Check every minute

      // Handle updates
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing
        if (!newWorker) return

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            console.log("[PWA] New version available, reload to update")
            // Optionally show a notification to the user
            if (confirm("Une nouvelle version est disponible. Recharger maintenant ?")) {
              window.location.reload()
            }
          }
        })
      })
    } catch (error) {
      console.error("[PWA] Service worker registration failed:", error)
    }
  })
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    console.log("[PWA] Notifications not supported")
    return false
  }

  if (Notification.permission === "granted") {
    return true
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission()
    return permission === "granted"
  }

  return false
}

export async function subscribeToNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.log("[PWA] Push notifications not supported")
    return null
  }

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    })

    console.log("[PWA] Push subscription created:", subscription)
    return subscription
  } catch (error) {
    console.error("[PWA] Failed to subscribe to push notifications:", error)
    return null
  }
}
