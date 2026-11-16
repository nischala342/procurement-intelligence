import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import * as controller from './controller';
import { listProductsQuery, mergeProductBody, productIdParam, updateProductBody } from './schema';

export const productsRouter = Router();

productsRouter.get('/', validate({ query: listProductsQuery }), asyncHandler(controller.list));
productsRouter.get('/:id', validate({ params: productIdParam }), asyncHandler(controller.getOne));
productsRouter.patch('/:id', validate({ params: productIdParam, body: updateProductBody }), asyncHandler(controller.confirm));
productsRouter.post('/:id/merge', validate({ params: productIdParam, body: mergeProductBody }), asyncHandler(controller.merge));
