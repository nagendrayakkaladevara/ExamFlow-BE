import { z } from 'zod';

export const createTagSchema = z.object({ name: z.string().min(1).max(100) }).strict();
export const updateTagSchema = z.object({ name: z.string().min(1).max(100) }).strict();
export const tagIdParamSchema = z.object({ id: z.string().uuid() }).strict();
