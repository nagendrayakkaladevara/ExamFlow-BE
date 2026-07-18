import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface AudienceContext {
  userId: string;
  role: 'ADMIN' | 'LECTURER' | 'STUDENT';
}

type AudienceRow = {
  targetType: 'ALL_LECTURERS' | 'ALL_STUDENTS' | 'USER' | 'CLASS';
  targetId: string | null;
};

export async function getStudentClassIds(studentId: string): Promise<string[]> {
  const rows = await prisma.classStudent.findMany({
    where: { studentId, class: { deletedAt: null, isActive: true } },
    select: { classId: true },
  });
  return rows.map((r) => r.classId);
}

export async function getLecturerClassIds(lecturerId: string): Promise<string[]> {
  const rows = await prisma.classLecturer.findMany({
    where: { lecturerId, class: { deletedAt: null, isActive: true } },
    select: { classId: true },
  });
  return rows.map((r) => r.classId);
}

export async function isAudienceVisible(
  audiences: AudienceRow[],
  ctx: AudienceContext,
): Promise<boolean> {
  if (audiences.length === 0) return false;

  const classIds =
    ctx.role === 'STUDENT'
      ? await getStudentClassIds(ctx.userId)
      : ctx.role === 'LECTURER'
        ? await getLecturerClassIds(ctx.userId)
        : [];

  for (const row of audiences) {
    switch (row.targetType) {
      case 'ALL_LECTURERS':
        if (ctx.role === 'LECTURER' || ctx.role === 'ADMIN') return true;
        break;
      case 'ALL_STUDENTS':
        if (ctx.role === 'STUDENT') return true;
        if (ctx.role === 'ADMIN') return true;
        break;
      case 'USER':
        if (row.targetId === ctx.userId) return true;
        break;
      case 'CLASS':
        if (classIds.includes(row.targetId!)) return true;
        break;
    }
  }
  return false;
}

export function buildAudienceWhere(ctx: AudienceContext): Prisma.CircularWhereInput[] {
  const conditions: Prisma.CircularWhereInput[] = [
    { audiences: { some: { targetType: 'USER', targetId: ctx.userId } } },
  ];

  if (ctx.role === 'LECTURER') {
    conditions.push({ audiences: { some: { targetType: 'ALL_LECTURERS' } } });
  }
  if (ctx.role === 'STUDENT') {
    conditions.push({ audiences: { some: { targetType: 'ALL_STUDENTS' } } });
  }
  if (ctx.role === 'ADMIN') {
    conditions.push(
      { audiences: { some: { targetType: 'ALL_LECTURERS' } } },
      { audiences: { some: { targetType: 'ALL_STUDENTS' } } },
    );
  }

  return conditions;
}

export async function appendClassAudienceConditions(
  ctx: AudienceContext,
  field: 'circular' | 'poll',
): Promise<Prisma.CircularWhereInput[]> {
  const base = buildAudienceWhere(ctx);
  const classIds =
    ctx.role === 'STUDENT'
      ? await getStudentClassIds(ctx.userId)
      : ctx.role === 'LECTURER'
        ? await getLecturerClassIds(ctx.userId)
        : [];

  if (classIds.length > 0) {
    if (field === 'circular') {
      base.push({
        audiences: { some: { targetType: 'CLASS', targetId: { in: classIds } } },
      });
    } else {
      base.push({
        audiences: { some: { targetType: 'CLASS', targetId: { in: classIds } } },
      } as Prisma.CircularWhereInput);
    }
  }
  return base;
}
