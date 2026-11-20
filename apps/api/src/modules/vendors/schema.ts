import { z } from 'zod';
import { VENDOR_STATUSES } from './model';

const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid 24-character hex ObjectId');
const boolText = z.enum(['true', 'false']).transform((v) => v === 'true');

export const vendorIdParam = z.object({ id: oid });

export const VENDOR_SORTS = ['name', '-name', 'totalSpend', '-totalSpend', 'orderCount', '-orderCount', 'lastPurchaseDate', '-lastPurchaseDate'] as const;

export const listVendorsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(VENDOR_STATUSES).optional(),
  hideMerged: boolText.default('false'),
  sort: z.enum(VENDOR_SORTS).default('name'),
});

export const mergeVendorBody = z.object({ targetId: oid });

/**
 * Review workflow: confirm a flagged vendor as distinct (status -> active), rename it, or configure its
 * payment terms in days (`null` clears them). Payment terms cannot be extracted from the ingested sources yet.
 */
export const updateVendorBody = z
  .object({
    name: z.string().trim().min(1).max(160),
    status: z.literal('active'),
    paymentTermsDays: z.number().int().min(0).max(365).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export const intelligenceQuery = z.object({
  granularity: z.enum(['month', 'quarter']).default('month'),
});

export const compareQuery = z.object({
  productIds: z
    .string()
    .min(1, 'productIds is required')
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(oid).min(1, 'Provide at least one product id').max(20, 'At most 20 products per comparison')),
  baselineVendorId: oid.optional(),
  includeSimilar: boolText.default('true'),
});

export type ListVendorsQuery = z.infer<typeof listVendorsQuery>;
export type UpdateVendorInput = z.infer<typeof updateVendorBody>;
export type IntelligenceQuery = z.infer<typeof intelligenceQuery>;
export type CompareQuery = z.infer<typeof compareQuery>;
