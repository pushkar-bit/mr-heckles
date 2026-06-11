import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// ─────────────────────────────────────────────────────────────
//  Main: AttendanceLog Schema
//  Records daily house-help fulfilment per property.
// ─────────────────────────────────────────────────────────────

const AttendanceSchema = new Schema(
  {
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: 'Property',
      required: [true, 'Property reference is required.'],
      index: true,
    },
    // Normalised to UTC midnight — one log per (property, date, category)
    date: {
      type: Date,
      required: [true, 'Log date is required.'],
    },
    houseHelpCategory: {
      type: String,
      enum: {
        values: ['cleaning', 'cooking'],
        message: '`{VALUE}` is not a valid house-help category.',
      },
      required: [true, 'House-help category is required.'],
    },
    status: {
      type: String,
      enum: {
        values: ['fulfilled', 'absent'],
        message: '`{VALUE}` is not a valid attendance status.',
      },
      default: 'absent',
    },
    // Tenants who tapped "Confirm" for this attendance entry
    confirmedBy: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    // Optional note from landlord or lead tenant
    note: {
      type: String,
      trim: true,
      maxlength: [300, 'Note must not exceed 300 characters.'],
      default: '',
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

// Compound unique index — one log per (property, date, category)
AttendanceSchema.index(
  { propertyId: 1, date: 1, houseHelpCategory: 1 },
  { unique: true, name: 'idx_attendance_unique_daily' }
);

AttendanceSchema.index(
  { propertyId: 1, date: -1 },
  { name: 'idx_attendance_property_date' }
);

// ─────────────────────────────────────────────────────────────
//  Virtual: Confirmation count
// ─────────────────────────────────────────────────────────────

AttendanceSchema.virtual('confirmationCount').get(function () {
  return this.confirmedBy.length;
});

// ─────────────────────────────────────────────────────────────
//  Pre-save Hook: Normalise date to UTC midnight
//  Ensures exactly one log per calendar day regardless of
//  what time of day the document is created.
// ─────────────────────────────────────────────────────────────

AttendanceSchema.pre('save', function (next) {
  if (this.isModified('date') || this.isNew) {
    const d = new Date(this.date);
    d.setUTCHours(0, 0, 0, 0);
    this.date = d;
  }
  next();
});

// ─────────────────────────────────────────────────────────────
//  Pre-save Hook: Auto-set status based on confirmations
//  If at least one tenant confirmed → fulfilled, else → absent.
// ─────────────────────────────────────────────────────────────

AttendanceSchema.pre('save', function (next) {
  if (this.isModified('confirmedBy')) {
    this.status = this.confirmedBy.length > 0 ? 'fulfilled' : 'absent';
  }
  next();
});

const Attendance = model('Attendance', AttendanceSchema);
export default Attendance;
