import type { FilterQuery } from 'mongoose';
import { AppError } from '../../utils/AppError';
import { ItemModel, type ItemAttrs } from './model';
import type { CreateItemInput, ListItemsQuery, UpdateItemInput } from './schema';

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function listItems(q: ListItemsQuery) {
  const filter: FilterQuery<ItemAttrs> = {};
  if (q.status) filter.status = q.status;
  if (q.category) filter.category = q.category;
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), 'i');
    filter.$or = [{ name: rx }, { slug: rx }, { description: rx }];
  }
  const sortField = q.sort.replace(/^-/, '');
  const sort = { [sortField]: q.sort.startsWith('-') ? -1 : 1, _id: 1 } as Record<string, 1 | -1>;

  const [items, total] = await Promise.all([
    ItemModel.find(filter)
      .sort(sort)
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    ItemModel.countDocuments(filter),
  ]);
  return {
    items,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) },
  };
}

export async function getItem(id: string) {
  const item = await ItemModel.findById(id);
  if (!item) throw AppError.notFound('Item not found');
  return item;
}

export async function createItem(input: CreateItemInput) {
  const slug = input.slug ?? slugify(input.name);
  if (!slug) throw AppError.badRequest('Unable to derive a slug from name; provide a slug explicitly');
  if (await ItemModel.exists({ slug })) throw AppError.conflict(`An item with slug "${slug}" already exists`);
  return ItemModel.create({ ...input, slug });
}

export async function updateItem(id: string, input: UpdateItemInput) {
  if (input.slug) {
    const clash = await ItemModel.exists({ slug: input.slug, _id: { $ne: id } });
    if (clash) throw AppError.conflict(`An item with slug "${input.slug}" already exists`);
  }
  const item = await ItemModel.findByIdAndUpdate(id, { $set: input }, { new: true, runValidators: true });
  if (!item) throw AppError.notFound('Item not found');
  return item;
}

export async function deleteItem(id: string) {
  const item = await ItemModel.findByIdAndDelete(id);
  if (!item) throw AppError.notFound('Item not found');
  return item;
}
