# Phase 2 Plan — Auth, users, teams, players

**Goal (brief §9):** sign-in, RBAC, user and player profiles, clubs and teams, invitations and join
requests, image uploads, all backed by Postgres, with permissions enforced server-side and every
admin action audited.

**Status: complete (2026-11-02).** Approved with the default answers to Q1–Q6; outcome in §10.

---

## 1. Decisions needed

| #   | Question                                                                                                                                   | Default if you say "approved"                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | **SMS provider** for phone OTP. All of them are paid (Twilio, Vonage, AWS SNS, MessageBird).                                               | Build phone OTP behind an `SmsSender` interface with a dev sender that logs codes (and shows them in Mailpit). Choose a provider later. |
| Q2  | **Production email**: Resend (free tier, paid beyond).                                                                                     | Build a `Mailer` interface: SMTP (Mailpit) in dev, Resend when `RESEND_API_KEY` is set. No account needed yet.                          |
| Q3  | **Google sign-in** needs an OAuth client you create in Google Cloud.                                                                       | Google is enabled only when `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set; email OTP and magic links work without them.           |
| Q4  | **The legacy "Crease" UI** owns `/teams` and `/matches`, which the new server-backed pages need.                                           | Move the legacy UI under `/local/*` unchanged (still works offline) until Phase 3 replaces it.                                          |
| Q5  | **Data-model open questions** (`DATA_MODEL.md` §3): teams outside a club; minors shown as "J. Smith" with no photo until guardian consent. | Accept both as written.                                                                                                                 |
| Q6  | **Duplicate-player merges** (brief §7.3) rewrite stats, which only exist from Phase 5.                                                     | Phase 2 ships **claiming** (a user claims an unclaimed player profile, a team admin approves). **Merging** moves to Phase 5.            |

**Prerequisite on your side:** Docker Desktop must be running. Phase 2 needs Postgres, Mailpit and
S3 locally, and the Docker engine wasn't running when I checked.

## 2. Stack additions (exact versions checked 2026-11-02)

| Package                                      | Version         | Where         | Why                                                                |
| -------------------------------------------- | --------------- | ------------- | ------------------------------------------------------------------ |
| `drizzle-orm`, `drizzle-kit`                 | 0.45.4, 0.31.11 | `packages/db` | Schema, migrations (ADR-0003)                                      |
| `postgres` (postgres.js)                     | 3.4.9           | `packages/db` | Driver. 4.0.0 is 4 days old; pnpm's release-age gate rejects it    |
| `better-auth`                                | 1.7.15          | `apps/web`    | Sessions, email OTP, magic link, phone number, Google (ADR-0004)   |
| `@aws-sdk/client-s3`, `s3-request-presigner` | 3.1161.0        | `apps/web`    | Presigned uploads to R2/S3/RustFS                                  |
| `sharp`                                      | 0.35.5          | `apps/web`    | Resize uploads to WebP variants (needs a pnpm `allowBuilds` entry) |
| `nodemailer`                                 | 10.3.1          | `apps/web`    | SMTP to Mailpit in dev                                             |
| `@playwright/test`                           | 1.64.1          | `apps/web`    | End-to-end tests                                                   |
| `server-only`                                | latest stable   | `apps/web`    | Keep the data access layer off the client                          |

No paid service is required to finish Phase 2.

## 3. Architecture for this phase

```
apps/web
  proxy.ts                     optimistic redirect for signed-out users (cookie check only)
  app/api/auth/[...all]/route.ts   Better Auth handler
  app/(auth)/sign-in, verify   email OTP / magic link / phone / Google
  app/(platform)/me, players/[slug], clubs/[slug], teams/[slug], invitations/[token]
  app/local/*                  legacy Crease UI, moved unchanged (Q4)
  lib/auth/                    Better Auth config, getCurrentUser() (DAL, 'use cache: private')
  lib/mail/, lib/sms/, lib/storage/   Mailer, SmsSender, S3 adapters (interfaces + dev impls)
  features/<area>/actions.ts   thin Server Actions: Zod parse → service
  features/<area>/service.ts   business logic: can() checks, transactions, audit log
packages/db
  src/schema/*.ts              Drizzle tables (auth, people, clubs, teams, media, audit)
  src/repositories/*.ts        typed queries; tenant-scoped ones require organizationId
  migrations/                  generated SQL, checked in
  src/testing.ts               test DB helpers (migrate cricket_test, truncate between tests)
packages/authz                 NEW: pure can(user, action, resource) + role tables, no I/O
```

Following the bundled Next.js 16 guides:

- **Proxy** (`proxy.ts`, formerly middleware) only reads the session cookie for redirects. Real
  checks happen in the data access layer, in every Server Action and route handler.
- **Cache Components is on**, so session reads sit behind `<Suspense>`. `getCurrentUser()` uses
  `'use cache: private'`. Session-derived data is cached by user id with `cacheTag`, never by
  email or token.
- The DAL imports `server-only`, returns narrow DTOs, and is the only code that touches
  `process.env` secrets.

## 4. Database tables (Phase 2 slice of `DATA_MODEL.md`)

`users`, `sessions`, `accounts`, `verifications` (generated by the Better Auth CLI for Drizzle,
then reviewed), `role_assignments`, `audit_log`, `consents`, `organizations`, `clubs`, `teams`,
`team_players`, `players`, `player_claims`, `invitations`, `join_requests`, `venues`,
`media_assets`.

Conventions from `DATA_MODEL.md`: UUIDv7 primary keys (`uuidv7()` default in Postgres 18), indexed
foreign keys, `citext` emails/slugs, `pg_trgm` index on player and team names, soft delete on users,
players and teams. Tenant-owned tables carry `organization_id NOT NULL`.

## 5. Authorization model

- `role_assignments(user_id, role, scope_type, scope_id)`. Roles from the brief §6.
- `can(subject, action, resource)` in `packages/authz` is a pure function over the subject's
  assignments and the resource's ownership chain (team → club → organisation). Super admin can
  do everything; "fan" is the absence of assignments.
- A permission matrix (`actions × roles × scopes`) lives in `packages/authz/src/policy.ts` as
  data, so the table is the documentation, and tests are generated from it.
- Services call `authorize(subject, action, resource)`, which throws `Forbidden`. Admin mutations
  write `audit_log` in the same transaction as the change.

## 6. Milestones

| #   | Milestone                     | Delivers                                                                                                                                                                | Exit criterion                                            |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| M1  | DB foundation                 | `packages/db` with Drizzle and migrations, test-DB helpers, CI Postgres service, migration-drift check                                                                  | `pnpm db:migrate` on a fresh DB; CI fails on schema drift |
| M2  | Auth                          | Better Auth: email OTP, magic link (Mailpit), phone OTP (dev sender), Google (env-gated); sign-in pages, proxy, DAL                                                     | E2E: sign in through a code read from Mailpit's API       |
| M3  | Authorization + audit         | `packages/authz` with the policy matrix; `authorize()`; audit writer                                                                                                    | Matrix-generated tests; 100% coverage on `authz`          |
| M4  | Organisations, clubs, teams   | Create/edit; squads with captain, vice-captain, keeper; club with several teams; venues (basic)                                                                         | Integration tests incl. **tenant isolation**              |
| M5  | Players and profiles          | User profile; player profiles (batting hand, bowling style, role); unclaimed players created by team admins; claim → approve; minors' privacy and guardian-consent flag | Profile pages render with real data; minors' rules tested |
| M6  | Invitations and join requests | Email/phone invites with hashed, expiring tokens; accept links the player to the team; join requests with approval                                                      | E2E: invite → accept → appears in squad                   |
| M7  | Image uploads                 | Presigned PUT to S3/RustFS, size/type limits, confirm step, sharp WebP variants (avatar 256/64, logo 512/128), `media_assets`                                           | Upload works against RustFS locally; limits tested        |
| M8  | Security baseline             | Security headers and CSP (per the bundled CSP guide), secure cookies, auth rate limiting (Better Auth's DB-backed limiter; Redis comes in Phase 4)                      | Header tests; rate-limit test                             |
| M9  | Legacy move + seed            | Legacy UI to `/local/*` (Q4); seed: 1 organisation, 2 clubs, 8 teams × 15 players, users with each role                                                                 | `pnpm db:seed` populates every new page                   |

## 7. Testing

- **Unit:** `packages/authz` (policy matrix), Zod input schemas, token helpers.
- **Integration (Vitest against `cricket_test`):** every service, using real transactions.
  Includes tenant-isolation tests: a league admin of org A cannot read or change org B's data
  through any service.
- **E2E (Playwright):** sign-in by email OTP, club/team creation, invite → accept, claim →
  approve, avatar upload. CI runs the compose stack as service containers.
- **Every page:** loading, empty and error states, and a 375 px layout (Definition of Done).

## 8. Risks

| Risk                                                                        | Mitigation                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Better Auth with Cache Components (session reads must stay behind Suspense) | Follow the bundled "authentication with Cache Components" guide; E2E covers it |
| RustFS (ADR-0010) not yet exercised                                         | First task in M7; switching image is a compose-file change                     |
| Better Auth's generated schema vs our conventions (UUIDv7, citext)          | Generate once, adapt by hand, pin the library version                          |
| Docker not running locally                                                  | Prerequisite above                                                             |
| Moving the legacy UI breaks its links                                       | Mechanical move with a redirect from old paths; its tests still run            |

## 9. Out of scope

Match creation and scoring (Phase 3), realtime and offline (Phase 4), stats and duplicate-player
merges (Phase 5), leagues, tournaments and payments (Phase 6), GDPR data export and account
deletion (Phase 8, though the schema supports it now).

## 10. Outcome

- **Delivered:** M1–M9 as planned. Passwordless sign-in (email code, magic link, phone code via
  a dev SMS sender, Google when configured); policy-as-data permissions with tenant isolation;
  organisations, clubs, teams, squads with captaincy roles; player profiles with privacy for
  minors and team-only profiles; claims; invitations by email/phone and join requests; image
  uploads; security headers; demo seed.
- **Tests:** `authz` 66 (100% coverage); web 54 unit + integration on real Postgres, including
  tenant isolation; db 5; Playwright E2E 14 at 375 px against the full local stack (CI runs
  Postgres, Mailpit and RustFS as services).
- **Deviations:** uploads go through the server and are re-encoded instead of presigned PUTs
  (ADR-0015); CSP without nonces because of Cache Components (ADR-0016); minors' age computed at
  read time instead of a stored flag.
- **Bugs found and fixed along the way:** session reads during runtime prerendering (Date.now),
  a phone number leaking into an auto-created player name, wildcard injection in name search,
  parallel test runs resetting each other's database.
- **Known gaps:** no UI yet to grant admin/manager roles to other users (creators and squads
  only); venue management has services but no pages (Phase 3 match setup needs it); no real SMS
  provider (Q1); replaced images are not yet deleted from storage; GDPR export/deletion is Phase 8.
