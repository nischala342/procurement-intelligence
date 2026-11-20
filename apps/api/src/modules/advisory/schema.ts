import { z } from 'zod';
import { INSIGHT_STATUSES, INSIGHT_TYPES, LEVELS } from './types';

const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid 24-character hex ObjectId');
const boolText = z.enum(['true', 'false']).transform((v) => v === 'true');

export const idParam = z.object({ id: oid });

export const listInsightsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(INSIGHT_TYPES).optional(),
  severity: z.enum(LEVELS).optional(),
  /** default ACTIVE; ALL returns every lifecycle state */
  status: z.enum([...INSIGHT_STATUSES, 'ALL']).default('ACTIVE'),
  includeStale: boolText.default('false'),
});

export const generateBody = z
  .object({
    /** Evaluate as of this date. Default: now, or the newest price data when that is more than 45 days old. */
    asOf: z.coerce.date().optional(),
    /** Restrict cost-creep detection to one window (default evaluates 30, 60 and 90 days). */
    windowDays: z.union([z.literal(30), z.literal(60), z.literal(90)]).optional(),
    /** Minimum suppliers for a spend-fragmentation insight. */
    minVendors: z.number().int().min(2).max(10).default(3),
  })
  .default({});

export const statusBody = z.object({
  status: z.enum(INSIGHT_STATUSES),
  snoozeDays: z.number().int().min(1).max(180).optional(),
  note: z.string().trim().max(300).optional(),
});

export const rfqBody = z
  .object({
    vendorIds: z.array(oid).min(1).max(10).optional(),
    targetQuantity: z.number().positive().finite().optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .default({});

export const createBenchmarkBody = z.object({
  productId: oid,
  /** price per the product's base unit, in the organization's base currency */
  priceBase: z.number().positive().finite(),
  sourceName: z.string().trim().min(2).max(120),
  sourceUrl: z.string().trim().url().max(500).optional(),
  observedAt: z.coerce.date(),
  /** attests that you verified the source; requires `sourceUrl` */
  verified: z.boolean().default(false),
  notes: z.string().trim().max(500).optional(),
});

export const listBenchmarksQuery = z.object({ productId: oid.optional() });

export type ListInsightsQuery = z.infer<typeof listInsightsQuery>;
export type GenerateBody = z.infer<typeof generateBody>;
export type StatusBody = z.infer<typeof statusBody>;
export type RfqBody = z.infer<typeof rfqBody>;
export type CreateBenchmarkBody = z.infer<typeof createBenchmarkBody>;
