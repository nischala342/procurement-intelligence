import { InferSchemaType, Schema, Types, model, models, type Model } from 'mongoose';
import { jsonOptions } from '../../utils/mongooseJson';

export const VENDOR_STATUSES = ['active', 'needs_review', 'merged'] as const;

const vendorSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true },
    aliases: { type: [String], default: [] }, // raw spellings seen in sources
    aliasKeys: { type: [String], default: [] }, // normalised aliases used for matching
    taxId: { type: String }, // GSTIN/PAN/VAT, normalised
    status: { type: String, enum: VENDOR_STATUSES, default: 'active' },
    possibleDuplicateOf: { type: Schema.Types.ObjectId, ref: 'Vendor' },
    similarityScore: { type: Number },
    mergedInto: { type: Schema.Types.ObjectId, ref: 'Vendor' },
    mergeHistory: {
      type: [{ _id: false, vendorId: Schema.Types.ObjectId, name: String, mergedAt: Date }],
      default: [],
    },
  },
  { timestamps: true, versionKey: false, toJSON: jsonOptions(['aliasKeys', 'tenantId']) },
);

// Uniqueness is per tenant: two tenants may both have a vendor called "Acme".
vendorSchema.index({ tenantId: 1, normalizedName: 1 }, { unique: true });
vendorSchema.index({ tenantId: 1, taxId: 1 }, { sparse: true });
vendorSchema.index({ tenantId: 1, status: 1 });
vendorSchema.index({ tenantId: 1, aliasKeys: 1 });

export type VendorAttrs = InferSchemaType<typeof vendorSchema>;
export type VendorId = Types.ObjectId;
export const VendorModel: Model<VendorAttrs> = (models.Vendor as Model<VendorAttrs>) || model<VendorAttrs>('Vendor', vendorSchema);
