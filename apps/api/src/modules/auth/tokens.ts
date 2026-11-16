import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

export const ACCESS_COOKIE = 'accessToken';
export const TOKEN_TTL_SECONDS = env.JWT_EXPIRES_DAYS * 24 * 60 * 60;

export interface AuthUser {
  userId: string;
  email: string;
  tenantId: string;
}

export function signAccessToken(user: AuthUser): string {
  return jwt.sign({ email: user.email, tid: user.tenantId }, env.jwtSecret, {
    algorithm: 'HS256',
    subject: user.userId,
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

/** Returns the authenticated user, or null for any invalid/expired/malformed token. */
export function verifyAccessToken(token: string): AuthUser | null {
  try {
    const p = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    if (typeof p === 'string' || !p.sub || typeof p.email !== 'string' || typeof p.tid !== 'string') return null;
    if (!/^[a-f\d]{24}$/i.test(p.sub) || !/^[a-f\d]{24}$/i.test(p.tid)) return null;
    return { userId: p.sub, email: p.email, tenantId: p.tid };
  } catch {
    return null;
  }
}
