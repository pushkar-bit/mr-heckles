/**
 * @file main.jsx
 * @description Mr. Heckles — React entry point.
 * ClerkProvider wraps the entire app to make Clerk auth hooks available globally.
 */

import React       from 'react';
import ReactDOM    from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import App         from './App.jsx';
import './index.css';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error(
    '[Mr. Heckles] Missing VITE_CLERK_PUBLISHABLE_KEY in frontend/.env\n' +
    'Add: VITE_CLERK_PUBLISHABLE_KEY=pk_test_...'
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/login">
      <App />
    </ClerkProvider>
  </React.StrictMode>
);
