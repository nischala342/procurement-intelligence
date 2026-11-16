import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env';
import { sendSuccess } from '../../utils/response';
import { currentUser } from './guard';
import type { UserAttrs } from './model';
import type { LoginInput, SignupInput } from './schema';
import * as service from './service';
import { ACCESS_COOKIE, TOKEN_TTL_SECONDS, signAccessToken } from './tokens';

// HttpOnly keeps the JWT away from page scripts; SameSite=Lax blocks cross-site POSTs (CSRF) while
// allowing normal navigation. `secure` is enabled in production (HTTPS only).
const cookieOptions: CookieOptions = { httpOnly: true, sameSite: 'lax', secure: env.isProd, path: '/' };

type UserDoc = { _id: unknown; createdAt?: Date } & Pick<UserAttrs, 'email' | 'organizationName' | 'tenantId'>;

const toSession = (u: UserDoc) => ({
  user: { id: String(u._id), email: u.email, organizationName: u.organizationName, tenantId: String(u.tenantId), createdAt: u.createdAt },
});

function startSession(res: Response, user: UserDoc) {
  const token = signAccessToken({ userId: String(user._id), email: user.email, tenantId: String(user.tenantId) });
  res.cookie(ACCESS_COOKIE, token, { ...cookieOptions, maxAge: TOKEN_TTL_SECONDS * 1000 });
}

export async function signup(req: Request, res: Response) {
  const user = await service.signup(req.body as SignupInput);
  startSession(res, user); // a new account is signed in immediately
  return sendSuccess(res, toSession(user), undefined, 201);
}

export async function login(req: Request, res: Response) {
  const user = await service.login(req.body as LoginInput);
  startSession(res, user);
  return sendSuccess(res, toSession(user));
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie(ACCESS_COOKIE, cookieOptions);
  return sendSuccess(res, { loggedOut: true });
}

export async function me(req: Request, res: Response) {
  return sendSuccess(res, toSession(await service.getUser(currentUser(req).userId)));
}
