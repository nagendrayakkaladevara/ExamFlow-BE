import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as questionsService from './questions.service';

function ok(res: Response, req: Request, data: unknown, status = 200, meta?: Record<string, unknown>) {
  res.status(status).json({ success: true, data, meta, requestId: req.requestId });
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const limit = Number(req.query.limit ?? 20);
  const result = await questionsService.listQuestions(
    req.user!.id,
    limit,
    req.query.cursor as string | undefined,
  );
  ok(res, req, result.items, 200, result.meta);
});

export const search = asyncHandler(async (req: Request, res: Response) => {
  const result = await questionsService.searchQuestions(req.user!.id, req.query as never);
  ok(res, req, result.items, 200, result.meta);
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await questionsService.getQuestion(req.user!.id, req.params.id));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await questionsService.createQuestion(req.user!.id, req.body), 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await questionsService.updateQuestion(req.user!.id, req.params.id, req.body));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await questionsService.deleteQuestion(req.user!.id, req.params.id);
  ok(res, req, { deleted: true });
});
