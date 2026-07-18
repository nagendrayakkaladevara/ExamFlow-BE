import { z } from 'zod';

export const listUsersQuerySchema = z
  .object({
    role: z.enum(['ADMIN', 'LECTURER', 'STUDENT']).optional(),
    isActive: z.enum(['true', 'false']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
  })
  .strict();

export const createUserSchema = z
  .object({
    email: z.string().email().max(255),
    password: z.string().min(8).max(128),
    role: z.enum(['LECTURER', 'STUDENT']),
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
  })
  .strict();

export const updateUserSchema = z
  .object({
    email: z.string().email().max(255).optional(),
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(8).max(128).optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field required' });

export const userIdParamSchema = z.object({ id: z.string().uuid() }).strict();

export const bulkCreateStudentRowSchema = z
  .object({
    email: z.string().email().max(255),
    password: z.string().min(8).max(128).optional(),
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
  })
  .strict();

export const bulkCreateUsersSchema = z
  .object({
    students: z.array(bulkCreateStudentRowSchema).min(1).max(200),
    defaultPassword: z.string().min(8).max(128).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.students.every((student) => student.password || data.defaultPassword),
    {
      message: 'Each student needs a password, or provide defaultPassword',
      path: ['defaultPassword'],
    },
  );
