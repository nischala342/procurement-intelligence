import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import * as controller from './controller';
import { listVendorsQuery, mergeVendorBody, updateVendorBody, vendorIdParam } from './schema';

export const vendorsRouter = Router();

vendorsRouter.get('/', validate({ query: listVendorsQuery }), asyncHandler(controller.list));
vendorsRouter.get('/:id', validate({ params: vendorIdParam }), asyncHandler(controller.getOne));
vendorsRouter.patch('/:id', validate({ params: vendorIdParam, body: updateVendorBody }), asyncHandler(controller.update));
vendorsRouter.post('/:id/merge', validate({ params: vendorIdParam, body: mergeVendorBody }), asyncHandler(controller.merge));
