import { z } from 'zod';

const isoDate = z.string().datetime({ offset: true }).or(z.string().datetime());

export const classIdParamSchema = z.object({ classId: z.string().uuid() }).strict();
export const assignmentIdParamSchema = z.object({ assignmentId: z.string().uuid() }).strict();
export const reportTypeParamSchema = z
  .object({
    reportType: z.enum(['overview', 'class-performance', 'assignment-results']),
  })
  .strict();

function parseDateRange(q: { from?: string; to?: string }) {
  return {
    from: q.from ? new Date(q.from) : undefined,
    to: q.to ? new Date(q.to) : undefined,
  };
}

export const dateRangeQuerySchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .strict()
  .transform(parseDateRange);

export const rosterQuerySchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    sort: z.enum(['score', 'name', 'submittedAt']).default('score'),
    status: z.enum(['completed', 'pending', 'all']).default('all'),
  })
  .strict()
  .transform((q) => ({
    ...parseDateRange(q),
    page: q.page,
    limit: q.limit,
    sort: q.sort,
    status: q.status,
  }));

export const activityQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().optional(),
  })
  .strict();

export const trendsQuerySchema = z
  .object({
    metric: z.enum(['completion', 'submissions', 'averageScore']).default('submissions'),
    interval: z.enum(['day', 'week', 'month']).default('day'),
    from: isoDate,
    to: isoDate,
  })
  .strict()
  .transform((q) => ({
    metric: q.metric,
    interval: q.interval,
    from: new Date(q.from),
    to: new Date(q.to),
  }));

export const alertsQuerySchema = z
  .object({
    threshold: z.coerce.number().min(0).max(1).default(0.5),
  })
  .strict();

export const exportQuerySchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    format: z.enum(['csv']).default('csv'),
    classId: z.string().uuid().optional(),
  })
  .strict()
  .transform((q) => ({
    ...parseDateRange(q),
    format: q.format as 'csv',
    classId: q.classId,
  }));
