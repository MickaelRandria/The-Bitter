/**
 * La destination d'une notification touchée, déposée par le service worker
 * (public/sw.js, `rememberPendingOpen`).
 *
 * Sur iPhone, l'app installée s'ouvre souvent à sa racine, sans l'adresse de la
 * notification : on relit donc ce dépôt au démarrage et à chaque retour au
 * premier plan. Lu une seule fois, ignoré au-delà de cinq minutes.
 */

const PENDING_CACHE = 'bitter-pending-open';
const PENDING_KEY = '/__pending-open';
const MAX_AGE_MS = 5 * 60_000;

export async function takePendingOpen(): Promise<string | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(PENDING_CACHE);
    const response = await cache.match(PENDING_KEY);
    if (!response) return null;
    await cache.delete(PENDING_KEY);
    const { url, at } = (await response.json()) as { url?: unknown; at?: unknown };
    if (typeof url !== 'string' || typeof at !== 'number' || Date.now() - at > MAX_AGE_MS) return null;
    return new URL(url).origin === window.location.origin ? url : null;
  } catch {
    return null;
  }
}

/** Efface le dépôt : l'adresse est déjà arrivée par un autre chemin. */
export async function clearPendingOpen(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await (await caches.open(PENDING_CACHE)).delete(PENDING_KEY);
  } catch {
    // Rien à effacer.
  }
}
