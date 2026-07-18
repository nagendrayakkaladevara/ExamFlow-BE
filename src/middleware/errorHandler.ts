import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { ApiError } from '../utils/ApiError';
import type { ApiErrorResponse } from '../types/api';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const requestId = req.requestId;

  if (err instanceof ApiError) {
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
      requestId,
    };
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof ZodError) {
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.flatten(),
      },
      requestId,
    };
    res.status(400).json(body);
    return;
  }

  // CORS errors from the cors package surface as Error with a message.
  if (err instanceof Error && err.message.startsWith('CORS origin not allowed')) {
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: 'CORS_DENIED',
        message: 'Origin not allowed',
      },
      requestId,
    };
    res.status(403).json(body);
    return;
  }

  logger.error({ err, requestId }, 'Unhandled error');

  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message:
        env.NODE_ENV === 'production'
          ? 'Internal server error'
          : err instanceof Error
            ? err.message
            : 'Internal server error',
    },
    requestId,
  };

  res.status(500).json(body);
}
