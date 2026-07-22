import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { loginRateLimit, refreshRateLimit } from '../../middleware/rateLimit';
import * as authController from './auth.controller';
import {
  changePasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from './auth.schema';

export const authRouter = Router();

authRouter.post('/login', loginRateLimit, validate({ body: loginSchema }), authController.login);
authRouter.post('/refresh', refreshRateLimit, authController.refresh);
authRouter.get('/me', authenticate, authController.me);
authRouter.post('/logout', authController.logout);
authRouter.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  authController.changePassword,
);
authRouter.post(
  '/reset-password',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ body: resetPasswordSchema }),
  authController.resetPassword,
);
