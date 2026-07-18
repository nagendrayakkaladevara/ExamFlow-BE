import type { User } from '@prisma/client';

export const userPublicSelect = {
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

export type PublicUser = Pick<User, keyof typeof userPublicSelect>;

export function toPublicUser(user: PublicUser) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
