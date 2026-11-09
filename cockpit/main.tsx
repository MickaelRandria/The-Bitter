import React from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import CockpitApp from './CockpitApp';

createRoot(document.getElementById('cockpit')!).render(
  <React.StrictMode>
    <CockpitApp />
  </React.StrictMode>
);
