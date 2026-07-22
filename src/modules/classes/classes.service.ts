import type { UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { encodeCursor, parseCursor } from '../../utils/pagination';
import type { createClassSchema, listClassesQuerySchema, updateClassSchema } from './classes.schema';
import type { z } from 'zod';

type ClassAccessUser = { id: string; role: UserRole };

function toClassDto(row: {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listClasses(query: z.infer<typeof listClassesQuerySchema>) {
  const cursor = parseCursor(query.cursor);
  const rows = await prisma.class.findMany({
    where: {
      deletedAt: null,
      ...(query.isActive !== undefined ? { isActive: query.isActive === 'true' } : {}),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
  });

  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  const last = items[items.length - 1];

  return {
    items: items.map(toClassDto),
    meta: { nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null },
  };
}

export async function listLecturerClasses(lecturerId: string) {
  const rows = await prisma.classLecturer.findMany({
    where: { lecturerId, class: { deletedAt: null, isActive: true } },
    include: { class: true },
    orderBy: { class: { name: 'asc' } },
  });
  return rows.map((row) => toClassDto(row.class));
}

export async function listStudentClasses(studentId: string) {
  const rows = await prisma.classStudent.findMany({
    where: { studentId, class: { deletedAt: null, isActive: true } },
    include: { class: true },
    orderBy: { class: { name: 'asc' } },
  });
  return rows.map((row) => toClassDto(row.class));
}

async function requireClassAccess(user: ClassAccessUser, classId: string) {
  const row = await prisma.class.findFirst({ where: { id: classId, deletedAt: null } });
  if (!row) throw ApiError.notFound('Class not found');

  if (user.role === 'ADMIN') return row;

  if (user.role === 'LECTURER') {
    const assignment = await prisma.classLecturer.findUnique({
      where: { classId_lecturerId: { classId, lecturerId: user.id } },
    });
    if (!assignment) {
      throw ApiError.forbidden('Not assigned to this class', 'CLASS_ACCESS_DENIED');
    }
    return row;
  }

  if (user.role === 'STUDENT') {
    const enrollment = await prisma.classStudent.findUnique({
      where: { classId_studentId: { classId, studentId: user.id } },
    });
    if (!enrollment) {
      throw ApiError.forbidden('Not enrolled in this class', 'CLASS_ACCESS_DENIED');
    }
    return row;
  }

  throw ApiError.forbidden('Not authorized to access this class', 'CLASS_ACCESS_DENIED');
}

export async function getClass(user: ClassAccessUser, id: string) {
  const row = await requireClassAccess(user, id);
  return toClassDto(row);
}

export async function listClassLecturers(user: ClassAccessUser, classId: string) {
  await requireClassAccess(user, classId);

  const rows = await prisma.classLecturer.findMany({
    where: { classId },
    include: {
      lecturer: {
        select: { firstName: true, lastName: true, email: true, isActive: true },
      },
    },
    orderBy: [{ assignedAt: 'asc' }],
  });

  return rows.map((row) => ({
    id: row.id,
    userId: row.lecturerId,
    firstName: row.lecturer.firstName,
    lastName: row.lecturer.lastName,
    email: row.lecturer.email,
    isActive: row.lecturer.isActive,
    assignedAt: row.assignedAt,
  }));
}

export async function listClassStudents(user: ClassAccessUser, classId: string) {
  await requireClassAccess(user, classId);

  const rows = await prisma.classStudent.findMany({
    where: { classId },
    include: {
      student: {
        select: { firstName: true, lastName: true, email: true, isActive: true },
      },
    },
    orderBy: [{ enrolledAt: 'asc' }],
  });

  return rows.map((row) => ({
    id: row.id,
    userId: row.studentId,
    firstName: row.student.firstName,
    lastName: row.student.lastName,
    email: row.student.email,
    isActive: row.student.isActive,
    enrolledAt: row.enrolledAt,
  }));
}

export async function createClass(adminId: string, input: z.infer<typeof createClassSchema>) {
  if (input.code) {
    const dup = await prisma.class.findFirst({
      where: { code: input.code, deletedAt: null },
    });
    if (dup) throw ApiError.conflict('Class code already exists', 'CODE_EXISTS');
  }

  const row = await prisma.class.create({
    data: {
      name: input.name,
      code: input.code,
      description: input.description,
      createdById: adminId,
      updatedById: adminId,
    },
  });
  return toClassDto(row);
}

export async function updateClass(
  adminId: string,
  id: string,
  input: z.infer<typeof updateClassSchema>,
) {
  const existing = await prisma.class.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw ApiError.notFound('Class not found');

  if (input.code) {
    const dup = await prisma.class.findFirst({
      where: { code: input.code, deletedAt: null, NOT: { id } },
    });
    if (dup) throw ApiError.conflict('Class code already exists', 'CODE_EXISTS');
  }

  const row = await prisma.class.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedById: adminId,
    },
  });
  return toClassDto(row);
}

export async function deleteClass(adminId: string, id: string) {
  const existing = await prisma.class.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw ApiError.notFound('Class not found');

  await prisma.class.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false, updatedById: adminId },
  });
}

export async function assignLecturer(adminId: string, classId: string, userId: string) {
  const cls = await prisma.class.findFirst({ where: { id: classId, deletedAt: null } });
  if (!cls) throw ApiError.notFound('Class not found');

  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'LECTURER', deletedAt: null, isActive: true },
  });
  if (!user) throw ApiError.badRequest('Invalid lecturer', 'INVALID_LECTURER');

  try {
    await prisma.classLecturer.create({
      data: { classId, lecturerId: userId, createdById: adminId },
    });
  } catch {
    throw ApiError.conflict('Lecturer already assigned', 'ALREADY_ASSIGNED');
  }
}

export async function assignStudent(adminId: string, classId: string, userId: string) {
  const cls = await prisma.class.findFirst({ where: { id: classId, deletedAt: null } });
  if (!cls) throw ApiError.notFound('Class not found');

  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'STUDENT', deletedAt: null, isActive: true },
  });
  if (!user) throw ApiError.badRequest('Invalid student', 'INVALID_STUDENT');

  try {
    await prisma.classStudent.create({
      data: { classId, studentId: userId, createdById: adminId },
    });
  } catch {
    throw ApiError.conflict('Student already enrolled', 'ALREADY_ENROLLED');
  }
}

export async function unassignLecturer(_adminId: string, classId: string, userId: string) {
  const cls = await prisma.class.findFirst({ where: { id: classId, deletedAt: null } });
  if (!cls) throw ApiError.notFound('Class not found');

  const row = await prisma.classLecturer.findUnique({
    where: { classId_lecturerId: { classId, lecturerId: userId } },
  });
  if (!row) throw ApiError.notFound('Lecturer not assigned to this class');

  await prisma.classLecturer.delete({
    where: { classId_lecturerId: { classId, lecturerId: userId } },
  });
}

export async function unassignStudent(_adminId: string, classId: string, userId: string) {
  const cls = await prisma.class.findFirst({ where: { id: classId, deletedAt: null } });
  if (!cls) throw ApiError.notFound('Class not found');

  const row = await prisma.classStudent.findUnique({
    where: { classId_studentId: { classId, studentId: userId } },
  });
  if (!row) throw ApiError.notFound('Student not enrolled in this class');

  await prisma.classStudent.delete({
    where: { classId_studentId: { classId, studentId: userId } },
  });
}

export async function assertLecturerAssigned(lecturerId: string, classId: string) {
  const row = await prisma.classLecturer.findUnique({
    where: { classId_lecturerId: { classId, lecturerId } },
  });
  if (!row) throw ApiError.forbidden('Not assigned to this class', 'CLASS_ACCESS_DENIED');
}

export async function assertStudentEnrolled(studentId: string, classId: string) {
  const row = await prisma.classStudent.findUnique({
    where: { classId_studentId: { classId, studentId } },
  });
  if (!row) throw ApiError.forbidden('Not enrolled in this class', 'CLASS_ACCESS_DENIED');
}
