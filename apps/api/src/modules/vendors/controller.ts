import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { tenantOf } from '../auth/guard';
import type { ListVendorsQuery, UpdateVendorInput } from './schema';
import * as service from './service';

const idOf = (req: Request) => req.params.id as string;

export async function list(req: Request, res: Response) {
  const { items, meta } = await service.listVendors(tenantOf(req), req.query as unknown as ListVendorsQuery);
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
