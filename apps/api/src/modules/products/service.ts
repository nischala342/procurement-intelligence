import { AppError } from '../../utils/AppError';
import { TransactionModel } from '../transactions/model';
import { ProductModel } from './model';
import type { UpdateProductInput } from './schema';

export async function getProduct(tenantId: string, id: string) {
  const p = await ProductModel.findOne({ _id: id, tenantId });
  if (!p) throw AppError.notFound('Product not found');
  return p;
}

export async function updateProduct(tenantId: string, id: string, input: UpdateProductInput) {
  const product = await getProduct(tenantId, id);
  if (product.status === 'merged') throw AppError.conflict('A merged product cannot be edited');
  if (input.leadTimeDays !== undefined) product.set('leadTimeDays', input.leadTimeDays ?? undefined); // null clears
  if (input.safetyStockDays !== undefined) product.set('safetyStockDays', input.safetyStockDays ?? undefined);
  if (input.status) {
    product.status = input.status;
    product.set('possibleDuplicateOf', undefined);
    product.set('similarityScore', undefined);
  }
  await product.save();
  return product;
}

/** Merges `sourceId` into `targetId`: aliases move over, transactions are re-pointed, source is marked merged. */
export async function mergeProducts(tenantId: string, sourceId: string, targetId: string) {
  if (sourceId === targetId) throw AppError.badRequest('A product cannot be merged into itself');
  const [source, target] = await Promise.all([getProduct(tenantId, sourceId), getProduct(tenantId, targetId)]);
  if (source.status === 'merged') throw AppError.conflict('Source product is already merged');
  if (target.status === 'merged') throw AppError.conflict('Target product is itself merged; merge into its active product instead');

  await ProductModel.updateOne(
    { _id: target._id, tenantId },
    {
      $addToSet: {
        aliases: { $each: [source.name, ...source.aliases] },
        aliasKeys: { $each: [source.normalizedName, ...source.aliasKeys] },
      },
      ...(source.sku && !target.sku ? { $set: { sku: source.sku } } : {}),
    },
  );
  const moved = await TransactionModel.updateMany({ tenantId, productId: source._id }, { $set: { productId: target._id } });
  await ProductModel.updateOne({ _id: source._id, tenantId }, { $set: { status: 'merged', mergedInto: target._id } });
  return { product: await getProduct(tenantId, targetId), transactionsMoved: moved.modifiedCount };
}
