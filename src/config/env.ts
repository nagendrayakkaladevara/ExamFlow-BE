import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const DEV_JWT_ACCESS_SECRET = 'dev-jwt-access-secret-min-32-characters!!';
const DEV_JWT_REFRESH_SECRET = 'dev-jwt-refresh-secret-min-32-characters!';
const DEV_CRON_SECRET = 'dev-cron-secret-min-32-characters-long!!';

/** Vercel often stores unset optional vars as "" — treat as undefined. */
function emptyToUndefined(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
}

function stripQuotes(value: string) {
  return value.replace(/^['"]|['"]$/g, '').trim();
}

const optionalString = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.string().url().optional(),
);

const optionalEmail = z.preprocess(
  emptyToUndefined,
  z.string().email().optional(),
);

const boolFromString = z.preprocess(
  emptyToUndefined,
  z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  BODY_SIZE_LIMIT: z.string().min(1).default('100kb'),
  DATABASE_URL: z.string().min(1).transform(stripQuotes),
  DIRECT_URL: z.preprocess(emptyToUndefined, z.string().min(1).transform(stripQuotes).optional()),
  JWT_ACCESS_SECRET: z.string().min(32).default(DEV_JWT_ACCESS_SECRET),
  JWT_REFRESH_SECRET: z.string().min(32).default(DEV_JWT_REFRESH_SECRET),
  JWT_ACCESS_EXPIRES_IN: z.preprocess(
    emptyToUndefined,
    z.string().min(1).default('15m').transform(stripQuotes),
  ),
  JWT_REFRESH_EXPIRES_IN: z.preprocess(
    emptyToUndefined,
    z.string().min(1).default('7d').transform(stripQuotes),
  ),
  COOKIE_SECURE: boolFromString,
  COOKIE_DOMAIN: optionalString,
  CRON_SECRET: z.string().min(32).default(DEV_CRON_SECRET),
  BLOB_READ_WRITE_TOKEN: optionalString,
  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: optionalString,
  SEED_ADMIN_EMAIL: optionalEmail,
  SEED_ADMIN_PASSWORD: optionalString,
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const message = `Invalid environment variables: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`;
  console.error(message);
  throw new Error(message);
}

const data = parsed.data;

/** Neon direct URL for migrations — falls back to pooled URL when unset. */
const directUrl =
  data.DIRECT_URL ??
  data.DATABASE_URL.replace('-pooler.', '.');

function envVarSet(name: string) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0;
}

if (data.NODE_ENV === 'production') {
  const missing: string[] = [];

  if (!envVarSet('JWT_ACCESS_SECRET')) missing.push('JWT_ACCESS_SECRET');
  if (!envVarSet('JWT_REFRESH_SECRET')) missing.push('JWT_REFRESH_SECRET');
  if (!envVarSet('CRON_SECRET')) missing.push('CRON_SECRET');
  if (!envVarSet('DATABASE_URL')) missing.push('DATABASE_URL');

  if (missing.length > 0) {
    const message = `Missing required production environment variables: ${missing.join(', ')}`;
    console.error(message);
    throw new Error(message);
  }
}

export const env = {
  ...data,
  DIRECT_URL: directUrl,
};

/** Prisma schema reads `env("DIRECT_URL")` — ensure it exists when only DATABASE_URL is set on Vercel. */
if (!process.env.DIRECT_URL?.trim()) {
  process.env.DIRECT_URL = directUrl;
}

export type Env = typeof env;
