# Voxi

Personal voice assistant for tasks and reminders. Design and roadmap: [plan.md](plan.md).

## Local setup

Needs Node 22+ and a Neon project (create a `dev` branch for local work).

```bash
cp .env.example .env        # fill in Neon URLs and the other keys
npm install                 # also runs prisma generate
npm run db:migrate          # applies prisma/migrations to the Neon branch in DIRECT_URL
npm run dev                 # http://localhost:3000
```

`npm test` creates and deletes throwaway users in whatever database `DATABASE_URL` points at, so point it at the Neon `dev` branch, not production.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm test` | Vitest (repo tests hit the database in `DATABASE_URL`) |
| `npm run eval` | Agent evals: real OpenAI calls with a fixed clock, checks the resulting DB state (~1 min, a few cents) |
| `npm run typecheck` | Generates route types, then `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Create/apply a migration in dev (`prisma migrate dev`) |
| `npm run db:deploy` | Apply migrations in prod (`prisma migrate deploy`) |

## Layout

```
prisma/schema.prisma      data model (users, tasks, reminders, action_log)
src/lib/db.ts             Prisma client; Neon adapter for *.neon.tech, pg adapter otherwise
src/lib/owner.ts          single-owner "auth" until Google sign-in lands
src/lib/tasks/            zod schemas + repository (create/update/delete/complete/find)
src/lib/reminders/        zod schemas + repository (create/list/update/cancel/snooze)
src/app/api/              REST route handlers
src/lib/undo.ts           undo via action_log snapshots
src/lib/agent/            OpenAI agent: tools, instructions, local-time helpers
src/app/api/chat/         streaming chat endpoint (AI SDK)
src/app/assistant.tsx     chat panel
src/app/task-board.tsx    task UI
evals/                    agent evals
```

## API

| Method | Path | Body / query |
|---|---|---|
| GET | `/api/tasks` | `query, status, project, tag, dueBefore, dueAfter, overdue, includeDone, limit` |
| POST | `/api/tasks` | `{ title, notes?, priority?, dueAt?, estimateMin?, project?, tags?, recurrenceRule? }` |
| GET / PATCH / DELETE | `/api/tasks/:id` | PATCH takes any task field plus `status` |
| POST | `/api/tasks/:id/complete` | recurring tasks spawn the next instance |
| GET | `/api/reminders` | `from, to, status, limit` |
| POST | `/api/reminders` | `{ message, fireAt, recurrenceRule?, taskId?, channels? }` |
| PATCH / DELETE | `/api/reminders/:id` | DELETE cancels |
| POST | `/api/reminders/:id/snooze` | `{ minutes }` (default 10) |
| POST | `/api/chat` | AI SDK UI messages; streams the agent reply |

## Deploying (Vercel + Neon)

Set `DATABASE_URL` (Neon pooled URL), `DIRECT_URL` (Neon direct URL), `OWNER_EMAIL` and `OWNER_TIMEZONE` in Vercel, then run `npm run db:deploy` against Neon once.
There is **no auth yet**, so anyone with the URL can use a deployed instance. Keep it local, or behind Vercel Deployment Protection, until Google sign-in is added.
