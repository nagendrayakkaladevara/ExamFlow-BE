import jwt, { type SignOptions } from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  tokenVersion: number;
}

/** Issue a short-lived access JWT. */
export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  const options: SignOptions = {
    algorithm: 'HS256',
    subject: payload.sub,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  };

  return jwt.sign(
    {
      role: payload.role,
      tokenVersion: payload.tokenVersion,
    },
    env.JWT_ACCESS_SECRET,
    options,
  );
}

/** Verify and decode an access JWT. */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ['HS256'],
  }) as jwt.JwtPayload;

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
