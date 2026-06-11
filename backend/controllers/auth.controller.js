/**
 * @file auth.controller.js
 * @description Mr. Heckles — Clerk-integrated auth controller.
 *
 * With Clerk handling authentication (sign-up, sign-in, sessions, MFA),
 * this backend controller has a single responsibility:
 *
 *   POST /api/auth/sync  — Called by the frontend after Clerk sign-in.
 *                          Upserts the Clerk user into MongoDB with their
 *                          chosen application role (landlord | tenant).
 *
 *   GET  /api/auth/me    — Returns the MongoDB profile for the signed-in
 *                          Clerk user. Creates a stub profile if none exists.
 *
 * Flow:
 *   1. User signs in via Clerk (frontend handles entirely)
 *   2. Frontend calls POST /api/auth/sync with { role } in body
 *   3. Clerk JWT is verified by clerkMiddleware in server.js
 *   4. This controller reads req.clerkUserId (set by requireAuth)
 *   5. Upserts a User document in MongoDB linked by clerkId
 *   6. Returns the MongoDB user profile
 */

import { clerkClient } from '@clerk/express';
import User from '../models/User.js';

// ─────────────────────────────────────────────────────────────
//  Utility: sanitize user for API response
// ─────────────────────────────────────────────────────────────
const sanitizeUser = (user) => ({
  id:       user._id,
  clerkId:  user.clerkId,
  fullName: user.fullName,
  email:    user.email,
  role:     user.role,
  phone:    user.phone,
  details:  user.details,
  isActive: user.isActive,
  createdAt: user.createdAt,
});

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/sync   (protected — requireAuth)
//  Upserts the Clerk user into MongoDB.
//  Called once after first sign-in (or to update role).
// ─────────────────────────────────────────────────────────────
export const syncUser = async (req, res) => {
  try {
    const clerkUserId = req.clerkUserId;  // set by requireAuth middleware
    const { role, phone } = req.body;

    // ── Role validation ────────────────────────────────────
    if (role && !['landlord', 'tenant'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Role must be "landlord" or "tenant".',
        field: 'role',
      });
    }

    // ── Fetch Clerk profile for name + email ───────────────
    const clerkUser = await clerkClient.users.getUser(clerkUserId);

    const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ')
      || clerkUser.username
      || 'Mr. Heckles User';

    const email = clerkUser.emailAddresses?.[0]?.emailAddress ?? null;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Clerk account has no verified email address.',
      });
    }

    // ── Upsert MongoDB user document ───────────────────────
    // On first sync: create with role.
    // On subsequent syncs: update name/email but do NOT overwrite existing role
    // unless a new role is explicitly provided.
    const update = {
      fullName,
      email,
      ...(role   ? { role }  : {}),
      ...(phone  ? { phone } : {}),
    };

    const user = await User.findOneAndUpdate(
      { clerkId: clerkUserId },
      { $set: update, $setOnInsert: { clerkId: clerkUserId, role: role ?? 'tenant' } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      message: 'User profile synced successfully.',
      user: sanitizeUser(user),
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages[0], errors: messages });
    }
    console.error('[auth.controller] syncUser error:', err);
    return res.status(500).json({ success: false, message: 'Failed to sync user profile.' });
  }
};

// ─────────────────────────────────────────────────────────────
//  GET /api/auth/me   (protected — requireAuth)
//  Returns the MongoDB profile for the authenticated Clerk user.
// ─────────────────────────────────────────────────────────────
export const getMe = async (req, res) => {
  try {
    const clerkUserId = req.clerkUserId;

    const user = await User.findOne({ clerkId: clerkUserId });

    if (!user) {
      // Profile doesn't exist yet — frontend should call /api/auth/sync first
      return res.status(404).json({
        success: false,
        message: 'User profile not found. Please complete onboarding.',
        code: 'PROFILE_NOT_FOUND',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated. Please contact support.',
      });
    }

    return res.status(200).json({
      success: true,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error('[auth.controller] getMe error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch user profile.' });
  }
};
