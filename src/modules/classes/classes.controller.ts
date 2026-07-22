import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as classesService from './classes.service';

function ok(res: Response, req: Request, data: unknown, status = 200, meta?: Record<string, unknown>) {
  res.status(status).json({ success: true, data, meta, requestId: req.requestId });
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await classesService.listClasses(req.query as never);
  ok(res, req, result.items, 200, result.meta);
});

export const listAssigned = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await classesService.listLecturerClasses(req.user!.id));
});

export const listEnrolled = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await classesService.listStudentClasses(req.user!.id));
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await classesService.getClass(req.user!, req.params.id));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await classesService.createClass(req.user!.id, req.body), 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await classesService.updateClass(req.user!.id, req.params.id, req.body));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await classesService.deleteClass(req.user!.id, req.params.id);
  ok(res, req, { deleted: true });
});

export const assignLecturer = asyncHandler(async (req: Request, res: Response) => {
  await classesService.assignLecturer(req.user!.id, req.params.id, req.body.userId);
  ok(res, req, { assigned: true });
});

export const assignStudent = asyncHandler(async (req: Request, res: Response) => {
  await classesService.assignStudent(req.user!.id, req.params.id, req.body.userId);
  ok(res, req, { enrolled: true });
});

export const unassignLecturer = asyncHandler(async (req: Request, res: Response) => {
  await classesService.unassignLecturer(req.user!.id, req.params.id, req.params.userId);
  ok(res, req, { unassigned: true });
});

export const unassignStudent = asyncHandler(async (req: Request, res: Response) => {
  await classesService.unassignStudent(req.user!.id, req.params.id, req.params.userId);
  ok(res, req, { unassigned: true });
});

export const listLecturers = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await classesService.listClassLecturers(req.user!, req.params.id));
});

export const listStudents = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await classesService.listClassStudents(req.user!, req.params.id));
});
