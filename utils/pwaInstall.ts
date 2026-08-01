/**
 * Installation de l'app (PWA).
 *
 * Sur Android/Chrome, le navigateur émet `beforeinstallprompt` très tôt après le
 * chargement : on l'intercepte au démarrage pour pouvoir proposer l'installation
 * plus tard, au moment où l'utilisateur ouvre le guide.
 * Sur iOS, aucune API n'existe : l'ajout à l'écran d'accueil est manuel.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export type Platform = 'ios' | 'android' | 'desktop';

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(available: boolean) => void>();

const notify = (available: boolean) => listeners.forEach((l) => l(available));

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify(true);
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify(false);
  });
}

export const isInstallPromptAvailable = (): boolean => deferredPrompt !== null;

/** S'abonne à la disponibilité du prompt natif. Retourne la fonction de désabonnement. */
export const onInstallPromptChange = (listener: (available: boolean) => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Déclenche la fenêtre d'installation native. Retourne true si l'utilisateur a accepté. */
export const promptInstall = async (): Promise<boolean> => {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  notify(false);
  return outcome === 'accepted';
};

/** L'app tourne-t-elle déjà depuis l'écran d'accueil ? */
export const isStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
};

export const detectPlatform = (): Platform => {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  // iPadOS 13+ se présente comme un Mac : on le distingue au tactile
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
};

/** Sur iOS, l'ajout à l'écran d'accueil n'est possible que depuis Safari. */
export const isIOSSafari = (): boolean => {
  if (detectPlatform() !== 'ios') return false;
  const ua = navigator.userAgent;
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
};
