import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as assignmentsService from './assignments.service';

function ok(res: Response, req: Request, data: unknown, status = 200, meta?: Record<string, unknown>) {
  res.status(status).json({ success: true, data, meta, requestId: req.requestId });
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await assignmentsService.listAssignments(req.user!));
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await assignmentsService.getAssignment(req.params.id, req.user!));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await assignmentsService.createAssignment(req.user!.id, req.body), 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await assignmentsService.updateAssignment(req.user!.id, req.params.id, req.body));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await assignmentsService.deleteAssignment(req.user!.id, req.params.id);
  ok(res, req, { deleted: true });
});

export const importQuestions = asyncHandler(async (req: Request, res: Response) => {
  ok(
    res,
    req,
    await assignmentsService.importQuestions(req.user!.id, req.params.id, req.body),
  );
});

export const start = asyncHandler(async (req: Request, res: Response) => {
  const submission = await assignmentsService.startAttempt(req.user!.id, req.params.id);
  ok(res, req, submission, 201);
});

export const autosave = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await assignmentsService.autosaveAnswers(req.user!.id, req.params.id, req.body));
});

export const submit = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await assignmentsService.submitAttempt(req.user!.id, req.params.id));
});

export const result = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await assignmentsService.getResult(req.user!.id, req.params.id));
});
