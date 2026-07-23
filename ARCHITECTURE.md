# Architecture & Folder Structure Design

# Student Assessment & Learning Management Platform

---

## 1. Overview

This document defines the system architecture, technology choices, and folder structure for the platform described in [`prd.md`](./prd.md).

| Layer | Choice |
| --- | --- |
| Frontend | React + TypeScript (Vite) — deploy separately (Vercel / other) |
| Backend | Express + TypeScript on **Vercel Serverless Functions** |
| ORM | Prisma + **Neon serverless driver** (`@prisma/adapter-neon`) |
| Database | [Neon](https://neon.com/) Serverless Postgres |
| Auth | JWT access token (short) + refresh token in **httpOnly secure cookie** |
| Files | **Vercel Blob** (or S3-compatible) — never local disk on Vercel |
| Jobs | **Vercel Cron** for expiry / auto-submit / scheduled publish |

Design goals:

- Production-ready on Vercel (stateless, cold-start aware, timeout-safe)
- Security by default (auth, RBAC, validation, headers, rate limits, secrets)
- Modular domains from the PRD with a clear seam for Phase 2 AI

---

## 2. High-Level Architecture (Vercel)

```text
┌──────────────────────────────────────────────────────────────────┐
│  Browser — React SPA                                             │
│  HTTPS only · credentials: include (cookies) · Bearer access JWT │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  Vercel Edge Network                                             │
│  TLS termination · DDoS protection · CDN                         │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  Vercel Serverless Function  (Node.js runtime)                   │
│  api/index.ts → Express app                                      │
│                                                                  │
│  Security middleware                                             │
│  helmet · cors · rate-limit · hpp · sanitize · request-id        │
│                                                                  │
│  Auth / RBAC / Zod validate                                      │
│       ↓                                                          │
│  Controllers → Services → Prisma (Neon adapter)                  │
└───────────────┬──────────────────────────────┬───────────────────┘
                │                              │
                ▼                              ▼
┌───────────────────────────┐    ┌─────────────────────────────────┐
│  Neon Serverless Postgres │    │  Vercel Blob (images)           │
│  pooled + WebSocket path  │    │  question / circular media      │
└───────────────────────────┘    └─────────────────────────────────┘

Vercel Cron (authenticated) ──► /api/v1/internal/cron/*
  auto-submit expired attempts · activate scheduled circulars/polls
```

### Request flow

1. Client hits `https://<api>.vercel.app/api/v1/...` over TLS.
2. Vercel invokes the serverless function; Express handles the path.
3. Security middleware runs (headers, CORS, rate limit, body limits).
4. Auth middleware verifies access JWT; refresh uses httpOnly cookie route.
5. Zod validates body/query/params; RBAC checks role.
6. Service applies domain rules (class scope, timers, one-vote).
7. Prisma talks to Neon via the serverless adapter (no exhausted connection pools).
8. JSON response with stable envelope; no stack traces in production.

### Why this shape on Vercel

| Constraint | Design response |
| --- | --- |
| Stateless functions | No in-memory sessions; JWT + DB-backed refresh/revoke |
| No persistent filesystem | Uploads → Vercel Blob; never `uploads/` on disk |
| Function timeouts | Keep handlers short; heavy work → Cron / background later |
| Many concurrent instances | Neon serverless + Prisma adapter (not a long-lived TCP pool alone) |
| Cold starts | Thin `app.ts`, singleton Prisma client, avoid huge deps in hot path |
| No traditional `node-cron` process | Vercel Cron hits secured internal routes |

---

## 3. Domain Modules (mapped from PRD)

| Module | PRD section | Primary actors |
| --- | --- | --- |
| Auth & Users | Roles, Profile & Password | Admin, Lecturer, Student |
| Classes | Admin class / user assignment | Admin |
| Question Bank | Feature 1 | Lecturer |
| Assignments | Feature 2 | Lecturer, Student |
| Analytics | Feature 3 | All roles |
| Circulars | Feature 4 | Admin, Lecturer, Student |
| Polls | Feature 6 | Admin, Lecturer, Student |
| Uploads | Images on questions / circulars | Lecturer, Admin |
| Internal / Cron | Auto-submit, scheduled publish | System (Cron secret) |

Each module owns: `routes`, `controller`, `service`, `schema` (Zod), and Prisma access used only from services.

---

## 4. Backend Architecture (Vercel + Express + Prisma + Neon)

### 4.1 Tech stack (production)

| Concern | Package / approach |
| --- | --- |
| HTTP | `express` |
| Serverless entry | `@vercel/node` — export Express app from `api/index.ts` |
| Config | Zod-validated `env.ts` — fail fast if secrets missing |
| DB | `@neondatabase/serverless` + `@prisma/adapter-neon` + Prisma Client |
| Validation | `zod` on every mutating and sensitive read endpoint |
| Auth | `jsonwebtoken` (or `jose`) — RS256 preferred in prod; HS256 acceptable with long random secrets |
| Passwords | `argon2` (preferred) or `bcrypt` with strong cost factor |
| Cookies | `cookie-parser` — refresh token httpOnly, Secure, SameSite |
| Security headers | `helmet` |
| CORS | allowlist only (`CORS_ORIGIN`) |
| Rate limit | `express-rate-limit` (+ Upstash Redis store in production) |
| HTTP param pollution | `hpp` |
| Request logging | `pino` / `pino-http` with redacted auth headers |
| IDs | `cuid2` or UUID from Prisma |
| Uploads | `@vercel/blob` — signed/authenticated upload |
| Cron | `vercel.json` crons + `CRON_SECRET` bearer check |

### 4.2 Layering

```text
api/index.ts  →  app.ts
                    ↓
         security middleware stack
                    ↓
         /api/v1 routers
                    ↓
    authenticate → authorize → validate(Zod)
                    ↓
         controllers → services → prisma
                    ↓
              errorHandler (last)
```

| Layer | Responsibility |
| --- | --- |
| `api/index.ts` | Vercel serverless entry; export Express app |
| `app.ts` | Compose middleware + routers; no `listen()` in production |
| Routes | Verb + path + middleware chain only |
| Controllers | HTTP ↔ DTO; never contain business rules |
| Services | Business rules, transactions, ownership checks |
| Prisma | Persistence only |
| Middleware | Security, auth, RBAC, validation, errors |

Local/dev may still use `src/server.ts` with `app.listen(PORT)` for convenience. Production on Vercel never relies on a long-lived Node server.

### 4.3 Role-based access control

```text
ADMIN     → users, classes, institution analytics, circulars, polls, password reset
LECTURER  → own question bank, assigned classes only, assignments, class analytics, circulars, polls
STUDENT   → enrolled class assignments, results (policy-gated), circulars, polls, own profile
SYSTEM    → cron routes only (CRON_SECRET), not a login role
```

Enforce at **two layers**:

1. Middleware: `requireAuth` + `requireRole(...)`
2. Service: resource ownership / class membership / lecturer ownership of questions

Never trust client-sent `userId` / `role` in the body — always take identity from the verified JWT.

### 4.4 Auth design (production)

```text
Login
  → verify credentials + isActive
  → issue access JWT (short: 10–15m) in JSON body
  → issue refresh token (opaque or JWT) stored hashed in DB
  → set refresh in httpOnly cookie:
       Secure; HttpOnly; SameSite=None|Lax; Path=/api/v1/auth; Max-Age=...

Access API
  → Authorization: Bearer <access>

Refresh
  → POST /auth/refresh (cookie only; CSRF mitigated via SameSite + custom header check)
  → rotate refresh token (invalidate old, issue new)
  → return new access token

Logout
  → revoke refresh token family in DB
  → clear cookie

Password change / admin reset
  → revoke all refresh tokens for that user
```

Additional auth hardening:

- Lockout / backoff after N failed logins (store attempts in DB or Redis)
- Constant-time password compare
- Do not reveal whether email exists on login (`Invalid credentials`)
- Separate `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (or asymmetric keys)
- Embed only `sub`, `role`, `tokenVersion` in access JWT — no PII
- On deactivate user or password reset, bump `tokenVersion` so old access tokens fail

### 4.5 Security architecture (mandatory)

#### Transport & headers

- HTTPS only (Vercel default)
- `helmet` with sensible CSP for API (API-focused; no need for loose script CSP)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` / `frame-ancestors 'none'`
- Disable `X-Powered-By`
- HSTS handled at Vercel edge in production

#### CORS

- Explicit allowlist: production frontend origin(s) only
- `credentials: true` when using cookie refresh
- No `*` with credentials

#### Input / output

- Zod schemas for body, query, params on every route
- Reject unknown keys (`.strict()` where practical)
- Max JSON body size (e.g. `100kb`; larger only on upload routes)
- Upload MIME allowlist (`image/png`, `image/jpeg`, `image/webp`) + size cap
- Strip / escape HTML in text fields if ever rendered as HTML later
- Never return `passwordHash`, refresh tokens, or internal secrets
- Generic 500 messages in production; log full error server-side with `requestId`

#### Abuse protection

| Surface | Limit (starting point) |
| --- | --- |
| Global API | 100 req / 15 min / IP |
| `/auth/login` | 5–10 / 15 min / IP + email |
| `/auth/refresh` | 30 / 15 min / IP |
| Autosave | 60 / min / user |
| Uploads | 20 / hour / user |

Production rate-limit store: **Upstash Redis** (Vercel-friendly). In-memory store is OK for local only (not shared across serverless instances).

#### Authorization & data isolation

- Lecturers: queries always filtered by `lecturerId` / assigned `classId`
- Students: assignments only for enrolled classes; one submission per assignment
- Polls: unique `(pollId, userId)` vote
- IDOR prevention: every `/:id` load checks ownership or membership before mutate
- Soft-delete / `isActive` for users; block login when inactive

#### Secrets & config

- All secrets in Vercel Project Env (Production / Preview / Development)
- Never commit `.env`
- Zod `env.ts` requires strong secrets in `NODE_ENV=production`
- Rotate JWT secrets with dual-key window if needed later
- `CRON_SECRET` required for `/internal/cron/*`
- Separate Neon credentials per environment (prod branch vs preview branch optional)

#### Dependency & supply chain

- Lockfile committed (`package-lock.json` / `pnpm-lock.yaml`)
- `npm audit` in CI
- Pin major versions; avoid unmaintained packages
- Prisma generate in Vercel build (`postinstall` or build script)

#### Logging & privacy

- Structured logs with `requestId`
- Redact `Authorization`, cookies, passwords, tokens
- No logging of full answer keys to public log drains in student traffic if avoidable
- Correlate errors without leaking internals to clients

### 4.6 Neon + Prisma on Vercel (critical)

Serverless + classic long-lived Prisma pools causes **too many connections**. Use Neon’s serverless driver:

```prisma
// prisma/schema.prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"] // as required by your Prisma version
}
```

```ts
// src/lib/prisma.ts — singleton across warm invocations
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

Rules:

- `DATABASE_URL` = Neon **pooled** (serverless) connection
- `DIRECT_URL` = Neon **direct** connection for `prisma migrate`
- Run migrations in CI or a release step — not on every cold start
- Prefer Neon **database branches** for Preview deployments

### 4.7 File uploads (no local disk)

Vercel filesystem is ephemeral and read-only in practice for persistent media.

```text
Client → POST /uploads/sign (auth + role)
      → service checks quota / MIME
      → returns Blob upload URL or server uploads via @vercel/blob
      → persist public/secure URL on Question / Circular
```

- Authenticated uploads only
- Virus scanning optional later; MIME + size checks mandatory
- Prefer private blobs + short-lived signed read URLs for exam assets if leakage matters

### 4.8 Background work (Vercel Cron)

```json
// vercel.json (illustrative)
{
  "version": 2,
  "builds": [{ "src": "api/index.ts", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "/api/index.ts" }],
  "crons": [
    { "path": "/api/v1/internal/cron/auto-submit", "schedule": "*/1 * * * *" },
    { "path": "/api/v1/internal/cron/publish-scheduled", "schedule": "*/5 * * * *" }
  ]
}
```

Cron handlers:

1. Verify `Authorization: Bearer ${CRON_SECRET}` (or Vercel cron header + shared secret).
2. Auto-submit submissions where `now > endsAt` or `now > assignment.endAt`.
3. Mark circulars/polls visible when `publishAt <= now` (or rely on read-time filtering — Cron is usually clearer for “sent” semantics).

Keep each cron run small and idempotent (safe to re-run).

### 4.9 Backend folder structure

```text
backend/
├── api/
│   └── index.ts                 # Vercel serverless entry → export default app
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── app.ts                   # Express app factory
│   ├── server.ts                # local listen() only (dev)
│   ├── config/
│   │   ├── env.ts               # Zod env — production requires strong secrets
│   │   ├── security.ts          # helmet/cors/rate-limit options
│   │   └── constants.ts
│   ├── lib/
│   │   ├── prisma.ts            # Neon adapter singleton
│   │   ├── jwt.ts
│   │   ├── password.ts          # argon2/bcrypt
│   │   ├── cookies.ts
│   │   ├── blob.ts              # Vercel Blob helpers
│   │   └── logger.ts            # pino
│   ├── middleware/
│   │   ├── security.ts          # helmet, hpp, body limits
│   │   ├── cors.ts
│   │   ├── rateLimit.ts
│   │   ├── requestId.ts
│   │   ├── authenticate.ts
│   │   ├── authorize.ts
│   │   ├── requireCronSecret.ts
│   │   ├── validate.ts
│   │   └── errorHandler.ts
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── auth.schema.ts
│   │   ├── users/
│   │   ├── classes/
│   │   ├── questions/
│   │   ├── tags/
│   │   ├── assignments/
│   │   ├── submissions/         # start, autosave, submit, timer rules
│   │   ├── analytics/
│   │   ├── circulars/
│   │   ├── polls/
│   │   ├── uploads/
│   │   └── internal/            # cron-only routes
│   │       ├── cron.routes.ts
│   │       └── cron.service.ts
│   ├── types/
│   │   ├── express.d.ts
│   │   └── api.ts
│   └── utils/
│       ├── ApiError.ts
│       ├── asyncHandler.ts
│       └── dates.ts
├── scripts/
│   └── migrate.ts               # optional CI migrate helper
├── vercel.json
├── .env.example
├── .gitignore                   # .env, node_modules, dist
├── package.json
├── tsconfig.json
└── README.md
```

### 4.10 API surface (`/api/v1`)

```text
Auth
  POST   /auth/login
  POST   /auth/refresh
  POST   /auth/logout
  POST   /auth/change-password
  POST   /auth/reset-password              # Admin

Users (Admin)
  GET|POST           /users
  GET|PATCH|DELETE   /users/:id

Classes
  GET|POST           /classes
  GET|PATCH|DELETE   /classes/:id
  POST               /classes/:id/lecturers
  POST               /classes/:id/students

Questions (Lecturer)
  GET|POST           /questions
  GET|PATCH|DELETE   /questions/:id
  GET                /questions/search

Tags (Lecturer)
  GET|POST           /tags

Assignments
  GET|POST           /assignments
  GET|PATCH|DELETE   /assignments/:id
  POST               /assignments/:id/questions
  POST               /assignments/:id/start
  POST               /assignments/:id/autosave
  POST               /assignments/:id/submit
  GET                /assignments/:id/result

Analytics
  GET /analytics/student/me
  GET /analytics/student/me/by-tag
  GET /analytics/lecturer/summary
  GET /analytics/lecturer/classes/:classId
  GET /analytics/lecturer/assignments/:assignmentId
  GET /analytics/lecturer/assignments/:assignmentId/questions
  GET /analytics/lecturer/assignments/:assignmentId/export
  GET /analytics/admin/overview
  GET /analytics/admin/classes/:classId
  GET /analytics/admin/activity
  GET /analytics/admin/trends
  GET /analytics/admin/alerts
  GET /analytics/admin/reports/:reportType/export

Circulars / Polls
  GET|POST           /circulars | /polls
  GET|PATCH|DELETE   /circulars/:id | /polls/:id
  POST               /polls/:id/vote
  GET                /polls/:id/results

Uploads
  POST   /uploads                                  # auth + MIME checks → Blob

Internal (Cron only)
  POST   /internal/cron/auto-submit
  POST   /internal/cron/publish-scheduled
```

Health (no secrets):

```text
GET /healthz     → { ok: true, requestId }
```

Do not expose Prisma errors or env dumps on any route.

---

## 5. Database Design (Prisma + Neon)

### 5.1 Connection strategy

| Env var | Use |
| --- | --- |
| `DATABASE_URL` | Pooled / serverless URL for runtime (Vercel functions) |
| `DIRECT_URL` | Direct URL for migrations |

Migrations run in CI/CD or manually against Neon — **not** inside the request path.

### 5.2 Core entities

```text
User (role: ADMIN | LECTURER | STUDENT)
  ├── RefreshToken (hashed token, family, revokedAt, expiresAt)
  ├── LoginAttempt (optional lockout support)
  ├── ClassLecturer ── Class ── ClassStudent
  ├── Question ── QuestionTag ── Tag
  ├── Assignment ── AssignmentQuestion ── Question
  │       └── Submission ── SubmissionAnswer
  ├── Circular ── CircularAudience
  └── Poll ── PollOption ── PollVote
```

### 5.3 Key models

| Model | Purpose | Notable fields |
| --- | --- | --- |
| `User` | Accounts | email, passwordHash, role, name, isActive, tokenVersion |
| `RefreshToken` | Session revoke/rotate | userId, tokenHash, family, expiresAt, revokedAt |
| `Class` | Group | name, description, isActive |
| `ClassLecturer` / `ClassStudent` | Enrollment | userId, classId |
| `Tag` | Org | name, lecturerId |
| `Question` | Bank item | type, title, description, options/correctAnswer JSON, marks, difficulty, subject, topic, imageUrl, lecturerId |
| `Assignment` | Assessment | classId, startAt, endAt, durationMinutes, resultPolicy, resultDeclareAt |
| `AssignmentQuestion` | Marks override | assignmentId, questionId, marks, order |
| `Submission` | Attempt | startedAt, endsAt, submittedAt, status, score |
| `SubmissionAnswer` | Autosave | answer JSON, isCorrect, marksAwarded |
| `Circular` / `Poll` | Comms | publishAt, expireAt, audience, createdById |

### 5.4 Assignment timing (service + cron)

1. Cannot start before `startAt`.
2. No submit after `endAt`.
3. Personal deadline = `min(startedAt + duration, endAt)`.
4. Autosave upserts answers.
5. Client timer + **Cron auto-submit** for reliability if the tab closes.
6. Results gated by `resultPolicy` / `resultDeclareAt`.

### 5.5 Phase 2 readiness

- `QuestionType` enum reserved value: `DESCRIPTIVE`
- Future `AiEvaluation` table; scoring behind an interface
- Do not block Vercel request path on long AI calls — use queue/cron later

---

## 6. Frontend Architecture

### 6.1 Approach

- React + TypeScript + Vite
- Role-based route trees
- API client: access token in memory; refresh via cookie (`credentials: 'include'`)
- Autosave hook for assignment answers (debounced + retry)

### 6.2 Frontend folder structure

```text
frontend/
├── public/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles/global.css
│   ├── config/env.ts
│   ├── lib/
│   │   ├── api.ts
│   │   └── auth-storage.ts          # access token in memory only
│   ├── types/models.ts
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   └── useAutoSave.ts
│   ├── context/AuthContext.tsx
│   ├── components/
│   │   ├── layout/
│   │   ├── ui/
│   │   └── shared/                  # ProtectedRoute, RoleGate
│   ├── features/
│   │   ├── auth/
│   │   ├── admin/
│   │   ├── lecturer/
│   │   ├── student/
│   │   └── profile/
│   └── routes/
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

### 6.3 Routes

```text
/login
/admin/*       → users, classes, analytics, circulars, polls
/lecturer/*    → questions, assignments, analytics, circulars, polls, profile
/student/*     → assignments, results, analytics, circulars, polls, profile
```

Security note: never store refresh tokens in `localStorage`. Access token in memory; refresh cookie httpOnly.

---

## 7. Cross-Cutting Concerns

### 7.1 API response envelope

```ts
// success
{ "success": true, "data": {}, "meta"?: {}, "requestId": "..." }

// error
{ "success": false, "error": { "code": "ASSIGNMENT_NOT_ACTIVE", "message": "..." }, "requestId": "..." }
```

### 7.2 Environment variables

```env
# Runtime
NODE_ENV=production
DATABASE_URL=                 # Neon pooled (serverless)
DIRECT_URL=                   # Neon direct (migrate only)

# Auth
JWT_ACCESS_SECRET=            # long random (≥32 bytes)
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
BCRYPT_COST=12                # or argon2 params
COOKIE_DOMAIN=                # optional
COOKIE_SECURE=true

# HTTP
CORS_ORIGIN=https://your-frontend.vercel.app
BODY_SIZE_LIMIT=100kb

# Uploads
BLOB_READ_WRITE_TOKEN=        # Vercel Blob

# Jobs
CRON_SECRET=

# Rate limit (production)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Observability (optional)
LOG_LEVEL=info
```

### 7.3 Vercel project settings

| Setting | Value |
| --- | --- |
| Root directory | `backend` |
| Build command | `prisma generate && tsc` (or project script) |
| Install command | `npm ci` |
| Node version | 20.x LTS |
| Env | Production / Preview separated |
| Cron | Enabled on Pro if 1-minute schedules needed |

### 7.4 CI/CD checklist

1. `npm ci`
2. Lint + typecheck
3. Unit/integration tests
4. `prisma migrate deploy` against Neon (prod/staging)
5. Deploy to Vercel
6. Smoke `/healthz` + login

---

## 8. Monorepo Root Layout

```text
pranu mini project/
├── prd.md
├── ARCHITECTURE.md
├── frontend/                 # React SPA
├── backend/                  # Express API → Vercel serverless
└── README.md
```

Deploy backend and frontend as **two Vercel projects** (recommended) so API env secrets stay isolated from the SPA build.

---

## 9. Implementation Phases

| Phase | Scope |
| --- | --- |
| **0 – Foundation** | Vercel entry, security middleware, env validation, Prisma+Neon adapter, auth+refresh cookies, seed Admin |
| **1 – Core academic** | Users, classes, question bank, tags, Blob uploads |
| **2 – Assessments** | Assignments, start/timer, autosave, submit, Cron auto-submit, results |
| **3 – Comms** | Circulars, polls |
| **4 – Analytics** | Role dashboards |
| **5 – Hardening** | Upstash rate limits, audit logging, CI migrate, preview Neon branches |
| **Phase 2** | AI descriptive evaluation (async, not on request hot path) |

---

## 10. Principles

1. **Serverless-first** — no local disk, no in-process cron, no sticky sessions.
2. **Neon adapter required** on Vercel — avoid connection storms.
3. **Defense in depth** — headers, CORS allowlist, rate limits, Zod, RBAC, service-level ownership.
4. **Least privilege tokens** — short access JWT; rotatable, revocable refresh.
5. **Fail closed** — missing secrets, inactive users, wrong role → deny.
6. **Module boundaries** — `modules/*` own their routes and rules.
7. **AI stays off the hot path** — Phase 2 uses async/cron/queue patterns.

---

## 11. Next steps

1. Scaffold `backend` for Vercel (`api/index.ts` + Express `app.ts`).
2. Wire Prisma + Neon serverless adapter and env validation.
3. Implement security middleware + auth (cookie refresh + RBAC).
4. Add `vercel.json` + Cron secret routes.
5. Scaffold frontend against the secured API contract.
