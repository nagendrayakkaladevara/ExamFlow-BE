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

classesRouter.use(authenticate, authorize('ADMIN'));

classesRouter.get('/', validate(listClassesQuerySchema, 'query'), classesController.list);
classesRouter.post('/', validate(createClassSchema), classesController.create);
classesRouter.get('/:id', validate(classIdParamSchema, 'params'), classesController.get);
classesRouter.patch(
  '/:id',
  validate(classIdParamSchema, 'params'),
  validate(updateClassSchema),
  classesController.update,
);
classesRouter.delete('/:id', validate(classIdParamSchema, 'params'), classesController.remove);
classesRouter.post(
  '/:id/lecturers',
  validate(classIdParamSchema, 'params'),
  validate(assignMemberSchema),
  classesController.assignLecturer,
);
classesRouter.post(
  '/:id/students',
  validate(classIdParamSchema, 'params'),
  validate(assignMemberSchema),
  classesController.assignStudent,
);
