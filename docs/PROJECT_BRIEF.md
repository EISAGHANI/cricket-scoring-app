# Build Prompt: Full-Featured Cricket Scoring & League Platform (Next.js)

> **How to use:** Put this file in an empty repo as `docs/PROJECT_BRIEF.md`, open Claude Code there, switch to plan mode, and say:
> *"Read docs/PROJECT_BRIEF.md fully. Produce the Phase 0 deliverables and a detailed plan for Phase 1. Do not write feature code until I approve the plan."*

---

## 0. Your role and working rules

You are a senior full-stack engineer and architect building a production-grade cricket scoring and league management platform comparable to **CricClubs** (league/club management, websites, rankings) and **CricHeroes** (ball-by-ball scoring, player profiles, insights, streaming). Work like a lead engineer on a real product:

1. **Plan before coding.** For every phase, first write a short plan (files, schema changes, risks), then implement.
2. **Build in phases (Section 9).** Never attempt everything at once. Each phase ends in a working, tested, committed state.
3. **Check current versions.** Before installing anything, check the latest stable versions of Next.js, React, the ORM, auth library, etc. Do not rely on memory for APIs that may have changed; read current docs when unsure.
4. **The scoring engine is the heart of the product.** It must be correct before UI polish. Treat cricket rules as a specification and test them exhaustively.
5. **Keep a `CLAUDE.md`** at the repo root with: architecture summary, commands, conventions, domain glossary, and "gotchas" you discover. Update it at the end of every phase.
6. **Keep `docs/DECISIONS.md`** (lightweight ADRs) for every significant technical choice and its trade-offs.
7. **Ask me** before: changing the stack, adding a paid third-party service, or making an irreversible data-model decision.
8. **Conventional commits**, one logical change per commit. Never commit secrets.

---

## 1. Product vision

A platform where:
- **Scorers** record matches ball-by-ball on a phone at the ground, even with bad or no internet.
- **Fans** follow live scores, commentary, and stats in real time on web/mobile.
- **Players** get a rich career profile with stats, insights, badges, and rankings.
- **Organizers** run leagues and tournaments end to end: registration, fixtures, umpires, grounds, points tables, payments, and a public league website.
- **Streamers** get a live scoreboard overlay for YouTube/Facebook streams (OBS browser source).

Supports every common format: Test/multi-day, ODI, T20, T10, The Hundred style (100 balls, 5- or 10-ball sets), and fully **custom formats** (box cricket, tape-ball, tennis-ball, indoor, last-man-stands, custom balls-per-over, custom players-per-side).

---

## 2. Tech stack (verify latest stable versions before using)

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router)**, React Server Components, Server Actions, TypeScript `strict` | Route handlers for public REST API |
| Monorepo | **Turborepo** + pnpm workspaces | See structure in Section 3 |
| Database | **PostgreSQL** | Use JSONB only where it genuinely helps |
| ORM | **Drizzle ORM** (or Prisma — propose and justify in DECISIONS.md) | Migrations checked in |
| Validation | **Zod** everywhere (forms, actions, API, events) | Shared schemas in a package |
| Auth | **Auth.js** or **Better Auth** (justify) | Email OTP/magic link, Google, phone OTP (pluggable SMS provider) |
| Authorization | Custom RBAC + resource-scoped permissions | See Section 6 |
| Real-time | Dedicated **Socket.IO** (or uWebSockets) service with **Redis adapter**; SSE fallback | Next.js serverless is not a fit for long-lived sockets |
| Cache / queues | **Redis** + **BullMQ** | Stats projections, notifications, media jobs |
| Offline | **PWA** (service worker) + **IndexedDB via Dexie** | Offline scoring with sync queue |
| UI | **Tailwind CSS** + **shadcn/ui** + Radix primitives, **lucide** icons | Mobile-first, dark mode |
| Client state | **TanStack Query** for server state, **Zustand** for scoring UI state | |
| Charts | **Recharts** or **visx** for worm/Manhattan; custom SVG for wagon wheel & pitch map | |
| Search | Postgres full-text (pg_trgm) initially; abstraction allows Meilisearch later | |
| Storage | S3-compatible (Cloudflare R2 / MinIO locally) | Player photos, team logos, media |
| Email | **Resend** + **React Email** templates | |
| Push | Web Push (VAPID) | |
| Payments | **Stripe** (tournament entry fees, subscriptions) | Webhooks, idempotent |
| i18n | **next-intl** | English first; structure for Hindi, Urdu, Pashto, Bengali (RTL support for Urdu/Pashto) |
| Testing | **Vitest**, **fast-check** (property tests), **Playwright** (E2E), Testing Library | |
| Observability | **Sentry**, **OpenTelemetry**, **pino** structured logs | |
| Dev infra | **Docker Compose** (Postgres, Redis, MinIO, Mailpit) | One command local setup |
| CI/CD | GitHub Actions: lint, typecheck, test, build, E2E, migration check | |
| Deploy | Web on Vercel or containerized; realtime + worker as containers (Fly.io/Railway/Render) | Document both |

---

## 3. Repository structure

```
/apps
  /web            Next.js app (public site, dashboards, scorer PWA, admin)
  /realtime       Socket.IO server (subscribes to Redis pub/sub, fans out)
  /worker         BullMQ workers (stats projections, notifications, media, exports)
/packages
  /scoring-engine Pure TypeScript cricket engine. ZERO framework/DB deps. 100% tested.
  /db             Schema, migrations, seed scripts, typed queries
  /schemas        Shared Zod schemas & event types
  /ui             Shared components (scorecard, wagon wheel, worm chart, etc.)
  /config         eslint, tsconfig, tailwind presets
/docs             PROJECT_BRIEF.md, ARCHITECTURE.md, DECISIONS.md, CRICKET_RULES.md
/infra            docker-compose, Dockerfiles, deployment configs
```

---

## 4. Core architecture: event-sourced scoring

This is the most important design decision. Implement it exactly this way unless you propose something better in DECISIONS.md and I approve.

### 4.1 Ball events are the source of truth
- Every delivery and every match occurrence is an **immutable, append-only event** (`ball_events` table) with: `id` (client-generated UUIDv7 for idempotency), `match_id`, `innings_no`, `sequence_no`, `type`, `payload` (Zod-validated), `created_by`, `device_id`, `client_timestamp`, `server_timestamp`, `version`.
- Event types include: `MATCH_STARTED`, `TOSS`, `INNINGS_STARTED`, `DELIVERY`, `WICKET` (or wicket inside delivery), `BATTER_IN`, `BOWLER_CHANGE`, `END_OF_OVER`, `PENALTY_RUNS`, `RETIREMENT`, `SUBSTITUTION` (incl. concussion/impact player), `DECLARATION`, `FOLLOW_ON`, `INTERRUPTION`, `TARGET_REVISED`, `INNINGS_ENDED`, `SUPER_OVER_STARTED`, `MATCH_RESULT`, `UNDO`, `CORRECTION`.

### 4.2 Pure reducer
- `packages/scoring-engine` exposes `applyEvent(state, event) => state` and `replay(events) => MatchState`. Pure, deterministic, no I/O.
- The **same engine runs on the client** (offline, instant UI) and **on the server** (authoritative validation).
- `MatchState` contains: score, wickets, overs/balls (legal ball counting), striker/non-striker, current bowler, partnerships, fall of wickets, bowler spells, extras breakdown, free-hit state, powerplay state, required run rate, target, projected score, result.

### 4.3 Undo and corrections
- **Undo** = append an `UNDO` event referencing the last event; replay excludes undone events. Never delete rows.
- **Corrections** after the fact (e.g., wrong fielder on a catch) = `CORRECTION` event, with audit trail of who changed what.

### 4.4 Snapshots and projections
- Store periodic `match_state_snapshots` (e.g., end of each over) to make replay fast.
- **Projections** (read models) built by the worker from events: `batting_innings`, `bowling_innings`, `fielding_records`, `partnerships`, `career_stats`, `season_stats`, `team_stats`, `head_to_head`, `points_table`. Projections must be **rebuildable from scratch** via a CLI command.

### 4.5 Real-time flow
Scorer submits event → server validates with engine → persists in a transaction → publishes to Redis channel `match:{id}` → realtime service broadcasts to subscribers → clients apply the event locally. Include a sequence number so clients detect gaps and resync.

### 4.6 Offline-first scoring
- Scorer UI writes events to IndexedDB first and updates state instantly via the local engine.
- A sync queue uploads pending events in order with retries and exponential backoff; server dedupes on event ID.
- **One active scorer per match** via a server-side scoring lock with explicit **handoff** (scorer can transfer to another device/user). Optional "second scorer" mode compares two independent scorers' feeds and flags discrepancies (like real cricket scoring).
- Visible sync status indicator (synced / pending N / offline / conflict).

---

## 5. Cricket rules the engine must handle

Write these into `docs/CRICKET_RULES.md` as a spec, then implement and test each one.

**Deliveries and extras**
- Runs off bat (0–6, plus custom values like 5 or 7 for overthrows/all-run).
- **Wide**: +1 (configurable) plus any runs run; not a legal ball; not counted against batter; counted against bowler. Wide that goes to boundary = 5.
- **No-ball**: +1 (configurable) penalty plus bat runs or byes; not a legal ball; next legal delivery is a **free hit** (configurable by format). Batter can only be out by run out, obstructing, hit ball twice on a no-ball.
- **Byes / leg byes**: count to team total and extras, not to batter or bowler.
- **Penalty runs** (5 runs, either team).
- Overthrows and boundary overthrows.
- Configurable **balls per over** and handling of over with extra balls.

**Dismissals (all of them)**
Bowled, caught (incl. caught & bowled, caught by substitute/wicketkeeper), LBW, run out (which batter, which end, fielders involved, direct hit), stumped, hit wicket, obstructing the field, hit the ball twice, timed out, **retired hurt** (not out, can return), **retired out**, handled the ball (legacy formats). Bowler credit only for the correct dismissal types. Strike/crossing logic after dismissals (current Laws: new batter on strike after a catch, except at end of over).

**Strike rotation**
Odd runs rotate strike; end of over rotates; byes/leg byes/no-ball runs rotate correctly; manual "swap strike" override for edge cases.

**Match structure**
- Toss and decision, playing XI, batting order, substitutes, **impact player** and **concussion replacement** (configurable).
- Overs limits, bowler over limits (e.g., max 4 in T20, 10 in ODI), powerplays (mandatory + optional, configurable).
- Innings end conditions: all out (configurable players per side, last-man-stands mode), overs complete, target reached, declaration.
- **Test/multi-day**: 2 innings each, declarations, follow-on enforcement, days/sessions, draw/tie results.
- **Ties**: super over (repeated super overs until result), bowl-out, or shared — configurable.
- **Rain/interruptions**: overs reduction and **revised targets**. Implement a pluggable `TargetRevisionStrategy` interface with: simple average run rate, most productive overs, and a DLS Standard Edition–style calculator using a resource table loaded from config (document data source; don't hardcode proprietary tables). Manual target override by match officials.
- **Results**: won by runs/wickets (with balls remaining), tie, draw, no result, abandoned, forfeit/walkover, awarded.

**Derived metrics**
Strike rate, economy, average, run rate, required run rate, projected scores (at current RR and alternative RRs), partnerships, fall of wickets, dot ball %, boundary %, balls per boundary, maidens, wides/no-balls per bowler, NRR for points tables.

**Testing requirements for the engine**
- Unit tests for every rule above.
- **Property-based tests** (fast-check) for invariants: total = bat runs + extras; legal balls never exceed overs × balls-per-over; wickets ≤ players − 1 (or players for last-man-stands); replaying events always yields identical state; undo then redo yields identical state.
- **Golden tests**: encode 3–5 real, well-known full matches as event logs and assert the final scorecard matches exactly.
- Target: 100% line and branch coverage on `scoring-engine`.

---

## 6. Users, roles, and permissions

Roles (a user can hold several, scoped to resources):
- **Super admin** (platform)
- **League/association admin** (scoped to a league)
- **Tournament organizer**
- **Club admin / team manager / captain**
- **Scorer** (assigned per match)
- **Umpire / match referee**
- **Player**
- **Fan** (default)

Implement a permission check helper like `can(user, action, resource)` used in server actions, route handlers, and UI. Never trust client-side checks alone. All admin actions write to an **audit log**.

---

## 7. Feature list

### 7.1 Scoring (scorer PWA) — top priority
- Match setup wizard: format/preset or custom rules, teams, playing XI, toss, umpires, venue.
- Big-button, one-hand-friendly scoring pad: 0, 1, 2, 3, 4, 6, custom runs; Wide, No-ball, Bye, Leg-bye; Wicket (guided flow per dismissal type); Undo.
- Optional per-ball detail: **wagon wheel** shot direction (tap on field diagram), **pitch map** (line/length), shot type, delivery type, fielder.
- New batter / new bowler selection with validation (no consecutive overs, over limits).
- Over summary, partnership, and bowler figures always visible.
- Ball-by-ball **commentary**: auto-generated text from events, plus manual edits.
- Scorer handoff, second-scorer verification, offline mode, sync status.
- Haptic feedback, screen wake lock, large-text mode, works in sunlight (high-contrast theme).

### 7.2 Live match experience (fans)
- Live scorecard (batting, bowling, extras, FoW, partnerships), auto-updating in real time.
- Ball-by-ball commentary feed with over separators.
- Charts: **worm**, **Manhattan**, run-rate comparison, wagon wheel per batter, pitch map per bowler, partnership graph.
- Win probability / predicted score (simple statistical model first; documented).
- Match info: squads, toss, venue, officials, weather placeholder.
- Share cards: dynamic **OG images** for scorecards, milestones (50/100/5-fer), results.
- Follow matches/teams/players → push and email notifications (wicket, milestone, innings end, result).

### 7.3 Players
- Profile: photo, role (batter/bowler/all-rounder/WK), batting hand, bowling style, teams, career summary.
- Stats by format, season, tournament, team, opposition, venue; batting, bowling, fielding, captaincy, wicketkeeping.
- **Insights**: strengths/weaknesses (scoring zones from wagon wheel, dismissal types, performance vs. bowler types), form graph (last N innings).
- Records and milestones, **badges/achievements**, **MVP points** system (documented formula).
- Player claiming/verification flow (merge duplicate profiles created by different scorers).
- Follow, compare two players side by side.

### 7.4 Teams and clubs
- Team profile, squad, captain/vice-captain, logo, home ground.
- Team stats, head-to-head, recent form, match history.
- Club with multiple teams (1st XI, 2nd XI, juniors, women's).
- Player invitations and join requests.
- **Find opponents / challenge a team** for friendly matches.

### 7.5 Tournaments and leagues (CricClubs-style)
- Create league → seasons → divisions → tournaments.
- Formats: round robin, groups + knockouts, league + playoffs (IPL-style qualifier/eliminator), pure knockout, custom.
- **Fixture generator** (round robin with home/away balancing, ground and date constraints) plus manual editing.
- Team registration with entry fees (Stripe), player registration with eligibility rules, squad locks, transfer windows.
- **Points table** with configurable points (win/tie/NR/bonus points) and **Net Run Rate** computed correctly (all-out teams counted for full overs).
- Umpire and scorer assignment, availability, and ratings.
- Ground/venue management and booking calendar.
- Disciplinary records, match protests/appeals, result approval workflow (scorer submits → umpire/admin approves).
- Leaderboards: most runs, wickets, highest score, best figures, most catches, MVP.
- Awards: player of the match, player of the tournament.
- **League public website**: custom subdomain (`{league}.app.com`), branding, news posts, sponsors, gallery, schedule, results, stats — multi-tenant.

### 7.6 Live streaming support
- **Scoreboard overlay** route (transparent background, OBS browser source) with themes, auto-updating via websocket.
- Overlay elements: mini scorecard, batter/bowler cards, last-6-balls strip, milestone animations, match result card.
- Stream links attached to matches.

### 7.7 Community and engagement
- News feed of followed entities, match highlights posts, photo uploads per match.
- Comments/reactions on matches (with moderation and reporting).
- Polls / fan predictions per match.

### 7.8 Administration
- Super-admin dashboard: users, leagues, content moderation, feature flags, system health.
- League admin dashboard: everything in 7.5 plus reports.
- **Data export**: scorecards and stats as CSV/PDF; full match event log as JSON.
- **Data import**: bulk player/team import via CSV.
- Public **REST API** (read-only, API keys, rate-limited, OpenAPI spec) for scores and stats.

### 7.9 AI features (later phase, behind a feature flag)
- Natural-language match summaries and auto-commentary enhancement from event data (LLM provider abstracted behind an interface; Claude API as default).
- "Ask about stats" chat over a player's/tournament's data using tool-calling against typed query functions (no free-form SQL generation).
- Strict cost controls: caching, rate limits, token budgets per tenant.

---

## 8. Non-functional requirements

**Performance**
- Live score update visible to fans < 1s after scorer submits (p95, same region).
- Public pages: Lighthouse ≥ 90 mobile; use RSC, streaming, ISR with **cache tags** revalidated on match events.
- Scorer pad interactions < 50ms (local engine, optimistic UI).
- Database: proper indexes on all foreign keys and hot query paths; EXPLAIN-check stats queries; paginate everything.

**Security**
- Zod validation on every input; parameterized queries only.
- Rate limiting (Redis) on auth, scoring, and public API.
- CSRF protection, secure cookies, strict CSP, security headers.
- Tenant isolation enforced in the data access layer and covered by tests.
- Secrets via env with a validated `env.ts` (fail fast on missing vars).
- Stripe webhooks verified and idempotent.
- GDPR-ready: data export and account deletion for users, consent for marketing emails, privacy-friendly analytics. Special care for **minors** (junior cricket): restricted profile visibility, guardian consent flag.

**Reliability**
- Event writes are transactional and idempotent.
- Workers retry with backoff and dead-letter queues.
- Realtime clients reconnect and resync from last sequence number.
- Daily DB backups documented; migration rollback strategy.

**Accessibility & UX**
- WCAG 2.2 AA, full keyboard navigation for admin, screen-reader-friendly scorecards (real tables).
- Mobile-first everywhere; scorer UI tested on small Android devices.
- Dark mode, RTL support.

**Observability**
- Sentry for errors (web, realtime, worker), OpenTelemetry tracing across services, pino logs with request/match IDs, health check endpoints, basic metrics (events/sec, socket connections, queue depth).

**Code quality**
- ESLint + Prettier, `strict` TS, no `any` without a comment justifying it.
- Feature-based folder structure inside `apps/web`.
- Server actions thin; business logic in services; DB access in repositories.

---

## 9. Delivery phases

Finish each phase fully (tests passing, docs updated, committed) before starting the next. At the end of each phase, give me a summary: what was built, how to run it, what's tested, known gaps.

**Phase 0 — Foundation**
Monorepo, tooling, Docker Compose, CI, env validation, `CLAUDE.md`, `ARCHITECTURE.md` (with a diagram), `DECISIONS.md`, `CRICKET_RULES.md`, initial DB schema draft with ER diagram for my review.

**Phase 1 — Scoring engine**
`packages/scoring-engine` with all rules in Section 5, full test suite (unit, property, golden). No UI yet. Include a small CLI that replays an event log JSON and prints the scorecard.

**Phase 2 — Auth, users, teams, players**
Auth, RBAC, profiles, teams, clubs, invites, image uploads.

**Phase 3 — Match setup + scorer PWA (online)**
Match creation wizard, scoring pad, server validation, event persistence, live scorecard page.

**Phase 4 — Real-time + offline**
Realtime service, Redis pub/sub, client resync, IndexedDB queue, scorer lock and handoff, sync status UI. E2E test: score an innings while toggling network offline/online.

**Phase 5 — Stats and projections**
Worker, projections, career stats, player insights, charts (worm, Manhattan, wagon wheel, pitch map), commentary feed, OG share images.

**Phase 6 — Tournaments and leagues**
Leagues/seasons, fixtures generator, points table + NRR, registrations, Stripe, officials, approvals, leaderboards, awards.

**Phase 7 — League websites, streaming overlay, notifications**
Multi-tenant subdomains, overlay themes, web push + email, follows, feed.

**Phase 8 — Admin, API, import/export, hardening**
Admin dashboards, public API + OpenAPI, CSV/PDF export, imports, rate limiting, security review, load test of realtime (k6), accessibility audit.

**Phase 9 — AI features**
Section 7.9 behind feature flags.

---

## 10. Seed data and demo

Create a seed script producing a realistic demo: 1 league, 2 divisions, 8 teams with 15 players each, a completed round-robin with full ball-by-ball data (generated via the engine with randomized but valid events), one live in-progress match, and one upcoming fixture. The demo must make every page look populated.

---

## 11. Definition of done (every feature)
- Types strict, lint clean, tests written and passing.
- Works on a 375px-wide mobile screen.
- Loading, empty, and error states handled.
- Permissions enforced server-side.
- Docs (`CLAUDE.md` and relevant `docs/` files) updated.

**Start now with Phase 0. Show me the plan first.**
