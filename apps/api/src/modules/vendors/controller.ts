import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { tenantOf } from '../auth/guard';
import { tenantCurrency } from '../auth/tenantSettings';
import * as intelligence from './intelligence.service';
import type { CompareQuery, IntelligenceQuery, ListVendorsQuery, UpdateVendorInput } from './schema';
import * as service from './service';

const idOf = (req: Request) => req.params.id as string;

export async function list(req: Request, res: Response) {
  const { items, meta } = await intelligence.listVendorsWithSummary(tenantOf(req), req.query as unknown as ListVendorsQuery);
  return sendSuccess(res, items, meta);
}
export async function getOne(req: Request, res: Response) {
  return sendSuccess(res, await service.getVendor(tenantOf(req), idOf(req)));
}
export async function update(req: Request, res: Response) {
  return sendSuccess(res, await service.updateVendor(tenantOf(req), idOf(req), req.body as UpdateVendorInput));
}
export async function merge(req: Request, res: Response) {
  return sendSuccess(res, await service.mergeVendors(tenantOf(req), idOf(req), (req.body as { targetId: string }).targetId));
}
export async function getIntelligence(req: Request, res: Response) {
  const { granularity } = req.query as unknown as IntelligenceQuery;
  return sendSuccess(res, await intelligence.getVendorIntelligence(tenantOf(req), idOf(req), granularity));
}
export async function compare(req: Request, res: Response) {
  const q = req.query as unknown as CompareQuery;
  const products = await intelligence.compareSuppliers(tenantOf(req), q.productIds, {
    ...(q.baselineVendorId ? { baselineVendorId: q.baselineVendorId } : {}),
    includeSimilar: q.includeSimilar,
  });
  return sendSuccess(res, products, { productCount: products.length, currency: await tenantCurrency(tenantOf(req)), priceBasis: 'latest price per base unit, in the base currency' });
}
