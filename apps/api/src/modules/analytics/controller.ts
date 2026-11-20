import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { tenantOf } from '../auth/guard';
import type { OverviewQuery } from './schema';
import * as service from './service';

export async function overview(req: Request, res: Response) {
  const { months } = req.query as unknown as OverviewQuery;
  return sendSuccess(res, await service.getOverview(tenantOf(req), months));
}
