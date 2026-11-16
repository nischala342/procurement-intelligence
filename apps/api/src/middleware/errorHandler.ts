import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../utils/AppError';
import { sendError } from '../utils/response';

export const notFoundHandler: RequestHandler = (req, res) => {
  sendError(res, 404, { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} not found` });
};

interface Normalized {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

function normalize(err: unknown): Normalized {
  if (err instanceof AppError) {
    return { status: err.statusCode, code: err.code, message: err.message, details: err.details };
  }
  if (err instanceof ZodError) {
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code })),
    };
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Data validation failed',
      details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    };
  }
  if (err instanceof mongoose.Error.CastError) {
    return { status: 400, code: 'INVALID_ID', message: `Invalid value for "${err.path}"`, details: { value: err.value } };
  }
  const e = err as { code?: number; keyValue?: unknown; type?: string; status?: number; message?: string };
  if (e?.code === 11000) {
    return { status: 409, code: 'DUPLICATE_KEY', message: 'A record with the same unique value already exists', details: e.keyValue };
  }
  const named = err as { name?: string; code?: string; message?: string };
  if (named?.name === 'MulterError') {
    return named.code === 'LIMIT_FILE_SIZE'
      ? { status: 413, code: 'PAYLOAD_TOO_LARGE', message: `Uploaded file exceeds the ${env.MAX_UPLOAD_MB} MB limit` }
      : { status: 400, code: 'UPLOAD_ERROR', message: named.message ?? 'Invalid upload' };
  }
  if (e?.type === 'entity.parse.failed') {
    return { status: 400, code: 'INVALID_JSON', message: 'Malformed JSON body' };
  }
  if (e?.type === 'entity.too.large') {
    return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const n = normalize(err);
  if (n.status >= 500) {
    logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error');
  } else {
    logger.debug({ code: n.code, url: req.originalUrl }, 'Request failed');
  }
  const details = n.details ?? (n.status >= 500 && !env.isProd ? { stack: (err as Error)?.stack } : undefined);
  sendError(res, n.status, { code: n.code, message: n.message, ...(details !== undefined ? { details } : {}) });
};
