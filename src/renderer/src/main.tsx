import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Design system CSS is the very first import — it owns all CSS variables.
import '../styles/design-system.css';
import './index.css';
import { AppearanceProvider } from './context/AppearanceContext';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppearanceProvider>
      <App />
    </AppearanceProvider>
  </React.StrictMode>,
);
