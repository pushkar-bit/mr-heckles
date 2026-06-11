/**
 * @file payment.controller.js
 * @description Mr. Heckles — Razorpay payment gateway integration.
 *
 * Endpoints:
 *   POST /api/payments/create-order   — Creates a Razorpay order for a room
 *   POST /api/payments/webhook        — Receives & verifies Razorpay webhook events
 *
 * Security contract:
 *   • Webhook route receives a raw Buffer body (configured in server.js via
 *     express.raw({ type: 'application/json' })) so that the HMAC-SHA256
 *     signature check is performed against the exact bytes Razorpay signed.
 *   • The computed signature is compared with the incoming
 *     `x-razorpay-signature` header using a constant-time comparison to
 *     prevent timing-based side-channel attacks.
 */

import crypto   from 'crypto';
import Razorpay from 'razorpay';
import Property from '../models/Property.js';
import { getIO } from '../config/socket.js';

// ─────────────────────────────────────────────────────────────
//  Razorpay client — initialised once at module load
// ─────────────────────────────────────────────────────────────

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ─────────────────────────────────────────────────────────────
//  POST /api/payments/create-order
//  Creates a Razorpay order for the given property room.
//
//  Body: { propertyId, roomNumber, floorNumber, amountInPaise }
//  Returns: { orderId, currency, amount, keyId }
// ─────────────────────────────────────────────────────────────

export const createOrder = async (req, res) => {
  try {
    const { propertyId, roomNumber, floorNumber, amountInPaise } = req.body;

    if (!propertyId || !roomNumber || floorNumber === undefined || !amountInPaise) {
      return res.status(400).json({
        success: false,
        message: 'propertyId, roomNumber, floorNumber, and amountInPaise are required.',
      });
    }

    // Validate the property & room exist before creating an order
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found.' });
    }

    const unit = property.findUnit(floorNumber, roomNumber);
    if (!unit) {
      return res.status(404).json({
        success: false,
        message: `Room ${roomNumber} on floor ${floorNumber} not found.`,
      });
    }

    // Build Razorpay order
    // receipt is limited to 40 chars by Razorpay
    const receipt = `rcpt_${propertyId.slice(-6)}_${roomNumber}_${Date.now()}`.slice(0, 40);

    const order = await razorpay.orders.create({
      amount:   amountInPaise,          // smallest currency unit (paise)
      currency: 'INR',
      receipt,
      notes: {
        propertyId:  propertyId.toString(),
        roomNumber:  roomNumber.toUpperCase(),
        floorNumber: String(floorNumber),
      },
    });

    return res.status(201).json({
      success:  true,
      orderId:  order.id,
      currency: order.currency,
      amount:   order.amount,
      keyId:    process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('[payment] createOrder error:', err);
    return res.status(500).json({ success: false, message: 'Failed to create payment order.' });
  }
};

// ─────────────────────────────────────────────────────────────
//  POST /api/payments/webhook
//  Verifies Razorpay webhook signature and processes events.
//
//  ⚠️  req.body is a raw Buffer here (not a parsed object).
//      express.raw({ type: 'application/json' }) is registered in
//      server.js BEFORE the global express.json() middleware.
// ─────────────────────────────────────────────────────────────

export const handleWebhook = async (req, res) => {
  // ── 1. Signature verification ────────────────────────────────
  const incomingSignature = req.headers['x-razorpay-signature'];

  if (!incomingSignature) {
    return res.status(401).json({ success: false, message: 'Missing webhook signature.' });
  }

  // req.body is a Buffer — .toString() gives the exact string Razorpay signed
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));

  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  // Constant-time comparison — prevents timing attacks
  const sigBuffer      = Buffer.from(incomingSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  const isValid =
    sigBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(sigBuffer, expectedBuffer);

  if (!isValid) {
    console.warn('[payment] Webhook signature mismatch — request rejected.');
    return res.status(403).json({ success: false, message: 'Webhook signature invalid.' });
  }

  // ── 2. Parse the verified payload ───────────────────────────
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ success: false, message: 'Malformed webhook payload.' });
  }

  // ── 3. Route event type ──────────────────────────────────────
  console.log(`[payment] Webhook received: ${event.event}`);

  switch (event.event) {

    // ── order.paid ──────────────────────────────────────────────
    // Fired when a customer successfully completes payment.
    // Responsible for:
    //   a) Updating the unit ledger status → 'paid'
    //   b) Clearing outstanding utility alerts on the landlord's 3D grid
    //   c) Broadcasting a real-time Socket.io event to connected clients

    case 'order.paid': {
      await handleOrderPaid(event.payload);
      break;
    }

    default:
      // Acknowledge unhandled events gracefully — Razorpay expects 200
      console.log(`[payment] Unhandled event type: ${event.event} — acknowledged.`);
  }

  // Always respond 200 quickly so Razorpay doesn't retry
  return res.status(200).json({ success: true, received: true });
};

// ─────────────────────────────────────────────────────────────
//  Internal: handleOrderPaid
//  Runs after 'order.paid' webhook is verified.
//
//  Flow:
//    1. Extract room metadata from order notes
//    2. Find the property document in MongoDB
//    3. Locate the matching unit subdocument
//    4. Set ledger status → 'paid', clear utility alerts
//    5. Persist changes
//    6. Emit Socket.io event to landlord's room channel
// ─────────────────────────────────────────────────────────────

async function handleOrderPaid(payload) {
  const order = payload?.order?.entity;

  if (!order?.notes) {
    console.error('[payment:order.paid] Order payload missing notes — cannot resolve room.');
    return;
  }

  const { propertyId, roomNumber, floorNumber } = order.notes;

  if (!propertyId || !roomNumber || floorNumber === undefined) {
    console.error('[payment:order.paid] Incomplete notes metadata:', order.notes);
    return;
  }

  try {
    // Load property from MongoDB
    const property = await Property.findById(propertyId);

    if (!property) {
      console.error(`[payment:order.paid] Property ${propertyId} not found.`);
      return;
    }

    // Locate the unit within the unitsLayout subdocument array
    const unit = property.unitsLayout.find(
      (u) =>
        u.floorNumber === Number(floorNumber) &&
        u.roomNumber  === roomNumber.toUpperCase().trim()
    );

    if (!unit) {
      console.error(
        `[payment:order.paid] Unit ${roomNumber} (floor ${floorNumber}) not found in property ${propertyId}.`
      );
      return;
    }

    // ── a) Update ledger status ─────────────────────────────────
    unit.paymentStatus   = 'paid';
    unit.lastPaidAt      = new Date();
    unit.utilityAlerts   = [];   // clear any outstanding utility alert flags

    property.markModified('unitsLayout'); // tell Mongoose the array changed
    await property.save();

    console.log(
      `[payment:order.paid] ✅ Room ${roomNumber} (floor ${floorNumber}) in property ` +
      `${property.propertyName} marked as PAID. Order: ${order.id}`
    );

    // ── b) Broadcast real-time update to landlord's 3D grid ────
    //      Landlord clients join the room `property:<propertyId>` via Socket.io.
    //      The frontend Canvas3D component listens for 'payment:room-paid'
    //      to clear the utility alert indicator on the affected room node.
    try {
      const io = getIO();
      if (io) {
        io.to(`property:${propertyId}`).emit('payment:room-paid', {
          propertyId,
          roomNumber: roomNumber.toUpperCase(),
          floorNumber: Number(floorNumber),
          orderId:     order.id,
          paidAt:      unit.lastPaidAt.toISOString(),
        });
        console.log(`[payment:order.paid] Socket.io event emitted to property:${propertyId}`);
      }
    } catch (socketErr) {
      // Non-fatal — DB is already updated, only real-time push failed
      console.warn('[payment:order.paid] Socket.io emit failed (non-fatal):', socketErr.message);
    }

  } catch (err) {
    console.error('[payment:order.paid] Database update failed:', err);
  }
}
