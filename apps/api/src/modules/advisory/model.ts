import { InferSchemaType, Schema, model, models, type Model } from 'mongoose';
import { jsonOptions } from '../../utils/mongooseJson';
import { INSIGHT_STATUSES, INSIGHT_TYPES, LEVELS } from './types';

const insightSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    type: { type: String, enum: INSIGHT_TYPES, required: true },
    fingerprint: { type: String, required: true }, // stable identity of the underlying condition
    severity: { type: String, enum: LEVELS, required: true },
    severityRank: { type: Number, required: true }, // 3/2/1, for sorting
    confidence: { type: String, enum: LEVELS, required: true },
    status: { type: String, enum: INSIGHT_STATUSES, default: 'ACTIVE' },
    snoozedUntil: { type: Date },
    stale: { type: Boolean, default: false }, // the condition was not found by the latest scan

    headline: { type: String, required: true },
    summary: { type: String, required: true },
    rationale: { type: String, required: true },
    recommendedAction: { type: String, required: true },
    generator: { type: String, enum: ['template', 'llm'], required: true },
    model: { type: String },
    fallbackReason: { type: String }, // why the LLM output was not used, when applicable

    impact: {
      kind: { type: String, enum: ['savings', 'cost_increase', 'risk', 'none'], required: true },
      amountInr: { type: Number, default: null },
      pct: { type: Number, default: null },
      basis: { type: String, required: true },
    },
    entities: {
      productIds: { type: [Schema.Types.ObjectId], default: [] },
      vendorIds: { type: [Schema.Types.ObjectId], default: [] },
    },
    window: { from: { type: String }, to: { type: String } },
    evidence: { type: Schema.Types.Mixed, required: true }, // the deterministic signal packet
    rfq: { type: Schema.Types.Mixed },
    evidenceHash: { type: String, required: true },
    asOf: { type: Date, required: true },
    firstDetectedAt: { type: Date, required: true },
    lastDetectedAt: { type: Date, required: true },
    statusHistory: {
      type: [{ _id: false, status: String, at: Date, by: String, note: String }],
      default: [],
    },
  },
  { timestamps: true, versionKey: false, toJSON: jsonOptions(['tenantId', 'evidenceHash']) },
);
insightSchema.index({ tenantId: 1, fingerprint: 1 }, { unique: true });
insightSchema.index({ tenantId: 1, status: 1, type: 1, severityRank: -1 });

const runSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    status: { type: String, enum: ['running', 'completed', 'failed'], default: 'running' },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date },
    asOf: { type: Date },
    asOfReason: { type: String },
    params: { type: Schema.Types.Mixed },
    summary: { type: Schema.Types.Mixed },
    error: { type: String },
  },
  { timestamps: true, versionKey: false, toJSON: jsonOptions(['tenantId']) },
);
runSchema.index({ tenantId: 1, startedAt: -1 });

/**
 * Externally sourced price reference. Only records flagged `verified` (with a source URL) are ever used to raise
 * market-savings insights. Populated via the API today; a verification pipeline (Module 4) is expected to write here.
 */
const benchmarkSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    priceBase: { type: Number, required: true, min: 0 }, // tenant base currency per product base unit
    sourceName: { type: String, required: true, trim: true },
    sourceUrl: { type: String, trim: true },
    observedAt: { type: Date, required: true },
    verified: { type: Boolean, default: false },
    verifiedBy: { type: String },
    verifiedAt: { type: Date },
    notes: { type: String, maxlength: 500 },
  },
  { timestamps: true, versionKey: false, toJSON: jsonOptions(['tenantId']) },
);
benchmarkSchema.index({ tenantId: 1, productId: 1, observedAt: -1 });

export type InsightAttrs = InferSchemaType<typeof insightSchema>;
export type RunAttrs = InferSchemaType<typeof runSchema>;
export type BenchmarkAttrs = InferSchemaType<typeof benchmarkSchema>;
export const InsightModel: Model<InsightAttrs> = (models.Insight as Model<InsightAttrs>) || model<InsightAttrs>('Insight', insightSchema);
export const AdvisoryRunModel: Model<RunAttrs> = (models.AdvisoryRun as Model<RunAttrs>) || model<RunAttrs>('AdvisoryRun', runSchema);
export const BenchmarkModel: Model<BenchmarkAttrs> = (models.MarketBenchmark as Model<BenchmarkAttrs>) || model<BenchmarkAttrs>('MarketBenchmark', benchmarkSchema);
