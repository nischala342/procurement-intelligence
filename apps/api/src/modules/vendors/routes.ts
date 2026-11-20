import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import * as controller from './controller';
import { compareQuery, intelligenceQuery, listVendorsQuery, mergeVendorBody, updateVendorBody, vendorIdParam } from './schema';

export const vendorsRouter = Router();

vendorsRouter.get('/', validate({ query: listVendorsQuery }), asyncHandler(controller.list));
// must be declared before '/:id' so "compare" is not parsed as a vendor id
vendorsRouter.get('/compare', validate({ query: compareQuery }), asyncHandler(controller.compare));
vendorsRouter.get('/:id', validate({ params: vendorIdParam }), asyncHandler(controller.getOne));
vendorsRouter.get('/:id/intelligence', validate({ params: vendorIdParam, query: intelligenceQuery }), asyncHandler(controller.getIntelligence));
vendorsRouter.patch('/:id', validate({ params: vendorIdParam, body: updateVendorBody }), asyncHandler(controller.update));
vendorsRouter.post('/:id/merge', validate({ params: vendorIdParam, body: mergeVendorBody }), asyncHandler(controller.merge));
