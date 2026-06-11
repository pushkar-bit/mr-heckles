/**
 * @file auth.routes.js
 * @description Mr. Heckles — Clerk-integrated auth routes.
 *
 * Clerk handles sign-up / sign-in on the frontend.
 * These routes manage the MongoDB side of the user profile.
 *
 *   POST /api/auth/sync  — Upsert Clerk user into MongoDB (call after sign-in)
 *   GET  /api/auth/me    — Return MongoDB profile for signed-in Clerk user
 */

import { Router }  from 'express';
import requireAuth from '../middleware/auth.middleware.js';
import { syncUser, getMe } from '../controllers/auth.controller.js';

const router = Router();

// Upsert MongoDB profile from Clerk identity
// Body: { role: 'landlord' | 'tenant', phone?: string }
router.post('/sync', requireAuth, syncUser);

// Get current user's MongoDB profile
router.get('/me', requireAuth, getMe);

export default router;
