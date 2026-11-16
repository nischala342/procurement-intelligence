import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { healthRouter } from './modules/health/routes';
import { authRouter } from './modules/auth/routes';
import { requireAuth } from './modules/auth/guard';
import { ingestionRouter } from './modules/ingestion/routes';
import { itemsRouter } from './modules/items/routes';
import { productsRouter } from './modules/products/routes';
import { referenceRouter } from './modules/reference/routes';
import { transactionsRouter } from './modules/transactions/routes';
import { vendorsRouter } from './modules/vendors/routes';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(compression());
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api', rateLimiter);

  const v1 = express.Router();
  v1.use('/health', healthRouter);
  v1.use('/items', itemsRouter);
  v1.use('/auth', authRouter);
  // Everything below handles tenant data: a valid session is mandatory and every query is tenant-scoped.
  v1.use('/ingestion', requireAuth, ingestionRouter);
  v1.use('/vendors', requireAuth, vendorsRouter);
  v1.use('/products', requireAuth, productsRouter);
  v1.use('/transactions', requireAuth, transactionsRouter);
  v1.use('/reference', referenceRouter);
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
