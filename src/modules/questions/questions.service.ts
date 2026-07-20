import type { Prisma, QuestionType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { decimalToNumber, encodeCursor, parseCursor } from '../../utils/pagination';
import type { createQuestionSchema, searchQuestionsQuerySchema, updateQuestionSchema } from './questions.schema';
import type { z } from 'zod';

function validateQuestionInput(
  type: QuestionType,
  options?: { isCorrect: boolean }[],
  correctText?: string | null,
) {
  if (type === 'FILL_BLANK') {
    if (!correctText?.trim()) {
      throw ApiError.badRequest('correctText required for fill-blank', 'INVALID_QUESTION');
    }
    return;
  }
  if (type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE') {
    if (!options?.length) {
      throw ApiError.badRequest('Options required for MCQ', 'INVALID_QUESTION');
    }
    const correctCount = options.filter((o) => o.isCorrect).length;
    if (type === 'SINGLE_CHOICE' && correctCount !== 1) {
      throw ApiError.badRequest('Single choice must have exactly one correct option', 'INVALID_QUESTION');
    }
    if (type === 'MULTIPLE_CHOICE' && correctCount < 1) {
      throw ApiError.badRequest('Multiple choice must have at least one correct option', 'INVALID_QUESTION');
    }
  }
}

function mapQuestionSearchSummary(row: {
  id: string;
  type: QuestionType;
  title: string;
  defaultMarks: Prisma.Decimal;
  difficulty: string;
  questionTags?: { tag: { id: string; name: string } }[];
}) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    difficulty: row.difficulty,
    marks: decimalToNumber(row.defaultMarks),
    tags: row.questionTags?.map((qt) => qt.tag) ?? [],
  };
}

function mapQuestion(row: {
  id: string;
  type: QuestionType;
  title: string;
  description: string;
  explanation: string | null;
  defaultMarks: Prisma.Decimal;
  difficulty: string;
  subject: string | null;
  topic: string | null;
  correctText: string | null;
  imageUrl: string | null;
  imageBlobKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  options?: { id: string; optionText: string; isCorrect: boolean; sortOrder: number }[];
  questionTags?: { tag: { id: string; name: string } }[];
}) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    explanation: row.explanation,
    defaultMarks: decimalToNumber(row.defaultMarks),
    difficulty: row.difficulty,
    subject: row.subject,
    topic: row.topic,
    imageUrl: row.imageUrl,
    imageBlobKey: row.imageBlobKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    options: row.options?.map((o) => ({
      id: o.id,
      optionText: o.optionText,
      isCorrect: o.isCorrect,
      sortOrder: o.sortOrder,
    })),
    tags: row.questionTags?.map((qt) => qt.tag),
  };
}

const questionInclude = {
  options: { orderBy: { sortOrder: 'asc' as const } },
  questionTags: { include: { tag: true } },
};

const questionSearchInclude = {
  questionTags: { include: { tag: true } },
};

export async function listQuestions(lecturerId: string, limit = 20, cursor?: string) {
  const parsed = parseCursor(cursor);
  const rows = await prisma.question.findMany({
    where: {
      lecturerId,
      deletedAt: null,
      ...(parsed
        ? {
            OR: [
              { createdAt: { lt: parsed.createdAt } },
              { createdAt: parsed.createdAt, id: { lt: parsed.id } },
            ],
          }
        : {}),
    },
    include: questionInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];

  return {
    items: items.map((r) => mapQuestion(r)),
    meta: { nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null },
  };
}

export async function searchQuestions(
  lecturerId: string,
  query: z.infer<typeof searchQuestionsQuerySchema>,
) {
  const tagIdList = query.tagIds?.split(',').filter(Boolean) ?? [];
  const parsed = parseCursor(query.cursor);

  const rows = await prisma.question.findMany({
    where: {
      lecturerId,
      deletedAt: null,
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.subject ? { subject: { equals: query.subject, mode: 'insensitive' } } : {}),
      ...(query.topic ? { topic: { equals: query.topic, mode: 'insensitive' } } : {}),
      ...(tagIdList.length
        ? { questionTags: { some: { tagId: { in: tagIdList } } } }
        : {}),
      ...(parsed
        ? {
            OR: [
              { createdAt: { lt: parsed.createdAt } },
              { createdAt: parsed.createdAt, id: { lt: parsed.id } },
            ],
          }
        : {}),
    },
    include: questionSearchInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
  });

  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  const last = items[items.length - 1];

  return {
    items: items.map((r) => mapQuestionSearchSummary(r)),
    meta: { nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null },
  };
}

export async function getQuestion(lecturerId: string, id: string, includeAnswers = true) {
  const row = await prisma.question.findFirst({
    where: { id, lecturerId, deletedAt: null },
    include: questionInclude,
  });
  if (!row) throw ApiError.notFound('Question not found');
  const mapped = mapQuestion(row);
  if (!includeAnswers) {
    return {
      ...mapped,
      options: mapped.options?.map(({ id: oid, optionText, sortOrder }) => ({
        id: oid,
        optionText,
        sortOrder,
      })),
    };
  }
  return mapped;
}

export async function createQuestion(
  lecturerId: string,
  input: z.infer<typeof createQuestionSchema>,
) {
  validateQuestionInput(input.type, input.options, input.correctText);

  if (input.tagIds?.length) {
    const count = await prisma.tag.count({
      where: { id: { in: input.tagIds }, lecturerId, deletedAt: null },
    });
    if (count !== input.tagIds.length) {
      throw ApiError.badRequest('Invalid tag selection', 'INVALID_TAGS');
    }
  }

  const row = await prisma.question.create({
    data: {
      lecturerId,
      type: input.type,
      title: input.title,
      description: input.description ?? '',
      explanation: input.explanation,
      defaultMarks: input.defaultMarks,
      difficulty: input.difficulty,
      subject: input.subject,
      topic: input.topic,
      correctText: input.type === 'FILL_BLANK' ? input.correctText : null,
      imageUrl: input.imageUrl,
      imageBlobKey: input.imageBlobKey,
      createdById: lecturerId,
      updatedById: lecturerId,
      options: input.options
        ? { create: input.options.map((o) => ({ ...o })) }
        : undefined,
      questionTags: input.tagIds?.length
        ? { create: input.tagIds.map((tagId) => ({ tagId })) }
        : undefined,
    },
    include: questionInclude,
  });

  return mapQuestion(row);
}

export async function updateQuestion(
  lecturerId: string,
  id: string,
  input: z.infer<typeof updateQuestionSchema>,
) {
  const existing = await prisma.question.findFirst({ where: { id, lecturerId, deletedAt: null } });
  if (!existing) throw ApiError.notFound('Question not found');

  const type = input.type ?? existing.type;
  validateQuestionInput(type, input.options, input.correctText ?? existing.correctText);

  await prisma.$transaction(async (tx) => {
    if (input.options) {
      await tx.questionOption.deleteMany({ where: { questionId: id } });
    }
    if (input.tagIds) {
      await tx.questionTag.deleteMany({ where: { questionId: id } });
    }

    await tx.question.update({
      where: { id },
      data: {
        ...(input.type ? { type: input.type } : {}),
        ...(input.title ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.explanation !== undefined ? { explanation: input.explanation } : {}),
        ...(input.defaultMarks ? { defaultMarks: input.defaultMarks } : {}),
        ...(input.difficulty ? { difficulty: input.difficulty } : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.topic !== undefined ? { topic: input.topic } : {}),
        ...(input.correctText !== undefined || input.type === 'FILL_BLANK'
          ? { correctText: type === 'FILL_BLANK' ? input.correctText ?? existing.correctText : null }
          : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.imageBlobKey !== undefined ? { imageBlobKey: input.imageBlobKey } : {}),
        updatedById: lecturerId,
        ...(input.options
          ? { options: { create: input.options.map((o) => ({ ...o })) } }
          : {}),
        ...(input.tagIds
          ? { questionTags: { create: input.tagIds.map((tagId) => ({ tagId })) } }
          : {}),
      },
    });
  });

  return getQuestion(lecturerId, id);
}

export async function deleteQuestion(lecturerId: string, id: string) {
  const existing = await prisma.question.findFirst({ where: { id, lecturerId, deletedAt: null } });
  if (!existing) throw ApiError.notFound('Question not found');
  await prisma.question.update({
    where: { id },
    data: { deletedAt: new Date(), updatedById: lecturerId },
  });
}
