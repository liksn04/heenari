import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './heenari.css';
import App from './App';
import { registerServiceWorker } from './heenari/pwa/serviceWorker';
import { listenForInstallPrompt } from './heenari/pwa/installPrompt';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void registerServiceWorker();
listenForInstallPrompt();
