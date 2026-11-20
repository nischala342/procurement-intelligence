import { z } from 'zod';

export const overviewQuery = z
  .object({
    /** Trailing window in calendar months, ending at the analysis date. */
    months: z.coerce.number().int().min(3).max(36).default(12),
  })
  .strict();
export type OverviewQuery = z.infer<typeof overviewQuery>;
