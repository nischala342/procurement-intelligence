import { InferSchemaType, Schema, model, models, type Model } from 'mongoose';
import { jsonOptions } from '../../utils/mongooseJson';

export const PRODUCT_STATUSES = ['active', 'needs_review', 'merged'] as const;

const productSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true },
    sku: { type: String }, // normalised (upper-case, no spaces)
    aliases: { type: [String], default: [] },
    aliasKeys: { type: [String], default: [] },
    baseUnit: { type: String, required: true, default: 'pcs' }, // canonical base unit of its dimension
    dimension: { type: String, enum: ['count', 'mass', 'volume', 'length'], default: 'count' },
    status: { type: String, enum: PRODUCT_STATUSES, default: 'active' },
    possibleDuplicateOf: { type: Schema.Types.ObjectId, ref: 'Product' },
    similarityScore: { type: Number },
    mergedInto: { type: Schema.Types.ObjectId, ref: 'Product' },
  },
  { timestamps: true, versionKey: false, toJSON: jsonOptions(['aliasKeys', 'tenantId']) },
);

// SKU / name uniqueness is per tenant.
productSchema.index({ tenantId: 1, normalizedName: 1 }, { unique: true });
productSchema.index({ tenantId: 1, sku: 1 }, { sparse: true });
productSchema.index({ tenantId: 1, status: 1 });
productSchema.index({ tenantId: 1, aliasKeys: 1 });

export type ProductAttrs = InferSchemaType<typeof productSchema>;
export const ProductModel: Model<ProductAttrs> = (models.Product as Model<ProductAttrs>) || model<ProductAttrs>('Product', productSchema);
