/**
 * @file propertySync.controller.js
 * @description Wi-Fi IP-Sync onboarding controller for Mr. Heckles.
 *
 * Exposes two core handlers:
 *   1. syncByIP      — POST /api/properties/sync
 *      Extracts the client's public gateway IP (proxy-aware), matches it
 *      against `registeredPublicIP` in the Property collection, and returns
 *      the full property matrix on success or a structured 404 fallback.
 *
 *   2. syncByCode    — POST /api/properties/sync-code
 *      Accepts a 4-character alphanumeric `propertyCode` submitted manually
 *      by the tenant when the IP lookup fails (ISP rotation / dynamic IP).
 */

import Property from '../models/Property.js';

// ─────────────────────────────────────────────────────────────
//  Utility: Proxy-Aware IP Extractor
// ─────────────────────────────────────────────────────────────

/**
 * Resolves the real client public IP from the incoming request, respecting
 * standard reverse-proxy headers set by Nginx, Cloudflare, or AWS ALB.
 *
 * Resolution priority (first non-empty value wins):
 *   1. x-forwarded-for  — may be a CSV list; we take the FIRST (origin) IP
 *   2. x-real-ip        — set by Nginx `proxy_set_header X-Real-IP`
 *   3. cf-connecting-ip — set by Cloudflare
 *   4. socket.remoteAddress — raw TCP peer (fallback for direct connections)
 *
 * @param {import('express').Request} req
 * @returns {string|null} Resolved IP string or null if unresolvable.
 */
const extractClientIP = (req) => {
  // 1. x-forwarded-for: "clientIP, proxy1, proxy2"  →  take leftmost
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    const firstIP = xForwardedFor.split(',')[0].trim();
    if (firstIP) return firstIP;
  }

  // 2. x-real-ip (Nginx)
  const xRealIP = req.headers['x-real-ip'];
  if (xRealIP) return xRealIP.trim();

  // 3. cf-connecting-ip (Cloudflare)
  const cfConnectingIP = req.headers['cf-connecting-ip'];
  if (cfConnectingIP) return cfConnectingIP.trim();

  // 4. TCP socket fallback — may include IPv6 loopback prefix "::ffff:"
  const remoteAddress = req.socket?.remoteAddress ?? req.connection?.remoteAddress;
  if (remoteAddress) {
    // Normalise IPv4-mapped IPv6 addresses (e.g. "::ffff:127.0.0.1" → "127.0.0.1")
    return remoteAddress.replace(/^::ffff:/, '').trim();
  }

  return null;
};

// ─────────────────────────────────────────────────────────────
//  Utility: Safe Property Projection
// ─────────────────────────────────────────────────────────────

/**
 * Fields to include in the public-facing property response payload.
 * `registeredPublicIP` is intentionally excluded from the client response
 * to avoid leaking network topology data.
 */
const PROPERTY_PUBLIC_PROJECTION = {
  _id: 1,
  landlordId: 1,
  propertyName: 1,
  propertyType: 1,
  propertyCode: 1,
  totalFloors: 1,
  unitsLayout: 1,
  createdAt: 1,
  updatedAt: 1,
};

// ─────────────────────────────────────────────────────────────
//  Handler 1: Sync by IP  —  POST /api/properties/sync
// ─────────────────────────────────────────────────────────────

/**
 * Auto-detects the tenant's public gateway IP and looks it up against
 * registered properties. Returns the full property layout matrix on match.
 *
 * @route   POST /api/properties/sync
 * @access  Private (authenticated tenants)
 *
 * Success  200 — { success: true, method: 'ip', property: {...} }
 * Fallback 404 — { success: false, fallback: true, reason: '...', nextStep: 'code' }
 * Error    500 — { success: false, message: '...' }
 */
export const syncByIP = async (req, res) => {
  try {
    // ── Step 1: Extract IP ──────────────────────────────────
    const clientIP = extractClientIP(req);

    if (!clientIP) {
      return res.status(400).json({
        success: false,
        fallback: true,
        reason: 'Unable to determine your network IP address.',
        nextStep: 'code',
        message:
          'Your IP address could not be resolved. Please use your property code to continue.',
      });
    }

    // ── Step 2: Query MongoDB ───────────────────────────────
    // Uses the `idx_property_ip` index on `registeredPublicIP`
    const property = await Property.findOne(
      { registeredPublicIP: clientIP },
      PROPERTY_PUBLIC_PROJECTION
    )
      .populate('landlordId', 'fullName email phone') // surface landlord meta
      .lean();

    // ── Step 3a: Match found ────────────────────────────────
    if (property) {
      return res.status(200).json({
        success: true,
        method: 'ip',
        detectedIP: clientIP, // returned for client-side transparency
        property,
      });
    }

    // ── Step 3b: No match — structured fallback ─────────────
    return res.status(404).json({
      success: false,
      fallback: true,
      reason: 'ip_not_registered',
      detectedIP: clientIP,
      message:
        'No property is registered under your current network IP. ' +
        'This can happen due to ISP IP rotation or a mobile data connection.',
      nextStep: 'code',
      hint: 'Enter the 4-character property code provided by your landlord.',
    });
  } catch (error) {
    console.error('[propertySync.controller] syncByIP error:', error);
    return res.status(500).json({
      success: false,
      message: 'An internal server error occurred during IP sync. Please try again.',
    });
  }
};

// ─────────────────────────────────────────────────────────────
//  Handler 2: Sync by Code  —  POST /api/properties/sync-code
// ─────────────────────────────────────────────────────────────

/**
 * Accepts a manually entered 4-character alphanumeric `propertyCode` and
 * resolves the associated property. Serves as the fallback when IP sync fails.
 *
 * @route   POST /api/properties/sync-code
 * @access  Private (authenticated tenants)
 *
 * Request Body: { "propertyCode": "AB3X" }
 *
 * Success  200 — { success: true, method: 'code', property: {...} }
 * Invalid  400 — { success: false, message: '...' }
 * NotFound 404 — { success: false, message: '...' }
 * Error    500 — { success: false, message: '...' }
 */
export const syncByCode = async (req, res) => {
  try {
    // ── Step 1: Extract & Validate propertyCode ─────────────
    const { propertyCode } = req.body;

    if (!propertyCode) {
      return res.status(400).json({
        success: false,
        message: 'Property code is required.',
        field: 'propertyCode',
      });
    }

    const sanitisedCode = String(propertyCode).trim().toUpperCase();

    // Enforce: exactly 4 alphanumeric characters
    const CODE_REGEX = /^[A-Z0-9]{4}$/;
    if (!CODE_REGEX.test(sanitisedCode)) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid property code format. The code must be exactly 4 alphanumeric characters (e.g. "AB3X").',
        field: 'propertyCode',
      });
    }

    // ── Step 2: Query MongoDB ───────────────────────────────
    // Uses the `idx_property_code` unique index on `propertyCode`
    const property = await Property.findOne(
      { propertyCode: sanitisedCode },
      PROPERTY_PUBLIC_PROJECTION
    )
      .populate('landlordId', 'fullName email phone')
      .lean();

    // ── Step 3: Handle result ───────────────────────────────
    if (!property) {
      return res.status(404).json({
        success: false,
        message: `No property found with code "${sanitisedCode}". Please verify the code with your landlord.`,
        field: 'propertyCode',
      });
    }

    return res.status(200).json({
      success: true,
      method: 'code',
      property,
    });
  } catch (error) {
    console.error('[propertySync.controller] syncByCode error:', error);
    return res.status(500).json({
      success: false,
      message: 'An internal server error occurred during code sync. Please try again.',
    });
  }
};
