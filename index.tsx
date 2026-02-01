
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Explicitly define ImportMeta for environments where vite/client types are missing
declare global {
  interface ImportMeta {
    env: Record<string, string | undefined>;
  }
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
