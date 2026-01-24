import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ReactGA from 'react-ga4';
import posthog from 'posthog-js';

// Explicitly define ImportMeta for environments where vite/client types are missing
declare global {
  interface ImportMeta {
    env: Record<string, string | undefined>;
  }
}

// --- INITIALISATION ANALYTICS ---

// 1. Google Analytics 4
// Utilisation de l'opérateur ?. pour éviter le crash si import.meta.env est undefined
const GA_ID = import.meta.env?.VITE_GA_MEASUREMENT_ID;
if (GA_ID) {
  ReactGA.initialize(GA_ID);
}

// 2. PostHog
const POSTHOG_KEY = import.meta.env?.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env?.VITE_POSTHOG_HOST;

if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false, // Désactivé car géré manuellement dans App.tsx
    persistence: 'localStorage' 
  });
}

// --- RENDU APP ---

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);