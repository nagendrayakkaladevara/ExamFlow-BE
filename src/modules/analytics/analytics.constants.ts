/** Minimum percentage (0–100) to count as passed. Documented in API_DOCS.md. */
export const PASS_THRESHOLD_PERCENT = 50;

/** Tags below this correct rate are included in weakTopics[]. */
export const WEAK_TOPIC_THRESHOLD = 0.5;

export const RECENT_SUBMISSIONS_LIMIT = 10;

export const DEFAULT_ACTIVITY_LIMIT = 20;
export const MAX_ACTIVITY_LIMIT = 50;

export const DEFAULT_ALERT_COMPLETION_THRESHOLD = 0.5;

export const COMPLETED_STATUSES = ['SUBMITTED', 'AUTO_SUBMITTED'] as const;
