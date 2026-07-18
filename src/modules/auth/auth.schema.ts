import { z } from 'zod';

export const loginSchema = z
  .object({
    email: z.string().email().max(255).transform((value) => value.toLowerCase()),
    password: z.string().min(1).max(128),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(128),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    userId: z.string().uuid(),
    newPassword: z.string().min(8).max(128),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
