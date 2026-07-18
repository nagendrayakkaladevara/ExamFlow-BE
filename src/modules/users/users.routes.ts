import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import * as usersController from './users.controller';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  userIdParamSchema,
} from './users.schema';

export const usersRouter = Router();

usersRouter.use(authenticate, authorize('ADMIN'));

usersRouter.get('/', validate(listUsersQuerySchema, 'query'), usersController.list);
usersRouter.post('/', validate(createUserSchema), usersController.create);
usersRouter.get('/:id', validate(userIdParamSchema, 'params'), usersController.get);
usersRouter.patch(
  '/:id',
  validate(userIdParamSchema, 'params'),
  validate(updateUserSchema),
  usersController.update,
);
usersRouter.delete('/:id', validate(userIdParamSchema, 'params'), usersController.remove);
