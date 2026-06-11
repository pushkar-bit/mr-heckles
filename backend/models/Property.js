import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// ─────────────────────────────────────────────────────────────
//  Sub-document: UnitsLayout — individual room node descriptor
// ─────────────────────────────────────────────────────────────

const UnitsLayoutSchema = new Schema(
  {
    floorNumber: {
      type: Number,
      required: [true, 'Floor number is required.'],
      min: [0, 'Floor number cannot be negative (0 = Ground Floor).'],
    },
    roomNumber: {
      type: String,
      required: [true, 'Room number is required.'],
      trim: true,
      uppercase: true,
    },
    unitType: {
      type: String,
      enum: {
        values: ['1BHK', '2BHK', 'studio', 'shared_room'],
        message: '`{VALUE}` is not a valid unit type.',
      },
      required: [true, 'Unit type is required.'],
    },
    status: {
      type: String,
      enum: {
        values: ['vacant', 'occupied', 'maintenance'],
        message: '`{VALUE}` is not a valid unit status.',
      },
      default: 'vacant',
    },
    currentTenants: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 6,
        message: 'A unit cannot hold more than 6 tenants.',
      },
    },
  },
  { _id: true, timestamps: false }
);

// ─────────────────────────────────────────────────────────────
//  Main: Property Schema
// ─────────────────────────────────────────────────────────────

const PropertySchema = new Schema(
  {
    landlordId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Landlord reference is required.'],
      index: true,
    },
    propertyName: {
      type: String,
      required: [true, 'Property name is required.'],
      trim: true,
      minlength: [3, 'Property name must be at least 3 characters.'],
      maxlength: [120, 'Property name must not exceed 120 characters.'],
    },
    propertyType: {
      type: String,
      enum: {
        values: ['hostel', 'residency', 'hotel'],
        message: '`{VALUE}` is not a valid property type.',
      },
      required: [true, 'Property type is required.'],
    },
    registeredPublicIP: {
      type: String,
      trim: true,
      default: null,
      validate: {
        validator: (v) =>
          v === null ||
          /^(\d{1,3}\.){3}\d{1,3}$/.test(v) || // IPv4
          /^[0-9a-fA-F:]+$/.test(v),             // IPv6 (loose)
        message: '`{VALUE}` does not appear to be a valid IP address.',
      },
    },
    propertyCode: {
      type: String,
      required: [true, 'Property code is required.'],
      trim: true,
      uppercase: true,
      minlength: [4, 'Property code must be exactly 4 characters.'],
      maxlength: [4, 'Property code must be exactly 4 characters.'],
      match: [/^[A-Z0-9]{4}$/, 'Property code must be exactly 4 alphanumeric characters.'],
    },
    totalFloors: {
      type: Number,
      required: [true, 'Total floors is required.'],
      min: [1, 'A property must have at least 1 floor.'],
      max: [100, 'Total floors cannot exceed 100.'],
    },
    unitsLayout: {
      type: [UnitsLayoutSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    address: {
      street: { type: String, trim: true, default: '' },
      city:   { type: String, trim: true, default: '' },
      state:  { type: String, trim: true, default: '' },
      pincode:{ type: String, trim: true, default: '' },
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

PropertySchema.index(
  { propertyCode: 1 },
  { unique: true, name: 'idx_property_code', sparse: false }
);
PropertySchema.index(
  { registeredPublicIP: 1 },
  { name: 'idx_property_ip', sparse: true }
);
PropertySchema.index(
  { landlordId: 1, isActive: 1 },
  { name: 'idx_property_landlord_active' }
);

// ─────────────────────────────────────────────────────────────
//  Virtual: Total unit count
// ─────────────────────────────────────────────────────────────

PropertySchema.virtual('totalUnits').get(function () {
  return this.unitsLayout.length;
});

PropertySchema.virtual('vacantUnits').get(function () {
  return this.unitsLayout.filter((u) => u.status === 'vacant').length;
});

// ─────────────────────────────────────────────────────────────
//  Pre-save Hook: Uppercase propertyCode enforcement
// ─────────────────────────────────────────────────────────────

PropertySchema.pre('save', function (next) {
  if (this.propertyCode) {
    this.propertyCode = this.propertyCode.toUpperCase().trim();
  }
  // Normalise all room numbers to uppercase
  if (this.unitsLayout && this.isModified('unitsLayout')) {
    this.unitsLayout.forEach((unit) => {
      if (unit.roomNumber) unit.roomNumber = unit.roomNumber.toUpperCase().trim();
    });
  }
  next();
});

// ─────────────────────────────────────────────────────────────
//  Pre-save Hook: Integrity — totalFloors vs unitsLayout
// ─────────────────────────────────────────────────────────────

PropertySchema.pre('save', function (next) {
  if (!this.unitsLayout || this.unitsLayout.length === 0) return next();

  const distinctFloors = new Set(this.unitsLayout.map((u) => u.floorNumber));
  const maxFloor = Math.max(...distinctFloors);

  if (maxFloor >= this.totalFloors) {
    return next(
      new Error(
        `Unit layout references floor ${maxFloor}, but totalFloors is set to ${this.totalFloors}. ` +
        `Increase totalFloors to at least ${maxFloor + 1}.`
      )
    );
  }

  // Guard: duplicate roomNumber on same floor
  const seen = new Set();
  for (const unit of this.unitsLayout) {
    const key = `${unit.floorNumber}::${unit.roomNumber}`;
    if (seen.has(key)) {
      return next(
        new Error(`Duplicate room "${unit.roomNumber}" found on floor ${unit.floorNumber}.`)
      );
    }
    seen.add(key);
  }

  next();
});

// ─────────────────────────────────────────────────────────────
//  Instance Method: Find unit by floor + roomNumber
// ─────────────────────────────────────────────────────────────

PropertySchema.methods.findUnit = function (floorNumber, roomNumber) {
  return this.unitsLayout.find(
    (u) =>
      u.floorNumber === floorNumber &&
      u.roomNumber === roomNumber.toUpperCase().trim()
  ) ?? null;
};

const Property = model('Property', PropertySchema);
export default Property;
