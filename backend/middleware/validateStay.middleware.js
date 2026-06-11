/**
 * @file validateStayTimeline.js
 * @description Express middleware enforcing the business overlap rule:
 *
 *   A single tenant cannot occupy two separate property units during an
 *   overlapping date range.
 *
 *   Overlap formula:
 *     (Requested_CheckIn  <= Existing_CheckOut) AND
 *     (Requested_CheckOut >= Existing_CheckIn)
 *
 * Co-resident Exception:
 *   If the request body contains a `coResidents` array with verified
 *   profile entries, the strict overlap block is bypassed. The assumption
 *   is that the primary account holder is reserving a concurrent room for
 *   a flatmate/sibling, with the ledger staying under their ID.
 *
 * @route   Attach before any check-in creation handler
 * @expects req.body: { tenantId, propertyId, roomNumber, checkInDate, checkOutDate, coResidents? }
 */

import StayLog from '../models/StayLog.js';
import mongoose from 'mongoose';

// ─────────────────────────────────────────────────────────────
//  Utility: ISO date string → normalised Date (UTC midnight)
// ─────────────────────────────────────────────────────────────

const toUTCMidnight = (raw) => {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

// ─────────────────────────────────────────────────────────────
//  Utility: Validate co-residents payload
//  Verifiable = array of objects each containing at minimum `userId`.
// ─────────────────────────────────────────────────────────────

const isCoResidentPayloadValid = (coResidents) => {
  if (!Array.isArray(coResidents) || coResidents.length === 0) return false;

  return coResidents.every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    // Each entry must have a `userId` that is a valid ObjectId string
    return (
      typeof entry.userId === 'string' &&
      mongoose.Types.ObjectId.isValid(entry.userId)
    );
  });
};

// ─────────────────────────────────────────────────────────────
//  Isolated Date Overlap Test Block
//  Pure function — testable in isolation without DB.
// ─────────────────────────────────────────────────────────────

/**
 * Returns true if [reqIn, reqOut] overlaps with [existIn, existOut].
 * Formula: reqIn <= existOut  AND  reqOut >= existIn
 *
 * @param {Date} reqIn
 * @param {Date} reqOut
 * @param {Date} existIn
 * @param {Date} existOut
 * @returns {boolean}
 */
export const datesOverlap = (reqIn, reqOut, existIn, existOut) => {
  return reqIn <= existOut && reqOut >= existIn;
};

/**
 * Finds the first conflicting StayLog document from an array.
 *
 * @param {Array}  existingStays  — Array of StayLog documents from DB query
 * @param {Date}   reqIn
 * @param {Date}   reqOut
 * @returns {Object|null}         — Conflicting stay or null
 */
export const findConflict = (existingStays, reqIn, reqOut) => {
  return (
    existingStays.find((stay) =>
      datesOverlap(reqIn, reqOut, stay.checkInDate, stay.checkOutDate)
    ) ?? null
  );
};

// ─────────────────────────────────────────────────────────────
//  Main Middleware
// ─────────────────────────────────────────────────────────────

/**
 * validateStayTimeline
 *
 * Middleware function. Attach in the route chain before the check-in
 * controller handler:
 *
 *   router.post('/checkin', requireAuth, validateStayTimeline, checkinController);
 */
const validateStayTimeline = async (req, res, next) => {
  try {
    const {
      tenantId,
      propertyId,
      roomNumber,
      checkInDate: rawCheckIn,
      checkOutDate: rawCheckOut,
      coResidents,
    } = req.body;

    // ── Step 1: Presence validation ───────────────────────────
    const missing = [];
    if (!tenantId)    missing.push('tenantId');
    if (!propertyId)  missing.push('propertyId');
    if (!roomNumber)  missing.push('roomNumber');
    if (!rawCheckIn)  missing.push('checkInDate');
    if (!rawCheckOut) missing.push('checkOutDate');

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required field(s): ${missing.join(', ')}.`,
        missing,
      });
    }

    // ── Step 2: ObjectId format validation ────────────────────
    if (!mongoose.Types.ObjectId.isValid(tenantId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tenantId format.',
        field: 'tenantId',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid propertyId format.',
        field: 'propertyId',
      });
    }

    // ── Step 3: Date parsing & ordering ───────────────────────
    const reqCheckIn  = toUTCMidnight(rawCheckIn);
    const reqCheckOut = toUTCMidnight(rawCheckOut);

    if (!reqCheckIn) {
      return res.status(400).json({
        success: false,
        message: 'checkInDate is not a valid date string.',
        field: 'checkInDate',
      });
    }

    if (!reqCheckOut) {
      return res.status(400).json({
        success: false,
        message: 'checkOutDate is not a valid date string.',
        field: 'checkOutDate',
      });
    }

    if (reqCheckOut <= reqCheckIn) {
      return res.status(400).json({
        success: false,
        message: 'checkOutDate must be strictly after checkInDate.',
        fields: { checkInDate: rawCheckIn, checkOutDate: rawCheckOut },
      });
    }

    // Prevent check-in dates in the past (optional — configurable guard)
    const today = toUTCMidnight(new Date());
    if (reqCheckIn < today) {
      return res.status(400).json({
        success: false,
        message: 'checkInDate cannot be in the past.',
        field: 'checkInDate',
      });
    }

    // ── Step 4: Co-resident Exception Guard ───────────────────
    // If a valid co-residents payload is present, bypass the overlap
    // check and pass control downstream. The co-resident array will be
    // stored on the StayLog document by the controller.
    if (coResidents !== undefined && coResidents !== null) {
      if (!isCoResidentPayloadValid(coResidents)) {
        return res.status(400).json({
          success: false,
          message:
            'coResidents payload is invalid. Each entry must be an object containing a valid `userId` string.',
          field: 'coResidents',
        });
      }

      // Valid co-residents present — attach parsed data and skip overlap check
      req.validatedStay = {
        tenantId,
        propertyId,
        roomNumber: roomNumber.toUpperCase().trim(),
        checkInDate: reqCheckIn,
        checkOutDate: reqCheckOut,
        coResidents,
        bypassReason: 'co_resident_booking',
      };

      return next();
    }

    // ── Step 5: DB Overlap Query ──────────────────────────────
    // Fetch all ACTIVE stays for this tenant using the composite index.
    // We deliberately do NOT pre-filter by date in the query to allow
    // JavaScript-level date algebra on the isolated test block — this
    // keeps the logic transparent and unit-testable.
    const existingStays = await StayLog.find({
      tenantId,
      status: 'active',
    })
      .select('propertyId roomNumber checkInDate checkOutDate')
      .lean();

    // ── Step 6: Conflict Detection ────────────────────────────
    const conflict = findConflict(existingStays, reqCheckIn, reqCheckOut);

    if (conflict) {
      return res.status(400).json({
        success: false,
        message:
          'Booking blocked: this tenant already has an active stay that overlaps ' +
          'with the requested date range.',
        conflict: {
          stayId:       conflict._id,
          propertyId:   conflict.propertyId,
          roomNumber:   conflict.roomNumber,
          checkInDate:  conflict.checkInDate,
          checkOutDate: conflict.checkOutDate,
        },
        requested: {
          checkInDate:  reqCheckIn,
          checkOutDate: reqCheckOut,
        },
        hint: 'To book a concurrent room for a co-resident, include a valid `coResidents` array in the payload.',
      });
    }

    // ── Step 7: Attach validated payload and proceed ──────────
    req.validatedStay = {
      tenantId,
      propertyId,
      roomNumber: roomNumber.toUpperCase().trim(),
      checkInDate: reqCheckIn,
      checkOutDate: reqCheckOut,
      coResidents: [],
      bypassReason: null,
    };

    next();
  } catch (error) {
    console.error('[validateStayTimeline] Unhandled error:', error);
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred during stay timeline validation.',
    });
  }
};

export default validateStayTimeline;
