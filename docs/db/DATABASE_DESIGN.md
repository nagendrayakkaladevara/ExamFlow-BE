# Database Design Document

# Student Assessment & Learning Management Platform

| | |
| --- | --- |
| **Status** | Production-ready design (source of truth) |
| **Database** | PostgreSQL (Neon Serverless) |
| **ORM** | Prisma + `@prisma/adapter-neon` |
| **Primary keys** | UUID (`gen_random_uuid()` / Prisma `@default(uuid())`) |
| **Normalization** | 3NF (selective denormalization noted where justified) |
| **Related docs** | [SCHEMA.md](./SCHEMA.md) · [ERD.md](./ERD.md) · [INDEXING_STRATEGY.md](./INDEXING_STRATEGY.md) |
| **Sources** | [`prd.md`](../../../prd.md) · [`ARCHITECTURE.md`](../../ARCHITECTURE.md) |

---

## 1. Design Goals

| Goal | How the schema supports it |
| --- | --- |
| Digitize assessments | Question bank → assignments → timed submissions → scored answers |
| Role isolation | `users.role` + membership tables; services always filter by ownership |
| Reusable questions | Questions owned by lecturer; linked via `assignment_questions` |
| Comms & feedback | Circulars and polls with flexible audience targeting |
| Serverless scale | Neon pooled connections; no session state in DB beyond refresh tokens |
| Soft deletes & audit | `deleted_at`, `created_at`, `updated_at`, `created_by`, `updated_by` where appropriate |
| Phase 2 AI | Reserved `DESCRIPTIVE` question type; optional `ai_evaluations` table |

---

## 2. Entity Identification

### 2.1 Core identity & security

| Entity | Purpose |
| --- | --- |
| **User** | Platform account for Admin, Lecturer, or Student. Holds credentials, profile, activation, and JWT `token_version`. |
| **RefreshToken** | Opaque refresh-session store (hashed). Supports rotation, family revoke, and logout. |
| **LoginAttempt** | Tracks failed logins for lockout / backoff (IP + email keyed). |

### 2.2 Academic structure

| Entity | Purpose |
| --- | --- |
| **Class** | Cohort (section/batch) that groups lecturers and students for assignments and announcements. |
| **ClassLecturer** | Many-to-many: which lecturers teach which classes (Admin-assigned). |
| **ClassStudent** | Many-to-many: student enrollment in classes (Admin-assigned). |

### 2.3 Question bank

| Entity | Purpose |
| --- | --- |
| **Tag** | Lecturer-scoped label for organizing/searching questions. |
| **Question** | Reusable bank item (MCQ single/multi, fill-blank; descriptive reserved). |
| **QuestionOption** | Answer choices for MCQ questions; marks which option(s) are correct. |
| **QuestionTag** | Many-to-many link between questions and tags. |

### 2.4 Assignments & attempts

| Entity | Purpose |
| --- | --- |
| **Assignment** | Timed assessment bound to one class, with window, duration, and result policy. |
| **AssignmentQuestion** | Imported questions for an assignment, with order and optional marks override. |
| **Submission** | One student attempt at an assignment (start/timer/submit lifecycle). |
| **SubmissionAnswer** | Per-question response for autosave, grading, and review. |

### 2.5 Communications

| Entity | Purpose |
| --- | --- |
| **Circular** | Announcement with optional cover image and scheduled publish. |
| **CircularAudience** | Targeting rule rows (all lecturers/students, specific users, or classes). |

### 2.6 Polls

| Entity | Purpose |
| --- | --- |
| **Poll** | Feedback survey with publish/expiry and result visibility rules. |
| **PollOption** | Multiple-choice options for a poll. |
| **PollAudience** | Targeting rule rows (same pattern as circulars). |
| **PollVote** | One vote per user per poll (`UNIQUE(poll_id, user_id)`). |

### 2.7 Phase 2 (extensibility)

| Entity | Purpose |
| --- | --- |
| **AiEvaluation** | Stores AI scoring for descriptive answers (similarity, marks, feedback). Created when Phase 2 ships; schema reserved. |

### 2.8 Entities intentionally *not* persisted as tables

| Concern | Approach |
| --- | --- |
| Analytics dashboards | Aggregated via SQL/Prisma queries over submissions & assignments (optional materialized views later). |
| Blob file bytes | Stored in Vercel Blob; only URL/key columns on `questions` / `circulars`. |
| Access JWT | Stateless; not stored. Revocation via `users.token_version`. |

---

## 3. Domain Relationships (summary)

```text
User 1──* RefreshToken
User 1──* LoginAttempt
User *──* Class          (via class_lecturers / class_students)
User(Lecturer) 1──* Question 1──* QuestionOption
Question *──* Tag        (via question_tags; Tag owned by lecturer)
User(Lecturer) 1──* Assignment *──* Question  (via assignment_questions)
Class 1──* Assignment
Assignment 1──* Submission 1──* SubmissionAnswer
User(Student) 1──* Submission
User 1──* Circular / Poll
Circular 1──* CircularAudience
Poll 1──* PollOption | PollAudience | PollVote
SubmissionAnswer 1──0..1 AiEvaluation   (Phase 2)
```

Full cardinalities, cascades, and Mermaid ERD: [ERD.md](./ERD.md)  
Column-level definitions: [SCHEMA.md](./SCHEMA.md)

---

## 4. Normalization Decisions

### 4.1 Kept in 3NF

- User credentials and profile in `users` only.
- Class membership via junction tables (no duplicated class names on users).
- Assignment question list via `assignment_questions` (marks/order override without mutating bank).
- Poll options and votes as separate tables.
- Circular/poll audiences as rows (not CSV of IDs).

### 4.2 Justified denormalization / derived storage

| Field / pattern | Why |
| --- | --- |
| `submissions.score`, `max_score`, `correct_count`, `incorrect_count` | Written once at grade/submit time; avoids expensive recompute on every analytics/history read. Source of truth remains `submission_answers`. Recalculate on regrade. |
| `polls.vote_count` (optional later) | Cache for results UI; can be maintained by trigger/app or omitted and counted live until scale requires it. **v1: omit; count from `poll_votes`.** |
| `questions.image_url` | External Blob reference; not file content. |

### 4.3 Question answers model

MCQ options live in `question_options` (normalized, clear correctness flags).  
Fill-in-the-blank stores expected text on `questions.correct_text` (nullable; used only for `FILL_BLANK`).  
Student responses store structured JSON in `submission_answers.answer` so single/multi/blank/descriptive share one column:

```json
{ "selectedOptionIds": ["uuid", "..."] }
{ "text": "student typed answer" }
```

---

## 5. Soft Deletes & Audit Fields

| Pattern | Tables |
| --- | --- |
| Soft delete (`deleted_at`) | `users`, `classes`, `tags`, `questions`, `assignments`, `circulars`, `polls` |
| Hard delete OK | Junction rows when parent soft-deleted or unlinked; `login_attempts` (TTL purge); expired revoked `refresh_tokens` (purge job) |
| Immutable attempt trail | `submissions`, `submission_answers`, `poll_votes` — prefer status flags over delete |
| Audit stamps | All mutable domain tables: `created_at`, `updated_at` |
| Actor audit | `created_by`, `updated_by` on content tables created by users (`questions`, `assignments`, `circulars`, `polls`, `classes`) |

**Convention:** Queries for “active” rows must include `WHERE deleted_at IS NULL` (and `is_active = true` for users/classes where applicable).

---

## 6. Enums (PostgreSQL / Prisma)

| Enum | Values |
| --- | --- |
| `user_role` | `ADMIN`, `LECTURER`, `STUDENT` |
| `question_type` | `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `FILL_BLANK`, `DESCRIPTIVE` |
| `difficulty_level` | `EASY`, `MEDIUM`, `HARD` |
| `result_policy` | `IMMEDIATE`, `AFTER_COMPLETION`, `SCHEDULED` |
| `submission_status` | `IN_PROGRESS`, `SUBMITTED`, `AUTO_SUBMITTED` |
| `audience_target_type` | `ALL_LECTURERS`, `ALL_STUDENTS`, `USER`, `CLASS` |
| `poll_result_visibility` | `AFTER_VOTE`, `AFTER_EXPIRY` |
| `ai_evaluation_status` | `PENDING`, `COMPLETED`, `FAILED` (Phase 2) |

---

## 7. Critical Business Rules (enforced in DB + service)

| Rule | DB support | Service |
| --- | --- | --- |
| One submission per student per assignment | `UNIQUE(assignment_id, student_id)` | Start creates row; reject duplicates |
| One vote per user per poll | `UNIQUE(poll_id, user_id)` | Vote endpoint |
| Tags unique per lecturer | `UNIQUE(lecturer_id, name)` | Tag create |
| Question owned by lecturer | `questions.lecturer_id` FK | Filter + ownership check |
| Assignment belongs to one class | `assignments.class_id` | Lecturer must be assigned to that class |
| Personal deadline | `submissions.ends_at` | `min(started_at + duration, assignment.end_at)` |
| Refresh token storage | Store **hash only** | Rotate on refresh; revoke family on logout/password change |
| Inactive users | `users.is_active` | Block login; bump `token_version` on deactivate/reset |

---

## 8. Backend Module Mapping

| Table | Module | Entity (Prisma) | Repository layer | Service | Controller / routes |
| --- | --- | --- | --- | --- | --- |
| `users` | `users` + `auth` | `User` | Prisma via services | `users.service`, `auth.service` | `users.*`, `auth.*` |
| `refresh_tokens` | `auth` | `RefreshToken` | Prisma | `auth.service` | `auth.routes` |
| `login_attempts` | `auth` | `LoginAttempt` | Prisma | `auth.service` | login only |
| `classes` | `classes` | `Class` | Prisma | `classes.service` | `classes.routes` |
| `class_lecturers` | `classes` | `ClassLecturer` | Prisma | `classes.service` | assign lecturers |
| `class_students` | `classes` | `ClassStudent` | Prisma | `classes.service` | assign students |
| `tags` | `tags` | `Tag` | Prisma | `tags.service` | `tags.routes` |
| `questions` | `questions` | `Question` | Prisma | `questions.service` | `questions.routes` |
| `question_options` | `questions` | `QuestionOption` | Prisma | `questions.service` | with questions |
| `question_tags` | `questions` / `tags` | `QuestionTag` | Prisma | `questions.service` | with questions |
| `assignments` | `assignments` | `Assignment` | Prisma | `assignments.service` | `assignments.routes` |
| `assignment_questions` | `assignments` | `AssignmentQuestion` | Prisma | `assignments.service` | import questions |
| `submissions` | `submissions` | `Submission` | Prisma | `submissions.service` | start/submit/result |
| `submission_answers` | `submissions` | `SubmissionAnswer` | Prisma | `submissions.service` | autosave/submit |
| `circulars` | `circulars` | `Circular` | Prisma | `circulars.service` | `circulars.routes` |
| `circular_audiences` | `circulars` | `CircularAudience` | Prisma | `circulars.service` | with circulars |
| `polls` | `polls` | `Poll` | Prisma | `polls.service` | `polls.routes` |
| `poll_options` | `polls` | `PollOption` | Prisma | `polls.service` | with polls |
| `poll_audiences` | `polls` | `PollAudience` | Prisma | `polls.service` | with polls |
| `poll_votes` | `polls` | `PollVote` | Prisma | `polls.service` | vote/results |
| `ai_evaluations` | Phase 2 / `submissions` | `AiEvaluation` | Prisma | future AI service | async/cron |
| — | `analytics` | (read models) | Prisma aggregates | `analytics.service` | `analytics.routes` |
| — | `uploads` | (URL columns) | Blob + update Question/Circular | `uploads.service` | `uploads.routes` |
| — | `internal` | submissions/circulars/polls | Prisma | `cron.service` | cron routes |

**Note:** This project uses Prisma Client directly from services (no separate repository classes), matching [`ARCHITECTURE.md`](../../ARCHITECTURE.md). “Repository” above means the persistence boundary, not a mandatory folder.

---

## 9. Naming Conventions

| Object | Convention | Example |
| --- | --- | --- |
| Tables | `snake_case`, plural | `assignment_questions` |
| Columns | `snake_case` | `duration_minutes` |
| Primary key | `id` (UUID) | `id` |
| Foreign key column | `<singular_table>_id` | `class_id`, `lecturer_id` |
| FK constraint | `fk_<table>_<column>` | `fk_questions_lecturer_id` |
| Unique constraint | `uq_<table>_<cols>` | `uq_submissions_assignment_student` |
| Check constraint | `ck_<table>_<rule>` | `ck_assignments_window` |
| Index | `idx_<table>_<cols>` | `idx_questions_lecturer_id` |
| Unique index | `uidx_<table>_<cols>` | `uidx_tags_lecturer_name` |
| Enums | `snake_case` type names | `question_type` |
| Prisma models | `PascalCase` singular | `AssignmentQuestion` |
| Prisma fields | `camelCase` mapped to DB `@map` | `lecturerId` → `lecturer_id` |

---

## 10. Performance & Scalability (summary)

See [INDEXING_STRATEGY.md](./INDEXING_STRATEGY.md) for full index list and rationale.

Highlights:

- **Pagination:** keyset (`(created_at, id)`) preferred for large lists; offset OK for admin small pages.
- **Autosave:** upsert on `submission_answers` by `(submission_id, assignment_question_id)`; high write rate — keep row narrow.
- **Cron:** index submissions by `status` + `ends_at` for auto-submit scans.
- **Audience reads:** resolve circulars/polls by publish window + audience join to user’s classes/role.
- **Partitioning (later):** `login_attempts`, `refresh_tokens` by time; `submission_answers` only if multi-tenant mega-scale.
- **Neon:** pooled `DATABASE_URL` at runtime; `DIRECT_URL` for migrations.

---

## 11. Future Extensibility

| Enhancement | Schema impact |
| --- | --- |
| Descriptive + AI grading | Use `DESCRIPTIVE`; insert `ai_evaluations`; keep scoring interface in service |
| Multi-institution / tenants | Add `institutions` + `institution_id` on `users`/`classes` (nullable until needed) |
| Question sharing across lecturers | Add `question_visibility` or share junction — do not flatten ownership yet |
| Partial credit / negative marking | Add columns on `assignment_questions` without changing answer storage |
| Plagiarism / recommendations | Side tables keyed by `submission_answer_id` / `user_id` |
| Notifications | New `notifications` table; FKs to circular/poll/assignment optional |
| Audit log trail | Append-only `audit_logs` (actor, action, entity, payload JSON) |

Design principle: **add tables/columns; avoid rewriting PKs or collapsing junctions.**

---

## 12. Implementation Checklist

1. Author `prisma/schema.prisma` from [SCHEMA.md](./SCHEMA.md).
2. Create initial migration against Neon (`DIRECT_URL`).
3. Seed Admin user + sample class (dev only).
4. Enforce soft-delete filters in Prisma middleware or shared query helpers.
5. Wire cron queries to indexed `ends_at` / `publish_at` columns.
6. Keep this folder as the contract; update docs when migrations change semantics.

---

## 13. Document Index

| File | Contents |
| --- | --- |
| [DATABASE_DESIGN.md](./DATABASE_DESIGN.md) | This overview: entities, mapping, conventions, extensibility |
| [SCHEMA.md](./SCHEMA.md) | Full table/column/constraint definitions |
| [ERD.md](./ERD.md) | Mermaid ERD + relationship & cascade rules |
| [INDEXING_STRATEGY.md](./INDEXING_STRATEGY.md) | Indexes, query patterns, performance notes |
