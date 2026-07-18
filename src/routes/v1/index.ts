import { Router } from 'express';
import { authRouter } from '../../modules/auth/auth.routes';
import { usersRouter } from '../../modules/users/users.routes';
import { classesRouter } from '../../modules/classes/classes.routes';
import { questionsRouter } from '../../modules/questions/questions.routes';
import { tagsRouter } from '../../modules/tags/tags.routes';
import { assignmentsRouter } from '../../modules/assignments/assignments.routes';
import { submissionsRouter } from '../../modules/submissions/submissions.routes';
import { analyticsRouter } from '../../modules/analytics/analytics.routes';
import { circularsRouter } from '../../modules/circulars/circulars.routes';
import { pollsRouter } from '../../modules/polls/polls.routes';
import { uploadsRouter } from '../../modules/uploads/uploads.routes';
import { cronRouter } from '../../modules/internal/cron.routes';

/**
 * `/api/v1` router — mounts domain routers (empty stubs for now).
 */
export const v1Router = Router();

v1Router.use('/auth', authRouter);
v1Router.use('/users', usersRouter);
v1Router.use('/classes', classesRouter);
v1Router.use('/questions', questionsRouter);
v1Router.use('/tags', tagsRouter);
v1Router.use('/assignments', assignmentsRouter);
v1Router.use('/submissions', submissionsRouter);
v1Router.use('/analytics', analyticsRouter);
v1Router.use('/circulars', circularsRouter);
v1Router.use('/polls', pollsRouter);
v1Router.use('/uploads', uploadsRouter);
v1Router.use('/internal/cron', cronRouter);

v1Router.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    data: { name: 'pranu-api', version: 'v1' },
  });
});
