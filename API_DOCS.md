# ExamFlow API Documentation

Base URL: `/api/v1`

All successful responses use the envelope:

```json
{
  "success": true,
  "data": { },
  "requestId": "..."
}
```

Authenticated routes require `Authorization: Bearer <access_token>`.

---

## Analytics

Shared business rules:

- **Completed** = submission status `SUBMITTED` or `AUTO_SUBMITTED`
- **Enrolled** = active students (`isActive`, not deleted) in the assignment's class
- **Completion rate** = completed / enrolled (assignment level) or completed / (students × published assignments) (class level)
- **Score percentage** = `(score / maxScore) × 100`
- **Pass threshold** = **50%** (used for `passed` / `failed` counts on class analytics)
- **Active class** = `isActive = true`, not soft-deleted
- Published assignments only (`isPublished = true`) are included in denominators
- All datetimes are UTC ISO 8601

### Authorization matrix

| Endpoint prefix | STUDENT | LECTURER | ADMIN |
| --- | --- | --- | --- |
| `/analytics/student/*` | Own data | — | — |
| `/analytics/lecturer/*` | — | Assigned classes/assignments | All |
| `/analytics/admin/*` | — | — | Yes |

---

### `GET /analytics/student/me`

Returns the authenticated student's performance summary.

**Auth:** `STUDENT`

**Query parameters**

| Name | Type | Description |
| --- | --- | --- |
| `from` | ISO 8601 | Optional start of `submittedAt` range |
| `to` | ISO 8601 | Optional end of `submittedAt` range |

**Response `200`**

```typescript
{
  totalAttempts: number;
  averageScore: number | null; // average percentage across completed attempts
  recent: Array<{
    assignmentId: string;
    title: string;
    score: number | null;
    maxScore: number | null;
    correctCount: number | null;
    incorrectCount: number | null;
    percentage: number | null;
    submittedAt: string | null;
    status: "SUBMITTED" | "AUTO_SUBMITTED";
  }>; // last 10 completed submissions
  trend: Array<{
    submittedAt: string;
    percentage: number;
  }>;
}
```

---

### `GET /analytics/student/me/by-tag`

Performance grouped by question tag for the authenticated student.

**Auth:** `STUDENT`

**Query:** `from`, `to` (optional, filter by `submittedAt`)

**Response `200`**

```typescript
{
  byTag: Array<{
    tagId: string;
    tagName: string;
    attemptCount: number;
    correctCount: number;
    correctRate: number | null;
  }>;
  weakTopics: Array<{ /* same shape */ }>; // tags with correctRate < 0.5
}
```

---

### `GET /analytics/lecturer/summary`

Per-class stats for all classes the lecturer is assigned to, plus institution-style totals (students deduped across classes).

**Auth:** `LECTURER`, `ADMIN`

**Query:** `from`, `to` (optional)

---

### `GET /analytics/lecturer/classes/:classId`

Class-level completion and score summary.

**Auth:** `LECTURER` (assigned to class), `ADMIN`

**Query:** `from`, `to` (optional)

**Response `200`**

```typescript
{
  classId: string;
  studentCount: number;
  assignmentCount: number;
  completedSubmissions: number;
  completionRate: number; // 0–1, 2 decimal places
  passed: number;
  failed: number;
  highestScore: number | null; // percentage
  lowestScore: number | null;
  averageScore: number | null;
}
```

---

### `GET /analytics/lecturer/assignments/:assignmentId`

Returns assignment completion metrics and a full class roster with per-student submission status and rankings.

**Auth:** `LECTURER` (assigned to assignment's class), `ADMIN`

**Path parameters**

| Name | Type | Description |
| --- | --- | --- |
| `assignmentId` | `uuid` | Assignment identifier |

**Query parameters**

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `from` | ISO 8601 | — | Filter completed submissions by `submittedAt` |
| `to` | ISO 8601 | — | Filter completed submissions by `submittedAt` |
| `page` | int | `1` | Page number (requires `limit`) |
| `limit` | int | — | Page size (max 500) |
| `sort` | string | `score` | `score`, `name`, or `submittedAt` |
| `status` | string | `all` | `completed`, `pending`, or `all` |

**Response `200`**

```typescript
{
  assignmentId: string;
  title: string;
  enrolled: number;
  submitted: number;
  completionRate: number; // 0–1, submitted / enrolled
  rankings: Array<{
    rank: number | null;
    studentId: string;
    firstName: string;
    lastName: string;
    email: string;
    status: null | "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED";
    score: number | null;
    maxScore: number | null;
    submittedAt: string | null; // ISO 8601
  }>;
  pagination?: { page: number; limit: number; total: number };
}
```

**Ranking rules**

- `rankings` includes every active student enrolled in the assignment's class (when `status=all` and no pagination).
- `submitted === count(rankings where status is SUBMITTED or AUTO_SUBMITTED)` (before roster filters).
- Submitted students are ranked `1..N` by `score` descending, then `submittedAt` ascending.
- Not-started students have `status: null`; in-progress students have `status: "IN_PROGRESS"`.
- Pending students have `rank: null`, `score: null`, and `submittedAt: null`.
- `maxScore` is the assignment total marks for all rows.

**Example**

```json
{
  "success": true,
  "data": {
    "assignmentId": "5c1d3bab-3359-4dd3-9b71-dfe73aa0a4d5",
    "title": "Midterm Quiz",
    "enrolled": 4,
    "submitted": 2,
    "completionRate": 0.5,
    "rankings": [
      {
        "rank": 1,
        "studentId": "aaa-111",
        "firstName": "Priya",
        "lastName": "Sharma",
        "email": "priya@college.edu",
        "status": "SUBMITTED",
        "score": 18,
        "maxScore": 20,
        "submittedAt": "2026-07-20T10:45:00.000Z"
      },
      {
        "rank": null,
        "studentId": "ddd-444",
        "firstName": "Vikram",
        "lastName": "Patel",
        "email": "vikram@college.edu",
        "status": null,
        "score": null,
        "maxScore": 20,
        "submittedAt": null
      }
    ]
  },
  "requestId": "req_01..."
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| `401` | `UNAUTHORIZED` | Missing or invalid access token |
| `403` | `FORBIDDEN` | Lecturer not assigned to the class |
| `404` | `NOT_FOUND` | Assignment not found |

---

### `GET /analytics/lecturer/assignments/:assignmentId/questions`

Per-question statistics for an assignment.

**Auth:** `LECTURER`, `ADMIN`

**Query:** `from`, `to` (optional)

**Response `200`:** array of question stats including `attemptCount`, `correctCount`, `incorrectCount`, `skippedCount`, `correctRate`, `topWrongAnswers[]` (MCQ), and `tags[]`.

---

### `GET /analytics/lecturer/assignments/:assignmentId/export`

CSV export of assignment results.

**Auth:** `LECTURER`, `ADMIN`

**Query:** `format=csv`, optional `from`, `to`

**Response:** `text/csv` with columns: rank, student name, email, status, score, max score, percentage, submitted at.

---

### `GET /analytics/admin/overview`

Institution-wide dashboard totals.

**Auth:** `ADMIN`

**Response `200`**

```typescript
{
  usersByRole: Record<string, number>;
  activeClasses: number;
  totalAssignments: number;
  completedSubmissions: number;
  averageCompletionRate: number; // 0–1, institution-wide
}
```

---

### `GET /analytics/admin/classes/:classId`

Class summary plus per-assignment completion and average score.

**Auth:** `ADMIN`

---

### `GET /analytics/admin/activity`

Recent platform events (assignment published, user registered, class created, submission completed).

**Auth:** `ADMIN`

**Query:** `limit` (default 20, max 50), `cursor` (pagination)

---

### `GET /analytics/admin/trends`

Time-series analytics.

**Auth:** `ADMIN`

**Query:** `metric` (`completion` | `submissions` | `averageScore`), `interval` (`day` | `week` | `month`), `from`, `to` (required ISO 8601)

---

### `GET /analytics/admin/alerts`

Assignments below a completion threshold.

**Auth:** `ADMIN`

**Query:** `threshold` (default `0.5`)

---

### `GET /analytics/admin/reports/:reportType/export`

Admin CSV reports.

**Auth:** `ADMIN`

**Path:** `reportType` = `overview` | `class-performance` | `assignment-results`

**Query:** `format=csv`, optional `from`, `to`, `classId` (required for `class-performance`)

---

## Classes

Base path: `/classes`

All routes require authentication.

| Method | Path | Description | Auth |
| --- | --- | --- | --- |
| GET | `/assigned` | List assigned classes | Lecturer |
| GET | `/enrolled` | List enrolled classes | Student |
| GET | `/` | List all classes (paginated) | Admin |
| POST | `/` | Create a class | Admin |
| GET | `/:id` | Get class detail | Admin, assigned Lecturer, or enrolled Student |
| PATCH | `/:id` | Update a class | Admin |
| DELETE | `/:id` | Soft-delete a class | Admin |
| GET | `/:id/lecturers` | List assigned lecturers | Admin, assigned Lecturer, or enrolled Student |
| POST | `/:id/lecturers` | Assign a lecturer | Admin |
| GET | `/:id/students` | List enrolled students | Admin, assigned Lecturer, or enrolled Student |
| POST | `/:id/students` | Enroll a student | Admin |

### `GET /classes/:id`

Returns class detail for admins, assigned lecturers, and enrolled students.

**Auth:** Bearer token, role `ADMIN`, `LECTURER`, or `STUDENT`

**Authorization:**

| Role | Access |
| --- | --- |
| `ADMIN` | Any non-deleted class |
| `LECTURER` | Class where the user is assigned via `ClassLecturer` |
| `STUDENT` | Class where the user is enrolled via `ClassStudent` |

**Response `200`**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "CS101 — Intro to Programming",
    "code": "CS101",
    "description": "Optional description",
    "isActive": true,
    "createdAt": "2026-01-15T10:00:00.000Z",
    "updatedAt": "2026-03-01T12:00:00.000Z"
  }
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| `403` | `CLASS_ACCESS_DENIED` | User is not assigned/enrolled in the class |
| `404` | `NOT_FOUND` | Class not found |

### `GET /classes/:id/lecturers`

Returns the lecturer roster for a class.

**Auth:** Bearer token, role `ADMIN`, `LECTURER`, or `STUDENT` with class access (same rules as `GET /classes/:id`)

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "class-lecturer-uuid",
      "userId": "lecturer-uuid",
      "firstName": "Jane",
      "lastName": "Doe",
      "email": "jane@college.edu",
      "isActive": true,
      "assignedAt": "2026-01-20T09:00:00.000Z"
    }
  ]
}
```

- `id` is the `ClassLecturer` row id (not the user id).
- Returns `200` with `data: []` when no lecturers are assigned.

### `GET /classes/:id/students`

Returns the student roster for a class.

**Auth:** Bearer token, role `ADMIN`, `LECTURER`, or `STUDENT` with class access (same rules as `GET /classes/:id`)

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "class-student-uuid",
      "userId": "student-uuid",
      "firstName": "John",
      "lastName": "Smith",
      "email": "john@college.edu",
      "isActive": true,
      "enrolledAt": "2026-01-22T11:00:00.000Z"
    }
  ]
}
```

- `id` is the `ClassStudent` row id (not the user id).
- Returns `200` with `data: []` when no students are enrolled.

### `GET /classes/enrolled`

Returns active, non-deleted classes the authenticated student is enrolled in.

**Auth:** Bearer token, role `STUDENT`

**Response `200`**

Same shape as `GET /classes/assigned` (lecturer):

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "CS101",
      "code": "CS101",
      "description": null,
      "isActive": true,
      "createdAt": "2026-01-15T10:00:00.000Z",
      "updatedAt": "2026-03-01T12:00:00.000Z"
    }
  ]
}
```
