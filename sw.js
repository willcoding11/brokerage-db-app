// Service worker: offline shell cache + notification support.
// Bump CACHE to invalidate everything after a big change.
const CACHE = 'bdb-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)

  // App navigations: network first (so deploys show up immediately),
  // cached shell when offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('app-shell', copy))
          return res
        })
        .catch(() => caches.match('app-shell')),
    )
    return
  }

  // Hashed static assets: cache first.
  if (
    url.origin === location.origin &&
    /\.(js|css|png|svg|webmanifest|woff2?)$/.test(url.pathname)
  ) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(e.request, copy))
            }
            return res
          }),
      ),
    )
  }
})

// Web push — arrives even when the app is closed (once push is wired up).
// Payload is optional; without one we show a generic alert.
self.addEventListener('push', (e) => {
  let data = {}
  try {
    data = e.data ? e.data.json() : {}
  } catch {
    /* empty or non-JSON payload */
  }
  e.waitUntil(
    self.registration.showNotification(data.title || '🔔 New Facebook lead', {
      body: data.body || 'Open the app to see who it is.',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: 'new-lead',
      data: { url: self.registration.scope },
    }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus()
      }
      return self.clients.openWindow(e.notification.data?.url || self.registration.scope)
    }),
  )
})
