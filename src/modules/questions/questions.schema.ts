import { z } from 'zod';

const optionalImageUrl = z.preprocess(
  (val) => (val === '' || val === undefined ? undefined : val),
  z.union([z.string().url(), z.null()]).optional(),
);

const optionalImageBlobKey = z.preprocess(
  (val) => (val === '' || val === undefined ? undefined : val),
  z.union([z.string().max(512), z.null()]).optional(),
);

export const questionOptionSchema = z
  .object({
    optionText: z.string().min(1),
    isCorrect: z.boolean(),
    sortOrder: z.number().int().min(0).default(0),
  })
  .strict();

export const createQuestionSchema = z
  .object({
    type: z.enum(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'FILL_BLANK']),
    title: z.string().min(1).max(255),
    description: z.string().min(1),
    explanation: z.string().optional(),
    defaultMarks: z.number().positive(),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
    subject: z.string().max(150).optional(),
    topic: z.string().max(150).optional(),
    correctText: z.string().optional(),
    imageUrl: optionalImageUrl,
    imageBlobKey: optionalImageBlobKey,
    tagIds: z.array(z.string().uuid()).optional(),
    options: z.array(questionOptionSchema).optional(),
  })
  .strict();

export const updateQuestionSchema = createQuestionSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: 'At least one field required' },
);

export const searchQuestionsQuerySchema = z
  .object({
    q: z.string().optional(),
    tagIds: z.string().optional(),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
    type: z.enum(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'FILL_BLANK']).optional(),
    subject: z.string().optional(),
    topic: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
  })
  .strict();

export const questionIdParamSchema = z.object({ id: z.string().uuid() }).strict();
