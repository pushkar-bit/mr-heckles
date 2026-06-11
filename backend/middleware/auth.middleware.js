/**
 * @file auth.middleware.js
 * @description Mr. Heckles — Clerk-powered authentication middleware.
 *
 * replaces the old jsonwebtoken-based requireAuth with Clerk's
 * official @clerk/express middleware stack.
 *
 * Usage in server.js:
 *   import { clerkMiddleware } from './middleware/auth.middleware.js';
 *   app.use(clerkMiddleware());          // global — makes auth available on every request
 *
 * Usage in route handlers:
 *   import requireAuth from './middleware/auth.middleware.js';
 *   router.get('/me', requireAuth, handler);
 *
 * After requireAuth, downstream handlers can access:
 *   req.auth.userId   — Clerk user ID (e.g. "user_2abc...")
 *   req.auth.sessionId
 */

import { clerkMiddleware, getAuth } from '@clerk/express';

// ─────────────────────────────────────────────────────────────
//  Global Clerk middleware
//  Register this on the Express app (not per-route).
//  It parses the Clerk session token from Authorization header or
//  __session cookie and attaches auth state to req.auth.
//  Does NOT block unauthenticated requests — use requireAuth for that.
// ─────────────────────────────────────────────────────────────
export { clerkMiddleware };

// ─────────────────────────────────────────────────────────────
//  requireAuth — per-route guard
//  Blocks requests where Clerk hasn't verified a valid session.
//  Attach after clerkMiddleware() has run globally.
// ─────────────────────────────────────────────────────────────
const requireAuth = (req, res, next) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please sign in to continue.',
    });
  }

  // Expose userId so downstream handlers don't need to call getAuth again
  req.clerkUserId = userId;
  next();
};

export default requireAuth;
