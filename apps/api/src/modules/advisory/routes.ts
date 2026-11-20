import { Router } from 'express';
import { heavyLimiter } from '../../middleware/rateLimiter';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import * as controller from './controller';
import { createBenchmarkBody, generateBody, idParam, listBenchmarksQuery, listInsightsQuery, rfqBody, statusBody } from './schema';

export const advisoryRouter = Router();

advisoryRouter.get('/summary', asyncHandler(controller.summary));
advisoryRouter.get('/insights', validate({ query: listInsightsQuery }), asyncHandler(controller.listInsights));
advisoryRouter.get('/insights/:id', validate({ params: idParam }), asyncHandler(controller.getInsight));
advisoryRouter.post('/generate', heavyLimiter, validate({ body: generateBody }), asyncHandler(controller.generate));
advisoryRouter.patch('/insights/:id/status', validate({ params: idParam, body: statusBody }), asyncHandler(controller.updateStatus));
advisoryRouter.post('/insights/:id/rfq-draft', validate({ params: idParam, body: rfqBody }), asyncHandler(controller.rfqDraft));

advisoryRouter.get('/benchmarks', validate({ query: listBenchmarksQuery }), asyncHandler(controller.listBenchmarks));
advisoryRouter.post('/benchmarks', validate({ body: createBenchmarkBody }), asyncHandler(controller.createBenchmark));
advisoryRouter.delete('/benchmarks/:id', validate({ params: idParam }), asyncHandler(controller.deleteBenchmark));
