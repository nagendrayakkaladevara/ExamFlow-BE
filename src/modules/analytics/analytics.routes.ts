import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { z } from 'zod';
import * as analyticsController from './analytics.controller';

const classIdParamSchema = z.object({ classId: z.string().uuid() }).strict();
const assignmentIdParamSchema = z.object({ assignmentId: z.string().uuid() }).strict();

export const analyticsRouter = Router();

analyticsRouter.use(authenticate);

analyticsRouter.get('/student/me', authorize('STUDENT'), analyticsController.studentMe);
analyticsRouter.get(
  '/lecturer/classes/:classId',
  authorize('LECTURER'),
  validate(classIdParamSchema, 'params'),
  analyticsController.lecturerClass,
);
analyticsRouter.get(
  '/lecturer/assignments/:assignmentId',
  authorize('LECTURER'),
  validate(assignmentIdParamSchema, 'params'),
  analyticsController.lecturerAssignment,
);
analyticsRouter.get('/admin/overview', authorize('ADMIN'), analyticsController.adminOverview);
