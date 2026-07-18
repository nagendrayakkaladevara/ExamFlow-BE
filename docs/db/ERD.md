# Entity Relationship Diagram

Companion docs: [DATABASE_DESIGN.md](./DATABASE_DESIGN.md) · [SCHEMA.md](./SCHEMA.md) · [INDEXING_STRATEGY.md](./INDEXING_STRATEGY.md)

---

## 1. Full ERD (Mermaid)

```mermaid
erDiagram
  users ||--o{ refresh_tokens : "has"
  users ||--o{ class_lecturers : "teaches"
  users ||--o{ class_students : "enrolled"
  users ||--o{ tags : "owns"
  users ||--o{ questions : "authors"
  users ||--o{ assignments : "creates"
  users ||--o{ submissions : "attempts"
  users ||--o{ circulars : "authors"
  users ||--o{ polls : "authors"
  users ||--o{ poll_votes : "votes"

  classes ||--o{ class_lecturers : "has"
  classes ||--o{ class_students : "has"
  classes ||--o{ assignments : "contains"

  tags ||--o{ question_tags : "labels"
  questions ||--o{ question_tags : "tagged"
  questions ||--o{ question_options : "has"
  questions ||--o{ assignment_questions : "imported_as"

  assignments ||--o{ assignment_questions : "includes"
  assignments ||--o{ submissions : "receives"

  submissions ||--o{ submission_answers : "contains"
  assignment_questions ||--o{ submission_answers : "answered_as"

  submission_answers ||--o| ai_evaluations : "evaluated_by"

  circulars ||--o{ circular_audiences : "targets"
  polls ||--o{ poll_options : "has"
  polls ||--o{ poll_audiences : "targets"
  polls ||--o{ poll_votes : "receives"
  poll_options ||--o{ poll_votes : "selected_in"

  users {
    uuid id PK
    citext email UK
    varchar password_hash
    user_role role
    varchar first_name
    varchar last_name
    boolean is_active
    int token_version
    timestamptz deleted_at
  }

  refresh_tokens {
    uuid id PK
    uuid user_id FK
    varchar token_hash UK
    uuid family
    timestamptz expires_at
    timestamptz revoked_at
  }

  login_attempts {
    uuid id PK
    varchar email
    varchar ip_address
    boolean success
    timestamptz created_at
  }

  classes {
    uuid id PK
    varchar name
    varchar code
    boolean is_active
    timestamptz deleted_at
  }

  class_lecturers {
    uuid id PK
    uuid class_id FK
    uuid lecturer_id FK
  }

  class_students {
    uuid id PK
    uuid class_id FK
    uuid student_id FK
  }

  tags {
    uuid id PK
    uuid lecturer_id FK
    varchar name
    timestamptz deleted_at
  }

  questions {
    uuid id PK
    uuid lecturer_id FK
    question_type type
    varchar title
    text description
    decimal default_marks
    difficulty_level difficulty
    text correct_text
    text image_url
    timestamptz deleted_at
  }

  question_options {
    uuid id PK
    uuid question_id FK
    text option_text
    boolean is_correct
    int sort_order
  }

  question_tags {
    uuid id PK
    uuid question_id FK
    uuid tag_id FK
  }

  assignments {
    uuid id PK
    uuid class_id FK
    uuid lecturer_id FK
    varchar title
    timestamptz start_at
    timestamptz end_at
    int duration_minutes
    result_policy result_policy
    timestamptz result_declare_at
    timestamptz deleted_at
  }

  assignment_questions {
    uuid id PK
    uuid assignment_id FK
    uuid question_id FK
    decimal marks
    int sort_order
  }

  submissions {
    uuid id PK
    uuid assignment_id FK
    uuid student_id FK
    submission_status status
    timestamptz started_at
    timestamptz ends_at
    timestamptz submitted_at
    decimal score
  }

  submission_answers {
    uuid id PK
    uuid submission_id FK
    uuid assignment_question_id FK
    jsonb answer
    boolean is_correct
    decimal marks_awarded
  }

  circulars {
    uuid id PK
    uuid created_by_id FK
    varchar title
    text description
    timestamptz publish_at
    boolean is_published
    timestamptz deleted_at
  }

  circular_audiences {
    uuid id PK
    uuid circular_id FK
    audience_target_type target_type
    uuid target_id
  }

  polls {
    uuid id PK
    uuid created_by_id FK
    varchar title
    timestamptz publish_at
    timestamptz expire_at
    poll_result_visibility result_visibility
    timestamptz deleted_at
  }

  poll_options {
    uuid id PK
    uuid poll_id FK
    varchar option_text
    int sort_order
  }

  poll_audiences {
    uuid id PK
    uuid poll_id FK
    audience_target_type target_type
    uuid target_id
  }

  poll_votes {
    uuid id PK
    uuid poll_id FK
    uuid option_id FK
    uuid user_id FK
  }

  ai_evaluations {
    uuid id PK
    uuid submission_answer_id FK
    ai_evaluation_status status
    decimal similarity_percent
    decimal marks_awarded
    text feedback
  }
```

---

## 2. Domain-focused diagrams

### 2.1 Auth & users

```mermaid
erDiagram
  users ||--o{ refresh_tokens : has
  users ||--o{ users : "created_by / updated_by"

  users {
    uuid id PK
    citext email UK
    user_role role
    boolean is_active
    int token_version
  }

  refresh_tokens {
    uuid id PK
    uuid user_id FK
    varchar token_hash UK
    uuid family
    timestamptz revoked_at
  }

  login_attempts {
    uuid id PK
    varchar email
    boolean success
  }
```

### 2.2 Classes & enrollment

```mermaid
erDiagram
  users ||--o{ class_lecturers : lecturer
  users ||--o{ class_students : student
  classes ||--o{ class_lecturers : includes
  classes ||--o{ class_students : includes

  classes {
    uuid id PK
    varchar name
    boolean is_active
  }

  class_lecturers {
    uuid class_id FK
    uuid lecturer_id FK
  }

  class_students {
    uuid class_id FK
    uuid student_id FK
  }
```

### 2.3 Question bank

```mermaid
erDiagram
  users ||--o{ questions : owns
  users ||--o{ tags : owns
  questions ||--o{ question_options : has
  questions ||--o{ question_tags : tagged
  tags ||--o{ question_tags : labels

  questions {
    uuid id PK
    question_type type
    varchar title
    decimal default_marks
  }

  question_options {
    uuid id PK
    boolean is_correct
  }

  tags {
    uuid id PK
    varchar name
  }
```

### 2.4 Assignments & submissions

```mermaid
erDiagram
  classes ||--o{ assignments : hosts
  users ||--o{ assignments : lecturer
  assignments ||--o{ assignment_questions : includes
  questions ||--o{ assignment_questions : source
  assignments ||--o{ submissions : attempts
  users ||--o{ submissions : student
  submissions ||--o{ submission_answers : answers
  assignment_questions ||--o{ submission_answers : item
  submission_answers ||--o| ai_evaluations : phase2

  assignments {
    uuid id PK
    timestamptz start_at
    timestamptz end_at
    int duration_minutes
    result_policy result_policy
  }

  submissions {
    uuid id PK
    submission_status status
    timestamptz ends_at
    decimal score
  }
```

### 2.5 Circulars & polls

```mermaid
erDiagram
  users ||--o{ circulars : authors
  circulars ||--o{ circular_audiences : targets
  users ||--o{ polls : authors
  polls ||--o{ poll_options : has
  polls ||--o{ poll_audiences : targets
  polls ||--o{ poll_votes : receives
  users ||--o{ poll_votes : casts
  poll_options ||--o{ poll_votes : choice

  circulars {
    uuid id PK
    timestamptz publish_at
  }

  polls {
    uuid id PK
    timestamptz publish_at
    timestamptz expire_at
  }

  poll_votes {
    uuid poll_id FK
    uuid user_id FK
  }
```

---

## 3. Relationship matrix

| From | To | Cardinality | Implementing object |
| --- | --- | --- | --- |
| User | RefreshToken | One-to-Many | `refresh_tokens.user_id` |
| User | Class (as lecturer) | Many-to-Many | `class_lecturers` |
| User | Class (as student) | Many-to-Many | `class_students` |
| User (lecturer) | Tag | One-to-Many | `tags.lecturer_id` |
| User (lecturer) | Question | One-to-Many | `questions.lecturer_id` |
| Question | QuestionOption | One-to-Many | `question_options.question_id` |
| Question | Tag | Many-to-Many | `question_tags` |
| Class | Assignment | One-to-Many | `assignments.class_id` |
| User (lecturer) | Assignment | One-to-Many | `assignments.lecturer_id` |
| Assignment | Question | Many-to-Many | `assignment_questions` |
| Assignment | Submission | One-to-Many | `submissions.assignment_id` |
| User (student) | Submission | One-to-Many | `submissions.student_id` |
| Submission | SubmissionAnswer | One-to-Many | `submission_answers.submission_id` |
| AssignmentQuestion | SubmissionAnswer | One-to-Many | `submission_answers.assignment_question_id` |
| SubmissionAnswer | AiEvaluation | One-to-One | `ai_evaluations.submission_answer_id` UNIQUE |
| User | Circular | One-to-Many | `circulars.created_by_id` |
| Circular | CircularAudience | One-to-Many | `circular_audiences.circular_id` |
| User | Poll | One-to-Many | `polls.created_by_id` |
| Poll | PollOption | One-to-Many | `poll_options.poll_id` |
| Poll | PollAudience | One-to-Many | `poll_audiences.poll_id` |
| Poll | PollVote | One-to-Many | `poll_votes.poll_id` |
| User | PollVote | One-to-Many | `poll_votes.user_id` (+ unique with poll) |

---

## 4. Cascading rules

| Action | Policy |
| --- | --- |
| Soft-delete user/class/question/assignment/circular/poll | Set `deleted_at`; hide from default queries; keep FKs |
| Hard-delete user (rare / GDPR) | Cascade tokens & memberships; **block** if submissions/questions exist → soft-delete instead |
| Delete assignment (soft) | Keep submissions for history |
| Remove question from assignment | Delete `assignment_questions` row only if no `submission_answers` reference it; else RESTRICT |
| Delete circular/poll | Soft-delete parent; audiences cascade on hard delete |
| Update primary keys | Never — UUIDs immutable (`ON UPDATE NO ACTION`) |

Detailed per-FK delete actions: [SCHEMA.md § Foreign key cascade summary](./SCHEMA.md#foreign-key-cascade-summary).

---

## 5. Data-flow view (runtime)

```mermaid
flowchart LR
  Admin -->|manages| Users
  Admin -->|creates| Classes
  Admin -->|enrolls| ClassStudents
  Admin -->|assigns| ClassLecturers

  Lecturer -->|builds| Questions
  Questions -->|tagged| Tags
  Lecturer -->|creates| Assignments
  Assignments -->|imports| AssignmentQuestions
  AssignmentQuestions --> Questions

  Student -->|starts| Submissions
  Submissions -->|autosaves| SubmissionAnswers
  Cron -->|auto-submits| Submissions

  AdminLecturer -->|publishes| Circulars
  AdminLecturer -->|publishes| Polls
  Student -->|votes| PollVotes

  Submissions -->|feeds| Analytics
```

---

## 6. Integrity highlights

1. **`uq_submissions_assignment_student`** — one attempt per student per assignment.  
2. **`uq_poll_votes_poll_user`** — one vote per user per poll.  
3. **Audience check constraints** — `target_id` required only for `USER` / `CLASS`.  
4. **Assignment window checks** — `end_at > start_at`; scheduled results require `result_declare_at`.  
5. **Ownership** — lecturer filters on `lecturer_id`; student access via `class_students` ∩ assignment `class_id`.
