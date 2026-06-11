/**
 * @file propertySync.routes.js
 * @description Express router for the Wi-Fi IP-Sync onboarding pipeline.
 *
 * Registered routes (mount at /api/properties in server.js):
 *
 *   POST /api/properties/sync
 *     → Auto-detects the tenant's gateway IP and resolves the property.
 *
 *   POST /api/properties/sync-code
 *     → Manual fallback: resolves the property by a 4-char alphanumeric code.
 *
 * Middleware stack applied per route:
 *   requireAuth      — JWT / session guard (tenant must be logged in)
 *   requireRole      — Restricts endpoint to the 'tenant' role only
 *   syncRateLimiter  — Abuse protection (max 10 sync attempts per 15 min)
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { syncByIP, syncByCode } from '../controllers/propertySync.controller.js';

// ─────────────────────────────────────────────────────────────
//  Placeholder Auth Middleware (replace with your real impl)
// ─────────────────────────────────────────────────────────────

/**
 * requireAuth
 * Validates the Bearer JWT from the Authorization header.
 * On success, attaches the decoded payload to `req.user`.
 *
 * NOTE: Replace this stub with your actual JWT / session guard.
 *       The controller logic is auth-implementation-agnostic.
 */
const requireAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  }
  // TODO: verify JWT and attach decoded payload →  req.user = decodedPayload;
  next();
};

/**
 * requireRole(...roles)
 * Factory that returns a middleware enforcing role-based access.
 * Expects `req.user.role` to be set by `requireAuth`.
 *
 * @param  {...string} roles  — Allowed roles (e.g. 'tenant', 'landlord')
 * @returns {import('express').RequestHandler}
 */
const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthenticated.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. This endpoint is restricted to: ${roles.join(', ')}.`,
      });
    }
    next();
  };

// ─────────────────────────────────────────────────────────────
//  Rate Limiter: Sync Endpoints
// ─────────────────────────────────────────────────────────────

/**
 * Protects both sync routes from automated hammering.
 * Allows a maximum of 10 sync attempts per 15-minute sliding window
 * per IP address. Returns a standardised JSON error on limit breach.
 */
const syncRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,  // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,   // Disable the deprecated `X-RateLimit-*` headers
  keyGenerator: (req) => {
    // Key by authenticated user ID (if available) rather than raw IP,
    // so shared NATs / office networks are not penalised collectively.
    return req.user?.id ?? req.ip;
  },
  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message:
        'Too many sync attempts. Please wait 15 minutes before trying again.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000), // Unix timestamp
    });
  },
});

// ─────────────────────────────────────────────────────────────
//  Router Definition
// ─────────────────────────────────────────────────────────────

const router = Router();

/**
 * POST /api/properties/sync
 *
 * Middleware chain:
 *   requireAuth  →  requireRole('tenant')  →  syncRateLimiter  →  syncByIP
 *
 * No request body is needed; the client IP is inferred from request headers.
 */
router.post(
  '/sync',
  requireAuth,
  requireRole('tenant'),
  syncRateLimiter,
  syncByIP
);

/**
 * POST /api/properties/sync-code
 *
 * Middleware chain:
 *   requireAuth  →  requireRole('tenant')  →  syncRateLimiter  →  syncByCode
 *
 * Expected JSON body:
 *   { "propertyCode": "AB3X" }
 */
router.post(
  '/sync-code',
  requireAuth,
  requireRole('tenant'),
  syncRateLimiter,
  syncByCode
);

export default router;
