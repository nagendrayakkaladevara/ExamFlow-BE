import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { uploadRateLimit } from '../../middleware/rateLimit';
import * as uploadsController from './uploads.controller';
import { uploadBodySchema } from './uploads.schema';

export const uploadsRouter = Router();

uploadsRouter.post(
  '/',
  authenticate,
  authorize('ADMIN', 'LECTURER'),
  uploadRateLimit,
  validate(uploadBodySchema),
  uploadsController.upload,
);
