import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as analyticsService from './analytics.service';

function ok(res: Response, req: Request, data: unknown) {
  res.status(200).json({ success: true, data, requestId: req.requestId });
}

export const studentMe = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await analyticsService.getStudentAnalytics(req.user!.id, req.query as never));
});

export const studentMeByTag = asyncHandler(async (req: Request, res: Response) => {
  ok(
    res,
    req,
    await analyticsService.getStudentAnalyticsByTag(req.user!.id, req.query as never),
  );
});

export const lecturerSummary = asyncHandler(async (req: Request, res: Response) => {
  ok(
    res,
    req,
    await analyticsService.getLecturerSummary(
      req.user!.id,
      req.user!.role,
      req.query as never,
    ),
  );
});

export const lecturerClass = asyncHandler(async (req: Request, res: Response) => {
  ok(
    res,
    req,
    await analyticsService.getLecturerClassAnalytics(
      req.user!.id,
      req.user!.role,
      req.params.classId,
      req.query as never,
    ),
  );
});

export const lecturerAssignment = asyncHandler(async (req: Request, res: Response) => {
  ok(
    res,
    req,
    await analyticsService.getLecturerAssignmentAnalytics(
      req.user!.id,
      req.user!.role,
      req.params.assignmentId,
      req.query as never,
    ),
  );
});

export const lecturerAssignmentQuestions = asyncHandler(async (req: Request, res: Response) => {
  ok(
    res,
    req,
    await analyticsService.getAssignmentQuestionAnalytics(
      req.user!.id,
      req.user!.role,
      req.params.assignmentId,
      req.query as never,
    ),
  );
});

export const lecturerAssignmentExport = asyncHandler(async (req: Request, res: Response) => {
  const csv = await analyticsService.buildAssignmentExportCsv(
    req.user!.id,
    req.user!.role,
    req.params.assignmentId,
    req.query as never,
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="assignment-${req.params.assignmentId}-results.csv"`,
  );
  res.status(200).send(csv);
});

export const adminOverview = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await analyticsService.getAdminOverview());
});

export const adminClass = asyncHandler(async (req: Request, res: Response) => {
  ok(res, req, await analyticsService.getAdminClassAnalytics(req.params.classId));
});

export const adminActivity = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as never as { limit: number; cursor?: string };
  ok(res, req, await analyticsService.getAdminActivity(query.limit, query.cursor));
});

export const adminTrends = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as never as {
    metric: 'completion' | 'submissions' | 'averageScore';
    interval: 'day' | 'week' | 'month';
    from: Date;
    to: Date;
  };
  ok(
    res,
    req,
    await analyticsService.getAdminTrends(query.metric, query.interval, query.from, query.to),
  );
});

export const adminAlerts = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as never as { threshold: number };
  ok(res, req, await analyticsService.getAdminAlerts(query.threshold));
});

export const adminReportExport = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as never as {
    from?: Date;
    to?: Date;
    classId?: string;
  };
  const reportType = req.params.reportType as
    | 'overview'
    | 'class-performance'
    | 'assignment-results';
  const csv = await analyticsService.buildAdminReportCsv(req.user!.id, reportType, {
    from: query.from,
    to: query.to,
    classId: query.classId,
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="report-${reportType}.csv"`,
  );
  res.status(200).send(csv);
});
