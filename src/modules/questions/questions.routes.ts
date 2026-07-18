import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import * as questionsController from './questions.controller';
import {
  createQuestionSchema,
  questionIdParamSchema,
  searchQuestionsQuerySchema,
  updateQuestionSchema,
} from './questions.schema';

export const questionsRouter = Router();

questionsRouter.use(authenticate, authorize('LECTURER'));

questionsRouter.get('/search', validate(searchQuestionsQuerySchema, 'query'), questionsController.search);
questionsRouter.get('/', questionsController.list);
questionsRouter.post('/', validate(createQuestionSchema), questionsController.create);
questionsRouter.get('/:id', validate(questionIdParamSchema, 'params'), questionsController.get);
questionsRouter.patch(
  '/:id',
  validate(questionIdParamSchema, 'params'),
  validate(updateQuestionSchema),
  questionsController.update,
);
questionsRouter.delete('/:id', validate(questionIdParamSchema, 'params'), questionsController.remove);
