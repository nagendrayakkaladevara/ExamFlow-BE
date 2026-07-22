import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { autosaveRateLimit } from '../../middleware/rateLimit';
import * as assignmentsController from './assignments.controller';
import {
  assignmentIdParamSchema,
  autosaveSchema,
  createAssignmentSchema,
  importQuestionsSchema,
  submitSchema,
  updateAssignmentSchema,
} from './assignments.schema';

export const assignmentsRouter = Router();

assignmentsRouter.use(authenticate);

assignmentsRouter.get('/', assignmentsController.list);
assignmentsRouter.get(
  '/:id',
  validate(assignmentIdParamSchema, 'params'),
  assignmentsController.get,
);
assignmentsRouter.get(
  '/:id/attempt',
  authorize('STUDENT'),
  validate(assignmentIdParamSchema, 'params'),
  assignmentsController.attempt,
);
assignmentsRouter.get(
  '/:id/result',
  authorize('STUDENT'),
  validate(assignmentIdParamSchema, 'params'),
  assignmentsController.result,
);

assignmentsRouter.post(
  '/',
  authorize('LECTURER'),
  validate(createAssignmentSchema),
  assignmentsController.create,
);
assignmentsRouter.patch(
  '/:id',
  authorize('LECTURER'),
  validate(assignmentIdParamSchema, 'params'),
  validate(updateAssignmentSchema),
  assignmentsController.update,
);
assignmentsRouter.delete(
  '/:id',
  authorize('LECTURER'),
  validate(assignmentIdParamSchema, 'params'),
  assignmentsController.remove,
);
assignmentsRouter.post(
  '/:id/questions',
  authorize('LECTURER'),
  validate(assignmentIdParamSchema, 'params'),
  validate(importQuestionsSchema),
  assignmentsController.importQuestions,
);

assignmentsRouter.post(
  '/:id/start',
  authorize('STUDENT'),
  validate(assignmentIdParamSchema, 'params'),
  assignmentsController.start,
);
assignmentsRouter.post(
  '/:id/autosave',
  authorize('STUDENT'),
  autosaveRateLimit,
  validate(assignmentIdParamSchema, 'params'),
  validate(autosaveSchema),
  assignmentsController.autosave,
);
assignmentsRouter.post(
  '/:id/submit',
  authorize('STUDENT'),
  validate(assignmentIdParamSchema, 'params'),
  validate(submitSchema),
  assignmentsController.submit,
);
