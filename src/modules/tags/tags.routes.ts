import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import * as tagsController from './tags.controller';
import { createTagSchema, tagIdParamSchema, updateTagSchema } from './tags.schema';

export const tagsRouter = Router();

tagsRouter.use(authenticate, authorize('LECTURER'));

tagsRouter.get('/', tagsController.list);
tagsRouter.post('/', validate(createTagSchema), tagsController.create);
tagsRouter.patch(
  '/:id',
  validate(tagIdParamSchema, 'params'),
  validate(updateTagSchema),
  tagsController.update,
);
tagsRouter.delete('/:id', validate(tagIdParamSchema, 'params'), tagsController.remove);
