# Phase 3 Plan — Match setup and online scorer

**Goal (brief §9):** match creation wizard, scoring pad, server validation with the engine, event
persistence, and a live scorecard page. Online only: realtime sockets, offline queue and the
scoring lock/handoff are Phase 4.

**Status: awaiting approval.** Nothing below is implemented yet.

## 1. Decisions needed

| #   | Question                                                          | Default if you say "approved"                                                                                                                        |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | **Legacy local scorer** (`/local`, `lib/cricket`, `lib/store.ts`) | Delete it once the new scorer works (ADR-0002). Matches saved only in a browser's local storage are lost, so export anything you want to keep first. |
| Q2  | **Shot detail capture** (wagon wheel, pitch map)                  | Both available in Phase 3 as optional per-ball taps (off by default), so the data exists for Phase 5 charts.                                         |
| Q3  | **Who may score**                                                 | The match creator, plus scorers they add (staff or players of either team). New policy actions: `match.create`, `match.score`, `match.manage`.       |
| Q4  | **Live updates before Phase 4**                                   | The live page polls for new events every 5 seconds and applies them with the engine. Phase 4 replaces polling with sockets.                          |
| Q5  | **Umpires**                                                       | Free-text names in Phase 3; accounts, availability and ratings in Phase 6.                                                                           |

## 2. Data (migration 0003)

- `matches`: teams, venue, scheduled time, status (`SCHEDULED`, `LIVE`, `COMPLETED`, `ABANDONED`),
  `rules` (MatchRules snapshot), `last_seq`, `result_summary` (for lists), `created_by`.
- `match_players` (playing XI and substitutes per side), `match_officials` (scorers as users,
  umpires as names).
- `ball_events` (ADR-0005): client UUIDv7 id, `(match_id, seq)` unique, payload, schema and
  engine versions, device, client and server timestamps. A trigger blocks UPDATE and DELETE.
- `match_state_snapshots`: written at each end of over and end of innings, ignored on an engine
  version mismatch.

## 3. Write path

`POST /api/matches/:id/events` (a Route Handler, so the Phase 4 sync queue can reuse it):

1. Validate the shape with `EventSubmissionSchema`.
2. Check `match.score`.
3. In one transaction, lock the match row, load the latest snapshot and tail events, and check
   the client's `seq` is `last_seq + 1` (otherwise 409 with the server's `last_seq`).
4. Apply the event with the engine; a `RuleViolation` becomes a 422 with its code and rule.
5. Insert the event (a repeated event `id` with the same payload returns the stored result),
   update `last_seq` and the snapshot, then revalidate the match's cache tag.

`GET /api/matches/:id/events?after=<seq>` returns events after `seq`, for resync and polling.

## 4. Scorer UI

- **Store:** a Zustand store (5.0.16) wraps the engine: apply locally first (pad latency under
  50 ms), post, and on 409 resync from the server.
- **Reused from the legacy app:** keypad, pickers, score header, over strip and scorecard,
  rewired to `@cricket/scoring-engine`. Batter, bowler and dismissal choices come from the
  engine's eligibility helpers.
- **Wicket flow:** guided per dismissal type. Also undo, mid-over bowler changes, retirements and
  penalty runs.
- **Ground-friendly:** haptics, screen wake lock, a large-text / high-contrast mode, and a PWA
  manifest (offline is Phase 4).

## 5. Pages

- **Match setup wizard:** format preset or custom rules, two teams from their squads (with guest
  players), venue (pick or create), umpires, scorers, scheduled time.
- **Live scorecard:** `/matches/[id]`, with batting, bowling, extras, fall of wickets,
  partnerships and auto-commentary.
- **Match lists:** `/matches` (live, upcoming, recent); team pages show their matches.
- **Home page:** reworked around live and recent matches.

## 6. Milestones

| #   | Milestone                                                                        | Exit criterion                                                                                                      |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| M1  | Schema + immutability trigger + policy actions                                   | Migration applies; trigger tested                                                                                   |
| M2  | Event service and API (validate, persist, idempotency, seq conflicts, snapshots) | Integration tests, including persisting the 2019 World Cup final event-by-event and reading back the same scorecard |
| M3  | Match setup wizard and venue picker                                              | E2E: create a match from two seeded teams                                                                           |
| M4  | Scorer pad on the server-backed engine                                           | E2E: score a short match through the pad, with a wicket, extras, undo and a result                                  |
| M5  | Live scorecard, polling, commentary, match lists                                 | E2E: a second browser sees the scorer's balls appear                                                                |
| M6  | Legacy removal (Q1), home page, docs                                             | No references to `lib/cricket`; all checks green                                                                    |

## 7. Risks

| Risk                                       | Mitigation                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| Two scorers before the Phase 4 lock        | Server serializes with expected `seq`; the losing client gets a 409 and resyncs |
| Revalidating the match cache on every ball | Tag per match only; lists revalidate on status changes                          |
| Replay cost for long matches               | Snapshots at each over; a full Test replay already takes about 1 ms             |
