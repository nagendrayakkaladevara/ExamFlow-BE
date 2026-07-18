# Database Schema — Detailed Definitions

PostgreSQL (Neon). Primary keys are UUID unless noted.  
Companion docs: [DATABASE_DESIGN.md](./DATABASE_DESIGN.md) · [ERD.md](./ERD.md) · [INDEXING_STRATEGY.md](./INDEXING_STRATEGY.md)

---

## Conventions applied in every table

| Column pattern | Type | Notes |
| --- | --- | --- |
| `id` | `UUID` | PK, default `gen_random_uuid()` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, default `NOW()` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL`, default `NOW()` (app/Prisma `@updatedAt`) |
| `deleted_at` | `TIMESTAMPTZ` | Nullable soft delete where listed |
| `created_by` / `updated_by` | `UUID` | FK → `users.id`, nullable only if system-created |

Timestamps are always stored in UTC (`TIMESTAMPTZ`).

---

## 1. `users`

**Purpose:** Authentication identity and profile for all roles.

| Column | Type | Nullable | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | PK |
| `email` | `CITEXT` or `VARCHAR(255)` | NO | — | `UNIQUE` (case-insensitive preferred via `citext`) |
| `password_hash` | `VARCHAR(255)` | NO | — | Never returned by API |
| `role` | `user_role` | NO | — | `ADMIN` \| `LECTURER` \| `STUDENT` |
| `first_name` | `VARCHAR(100)` | NO | — | |
| `last_name` | `VARCHAR(100)` | NO | — | |
| `is_active` | `BOOLEAN` | NO | `true` | Inactive → login denied |
| `token_version` | `INTEGER` | NO | `0` | Bump on password reset / deactivate |
| `last_login_at` | `TIMESTAMPTZ` | YES | `NULL` | |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `deleted_at` | `TIMESTAMPTZ` | YES | `NULL` | Soft delete |
| `created_by` | `UUID` | YES | `NULL` | FK → `users.id` (`ON DELETE SET NULL`) |
| `updated_by` | `UUID` | YES | `NULL` | FK → `users.id` (`ON DELETE SET NULL`) |

**Checks:** `ck_users_token_version` → `token_version >= 0`

**Notes:** Prefer PostgreSQL `citext` for `email`. If unavailable, store lowercased email in app and enforce `UNIQUE(email)`.

---

## 2. `refresh_tokens`

**Purpose:** Revocable refresh sessions (store hash only).

| Column | Type | Nullable | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | PK |
| `user_id` | `UUID` | NO | — | FK → `users.id` **ON DELETE CASCADE** |
| `token_hash` | `VARCHAR(255)` | NO | — | `UNIQUE` |
| `family` | `UUID` | NO | — | Rotation family id |
| `expires_at` | `TIMESTAMPTZ` | NO | — | |
| `revoked_at` | `TIMESTAMPTZ` | YES | `NULL` | |
| `replaced_by_token_id` | `UUID` | YES | `NULL` | FK → `refresh_tokens.id` **ON DELETE SET NULL** |
| `created_by_ip` | `VARCHAR(45)` | YES | `NULL` | |
| `user_agent` | `VARCHAR(512)` | YES | `NULL` | |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | |

No soft delete — revoke or purge.

---

## 3. `login_attempts`

**Purpose:** Brute-force / lockout support.

| Column | Type | Nullable | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | PK |
| `email` | `VARCHAR(255)` | NO | — | Attempted identifier |
| `ip_address` | `VARCHAR(45)` | YES | `NULL` | |
| `success` | `BOOLEAN` | NO | `false` | |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | |

No FKs required (email may not exist). Purge rows older than retention window (e.g. 30 days).

---

## 4. `classes`

**Purpose:** Academic cohort.

| Column | Type | Nullable | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | PK |
| `name` | `VARCHAR(150)` | NO | — | |
| `code` | `VARCHAR(50)` | YES | `NULL` | Optional short code; `UNIQUE` where not null |
| `description` | `TEXT` | YES | `NULL` | |
| `is_active` | `BOOLEAN` | NO | `true` | |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `deleted_at` | `TIMESTAMPTZ` | YES | `NULL` | Soft delete |
| `created_by` | `UUID` | YES | `NULL` | FK → `users.id` **ON DELETE SET NULL** |
| `updated_by` | `UUID` | YES | `NULL` | FK → `users.id` **ON DELETE SET NULL** |

**Unique:** `uq_classes_name_active` — prefer partial unique on `name` where `deleted_at IS NULL` (PostgreSQL partial unique index).

---

## 5. `class_lecturers`

**Purpose:** Lecturer ↔ class assignment.

| Column | Type | Nullable | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | PK |
| `class_id` | `UUID` | NO | — | FK → `classes.id` **ON DELETE CASCADE** |
| `lecturer_id` | `UUID` | NO | — | FK → `users.id` **ON DELETE CASCADE** |
| `assigned_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `created_by` | `UUID` | YES | `NULL` | FK → `users.id` **ON DELETE SET NULL** |

**Unique:** `uq_class_lecturers_class_lecturer` (`class_id`, `lecturer_id`)

**App check:** `lecturer_id` must reference a user with `role = LECTURER` (enforce in service; optional DB trigger).

---

## 6. `class_students`

**Purpose:** Student enrollment.

| Column | Type | Nullable | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | PK |
| `class_id` | `UUID` | NO | — | FK → `classes.id` **ON DELETE CASCADE** |
| `student_id` | `UUID` | NO | — | FK → `users.id` **ON DELETE CASCADE** |
| `enrolled_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `created_by` | `UUID` | YES | `NULL` | FK → `users.id` **ON DELETE SET NULL** |

**Unique:** `uq_class_students_class_student` (`class_id`, `student_id`)

**App check:** `student_id` must have `role = STUDENT`.

---

## 7. `tags`

**Purpose:** Lecturer-scoped question labels.

| Column | Type | Nullable | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | PK |
| `lecturer_id` | `UUID` | NO | — | FK → `users.id` **ON DELETE CASCADE** |
| `name` | `VARCHAR(100)` | NO | — | |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `deleted_at` | `TIMESTAMPTZ` | YES | `NULL` | Soft delete |
| `created_by` | `UUID` | YES | `NULL` | FK → `users.id` **ON DELETE SET NULL** |
| `updated_by` | `UUID` | YES | `NULL` | FK → `users.id` **ON DELETE SET NULL** |

**Unique:** `uq_tags_lecturer_name` (`lecturer_id`, `name`) where `deleted_at IS NULL` (partial).

---

## 8. `questions`

**Purpose:** Reusable question bank item (per lecturer).

| Column | Type | Nullable | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | PK |
| `lecturer_id` | `UUID` | NO | — | FK → `users.id` **ON DELETE RESTRICT** |
| `type` | `question_type` | NO | — | See enums |
| `title` | `VARCHAR(255)` | NO | — | |
| `description` | `TEXT` | NO | — | Stem / body |
| `explanation` | `TEXT` | YES | `NULL` | Shown after results |
| `default_marks` | `DECIMAL(8,2)` | NO | — | `> 0` |
| `difficulty` | `difficulty_level` | NO | — | `EASY` \| `MEDIUM` \| `HARD` |
| `subject` | `VARCHAR(150)` | YES | `NULL` | |
| `topic` | `VARCHAR(150)` | YES | `NULL` | |
| `correct_text` | `TEXT` | YES | `NULL` | Expected answer for `FILL_BLANK` |
| `image_url` | `TEXT` | YES | `NULL` | Vercel Blob URL |
| `image_blob_key` | `VARCHAR(512)` | YES | `NULL` | For deletion/rotation |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `deleted_at` | `TIMESTAMPTZ` | YES | `NULL` | Soft delete |
| `created_by` | `UUID` | YES | `NULL` | FK → `users.id` **ON DELETE SET NULL** |
| `updated_by` | `UUID` | YES | `NULL` | FK → `users.id` **ON DELETE SET NULL** |

**Checks:**

- `ck_questions_default_marks` → `default_marks > 0`
- `ck_questions_fill_blank_text` →  
  `(type <> 'FILL_BLANK') OR (correct_text IS NOT NULL)`
- `ck_questions_mcq_no_correct_text` →  
  `(type NOT IN ('SINGLE_CHOICE','MULTIPLE_CHOICE')) OR (correct_text IS NULL)`

**Phase 2:** `DESCRIPTIVE` may use `correct_text` as model answer; AI results go to `ai_evaluations`.

---

## 9. `question_options`

**Purpose:** MCQ choices.

| Column | Type | Nullable | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | PK |
| `question_id` | `UUID` | NO | — | FK → `questions.id` **ON DELETE CASCADE** |
| `option_text` | `TEXT` | NO | — | |
| `is_correct` | `BOOLEAN` | NO | `false` | |
| `sort_order` | `INTEGER` | NO | `0` | Display order |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | |

**Checks:** `ck_question_options_sort` → `sort_order >= 0`

**App rules:**

- `SINGLE_CHOICE`: exactly one `is_correct = true`
- `MULTIPLE_CHOICE`: at least one `is_correct = true`
- Not used for `FILL_BLANK` / `DESCRIPTIVE`

---

## 10. `question_tags`

**Purpose:** Question ↔ tag many-to-many.

| Column | Type | Nullable | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | PK |
| `question_id` | `UUID` | NO | — | FK → `questions.id` **ON DELETE CASCADE** |
| `tag_id` | `UUID` | NO | — | FK → `tags.id` **ON DELETE CASCADE** |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | |

**Unique:** `uq_question_tags_question_tag` (`question_id`, `tag_id`)

**App rule:** Tag and question must share the same `lecturer_id`.

---

## 11. `assignments`

**Purpose:** Class-scoped timed assessment.

| Column | Type | Nullable | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | PK |
| `class_id` | `UUID` | NO | — | FK → `classes.id` **ON DELETE RESTRICT** |
| `lecturer_id` | `UUID` | NO | — | FK → `users.id` **ON DELETE RESTRICT** |
| `title` | `VARCHAR(255)` | NO | — | |
| `description` | `TEXT` | YES | `NULL` | |
| `start_at` | `TIMESTAMPTZ` | NO | — | Window open |
| `end_at` | `TIMESTAMPTZ` | NO | — | Global close |
| `duration_minutes` | `INTEGER` | NO | — | Personal timer length |
| `result_policy` | `result_policy` | NO | — | `IMMEDIATE` \| `AFTER_COMPLETION` \| `SCHEDULED` |
| `result_declare_at` | `TIMESTAMPTZ` | YES | `NULL` | Required when `SCHEDULED` |
| `is_published` | `BOOLEAN` | NO | `true` | Draft support |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `deleted_at` | `TIMESTAMPTZ` | YES | `NULL` | Soft delete |
| `created_by` | `UUID` | YES | `NULL` | FK → `users.id` **ON DELETE SET NULL** |
| `updated_by` | `UUID` | YES | `NULL` | FK → `users.id` **ON DELETE SET NULL** |

**Checks:**

- `ck_assignments_window` → `end_at > start_at`
- `ck_assignments_duration` → `duration_minutes > 0`
- `ck_assignments_result_schedule` →  
  `(result_policy <> 'SCHEDULED') OR (result_declare_at IS NOT NULL)`

---

## 12. `assignment_questions`

**Purpose:** Snapshot link of bank questions into an assignment (order + marks override).

| Column | Type | Nullable | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | PK |
| `assignment_id` | `UUID` | NO | — | FK → `assignments.id` **ON DELETE CASCADE** |
| `question_id` | `UUID` | NO | — | FK → `questions.id` **ON DELETE RESTRICT** |
| `marks` | `DECIMAL(8,2)` | NO | — | Override; defaults from question at import |
| `sort_order` | `INTEGER` | NO | `0` | |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | |

**Unique:** `uq_assignment_questions_assignment_question` (`assignment_id`, `question_id`)

**Checks:** `ck_assignment_questions_marks` → `marks > 0`; `ck_assignment_questions_sort` → `sort_order >= 0`

**Note:** Answers reference `assignment_question_id` so marks/order stay stable if the bank question is later edited (content edits still reflect unless you add snapshot columns later).

---

## 13. `submissions`

**Purpose:** One student attempt at an assignment.

| Column | Type | Nullable | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | PK |
| `assignment_id` | `UUID` | NO | — | FK → `assignments.id` **ON DELETE RESTRICT** |
| `student_id` | `UUID` | NO | — | FK → `users.id` **ON DELETE RESTRICT** |
| `status` | `submission_status` | NO | `'IN_PROGRESS'` | |
| `started_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `ends_at` | `TIMESTAMPTZ` | NO | — | Personal deadline |
| `submitted_at` | `TIMESTAMPTZ` | YES | `NULL` | Set on submit/auto-submit |
| `score` | `DECIMAL(10,2)` | YES | `NULL` | Denormalized total |
| `max_score` | `DECIMAL(10,2)` | YES | `NULL` | Sum of assignment question marks |
| `correct_count` | `INTEGER` | YES | `NULL` | |
| `incorrect_count` | `INTEGER` | YES | `NULL` | |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | |

**Unique:** `uq_submissions_assignment_student` (`assignment_id`, `student_id`)

**Checks:**

- `ck_submissions_ends_after_start` → `ends_at >= started_at`
- `ck_submissions_score_nonneg` → `score IS NULL OR score >= 0`
- `ck_submissions_counts` →  
  `(correct_count IS NULL OR correct_count >= 0) AND (incorrect_count IS NULL OR incorrect_count >= 0)`

No `deleted_at` — attempts are retained for academic history.

---

## 14. `submission_answers`

**Purpose:** Autosaved / final answers per assignment question.

| Column | Type | Nullable | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | PK |
| `submission_id` | `UUID` | NO | — | FK → `submissions.id` **ON DELETE CASCADE** |
| `assignment_question_id` | `UUID` | NO | — | FK → `assignment_questions.id` **ON DELETE RESTRICT** |
| `answer` | `JSONB` | YES | `NULL` | Structured response (see below) |
| `is_correct` | `BOOLEAN` | YES | `NULL` | Null until graded |
| `marks_awarded` | `DECIMAL(8,2)` | YES | `NULL` | |
| `graded_at` | `TIMESTAMPTZ` | YES | `NULL` | |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | |

**Unique:** `uq_submission_answers_submission_aq` (`submission_id`, `assignment_question_id`)

**Answer JSON shapes:**

```json
{ "selectedOptionIds": ["uuid"] }
{ "selectedOptionIds": ["uuid1", "uuid2"] }
{ "text": "fill blank or descriptive" }
```

---

## 15. `circulars`

**Purpose:** Announcements from Admin or Lecturer.

| Column | Type | Nullable | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | PK |
| `created_by_id` | `UUID` | NO | — | FK → `users.id` **ON DELETE RESTRICT** (author) |
| `title` | `VARCHAR(255)` | NO | — | |
| `description` | `TEXT` | NO | — | |
| `cover_image_url` | `TEXT` | YES | `NULL` | |
| `cover_image_blob_key` | `VARCHAR(512)` | YES | `NULL` | |
| `publish_at` | `TIMESTAMPTZ` | NO | — | Visibility start |
| `is_published` | `BOOLEAN` | NO | `false` | Cron/service may flip when due |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `deleted_at` | `TIMESTAMPTZ` | YES | `NULL` | Soft delete |
| `updated_by` | `UUID` | YES | `NULL` | FK → `users.id` **ON DELETE SET NULL** |

Author is `created_by_id` (role determines allowed audiences).

---

## 16. `circular_audiences`

**Purpose:** Who can see a circular.

| Column | Type | Nullable | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | PK |
| `circular_id` | `UUID` | NO | — | FK → `circulars.id` **ON DELETE CASCADE** |
| `target_type` | `audience_target_type` | NO | — | |
| `target_id` | `UUID` | YES | `NULL` | User or class id when type is `USER` / `CLASS` |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | |

**Checks:** `ck_circular_audiences_target` →  
`(target_type IN ('ALL_LECTURERS','ALL_STUDENTS') AND target_id IS NULL) OR (target_type IN ('USER','CLASS') AND target_id IS NOT NULL)`

**Unique (optional):** `uq_circular_audiences_row` (`circular_id`, `target_type`, `target_id`) — use coalesced sentinel in unique index if needed for nulls.

**Semantics:**

| `target_type` | Meaning |
| --- | --- |
| `ALL_LECTURERS` | Every active lecturer (Admin only) |
| `ALL_STUDENTS` | Every active student (Admin), or all students in author’s classes (Lecturer — interpret in service) |
| `USER` | Specific user id |
| `CLASS` | All students enrolled in class id |

---

## 17. `polls`

**Purpose:** Feedback collection.

| Column | Type | Nullable | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | PK |
| `created_by_id` | `UUID` | NO | — | FK → `users.id` **ON DELETE RESTRICT** |
| `title` | `VARCHAR(255)` | NO | — | |
| `description` | `TEXT` | YES | `NULL` | |
| `publish_at` | `TIMESTAMPTZ` | NO | — | |
| `expire_at` | `TIMESTAMPTZ` | NO | — | |
| `result_visibility` | `poll_result_visibility` | NO | `'AFTER_VOTE'` | |
| `is_published` | `BOOLEAN` | NO | `false` | |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `deleted_at` | `TIMESTAMPTZ` | YES | `NULL` | Soft delete |
| `updated_by` | `UUID` | YES | `NULL` | FK → `users.id` **ON DELETE SET NULL** |

**Checks:** `ck_polls_window` → `expire_at > publish_at`

---

## 18. `poll_options`

| Column | Type | Nullable | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | PK |
| `poll_id` | `UUID` | NO | — | FK → `polls.id` **ON DELETE CASCADE** |
| `option_text` | `VARCHAR(500)` | NO | — | |
| `sort_order` | `INTEGER` | NO | `0` | |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | |

**Checks:** `ck_poll_options_sort` → `sort_order >= 0`

---

## 19. `poll_audiences`

Same shape as `circular_audiences`, FK → `polls.id` **ON DELETE CASCADE**.

| Column | Type | Nullable | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | PK |
| `poll_id` | `UUID` | NO | — | FK → `polls.id` **ON DELETE CASCADE** |
| `target_type` | `audience_target_type` | NO | — | |
| `target_id` | `UUID` | YES | `NULL` | |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | |

**Check:** `ck_poll_audiences_target` (same as circulars).

---

## 20. `poll_votes`

| Column | Type | Nullable | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | PK |
| `poll_id` | `UUID` | NO | — | FK → `polls.id` **ON DELETE CASCADE** |
| `option_id` | `UUID` | NO | — | FK → `poll_options.id` **ON DELETE RESTRICT** |
| `user_id` | `UUID` | NO | — | FK → `users.id` **ON DELETE CASCADE** |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | |

**Unique:** `uq_poll_votes_poll_user` (`poll_id`, `user_id`) — one vote per user.

**App rule:** `option_id` must belong to `poll_id`.

---

## 21. `ai_evaluations` (Phase 2)

| Column | Type | Nullable | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | PK |
| `submission_answer_id` | `UUID` | NO | — | FK → `submission_answers.id` **ON DELETE CASCADE**, `UNIQUE` |
| `status` | `ai_evaluation_status` | NO | `'PENDING'` | |
| `similarity_percent` | `DECIMAL(5,2)` | YES | `NULL` | 0–100 |
| `marks_awarded` | `DECIMAL(8,2)` | YES | `NULL` | |
| `suggested_corrections` | `TEXT` | YES | `NULL` | |
| `feedback` | `TEXT` | YES | `NULL` | |
| `model_name` | `VARCHAR(100)` | YES | `NULL` | |
| `raw_response` | `JSONB` | YES | `NULL` | Debug / audit |
| `error_message` | `TEXT` | YES | `NULL` | |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | |

**Checks:** `ck_ai_evaluations_similarity` →  
`similarity_percent IS NULL OR (similarity_percent >= 0 AND similarity_percent <= 100)`

Include in Prisma schema as optional model; migrate when Phase 2 starts.

---

## Foreign key cascade summary

| Child | Parent | ON DELETE | Rationale |
| --- | --- | --- | --- |
| `refresh_tokens` | `users` | CASCADE | Sessions die with user |
| `class_lecturers` / `class_students` | `classes` / `users` | CASCADE | Membership cleanup |
| `tags` | `users` (lecturer) | CASCADE | Lecturer-owned labels |
| `question_options` / `question_tags` | `questions` / `tags` | CASCADE | Dependent rows |
| `questions` | `users` | RESTRICT | Preserve bank if user soft-deleted differently — prefer soft-delete user |
| `assignment_questions` | `assignments` | CASCADE | Assignment contents |
| `assignment_questions` | `questions` | RESTRICT | Keep academic integrity |
| `submissions` | `assignments` / `users` | RESTRICT | Retain history |
| `submission_answers` | `submissions` | CASCADE | Answers belong to attempt |
| `submission_answers` | `assignment_questions` | RESTRICT | Stable grading keys |
| `circular_audiences` | `circulars` | CASCADE | |
| `poll_options` / `poll_audiences` / `poll_votes` | `polls` | CASCADE | |
| `poll_votes.option_id` | `poll_options` | RESTRICT | Avoid orphan vote meaning |
| Audit `created_by` / `updated_by` | `users` | SET NULL | Keep rows if admin removed |

**ON UPDATE:** Prefer no PK updates; use `NO ACTION` / omit updates (UUIDs are immutable).

---

## Relationship cardinality reference

| Relationship | Type | Junction / notes |
| --- | --- | --- |
| User → RefreshToken | 1:N | |
| User → LoginAttempt | logical 1:N | by email, not FK |
| User ↔ Class (lecturer) | M:N | `class_lecturers` |
| User ↔ Class (student) | M:N | `class_students` |
| Lecturer → Question | 1:N | |
| Question → QuestionOption | 1:N | |
| Question ↔ Tag | M:N | `question_tags` |
| Class → Assignment | 1:N | |
| Lecturer → Assignment | 1:N | |
| Assignment ↔ Question | M:N | `assignment_questions` |
| Assignment → Submission | 1:N | |
| Student → Submission | 1:N | |
| Submission → SubmissionAnswer | 1:N | |
| SubmissionAnswer → AiEvaluation | 1:0..1 | Phase 2 |
| User → Circular / Poll | 1:N | author |
| Circular → CircularAudience | 1:N | |
| Poll → PollOption | 1:N | |
| Poll → PollAudience | 1:N | |
| Poll → PollVote | 1:N | |
| User → PollVote | 1:N | unique per poll |

---

## Prisma mapping sketch

```prisma
model User {
  id           String    @id @default(uuid()) @db.Uuid
  email        String    @unique @db.Citext
  passwordHash String    @map("password_hash")
  role         UserRole
  // ...
  @@map("users")
}
```

Use `@map` / `@@map` so TypeScript stays camelCase while SQL stays snake_case. Full Prisma file is an implementation artifact derived from this document.
