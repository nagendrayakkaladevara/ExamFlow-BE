import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const DEV_JWT_ACCESS_SECRET = 'dev-jwt-access-secret-min-32-characters!!';
const DEV_JWT_REFRESH_SECRET = 'dev-jwt-refresh-secret-min-32-characters!';
const DEV_CRON_SECRET = 'dev-cron-secret-min-32-characters-long!!';

const boolFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  BODY_SIZE_LIMIT: z.string().min(1).default('100kb'),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  JWT_ACCESS_SECRET: z.string().min(32).default(DEV_JWT_ACCESS_SECRET),
  JWT_REFRESH_SECRET: z.string().min(32).default(DEV_JWT_REFRESH_SECRET),
  JWT_ACCESS_EXPIRES_IN: z.string().min(1).default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().min(1).default('7d'),
  COOKIE_SECURE: boolFromString,
  COOKIE_DOMAIN: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(32).default(DEV_CRON_SECRET),
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const data = parsed.data;

/** Neon direct URL for migrations — falls back to pooled URL when unset. */
const directUrl =
  data.DIRECT_URL ??
  data.DATABASE_URL.replace('-pooler.', '.');

if (data.NODE_ENV === 'production') {
  const missing: string[] = [];

  if (!process.env.JWT_ACCESS_SECRET) missing.push('JWT_ACCESS_SECRET');
  if (!process.env.JWT_REFRESH_SECRET) missing.push('JWT_REFRESH_SECRET');
  if (!process.env.CRON_SECRET) missing.push('CRON_SECRET');
  if (!process.env.BLOB_READ_WRITE_TOKEN) missing.push('BLOB_READ_WRITE_TOKEN');
  if (!process.env.DIRECT_URL) missing.push('DIRECT_URL');

  if (missing.length > 0) {
    console.error(`Missing required production environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

export const env = {
  ...data,
  DIRECT_URL: directUrl,
};

export type Env = typeof env;
