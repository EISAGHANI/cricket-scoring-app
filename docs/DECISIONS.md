# Architecture Decision Records

Lightweight ADRs. Each entry: context → decision → consequences. Status is one of
**Accepted**, **Proposed** (awaiting owner approval), **Superseded**.

> Items marked **Proposed** need an explicit yes/no from the project owner before the
> phase that depends on them starts (brief §0.7: stack changes, paid services, irreversible
> data-model choices).

| #    | Title                                                    | Status   | Blocks |
| ---- | -------------------------------------------------------- | -------- | ------ |
| 0001 | pnpm workspaces + Turborepo monorepo                     | Accepted | —      |
| 0002 | Keep the existing "Crease" app as the seed of apps/web   | Accepted | —      |
| 0003 | Drizzle ORM over Prisma                                  | Accepted | —      |
| 0004 | Better Auth over Auth.js                                 | Accepted | —      |
| 0005 | Event-sourced scoring: refinements to brief §4           | Accepted | —      |
| 0006 | Engine has zero runtime deps; Zod lives in `schemas`     | Accepted | —      |
| 0007 | Internal packages ship TypeScript source (no build)      | Accepted | —      |
| 0008 | TypeScript 5.9, not 7.x                                  | Accepted | —      |
| 0009 | ESLint 9 (maintenance line), not 10                      | Accepted | —      |
| 0010 | RustFS instead of MinIO for local S3                     | Accepted | —      |
| 0011 | UUIDv7 for all primary keys                              | Accepted | —      |
| 0012 | Golden-test data from Cricsheet                          | Accepted | —      |
| 0013 | DLS-style resource table is external data, not code      | Accepted | —      |
| 0014 | Tenancy model: organisation = tenant; players are global | Accepted | —      |
| 0015 | Images uploaded through the server and re-encoded        | Accepted | —      |
| 0016 | Static CSP without nonces (Cache Components)             | Accepted | —      |

---

## ADR-0001 — pnpm workspaces + Turborepo monorepo

**Status:** Accepted (mandated by brief §2–3)

**Context.** Web app, realtime service, worker and several shared packages must share types
(especially the scoring engine and event schemas) and run one CI pipeline.

**Decision.** pnpm 12 workspaces (`apps/*`, `packages/*`) orchestrated by Turborepo 2. pnpm
is pinned via `packageManager` and provided by Corepack (`corepack enable pnpm`).

**Consequences.**

- pnpm 12 blocks dependency lifecycle scripts by default. Approved builds live under
  `allowBuilds:` in `pnpm-workspace.yaml` (currently only `esbuild`, needed by `tsx`).
- pnpm 12 enforces a minimum release age; brand-new versions are rejected. We pin to a
  slightly older version instead of adding exclusions (e.g. `globals@17.13.0`).
- Turbo needs a `pnpm` binary on `PATH`; `corepack pnpm …` alone is not enough.

## ADR-0002 — Keep the existing "Crease" app as the seed of apps/web

**Status:** Accepted (approved by owner, 2026-11-02)

**Context.** The brief assumes an empty repo. The repo actually contains a working, tested,
local-first Next.js 16.4 scorer ("Crease": teams, match wizard, scoring pad, scorecard,
localStorage persistence, a 500-line event-replay engine with 18 tests). The original
Spring Boot backend is already staged for deletion.

**Decision.** Move the app unchanged into `apps/web` (done in Phase 0; nothing deleted). It
keeps working as-is. Its engine (`apps/web/lib/cricket`) is **not** promoted to
`packages/scoring-engine`; Phase 1 builds the full engine from the spec. The old engine's
tests become regression cases where they agree with the spec. In Phase 3 the UI is rewired
to `@cricket/scoring-engine` + the server, and `lib/cricket` + `lib/store.ts` are deleted.

**Alternatives.** Archive the app and start `apps/web` from scratch: cleaner, but throws away
a reviewed mobile-first UI (keypad, pickers, scorecard) that maps directly onto Phase 3.

**Consequences.** Until Phase 3 there are two engines. `apps/web` must not import the new
engine piecemeal; the switch happens in one phase.

## ADR-0003 — Drizzle ORM over Prisma

**Status:** Accepted (approved by owner, 2026-11-02)

**Context.** Postgres with an append-only event table, JSONB payloads, partial indexes,
`pg_trgm`, transactional "validate → append → snapshot" writes, and projection rebuilds.

**Decision.** Drizzle ORM (0.45.x) + drizzle-kit (0.31.x) with the `postgres` (postgres.js)
driver.

**Why.**

- SQL-first: projections and stats queries are aggregate-heavy and must be `EXPLAIN`-checked;
  Drizzle keeps the SQL visible and typed instead of hiding it.
- Schema is TypeScript, so `jsonb` columns can be typed with the engine's own event types.
- No generated client or query-engine binary: simpler in the worker/realtime containers and
  serverless functions.
- Migrations are plain SQL files that are checked in and reviewable (brief §2).

**Trade-offs.** Prisma has the stronger migration UX and relation API, and Prisma's current
major is a release candidate (8.0.0-rc at time of writing), which is another reason not to
start on it now. Drizzle is pre-1.0; we pin exact versions and upgrade deliberately.

## ADR-0004 — Better Auth over Auth.js

**Status:** Accepted (approved by owner, 2026-11-02)

**Context.** Brief needs email OTP / magic link, Google OAuth, phone OTP with a pluggable SMS
provider, database sessions, and our own RBAC.

**Decision.** Better Auth (1.7.x) with its Drizzle adapter.

**Why.** Auth.js v5 is still published under the `beta` tag (`5.0.0-beta.32`) while `latest`
is v4, which does not target the App Router well. Better Auth is stable, ships email-OTP,
magic-link and phone-number plugins with a bring-your-own SMS sender, stores sessions in our
Postgres, and owns its tables through the same migration flow.

**Trade-offs.** Smaller ecosystem than Auth.js. Authorisation stays entirely ours
(`can(user, action, resource)`), so the auth library is replaceable.

## ADR-0005 — Event-sourced scoring: refinements to brief §4

**Status:** Accepted (approved by owner, 2026-11-02)

1. **Sequence numbers are per match**, not per innings: `(match_id, seq)` is unique and gapless.
   One counter makes gap detection, resync and ordering trivial. `innings_no` is stored
   denormalised for querying.
2. **A wicket on a delivery is part of the `DELIVERY` event** (`payload.dismissal`). A
   standalone `WICKET` event is used only for dismissals with no delivery: timed out, retired
   out, run out of the non-striker before the ball is bowled, obstructing between deliveries.
   One tap equals one atomic event, so undo never splits a ball from its wicket.
3. **`END_OF_OVER` is explicit.** The engine marks an over _due_ after N legal balls and
   requires `END_OF_OVER` before the next over's `BOWLER_CHANGE`. That lets us record umpire
   miscounts faithfully (an over of 5 or 7 balls stands, Law 17.5) via
   `END_OF_OVER { reason: "MISCOUNT" }` or `DELIVERY { overMiscount: true }`. The UI emits
   the normal `END_OF_OVER` automatically, so scorers never tap it.
4. **Undo is a stack of `UNDO` events.** `UNDO { targetId }` must target the latest effective
   event. Redo is `UNDO` of an `UNDO`. Replay first resolves the effective log, then reduces.
   Nothing is deleted.
5. **Corrections** (`CORRECTION { targetId, patch }`) replace fields of a past event; the patch
   schema is per event type. The whole match is re-replayed with the patch. If any later
   event becomes invalid, the correction is rejected with the first failing sequence number.
   Audit = the correction event itself (`created_by`, timestamps, before/after).
6. **Derived results are recorded too.** `TARGET_REVISED` stores the computed target and the
   strategy inputs, and `MATCH_RESULT` stores the result. Replay checks they agree with the
   engine unless flagged `override: true`. A later change to the DLS table or engine
   therefore never silently rewrites a historical result.
7. **Engine version stamp.** Every event row records `engine_version`. Snapshots are tagged
   with it and discarded on a version mismatch (replay from events is always valid).

## ADR-0006 — Engine has zero runtime dependencies; Zod lives in `packages/schemas`

**Status:** Accepted (approved by owner, 2026-11-02)

**Decision.** `@cricket/scoring-engine` has no runtime `dependencies`. It defines event and
state types in plain TypeScript and enforces _rules_ (semantic validity). `@cricket/schemas`
defines the Zod schemas that enforce _shape_ at trust boundaries (server actions, API,
IndexedDB rehydrate). A type-level test asserts `z.infer<EventSchema>` equals the engine's
`MatchEvent` exactly, so the two cannot drift.

**Why.** Keeps the engine trivially portable (browser, service worker, Node, CLI) and its
bundle tiny for the scorer PWA. Zod is still the single source of shape validation, as the
brief requires.

## ADR-0007 — Internal packages ship TypeScript source

**Status:** Accepted

**Decision.** Workspace packages export `./src/index.ts` directly. Next.js 16 (Turbopack)
transpiles workspace packages automatically. Node services run TS via `tsx` in dev; their
production images will bundle with a single build step added in Phase 4.

**Consequences.** No `build` step or `dist/` for libraries, and no stale-build bugs. The engine
CLI (Phase 1) runs through `tsx`.

## ADR-0008 — TypeScript 5.9, not 7.x

**Status:** Accepted

**Context.** TypeScript 7 (native compiler) is `latest` on npm, but `typescript-eslint` 8.x
peers on `typescript >=4.8.4 <6.1.0`, and Next.js's type plugin targets 5.x.

**Decision.** Pin `typescript@5.9.3` everywhere. Revisit when typescript-eslint supports 7.

## ADR-0009 — ESLint 9 (maintenance line), not 10

**Status:** Accepted

**Context.** ESLint 10 is current and v9 is flagged deprecated. It was tried in Phase 0:
lint passed, but `eslint-config-next@16.4.3` bundles `eslint-plugin-react`,
`eslint-plugin-jsx-a11y` and `eslint-plugin-import`, whose peer ranges stop at ESLint 9.

**Decision.** Pin `eslint@9.39.5` / `@eslint/js@9.39.5` repo-wide; revisit when
`eslint-config-next` supports 10.

## ADR-0010 — RustFS instead of MinIO for local S3

**Status:** Accepted (approved by owner, 2026-11-02)

**Context.** The brief names MinIO for local S3. MinIO no longer publishes images to Docker Hub
(`minio/minio` returns "object not found").

**Decision.** Use `rustfs/rustfs:1.0.4` (Apache-2.0, S3-compatible) in
`infra/docker-compose.yml`. App code talks plain S3 through the AWS SDK, so switching (Garage,
SeaweedFS, or MinIO built from source) is a compose-file change only.

**Verified in Phase 2:** bucket creation, bucket policy (public read of `media/*` only,
everything else 403), puts with cache headers, and image uploads end to end (local and CI).

## ADR-0011 — UUIDv7 for all primary keys

**Status:** Accepted (approved by owner, 2026-11-02)

**Decision.** Every table uses a UUIDv7 primary key (Postgres 18 has native `uuidv7()`;
clients generate them for events). Time-ordered keys give index locality on the append-heavy
`ball_events` table, and clients can mint idempotent IDs offline. Public URLs use slugs or
short IDs, never sequential integers.

## ADR-0012 — Golden-test data from Cricsheet

**Status:** Accepted (approved by owner, 2026-11-02)

**Context.** Brief §5 wants 3–5 real, well-known matches encoded as event logs and checked
against the real scorecard.

**Decision.** Use Cricsheet's free ball-by-ball JSON (Open Data Commons Attribution licence; to
be re-verified when downloading). A dev-only converter (`scoring-engine/tools/cricsheet`)
turns a Cricsheet file into our event log; the converted logs and expected scorecards are
committed with attribution. Converter output is reviewed by hand once per match.

**Known gaps in Cricsheet.** It doesn't record shot direction, pitch map or fielding positions,
and its handling of some events (penalty runs, retirements) must be checked match by match.

## ADR-0013 — The DLS-style resource table is external data, not code

**Status:** Accepted (approved by owner, 2026-11-02)

**Decision.** `TargetRevisionStrategy` is an interface. The DLS-style strategy takes a resource
table (`{ oversRemaining, wicketsLost } → % resources`) plus `G50`, loaded from config. The
repo ships only a small synthetic table for tests, clearly labelled as not official. Production
deployments supply a licensed or officially published table; the source is recorded in config.

**Open question for the owner:** which table/source should we use, and do we have the right to
use it? Until then, competitions can use ARR, MPO, or a manual target override.

## ADR-0014 — Tenancy: organisation = tenant; players are global

**Status:** Accepted (approved by owner, 2026-11-02)

**Decision.**

- **Tenant** = `organizations` row (a league, association or club running competitions). It
  owns seasons, tournaments, registrations, news, sponsors, branding, payments and its
  subdomain. Every tenant-owned table has `organization_id NOT NULL`, and the repository layer
  requires it on every query (enforced by tests).
- **Global entities**: `users`, `players`, `teams`, `clubs`, `venues`, `matches`. A player's
  career spans clubs and leagues, so careers must aggregate across tenants (CricHeroes-style).
  A match optionally belongs to a tenant tournament; friendlies have no tenant.
- Tenant admins can only act on global entities through tenant-scoped links (e.g.
  `tournament_teams`).

**Alternative rejected:** fully siloed tenants (CricClubs-style). That's simpler isolation, but
the same physical player would exist once per league, which breaks career stats and profile
claiming.

## ADR-0015 — Images are uploaded through the server and re-encoded

**Status:** Accepted (Phase 2; deviation from the Phase 2 plan's presigned uploads)

**Context.** Avatars and logos are small, and untrusted image files carry risks: decoder bugs,
polyglot files, and metadata such as GPS location in EXIF. Presigned browser uploads would also
need bucket CORS configuration per environment.

**Decision.** Uploads go through a Server Action (body limit 5 MB; files ≤ 4 MB, under Vercel's
4.5 MB request limit). The server authorizes against the owning resource first, then `sharp`
decodes the image (pixel limit 40 MP), auto-rotates it, and stores only re-encoded square WebP
variants (512 and 128 px). Originals are never stored, so metadata is stripped. Objects live under
`media/` with a public-read bucket policy and immutable cache headers.

**Consequences.** Uploads cost server CPU (a few ms per image); large media such as match photos
(Phase 7) will move to presigned uploads processed by the worker. Replaced images are not yet
deleted from storage (cleanup job in Phase 5).

## ADR-0016 — Static Content Security Policy without nonces

**Status:** Accepted (Phase 2, M8)

**Context.** The brief asks for a strict CSP. Nonce-based CSP forces every page to render per
request, and the bundled Next.js 16 guide states it is incompatible with partial prerendering,
which Cache Components relies on for static shells and instant navigation. Hash-based CSP via SRI
is still experimental.

**Decision.** A static CSP set in `next.config.ts` (`lib/security-headers.ts`, unit-tested):
scripts and styles from our origin with inline allowed (Next's streaming payload is inline),
images from our origin and the media host only, `connect-src 'self'`, `object-src 'none'`,
`base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`; `upgrade-insecure-requests` and
HSTS only on HTTPS deployments; plus `nosniff`, a strict referrer policy, a restrictive
permissions policy and no `X-Powered-By`. Auth endpoints reject cross-origin requests and session
cookies are `HttpOnly` + `SameSite=Lax` (both covered by end-to-end tests).

**Consequences.** XSS defence relies on React's escaping and on blocking every other script
source, not on nonces. Revisit when SRI is stable. The streaming overlay route (Phase 7) will need
its own `frame-ancestors` rule for OBS.

## ADR-0017 — Phase 3: online scoring decisions

**Status:** Accepted (approved by owner, 2026-11-03)

**Decisions (PHASE_3_PLAN.md Q1–Q5, defaults approved).**

1. The legacy local scorer (`/local`, `lib/cricket`, `lib/store.ts`) is deleted now that the
   server-backed scorer works. Browser-only matches were not migrated.
2. Wagon-wheel and pitch-map taps are optional per ball (off by default, a per-device toggle) and
   stored in `DELIVERY.payload.detail`.
3. Staff of either side may create a match. The creator always scores and may add scorers
   (people connected to either team), stored as `SCORER` role assignments on the `MATCH` scope.
   Only the creator manages the match.
4. Until Phase 4, the live page polls `GET /api/matches/:id/events?after=<seq>` every 5 seconds
   while the tab is visible.
5. Umpires and the referee are free-text names (`match_officials`); accounts come in Phase 6.

**Also decided while building.**

- The event API is a Route Handler (so the Phase 4 sync queue can reuse it), which means it checks
  `Origin` itself for CSRF protection.
- `MATCH_STARTED` must equal the payload derived from the stored setup, so a scorer can't change
  the teams or rules.
- Events store each player's public-safe name (minors as initials), because the log is permanent
  and public.
- One snapshot row per match; an `UNDO` or `CORRECTION` after it triggers a full replay.

**Consequences.** Two scorers race on `seq` (the loser resyncs) until the Phase 4 scoring lock.

## ADR-0018 — Phase 4: scoring lock, realtime fan-out, offline outbox, PWA

**Status:** Accepted (approved by owner, 2026-11-04, defaults of PHASE_4_PLAN.md)

**Decisions.**

1. **Scoring lock.** One lease row per match, never deleted: release sets `expires_at` to now, so
   `generation` only grows. TTL 60 s, heartbeat every TTL/3. Taking over needs `match.manage`.
   `requireLock` runs inside the event transaction; a stale holder gets 423 `LOCK_REQUIRED` and
   its pad goes read-only, keeping unsent entries.
2. **Realtime without the Redis adapter.** The API publishes to Redis (best effort); every
   `apps/realtime` instance `psubscribe`s `match:*` and emits to its own Socket.IO rooms. Sockets
   are a hint: clients always catch up over HTTP (`?after=<seq>`) and fall back to polling.
3. **Offline outbox.** Scorer entries go into a Dexie (IndexedDB) outbox, apply locally at once
   and flush in batches of up to 100 through `POST /api/matches/:id/events/batch` (stops at the
   first failure), with jittered exponential backoff (1 s to 30 s).
4. **PWA.** Hand-written `public/sw.js` (no new dependency), registered in production only. It
   caches `/_next/static/` and the scorer page of matches already opened, never `/api/`, and is
   cleared on sign-out.

**Consequences.** Offline sync is verified in E2E with `context.setOffline`; the service worker
itself is only exercised in a production build. A 409 still resyncs and drops unsent entries.
