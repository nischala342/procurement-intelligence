import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { tenantOf } from '../auth/guard';
import type { ListProductsQuery } from './schema';
import * as service from './service';

const idOf = (req: Request) => req.params.id as string;

export async function list(req: Request, res: Response) {
  const { items, meta } = await service.listProducts(tenantOf(req), req.query as unknown as ListProductsQuery);
  return sendSuccess(res, items, meta);
}
export async function getOne(req: Request, res: Response) {
  return sendSuccess(res, await service.getProduct(tenantOf(req), idOf(req)));
}
export async function confirm(req: Request, res: Response) {
  return sendSuccess(res, await service.confirmProduct(tenantOf(req), idOf(req)));
}
export async function merge(req: Request, res: Response) {
  return sendSuccess(res, await service.mergeProducts(tenantOf(req), idOf(req), (req.body as { targetId: string }).targetId));
}
