import type { Prisma, QuestionType, UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { decimalToNumber } from '../../utils/pagination';
import { finalizeExpiredForAssignment } from '../assignments/assignments.service';
import {
  assertClassAnalyticsAccess,
  getAssignmentForAnalytics,
} from './analytics.access';
import {
  COMPLETED_STATUSES,
  DEFAULT_ALERT_COMPLETION_THRESHOLD,
  RECENT_SUBMISSIONS_LIMIT,
  WEAK_TOPIC_THRESHOLD,
} from './analytics.constants';
import {
  activeStudentFilter,
  averagePercentage,
  buildSubmittedAtFilter,
  completionRate,
  filterRankingsByStatus,
  isCompletedStatus,
  paginateRows,
  publishedAssignmentFilter,
  sortRankings,
  summarizeSubmissionScores,
  toPercentage,
} from './analytics.helpers';
import { toCsv } from './analytics.export';
import type {
  ActivityEvent,
  ActivityFeed,
  AdminAlert,
  AdminClassAnalytics,
  AdminOverview,
  AdminTrends,
  AssignmentQuestionAnalytics,
  AssignmentRankingRow,
  DateRangeQuery,
  LecturerAssignmentAnalytics,
  LecturerClassAnalytics,
  LecturerSummary,
  RosterQuery,
  StudentAnalytics,
  StudentTagAnalytics,
  TrendInterval,
  TrendMetric,
} from './analytics.types';

type AnswerJson = { selectedOptionIds?: string[]; text?: string };

function completedSubmissionWhere(
  extra?: Prisma.SubmissionWhereInput,
): Prisma.SubmissionWhereInput {
  return {
    status: { in: [...COMPLETED_STATUSES] },
    ...extra,
  };
}

async function countActiveStudents(classId: string) {
  return prisma.classStudent.count({
    where: {
      classId,
      student: activeStudentFilter,
    },
  });
}

async function countPublishedAssignments(classId: string) {
  return prisma.assignment.count({
    where: { classId, ...publishedAssignmentFilter },
  });
}

export async function getStudentAnalytics(
  studentId: string,
  range: DateRangeQuery = {},
): Promise<StudentAnalytics> {
  const submittedAt = buildSubmittedAtFilter(range.from, range.to);

  const submissions = await prisma.submission.findMany({
    where: {
      studentId,
      ...completedSubmissionWhere(submittedAt ? { submittedAt } : undefined),
    },
    include: { assignment: { select: { title: true } } },
    orderBy: { submittedAt: 'desc' },
    take: RECENT_SUBMISSIONS_LIMIT,
  });

  const allForAverage = await prisma.submission.findMany({
    where: {
      studentId,
      ...completedSubmissionWhere(submittedAt ? { submittedAt } : undefined),
    },
    select: { score: true, maxScore: true },
  });

  const trendSubmissions = await prisma.submission.findMany({
    where: {
      studentId,
      ...completedSubmissionWhere(submittedAt ? { submittedAt } : undefined),
    },
    select: { submittedAt: true, score: true, maxScore: true },
    orderBy: { submittedAt: 'asc' },
  });

  return {
    totalAttempts: allForAverage.length,
    averageScore: averagePercentage(allForAverage),
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
    trend: trendSubmissions
      .filter((s) => s.submittedAt)
      .map((s) => ({
        submittedAt: s.submittedAt!,
        percentage: toPercentage(decimalToNumber(s.score), decimalToNumber(s.maxScore)),
      }))
      .filter((point): point is { submittedAt: Date; percentage: number } => point.percentage != null),
  };
}

export async function getStudentAnalyticsByTag(
  studentId: string,
  range: DateRangeQuery = {},
): Promise<StudentTagAnalytics> {
  const submittedAt = buildSubmittedAtFilter(range.from, range.to);

  const answers = await prisma.submissionAnswer.findMany({
    where: {
      submission: {
        studentId,
        ...completedSubmissionWhere(submittedAt ? { submittedAt } : undefined),
      },
    },
    select: {
      isCorrect: true,
      assignmentQuestion: {
        select: {
          question: {
            select: {
              questionTags: {
                select: { tag: { select: { id: true, name: true } } },
              },
            },
          },
        },
      },
    },
  });

  const tagMap = new Map<
    string,
    { tagName: string; attemptCount: number; correctCount: number }
  >();

  for (const answer of answers) {
    const tags = answer.assignmentQuestion.question.questionTags;
    if (tags.length === 0) continue;

    for (const { tag } of tags) {
      const existing = tagMap.get(tag.id) ?? {
        tagName: tag.name,
        attemptCount: 0,
        correctCount: 0,
      };
      existing.attemptCount += 1;
      if (answer.isCorrect) existing.correctCount += 1;
      tagMap.set(tag.id, existing);
    }
  }

  const byTag = [...tagMap.entries()]
    .map(([tagId, stats]) => ({
      tagId,
      tagName: stats.tagName,
      attemptCount: stats.attemptCount,
      correctCount: stats.correctCount,
      correctRate:
        stats.attemptCount > 0
          ? Math.round((stats.correctCount / stats.attemptCount) * 1000) / 1000
          : null,
    }))
    .sort((a, b) => a.tagName.localeCompare(b.tagName));

  const weakTopics = byTag.filter(
    (row) => row.correctRate != null && row.correctRate < WEAK_TOPIC_THRESHOLD,
  );

  return { byTag, weakTopics };
}

export async function getLecturerClassAnalytics(
  userId: string,
  role: UserRole,
  classId: string,
  range: DateRangeQuery = {},
): Promise<LecturerClassAnalytics> {
  await assertClassAnalyticsAccess(userId, role, classId);

  const submittedAt = buildSubmittedAtFilter(range.from, range.to);
  const [studentCount, assignmentCount, submissions] = await Promise.all([
    countActiveStudents(classId),
    countPublishedAssignments(classId),
    prisma.submission.findMany({
      where: {
        assignment: { classId, ...publishedAssignmentFilter },
        ...completedSubmissionWhere(submittedAt ? { submittedAt } : undefined),
      },
      select: { score: true, maxScore: true },
    }),
  ]);

  const scoreSummary = summarizeSubmissionScores(submissions);
  const totalSlots = studentCount * assignmentCount;

  return {
    classId,
    studentCount,
    assignmentCount,
    completedSubmissions: submissions.length,
    completionRate: completionRate(submissions.length, totalSlots, 2),
    ...scoreSummary,
  };
}

export async function getLecturerSummary(
  userId: string,
  role: UserRole,
  range: DateRangeQuery = {},
): Promise<LecturerSummary> {
  const submittedAt = buildSubmittedAtFilter(range.from, range.to);

  const classLinks =
    role === 'ADMIN'
      ? await prisma.class.findMany({
          where: { deletedAt: null, isActive: true },
          select: { id: true, name: true },
        })
      : await prisma.classLecturer
          .findMany({
            where: { lecturerId: userId, class: { deletedAt: null, isActive: true } },
            select: { class: { select: { id: true, name: true } } },
          })
          .then((rows) => rows.map((r) => r.class));

  if (classLinks.length === 0) {
    return {
      classes: [],
      totals: {
        classCount: 0,
        uniqueStudentCount: 0,
        assignmentCount: 0,
        completedSubmissions: 0,
        completionRate: 0,
        passed: 0,
        failed: 0,
        averageScore: null,
      },
    };
  }

  const classIds = classLinks.map((c) => c.id);

  const [enrollmentRows, assignmentRows, submissions, studentMemberships] = await Promise.all([
    prisma.classStudent.groupBy({
      by: ['classId'],
      where: { classId: { in: classIds }, student: activeStudentFilter },
      _count: true,
    }),
    prisma.assignment.findMany({
      where: { classId: { in: classIds }, ...publishedAssignmentFilter },
      select: { id: true, classId: true },
    }),
    prisma.submission.findMany({
      where: {
        assignment: { classId: { in: classIds }, ...publishedAssignmentFilter },
        ...completedSubmissionWhere(submittedAt ? { submittedAt } : undefined),
      },
      select: {
        score: true,
        maxScore: true,
        assignment: { select: { classId: true } },
      },
    }),
    prisma.classStudent.findMany({
      where: { classId: { in: classIds }, student: activeStudentFilter },
      select: { studentId: true },
    }),
  ]);

  const enrollmentMap = new Map(enrollmentRows.map((r) => [r.classId, r._count]));
  const assignmentsByClass = new Map<string, number>();
  for (const a of assignmentRows) {
    assignmentsByClass.set(a.classId, (assignmentsByClass.get(a.classId) ?? 0) + 1);
  }

  const submissionsByClass = new Map<string, typeof submissions>();
  for (const s of submissions) {
    const classId = s.assignment.classId;
    const list = submissionsByClass.get(classId) ?? [];
    list.push(s);
    submissionsByClass.set(classId, list);
  }

  const classes = classLinks.map((cls) => {
    const studentCount = enrollmentMap.get(cls.id) ?? 0;
    const assignmentCount = assignmentsByClass.get(cls.id) ?? 0;
    const classSubmissions = submissionsByClass.get(cls.id) ?? [];
    const scoreSummary = summarizeSubmissionScores(classSubmissions);

    return {
      classId: cls.id,
      className: cls.name,
      studentCount,
      assignmentCount,
      completedSubmissions: classSubmissions.length,
      completionRate: completionRate(classSubmissions.length, studentCount * assignmentCount, 2),
      ...scoreSummary,
    };
  });

  const uniqueStudentIds = new Set(studentMemberships.map((m) => m.studentId));
  const totalScoreSummary = summarizeSubmissionScores(submissions);
  const totalSlots = classes.reduce((sum, c) => sum + c.studentCount * c.assignmentCount, 0);

  return {
    classes,
    totals: {
      classCount: classes.length,
      uniqueStudentCount: uniqueStudentIds.size,
      assignmentCount: assignmentRows.length,
      completedSubmissions: submissions.length,
      completionRate: completionRate(submissions.length, totalSlots, 2),
      passed: totalScoreSummary.passed,
      failed: totalScoreSummary.failed,
      averageScore: totalScoreSummary.averageScore,
    },
  };
}

export async function getLecturerAssignmentAnalytics(
  userId: string,
  role: UserRole,
  assignmentId: string,
  query: RosterQuery = { sort: 'score', status: 'all', page: 1 },
): Promise<LecturerAssignmentAnalytics> {
  const assignment = await getAssignmentForAnalytics(userId, role, assignmentId);
  await finalizeExpiredForAssignment(assignmentId);

  const submittedAt = buildSubmittedAtFilter(query.from, query.to);
  const submissionWhere: Prisma.SubmissionWhereInput = { assignmentId };
  if (submittedAt) submissionWhere.submittedAt = submittedAt;

  const [enrolledStudents, submissions, maxScoreAgg] = await Promise.all([
    prisma.classStudent.findMany({
      where: { classId: assignment.classId, student: activeStudentFilter },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    }),
    prisma.submission.findMany({ where: submissionWhere }),
    prisma.assignmentQuestion.aggregate({
      where: { assignmentId },
      _sum: { marks: true },
    }),
  ]);

  const assignmentMaxScore = decimalToNumber(maxScoreAgg._sum.marks);
  const submissionsByStudentId = new Map(submissions.map((s) => [s.studentId, s]));

  let rows: AssignmentRankingRow[] = enrolledStudents.map(({ student }) => {
    const submission = submissionsByStudentId.get(student.id);

    if (!submission) {
      return {
        rank: null as number | null,
        studentId: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        status: null,
        score: null,
        maxScore: assignmentMaxScore,
        submittedAt: null,
      };
    }

    if (submission.status === 'IN_PROGRESS') {
      return {
        rank: null as number | null,
        studentId: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        status: 'IN_PROGRESS' as const,
        score: null,
        maxScore: decimalToNumber(submission.maxScore) ?? assignmentMaxScore,
        submittedAt: null,
      };
    }

    if (!isCompletedStatus(submission.status)) {
      return {
        rank: null as number | null,
        studentId: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        status: null,
        score: null,
        maxScore: assignmentMaxScore,
        submittedAt: null,
      };
    }

    return {
      rank: null as number | null,
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

  const submittedRows = rows.filter(
    (row) => row.status === 'SUBMITTED' || row.status === 'AUTO_SUBMITTED',
  );
  const enrolled = enrolledStudents.length;
  const submitted = submittedRows.length;

  rows = sortRankings(rows, query.sort ?? 'score');
  rows = filterRankingsByStatus(rows, query.status ?? 'all');

  const response: LecturerAssignmentAnalytics = {
    assignmentId,
    title: assignment.title,
    enrolled,
    submitted,
    completionRate: completionRate(submitted, enrolled, 2),
    rankings: rows,
  };

  if (query.limit) {
    const { items, pagination } = paginateRows(rows, query.page ?? 1, query.limit);
    response.rankings = items;
    response.pagination = pagination;
  }

  return response;
}

export async function getAssignmentQuestionAnalytics(
  userId: string,
  role: UserRole,
  assignmentId: string,
  range: DateRangeQuery = {},
): Promise<AssignmentQuestionAnalytics[]> {
  await getAssignmentForAnalytics(userId, role, assignmentId);
  await finalizeExpiredForAssignment(assignmentId);

  const submittedAt = buildSubmittedAtFilter(range.from, range.to);
  const completedWhere = completedSubmissionWhere(
    submittedAt ? { submittedAt } : undefined,
  );

  const [questions, answers, completedCount] = await Promise.all([
    prisma.assignmentQuestion.findMany({
      where: { assignmentId },
      orderBy: { sortOrder: 'asc' },
      include: {
        question: {
          select: {
            title: true,
            type: true,
            options: {
              select: { id: true, optionText: true },
              orderBy: { sortOrder: 'asc' },
            },
            questionTags: { select: { tag: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
    prisma.submissionAnswer.findMany({
      where: {
        assignmentQuestion: { assignmentId },
        submission: { ...completedWhere },
      },
      select: {
        assignmentQuestionId: true,
        isCorrect: true,
        answer: true,
        assignmentQuestion: {
          select: {
            question: {
              select: {
                type: true,
                options: { select: { id: true, optionText: true } },
              },
            },
          },
        },
      },
    }),
    prisma.submission.count({
      where: { assignmentId, ...completedWhere },
    }),
  ]);

  const answersByQuestion = new Map<string, typeof answers>();
  for (const answer of answers) {
    const list = answersByQuestion.get(answer.assignmentQuestionId) ?? [];
    list.push(answer);
    answersByQuestion.set(answer.assignmentQuestionId, list);
  }

  return questions.map((aq) => {
    const questionAnswers = answersByQuestion.get(aq.id) ?? [];
    const answeredCount = questionAnswers.length;
    const correctCount = questionAnswers.filter((a) => a.isCorrect === true).length;
    const incorrectCount = questionAnswers.filter((a) => a.isCorrect === false).length;
    const skippedCount = Math.max(0, completedCount - answeredCount);
    const attemptCount = answeredCount + skippedCount;

    const topWrongAnswers = buildTopWrongAnswers(
      aq.question.type,
      questionAnswers.filter((a) => a.isCorrect === false),
      aq.question.options,
      incorrectCount,
    );

    return {
      assignmentQuestionId: aq.id,
      title: aq.question.title,
      type: aq.question.type,
      marks: decimalToNumber(aq.marks) ?? 0,
      sortOrder: aq.sortOrder,
      attemptCount,
      correctCount,
      incorrectCount,
      skippedCount,
      correctRate:
        attemptCount > 0 ? Math.round((correctCount / attemptCount) * 1000) / 1000 : null,
      topWrongAnswers,
      tags: aq.question.questionTags.map((qt) => ({
        tagId: qt.tag.id,
        tagName: qt.tag.name,
      })),
    };
  });
}

function buildTopWrongAnswers(
  type: QuestionType,
  wrongAnswers: { answer: unknown }[],
  options: { id: string; optionText: string }[],
  incorrectCount: number,
) {
  const isMcq = type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE';
  if (!isMcq || wrongAnswers.length === 0) return [];

  const optionTextById = new Map(options.map((o) => [o.id, o.optionText]));
  const counts = new Map<string, number>();

  for (const row of wrongAnswers) {
    const answer = row.answer as AnswerJson | null;
    for (const optionId of answer?.selectedOptionIds ?? []) {
      const text = optionTextById.get(optionId) ?? 'Unknown option';
      counts.set(text, (counts.get(text) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([optionText, count]) => ({
      optionText,
      count,
      percentage:
        incorrectCount > 0 ? Math.round((count / incorrectCount) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const [users, classes, assignments, submissions, enrollmentsByClass, assignmentRows] =
    await Promise.all([
      prisma.user.groupBy({
        by: ['role'],
        where: { deletedAt: null, isActive: true },
        _count: true,
      }),
      prisma.class.count({ where: { deletedAt: null, isActive: true } }),
      prisma.assignment.count({ where: publishedAssignmentFilter }),
      prisma.submission.count({ where: completedSubmissionWhere() }),
      prisma.classStudent.groupBy({
        by: ['classId'],
        where: { student: activeStudentFilter, class: { deletedAt: null, isActive: true } },
        _count: true,
      }),
      prisma.assignment.findMany({
        where: publishedAssignmentFilter,
        select: {
          classId: true,
          _count: {
            select: {
              submissions: { where: completedSubmissionWhere() },
            },
          },
        },
      }),
    ]);

  const enrollmentMap = new Map(enrollmentsByClass.map((row) => [row.classId, row._count]));

  let totalPossible = 0;
  let totalSubmitted = 0;
  for (const assignment of assignmentRows) {
    totalPossible += enrollmentMap.get(assignment.classId) ?? 0;
    totalSubmitted += assignment._count.submissions;
  }

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
    averageCompletionRate: completionRate(totalSubmitted, totalPossible, 3),
  };
}

export async function getAdminClassAnalytics(classId: string): Promise<AdminClassAnalytics> {
  const classRow = await prisma.class.findFirst({
    where: { id: classId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!classRow) throw ApiError.notFound('Class not found');

  const [studentCount, assignments, submissions] = await Promise.all([
    countActiveStudents(classId),
    prisma.assignment.findMany({
      where: { classId, ...publishedAssignmentFilter },
      select: { id: true, title: true },
      orderBy: { startAt: 'desc' },
    }),
    prisma.submission.findMany({
      where: {
        assignment: { classId, ...publishedAssignmentFilter },
        ...completedSubmissionWhere(),
      },
      select: {
        assignmentId: true,
        score: true,
        maxScore: true,
      },
    }),
  ]);

  const submissionsByAssignment = new Map<string, typeof submissions>();
  for (const s of submissions) {
    const list = submissionsByAssignment.get(s.assignmentId) ?? [];
    list.push(s);
    submissionsByAssignment.set(s.assignmentId, list);
  }

  const assignmentRows = assignments.map((a) => {
    const assignmentSubmissions = submissionsByAssignment.get(a.id) ?? [];
    return {
      assignmentId: a.id,
      title: a.title,
      enrolled: studentCount,
      submitted: assignmentSubmissions.length,
      completionRate: completionRate(assignmentSubmissions.length, studentCount, 2),
      averageScore: averagePercentage(assignmentSubmissions),
    };
  });

  const totalSlots = studentCount * assignments.length;

  return {
    classId: classRow.id,
    className: classRow.name,
    studentCount,
    assignmentCount: assignments.length,
    completionRate: completionRate(submissions.length, totalSlots, 2),
    averageScore: averagePercentage(submissions),
    assignments: assignmentRows,
  };
}

function encodeActivityCursor(event: ActivityEvent): string {
  return Buffer.from(`${event.occurredAt.toISOString()}|${event.id}|${event.type}`).toString(
    'base64url',
  );
}

export async function getAdminActivity(limit: number, cursor?: string): Promise<ActivityFeed> {
  const fetchLimit = limit + 5;
  let cursorData: { occurredAt: Date; id: string } | null = null;
  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
      const [iso, id] = decoded.split('|');
      if (iso && id) cursorData = { occurredAt: new Date(iso), id };
    } catch {
      cursorData = null;
    }
  }

  const [assignments, users, classes, submissions] = await Promise.all([
    prisma.assignment.findMany({
      where: publishedAssignmentFilter,
      select: {
        id: true,
        title: true,
        startAt: true,
        lecturer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { startAt: 'desc' },
      take: fetchLimit,
    }),
    prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true, firstName: true, lastName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: fetchLimit,
    }),
    prisma.class.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: fetchLimit,
    }),
    prisma.submission.findMany({
      where: completedSubmissionWhere({ submittedAt: { not: null } }),
      select: {
        id: true,
        submittedAt: true,
        assignment: { select: { title: true } },
        student: { select: { firstName: true, lastName: true } },
      },
      orderBy: { submittedAt: 'desc' },
      take: fetchLimit,
    }),
  ]);

  type ActivityCandidate = ActivityEvent & { sortKey: string };

  const candidates: ActivityCandidate[] = [
    ...assignments.map((a) => ({
      id: a.id,
      type: 'ASSIGNMENT_PUBLISHED' as const,
      actorName: `${a.lecturer.firstName} ${a.lecturer.lastName}`,
      resourceLabel: a.title,
      occurredAt: a.startAt,
      sortKey: `${a.startAt.toISOString()}|${a.id}`,
    })),
    ...users.map((u) => ({
      id: u.id,
      type: 'USER_REGISTERED' as const,
      actorName: `${u.firstName} ${u.lastName}`,
      resourceLabel: 'New user account',
      occurredAt: u.createdAt,
      sortKey: `${u.createdAt.toISOString()}|${u.id}`,
    })),
    ...classes.map((c) => ({
      id: c.id,
      type: 'CLASS_CREATED' as const,
      actorName: 'System',
      resourceLabel: c.name,
      occurredAt: c.createdAt,
      sortKey: `${c.createdAt.toISOString()}|${c.id}`,
    })),
    ...submissions
      .filter((s) => s.submittedAt)
      .map((s) => ({
        id: s.id,
        type: 'SUBMISSION_COMPLETED' as const,
        actorName: `${s.student.firstName} ${s.student.lastName}`,
        resourceLabel: s.assignment.title,
        occurredAt: s.submittedAt!,
        sortKey: `${s.submittedAt!.toISOString()}|${s.id}`,
      })),
  ];

  let filtered = candidates;
  if (cursorData) {
    filtered = candidates.filter(
      (c) =>
        c.occurredAt < cursorData!.occurredAt ||
        (c.occurredAt.getTime() === cursorData!.occurredAt.getTime() && c.id < cursorData!.id),
    );
  }

  filtered.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  const pageItems = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  const last = pageItems[pageItems.length - 1];

  return {
    items: pageItems.map(({ sortKey: _sortKey, ...item }) => item),
    nextCursor: hasMore && last ? encodeActivityCursor(last) : null,
  };
}

const INTERVAL_SQL: Record<TrendInterval, string> = {
  day: 'day',
  week: 'week',
  month: 'month',
};

export async function getAdminTrends(
  metric: TrendMetric,
  interval: TrendInterval,
  from: Date,
  to: Date,
): Promise<AdminTrends> {
  const trunc = INTERVAL_SQL[interval];

  if (metric === 'submissions') {
    const rows = await prisma.$queryRaw<
      Array<{ period_start: Date; period_end: Date; value: bigint }>
    >`
      SELECT
        date_trunc(${trunc}, submitted_at) AS period_start,
        (date_trunc(${trunc}, submitted_at) + ('1 ' || ${trunc})::interval - interval '1 millisecond') AS period_end,
        COUNT(*)::bigint AS value
      FROM submissions
      WHERE status IN ('SUBMITTED', 'AUTO_SUBMITTED')
        AND submitted_at >= ${from}
        AND submitted_at <= ${to}
      GROUP BY 1
      ORDER BY 1
    `;

    return {
      metric,
      interval,
      from,
      to,
      points: rows.map((r) => ({
        periodStart: r.period_start,
        periodEnd: r.period_end,
        value: Number(r.value),
      })),
    };
  }

  if (metric === 'averageScore') {
    const rows = await prisma.$queryRaw<
      Array<{ period_start: Date; period_end: Date; value: number | null }>
    >`
      SELECT
        date_trunc(${trunc}, submitted_at) AS period_start,
        (date_trunc(${trunc}, submitted_at) + ('1 ' || ${trunc})::interval - interval '1 millisecond') AS period_end,
        AVG(CASE WHEN max_score > 0 THEN (score / max_score) * 100 ELSE NULL END) AS value
      FROM submissions
      WHERE status IN ('SUBMITTED', 'AUTO_SUBMITTED')
        AND submitted_at >= ${from}
        AND submitted_at <= ${to}
      GROUP BY 1
      ORDER BY 1
    `;

    return {
      metric,
      interval,
      from,
      to,
      points: rows.map((r) => ({
        periodStart: r.period_start,
        periodEnd: r.period_end,
        value: r.value != null ? Math.round(Number(r.value) * 10) / 10 : 0,
      })),
    };
  }

  const rows = await prisma.$queryRaw<
    Array<{ period_start: Date; period_end: Date; completed: bigint; possible: bigint }>
  >`
    WITH periods AS (
      SELECT generate_series(
        date_trunc(${trunc}, ${from}::timestamptz),
        date_trunc(${trunc}, ${to}::timestamptz),
        ('1 ' || ${trunc})::interval
      ) AS period_start
    ),
    assignment_slots AS (
      SELECT date_trunc(${trunc}, a.start_at) AS period_start,
             COUNT(cs.student_id)::bigint AS enrolled
      FROM assignments a
      JOIN class_students cs ON cs.class_id = a.class_id
      JOIN users u ON u.id = cs.student_id
      WHERE a.deleted_at IS NULL
        AND a.is_published = true
        AND u.role = 'STUDENT'
        AND u.is_active = true
        AND u.deleted_at IS NULL
        AND a.start_at >= ${from}
        AND a.start_at <= ${to}
      GROUP BY 1
    ),
    completed_by_period AS (
      SELECT date_trunc(${trunc}, s.submitted_at) AS period_start,
             COUNT(*)::bigint AS completed
      FROM submissions s
      WHERE s.status IN ('SUBMITTED', 'AUTO_SUBMITTED')
        AND s.submitted_at >= ${from}
        AND s.submitted_at <= ${to}
      GROUP BY 1
    )
    SELECT
      p.period_start,
      (p.period_start + ('1 ' || ${trunc})::interval - interval '1 millisecond') AS period_end,
      COALESCE(c.completed, 0)::bigint AS completed,
      COALESCE(sl.enrolled, 0)::bigint AS possible
    FROM periods p
    LEFT JOIN completed_by_period c ON c.period_start = p.period_start
    LEFT JOIN assignment_slots sl ON sl.period_start = p.period_start
    ORDER BY p.period_start
  `;

  return {
    metric,
    interval,
    from,
    to,
    points: rows.map((r) => ({
      periodStart: r.period_start,
      periodEnd: r.period_end,
      value:
        Number(r.possible) > 0
          ? Math.round((Number(r.completed) / Number(r.possible)) * 1000) / 1000
          : 0,
    })),
  };
}

export async function getAdminAlerts(
  threshold = DEFAULT_ALERT_COMPLETION_THRESHOLD,
): Promise<AdminAlert[]> {
  const assignments = await prisma.assignment.findMany({
    where: publishedAssignmentFilter,
    select: {
      id: true,
      title: true,
      class: { select: { id: true, name: true } },
      _count: {
        select: {
          submissions: { where: completedSubmissionWhere() },
        },
      },
    },
  });

  const classIds = [...new Set(assignments.map((a) => a.class.id))];
  const enrollmentRows = await prisma.classStudent.groupBy({
    by: ['classId'],
    where: { classId: { in: classIds }, student: activeStudentFilter },
    _count: true,
  });
  const enrollmentMap = new Map(enrollmentRows.map((r) => [r.classId, r._count]));

  const alerts: AdminAlert[] = [];
  for (const assignment of assignments) {
    const enrolled = enrollmentMap.get(assignment.class.id) ?? 0;
    if (enrolled === 0) continue;
    const rate = assignment._count.submissions / enrolled;
    if (rate < threshold) {
      alerts.push({
        classId: assignment.class.id,
        className: assignment.class.name,
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        completionRate: completionRate(assignment._count.submissions, enrolled, 2),
        threshold,
      });
    }
  }

  return alerts.sort((a, b) => a.completionRate - b.completionRate);
}

export async function buildAssignmentExportCsv(
  userId: string,
  role: UserRole,
  assignmentId: string,
  range: DateRangeQuery = {},
) {
  const data = await getLecturerAssignmentAnalytics(userId, role, assignmentId, {
    sort: 'score',
    status: 'all',
    page: 1,
    ...range,
  });

  return toCsv(
    [
      'rank',
      'studentName',
      'email',
      'status',
      'score',
      'maxScore',
      'percentage',
      'submittedAt',
    ],
    data.rankings.map((row) => ({
      rank: row.rank,
      studentName: `${row.firstName} ${row.lastName}`,
      email: row.email,
      status: row.status ?? 'NOT_STARTED',
      score: row.score,
      maxScore: row.maxScore,
      percentage: toPercentage(row.score, row.maxScore),
      submittedAt: row.submittedAt?.toISOString() ?? null,
    })),
  );
}

export async function buildAdminReportCsv(
  userId: string,
  reportType: 'overview' | 'class-performance' | 'assignment-results',
  range: DateRangeQuery & { classId?: string },
) {
  if (reportType === 'overview') {
    const overview = await getAdminOverview();
    return toCsv(
      ['metric', 'value'],
      [
        { metric: 'activeClasses', value: overview.activeClasses },
        { metric: 'totalAssignments', value: overview.totalAssignments },
        { metric: 'completedSubmissions', value: overview.completedSubmissions },
        { metric: 'averageCompletionRate', value: overview.averageCompletionRate },
        ...Object.entries(overview.usersByRole).map(([role, count]) => ({
          metric: `users_${role}`,
          value: count,
        })),
      ],
    );
  }

  if (reportType === 'class-performance') {
    if (!range.classId) throw ApiError.badRequest('classId is required for class-performance report');
    const classAnalytics = await getAdminClassAnalytics(range.classId);
    return toCsv(
      ['assignmentId', 'title', 'enrolled', 'submitted', 'completionRate', 'averageScore'],
      classAnalytics.assignments.map((a) => ({
        assignmentId: a.assignmentId,
        title: a.title,
        enrolled: a.enrolled,
        submitted: a.submitted,
        completionRate: a.completionRate,
        averageScore: a.averageScore,
      })),
    );
  }

  const assignments = await prisma.assignment.findMany({
    where: {
      ...publishedAssignmentFilter,
      ...(range.classId ? { classId: range.classId } : {}),
    },
    select: { id: true, title: true },
  });

  const rows: Record<string, string | number | null>[] = [];
  for (const assignment of assignments) {
    const analytics = await getLecturerAssignmentAnalytics(userId, 'ADMIN', assignment.id, {
      sort: 'score',
      status: 'all',
      page: 1,
      from: range.from,
      to: range.to,
    });
    for (const row of analytics.rankings) {
      rows.push({
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        rank: row.rank,
        studentName: `${row.firstName} ${row.lastName}`,
        email: row.email,
        status: row.status ?? 'NOT_STARTED',
        score: row.score,
        maxScore: row.maxScore,
        percentage: toPercentage(row.score, row.maxScore),
        submittedAt: row.submittedAt?.toISOString() ?? null,
      });
    }
  }

  return toCsv(
    [
      'assignmentId',
      'assignmentTitle',
      'rank',
      'studentName',
      'email',
      'status',
      'score',
      'maxScore',
      'percentage',
      'submittedAt',
    ],
    rows,
  );
}
