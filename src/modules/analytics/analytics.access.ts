import type { UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { assertLecturerAssigned } from '../classes/classes.service';

export async function assertClassAnalyticsAccess(
  userId: string,
  role: UserRole,
  classId: string,
) {
  const classRow = await prisma.class.findFirst({
    where: { id: classId, deletedAt: null },
    select: { id: true },
  });
  if (!classRow) throw ApiError.notFound('Class not found');

  if (role !== 'ADMIN') {
    await assertLecturerAssigned(userId, classId);
  }
}

export async function getAssignmentForAnalytics(
  userId: string,
  role: UserRole,
  assignmentId: string,
) {
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
    select: { id: true, title: true, classId: true, lecturerId: true },
  });
  if (!assignment) throw ApiError.notFound('Assignment not found');

  if (role !== 'ADMIN') {
    await assertLecturerAssigned(userId, assignment.classId);
  }

  return assignment;
}
