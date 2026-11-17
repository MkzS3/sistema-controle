import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.js';
import { AuthSessionProvider } from './app/auth/session.js';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element was not found.');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <AuthSessionProvider><App /></AuthSessionProvider>
  </React.StrictMode>,
);
