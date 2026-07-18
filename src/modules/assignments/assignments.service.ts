import type { Prisma, QuestionType, ResultPolicy } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { decimalToNumber } from '../../utils/pagination';
import { assertLecturerAssigned, assertStudentEnrolled } from '../classes/classes.service';
import type {
  autosaveSchema,
  createAssignmentSchema,
  importQuestionsSchema,
  updateAssignmentSchema,
} from './assignments.schema';
import type { z } from 'zod';

function mapAssignment(row: {
  id: string;
  classId: string;
  lecturerId: string;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  resultPolicy: ResultPolicy;
  resultDeclareAt: Date | null;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    classId: row.classId,
    lecturerId: row.lecturerId,
    title: row.title,
    description: row.description,
    startAt: row.startAt,
    endAt: row.endAt,
    durationMinutes: row.durationMinutes,
    resultPolicy: row.resultPolicy,
    resultDeclareAt: row.resultDeclareAt,
    isPublished: row.isPublished,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function assertAssignmentAccess(
  assignmentId: string,
  user: { id: string; role: 'ADMIN' | 'LECTURER' | 'STUDENT' },
) {
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
  });
  if (!assignment) throw ApiError.notFound('Assignment not found');

  if (user.role === 'LECTURER') {
    if (assignment.lecturerId !== user.id) {
      throw ApiError.forbidden('Not your assignment', 'ASSIGNMENT_ACCESS_DENIED');
    }
  } else if (user.role === 'STUDENT') {
    await assertStudentEnrolled(user.id, assignment.classId);
  }

  return assignment;
}

export async function listAssignments(user: { id: string; role: 'ADMIN' | 'LECTURER' | 'STUDENT' }) {
  const where: Prisma.AssignmentWhereInput = { deletedAt: null, isPublished: true };

  if (user.role === 'LECTURER') {
    where.lecturerId = user.id;
  } else if (user.role === 'STUDENT') {
    const enrollments = await prisma.classStudent.findMany({
      where: { studentId: user.id },
      select: { classId: true },
    });
    where.classId = { in: enrollments.map((e) => e.classId) };
  }

  const rows = await prisma.assignment.findMany({
    where,
    orderBy: { startAt: 'desc' },
  });
  return rows.map(mapAssignment);
}

export async function getAssignment(
  id: string,
  user: { id: string; role: 'ADMIN' | 'LECTURER' | 'STUDENT' },
) {
  const assignment = await assertAssignmentAccess(id, user);
  const questions = await prisma.assignmentQuestion.findMany({
    where: { assignmentId: id },
    include: {
      question: {
        include: { options: { orderBy: { sortOrder: 'asc' } } },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  const hideAnswers = user.role === 'STUDENT';
  return {
    ...mapAssignment(assignment),
    questions: questions.map((aq) => ({
      id: aq.id,
      questionId: aq.questionId,
      marks: decimalToNumber(aq.marks),
      sortOrder: aq.sortOrder,
      question: {
        id: aq.question.id,
        type: aq.question.type,
        title: aq.question.title,
        description: aq.question.description,
        difficulty: aq.question.difficulty,
        subject: aq.question.subject,
        topic: aq.question.topic,
        imageUrl: aq.question.imageUrl,
        options: aq.question.options.map((o) => ({
          id: o.id,
          optionText: o.optionText,
          sortOrder: o.sortOrder,
          ...(hideAnswers ? {} : { isCorrect: o.isCorrect }),
        })),
        ...(hideAnswers ? {} : { correctText: aq.question.correctText }),
      },
    })),
  };
}

export async function createAssignment(
  lecturerId: string,
  input: z.infer<typeof createAssignmentSchema>,
) {
  await assertLecturerAssigned(lecturerId, input.classId);

  const row = await prisma.assignment.create({
    data: {
      classId: input.classId,
      lecturerId,
      title: input.title,
      description: input.description,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      durationMinutes: input.durationMinutes,
      resultPolicy: input.resultPolicy,
      resultDeclareAt: input.resultDeclareAt ? new Date(input.resultDeclareAt) : null,
      isPublished: input.isPublished ?? true,
      createdById: lecturerId,
      updatedById: lecturerId,
    },
  });
  return mapAssignment(row);
}

export async function updateAssignment(
  lecturerId: string,
  id: string,
  input: z.infer<typeof updateAssignmentSchema>,
) {
  const existing = await prisma.assignment.findFirst({
    where: { id, lecturerId, deletedAt: null },
  });
  if (!existing) throw ApiError.notFound('Assignment not found');

  if (input.classId) await assertLecturerAssigned(lecturerId, input.classId);

  const row = await prisma.assignment.update({
    where: { id },
    data: {
      ...(input.classId ? { classId: input.classId } : {}),
      ...(input.title ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.startAt ? { startAt: new Date(input.startAt) } : {}),
      ...(input.endAt ? { endAt: new Date(input.endAt) } : {}),
      ...(input.durationMinutes ? { durationMinutes: input.durationMinutes } : {}),
      ...(input.resultPolicy ? { resultPolicy: input.resultPolicy } : {}),
      ...(input.resultDeclareAt !== undefined
        ? { resultDeclareAt: input.resultDeclareAt ? new Date(input.resultDeclareAt) : null }
        : {}),
      ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
      updatedById: lecturerId,
    },
  });
  return mapAssignment(row);
}

export async function deleteAssignment(lecturerId: string, id: string) {
  const existing = await prisma.assignment.findFirst({
    where: { id, lecturerId, deletedAt: null },
  });
  if (!existing) throw ApiError.notFound('Assignment not found');
  await prisma.assignment.update({
    where: { id },
    data: { deletedAt: new Date(), updatedById: lecturerId },
  });
}

export async function importQuestions(
  lecturerId: string,
  assignmentId: string,
  input: z.infer<typeof importQuestionsSchema>,
) {
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, lecturerId, deletedAt: null },
  });
  if (!assignment) throw ApiError.notFound('Assignment not found');

  for (const item of input.questions) {
    const question = await prisma.question.findFirst({
      where: { id: item.questionId, lecturerId, deletedAt: null },
    });
    if (!question) throw ApiError.badRequest(`Invalid question ${item.questionId}`, 'INVALID_QUESTION');

    await prisma.assignmentQuestion.upsert({
      where: {
        assignmentId_questionId: { assignmentId, questionId: item.questionId },
      },
      create: {
        assignmentId,
        questionId: item.questionId,
        marks: item.marks ?? question.defaultMarks,
        sortOrder: item.sortOrder,
      },
      update: {
        marks: item.marks ?? question.defaultMarks,
        sortOrder: item.sortOrder,
      },
    });
  }

  return getAssignment(assignmentId, { id: lecturerId, role: 'LECTURER' });
}

function computePersonalDeadline(startedAt: Date, durationMinutes: number, endAt: Date) {
  const personalEnd = new Date(startedAt.getTime() + durationMinutes * 60_000);
  return personalEnd < endAt ? personalEnd : endAt;
}

export async function startAttempt(studentId: string, assignmentId: string) {
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, deletedAt: null, isPublished: true },
  });
  if (!assignment) throw ApiError.notFound('Assignment not found');

  await assertStudentEnrolled(studentId, assignment.classId);

  const now = new Date();
  if (now < assignment.startAt) {
    throw ApiError.forbidden('Assignment has not started', 'ASSIGNMENT_NOT_STARTED');
  }
  if (now > assignment.endAt) {
    throw ApiError.forbidden('Assignment window closed', 'ASSIGNMENT_CLOSED');
  }

  const existing = await prisma.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId } },
  });
  if (existing) {
    if (existing.status !== 'IN_PROGRESS') {
      throw ApiError.conflict('Attempt already submitted', 'ALREADY_SUBMITTED');
    }
    return existing;
  }

  const endsAt = computePersonalDeadline(now, assignment.durationMinutes, assignment.endAt);
  const maxScore = await prisma.assignmentQuestion.aggregate({
    where: { assignmentId },
    _sum: { marks: true },
  });

  return prisma.submission.create({
    data: {
      assignmentId,
      studentId,
      startedAt: now,
      endsAt,
      maxScore: maxScore._sum.marks ?? 0,
    },
  });
}

type AnswerJson = { selectedOptionIds?: string[]; text?: string };

function gradeAnswer(
  type: QuestionType,
  answer: AnswerJson | null,
  question: {
    correctText: string | null;
    options: { id: string; isCorrect: boolean }[];
  },
  maxMarks: number,
): { isCorrect: boolean; marksAwarded: number } {
  if (!answer) return { isCorrect: false, marksAwarded: 0 };

  if (type === 'FILL_BLANK') {
    const expected = (question.correctText ?? '').trim().toLowerCase();
    const given = (answer.text ?? '').trim().toLowerCase();
    const isCorrect = expected.length > 0 && expected === given;
    return { isCorrect, marksAwarded: isCorrect ? maxMarks : 0 };
  }

  const selected = new Set(answer.selectedOptionIds ?? []);
  const correctIds = question.options.filter((o) => o.isCorrect).map((o) => o.id);
  const isCorrect =
    selected.size === correctIds.length && correctIds.every((id) => selected.has(id));
  return { isCorrect, marksAwarded: isCorrect ? maxMarks : 0 };
}

export async function autosaveAnswers(
  studentId: string,
  assignmentId: string,
  input: z.infer<typeof autosaveSchema>,
) {
  const submission = await prisma.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId } },
    include: { assignment: true },
  });
  if (!submission) throw ApiError.notFound('Attempt not found', 'ATTEMPT_NOT_FOUND');
  if (submission.status !== 'IN_PROGRESS') {
    throw ApiError.conflict('Attempt already submitted', 'ALREADY_SUBMITTED');
  }

  const now = new Date();
  if (now > submission.endsAt || now > submission.assignment.endAt) {
    throw ApiError.forbidden('Deadline passed', 'DEADLINE_PASSED');
  }

  for (const item of input.answers) {
    const aq = await prisma.assignmentQuestion.findFirst({
      where: { id: item.assignmentQuestionId, assignmentId },
    });
    if (!aq) continue;

    await prisma.submissionAnswer.upsert({
      where: {
        submissionId_assignmentQuestionId: {
          submissionId: submission.id,
          assignmentQuestionId: item.assignmentQuestionId,
        },
      },
      create: {
        submissionId: submission.id,
        assignmentQuestionId: item.assignmentQuestionId,
        answer: (item.answer ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      update: { answer: (item.answer ?? undefined) as Prisma.InputJsonValue | undefined },
    });
  }

  return { saved: true };
}

async function finalizeSubmission(
  submissionId: string,
  status: 'SUBMITTED' | 'AUTO_SUBMITTED',
) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      assignment: true,
      answers: true,
    },
  });
  if (!submission) return null;
  if (submission.status !== 'IN_PROGRESS') return submission;

  const assignmentQuestions = await prisma.assignmentQuestion.findMany({
    where: { assignmentId: submission.assignmentId },
    include: { question: { include: { options: true } } },
  });

  let score = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  const now = new Date();

  for (const aq of assignmentQuestions) {
    const existing = submission.answers.find((a) => a.assignmentQuestionId === aq.id);
    const answer = (existing?.answer as AnswerJson | null) ?? null;
    const maxMarks = Number(aq.marks);
    const grade = gradeAnswer(aq.question.type, answer, aq.question, maxMarks);

    await prisma.submissionAnswer.upsert({
      where: {
        submissionId_assignmentQuestionId: {
          submissionId: submission.id,
          assignmentQuestionId: aq.id,
        },
      },
      create: {
        submissionId: submission.id,
        assignmentQuestionId: aq.id,
        answer: answer ?? undefined,
        isCorrect: grade.isCorrect,
        marksAwarded: grade.marksAwarded,
        gradedAt: now,
      },
      update: {
        isCorrect: grade.isCorrect,
        marksAwarded: grade.marksAwarded,
        gradedAt: now,
      },
    });

    score += grade.marksAwarded;
    if (grade.isCorrect) correctCount += 1;
    else incorrectCount += 1;
  }

  return prisma.submission.update({
    where: { id: submissionId },
    data: {
      status,
      submittedAt: now,
      score,
      correctCount,
      incorrectCount,
    },
  });
}

export async function submitAttempt(studentId: string, assignmentId: string) {
  const submission = await prisma.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId } },
    include: { assignment: true },
  });
  if (!submission) throw ApiError.notFound('Attempt not found', 'ATTEMPT_NOT_FOUND');
  if (submission.status !== 'IN_PROGRESS') return submission;

  const now = new Date();
  if (now > submission.endsAt && now > submission.assignment.endAt) {
    throw ApiError.forbidden('Deadline passed', 'DEADLINE_PASSED');
  }

  return finalizeSubmission(submission.id, 'SUBMITTED');
}

export async function getResult(studentId: string, assignmentId: string) {
  const submission = await prisma.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId } },
    include: {
      assignment: true,
      answers: {
        include: {
          assignmentQuestion: {
            include: { question: { include: { options: true } } },
          },
        },
      },
    },
  });
  if (!submission) throw ApiError.notFound('No attempt found', 'NO_ATTEMPT');

  const { assignment } = submission;
  const now = new Date();

  if (submission.status === 'IN_PROGRESS') {
    throw ApiError.forbidden('Attempt in progress', 'IN_PROGRESS');
  }

  let canView = false;
  switch (assignment.resultPolicy) {
    case 'IMMEDIATE':
      canView = true;
      break;
    case 'AFTER_COMPLETION':
      canView = now >= assignment.endAt;
      break;
    case 'SCHEDULED':
      canView = assignment.resultDeclareAt ? now >= assignment.resultDeclareAt : false;
      break;
  }

  if (!canView) {
    throw ApiError.forbidden('Results not yet available', 'RESULTS_NOT_AVAILABLE');
  }

  return {
    submissionId: submission.id,
    status: submission.status,
    score: decimalToNumber(submission.score),
    maxScore: decimalToNumber(submission.maxScore),
    correctCount: submission.correctCount,
    incorrectCount: submission.incorrectCount,
    submittedAt: submission.submittedAt,
    answers: submission.answers.map((a) => ({
      assignmentQuestionId: a.assignmentQuestionId,
      answer: a.answer,
      isCorrect: a.isCorrect,
      marksAwarded: decimalToNumber(a.marksAwarded),
      explanation: a.assignmentQuestion.question.explanation,
      correctText: a.assignmentQuestion.question.correctText,
      options: a.assignmentQuestion.question.options.map((o) => ({
        id: o.id,
        optionText: o.optionText,
        isCorrect: o.isCorrect,
      })),
    })),
  };
}

export async function autoSubmitExpired() {
  const now = new Date();
  const expired = await prisma.submission.findMany({
    where: {
      status: 'IN_PROGRESS',
      OR: [{ endsAt: { lte: now } }, { assignment: { endAt: { lte: now } } }],
    },
    take: 100,
  });

  let count = 0;
  for (const sub of expired) {
    await finalizeSubmission(sub.id, 'AUTO_SUBMITTED');
    count += 1;
  }
  return { processed: count };
}
