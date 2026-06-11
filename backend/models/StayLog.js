import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// ─────────────────────────────────────────────────────────────
//  StayLog Schema
//  Records every check-in/check-out transaction per tenant.
//  Used by validateStayTimeline middleware for overlap detection.
// ─────────────────────────────────────────────────────────────

const StayLogSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Tenant reference is required.'],
      index: true,
    },
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: 'Property',
      required: [true, 'Property reference is required.'],
    },
    roomNumber: {
      type: String,
      required: [true, 'Room number is required.'],
      trim: true,
      uppercase: true,
    },
    checkInDate: {
      type: Date,
      required: [true, 'Check-in date is required.'],
    },
    checkOutDate: {
      type: Date,
      required: [true, 'Check-out date is required.'],
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled'],
      default: 'active',
    },
    // If this stay was booked on behalf of co-residents, their IDs are listed here.
    // The primary account holder (tenantId) is the ledger owner for all.
    coResidents: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    bookedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─────────────────────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────────────────────

// The overlap query pattern: find all stays by tenantId where active
StayLogSchema.index(
  { tenantId: 1, status: 1, checkInDate: 1, checkOutDate: 1 },
  { name: 'idx_stay_tenant_overlap' }
);

StayLogSchema.index(
  { propertyId: 1, roomNumber: 1, status: 1 },
  { name: 'idx_stay_property_room' }
);

// ─────────────────────────────────────────────────────────────
//  Pre-save Validation: checkOutDate must be after checkInDate
// ─────────────────────────────────────────────────────────────

StayLogSchema.pre('save', function (next) {
  if (this.checkOutDate <= this.checkInDate) {
    return next(
      new Error('Check-out date must be strictly after check-in date.')
    );
  }
  next();
});

// ─────────────────────────────────────────────────────────────
//  Virtual: Duration in days
// ─────────────────────────────────────────────────────────────

StayLogSchema.virtual('durationDays').get(function () {
  if (!this.checkInDate || !this.checkOutDate) return null;
  return Math.ceil((this.checkOutDate - this.checkInDate) / 864e5);
});

const StayLog = model('StayLog', StayLogSchema);
export default StayLog;
