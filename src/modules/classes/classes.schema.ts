import { z } from 'zod';

export const listClassesQuerySchema = z
  .object({
    isActive: z.enum(['true', 'false']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
  })
  .strict();

export const createClassSchema = z
  .object({
    name: z.string().min(1).max(150),
    code: z.string().min(1).max(50).optional(),
    description: z.string().max(5000).optional(),
  })
  .strict();

export const updateClassSchema = z
  .object({
    name: z.string().min(1).max(150).optional(),
    code: z.string().min(1).max(50).nullable().optional(),
    description: z.string().max(5000).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field required' });

export const classIdParamSchema = z.object({ id: z.string().uuid() }).strict();

export const classMemberParamSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
  })
  .strict();

export const assignMemberSchema = z
  .object({
    userId: z.string().uuid(),
  })
  .strict();
