import type { UserRole } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';

/** Require the authenticated user to have one of the given roles. */
export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(ApiError.forbidden());
      return;
    }

    next();
  };
}
