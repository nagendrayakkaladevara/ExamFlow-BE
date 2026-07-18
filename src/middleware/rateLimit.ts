import rateLimit, { type Options, type Store } from 'express-rate-limit';
import { globalRateLimitOptions } from '../config/security';
import { env } from '../config/env';

function createStore(prefix: string): Store | undefined {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return undefined;
  }

  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  return {
    init: () => {},
    async increment(key: string) {
      const redisKey = `${prefix}:${key}`;
      const pipeline = [
        ['INCR', redisKey],
        ['EXPIRE', redisKey, '900'],
      ];
      const res = await fetch(`${url}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(pipeline),
      });
      const data = (await res.json()) as { result: unknown[] };
      const totalHits = Number((data.result?.[0] as { result?: number })?.result ?? 1);
      return { totalHits, resetTime: new Date(Date.now() + 900_000) };
    },
    async decrement(key: string) {
      const redisKey = `${prefix}:${key}`;
      await fetch(`${url}/decr/${encodeURIComponent(redisKey)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    async resetKey(key: string) {
      const redisKey = `${prefix}:${key}`;
      await fetch(`${url}/del/${encodeURIComponent(redisKey)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
  };
}

function buildLimiter(options: Partial<Options>) {
  const store = createStore(options.windowMs?.toString() ?? 'default');
  return rateLimit({
    ...options,
    ...(store ? { store } : {}),
  });
}

export const rateLimitMiddleware = buildLimiter(globalRateLimitOptions);

export const loginRateLimit = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many login attempts' },
  },
});

export const refreshRateLimit = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many refresh attempts' },
  },
});

export const autosaveRateLimit = buildLimiter({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anon',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Autosave rate limit exceeded' },
  },
});

export const uploadRateLimit = buildLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anon',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Upload rate limit exceeded' },
  },
});
