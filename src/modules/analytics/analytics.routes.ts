import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import * as analyticsController from './analytics.controller';
import {
  activityQuerySchema,
  alertsQuerySchema,
  assignmentIdParamSchema,
  classIdParamSchema,
  dateRangeQuerySchema,
  exportQuerySchema,
  reportTypeParamSchema,
  rosterQuerySchema,
  trendsQuerySchema,
} from './analytics.schema';

export const analyticsRouter = Router();

analyticsRouter.use(authenticate);

analyticsRouter.get(
  '/student/me',
  authorize('STUDENT'),
  validate(dateRangeQuerySchema, 'query'),
  analyticsController.studentMe,
);

analyticsRouter.get(
  '/student/me/by-tag',
  authorize('STUDENT'),
  validate(dateRangeQuerySchema, 'query'),
  analyticsController.studentMeByTag,
);

analyticsRouter.get(
  '/lecturer/summary',
  authorize('LECTURER', 'ADMIN'),
  validate(dateRangeQuerySchema, 'query'),
  analyticsController.lecturerSummary,
);

analyticsRouter.get(
  '/lecturer/classes/:classId',
  authorize('LECTURER', 'ADMIN'),
  validate(classIdParamSchema, 'params'),
  validate(dateRangeQuerySchema, 'query'),
  analyticsController.lecturerClass,
);

analyticsRouter.get(
  '/lecturer/assignments/:assignmentId',
  authorize('LECTURER', 'ADMIN'),
  validate(assignmentIdParamSchema, 'params'),
  validate(rosterQuerySchema, 'query'),
  analyticsController.lecturerAssignment,
);

analyticsRouter.get(
  '/lecturer/assignments/:assignmentId/questions',
  authorize('LECTURER', 'ADMIN'),
  validate(assignmentIdParamSchema, 'params'),
  validate(dateRangeQuerySchema, 'query'),
  analyticsController.lecturerAssignmentQuestions,
);

analyticsRouter.get(
  '/lecturer/assignments/:assignmentId/export',
  authorize('LECTURER', 'ADMIN'),
  validate(assignmentIdParamSchema, 'params'),
  validate(exportQuerySchema, 'query'),
  analyticsController.lecturerAssignmentExport,
);

analyticsRouter.get('/admin/overview', authorize('ADMIN'), analyticsController.adminOverview);

analyticsRouter.get(
  '/admin/classes/:classId',
  authorize('ADMIN'),
  validate(classIdParamSchema, 'params'),
  analyticsController.adminClass,
);

analyticsRouter.get(
  '/admin/activity',
  authorize('ADMIN'),
  validate(activityQuerySchema, 'query'),
  analyticsController.adminActivity,
);

analyticsRouter.get(
  '/admin/trends',
  authorize('ADMIN'),
  validate(trendsQuerySchema, 'query'),
  analyticsController.adminTrends,
);

analyticsRouter.get(
  '/admin/alerts',
  authorize('ADMIN'),
  validate(alertsQuerySchema, 'query'),
  analyticsController.adminAlerts,
);

analyticsRouter.get(
  '/admin/reports/:reportType/export',
  authorize('ADMIN'),
  validate(reportTypeParamSchema, 'params'),
  validate(exportQuerySchema, 'query'),
  analyticsController.adminReportExport,
);
