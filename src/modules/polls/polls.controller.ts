import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as pollsService from './polls.service';

function ok(res: Response, req: Request, data: unknown, status = 200, meta?: Record<string, unknown>) {
  res.status(status).json({ success: true, data, meta, requestId: req.requestId });
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const limit = Number(req.query.limit ?? 20);
  ok(res, req, await pollsService.listPolls(req.user!, limit));
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await pollsService.getPoll(req.params.id, req.user!));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await pollsService.createPoll(req.user!, req.body), 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await pollsService.updatePoll(req.user!, req.params.id, req.body));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await pollsService.deletePoll(req.user!, req.params.id);
  ok(res, req, { deleted: true });
});

export const vote = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await pollsService.vote(req.user!, req.params.id, req.body));
});

export const results = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await pollsService.getResults(req.params.id, req.user!));
});
