import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { tenantOf } from '../auth/guard';
import * as intelligence from './intelligence.service';
import type { AlternativesQuery, ListProductsQuery, ProductIntelligenceQuery, UpdateProductInput } from './schema';
import * as service from './service';

const idOf = (req: Request) => req.params.id as string;

export async function list(req: Request, res: Response) {
  const { items, meta } = await intelligence.listProductsWithSummary(tenantOf(req), req.query as unknown as ListProductsQuery);
  return sendSuccess(res, items, meta);
}
export async function getOne(req: Request, res: Response) {
  return sendSuccess(res, await service.getProduct(tenantOf(req), idOf(req)));
}
export async function update(req: Request, res: Response) {
  return sendSuccess(res, await service.updateProduct(tenantOf(req), idOf(req), req.body as UpdateProductInput));
}
export async function merge(req: Request, res: Response) {
  return sendSuccess(res, await service.mergeProducts(tenantOf(req), idOf(req), (req.body as { targetId: string }).targetId));
}
export async function getIntelligence(req: Request, res: Response) {
  const { asOf } = req.query as unknown as ProductIntelligenceQuery;
  return sendSuccess(res, await intelligence.getProductIntelligence(tenantOf(req), idOf(req), asOf ? { asOf } : {}));
}
export async function getAlternatives(req: Request, res: Response) {
  const { includeSimilar } = req.query as unknown as AlternativesQuery;
  return sendSuccess(res, await intelligence.getProductAlternatives(tenantOf(req), idOf(req), includeSimilar));
}
