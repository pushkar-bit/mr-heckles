/**
 * @file User.js
 * @description Mr. Heckles — User model.
 *
 * Authentication is delegated to Clerk. This model stores only the
 * application-specific profile data that Clerk doesn't manage:
 *   - clerkId  — the Clerk user ID (sub claim in Clerk's JWT), used as
 *                the join key between Clerk identity and MongoDB profile.
 *   - role     — 'landlord' | 'tenant' (set on first sign-in via /api/auth/sync)
 *   - phone, details, emergencyContacts, etc.
 *
 * Password hashing (bcryptjs) is removed — Clerk owns credentials.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// ─────────────────────────────────────────────
//  Sub-document: Emergency Contact
// ─────────────────────────────────────────────
const EmergencyContactSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Emergency contact name is required.'],
      trim: true,
    },
    relationship: {
      type: String,
      trim: true,
      default: 'Not specified',
    },
    phone: {
      type: String,
      required: [true, 'Emergency contact phone is required.'],
      trim: true,
      match: [/^\+?[1-9]\d{6,14}$/, 'Please enter a valid phone number.'],
    },
  },
  { _id: false }
);

// ─────────────────────────────────────────────
//  Sub-document: Unified Tenant/Landlord Details
// ─────────────────────────────────────────────
const UserDetailsSchema = new Schema(
  {
    status: {
      type: String,
      enum: {
        values: ['student', 'bachelor', 'employed'],
        message: '`{VALUE}` is not a valid status. Choose: student, bachelor, employed.',
      },
      default: null,
    },
    institutionOrCompany: {
      type: String,
      trim: true,
      default: null,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [500, 'Bio must not exceed 500 characters.'],
      default: '',
    },
    emergencyContacts: {
      type: [EmergencyContactSchema],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 3,
        message: 'A maximum of 3 emergency contacts are allowed.',
      },
    },
  },
  { _id: false }
);

// ─────────────────────────────────────────────
//  Main: User Schema
// ─────────────────────────────────────────────
const UserSchema = new Schema(
  {
    // ── Clerk identity link ────────────────────────────────────
    // Clerk's user ID (e.g. "user_2abc..."). Used to look up this
    // document after Clerk verifies a request in auth.middleware.js.
    clerkId: {
      type: String,
      required: [true, 'Clerk user ID is required.'],
      unique: true,
      trim: true,
      index: true,
    },

    // ── Profile ───────────────────────────────────────────────
    fullName: {
      type: String,
      required: [true, 'Full name is required.'],
      trim: true,
      minlength: [2, 'Full name must be at least 2 characters.'],
      maxlength: [100, 'Full name must not exceed 100 characters.'],
    },
    email: {
      type: String,
      required: [true, 'Email address is required.'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/,
        'Please enter a valid email address.',
      ],
    },

    // ── App role ──────────────────────────────────────────────
    role: {
      type: String,
      enum: {
        values: ['landlord', 'tenant'],
        message: '`{VALUE}` is not a valid role. Choose: landlord, tenant.',
      },
      required: [true, 'User role is required.'],
    },

    phone: {
      type: String,
      trim: true,
      match: [/^\+?[1-9]\d{6,14}$/, 'Please enter a valid phone number.'],
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    details: {
      type: UserDetailsSchema,
      default: () => ({}),
    },
    deactivatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────
UserSchema.index({ clerkId: 1 }, { unique: true, name: 'idx_user_clerk_id' });
UserSchema.index({ email: 1 },   { unique: true, name: 'idx_user_email' });
UserSchema.index({ role: 1 },    { name: 'idx_user_role' });

// ─────────────────────────────────────────────
//  Pre-save Hook: Role-based Details Constraint
// ─────────────────────────────────────────────
UserSchema.pre('save', function (next) {
  // Landlords should not carry a tenant-specific occupancy status
  if (this.role === 'landlord' && this.details?.status) {
    this.details.status = null;
  }
  next();
});

// ─────────────────────────────────────────────
//  Virtual: Display Name (alias)
// ─────────────────────────────────────────────
UserSchema.virtual('displayName').get(function () {
  return this.fullName;
});

const User = model('User', UserSchema);
export default User;
