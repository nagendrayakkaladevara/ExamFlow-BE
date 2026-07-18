import { z } from 'zod';

const audienceSchema = z
  .object({
    targetType: z.enum(['ALL_LECTURERS', 'ALL_STUDENTS', 'USER', 'CLASS']),
    targetId: z.string().uuid().optional(),
  })
  .strict();

export const pollOptionInputSchema = z
  .object({
    optionText: z.string().min(1).max(500),
    sortOrder: z.number().int().min(0).default(0),
  })
  .strict();

const pollBaseSchema = z
  .object({
    title: z.string().min(1).max(255),
    description: z.string().optional(),
    publishAt: z.string().datetime(),
    expireAt: z.string().datetime(),
    resultVisibility: z.enum(['AFTER_VOTE', 'AFTER_EXPIRY', 'NEVER']).default('AFTER_VOTE'),
    audiences: z.array(audienceSchema).min(1),
    options: z.array(pollOptionInputSchema).min(2),
  })
  .strict();

export const createPollSchema = pollBaseSchema.refine(
  (d) => new Date(d.expireAt) > new Date(d.publishAt),
  { message: 'expireAt must be after publishAt' },
);

export const updatePollSchema = pollBaseSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: 'At least one field required' },
);

export const pollIdParamSchema = z.object({ id: z.string().uuid() }).strict();

export const voteSchema = z.object({ optionId: z.string().uuid() }).strict();

export const listPollsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
