import type { UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { getLecturerClassIds, isAudienceVisible } from '../../utils/audience';
import { encodeCursor, parseCursor } from '../../utils/pagination';
import type { createCircularSchema, listCircularsQuerySchema, updateCircularSchema } from './circulars.schema';
import type { z } from 'zod';

function validateAudiences(
  role: UserRole,
  audiences: { targetType: string; targetId?: string }[],
) {
  for (const row of audiences) {
    if (['USER', 'CLASS'].includes(row.targetType) && !row.targetId) {
      throw ApiError.badRequest('targetId required for USER/CLASS audience', 'INVALID_AUDIENCE');
    }
    if (role === 'LECTURER' && ['ALL_LECTURERS', 'ALL_STUDENTS'].includes(row.targetType)) {
      throw ApiError.forbidden('Lecturers cannot use institution-wide audiences', 'INVALID_AUDIENCE');
    }
  }
}

function mapCircular(row: {
  id: string;
  title: string;
  description: string;
  coverImageUrl: string | null;
  publishAt: Date;
  isPublished: boolean;
  createdAt: Date;
  audiences?: { targetType: string; targetId: string | null }[];
}) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    coverImageUrl: row.coverImageUrl,
    publishAt: row.publishAt,
    isPublished: row.isPublished,
    createdAt: row.createdAt,
    audiences: row.audiences?.map((a) => ({
      targetType: a.targetType,
      targetId: a.targetId,
    })),
  };
}

export async function listCirculars(
  user: { id: string; role: UserRole },
  query: z.infer<typeof listCircularsQuerySchema>,
) {
  const ctx = { userId: user.id, role: user.role };
  const now = new Date();
  const cursor = parseCursor(query.cursor);

  if (user.role === 'ADMIN') {
    const rows = await prisma.circular.findMany({
      where: {
        deletedAt: null,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      include: { audiences: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const last = items[items.length - 1];
    return {
      items: items.map(mapCircular),
      meta: { nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null },
    };
  }

  const allRows = await prisma.circular.findMany({
    where: {
      deletedAt: null,
      isPublished: true,
      publishAt: { lte: now },
    },
    include: { audiences: true },
    orderBy: { publishAt: 'desc' },
  });

  const visible: typeof allRows = [];
  for (const row of allRows) {
    if (
      await isAudienceVisible(
        row.audiences.map((a) => ({ targetType: a.targetType, targetId: a.targetId })),
        ctx,
      )
    ) {
      visible.push(row);
    }
  }

  return { items: visible.slice(0, query.limit).map(mapCircular), meta: { nextCursor: null } };
}

export async function getCircular(id: string, user: { id: string; role: UserRole }) {
  const row = await prisma.circular.findFirst({
    where: { id, deletedAt: null },
    include: { audiences: true },
  });
  if (!row) throw ApiError.notFound('Circular not found');

  if (user.role !== 'ADMIN') {
    if (!row.isPublished || row.publishAt > new Date()) {
      throw ApiError.notFound('Circular not found');
    }
    const visible = await isAudienceVisible(
      row.audiences.map((a) => ({ targetType: a.targetType, targetId: a.targetId })),
      { userId: user.id, role: user.role },
    );
    if (!visible) throw ApiError.notFound('Circular not found');
  }

  return mapCircular(row);
}

export async function createCircular(
  user: { id: string; role: UserRole },
  input: z.infer<typeof createCircularSchema>,
) {
  validateAudiences(user.role, input.audiences);

  if (user.role === 'LECTURER') {
    const classIds = await getLecturerClassIds(user.id);
    for (const aud of input.audiences) {
      if (aud.targetType === 'CLASS' && aud.targetId && !classIds.includes(aud.targetId)) {
        throw ApiError.forbidden('Cannot target class you do not teach', 'INVALID_AUDIENCE');
      }
    }
  }

  const publishAt = new Date(input.publishAt);
  const row = await prisma.circular.create({
    data: {
      createdById: user.id,
      title: input.title,
      description: input.description,
      coverImageUrl: input.coverImageUrl,
      coverImageBlobKey: input.coverImageBlobKey,
      publishAt,
      isPublished: publishAt <= new Date(),
      audiences: { create: input.audiences.map((a) => ({ targetType: a.targetType, targetId: a.targetId })) },
    },
    include: { audiences: true },
  });
  return mapCircular(row);
}

export async function updateCircular(
  user: { id: string; role: UserRole },
  id: string,
  input: z.infer<typeof updateCircularSchema>,
) {
  const existing = await prisma.circular.findFirst({
    where: { id, deletedAt: null, ...(user.role === 'LECTURER' ? { createdById: user.id } : {}) },
  });
  if (!existing) throw ApiError.notFound('Circular not found');

  if (input.audiences) validateAudiences(user.role, input.audiences);

  await prisma.$transaction(async (tx) => {
    if (input.audiences) {
      await tx.circularAudience.deleteMany({ where: { circularId: id } });
    }
    await tx.circular.update({
      where: { id },
      data: {
        ...(input.title ? { title: input.title } : {}),
        ...(input.description ? { description: input.description } : {}),
        ...(input.coverImageUrl !== undefined ? { coverImageUrl: input.coverImageUrl } : {}),
        ...(input.coverImageBlobKey !== undefined ? { coverImageBlobKey: input.coverImageBlobKey } : {}),
        ...(input.publishAt
          ? {
              publishAt: new Date(input.publishAt),
              isPublished: new Date(input.publishAt) <= new Date(),
            }
          : {}),
        updatedById: user.id,
        ...(input.audiences
          ? {
              audiences: {
                create: input.audiences.map((a) => ({
                  targetType: a.targetType,
                  targetId: a.targetId,
                })),
              },
            }
          : {}),
      },
    });
  });

  return getCircular(id, user);
}

export async function deleteCircular(user: { id: string; role: UserRole }, id: string) {
  const existing = await prisma.circular.findFirst({
    where: { id, deletedAt: null, ...(user.role === 'LECTURER' ? { createdById: user.id } : {}) },
  });
  if (!existing) throw ApiError.notFound('Circular not found');
  await prisma.circular.update({
    where: { id },
    data: { deletedAt: new Date(), updatedById: user.id },
  });
}

export async function publishScheduledCirculars() {
  const now = new Date();
  const result = await prisma.circular.updateMany({
    where: {
      deletedAt: null,
      isPublished: false,
      publishAt: { lte: now },
    },
    data: { isPublished: true },
  });
  return { published: result.count };
}
