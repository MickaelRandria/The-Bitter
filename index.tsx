import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
// Doit être importé tôt : Chrome émet `beforeinstallprompt` juste après le chargement
import './utils/pwaInstall';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import UpdateGate from './components/UpdateGate';
import { installUpdateWatch } from './utils/appUpdate';

// Avant le premier rendu : une nouvelle version doit s'annoncer, pas planter.
installUpdateWatch();
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <LanguageProvider>
      <ThemeProvider>
        {/* Frontière de dernier recours : un écran chargé à la demande qui manque
            après une mise à jour, hors de la zone principale (une modale), y arrive. */}
        <ErrorBoundary where="Application">
          <App />
        </ErrorBoundary>
        <UpdateGate />
      </ThemeProvider>
    </LanguageProvider>
  </React.StrictMode>
);
