import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { decimalToNumber } from '../../utils/pagination';
import { assertLecturerAssigned } from '../classes/classes.service';

export async function getStudentAnalytics(studentId: string) {
  const submissions = await prisma.submission.findMany({
    where: {
      studentId,
      status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
    },
    include: { assignment: { select: { title: true, classId: true, endAt: true } } },
    orderBy: { submittedAt: 'desc' },
    take: 50,
  });

  const scores = submissions
    .map((s) => decimalToNumber(s.score))
    .filter((s): s is number => s != null);
  const averageScore =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  return {
    totalAttempts: submissions.length,
    averageScore,
    recent: submissions.map((s) => ({
      assignmentId: s.assignmentId,
      title: s.assignment.title,
      score: decimalToNumber(s.score),
      maxScore: decimalToNumber(s.maxScore),
      submittedAt: s.submittedAt,
      status: s.status,
    })),
  };
}

export async function getLecturerClassAnalytics(lecturerId: string, classId: string) {
  await assertLecturerAssigned(lecturerId, classId);

  const studentCount = await prisma.classStudent.count({ where: { classId } });
  const assignmentCount = await prisma.assignment.count({
    where: { classId, deletedAt: null },
  });
  const submissions = await prisma.submission.findMany({
    where: {
      assignment: { classId, deletedAt: null },
      status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
    },
    select: { score: true, maxScore: true },
  });

  const completionRate =
    studentCount > 0 && assignmentCount > 0
      ? submissions.length / (studentCount * assignmentCount)
      : 0;

  return {
    classId,
    studentCount,
    assignmentCount,
    completedSubmissions: submissions.length,
    completionRate: Math.round(completionRate * 100) / 100,
  };
}

export async function getLecturerAssignmentAnalytics(
  lecturerId: string,
  assignmentId: string,
) {
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, lecturerId, deletedAt: null },
    include: { class: { include: { students: true } } },
  });
  if (!assignment) throw ApiError.notFound('Assignment not found');

  const submissions = await prisma.submission.findMany({
    where: { assignmentId },
    orderBy: [{ score: 'desc' }, { submittedAt: 'asc' }],
  });

  const enrolled = assignment.class.students.length;
  const submitted = submissions.filter((s) => s.status !== 'IN_PROGRESS').length;

  return {
    assignmentId,
    title: assignment.title,
    enrolled,
    submitted,
    completionRate: enrolled > 0 ? submitted / enrolled : 0,
    rankings: submissions
      .filter((s) => s.status !== 'IN_PROGRESS')
      .map((s, index) => ({
        rank: index + 1,
        studentId: s.studentId,
        score: decimalToNumber(s.score),
        maxScore: decimalToNumber(s.maxScore),
        submittedAt: s.submittedAt,
      })),
  };
}

export async function getAdminOverview() {
  const [users, classes, assignments, submissions] = await Promise.all([
    prisma.user.groupBy({
      by: ['role'],
      where: { deletedAt: null, isActive: true },
      _count: true,
    }),
    prisma.class.count({ where: { deletedAt: null, isActive: true } }),
    prisma.assignment.count({ where: { deletedAt: null } }),
    prisma.submission.count({ where: { status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } } }),
  ]);

  return {
    usersByRole: users.reduce(
      (acc, row) => {
        acc[row.role] = row._count;
        return acc;
      },
      {} as Record<string, number>,
    ),
    activeClasses: classes,
    totalAssignments: assignments,
    completedSubmissions: submissions,
  };
}
