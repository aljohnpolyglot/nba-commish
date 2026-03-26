import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { Defense2KService } from './services/Defense2KService';

const BUILD_TIME = new Date().toISOString();
const BUILD_VERSION = import.meta.env.VITE_APP_VERSION || 'dev';

// Load 2K defensive ratings at startup (non-blocking)
Defense2KService.initialize();

console.log(`%c🏀 BasketCommissionerSim`, 'font-size:16px;font-weight:bold;color:#6366f1');
console.log(`%cVersion: ${BUILD_VERSION} | Built: ${BUILD_TIME}`, 'color:#94a3b8');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
