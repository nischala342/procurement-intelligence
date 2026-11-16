import { InferSchemaType, Schema, model, models, type Model } from 'mongoose';

const itemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, default: '', maxlength: 2000 },
    category: { type: String, default: 'general', trim: true, index: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['active', 'draft', 'archived'], default: 'active', index: true },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = String(ret._id);
        delete ret._id;
        return ret;
      },
    },
  },
);

itemSchema.index({ name: 'text', description: 'text' });

export type ItemAttrs = InferSchemaType<typeof itemSchema>;

// Reuse existing model when imported from another entry point (e.g. seed scripts).
export const ItemModel: Model<ItemAttrs> = (models.Item as Model<ItemAttrs>) || model<ItemAttrs>('Item', itemSchema);
