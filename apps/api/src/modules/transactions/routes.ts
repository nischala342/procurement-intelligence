import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import * as controller from './controller';
import { listTransactionsQuery, transactionIdParam } from './schema';

export const transactionsRouter = Router();

transactionsRouter.get('/', validate({ query: listTransactionsQuery }), asyncHandler(controller.list));
transactionsRouter.get('/:id', validate({ params: transactionIdParam }), asyncHandler(controller.getOne));
