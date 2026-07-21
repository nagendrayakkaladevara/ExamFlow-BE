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

### `GET /analytics/lecturer/assignments/:assignmentId`

Returns assignment completion metrics and a full class roster with per-student submission status and rankings.

**Auth:** Bearer token, role `LECTURER`

**Authorization:** The lecturer must own the assignment (`assignment.lecturerId` must match the authenticated user). Returns `404` when the assignment does not exist or is not owned by the lecturer.

**Path parameters**

| Name | Type | Description |
| --- | --- | --- |
| `assignmentId` | `uuid` | Assignment identifier |

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
    status: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED";
    score: number | null;
    maxScore: number | null;
    submittedAt: string | null; // ISO 8601
  }>;
}
```

**Ranking rules**

- `rankings` includes every active student enrolled in the assignment's class.
- `rankings.length === enrolled`
- `submitted === count(rankings where status is SUBMITTED or AUTO_SUBMITTED)`
- Submitted students are ranked `1..N` by `score` descending, then `submittedAt` ascending.
- Pending and in-progress students have `rank: null`, `score: null`, and `submittedAt: null`.
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
        "rank": 2,
        "studentId": "bbb-222",
        "firstName": "Rahul",
        "lastName": "Verma",
        "email": "rahul@college.edu",
        "status": "SUBMITTED",
        "score": 15,
        "maxScore": 20,
        "submittedAt": "2026-07-20T10:52:00.000Z"
      },
      {
        "rank": null,
        "studentId": "ccc-333",
        "firstName": "Anita",
        "lastName": "Das",
        "email": "anita@college.edu",
        "status": "IN_PROGRESS",
        "score": null,
        "maxScore": 20,
        "submittedAt": null
      },
      {
        "rank": null,
        "studentId": "ddd-444",
        "firstName": "Vikram",
        "lastName": "Patel",
        "email": "vikram@college.edu",
        "status": "NOT_STARTED",
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
| `403` | `FORBIDDEN` | Authenticated user is not a lecturer |
| `404` | `NOT_FOUND` | Assignment not found or not owned by the lecturer |

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
