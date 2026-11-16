import { InferSchemaType, Schema, model, models, type Model } from 'mongoose';
import { jsonOptions } from '../../utils/mongooseJson';
import { SOURCE_TYPES } from './parsers/types';

export const JOB_STATUSES = ['processing', 'completed', 'completed_with_errors', 'failed'] as const;

const ingestionJobSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    sourceType: { type: String, enum: SOURCE_TYPES, required: true },
    filename: { type: String, required: true },
    fileSize: { type: Number, required: true },
    fileHash: { type: String, required: true }, // sha256 of file content
    status: { type: String, enum: JOB_STATUSES, default: 'processing' },
    options: { dayFirst: { type: Boolean, default: true }, defaultCurrency: { type: String } },
    stats: {
      rowsParsed: { type: Number, default: 0 },
      rowsSkipped: { type: Number, default: 0 },
      rowsFailed: { type: Number, default: 0 },
      transactionsCreated: { type: Number, default: 0 },
      duplicatesIgnored: { type: Number, default: 0 },
      vendorsCreated: { type: Number, default: 0 },
      vendorsMatched: { type: Number, default: 0 },
      productsCreated: { type: Number, default: 0 },
      productsMatched: { type: Number, default: 0 },
      needsReview: { type: Number, default: 0 },
    },
    rowErrors: { type: [{ _id: false, rowNumber: Number, message: String }], default: [] }, // capped at 200
    failureReason: { type: String },
    completedAt: { type: Date },
  },
  { timestamps: true, versionKey: false, toJSON: jsonOptions(['tenantId']) },
);
ingestionJobSchema.index({ tenantId: 1, createdAt: -1 });
ingestionJobSchema.index({ tenantId: 1, fileHash: 1, sourceType: 1 });

const rawRecordSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'IngestionJob', required: true },
    rowNumber: { type: Number, required: true },
    payload: { type: Schema.Types.Mixed, required: true }, // original source row, untouched
    status: { type: String, enum: ['normalized', 'error'], required: true },
    error: { type: String },
  },
  { timestamps: true, versionKey: false, toJSON: jsonOptions(['tenantId']) },
);
rawRecordSchema.index({ tenantId: 1, jobId: 1, rowNumber: 1 });

export type IngestionJobAttrs = InferSchemaType<typeof ingestionJobSchema>;
export const IngestionJobModel: Model<IngestionJobAttrs> =
  (models.IngestionJob as Model<IngestionJobAttrs>) || model<IngestionJobAttrs>('IngestionJob', ingestionJobSchema);
export type RawRecordAttrs = InferSchemaType<typeof rawRecordSchema>;
export const RawRecordModel: Model<RawRecordAttrs> =
  (models.RawRecord as Model<RawRecordAttrs>) || model<RawRecordAttrs>('RawRecord', rawRecordSchema);
