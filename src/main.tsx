import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applyCoupleBranding, registerCoupleServiceWorker } from './utils/coupleBrand';

applyCoupleBranding();
registerCoupleServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
