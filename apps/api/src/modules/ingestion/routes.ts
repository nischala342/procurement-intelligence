import { Router } from 'express';
import multer from 'multer';
import { env } from '../../config/env';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import * as controller from './controller';
import { createJobBody, jobIdParam, pageQuery, recordsQuery } from './schema';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });

export const ingestionRouter = Router();

ingestionRouter.post('/jobs', upload.single('file'), validate({ body: createJobBody }), asyncHandler(controller.createJob));
ingestionRouter.get('/records/:id', validate({ params: jobIdParam }), asyncHandler(controller.getRecord));
ingestionRouter.get('/jobs', validate({ query: pageQuery }), asyncHandler(controller.listJobs));
ingestionRouter.get('/jobs/:id', validate({ params: jobIdParam }), asyncHandler(controller.getJob));
ingestionRouter.get('/jobs/:id/records', validate({ params: jobIdParam, query: recordsQuery }), asyncHandler(controller.listRecords));
