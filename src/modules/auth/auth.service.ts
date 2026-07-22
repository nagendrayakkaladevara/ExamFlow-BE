import type { User } from '@prisma/client';
import { env } from '../../config/env';
import {
  AUTH_LOCKOUT_MAX_ATTEMPTS,
  AUTH_LOCKOUT_WINDOW_MS,
} from '../../config/auth';
import { signAccessToken } from '../../lib/jwt';
import { hashPassword, verifyPassword } from '../../lib/password';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import {
  generateOpaqueToken,
  generateTokenFamily,
  hashOpaqueToken,
  parseDurationToSeconds,
} from '../../utils/tokens';
import type {
  ChangePasswordInput,
  LoginInput,
  ResetPasswordInput,
} from './auth.schema';

const userPublicSelect = {
  id: true,
  email: true,
  role: true,
  firstName: true,
  lastName: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type PublicUser = Omit<
  Pick<User, keyof typeof userPublicSelect>,
  never
>;

export interface LoginResult {
  accessToken: string;
  expiresIn: string;
  refreshToken: string;
  refreshMaxAgeSeconds: number;
  user: PublicUser;
}

export interface RefreshResult {
  accessToken: string;
  expiresIn: string;
  refreshToken: string;
  refreshMaxAgeSeconds: number;
}

function getRefreshExpiryDate(): Date {
  const seconds = parseDurationToSeconds(env.JWT_REFRESH_EXPIRES_IN);
  return new Date(Date.now() + seconds * 1000);
}

function getRefreshMaxAgeSeconds(): number {
  return parseDurationToSeconds(env.JWT_REFRESH_EXPIRES_IN);
}

async function countRecentFailedAttempts(email: string): Promise<number> {
  const since = new Date(Date.now() - AUTH_LOCKOUT_WINDOW_MS);
  return prisma.loginAttempt.count({
    where: {
      email,
      success: false,
      createdAt: { gte: since },
    },
  });
}

async function recordLoginAttempt(
  email: string,
  success: boolean,
  ipAddress?: string,
): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      email,
      success,
      ipAddress,
    },
  });
}

async function assertNotLockedOut(email: string): Promise<void> {
  const failedAttempts = await countRecentFailedAttempts(email);
  if (failedAttempts >= AUTH_LOCKOUT_MAX_ATTEMPTS) {
    throw ApiError.unauthorized(
      'Too many failed login attempts. Try again later.',
      'ACCOUNT_LOCKED',
    );
  }
}

async function createRefreshTokenRecord(
  userId: string,
  family: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  const expiresAt = getRefreshExpiryDate();

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      family,
      expiresAt,
      createdByIp: ipAddress,
      userAgent,
    },
  });

  return { token, expiresAt };
}

async function revokeRefreshFamily(family: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: {
      family,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export async function login(
  input: LoginInput,
  ipAddress?: string,
  userAgent?: string,
): Promise<LoginResult> {
  await assertNotLockedOut(input.email);

  const user = await prisma.user.findFirst({
    where: {
      email: input.email,
      deletedAt: null,
    },
  });

  const invalidCredentials = () =>
    ApiError.unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');

  if (!user || !user.isActive) {
    await recordLoginAttempt(input.email, false, ipAddress);
    throw invalidCredentials();
  }

  const passwordValid = await verifyPassword(user.passwordHash, input.password);
  if (!passwordValid) {
    await recordLoginAttempt(input.email, false, ipAddress);
    throw invalidCredentials();
  }

  await recordLoginAttempt(input.email, true, ipAddress);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const family = generateTokenFamily();
  const { token: refreshToken } = await createRefreshTokenRecord(
    user.id,
    family,
    ipAddress,
    userAgent,
  );

  const accessToken = await signAccessToken({
    sub: user.id,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });

  const publicUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: userPublicSelect,
  });

  return {
    accessToken,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshToken,
    refreshMaxAgeSeconds: getRefreshMaxAgeSeconds(),
    user: publicUser,
  };
}

export async function refresh(refreshToken: string): Promise<RefreshResult> {
  const tokenHash = hashOpaqueToken(refreshToken);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  if (!stored) {
    throw ApiError.unauthorized('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }

  if (stored.revokedAt) {
    await revokeRefreshFamily(stored.family);
    throw ApiError.unauthorized('Refresh token reuse detected', 'REFRESH_TOKEN_REUSE');
  }

  if (stored.expiresAt <= new Date()) {
    await revokeRefreshFamily(stored.family);
    throw ApiError.unauthorized('Refresh token expired', 'REFRESH_TOKEN_EXPIRED');
  }

  const user = await prisma.user.findFirst({
    where: {
      id: stored.userId,
      deletedAt: null,
      isActive: true,
    },
  });

  if (!user) {
    await revokeRefreshFamily(stored.family);
    throw ApiError.unauthorized('User not found or inactive');
  }

  const newToken = generateOpaqueToken();
  const newTokenHash = hashOpaqueToken(newToken);
  const expiresAt = getRefreshExpiryDate();

  const rotated = await prisma.refreshToken.create({
    data: {
      userId: stored.userId,
      tokenHash: newTokenHash,
      family: stored.family,
      expiresAt,
      createdByIp: stored.createdByIp ?? undefined,
      userAgent: stored.userAgent ?? undefined,
    },
  });

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: {
      revokedAt: new Date(),
      replacedByTokenId: rotated.id,
    },
  });

  const accessToken = await signAccessToken({
    sub: user.id,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });

  return {
    accessToken,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshToken: newToken,
    refreshMaxAgeSeconds: getRefreshMaxAgeSeconds(),
  };
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      deletedAt: null,
      isActive: true,
    },
    select: userPublicSelect,
  });

  if (!user) {
    throw ApiError.unauthorized('User not found or inactive');
  }

  return user;
}

export async function logout(refreshToken?: string): Promise<void> {
  if (!refreshToken) {
    return;
  }

  const tokenHash = hashOpaqueToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  if (stored) {
    await revokeRefreshFamily(stored.family);
  }
}

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      deletedAt: null,
      isActive: true,
    },
  });

  if (!user) {
    throw ApiError.unauthorized();
  }

  const currentValid = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!currentValid) {
    throw ApiError.badRequest('Current password is incorrect', 'INVALID_PASSWORD');
  }

  const passwordHash = await hashPassword(input.newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
      },
    }),
    prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    }),
  ]);
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const user = await prisma.user.findFirst({
    where: {
      id: input.userId,
      deletedAt: null,
    },
  });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const passwordHash = await hashPassword(input.newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: input.userId },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
      },
    }),
    prisma.refreshToken.updateMany({
      where: {
        userId: input.userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    }),
  ]);
}
