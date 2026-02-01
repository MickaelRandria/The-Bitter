
import ReactGA from 'react-ga4';
import posthog from 'posthog-js';

// --- INITIALISATION ---

/**
 * Initialise les outils d'analytics uniquement si l'utilisateur a donné son consentement.
 * À appeler après le clic sur "Accepter" ou si le consentement est déjà stocké.
 */
export const initAnalytics = () => {
  // 1. Google Analytics 4
  const GA_ID = import.meta.env?.VITE_GA_MEASUREMENT_ID;
  if (GA_ID && !ReactGA.isInitialized) {
    ReactGA.initialize(GA_ID);
  }

  // 2. PostHog
  const POSTHOG_KEY = import.meta.env?.VITE_POSTHOG_KEY;
  const POSTHOG_HOST = import.meta.env?.VITE_POSTHOG_HOST;

  if (POSTHOG_KEY) {
    // Vérifie si PostHog n'est pas déjà chargé
    // @ts-ignore
    if (!window.posthog?.__loaded) {
        posthog.init(POSTHOG_KEY, {
            api_host: POSTHOG_HOST,
            capture_pageview: false, // SPA : géré manuellement
            persistence: 'localStorage' 
        });
    }
  }
};

// --- TRACKING ---

/**
 * Envoie un événement de tracking à GA4 et PostHog de manière sécurisée.
 * @param category La catégorie (ex: 'Movie', 'User')
 * @param action L'action (ex: 'Add', 'Rate')
 * @param label (Optionnel) Détails
 * @param value (Optionnel) Valeur numérique
 */
export const trackEvent = (category: string, action: string, label?: string, value?: number) => {
  try {
    // GA4 Event - Seulement si initialisé
    if (ReactGA.isInitialized) {
      ReactGA.event({
        category,
        action,
        label,
        value
      });
    }

    // PostHog Event - Seulement si opt-in
    if (posthog.has_opted_in_capturing()) {
        posthog.capture(action, {
        category,
        label,
        value
        });
    }
  } catch (error) {
    // Silence
  }
};

/**
 * Track une vue de page virtuelle (adapté pour SPA sans routeur)
 * @param pageName Le nom de la vue (ex: 'Feed', 'Analytics')
 */
export const trackPageView = (pageName: string) => {
  try {
    const path = `/${pageName.toLowerCase()}`;
    
    // GA4 Pageview
    if (ReactGA.isInitialized) {
      ReactGA.send({ hitType: "pageview", page: path, title: pageName });
    }

    // PostHog Pageview
    if (posthog.has_opted_in_capturing()) {
        posthog.capture('$pageview', {
        $current_url: window.location.origin + path
        });
    }
  } catch (error) {
    // Silence
  }
};
