import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { StoreProvider } from './lib/store.jsx';
import './styles.css';
import dhaLogo from './assets/dha-logo.jpg?inline';
import { startStackTables } from './lib/stackTables.js';

const fav = document.getElementById('favicon');
if (fav) fav.href = dhaLogo;
startStackTables();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </React.StrictMode>
);
