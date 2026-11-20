import { z } from 'zod';
import { PRODUCT_STATUSES } from './model';

const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid 24-character hex ObjectId');
const boolText = z.enum(['true', 'false']).transform((v) => v === 'true');

export const productIdParam = z.object({ id: oid });

export const PRODUCT_SORTS = ['name', '-name', 'totalSpend', '-totalSpend', 'currentPrice', '-currentPrice', 'avgPurchasePrice', '-avgPurchasePrice'] as const;

export const listProductsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  dimension: z.enum(['count', 'mass', 'volume', 'length', 'area', 'time', 'data', 'service']).optional(),
  category: z.string().trim().max(80).optional(),
  hideMerged: boolText.default('false'),
  sort: z.enum(PRODUCT_SORTS).default('name'),
});

export const mergeProductBody = z.object({ targetId: oid });

/**
 * Confirm a flagged product is distinct (status -> active) and/or configure reorder inputs in days
 * (`null` clears them): lead time, and a fixed safety-stock cover that overrides the statistical estimate.
 */
export const updateProductBody = z
  .object({
    status: z.literal('active'),
    leadTimeDays: z.number().int().min(0).max(365).nullable(),
    safetyStockDays: z.number().int().min(0).max(365).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export const productIntelligenceQuery = z.object({
  /** Evaluate stock/reorder status as of this date (default: now). */
  asOf: z.coerce.date().optional(),
});

export const alternativesQuery = z.object({
  includeSimilar: boolText.default('true'),
});

export type ListProductsQuery = z.infer<typeof listProductsQuery>;
export type UpdateProductInput = z.infer<typeof updateProductBody>;
export type ProductIntelligenceQuery = z.infer<typeof productIntelligenceQuery>;
export type AlternativesQuery = z.infer<typeof alternativesQuery>;
