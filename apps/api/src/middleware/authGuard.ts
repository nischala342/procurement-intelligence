import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * API-key guard. A no-op when API_KEY is unset (local dev); otherwise requires `x-api-key`.
 * Swap this for JWT/session auth when a real auth module is added.
 */
export const authGuard: RequestHandler = (req, _res, next) => {
  if (!env.API_KEY) return next();
  const provided = req.header('x-api-key');
  if (!provided || !safeEqual(provided, env.API_KEY)) return next(AppError.unauthorized('Invalid or missing API key'));
  next();
};
