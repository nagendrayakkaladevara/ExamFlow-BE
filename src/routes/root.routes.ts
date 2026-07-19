import { Router } from 'express';
import { API_V1_PREFIX } from '../config/constants';
import { env } from '../config/env';

export const rootRouter = Router();

/** GET / — welcome / deployment status (visible on Vercel dashboard) */
rootRouter.get('/', (req, res) => {
  res.status(200).json({
    ok: true,
    name: 'ExamFlow API',
    version: '0.1.0',
    environment: env.NODE_ENV,
    requestId: req.requestId,
    endpoints: {
      health: '/healthz',
      api: API_V1_PREFIX,
    },
    timestamp: new Date().toISOString(),
  });
});
