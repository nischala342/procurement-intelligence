import type { Request, Response } from 'express';
import { AppError } from '../../utils/AppError';
import { sendSuccess } from '../../utils/response';
import { tenantOf } from '../auth/guard';
import type { CreateJobBody } from './schema';
import * as service from './service';

export async function createJob(req: Request, res: Response) {
  if (!req.file) throw new AppError(400, 'FILE_REQUIRED', 'Multipart field "file" is required');
  const body = req.body as CreateJobBody;
  const job = await service.runIngestion({
    tenantId: tenantOf(req),
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    sourceType: body.sourceType,
    ...(body.dayFirst !== undefined ? { dayFirst: body.dayFirst } : {}),
    ...(body.defaultCurrency ? { defaultCurrency: body.defaultCurrency } : {}),
    ...(body.allowDuplicate ? { allowDuplicate: true } : {}),
  });
  return sendSuccess(res, await service.withReviewPending(job), undefined, 201);
}

export async function listJobs(req: Request, res: Response) {
  const { page, limit } = req.query as unknown as { page: number; limit: number };
  const { items, meta } = await service.listJobs(tenantOf(req), page, limit);
  return sendSuccess(res, items, meta);
}

export async function getJob(req: Request, res: Response) {
  return sendSuccess(res, await service.withReviewPending(await service.getJob(tenantOf(req), req.params.id as string)));
}

export async function listRecords(req: Request, res: Response) {
  const q = req.query as unknown as { page: number; limit: number; status?: 'normalized' | 'error' };
  const { items, meta } = await service.listJobRecords(tenantOf(req), req.params.id as string, q.page, q.limit, q.status);
  return sendSuccess(res, items, meta);
}

export async function getRecord(req: Request, res: Response) {
  return sendSuccess(res, await service.getRawRecord(tenantOf(req), req.params.id as string));
}
