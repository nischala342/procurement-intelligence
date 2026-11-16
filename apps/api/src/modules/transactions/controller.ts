import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { tenantOf } from '../auth/guard';
import type { ListTransactionsQuery } from './schema';
import * as service from './service';

export async function list(req: Request, res: Response) {
  const { items, meta } = await service.listTransactions(tenantOf(req), req.query as unknown as ListTransactionsQuery);
  return sendSuccess(res, items, meta);
}
export async function getOne(req: Request, res: Response) {
  return sendSuccess(res, await service.getTransaction(tenantOf(req), req.params.id as string));
}
