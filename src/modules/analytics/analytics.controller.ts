import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import * as analyticsService from './analytics.service';

const classIdParamSchema = z.object({ classId: z.string().uuid() }).strict();
const assignmentIdParamSchema = z.object({ assignmentId: z.string().uuid() }).strict();

function ok(res: Response, req: Request, data: unknown) {
  res.status(200).json({ success: true, data, requestId: req.requestId });
}

export const studentMe = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await analyticsService.getStudentAnalytics(req.user!.id));
});

export const lecturerClass = asyncHandler(async (req: Request, res: Response) => {
  classIdParamSchema.parse(req.params);
  ok(
    res,
    req,
    await analyticsService.getLecturerClassAnalytics(req.user!.id, req.params.classId),
  );
});

export const lecturerAssignment = asyncHandler(async (req: Request, res: Response) => {
  assignmentIdParamSchema.parse(req.params);
  ok(
    res,
    req,
    await analyticsService.getLecturerAssignmentAnalytics(
      req.user!.id,
      req.params.assignmentId,
    ),
  );
});

export const adminOverview = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await analyticsService.getAdminOverview());
});
