import type { Prisma, SubmissionStatus } from '@prisma/client';
import { decimalToNumber } from '../../utils/pagination';
import { COMPLETED_STATUSES, PASS_THRESHOLD_PERCENT } from './analytics.constants';
import type { AssignmentRankingRow } from './analytics.types';

export function toPercentage(score: number | null, maxScore: number | null): number | null {
  if (score == null || maxScore == null || maxScore <= 0) return null;
  return Math.round((score / maxScore) * 1000) / 10;
}

export function isCompletedStatus(status: SubmissionStatus): boolean {
  return (COMPLETED_STATUSES as readonly string[]).includes(status);
}

export function buildSubmittedAtFilter(
  from?: Date,
  to?: Date,
): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  const filter: Prisma.DateTimeFilter = {};
  if (from) filter.gte = from;
  if (to) filter.lte = to;
  return filter;
}

export function completionRate(completed: number, total: number, decimals = 2): number {
  if (total <= 0) return 0;
  const factor = 10 ** decimals;
  return Math.round((completed / total) * factor) / factor;
}

export function summarizeSubmissionScores(
  submissions: { score: unknown; maxScore: unknown }[],
) {
  const percentages: number[] = [];
  let passed = 0;
  let failed = 0;

  for (const submission of submissions) {
    const score = decimalToNumber(submission.score as never);
    const maxScore = decimalToNumber(submission.maxScore as never);
    const percentage = toPercentage(score, maxScore);
    if (percentage == null) continue;

    percentages.push(percentage);
    if (percentage >= PASS_THRESHOLD_PERCENT) passed += 1;
    else failed += 1;
  }

  return {
    passed,
    failed,
    highestScore: percentages.length > 0 ? Math.max(...percentages) : null,
    lowestScore: percentages.length > 0 ? Math.min(...percentages) : null,
    averageScore:
      percentages.length > 0
        ? Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 10) / 10
        : null,
  };
}

export function averagePercentage(
  submissions: { score: unknown; maxScore: unknown }[],
): number | null {
  const percentages = submissions
    .map((s) =>
      toPercentage(
        decimalToNumber(s.score as never),
        decimalToNumber(s.maxScore as never),
      ),
    )
    .filter((p): p is number => p != null);

  if (percentages.length === 0) return null;
  return Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 10) / 10;
}

export const activeStudentFilter = {
  role: 'STUDENT' as const,
  isActive: true,
  deletedAt: null,
};

export const publishedAssignmentFilter = {
  deletedAt: null,
  isPublished: true,
};

export function compareSubmittedRankings(a: AssignmentRankingRow, b: AssignmentRankingRow) {
  const scoreA = a.score ?? -Infinity;
  const scoreB = b.score ?? -Infinity;
  if (scoreB !== scoreA) return scoreB - scoreA;

  const timeA = a.submittedAt?.getTime() ?? Infinity;
  const timeB = b.submittedAt?.getTime() ?? Infinity;
  return timeA - timeB;
}

export function comparePendingRankings(a: AssignmentRankingRow, b: AssignmentRankingRow) {
  if (a.status !== b.status) {
    if (a.status === 'IN_PROGRESS') return -1;
    if (b.status === 'IN_PROGRESS') return 1;
  }

  const lastNameCmp = a.lastName.localeCompare(b.lastName);
  if (lastNameCmp !== 0) return lastNameCmp;
  return a.firstName.localeCompare(b.firstName);
}

export function sortRankings(
  rows: AssignmentRankingRow[],
  sort: 'score' | 'name' | 'submittedAt' = 'score',
): AssignmentRankingRow[] {
  const submitted = rows.filter(
    (row) => row.status === 'SUBMITTED' || row.status === 'AUTO_SUBMITTED',
  );
  const pending = rows.filter((row) => row.status === null || row.status === 'IN_PROGRESS');

  if (sort === 'name') {
    return [...rows].sort((a, b) => {
      const last = a.lastName.localeCompare(b.lastName);
      return last !== 0 ? last : a.firstName.localeCompare(b.firstName);
    });
  }

  if (sort === 'submittedAt') {
    const sortedSubmitted = [...submitted].sort((a, b) => {
      const timeA = a.submittedAt?.getTime() ?? 0;
      const timeB = b.submittedAt?.getTime() ?? 0;
      return timeB - timeA;
    });
    return [...sortedSubmitted, ...pending.sort(comparePendingRankings)];
  }

  const sortedSubmitted = [...submitted].sort(compareSubmittedRankings);
  sortedSubmitted.forEach((row, index) => {
    row.rank = index + 1;
  });
  return [...sortedSubmitted, ...pending.sort(comparePendingRankings)];
}

export function filterRankingsByStatus(
  rows: AssignmentRankingRow[],
  status: 'completed' | 'pending' | 'all',
): AssignmentRankingRow[] {
  if (status === 'completed') {
    return rows.filter((row) => row.status === 'SUBMITTED' || row.status === 'AUTO_SUBMITTED');
  }
  if (status === 'pending') {
    return rows.filter((row) => row.status === null || row.status === 'IN_PROGRESS');
  }
  return rows;
}

export function paginateRows<T>(rows: T[], page: number, limit: number) {
  const total = rows.length;
  const start = (page - 1) * limit;
  return {
    items: rows.slice(start, start + limit),
    pagination: { page, limit, total },
  };
}
