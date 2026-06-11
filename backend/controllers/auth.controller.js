/**
 * @file auth.controller.js
 * @description Authentication controller: Register, Login, GetMe.
 *
 * Routes handled:
 *   POST /api/auth/register  — Create account, return JWT
 *   POST /api/auth/login     — Verify credentials, return JWT
 *   GET  /api/auth/me        — Return current user from token (protected)
 */

import jwt      from 'jsonwebtoken';
import User     from '../models/User.js';

// ─────────────────────────────────────────────────────────────
//  Utility: Sign JWT
// ─────────────────────────────────────────────────────────────

const signToken = (userId, role) =>
  jwt.sign(
    { id: userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' }
  );

/** Strips sensitive fields before sending user to client */
const sanitizeUser = (user) => ({
  id:       user._id,
  fullName: user.fullName,
  email:    user.email,
  role:     user.role,
  phone:    user.phone,
  details:  user.details,
});

// ─────────────────────────────────────────────────────────────
//  Register — POST /api/auth/register
// ─────────────────────────────────────────────────────────────

export const register = async (req, res) => {
  try {
    const { fullName, email, password, role, phone } = req.body;

    // ── Presence validation ────────────────────────────────
    const missing = [];
    if (!fullName) missing.push('fullName');
    if (!email)    missing.push('email');
    if (!password) missing.push('password');
    if (!role)     missing.push('role');

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required field(s): ${missing.join(', ')}.`,
        missing,
      });
    }

    // ── Role validation ────────────────────────────────────
    if (!['landlord', 'tenant'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Role must be "landlord" or "tenant".',
        field: 'role',
      });
    }

    // ── Password strength guard ────────────────────────────
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters.',
        field: 'password',
      });
    }

    // ── Duplicate email guard ──────────────────────────────
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.',
        field: 'email',
      });
    }

    // ── Create user ────────────────────────────────────────
    // The User pre-save hook will bcrypt-hash the passwordHash field.
    const user = await User.create({
      fullName: fullName.trim(),
      email:    email.toLowerCase().trim(),
      passwordHash: password,   // pre-save hook hashes this
      role,
      phone: phone ?? null,
    });

    // ── Issue JWT ──────────────────────────────────────────
    const token = signToken(user._id, user.role);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    // Mongoose validation errors
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({
        success: false,
        message: messages[0],
        errors:  messages,
      });
    }
    console.error('[auth.controller] register error:', err);
    return res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
  }
};

// ─────────────────────────────────────────────────────────────
//  Login — POST /api/auth/login
// ─────────────────────────────────────────────────────────────

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    // Fetch user WITH passwordHash (select: false by default)
    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .select('+passwordHash');

    // Generic message — do not reveal whether email exists
    const INVALID_MSG = 'Invalid email or password.';

    if (!user) {
      return res.status(401).json({ success: false, message: INVALID_MSG });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated. Please contact support.',
      });
    }

    const isMatch = await user.verifyPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: INVALID_MSG });
    }

    const token = signToken(user._id, user.role);

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error('[auth.controller] login error:', err);
    return res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
};

// ─────────────────────────────────────────────────────────────
//  Get Me — GET /api/auth/me  (protected)
// ─────────────────────────────────────────────────────────────

export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.status(200).json({
      success: true,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error('[auth.controller] getMe error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch user.' });
  }
};
