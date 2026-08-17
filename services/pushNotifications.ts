import { supabase } from './supabase';

export type PushSetupResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | 'not-supported'
        | 'not-installed'
        | 'not-signed-in'
        | 'permission-denied'
        | 'subscription-failed'
        | 'server-error';
      message: string;
    };

export type PushTestResult = { ok: true } | { ok: false; message: string };

interface PushConfigResponse {
  publicKey?: string;
}

interface PushSubscriptionJson {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

const toApplicationServerKey = (value: string): Uint8Array => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + padding;
  const binary = window.atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const asPushJson = (subscription: PushSubscription): PushSubscriptionJson | null => {
  const raw = subscription.toJSON();
  if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys.auth) return null;
  return {
    endpoint: raw.endpoint,
    keys: { p256dh: raw.keys.p256dh, auth: raw.keys.auth },
  };
};

export const isPushSupported = (): boolean =>
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window;

/**
 * iOS n'accepte les push que pour une app ajoutée à l'écran d'accueil. Le test
 * reste volontairement indicatif : les navigateurs qui ne l'exposent pas doivent
 * pouvoir tenter l'abonnement, ce sera le navigateur qui donnera le refus précis.
 */
export const isLikelyInstalledPwa = (): boolean => {
  if (typeof window === 'undefined') return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true;
};

const invoke = async <T>(body: Record<string, unknown>): Promise<{ data: T | null; message?: string }> => {
  if (!supabase) return { data: null, message: 'Supabase n’est pas configuré.' };
  const { data, error } = await supabase.functions.invoke('push', { body });
  if (!error) return { data: data as T, message: undefined };

  // functions.invoke garde parfois la réponse JSON côté transport. Le texte de
  // secours reste volontairement générique : aucune erreur serveur ne doit devenir
  // une consigne affichée telle quelle à l'utilisateur.
  return { data: null, message: 'Le serveur de notifications ne répond pas.' };
};

export const enablePushNotifications = async (): Promise<PushSetupResult> => {
  if (!supabase) return { ok: false, code: 'server-error', message: 'Synchronisation indisponible.' };
  if (!isPushSupported()) {
    return {
      ok: false,
      code: 'not-supported',
      message: 'Ce navigateur ne prend pas en charge les rappels push.',
    };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return { ok: false, code: 'not-signed-in', message: 'Connecte-toi pour activer les rappels.' };
  }

  // Cette demande doit venir directement d'un clic : iOS la bloque sinon.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      code: 'permission-denied',
      message: 'Les notifications sont bloquées dans les réglages de cet appareil.',
    };
  }

  const config = await invoke<PushConfigResponse>({ action: 'config' });
  const publicKey = config.data?.publicKey;
  if (!publicKey) return { ok: false, code: 'server-error', message: config.message || 'Rappels indisponibles.' };

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toApplicationServerKey(publicKey),
      });
    }

    const payload = asPushJson(subscription);
    if (!payload) {
      await subscription.unsubscribe();
      return { ok: false, code: 'subscription-failed', message: 'Cet appareil a renvoyé un abonnement incomplet.' };
    }

    const saved = await invoke<{ ok?: boolean }>({ action: 'subscribe', subscription: payload });
    if (!saved.data?.ok) {
      await subscription.unsubscribe();
      return { ok: false, code: 'server-error', message: saved.message || 'Impossible d’enregistrer cet appareil.' };
    }
    return { ok: true };
  } catch (error) {
    console.warn('[Push] Abonnement navigateur échoué', error);
    return {
      ok: false,
      code: 'subscription-failed',
      message: 'Impossible d’activer les rappels sur cet appareil.',
    };
  }
};

/** Envoie un vrai push depuis le serveur, seulement aux appareils du compte connecté. */
export const testPushNotification = async (): Promise<PushTestResult> => {
  if (!supabase || !isPushSupported()) {
    return { ok: false, message: 'Les notifications ne sont pas disponibles sur cet appareil.' };
  }
  const result = await invoke<{ ok?: boolean }>({ action: 'test' });
  if (result.data?.ok) return { ok: true };
  return { ok: false, message: result.message || 'Impossible d’envoyer la notification de test.' };
};

export const disablePushNotifications = async (): Promise<boolean> => {
  if (!supabase || !isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;
    const endpoint = subscription.endpoint;
    const saved = await invoke<{ ok?: boolean }>({ action: 'unsubscribe', endpoint });
    if (!saved.data?.ok) return false;
    return subscription.unsubscribe();
  } catch (error) {
    console.warn('[Push] Désabonnement navigateur échoué', error);
    return false;
  }
};
