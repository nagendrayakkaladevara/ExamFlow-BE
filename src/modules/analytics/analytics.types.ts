import type { QuestionType, SubmissionStatus } from '@prisma/client';

export type AssignmentRankingStatus = SubmissionStatus | null;

export type StudentAnalyticsRecent = {
  assignmentId: string;
  title: string;
  score: number | null;
  maxScore: number | null;
  correctCount: number | null;
  incorrectCount: number | null;
  percentage: number | null;
  submittedAt: Date | null;
  status: SubmissionStatus;
};

export type TrendPoint = {
  submittedAt: Date;
  percentage: number;
};

export type StudentAnalytics = {
  totalAttempts: number;
  averageScore: number | null;
  recent: StudentAnalyticsRecent[];
  trend: TrendPoint[];
};

export type LecturerClassAnalytics = {
  classId: string;
  studentCount: number;
  assignmentCount: number;
  completedSubmissions: number;
  completionRate: number;
  passed: number;
  failed: number;
  highestScore: number | null;
  lowestScore: number | null;
  averageScore: number | null;
};

export type AssignmentRankingRow = {
  rank: number | null;
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  status: AssignmentRankingStatus;
  score: number | null;
  maxScore: number | null;
  submittedAt: Date | null;
};

export type LecturerAssignmentAnalytics = {
  assignmentId: string;
  title: string;
  enrolled: number;
  submitted: number;
  completionRate: number;
  rankings: AssignmentRankingRow[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
  };
};

export type AdminOverview = {
  usersByRole: Record<string, number>;
  activeClasses: number;
  totalAssignments: number;
  completedSubmissions: number;
  averageCompletionRate: number;
};

export type LecturerClassSummaryRow = {
  classId: string;
  className: string;
  studentCount: number;
  assignmentCount: number;
  completedSubmissions: number;
  completionRate: number;
  passed: number;
  failed: number;
  highestScore: number | null;
  lowestScore: number | null;
  averageScore: number | null;
};

export type LecturerSummary = {
  classes: LecturerClassSummaryRow[];
  totals: {
    classCount: number;
    uniqueStudentCount: number;
    assignmentCount: number;
    completedSubmissions: number;
    completionRate: number;
    passed: number;
    failed: number;
    averageScore: number | null;
  };
};

export type QuestionWrongAnswer = {
  optionText: string;
  count: number;
  percentage: number;
};

export type AssignmentQuestionAnalytics = {
  assignmentQuestionId: string;
  title: string;
  type: QuestionType;
  marks: number;
  sortOrder: number;
  attemptCount: number;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
  correctRate: number | null;
  topWrongAnswers: QuestionWrongAnswer[];
  tags: Array<{ tagId: string; tagName: string }>;
};

export type StudentTagPerformance = {
  tagId: string;
  tagName: string;
  attemptCount: number;
  correctCount: number;
  correctRate: number | null;
};

export type StudentTagAnalytics = {
  byTag: StudentTagPerformance[];
  weakTopics: StudentTagPerformance[];
};

export type AdminClassAssignmentRow = {
  assignmentId: string;
  title: string;
  enrolled: number;
  submitted: number;
  completionRate: number;
  averageScore: number | null;
};

export type AdminClassAnalytics = {
  classId: string;
  className: string;
  studentCount: number;
  assignmentCount: number;
  completionRate: number;
  averageScore: number | null;
  assignments: AdminClassAssignmentRow[];
};

export type ActivityEventType =
  | 'ASSIGNMENT_PUBLISHED'
  | 'USER_REGISTERED'
  | 'CLASS_CREATED'
  | 'SUBMISSION_COMPLETED';

export type ActivityEvent = {
  id: string;
  type: ActivityEventType;
  actorName: string;
  resourceLabel: string;
  occurredAt: Date;
};

export type ActivityFeed = {
  items: ActivityEvent[];
  nextCursor: string | null;
};

export type TrendMetric = 'completion' | 'submissions' | 'averageScore';
export type TrendInterval = 'day' | 'week' | 'month';

export type TrendPointAdmin = {
  periodStart: Date;
  periodEnd: Date;
  value: number;
};

export type AdminTrends = {
  metric: TrendMetric;
  interval: TrendInterval;
  from: Date;
  to: Date;
  points: TrendPointAdmin[];
};

export type AdminAlert = {
  classId: string;
  className: string;
  assignmentId: string;
  assignmentTitle: string;
  completionRate: number;
  threshold: number;
};

export type DateRangeQuery = {
  from?: Date;
  to?: Date;
};

export type RosterQuery = DateRangeQuery & {
  page?: number;
  limit?: number;
  sort?: 'score' | 'name' | 'submittedAt';
  status?: 'completed' | 'pending' | 'all';
};
