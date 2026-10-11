/**
 * Repérer une nouvelle version de l'app, et redémarrer proprement.
 *
 * Deux signaux :
 * - un écran chargé à la demande qui n'existe plus (« Failed to fetch dynamically
 *   imported module ») : l'app ouverte avant un déploiement cherche l'ancien
 *   fichier, que le serveur ne sert plus. Ce n'est pas une panne ;
 * - `/version.json`, écrit à chaque build (vite.config.ts), qui ne correspond plus
 *   à la version en cours. Lu au retour dans l'app, sans cache.
 *
 * Dans les deux cas on affiche l'écran « Changement de bobine »
 * (components/UpdateScreen.tsx) au lieu d'une erreur.
 */

declare const __BUILD_ID__: string;

/** Identifiant du build en cours ; vide en développement. */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : '';

export type UpdateMode = 'error' | 'found' | 'preview';

const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk [\w-]+ failed|Unable to preload CSS/i;

/** Vrai pour une erreur due à un fichier d'une version précédente. */
export const isChunkLoadError = (error: unknown): boolean => {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
  return CHUNK_ERROR.test(text);
};

type Listener = (mode: UpdateMode) => void;
const listeners = new Set<Listener>();
let current: UpdateMode | null = null;

export const subscribeUpdate = (listener: Listener) => {
  listeners.add(listener);
  if (current) listener(current);
  return () => {
    listeners.delete(listener);
  };
};

/** Demande l'écran de mise à jour. Une erreur de chargement l'emporte sur un simple signal. */
export const requestUpdateScreen = (mode: UpdateMode) => {
  if (current === 'error' && mode !== 'error') return;
  current = mode;
  listeners.forEach((l) => l(mode));
};

export const dismissUpdateScreen = () => {
  current = null;
  try {
    sessionStorage.setItem(DISMISS_KEY, BUILD_ID);
  } catch {
    // Sans stockage, l'écran pourra revenir au prochain retour dans l'app.
  }
};

const DISMISS_KEY = 'bitter_update_dismissed';

/**
 * Redémarrer : retirer l'ancien service worker et ses caches, puis recharger.
 * Une PWA installée sert sinon obstinément la version enregistrée.
 */
export const restartApp = async () => {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (e) {
    console.warn('[Mise à jour] Nettoyage du cache impossible :', e);
  } finally {
    window.location.reload();
  }
};

let lastCheck = 0;
/** Une nouvelle version est-elle en ligne ? Au plus une lecture toutes les deux minutes. */
export const checkForNewVersion = async (force = false): Promise<boolean> => {
  if (!BUILD_ID || (!force && Date.now() - lastCheck < 120_000)) return false;
  lastCheck = Date.now();
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return false;
    const { build } = (await res.json()) as { build?: string };
    if (!build || build === BUILD_ID) return false;
    let dismissed = '';
    try {
      dismissed = sessionStorage.getItem(DISMISS_KEY) ?? '';
    } catch {
      // Pas de stockage : on montre l'écran.
    }
    if (dismissed === BUILD_ID) return false;
    requestUpdateScreen('found');
    return true;
  } catch {
    return false;
  }
};

let installed = false;
/** À appeler une fois au démarrage. */
export const installUpdateWatch = () => {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // Vite signale lui-même l'échec d'un préchargement d'écran.
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    requestUpdateScreen('error');
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event.reason)) requestUpdateScreen('error');
  });

  // Au retour dans l'app (après l'avoir laissée en arrière-plan) : nouvelle version ?
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForNewVersion();
  });
  window.setTimeout(() => void checkForNewVersion(true), 8_000);

  // Aperçu volontaire : thebitter.watch/?nouveautes
  const url = new URL(window.location.href);
  if (url.searchParams.has('nouveautes')) {
    url.searchParams.delete('nouveautes');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    requestUpdateScreen('preview');
  }
};
