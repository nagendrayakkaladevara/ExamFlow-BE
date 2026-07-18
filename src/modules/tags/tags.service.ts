import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';

export async function listTags(lecturerId: string) {
  const tags = await prisma.tag.findMany({
    where: { lecturerId, deletedAt: null },
    orderBy: { name: 'asc' },
  });
  return tags.map((t) => ({ id: t.id, name: t.name, createdAt: t.createdAt }));
}

export async function createTag(lecturerId: string, name: string) {
  try {
    const tag = await prisma.tag.create({
      data: { lecturerId, name, createdById: lecturerId, updatedById: lecturerId },
    });
    return { id: tag.id, name: tag.name, createdAt: tag.createdAt };
  } catch {
    throw ApiError.conflict('Tag already exists', 'TAG_EXISTS');
  }
}

export async function updateTag(lecturerId: string, id: string, name: string) {
  const tag = await prisma.tag.findFirst({ where: { id, lecturerId, deletedAt: null } });
  if (!tag) throw ApiError.notFound('Tag not found');
  try {
    const updated = await prisma.tag.update({
      where: { id },
      data: { name, updatedById: lecturerId },
    });
    return { id: updated.id, name: updated.name, createdAt: updated.createdAt };
  } catch {
    throw ApiError.conflict('Tag name already exists', 'TAG_EXISTS');
  }
}

export async function deleteTag(lecturerId: string, id: string) {
  const tag = await prisma.tag.findFirst({ where: { id, lecturerId, deletedAt: null } });
  if (!tag) throw ApiError.notFound('Tag not found');
  await prisma.tag.update({
    where: { id },
    data: { deletedAt: new Date(), updatedById: lecturerId },
  });
}
