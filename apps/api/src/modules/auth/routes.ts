import { Router } from 'express';
import { loginLimiter, signupLimiter } from '../../middleware/rateLimiter';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import * as controller from './controller';
import { requireAuth } from './guard';
import { loginBody, signupBody } from './schema';

export const authRouter = Router();

authRouter.post('/signup', signupLimiter, validate({ body: signupBody }), asyncHandler(controller.signup));
authRouter.post('/login', loginLimiter, validate({ body: loginBody }), asyncHandler(controller.login));
authRouter.post('/logout', asyncHandler(controller.logout));
authRouter.get('/me', requireAuth, asyncHandler(controller.me));
