import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import * as controller from './controller';
import { alternativesQuery, listProductsQuery, mergeProductBody, productIdParam, productIntelligenceQuery, updateProductBody } from './schema';

export const productsRouter = Router();

productsRouter.get('/', validate({ query: listProductsQuery }), asyncHandler(controller.list));
productsRouter.get('/:id', validate({ params: productIdParam }), asyncHandler(controller.getOne));
productsRouter.get('/:id/intelligence', validate({ params: productIdParam, query: productIntelligenceQuery }), asyncHandler(controller.getIntelligence));
productsRouter.get('/:id/alternatives', validate({ params: productIdParam, query: alternativesQuery }), asyncHandler(controller.getAlternatives));
productsRouter.patch('/:id', validate({ params: productIdParam, body: updateProductBody }), asyncHandler(controller.update));
productsRouter.post('/:id/merge', validate({ params: productIdParam, body: mergeProductBody }), asyncHandler(controller.merge));
