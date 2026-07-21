import { z } from 'zod';

/** Treat empty/null as omitted — clients often send these when the field is hidden. */
const optionalResultDeclareAt = z.preprocess(
  (val) => (val === '' || val === undefined || val === null ? undefined : val),
  z.string().datetime().optional(),
);

const assignmentBaseSchema = z
  .object({
    classId: z.string().uuid(),
    title: z.string().min(1).max(255),
    description: z.string().optional(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    durationMinutes: z.number().int().positive(),
    resultPolicy: z.enum(['IMMEDIATE', 'AFTER_COMPLETION', 'SCHEDULED']),
    resultDeclareAt: optionalResultDeclareAt,
    isPublished: z.boolean().optional(),
  })
  .strict();

export const createAssignmentSchema = assignmentBaseSchema
  .refine((d) => new Date(d.endAt) > new Date(d.startAt), {
    message: 'endAt must be after startAt',
  })
  .refine(
    (d) => d.resultPolicy !== 'SCHEDULED' || !!d.resultDeclareAt,
    { message: 'resultDeclareAt required for SCHEDULED policy' },
  );

export const updateAssignmentSchema = assignmentBaseSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field required' });

export const assignmentIdParamSchema = z.object({ id: z.string().uuid() }).strict();

export const importQuestionsSchema = z
  .object({
    questions: z
      .array(
        z
          .object({
            questionId: z.string().uuid(),
            marks: z.number().positive().optional(),
            sortOrder: z.number().int().min(0).default(0),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const autosaveSchema = z
  .object({
    answers: z.array(
      z
        .object({
          assignmentQuestionId: z.string().uuid(),
          answer: z.record(z.unknown()).nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export const submitSchema = z.object({}).strict();
