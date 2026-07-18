import { prisma } from '../../lib/prisma';
import { hashPassword } from '../../lib/password';
import { ApiError } from '../../utils/ApiError';
import { encodeCursor, parseCursor } from '../../utils/pagination';
import { normalizeEmail, toPublicUser, userPublicSelect } from '../../utils/user';
import type {
  bulkCreateUsersSchema,
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
} from './users.schema';
import type { z } from 'zod';

export type BulkImportRowResult =
  | { row: number; status: 'created'; user: ReturnType<typeof toPublicUser> }
  | { row: number; status: 'failed'; email: string; message: string };

export type BulkImportResult = {
  summary: { total: number; created: number; failed: number };
  results: BulkImportRowResult[];
};

export async function listUsers(query: z.infer<typeof listUsersQuerySchema>) {
  const cursor = parseCursor(query.cursor);
  const where = {
    deletedAt: null,
    ...(query.role ? { role: query.role } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive === 'true' } : {}),
  };

  const users = await prisma.user.findMany({
    where: {
      ...where,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    select: userPublicSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
  });

  const hasMore = users.length > query.limit;
  const items = hasMore ? users.slice(0, query.limit) : users;
  const last = items[items.length - 1];

  return {
    items: items.map(toPublicUser),
    meta: {
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    },
  };
}

export async function getUser(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: userPublicSelect,
  });
  if (!user) throw ApiError.notFound('User not found');
  return toPublicUser(user);
}

export async function createUser(
  adminId: string,
  input: z.infer<typeof createUserSchema>,
) {
  const email = normalizeEmail(input.email);
  const existing = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (existing) throw ApiError.conflict('Email already in use', 'EMAIL_EXISTS');

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: input.role,
      firstName: input.firstName,
      lastName: input.lastName,
      createdById: adminId,
      updatedById: adminId,
    },
    select: userPublicSelect,
  });
  return toPublicUser(user);
}

export async function bulkCreateStudents(
  adminId: string,
  input: z.infer<typeof bulkCreateUsersSchema>,
): Promise<BulkImportResult> {
  const results: BulkImportRowResult[] = [];
  const seenEmails = new Set<string>();

  const normalizedRows = input.students.map((student, index) => ({
    row: index + 1,
    email: normalizeEmail(student.email),
    password: student.password ?? input.defaultPassword!,
    firstName: student.firstName.trim(),
    lastName: student.lastName.trim(),
  }));

  const existingUsers = await prisma.user.findMany({
    where: {
      deletedAt: null,
      email: { in: normalizedRows.map((row) => row.email) },
    },
    select: { email: true },
  });
  const existingEmails = new Set(existingUsers.map((user) => user.email));

  for (const row of normalizedRows) {
    if (seenEmails.has(row.email)) {
      results.push({
        row: row.row,
        status: 'failed',
        email: row.email,
        message: 'Duplicate email in import file',
      });
      continue;
    }
    seenEmails.add(row.email);

    if (existingEmails.has(row.email)) {
      results.push({
        row: row.row,
        status: 'failed',
        email: row.email,
        message: 'Email already in use',
      });
      continue;
    }

    try {
      const passwordHash = await hashPassword(row.password);
      const user = await prisma.user.create({
        data: {
          email: row.email,
          passwordHash,
          role: 'STUDENT',
          firstName: row.firstName,
          lastName: row.lastName,
          createdById: adminId,
          updatedById: adminId,
        },
        select: userPublicSelect,
      });
      existingEmails.add(row.email);
      results.push({ row: row.row, status: 'created', user: toPublicUser(user) });
    } catch {
      results.push({
        row: row.row,
        status: 'failed',
        email: row.email,
        message: 'Unable to create student',
      });
    }
  }

  const created = results.filter((result) => result.status === 'created').length;

  return {
    summary: {
      total: normalizedRows.length,
      created,
      failed: normalizedRows.length - created,
    },
    results,
  };
}

export async function updateUser(
  adminId: string,
  id: string,
  input: z.infer<typeof updateUserSchema>,
) {
  const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
  if (!user) throw ApiError.notFound('User not found');

  if (input.email) {
    const email = normalizeEmail(input.email);
    const dup = await prisma.user.findFirst({
      where: { email, deletedAt: null, NOT: { id } },
    });
    if (dup) throw ApiError.conflict('Email already in use', 'EMAIL_EXISTS');
  }

  const data: Record<string, unknown> = {
    ...(input.email ? { email: normalizeEmail(input.email) } : {}),
    ...(input.firstName ? { firstName: input.firstName } : {}),
    ...(input.lastName ? { lastName: input.lastName } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    updatedById: adminId,
  };

  let bumpToken = false;

  if (input.password) {
    data.passwordHash = await hashPassword(input.password);
    bumpToken = true;
  }

  if (input.isActive === false) {
    bumpToken = true;
  }

  if (bumpToken) {
    data.tokenVersion = { increment: 1 };
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: userPublicSelect,
  });
  return toPublicUser(updated);
}

export async function deleteUser(adminId: string, id: string) {
  const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
  if (!user) throw ApiError.notFound('User not found');
  if (user.role === 'ADMIN') {
    throw ApiError.forbidden('Cannot delete admin accounts', 'ADMIN_PROTECTED');
  }

  await prisma.user.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
      tokenVersion: { increment: 1 },
      updatedById: adminId,
    },
  });

  await prisma.refreshToken.updateMany({
    where: { userId: id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
