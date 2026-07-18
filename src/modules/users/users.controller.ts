import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as usersService from './users.service';

function ok(res: Response, req: Request, data: unknown, status = 200, meta?: Record<string, unknown>) {
  res.status(status).json({ success: true, data, meta, requestId: req.requestId });
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await usersService.listUsers(req.query as never);
  ok(res, req, result.items, 200, result.meta);
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.getUser(req.params.id);
  ok(res, req, user);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.createUser(req.user!.id, req.body);
  ok(res, req, user, 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.updateUser(req.user!.id, req.params.id, req.body);
  ok(res, req, user);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await usersService.deleteUser(req.user!.id, req.params.id);
  ok(res, req, { deleted: true });
});
