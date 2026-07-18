import { z } from 'zod';

const audienceSchema = z
  .object({
    targetType: z.enum(['ALL_LECTURERS', 'ALL_STUDENTS', 'USER', 'CLASS']),
    targetId: z.string().uuid().optional(),
  })
  .strict();

export const createCircularSchema = z
  .object({
    title: z.string().min(1).max(255),
    description: z.string().min(1),
    coverImageUrl: z.string().url().optional(),
    coverImageBlobKey: z.string().max(512).optional(),
    publishAt: z.string().datetime(),
    audiences: z.array(audienceSchema).min(1),
  })
  .strict();

export const updateCircularSchema = createCircularSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: 'At least one field required' },
);

export const circularIdParamSchema = z.object({ id: z.string().uuid() }).strict();

export const listCircularsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
  })
  .strict();
