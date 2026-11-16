import { Router } from 'express';
import { authGuard } from '../../middleware/authGuard';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import * as controller from './controller';
import { createItemBody, listItemsQuery, objectIdParam, updateItemBody } from './schema';

export const itemsRouter = Router();

itemsRouter.get('/', validate({ query: listItemsQuery }), asyncHandler(controller.list));
itemsRouter.get('/:id', validate({ params: objectIdParam }), asyncHandler(controller.getOne));
itemsRouter.post('/', authGuard, validate({ body: createItemBody }), asyncHandler(controller.create));
itemsRouter.patch(
  '/:id',
  authGuard,
  validate({ params: objectIdParam, body: updateItemBody }),
  asyncHandler(controller.update),
);
itemsRouter.delete('/:id', authGuard, validate({ params: objectIdParam }), asyncHandler(controller.remove));
