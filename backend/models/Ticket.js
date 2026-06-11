import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// ─────────────────────────────────────────────────────────────
//  Sub-document: Timeline stamp (open → resolved trace)
// ─────────────────────────────────────────────────────────────

const TimelineEntrySchema = new Schema(
  {
    event: {
      type: String,
      enum: ['opened', 'acknowledged', 'in_progress', 'resolved', 'reopened'],
      required: true,
    },
    note: { type: String, trim: true, default: '' },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ─────────────────────────────────────────────────────────────
//  Main: IncidentTicket Schema
// ─────────────────────────────────────────────────────────────

const TicketSchema = new Schema(
  {
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: 'Property',
      required: [true, 'Property reference is required.'],
      index: true,
    },
    roomNumber: {
      type: String,
      required: [true, 'Room number is required.'],
      trim: true,
      uppercase: true,
    },
    raisedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Tenant (raisedBy) reference is required.'],
      index: true,
    },
    issueDescription: {
      type: String,
      required: [true, 'Issue description is required.'],
      trim: true,
      minlength: [10, 'Issue description must be at least 10 characters.'],
      maxlength: [1000, 'Issue description must not exceed 1000 characters.'],
    },
    issueCategory: {
      type: String,
      enum: {
        values: ['plumbing', 'electrical', 'structural', 'pest', 'appliance', 'other'],
        message: '`{VALUE}` is not a valid issue category.',
      },
      default: 'other',
    },
    status: {
      type: String,
      enum: {
        values: ['open', 'acknowledged', 'in_progress', 'resolved'],
        message: '`{VALUE}` is not a valid ticket status.',
      },
      default: 'open',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    // Full audit trail of status transitions
    timeline: {
      type: [TimelineEntrySchema],
      default: [],
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    // Landlord notes on resolution
    resolutionNote: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true, // createdAt = ticket open time
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─────────────────────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────────────────────

TicketSchema.index(
  { propertyId: 1, status: 1 },
  { name: 'idx_ticket_property_status' }
);
TicketSchema.index(
  { raisedBy: 1, createdAt: -1 },
  { name: 'idx_ticket_tenant_date' }
);

// ─────────────────────────────────────────────────────────────
//  Virtual: Resolution duration in hours
// ─────────────────────────────────────────────────────────────

TicketSchema.virtual('resolutionDurationHours').get(function () {
  if (!this.resolvedAt || !this.createdAt) return null;
  return Math.round((this.resolvedAt - this.createdAt) / 36e5);
});

// ─────────────────────────────────────────────────────────────
//  Pre-save Hook: Auto-stamp timeline + resolvedAt
// ─────────────────────────────────────────────────────────────

TicketSchema.pre('save', function (next) {
  // On new document — push "opened" event
  if (this.isNew) {
    this.timeline.push({ event: 'opened', actorId: this.raisedBy });
    return next();
  }

  // On status change — push matching timeline event
  if (this.isModified('status')) {
    const eventMap = {
      acknowledged: 'acknowledged',
      in_progress: 'in_progress',
      resolved: 'resolved',
    };
    const event = eventMap[this.status];
    if (event) {
      this.timeline.push({ event });
    }
    if (this.status === 'resolved' && !this.resolvedAt) {
      this.resolvedAt = new Date();
    }
  }

  next();
});

const Ticket = model('Ticket', TicketSchema);
export default Ticket;
