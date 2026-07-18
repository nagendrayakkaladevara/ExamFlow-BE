import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as circularsService from './circulars.service';

function ok(res: Response, req: Request, data: unknown, status = 200, meta?: Record<string, unknown>) {
  res.status(status).json({ success: true, data, meta, requestId: req.requestId });
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await circularsService.listCirculars(req.user!, req.query as never);
  ok(res, req, result.items, 200, result.meta);
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await circularsService.getCircular(req.params.id, req.user!));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await circularsService.createCircular(req.user!, req.body), 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await circularsService.updateCircular(req.user!, req.params.id, req.body));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await circularsService.deleteCircular(req.user!, req.params.id);
  ok(res, req, { deleted: true });
});
