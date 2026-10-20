import { NavDiscovery, parseDiscovery } from './navActions';

/**
 * Où en est l'utilisateur dans la découverte de l'appui long sur le +.
 *
 * Une seule clé, sauvegardée avec les préférences (`utils/dataBackup.ts`) : on ne
 * réapprend pas le geste à quelqu'un qui restaure ses données. Le stockage peut
 * être indisponible (navigation privée, WebView) : chaque accès est protégé, et
 * l'app se comporte alors comme au premier lancement, sans erreur.
 */
export const NAV_DISCOVERY_KEY = 'bitter_nav_discovery';

const listeners = new Set<() => void>();

export const readNavDiscovery = (): NavDiscovery => {
  try {
    return parseDiscovery(localStorage.getItem(NAV_DISCOVERY_KEY));
  } catch {
    return parseDiscovery(null);
  }
};

export const updateNavDiscovery = (change: (state: NavDiscovery) => NavDiscovery): NavDiscovery => {
  const next = change(readNavDiscovery());
  try {
    localStorage.setItem(NAV_DISCOVERY_KEY, JSON.stringify(next));
  } catch {
    // Stockage indisponible : la découverte repartira de zéro au prochain lancement.
  }
  listeners.forEach((listener) => listener());
  return next;
};

/** Prévient les écrans qui affichent un rappel (« Plus rapide : maintiens le + »). */
export const subscribeNavDiscovery = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
