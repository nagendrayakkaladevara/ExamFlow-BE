import type { UserRole } from '@prisma/client';
import 'express-serve-static-core';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  tokenVersion: number;
  firstName: string;
  lastName: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
    user?: AuthUser;
  }
}

export {};
