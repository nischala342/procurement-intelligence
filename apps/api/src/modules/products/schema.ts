import { z } from 'zod';
import { PRODUCT_STATUSES } from './model';

const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid 24-character hex ObjectId');

export const productIdParam = z.object({ id: oid });

export const listProductsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
});

export const mergeProductBody = z.object({ targetId: oid });

/** Review workflow: confirm a flagged product is distinct (status -> active). */
export const updateProductBody = z.object({ status: z.literal('active') });

export type ListProductsQuery = z.infer<typeof listProductsQuery>;
