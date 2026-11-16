import type { FilterQuery } from 'mongoose';
import { AppError } from '../../utils/AppError';
import { normalizeVendorName } from '../ingestion/normalise/names';
import { TransactionModel } from '../transactions/model';
import { VendorModel, type VendorAttrs } from './model';
import type { ListVendorsQuery, UpdateVendorInput } from './schema';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function listVendors(tenantId: string, q: ListVendorsQuery) {
  const filter: FilterQuery<VendorAttrs> = { tenantId };
  if (q.status) filter.status = q.status;
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), 'i');
    filter.$or = [{ name: rx }, { aliases: rx }, { taxId: rx }];
  }
  const [items, total] = await Promise.all([
    VendorModel.find(filter).sort({ name: 1, _id: 1 }).skip((q.page - 1) * q.limit).limit(q.limit),
    VendorModel.countDocuments(filter),
  ]);
  return { items, meta: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) } };
}

export async function getVendor(tenantId: string, id: string) {
  const v = await VendorModel.findOne({ _id: id, tenantId });
  if (!v) throw AppError.notFound('Vendor not found');
  return v;
}

export async function updateVendor(tenantId: string, id: string, input: UpdateVendorInput) {
  const vendor = await getVendor(tenantId, id);
  if (vendor.status === 'merged') throw AppError.conflict('A merged vendor cannot be edited');
  if (input.name) {
    vendor.name = input.name;
    vendor.normalizedName = normalizeVendorName(input.name) || vendor.normalizedName;
  }
  if (input.status) {
    vendor.status = input.status;
    vendor.set('possibleDuplicateOf', undefined);
    vendor.set('similarityScore', undefined);
  }
  await vendor.save();
  return vendor;
}

/** Merges `sourceId` into `targetId`: aliases move over, transactions are re-pointed, source is marked merged. */
export async function mergeVendors(tenantId: string, sourceId: string, targetId: string) {
  if (sourceId === targetId) throw AppError.badRequest('A vendor cannot be merged into itself');
  const [source, target] = await Promise.all([getVendor(tenantId, sourceId), getVendor(tenantId, targetId)]);
  if (source.status === 'merged') throw AppError.conflict('Source vendor is already merged');
  if (target.status === 'merged') throw AppError.conflict('Target vendor is itself merged; merge into its active vendor instead');

  await VendorModel.updateOne(
    { _id: target._id, tenantId },
    {
      $addToSet: {
        aliases: { $each: [source.name, ...source.aliases] },
        aliasKeys: { $each: [source.normalizedName, ...source.aliasKeys] },
      },
      $push: { mergeHistory: { vendorId: source._id, name: source.name, mergedAt: new Date() } },
      ...(source.taxId && !target.taxId ? { $set: { taxId: source.taxId } } : {}),
    },
  );
  const moved = await TransactionModel.updateMany({ tenantId, vendorId: source._id }, { $set: { vendorId: target._id } });
  await VendorModel.updateOne({ _id: source._id, tenantId }, { $set: { status: 'merged', mergedInto: target._id } });
  return { vendor: await getVendor(tenantId, targetId), transactionsMoved: moved.modifiedCount };
}
