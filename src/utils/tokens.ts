import { createHash, randomBytes, randomUUID } from 'crypto';
import ms, { type StringValue } from 'ms';

/** Generate a cryptographically secure opaque refresh token. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hash an opaque refresh token for storage (deterministic lookup). */
export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Generate a refresh-token rotation family id. */
export function generateTokenFamily(): string {
  return randomUUID();
}

/** Parse duration strings like 15m, 7d, 2 days into seconds. */
export function parseDurationToSeconds(duration: string): number {
  const milliseconds = ms(duration.trim() as StringValue);
  if (milliseconds === undefined) {
    throw new Error(`Invalid duration format: ${duration}`);
  }
  return Math.floor(milliseconds / 1000);
}
