import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

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
    passwordHash: {
      type: String,
      required: [true, 'Password is required.'],
      minlength: [60, 'Password hash appears malformed.'], // bcrypt hash length
      select: false, // never returned in queries by default
    },
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
    // Soft-delete timestamp
    deactivatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────
UserSchema.index({ email: 1 }, { unique: true, name: 'idx_user_email' });
UserSchema.index({ role: 1 }, { name: 'idx_user_role' });

// ─────────────────────────────────────────────
//  Pre-save Hook: Password Hashing
// ─────────────────────────────────────────────
UserSchema.pre('save', async function (next) {
  // Only hash if the passwordHash field is new or modified raw plaintext
  if (!this.isModified('passwordHash')) return next();

  // Guard: skip re-hashing if it already looks like a bcrypt hash
  if (this.passwordHash.startsWith('$2')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (err) {
    next(err);
  }
});

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
//  Instance Method: Verify Password
// ─────────────────────────────────────────────
UserSchema.methods.verifyPassword = async function (plaintext) {
  return bcrypt.compare(plaintext, this.passwordHash);
};

// ─────────────────────────────────────────────
//  Virtual: Display Name (alias)
// ─────────────────────────────────────────────
UserSchema.virtual('displayName').get(function () {
  return this.fullName;
});

const User = model('User', UserSchema);
export default User;
