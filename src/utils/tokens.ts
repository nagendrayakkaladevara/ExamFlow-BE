import { createHash, randomBytes, randomUUID } from 'crypto';

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

/** Parse duration strings like 15m, 7d, 1h into seconds. */
export function parseDurationToSeconds(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration.trim());
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const value = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 60 * 60;
    case 'd':
      return value * 60 * 60 * 24;
    default:
      throw new Error(`Unsupported duration unit: ${unit}`);
  }
}
