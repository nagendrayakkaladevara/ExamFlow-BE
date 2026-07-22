import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { decimalToNumber } from '../../utils/pagination';
import { finalizeExpiredForAssignment } from '../assignments/assignments.service';
import { assertLecturerAssigned } from '../classes/classes.service';

const PASS_THRESHOLD = 0.4;

function toPercentage(score: number | null, maxScore: number | null): number | null {
  if (score == null || maxScore == null || maxScore <= 0) return null;
  return Math.round((score / maxScore) * 1000) / 10;
}

function summarizeSubmissionScores(
  submissions: { score: unknown; maxScore: unknown }[],
) {
  const percentages: number[] = [];
  let passed = 0;
  let failed = 0;

  for (const submission of submissions) {
    const score = decimalToNumber(submission.score as never);
    const maxScore = decimalToNumber(submission.maxScore as never);
    const percentage = toPercentage(score, maxScore);
    if (percentage == null) continue;

    percentages.push(percentage);
    if (percentage / 100 >= PASS_THRESHOLD) passed += 1;
    else failed += 1;
  }

  return {
    passed,
    failed,
    highestScore: percentages.length > 0 ? Math.max(...percentages) : null,
    lowestScore: percentages.length > 0 ? Math.min(...percentages) : null,
    averageScore:
      percentages.length > 0
        ? Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 10) / 10
        : null,
  };
}

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
      correctCount: s.correctCount,
      incorrectCount: s.incorrectCount,
      percentage: toPercentage(decimalToNumber(s.score), decimalToNumber(s.maxScore)),
      submittedAt: s.submittedAt,
      status: s.status,
    })),
    trend: [...submissions]
      .filter((s) => s.submittedAt)
      .sort((a, b) => a.submittedAt!.getTime() - b.submittedAt!.getTime())
      .map((s) => ({
        submittedAt: s.submittedAt!,
        percentage: toPercentage(decimalToNumber(s.score), decimalToNumber(s.maxScore)),
      }))
      .filter((point) => point.percentage != null),
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

  const scoreSummary = summarizeSubmissionScores(submissions);

  return {
    classId,
    studentCount,
    assignmentCount,
    completedSubmissions: submissions.length,
    completionRate: Math.round(completionRate * 100) / 100,
    passed: scoreSummary.passed,
    failed: scoreSummary.failed,
    highestScore: scoreSummary.highestScore,
    lowestScore: scoreSummary.lowestScore,
    averageScore: scoreSummary.averageScore,
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
  const [users, classes, assignments, submissions, enrollmentsByClass, assignmentRows] =
    await Promise.all([
    prisma.user.groupBy({
      by: ['role'],
      where: { deletedAt: null, isActive: true },
      _count: true,
    }),
    prisma.class.count({ where: { deletedAt: null, isActive: true } }),
    prisma.assignment.count({ where: { deletedAt: null } }),
    prisma.submission.count({ where: { status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } } }),
    prisma.classStudent.groupBy({ by: ['classId'], _count: true }),
    prisma.assignment.findMany({
      where: { deletedAt: null },
      select: {
        classId: true,
        _count: {
          select: {
            submissions: {
              where: { status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } },
            },
          },
        },
      },
    }),
  ]);

  const enrollmentMap = new Map(
    enrollmentsByClass.map((row) => [row.classId, row._count]),
  );

  let totalPossible = 0;
  let totalSubmitted = 0;
  for (const assignment of assignmentRows) {
    totalPossible += enrollmentMap.get(assignment.classId) ?? 0;
    totalSubmitted += assignment._count.submissions;
  }

  const averageCompletionRate =
    totalPossible > 0 ? Math.round((totalSubmitted / totalPossible) * 1000) / 1000 : 0;

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
    averageCompletionRate,
  };
}
