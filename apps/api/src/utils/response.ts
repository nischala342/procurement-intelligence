import type { Response } from 'express';

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiErrorBody;
  meta?: Record<string, unknown>;
}

export function sendSuccess<T>(res: Response, data: T, meta?: Record<string, unknown>, status = 200): Response {
  const body: ApiEnvelope<T> = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export function sendError(res: Response, status: number, error: ApiErrorBody, meta?: Record<string, unknown>): Response {
  const body: ApiEnvelope<never> = { success: false, error };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}
