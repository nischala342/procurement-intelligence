import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { healthController } from './controller';

export const healthRouter = Router();

healthRouter.get('/', asyncHandler(healthController));
