import React from 'react';
import { createRoot } from 'react-dom/client';
import { DirectionProvider } from '@radix-ui/react-direction';
import App from './App';
import './index.css';
import { registerServiceWorker } from './lib/pwa';
import { initTheme } from './lib/theme';

// Before the first render, not in an effect: applying the saved theme after
// React paints shows a flash of the light palette on a dark phone.
initTheme();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DirectionProvider dir="rtl">
      <App />
    </DirectionProvider>
  </React.StrictMode>
);

registerServiceWorker();
