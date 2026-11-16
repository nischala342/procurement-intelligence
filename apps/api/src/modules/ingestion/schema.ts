import { z } from 'zod';
import { SOURCE_TYPES } from './parsers/types';

const boolText = z.enum(['true', 'false']).transform((v) => v === 'true');

/** Multipart text fields that accompany the uploaded `file`. */
export const createJobBody = z.object({
  sourceType: z.enum(SOURCE_TYPES),
  dayFirst: boolText.optional(),
  allowDuplicate: boolText.optional(),
  defaultCurrency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, 'defaultCurrency must be a 3-letter ISO code')
    .transform((v) => v.toUpperCase())
    .optional(),
});

export const jobIdParam = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid 24-character hex ObjectId') });

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const recordsQuery = pageQuery.extend({ status: z.enum(['normalized', 'error']).optional() });

export type CreateJobBody = z.infer<typeof createJobBody>;
