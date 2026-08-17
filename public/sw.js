import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

// Les PWA déjà installées enregistrent ce chemin. Garder ce nom permet de
// remplacer leur ancien cache dès leur prochaine ouverture.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

const defaultOptions = {
  icon: '/favicon_io/android-chrome-192x192.png',
  badge: '/favicon_io/android-chrome-192x192.png',
  vibrate: [120, 60, 120],
};

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'The Bitter', body: 'Tu as un rappel cinéma.' };
  }

  const title = typeof payload.title === 'string' ? payload.title : 'The Bitter';
  const options = {
    ...defaultOptions,
    ...(payload && typeof payload === 'object' ? payload : {}),
  };
  delete options.title;

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});
