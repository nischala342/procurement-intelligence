import { z } from 'zod';

export const ITEM_STATUSES = ['active', 'draft', 'archived'] as const;

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const objectIdParam = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid 24-character hex ObjectId'),
});

export const createItemBody = z.object({
  name: z.string().trim().min(1, 'name is required').max(120),
  slug: z.string().trim().toLowerCase().regex(slugRegex, 'slug must be lowercase kebab-case').max(140).optional(),
  description: z.string().trim().max(2000).default(''),
  category: z.string().trim().min(1).max(60).default('general'),
  price: z.number().nonnegative('price must be >= 0').finite(),
  quantity: z.number().int('quantity must be an integer').nonnegative().default(0),
  status: z.enum(ITEM_STATUSES).default('active'),
});

export const updateItemBody = createItemBody
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export const listItemsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(ITEM_STATUSES).optional(),
  category: z.string().trim().max(60).optional(),
  sort: z.enum(['createdAt', '-createdAt', 'name', '-name', 'price', '-price']).default('-createdAt'),
});

export type CreateItemInput = z.infer<typeof createItemBody>;
export type UpdateItemInput = z.infer<typeof updateItemBody>;
export type ListItemsQuery = z.infer<typeof listItemsQuery>;
