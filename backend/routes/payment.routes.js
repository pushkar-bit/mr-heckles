/**
 * @file payment.routes.js
 * @description Mr. Heckles — Razorpay payment route definitions.
 *
 * Routes:
 *   POST /api/payments/create-order  — Protected: creates a Razorpay order
 *   POST /api/payments/webhook       — Public: Razorpay webhook receiver
 *                                      (body is raw Buffer — see server.js)
 */

import { Router } from 'express';
import { createOrder, handleWebhook } from '../controllers/payment.controller.js';
import requireAuth from '../middleware/auth.middleware.js';

const router = Router();

// Protected — tenant or landlord must be authenticated to initiate payment
router.post('/create-order', requireAuth, createOrder);

// Public — Razorpay posts directly to this endpoint from their servers.
// Do NOT add requireAuth here — the request comes from Razorpay, not the browser.
// Security is enforced via HMAC-SHA256 signature verification inside handleWebhook.
router.post('/webhook', handleWebhook);

export default router;
