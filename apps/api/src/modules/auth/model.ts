import { InferSchemaType, Schema, model, models, type Model } from 'mongoose';
import { jsonOptions } from '../../utils/mongooseJson';

/** A tenant is the isolation boundary: every ingested/canonical document carries its `tenantId`. */
const tenantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    /** reporting currency: analytics, narratives and RFQs are expressed in it */
    baseCurrency: { type: String, default: 'INR', uppercase: true, trim: true },
    country: { type: String, trim: true },
  },
  { timestamps: true, versionKey: false, toJSON: jsonOptions() },
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true }, // unique => indexed
    passwordHash: { type: String, required: true, select: false },
    organizationName: { type: String, required: true, trim: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  },
  { timestamps: true, versionKey: false, toJSON: jsonOptions(['passwordHash']) },
);

export type TenantAttrs = InferSchemaType<typeof tenantSchema>;
export type UserAttrs = InferSchemaType<typeof userSchema>;
export const TenantModel: Model<TenantAttrs> = (models.Tenant as Model<TenantAttrs>) || model<TenantAttrs>('Tenant', tenantSchema);
export const UserModel: Model<UserAttrs> = (models.User as Model<UserAttrs>) || model<UserAttrs>('User', userSchema);
