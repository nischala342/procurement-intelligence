import type { FilterQuery } from 'mongoose';
import { AppError } from '../../utils/AppError';
import { TransactionModel, type TransactionAttrs } from './model';
import type { ListTransactionsQuery } from './schema';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function listTransactions(tenantId: string, q: ListTransactionsQuery) {
  const filter: FilterQuery<TransactionAttrs> = { tenantId };
  if (q.kind) filter.kind = q.kind;
  if (q.sourceType) filter.sourceType = q.sourceType;
  if (q.vendorId) filter.vendorId = q.vendorId;
  if (q.productId) filter.productId = q.productId;
  if (q.jobId) filter.jobId = q.jobId;
  if (q.reference) filter.reference = q.reference;
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), 'i');
    filter.$or = [{ reference: rx }, { description: rx }];
  }
  if (q.from || q.to) filter.date = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };

  const field = q.sort.replace(/^-/, '');
  const sort = { [field]: q.sort.startsWith('-') ? -1 : 1, _id: 1 } as Record<string, 1 | -1>;
  const [items, total] = await Promise.all([
    TransactionModel.find(filter)
      .sort(sort)
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate('vendorId', 'name status taxId')
      .populate('productId', 'name sku status baseUnit'),
    TransactionModel.countDocuments(filter),
  ]);
  return { items, meta: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) } };
}

export async function getTransaction(tenantId: string, id: string) {
  const t = await TransactionModel.findOne({ _id: id, tenantId }).populate('vendorId', 'name status taxId').populate('productId', 'name sku status baseUnit');
  if (!t) throw AppError.notFound('Transaction not found');
  return t;
}
