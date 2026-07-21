import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import * as classesController from './classes.controller';
import {
  assignMemberSchema,
  classIdParamSchema,
  createClassSchema,
  listClassesQuerySchema,
  updateClassSchema,
} from './classes.schema';

export const classesRouter = Router();

classesRouter.use(authenticate);

classesRouter.get(
  '/assigned',
  authorize('LECTURER'),
  classesController.listAssigned,
);

classesRouter.get(
  '/enrolled',
  authorize('STUDENT'),
  classesController.listEnrolled,
);

classesRouter.get('/', authorize('ADMIN'), validate(listClassesQuerySchema, 'query'), classesController.list);
classesRouter.post('/', authorize('ADMIN'), validate(createClassSchema), classesController.create);

classesRouter.get(
  '/:id',
  authorize('ADMIN', 'LECTURER', 'STUDENT'),
  validate(classIdParamSchema, 'params'),
  classesController.get,
);
classesRouter.get(
  '/:id/lecturers',
  authorize('ADMIN', 'LECTURER', 'STUDENT'),
  validate(classIdParamSchema, 'params'),
  classesController.listLecturers,
);
classesRouter.get(
  '/:id/students',
  authorize('ADMIN', 'LECTURER', 'STUDENT'),
  validate(classIdParamSchema, 'params'),
  classesController.listStudents,
);

classesRouter.patch(
  '/:id',
  authorize('ADMIN'),
  validate(classIdParamSchema, 'params'),
  validate(updateClassSchema),
  classesController.update,
);
classesRouter.delete('/:id', authorize('ADMIN'), validate(classIdParamSchema, 'params'), classesController.remove);
classesRouter.post(
  '/:id/lecturers',
  authorize('ADMIN'),
  validate(classIdParamSchema, 'params'),
  validate(assignMemberSchema),
  classesController.assignLecturer,
);
classesRouter.post(
  '/:id/students',
  authorize('ADMIN'),
  validate(classIdParamSchema, 'params'),
  validate(assignMemberSchema),
  classesController.assignStudent,
);
