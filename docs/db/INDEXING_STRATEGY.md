# Indexing Strategy & Performance Recommendations

Companion docs: [DATABASE_DESIGN.md](./DATABASE_DESIGN.md) · [SCHEMA.md](./SCHEMA.md) · [ERD.md](./ERD.md)

Target: Neon PostgreSQL, Prisma, Vercel serverless read/write patterns from the PRD (question search, timed exams, autosave, cron auto-submit, audience feeds, analytics).

---

## 1. Indexing principles

1. **Index every FK** used in joins or `WHERE` filters (Postgres does not auto-index FKs).
2. **Match query shape** — leftmost prefix of composite indexes must match filters/sorts.
3. **Partial indexes** for soft-delete and “active only” hot paths (`WHERE deleted_at IS NULL`).
4. **Avoid over-indexing** — each index slows writes (autosave & vote paths matter).
5. **Unique constraints create unique indexes** — do not duplicate them.
6. **Measure** with `EXPLAIN (ANALYZE, BUFFERS)` on Neon before adding exotic indexes.

---

## 2. Recommended indexes

### 2.1 Auth & users

| Index | Definition | Why |
| --- | --- | --- |
| PK / UK | `users_pkey (id)`, `uq_users_email (email)` | Login lookup by email; JWT `sub` by id |
| `idx_users_role_active` | `(role) WHERE deleted_at IS NULL AND is_active = true` | Admin user lists by role |
| `idx_refresh_tokens_user_id` | `(user_id)` | Logout / revoke-all / password change |
| `uidx_refresh_tokens_token_hash` | `UNIQUE (token_hash)` | Refresh validation |
| `idx_refresh_tokens_family` | `(family)` | Family revoke on reuse detection |
| `idx_refresh_tokens_expires` | `(expires_at) WHERE revoked_at IS NULL` | Purge / cleanup job |
| `idx_login_attempts_email_created` | `(email, created_at DESC)` | Lockout window counts |
| `idx_login_attempts_ip_created` | `(ip_address, created_at DESC)` | IP abuse signals |

### 2.2 Classes & membership

| Index | Definition | Why |
| --- | --- | --- |
| `idx_classes_active` | `(is_active) WHERE deleted_at IS NULL` | Admin class list |
| `uidx_classes_code` | `UNIQUE (code) WHERE code IS NOT NULL AND deleted_at IS NULL` | Optional class codes |
| `uidx_class_lecturers_pair` | `UNIQUE (class_id, lecturer_id)` | Integrity + lookup |
| `idx_class_lecturers_lecturer_id` | `(lecturer_id)` | “Classes for this lecturer” |
| `uidx_class_students_pair` | `UNIQUE (class_id, student_id)` | Integrity + enrollment check |
| `idx_class_students_student_id` | `(student_id)` | “Classes for this student” / circular audience |

### 2.3 Question bank

| Index | Definition | Why |
| --- | --- | --- |
| `idx_questions_lecturer_created` | `(lecturer_id, created_at DESC) WHERE deleted_at IS NULL` | Default bank listing |
| `idx_questions_lecturer_subject` | `(lecturer_id, subject) WHERE deleted_at IS NULL` | Filter by subject |
| `idx_questions_lecturer_topic` | `(lecturer_id, topic) WHERE deleted_at IS NULL` | Filter by topic |
| `idx_questions_lecturer_difficulty` | `(lecturer_id, difficulty) WHERE deleted_at IS NULL` | Filter by difficulty |
| `idx_questions_lecturer_type` | `(lecturer_id, type) WHERE deleted_at IS NULL` | Filter by type |
| `idx_questions_title_trgm` | GIN `(title gin_trgm_ops)` *optional* | Keyword search (`pg_trgm`) |
| `idx_question_options_question_id` | `(question_id)` | Load options with question |
| `uidx_tags_lecturer_name` | `UNIQUE (lecturer_id, name) WHERE deleted_at IS NULL` | Tag uniqueness |
| `idx_tags_lecturer_id` | `(lecturer_id) WHERE deleted_at IS NULL` | Tag picker |
| `uidx_question_tags_pair` | `UNIQUE (question_id, tag_id)` | Integrity |
| `idx_question_tags_tag_id` | `(tag_id)` | “Questions with this tag” |

**Search pattern:** Prefer filter indexes + `ILIKE`/`trgm` on title for lecturer-scoped search. Full-text (`tsvector`) can be added later as `search_vector` generated column if volume grows.

### 2.4 Assignments & submissions

| Index | Definition | Why |
| --- | --- | --- |
| `idx_assignments_class_start` | `(class_id, start_at DESC) WHERE deleted_at IS NULL` | Class assignment list |
| `idx_assignments_lecturer_created` | `(lecturer_id, created_at DESC) WHERE deleted_at IS NULL` | Lecturer dashboard |
| `idx_assignments_window` | `(start_at, end_at) WHERE deleted_at IS NULL` | “Active now” windows |
| `uidx_assignment_questions_pair` | `UNIQUE (assignment_id, question_id)` | Integrity |
| `idx_assignment_questions_assignment_sort` | `(assignment_id, sort_order)` | Ordered paper load |
| `idx_assignment_questions_question_id` | `(question_id)` | “Used in which assignments” |
| `uidx_submissions_assignment_student` | `UNIQUE (assignment_id, student_id)` | One attempt; start idempotency |
| `idx_submissions_student_started` | `(student_id, started_at DESC)` | Student history / analytics |
| `idx_submissions_assignment_status` | `(assignment_id, status)` | Lecturer completion stats |
| `idx_submissions_autosubmit` | `(ends_at) WHERE status = 'IN_PROGRESS'` | **Cron auto-submit** critical path |
| `idx_submissions_assignment_end` | `(assignment_id) INCLUDE (status, score)` *optional* | Analytics rollups |
| `uidx_submission_answers_pair` | `UNIQUE (submission_id, assignment_question_id)` | Autosave upsert key |
| `idx_submission_answers_aq_id` | `(assignment_question_id)` | FK / integrity scans |

### 2.5 Circulars & polls

| Index | Definition | Why |
| --- | --- | --- |
| `idx_circulars_publish` | `(publish_at DESC) WHERE deleted_at IS NULL AND is_published = true` | Feed listing |
| `idx_circulars_author` | `(created_by_id, created_at DESC) WHERE deleted_at IS NULL` | Author management |
| `idx_circulars_scheduled` | `(publish_at) WHERE is_published = false AND deleted_at IS NULL` | Cron publish-scheduled |
| `idx_circular_audiences_circular` | `(circular_id)` | Load targets |
| `idx_circular_audiences_target` | `(target_type, target_id)` | “Circulars for class/user” reverse lookup |
| `idx_polls_active` | `(publish_at, expire_at) WHERE deleted_at IS NULL` | Active poll queries |
| `idx_polls_scheduled` | `(publish_at) WHERE is_published = false AND deleted_at IS NULL` | Cron |
| `idx_polls_author` | `(created_by_id, created_at DESC) WHERE deleted_at IS NULL` | Management |
| `idx_poll_options_poll_sort` | `(poll_id, sort_order)` | Options load |
| `idx_poll_audiences_poll` | `(poll_id)` | |
| `idx_poll_audiences_target` | `(target_type, target_id)` | Audience reverse lookup |
| `uidx_poll_votes_poll_user` | `UNIQUE (poll_id, user_id)` | One vote + conflict on double-submit |
| `idx_poll_votes_option_id` | `(option_id)` | Results aggregation by option |
| `idx_poll_votes_poll_id` | `(poll_id)` | Results / counts |

### 2.6 Phase 2 AI

| Index | Definition | Why |
| --- | --- | --- |
| `uidx_ai_evaluations_answer` | `UNIQUE (submission_answer_id)` | One evaluation per answer |
| `idx_ai_evaluations_status` | `(status, created_at) WHERE status = 'PENDING'` | Worker / cron drain |

---

## 3. Query patterns → index map

| Use case | Typical predicate | Primary index |
| --- | --- | --- |
| Login | `email = ?` | `uq_users_email` |
| Refresh | `token_hash = ?` | `uidx_refresh_tokens_token_hash` |
| Lecturer question bank | `lecturer_id = ? AND deleted_at IS NULL ORDER BY created_at` | `idx_questions_lecturer_created` |
| Filter by tag | join `question_tags` on `tag_id` | `idx_question_tags_tag_id` |
| Student open assignments | enrollments → `assignments.class_id` + time window | `idx_class_students_student_id` + `idx_assignments_class_start` |
| Start attempt | insert submission unique | `uidx_submissions_assignment_student` |
| Autosave | upsert by submission + AQ | `uidx_submission_answers_pair` |
| Cron auto-submit | `status = IN_PROGRESS AND ends_at <= now()` | `idx_submissions_autosubmit` |
| Circular feed | published + audience match | `idx_circulars_publish` + `idx_circular_audiences_target` |
| Poll vote | unique insert | `uidx_poll_votes_poll_user` |
| Lecturer assignment analytics | `assignment_id` group by status/score | `idx_submissions_assignment_status` |
| Student analytics | `student_id` history | `idx_submissions_student_started` |

---

## 4. Performance considerations

### 4.1 Query optimization

- Always scope lecturer queries with `lecturer_id` (or class membership) first — prevents sequential scans across the institution.
- Prefer `SELECT` of needed columns; avoid loading `password_hash`, `raw_response`, or large `JSONB` unless required.
- For assignment taking: load `assignment_questions` + question stems/options in **one** query with `include` / joins; cache paper definition in memory for the attempt duration on the client.
- Grade MCQs in the service from option correctness; write denormalized `submissions.score` once to keep analytics cheap.
- Use `JSONB` containment only if needed; for v1 prefer application-parsed `answer` after fetch by PK.

### 4.2 Pagination

| Surface | Strategy |
| --- | --- |
| Question bank, circulars, polls, admin users | **Keyset**: `(created_at, id) < (?, ?)` + `LIMIT` |
| Small admin pages | Offset acceptable (`skip`/`take`) under ~1k rows |
| Analytics rankings | Sort by `score DESC, submitted_at ASC` with keyset on `(score, submitted_at, id)` |

Return `nextCursor` in API `meta`. Avoid large `OFFSET` on hot student paths.

### 4.3 Soft deletes

- Default Prisma / repository helpers: `deleted_at: null`.
- Partial indexes above assume this filter — keep it consistent or indexes won’t be used.
- Unique names (`tags`, `classes`) use **partial unique indexes** so soft-deleted names can be reused.

### 4.4 Audit fields

- `created_at` / `updated_at` maintained by Prisma (`@default(now())`, `@updatedAt`).
- `created_by` / `updated_by` set in services from JWT `sub`.
- Optional later: append-only `audit_logs` for security-sensitive actions (password reset, role change) — do not overload domain tables.

### 4.5 Autosave write path

- Upsert `submission_answers` on unique pair; update only `answer` + `updated_at` while `IN_PROGRESS`.
- Rate-limit in API (architecture: ~60/min/user); DB index uniqueness handles races.
- Do not recompute `submissions.score` on every autosave — only on submit / grade.

### 4.6 Cron jobs

| Job | Query shape | Index |
| --- | --- | --- |
| Auto-submit | `IN_PROGRESS` and `ends_at <= now()` (also global `assignment.end_at`) | `idx_submissions_autosubmit`; join assignment for `end_at` |
| Publish scheduled | `is_published = false AND publish_at <= now()` | `idx_circulars_scheduled`, `idx_polls_scheduled` |

Keep batches small (`LIMIT 100`) and idempotent (status transitions with `WHERE status = 'IN_PROGRESS'`).

### 4.7 Data partitioning (future)

| Table | When to partition | Key |
| --- | --- | --- |
| `login_attempts` | High volume / retention | `RANGE (created_at)` |
| `refresh_tokens` | Large revoked history | `RANGE (created_at)` or purge instead |
| `submission_answers` | Multi-campus millions of rows | Consider by `created_at` or tenant later |
| Core academic tables | Usually **not** needed for single-institution v1 | — |

Prefer **TTL purge jobs** over partitioning until metrics justify complexity on Neon.

### 4.8 Connection & serverless scale

- Runtime: Neon **pooled** URL (`DATABASE_URL`) + Prisma Neon adapter.
- Migrations: `DIRECT_URL`.
- Avoid long transactions in HTTP handlers; autosave = single upsert.
- Analytics: for heavy admin reports, consider read replica / materialized views later — not required for MVP.

### 4.9 Optional materialized views (later)

```text
mv_assignment_stats (assignment_id, student_count, submitted_count, avg_score, ...)
mv_class_performance (class_id, ...)
```

Refresh via cron after submission waves. Keep base tables normalized; views are read optimizations only.

---

## 5. Prisma / migration notes

```prisma
@@index([lecturerId, createdAt(sort: Desc)], map: "idx_questions_lecturer_created")
@@unique([assignmentId, studentId], map: "uq_submissions_assignment_student")
```

Partial indexes and `gin_trgm` may need raw SQL migrations:

```sql
CREATE INDEX idx_submissions_autosubmit
  ON submissions (ends_at)
  WHERE status = 'IN_PROGRESS';

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_questions_title_trgm
  ON questions USING GIN (title gin_trgm_ops)
  WHERE deleted_at IS NULL;
```

---

## 6. Future scalability checklist

- [ ] Enable `pg_trgm` when keyword search latency rises  
- [ ] Add `search_vector` + GIN for cross-field question search  
- [ ] Materialized views for admin institution overview  
- [ ] Partition or purge `login_attempts` / expired tokens  
- [ ] Read replica for analytics-only endpoints  
- [ ] Tenant `institution_id` leading columns on hot indexes if multi-tenant  

---

## 7. Summary — must-have indexes for launch

1. Unique email / token hash / submission pair / vote pair / autosave pair  
2. FKs: `lecturer_id`, `class_id`, `student_id`, `assignment_id`, `submission_id`  
3. Partial cron index on `submissions(ends_at) WHERE IN_PROGRESS`  
4. Lecturer-scoped question list `(lecturer_id, created_at DESC) WHERE deleted_at IS NULL`  
5. Membership reverse lookups on `class_lecturers(lecturer_id)` and `class_students(student_id)`  
6. Audience reverse lookup `(target_type, target_id)` for circulars and polls  

These cover auth, bank browsing, exam taking, cron reliability, and role-scoped feeds without premature complexity.
