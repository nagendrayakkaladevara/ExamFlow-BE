import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';

/** Verify Bearer access JWT and attach the authenticated user. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Missing or invalid authorization header');
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw ApiError.unauthorized('Missing access token');
    }

    const payload = await verifyAccessToken(token);

    const user = await prisma.user.findFirst({
      where: {
        id: payload.sub,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        role: true,
        tokenVersion: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      throw ApiError.unauthorized('User not found or inactive');
    }

    if (user.tokenVersion !== payload.tokenVersion) {
      throw ApiError.unauthorized('Session expired');
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.unauthorized('Invalid or expired access token'));
  }
}
