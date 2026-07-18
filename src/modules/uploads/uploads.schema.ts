import { z } from 'zod';

export const uploadBodySchema = z
  .object({
    filename: z.string().min(1).max(255),
    contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    dataBase64: z.string().min(1),
  })
  .strict();
