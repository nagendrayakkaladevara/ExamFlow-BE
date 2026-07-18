import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

/** Verify cron routes using a shared bearer secret. */
export function requireCronSecret(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(ApiError.unauthorized('Missing cron authorization'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token || token !== env.CRON_SECRET) {
    next(ApiError.unauthorized('Invalid cron secret'));
    return;
  }

  next();
}
