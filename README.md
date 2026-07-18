# Backend API

Express + TypeScript API for the Student Assessment & Learning Management Platform. Designed for **Vercel Serverless Functions** with a local `listen()` entry for development.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design.

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

Health check: [http://localhost:3000/healthz](http://localhost:3000/healthz)

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Local server with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled `dist/server.js` |
| `npm run typecheck` | Typecheck without emit |

## Layout

- `api/index.ts` — Vercel serverless entry
- `src/server.ts` — local `app.listen()`
- `src/app.ts` — Express app composition
- `src/modules/*` — domain routers (stubs; implement in later phases)
- `prisma/` — schema placeholder (models later)

## Current scope

Foundation only: config, logger, security middleware, `/healthz`, empty `/api/v1` mounts, global error + 404 handlers. No auth, DB, or business logic yet.
