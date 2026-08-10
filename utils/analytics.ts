/**
 * Analytics chargés à la demande : `react-ga4` et `posthog-js` ne sont téléchargés
 * qu'après le consentement de l'utilisateur (appel à `initAnalytics`), et non dans
 * le bundle initial.
 */

type ReactGA = typeof import('react-ga4').default;
type PostHog = typeof import('posthog-js').default;

let ga: ReactGA | null = null;
let posthog: PostHog | null = null;
let initPromise: Promise<void> | null = null;

// --- INITIALISATION ---

/**
 * Initialise les outils d'analytics uniquement si l'utilisateur a donné son consentement.
 * À appeler après le clic sur "Accepter" ou si le consentement est déjà stocké.
 * Idempotent : les appels suivants réutilisent la même promesse.
 */
export const initAnalytics = (): Promise<void> => {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // 1. Google Analytics 4
    const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;
    if (GA_ID) {
      try {
        ga = (await import('react-ga4')).default;
        if (!ga.isInitialized) ga.initialize(GA_ID);
      } catch {
        ga = null;
      }
    }

    // 2. PostHog
    const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
    const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST;
    if (POSTHOG_KEY) {
      try {
        posthog = (await import('posthog-js')).default;
        // Vérifie si PostHog n'est pas déjà chargé
        if (!(window as { posthog?: { __loaded?: boolean } }).posthog?.__loaded) {
          posthog.init(POSTHOG_KEY, {
            api_host: POSTHOG_HOST,
            capture_pageview: false, // SPA : géré manuellement
            persistence: 'localStorage',
          });
        }
      } catch {
        posthog = null;
      }
    }
  })();

  return initPromise;
};

// --- TRACKING ---

/**
 * Envoie un événement de tracking à GA4 et PostHog de manière sécurisée.
 * No-op tant que `initAnalytics` n'a pas été appelé (pas de consentement).
 * @param category La catégorie (ex: 'Movie', 'User')
 * @param action L'action (ex: 'Add', 'Rate')
 * @param label (Optionnel) Détails
 * @param value (Optionnel) Valeur numérique
 */
export const trackEvent = (category: string, action: string, label?: string, value?: number) => {
  try {
    // GA4 Event - Seulement si initialisé
    if (ga?.isInitialized) {
      ga.event({
        category,
        action,
        label,
        value,
      });
    }

    // PostHog Event - Seulement si opt-in
    if (posthog?.has_opted_in_capturing()) {
      posthog.capture(action, {
        category,
        label,
        value,
      });
    }
  } catch (error) {
    // Silence
  }
};

/**
 * Track une vue de page virtuelle (adapté pour SPA sans routeur)
 * No-op tant que `initAnalytics` n'a pas été appelé (pas de consentement).
 * @param pageName Le nom de la vue (ex: 'Feed', 'Analytics')
 */
export const trackPageView = (pageName: string) => {
  try {
    const path = `/${pageName.toLowerCase()}`;

    // GA4 Pageview
    if (ga?.isInitialized) {
      ga.send({ hitType: 'pageview', page: path, title: pageName });
    }

    // PostHog Pageview
    if (posthog?.has_opted_in_capturing()) {
      posthog.capture('$pageview', {
        $current_url: window.location.origin + path,
      });
    }
  } catch (error) {
    // Silence
  }
};
