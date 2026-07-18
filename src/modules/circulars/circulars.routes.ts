import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import * as circularsController from './circulars.controller';
import {
  circularIdParamSchema,
  createCircularSchema,
  listCircularsQuerySchema,
  updateCircularSchema,
} from './circulars.schema';

export const circularsRouter = Router();

circularsRouter.use(authenticate);

circularsRouter.get('/', validate(listCircularsQuerySchema, 'query'), circularsController.list);
circularsRouter.get(
  '/:id',
  validate(circularIdParamSchema, 'params'),
  circularsController.get,
);
circularsRouter.post(
  '/',
  authorize('ADMIN', 'LECTURER'),
  validate(createCircularSchema),
  circularsController.create,
);
circularsRouter.patch(
  '/:id',
  authorize('ADMIN', 'LECTURER'),
  validate(circularIdParamSchema, 'params'),
  validate(updateCircularSchema),
  circularsController.update,
);
circularsRouter.delete(
  '/:id',
  authorize('ADMIN', 'LECTURER'),
  validate(circularIdParamSchema, 'params'),
  circularsController.remove,
);
