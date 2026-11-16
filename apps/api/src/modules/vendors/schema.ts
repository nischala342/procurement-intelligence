import { z } from 'zod';
import { VENDOR_STATUSES } from './model';

const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid 24-character hex ObjectId');

export const vendorIdParam = z.object({ id: oid });

export const listVendorsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(VENDOR_STATUSES).optional(),
});

export const mergeVendorBody = z.object({ targetId: oid });

/** Review workflow: confirm a flagged vendor as distinct (status -> active) or rename it. */
export const updateVendorBody = z
  .object({ name: z.string().trim().min(1).max(160), status: z.literal('active') })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export type ListVendorsQuery = z.infer<typeof listVendorsQuery>;
export type UpdateVendorInput = z.infer<typeof updateVendorBody>;
