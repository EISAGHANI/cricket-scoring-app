# CLAUDE.md

Cricket scoring & league platform (CricClubs + CricHeroes class). The full brief is
`docs/PROJECT_BRIEF.md`. Read it before starting a phase.

**Current phase:** 1 complete (scoring engine, `packages/scoring-engine`). Next: Phase 2 (auth,
users, teams, players). Plan each phase and get owner approval before writing its feature code.

## Working rules (from the brief, condensed)

- Plan before coding each phase; build in phases; each phase ends tested, documented, committed.
- Check current package versions before installing (`npm view <pkg> version`); don't trust memory.
- Ask the owner before changing the stack, adding a paid service, or making an irreversible
  data-model decision. Record decisions in `docs/DECISIONS.md`.
- Conventional commits, one logical change each. Never commit secrets.
- `apps/web` is Next.js 16.4: **read `apps/web/node_modules/next/dist/docs/` before using
  any Next.js API** (see `apps/web/AGENTS.md`).

## Architecture (summary; details in `docs/ARCHITECTURE.md`)

- Event-sourced scoring: `ball_events` (append-only) is the source of truth. The pure
  `@cricket/scoring-engine` reduces events to `MatchState`; the same engine runs on the client
  (offline, instant) and the server (authoritative). Undo/corrections are events.
- `apps/web` Next.js (RSC, Server Actions) · `apps/realtime` Socket.IO + Redis ·
  `apps/worker` BullMQ projections/notifications · Postgres · Redis · S3.
- Packages: `scoring-engine` (zero runtime deps), `schemas` (Zod), `db` (Drizzle, pending ADR),
  `ui`, `config`.

## Commands

| Command                                                                         | What                                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `corepack enable pnpm`                                                          | One-time: put pnpm 12 on PATH (needed by turbo)                    |
| `pnpm install`                                                                  | Install all workspaces                                             |
| `pnpm infra:up` / `infra:down` / `infra:reset`                                  | Docker Compose: Postgres, Redis, RustFS (S3), Mailpit              |
| `pnpm dev`                                                                      | All apps in dev mode (web :3000, realtime :4001, worker :4002)     |
| `pnpm check`                                                                    | lint + typecheck + test + format check (what CI runs, minus build) |
| `pnpm build`                                                                    | Production builds                                                  |
| `pnpm --filter @cricket/scoring-engine test:coverage`                           | Engine tests with 100% coverage gate                               |
| `PROPERTY_RUNS=1000 pnpm --filter @cricket/scoring-engine test`                 | Deeper property sweep (default 150; CI uses 1000)                  |
| `pnpm --filter @cricket/scoring-engine replay <log.json> [--json] [--at <seq>]` | Scorecard from an event log                                        |
| `pnpm --filter @cricket/scoring-engine replay <file.json> --cricsheet`          | Scorecard from Cricsheet data                                      |
| `pnpm --filter @cricket/scoring-engine bench`                                   | Replay timings over the golden matches                             |
| `pnpm format`                                                                   | Prettier write                                                     |

Local URLs: Mailpit UI http://localhost:8025 · RustFS console http://localhost:9001 ·
Postgres `postgres://cricket:cricket@localhost:5432/cricket` (test DB: `cricket_test`).

## Conventions

- TypeScript `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` in packages
  (base: `packages/config/tsconfig/base.json`). `any` needs an inline eslint-disable with a reason.
- Tabs, width 100 (Prettier). JSON/MD/YAML use 2 spaces.
- Workspace packages export TS source (`"exports": { ".": "./src/index.ts" }`); there's no build step.
- Env: each app has `.env.example` and a Zod-validated `env.ts` that fails fast. Never read
  `process.env` elsewhere.
- In `apps/web`: routes in `app/` stay thin → `features/<area>/` (UI + `actions.ts` +
  `service.ts`) → `@cricket/db` repositories. Permission checks (`can()`) live in services.
- Engine tests cite rule IDs from `docs/CRICKET_RULES.md` in their names (`"R-EXT-02: …"`);
  `test/rules-coverage.test.ts` fails if a spec rule is uncited or a test cites an unknown one.
  Changing engine behaviour means changing the spec in the same commit.
- Engine source: no `!` non-null assertions and no coverage-ignore comments. Use `must()` for
  values the engine's invariants guarantee and `violation()` for rule breaches. ESLint bans
  `Date`, `Math.random`, `process` and I/O imports in `src/`.
- Engine tests use the scorebook DSL in `test/dsl.ts`:
  `started().balls("1 4! wd").out("CAUGHT", { fielderIds: ["b2"] }).in("a3")`.
- Exact versions pinned for tooling and core libs; bump deliberately.

## Domain glossary

| Term               | Meaning                                                                              |
| ------------------ | ------------------------------------------------------------------------------------ |
| Legal ball         | Not a wide or no-ball; counts toward the over                                        |
| Extras             | Wides, no-balls, byes, leg byes, penalty runs                                        |
| Free hit           | Delivery after a no-ball; batter can only be out run out / obstructing / hit twice   |
| FoW                | Fall of wicket: score and over at each dismissal                                     |
| NRR                | Net run rate; all-out sides count as having faced their full overs                   |
| DLS                | Rain-rule target revision (our impl is "DLS Standard-style", table supplied as data) |
| Super over         | One-over-per-side tie-breaker                                                        |
| Follow-on          | Multi-day: the side trailing by ≥ margin can be made to bat again immediately        |
| LMS                | Last Man Stands format: the last batter bats alone                                   |
| Set                | The Hundred's 5-ball "over"                                                          |
| Projection         | Read model built from events by the worker; always rebuildable                       |
| Effective log      | The event log after resolving UNDO/CORRECTION (`resolveLog`)                         |
| Provisional result | Result computed from play; final once `MATCH_RESULT` confirms it                     |
| Golden match       | Real match (Cricsheet) replayed and checked against an independent oracle            |

## Gotchas

- **pnpm 12** blocks dependency build scripts unless they're listed under `allowBuilds` in
  `pnpm-workspace.yaml`, and rejects versions younger than its minimum release age. Pin an
  older version instead of adding exclusions.
- **turbo** fails with "Unable to find package manager binary" unless `pnpm` itself is on PATH
  (`corepack enable pnpm`; on Windows without admin:
  `corepack enable pnpm --install-directory "%APPDATA%\npm"`).
- **TypeScript 7** is npm `latest`, but typescript-eslint requires `<6.1`; stay on 5.9 (ADR-0008).
- **ESLint 10** works but `eslint-config-next`'s plugins don't declare support; stay on 9 (ADR-0009).
- **Next 16 route types** (`PageProps`, `LayoutProps`) are generated; `typecheck` runs
  `next typegen` first, so a clean checkout typechecks.
- **MinIO** images are gone from Docker Hub; local S3 is RustFS (ADR-0010).
- `next dev` rewrites `apps/web/AGENTS.md`; commit it as-is rather than editing it.
- Two engines exist until Phase 3: the legacy one in `apps/web/lib/cricket` (used by the
  current UI) and the new `@cricket/scoring-engine`. Don't mix them (ADR-0002).
- **Run Prettier from the repo root.** Inside a package it ignores the root `.prettierignore`
  and reformats the minified Cricsheet fixtures.
- **Vitest 5 changed `bench`** (fixture-based); the engine benchmark is `tools/bench.ts` (tsx).
- Property-test failures print a seed; reproduce with `generateMatch(seed, preset)` from
  `packages/scoring-engine/test/property/generator.ts`.
- The Hundred's no-ball is 2 runs, and the boundary-count tie-breaker counts only fours and
  sixes off the bat. Both were confirmed against real match data.
