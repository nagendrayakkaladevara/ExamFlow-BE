import type { HelmetOptions } from 'helmet';
import type { Options as RateLimitOptions } from 'express-rate-limit';

/** Helmet options tuned for a JSON API (no loose script CSP). */
export const helmetOptions: HelmetOptions = {
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  noSniff: true,
  xssFilter: true,
};

/** Global API rate limit — in-memory store is OK for local/dev only. */
export const globalRateLimitOptions: Partial<RateLimitOptions> = {
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    },
  },
};
