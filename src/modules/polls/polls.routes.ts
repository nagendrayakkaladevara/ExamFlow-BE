import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import * as pollsController from './polls.controller';
import {
  createPollSchema,
  listPollsQuerySchema,
  pollIdParamSchema,
  updatePollSchema,
  voteSchema,
} from './polls.schema';

export const pollsRouter = Router();

pollsRouter.use(authenticate);

pollsRouter.get('/', validate(listPollsQuerySchema, 'query'), pollsController.list);
pollsRouter.get('/:id/results', validate(pollIdParamSchema, 'params'), pollsController.results);
pollsRouter.get('/:id', validate(pollIdParamSchema, 'params'), pollsController.get);
pollsRouter.post(
  '/',
  authorize('ADMIN', 'LECTURER'),
  validate(createPollSchema),
  pollsController.create,
);
pollsRouter.patch(
  '/:id',
  authorize('ADMIN', 'LECTURER'),
  validate(pollIdParamSchema, 'params'),
  validate(updatePollSchema),
  pollsController.update,
);
pollsRouter.delete(
  '/:id',
  authorize('ADMIN', 'LECTURER'),
  validate(pollIdParamSchema, 'params'),
  pollsController.remove,
);
pollsRouter.post(
  '/:id/vote',
  validate(pollIdParamSchema, 'params'),
  validate(voteSchema),
  pollsController.vote,
);
