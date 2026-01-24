import ReactGA from 'react-ga4';
import posthog from 'posthog-js';

/**
 * Envoie un événement de tracking à GA4 et PostHog de manière sécurisée.
 * @param category La catégorie (ex: 'Movie', 'User')
 * @param action L'action (ex: 'Add', 'Rate')
 * @param label (Optionnel) Détails
 * @param value (Optionnel) Valeur numérique
 */
export const trackEvent = (category: string, action: string, label?: string, value?: number) => {
  try {
    // GA4 Event
    if (ReactGA.isInitialized) {
      ReactGA.event({
        category,
        action,
        label,
        value
      });
    }

    // PostHog Event
    posthog.capture(action, {
      category,
      label,
      value
    });
  } catch (error) {
    // On catch silencieusement pour ne jamais faire planter l'app à cause du tracking
    console.warn('Analytics trackEvent error:', error);
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
    posthog.capture('$pageview', {
      $current_url: window.location.origin + path
    });
  } catch (error) {
    console.warn('Analytics trackPageView error:', error);
  }
};