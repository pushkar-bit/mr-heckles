/**
 * @file AuthContext.jsx
 * @description Mr. Heckles — Auth context powered by Clerk.
 *
 * Wraps Clerk's useUser/useAuth hooks and exposes a unified interface
 * that the rest of the app (Dashboard, Protected routes, etc.) already
 * depends on via `useAuth()`.
 *
 * Exposes:
 *   isAuthenticated  — true when Clerk session is active
 *   isLoading        — true while Clerk is bootstrapping
 *   user             — MongoDB profile ({ id, fullName, email, role, ... })
 *   role             — 'landlord' | 'tenant' | null
 *   token            — Clerk session token (for Authorization: Bearer headers)
 *   getToken()       — async fn to get a fresh Clerk token
 *   logout()         — signs out via Clerk
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  useUser,
  useAuth    as useClerkAuth,
  useClerk,
} from '@clerk/clerk-react';

const AuthContext = createContext(null);

const API = import.meta.env.VITE_API_BASE_URL ?? '';

export const AuthProvider = ({ children }) => {
  const { isLoaded: clerkLoaded, isSignedIn, user: clerkUser } = useUser();
  const { getToken }  = useClerkAuth();
  const { signOut }   = useClerk();

  // MongoDB user profile (fetched / synced after Clerk confirms identity)
  const [dbUser,    setDbUser]    = useState(null);
  const [syncing,   setSyncing]   = useState(false);
  const [syncError, setSyncError] = useState(null);

  // ── Sync Clerk identity → MongoDB profile ────────────────────
  // Called automatically when Clerk signals the user is signed in.
  const syncProfile = useCallback(async () => {
    if (!isSignedIn || !clerkUser) return;
    setSyncing(true);
    setSyncError(null);

    try {
      const token = await getToken();

      // First check if profile exists
      const meRes  = await fetch(`${API}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (meRes.ok) {
        const { user } = await meRes.json();
        setDbUser(user);
        return;
      }

      // Profile not found (404) — needs onboarding sync
      // We sync with a default role of 'tenant'; the onboarding flow
      // lets the user pick their actual role before reaching Dashboard.
      if (meRes.status === 404) {
        const syncRes = await fetch(`${API}/api/auth/sync`, {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ role: 'tenant' }), // default; overridden in onboarding
        });

        if (syncRes.ok) {
          const { user } = await syncRes.json();
          setDbUser(user);
        }
      }
    } catch (err) {
      console.error('[AuthContext] syncProfile error:', err);
      setSyncError(err.message);
    } finally {
      setSyncing(false);
    }
  }, [isSignedIn, clerkUser, getToken]);

  // Sync once when Clerk confirms sign-in
  useEffect(() => {
    if (clerkLoaded && isSignedIn) {
      syncProfile();
    } else if (clerkLoaded && !isSignedIn) {
      setDbUser(null); // clear on sign-out
    }
  }, [clerkLoaded, isSignedIn, syncProfile]);

  // ── getToken — for Authorization headers in API calls ────────
  const token = useCallback(async () => {
    try { return await getToken(); }
    catch { return null; }
  }, [getToken]);

  // ── logout ───────────────────────────────────────────────────
  const logout = useCallback(async () => {
    setDbUser(null);
    await signOut();
  }, [signOut]);

  // ── updateRole — call /api/auth/sync with explicit role ──────
  const updateRole = useCallback(async (role) => {
    const t = await getToken();
    const res = await fetch(`${API}/api/auth/sync`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      const { user } = await res.json();
      setDbUser(user);
      return user;
    }
    throw new Error('Failed to update role.');
  }, [getToken]);

  const value = useMemo(() => ({
    // Clerk-derived
    isLoading:       !clerkLoaded || syncing,
    isAuthenticated: !!isSignedIn && !!dbUser,
    clerkUser,

    // MongoDB-derived
    user:   dbUser,
    role:   dbUser?.role ?? null,

    // Helpers
    getToken: token,      // async () => string
    logout,
    updateRole,
    syncError,
  }), [clerkLoaded, syncing, isSignedIn, dbUser, clerkUser, token, logout, updateRole, syncError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/** Convenience hook */
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
};

export default AuthContext;
