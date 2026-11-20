import { AppError } from '../../utils/AppError';
import { normalizeVendorName } from '../ingestion/normalise/names';
import { TransactionModel } from '../transactions/model';
import { VendorModel } from './model';
import type { UpdateVendorInput } from './schema';

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
  if (input.paymentTermsDays !== undefined) {
    vendor.set('paymentTermsDays', input.paymentTermsDays ?? undefined); // null clears
    vendor.set('paymentTermsSource', input.paymentTermsDays == null ? undefined : 'configured');
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
