import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import * as controller from './controller';
import { overviewQuery } from './schema';

export const analyticsRouter = Router();

analyticsRouter.get('/overview', validate({ query: overviewQuery }), asyncHandler(controller.overview));
