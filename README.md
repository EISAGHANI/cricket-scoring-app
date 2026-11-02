# Cricket Platform

Ball-by-ball cricket scoring, live scores, player careers and league management in one platform.
Offline-first scorer PWA, real-time fan experience, multi-tenant league websites.

> Status: **Phase 2 complete**: scoring engine, passwordless sign-in, permissions, leagues, clubs,
> teams, player profiles, invitations and uploads. The earlier local-first scorer lives at
> `/local` until Phase 3 brings server-backed matches.

## Quick start

Requires Node 24 (see `.nvmrc`) and Docker.

```bash
corepack enable pnpm          # one-time
pnpm install
pnpm infra:up                 # Postgres, Redis, S3 (RustFS), Mailpit
cp apps/web/.env.example apps/web/.env.local     # then set BETTER_AUTH_SECRET
cp packages/db/.env.example packages/db/.env
pnpm --filter @cricket/db db:migrate
pnpm --filter @cricket/web storage:init
pnpm --filter @cricket/web db:seed --reset      # optional demo data
pnpm dev                      # http://localhost:3000 — sign-in codes arrive at http://localhost:8025
```

`pnpm check` runs lint, typecheck, tests and the format check.

## Repository

```
apps/web               Next.js 16 app: public site, dashboards, scorer PWA, admin
apps/realtime          Socket.IO fan-out service (Phase 4)
apps/worker            BullMQ workers: projections, notifications (Phase 5)
packages/scoring-engine  Pure TypeScript cricket engine (Phase 1)
packages/schemas       Shared Zod schemas
packages/db            Schema, migrations, repositories (Phase 2)
packages/authz         Permissions (policy as data) and privacy rules
packages/ui            Shared components
packages/config        tsconfig + ESLint presets
infra/                 docker-compose and Postgres init
docs/                  Brief, architecture, decisions, cricket rules, data model, phase plans
```

## Docs

- [Project brief](docs/PROJECT_BRIEF.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Decisions (ADRs)](docs/DECISIONS.md)
- [Cricket rules spec](docs/CRICKET_RULES.md)
- [Data model draft](docs/DATA_MODEL.md)
- [Phase 1 plan](docs/PHASE_1_PLAN.md) · [Phase 2 plan](docs/PHASE_2_PLAN.md)
