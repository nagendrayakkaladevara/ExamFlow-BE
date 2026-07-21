import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { decimalToNumber } from '../../utils/pagination';
import { finalizeExpiredForAssignment } from '../assignments/assignments.service';
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

type AssignmentRankingStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED';

type AssignmentRankingRow = {
  rank: number | null;
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  status: AssignmentRankingStatus;
  score: number | null;
  maxScore: number | null;
  submittedAt: Date | null;
};

function compareSubmittedRankings(a: AssignmentRankingRow, b: AssignmentRankingRow) {
  const scoreA = a.score ?? -Infinity;
  const scoreB = b.score ?? -Infinity;
  if (scoreB !== scoreA) return scoreB - scoreA;

  const timeA = a.submittedAt?.getTime() ?? Infinity;
  const timeB = b.submittedAt?.getTime() ?? Infinity;
  return timeA - timeB;
}

function comparePendingRankings(a: AssignmentRankingRow, b: AssignmentRankingRow) {
  if (a.status !== b.status) {
    if (a.status === 'IN_PROGRESS') return -1;
    if (b.status === 'IN_PROGRESS') return 1;
  }

  const lastNameCmp = a.lastName.localeCompare(b.lastName);
  if (lastNameCmp !== 0) return lastNameCmp;
  return a.firstName.localeCompare(b.firstName);
}

export async function getLecturerAssignmentAnalytics(
  lecturerId: string,
  assignmentId: string,
) {
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, lecturerId, deletedAt: null },
    select: { id: true, title: true, classId: true },
  });
  if (!assignment) throw ApiError.notFound('Assignment not found');

  await finalizeExpiredForAssignment(assignmentId);

  const [enrolledStudents, submissions, maxScoreAgg] = await Promise.all([
    prisma.classStudent.findMany({
      where: {
        classId: assignment.classId,
        student: { role: 'STUDENT', isActive: true, deletedAt: null },
      },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    }),
    prisma.submission.findMany({ where: { assignmentId } }),
    prisma.assignmentQuestion.aggregate({
      where: { assignmentId },
      _sum: { marks: true },
    }),
  ]);

  const assignmentMaxScore = decimalToNumber(maxScoreAgg._sum.marks);
  const submissionsByStudentId = new Map(submissions.map((s) => [s.studentId, s]));

  const rows: AssignmentRankingRow[] = enrolledStudents.map(({ student }) => {
    const submission = submissionsByStudentId.get(student.id);

    if (!submission) {
      return {
        rank: null,
        studentId: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        status: 'NOT_STARTED',
        score: null,
        maxScore: assignmentMaxScore,
        submittedAt: null,
      };
    }

    if (submission.status === 'IN_PROGRESS') {
      return {
        rank: null,
        studentId: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        status: 'IN_PROGRESS',
        score: null,
        maxScore: decimalToNumber(submission.maxScore) ?? assignmentMaxScore,
        submittedAt: null,
      };
    }

    return {
      rank: null,
      studentId: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
      status: submission.status,
      score: decimalToNumber(submission.score),
      maxScore: decimalToNumber(submission.maxScore) ?? assignmentMaxScore,
      submittedAt: submission.submittedAt,
    };
  });

  const submittedRows = rows
    .filter((row) => row.status === 'SUBMITTED' || row.status === 'AUTO_SUBMITTED')
    .sort(compareSubmittedRankings);

  submittedRows.forEach((row, index) => {
    row.rank = index + 1;
  });

  const pendingRows = rows
    .filter((row) => row.status === 'NOT_STARTED' || row.status === 'IN_PROGRESS')
    .sort(comparePendingRankings);

  const enrolled = enrolledStudents.length;
  const submitted = submittedRows.length;

  return {
    assignmentId,
    title: assignment.title,
    enrolled,
    submitted,
    completionRate: enrolled > 0 ? submitted / enrolled : 0,
    rankings: [...submittedRows, ...pendingRows],
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
