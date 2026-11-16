import { z } from 'zod';
import { SOURCE_TYPE_VALUES, TRANSACTION_KINDS } from './model';

const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid 24-character hex ObjectId');
const isoDate = z.coerce.date();

export const transactionIdParam = z.object({ id: oid });

export const listTransactionsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  kind: z.enum(TRANSACTION_KINDS).optional(),
  sourceType: z.enum(SOURCE_TYPE_VALUES).optional(),
  vendorId: oid.optional(),
  productId: oid.optional(),
  jobId: oid.optional(),
  reference: z.string().trim().max(200).optional(),
  search: z.string().trim().max(100).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(['date', '-date', 'amountBase', '-amountBase']).default('-date'),
});

export type ListTransactionsQuery = z.infer<typeof listTransactionsQuery>;
