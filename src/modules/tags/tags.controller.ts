import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as tagsService from './tags.service';

function ok(res: Response, req: Request, data: unknown, status = 200) {
  res.status(status).json({ success: true, data, requestId: req.requestId });
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await tagsService.listTags(req.user!.id));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await tagsService.createTag(req.user!.id, req.body.name), 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await tagsService.updateTag(req.user!.id, req.params.id, req.body.name));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await tagsService.deleteTag(req.user!.id, req.params.id);
  ok(res, req, { deleted: true });
});
