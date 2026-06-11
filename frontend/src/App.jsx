/**
 * @file App.jsx
 * @description Root router — maps paths to pages, protects /dashboard.
 * Uses Clerk for sign-in/sign-up UI (replaces custom Login/Register pages).
 */

import React           from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SignIn, SignUp } from '@clerk/clerk-react';
import { AuthProvider, useAuth }  from './context/AuthContext.jsx';
import Dashboard from './pages/Dashboard.jsx';

// ── Loading screen ─────────────────────────────────────────────
const LoadingScreen = () => (
  <div style={{
    width: '100%', height: '100%',
    background: '#0A0A0A',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    <span style={{
      fontFamily: "'Inter', sans-serif",
      fontSize: '9px', letterSpacing: '0.45em', textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.2)',
    }}>
      Initialising…
    </span>
  </div>
);

// ── Clerk-styled container for centered auth pages ─────────────
const ClerkPage = ({ children }) => (
  <div style={{
    width: '100%', height: '100%',
    background: '#0A0A0A',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    {children}
  </div>
);

// ── Protected Route wrapper ────────────────────────────────────
const Protected = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  return isAuthenticated ? children : <Navigate to="/sign-in" replace />;
};

// ── Public Route wrapper (redirect to dashboard if signed in) ──
const Public = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : children;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Navigate to="/sign-in" replace />} />

    {/* Clerk's pre-built Sign In UI */}
    <Route path="/sign-in/*" element={
      <Public>
        <ClerkPage>
          <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
        </ClerkPage>
      </Public>
    } />

    {/* Clerk's pre-built Sign Up UI */}
    <Route path="/sign-up/*" element={
      <Public>
        <ClerkPage>
          <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
        </ClerkPage>
      </Public>
    } />

    {/* Legacy redirects so old links don't break */}
    <Route path="/login"    element={<Navigate to="/sign-in" replace />} />
    <Route path="/register" element={<Navigate to="/sign-up" replace />} />

    {/* Protected dashboard */}
    <Route path="/dashboard" element={
      <Protected><Dashboard /></Protected>
    } />

    {/* Catch-all */}
    <Route path="*" element={<Navigate to="/sign-in" replace />} />
  </Routes>
);

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </AuthProvider>
);

export default App;
