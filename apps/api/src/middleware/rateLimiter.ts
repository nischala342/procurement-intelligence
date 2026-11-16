import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { sendError } from '../utils/response';

export const rateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) =>
    sendError(res, 429, { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' }),
});

const authWindowMs = 15 * 60 * 1000;
const tooMany = (_req: unknown, res: Parameters<typeof sendError>[0]) =>
  sendError(res, 429, { code: 'RATE_LIMITED', message: 'Too many attempts, please try again in a few minutes.' });

/** Brute-force guard: only failed logins count against the limit. */
export const loginLimiter = rateLimit({
  windowMs: authWindowMs,
  limit: env.AUTH_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: tooMany,
});

/** Account-creation throttle: every attempt counts. */
export const signupLimiter = rateLimit({
  windowMs: authWindowMs,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: tooMany,
});
