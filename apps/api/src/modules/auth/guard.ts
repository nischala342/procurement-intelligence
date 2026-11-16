import type { Request, RequestHandler } from 'express';
import { AppError } from '../../utils/AppError';
import { ACCESS_COOKIE, verifyAccessToken, type AuthUser } from './tokens';

/**
 * Requires a valid session (HTTP-only `accessToken` cookie, or `Authorization: Bearer` for API clients)
 * and attaches `req.user = { userId, email, tenantId }`. Responds 401 otherwise.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const bearer = req.header('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  const token = (req.cookies?.[ACCESS_COOKIE] as string | undefined) ?? bearer;
  const user = token ? verifyAccessToken(token) : null;
  if (!user) return next(AppError.unauthorized('Authentication required'));
  req.user = user;
  next();
};

/** The authenticated user. Throws 401 if the guard did not run (defence in depth). */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw AppError.unauthorized('Authentication required');
  return req.user;
}

/** Tenant of the caller. Always derive tenant scope from this, never from request input. */
export const tenantOf = (req: Request): string => currentUser(req).tenantId;
