import express from 'express';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { API_V1_PREFIX } from './config/constants';
import { logger } from './lib/logger';
import { applySecurityMiddleware } from './middleware/security';
import { corsMiddleware } from './middleware/cors';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { requestIdMiddleware } from './middleware/requestId';
import { notFoundHandler } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';
import { healthRouter } from './routes/health.routes';
import { rootRouter } from './routes/root.routes';
import { v1Router } from './routes/v1';

/**
 * Express application factory.
 * No `listen()` here — Vercel exports the app; local dev uses `server.ts`.
 */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestIdMiddleware);
  app.use(
    pinoHttp({
      logger,
      customProps: (req) => ({ requestId: req.requestId }),
      autoLogging: env.NODE_ENV !== 'test',
    }),
  );

  applySecurityMiddleware(app);
  app.use(corsMiddleware);
  app.use(rateLimitMiddleware);

  app.use(express.json({ limit: env.BODY_SIZE_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: env.BODY_SIZE_LIMIT }));
  app.use(cookieParser());

  app.use('/', rootRouter);
  app.use('/healthz', healthRouter);
  app.use(API_V1_PREFIX, v1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = createApp();
export default app;
