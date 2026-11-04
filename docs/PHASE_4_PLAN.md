# Phase 4 Plan — Real-time and offline

**Goal (brief §9):** realtime service, Redis pub/sub, client resync, IndexedDB queue, scorer lock
and handoff, sync status UI. E2E: score an innings while toggling the network offline and online.

**Status: approved (2026-11-04)** with the defaults for Q1–Q7. In progress.

## 1. Decisions needed

| #   | Question                          | Default if you say "approved"                                                                                                                                                                       |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | **Realtime transport**            | Socket.IO (brief §3) with the Redis adapter. The 5-second poll stays as a fallback when the socket is down.                                                                                         |
| Q2  | **Who authenticates sockets**     | Match feeds are public (same as the live page), so no auth to subscribe. Scorer-only channels (lock status) use a short-lived signed token minted by the web app.                                   |
| Q3  | **Scoring lock model**            | One active scorer per match: a lease row in Postgres (holder user + device, expiry) renewed by heartbeat. Explicit handoff to another user or device; the match creator can take over a stale lock. |
| Q4  | **Second-scorer comparison mode** | Deferred to Phase 5 or later. Phase 4 ships the single-scorer lock only.                                                                                                                            |
| Q5  | **Offline storage**               | IndexedDB via Dexie (brief §3). Service worker caches the scorer shell so `/matches/:id/score` opens offline for a match already loaded.                                                            |
| Q6  | **Redis in local dev**            | Already in `pnpm infra:up`. No new paid service.                                                                                                                                                    |
| Q7  | **Event publish path**            | After the DB commit, the web event service publishes to Redis `match:{id}`. A lost publish is harmless: clients detect the seq gap and resync.                                                      |

## 2. Data (migration 0004)

- `match_scoring_locks`: `match_id` (PK), `holder_user_id`, `holder_device_id`, `acquired_at`,
  `heartbeat_at`, `expires_at`, `generation` (fencing token, bumped on every change of holder).
- Lock events go to the audit log (acquire, release, handoff, takeover).
- No change to `ball_events`; `device_id` and the client UUIDv7 already exist.

## 3. Server side

**Event service (`features/scoring/service.ts`)**

- Require the caller to hold the lock (matching user, device and `generation`); otherwise 423 with
  the current holder. The seq and idempotency checks stay as in Phase 3.
- Accept a batch (`POST /api/matches/:id/events` with an `events` array, in order) so a long
  offline tail uploads in one request. Stop at the first rejection and report which events were
  accepted.
- After commit, `PUBLISH match:{id}` with `{ seq, event }`, and publish status changes (lock,
  match status) on `match:{id}:meta`.

**Lock API**

- `POST /api/matches/:id/lock` (acquire), `…/lock/heartbeat`, `…/lock/release`,
  `…/lock/handoff` (to a named user/device; target accepts), and `…/lock/takeover` (creator only,
  and only after expiry unless forced with an audit reason).
- Same-origin check and `match.score` for all of them.

**`apps/realtime`**

- Socket.IO server that runs as two or more instances. The web app publishes to plain Redis channels and every instance pattern-subscribes (`match:*`) and emits to its own clients, so no `@socket.io/redis-adapter` is needed (it would deliver each message twice). Lock-channel access needs an HMAC scorer token (`REALTIME_SECRET`, issued by the web app in M6).
- Rooms `match:{id}`. On `subscribe` the server replies with the current `last_seq` so the client
  can resync immediately. Events are fanned out as `{ seq, event }`.
- `/healthz` also checks Redis. Basic metrics: connections, events per second.
- Env stays Zod-validated in `env.ts`.

## 4. Client side

- **Dexie outbox** (`features/scoring/outbox.ts`): events are written to IndexedDB before being
  applied, with status `pending | sending | acked | rejected`. The store rebuilds from the
  server's events plus the unacked tail after a reload or crash.
- **Sync queue:** uploads in order, exponential backoff with jitter, pauses while offline
  (`navigator.onLine` plus a failed request). Server dedupes on event ID, so retries are safe.
- **Conflict handling:** on 409, resync from the server. If the pending tail still applies
  cleanly to the new state, resend it; otherwise show the conflict screen where the scorer keeps
  or discards each local event. On 423 (lock lost) the pad becomes read-only and offers
  "request lock".
- **Sync status indicator:** `Synced`, `Pending N`, `Offline`, `Conflict`, always visible in the
  pad header.
- **Live page:** a socket client replaces polling. It applies `seq == last + 1` events with the
  engine, and on a gap or reconnect fetches `GET …/events?after=<seq>`. Polling resumes after
  repeated socket failures.
- **PWA:** web manifest (moved from Phase 3), service worker for the scorer shell and static
  assets, and an "install" hint on the scorer page. The service worker never caches the API.

## 5. Milestones

| #   | Milestone                                                           | Exit criterion                                                                                         |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| M1  | Migration 0004, lock service and API                                | Integration tests: acquire, heartbeat, expiry, handoff, takeover, fencing rejects a stale holder       |
| M2  | Redis publish from the event service; batch submit                  | Integration tests against real Redis: publish after commit, batch stops at first rejection             |
| M3  | `apps/realtime` (Socket.IO, Redis adapter, rooms, resync handshake) | Two instances: an event published through one reaches a client on the other; health check covers Redis |
| M4  | Live page on sockets with gap detection and resync                  | E2E: a second browser sees balls without polling; killing the socket falls back and recovers           |
| M5  | Dexie outbox and sync queue                                         | Unit tests with fake IndexedDB: ordering, retries, dedupe, reload recovery                             |
| M6  | Lock and handoff UI, sync status indicator, conflict screen         | E2E: handoff between two devices; the old holder becomes read-only                                     |
| M7  | PWA manifest and service worker                                     | Scorer page loads offline for a match already opened                                                   |
| M8  | End-to-end offline innings, docs, ADR, close-out                    | E2E: score an innings while toggling offline/online; final scorecard equals a straight online replay   |

## 6. Risks

| Risk                                                | Mitigation                                                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Lock lease expires while the scorer is offline      | Offline events stay queued; on reconnect the holder re-acquires if nobody took over, else conflict screen |
| Two devices think they hold the lock                | Fencing token (`generation`) checked inside the event transaction, not just at acquire time               |
| Missed socket messages                              | Every message carries `seq`; gaps trigger a fetch of `after=<lastSeq>`; reconnect always resyncs          |
| Service worker serves stale code or data            | Cache only static assets and the scorer shell, versioned; never cache `/api` responses                    |
| IndexedDB cleared or unavailable (private browsing) | Detect at startup, warn that offline scoring is off, keep online-only scoring working                     |
| Redis outage                                        | Publishing is best-effort and logged; scoring continues and clients fall back to polling                  |
| Playwright network toggling is flaky                | Use `context.setOffline()` and wait on the sync indicator, never on fixed timeouts                        |

## 7. Out of scope

Second-scorer comparison (Q4), `CORRECTION` UI, push notifications and worker projections
(later phases), rate limiting on the scoring API (Phase 8), and the overlay page.

## 8. Before coding

Check current versions with `npm view <pkg> version` for `socket.io`, `socket.io-client`,
`@socket.io/redis-adapter`, `ioredis` (or `redis`), `dexie` and a service-worker approach for
Next 16 (read `apps/web/node_modules/next/dist/docs/` first). Record the lock and transport
choices as ADR-0018.
