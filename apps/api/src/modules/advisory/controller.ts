import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { currentUser, tenantOf } from '../auth/guard';
import * as service from './advisory.service';
import { buildRfqDraft } from './rfq.service';
import type { CreateBenchmarkBody, GenerateBody, ListInsightsQuery, RfqBody, StatusBody } from './schema';

const idOf = (req: Request) => req.params.id as string;

export async function listInsights(req: Request, res: Response) {
  const { items, meta } = await service.listInsights(tenantOf(req), req.query as unknown as ListInsightsQuery);
  return sendSuccess(res, items, meta);
}
export async function getInsight(req: Request, res: Response) {
  return sendSuccess(res, await service.getInsight(tenantOf(req), idOf(req)));
}
export async function summary(req: Request, res: Response) {
  return sendSuccess(res, await service.getSummary(tenantOf(req)));
}
export async function generate(req: Request, res: Response) {
  const b = req.body as GenerateBody;
  const u = currentUser(req);
  return sendSuccess(res, await service.runScan(u.tenantId, u.userId, { ...(b.asOf ? { asOf: b.asOf } : {}), ...(b.windowDays ? { windowDays: b.windowDays } : {}), minVendors: b.minVendors }));
}
export async function updateStatus(req: Request, res: Response) {
  const u = currentUser(req);
  const b = req.body as StatusBody;
  return sendSuccess(res, await service.updateInsightStatus(u.tenantId, u.email, idOf(req), { status: b.status, ...(b.snoozeDays ? { snoozeDays: b.snoozeDays } : {}), ...(b.note ? { note: b.note } : {}) }));
}
export async function rfqDraft(req: Request, res: Response) {
  const b = req.body as RfqBody;
  return sendSuccess(res, await buildRfqDraft(tenantOf(req), idOf(req), { ...(b.vendorIds ? { vendorIds: b.vendorIds } : {}), ...(b.targetQuantity ? { targetQuantity: b.targetQuantity } : {}), ...(b.notes ? { notes: b.notes } : {}) }));
}

export async function createBenchmark(req: Request, res: Response) {
  const u = currentUser(req);
  const b = req.body as CreateBenchmarkBody;
  return sendSuccess(res, await service.createBenchmark(u.tenantId, u.email, { ...b, ...(b.sourceUrl ? { sourceUrl: b.sourceUrl } : {}), ...(b.notes ? { notes: b.notes } : {}) }), undefined, 201);
}
export async function listBenchmarks(req: Request, res: Response) {
  return sendSuccess(res, await service.listBenchmarks(tenantOf(req), (req.query as { productId?: string }).productId));
}
export async function deleteBenchmark(req: Request, res: Response) {
  await service.deleteBenchmark(tenantOf(req), idOf(req));
  return sendSuccess(res, { id: idOf(req), deleted: true });
}
