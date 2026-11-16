import type { Request, Response } from 'express';
import { sendError, sendSuccess } from '../../utils/response';
import { getHealth } from './service';

export async function healthController(_req: Request, res: Response) {
  const report = await getHealth();
  if (report.status !== 'ok') {
    return sendError(res, 503, { code: 'SERVICE_UNAVAILABLE', message: 'Database is unreachable', details: report });
  }
  return sendSuccess(res, report);
}
