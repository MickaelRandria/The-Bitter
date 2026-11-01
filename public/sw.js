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

/**
 * La destination d'une notification touchée, gardée quelques minutes.
 *
 * Sur iPhone, `openWindow` ouvre l'app installée à sa racine, sans l'adresse
 * demandée, ou la laisse sur la page où on l'avait quittée (bugs WebKit 259212,
 * 263687). L'app relit donc cette destination au démarrage et à chaque retour
 * au premier plan (utils/pendingOpen.ts).
 */
const PENDING_CACHE = 'bitter-pending-open';
const PENDING_KEY = '/__pending-open';

const rememberPendingOpen = async (url) => {
  try {
    const cache = await caches.open(PENDING_CACHE);
    await cache.put(PENDING_KEY, new Response(JSON.stringify({ url, at: Date.now() })));
  } catch {
    // Sans stockage, on compte sur l'adresse passée à l'app.
  }
};

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Adresse absolue dans le périmètre de l'app : une adresse relative ou hors
  // périmètre peut faire ouvrir le navigateur au lieu de l'app installée.
  const targetUrl = new URL(event.notification.data?.url || '/', self.registration.scope).href;

  // App déjà ouverte : la mettre au premier plan ne suffit pas, elle resterait sur
  // l'écran où on l'avait laissée. On lui transmet l'adresse, qu'elle lit comme au
  // démarrage (`?notif=`, `?screening=`).
  event.waitUntil(
    (async () => {
      await rememberPendingOpen(targetUrl);
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        existing.postMessage({ type: 'open', url: targetUrl });
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    })()
  );
});
