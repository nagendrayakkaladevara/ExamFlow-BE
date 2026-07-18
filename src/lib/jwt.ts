import { SignJWT, jwtVerify } from 'jose';
import type { UserRole } from '@prisma/client';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  tokenVersion: number;
}

function accessSecretKey() {
  return new TextEncoder().encode(env.JWT_ACCESS_SECRET);
}

/** Issue a short-lived access JWT. */
export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({
    role: payload.role,
    tokenVersion: payload.tokenVersion,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_EXPIRES_IN)
    .sign(accessSecretKey());
}

/** Verify and decode an access JWT. */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, accessSecretKey());

  if (
    typeof payload.sub !== 'string' ||
    typeof payload.role !== 'string' ||
    typeof payload.tokenVersion !== 'number'
  ) {
    throw new Error('Invalid access token payload');
  }

  return {
    sub: payload.sub,
    role: payload.role as UserRole,
    tokenVersion: payload.tokenVersion,
  };
}
