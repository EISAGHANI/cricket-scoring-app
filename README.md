# Cricket Platform

Ball-by-ball cricket scoring, live scores, player careers and league management in one platform.
Offline-first scorer PWA, real-time fan experience, multi-tenant league websites.

> Status: **Phase 0 (foundation) complete.** The current `apps/web` is the earlier local-first
> "Crease" scorer (see `apps/web/README.legacy.md`), kept as the starting point for the new web app.

## Quick start

Requires Node 24 (see `.nvmrc`) and Docker.

```bash
corepack enable pnpm          # one-time
pnpm install
pnpm infra:up                 # Postgres, Redis, S3 (RustFS), Mailpit
cp apps/web/.env.example apps/web/.env.local
pnpm dev                      # http://localhost:3000
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
- [Phase 1 plan](docs/PHASE_1_PLAN.md)
