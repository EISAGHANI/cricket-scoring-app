# Phase 1 Plan — Scoring engine

**Goal (brief §9):** `packages/scoring-engine` implementing every rule in
[`CRICKET_RULES.md`](./CRICKET_RULES.md), with unit, property and golden tests at 100%
line/branch coverage, plus a CLI that replays an event-log JSON and prints the scorecard.
No UI, DB or network.

**Status: awaiting approval.** Nothing below is implemented yet.

---

## 1. Pre-conditions (need your answers)

| #   | Question                                                                                                                                       | My default if you just say "approved"                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Q1  | ADR-0005 event-model refinements (wicket inside `DELIVERY`, explicit `END_OF_OVER`, per-match `seq`, recorded `TARGET_REVISED`/`MATCH_RESULT`) | Accept as written                                                                       |
| Q2  | ADR-0006: engine has zero runtime deps; Zod schemas in `@cricket/schemas` with a type-equality test                                            | Accept                                                                                  |
| Q3  | ADR-0012: golden matches converted from Cricsheet data (with attribution)                                                                      | Accept; matches listed in §6                                                            |
| Q4  | ADR-0013: DLS-style table — do you have a source you're allowed to use?                                                                        | Ship the strategy with a synthetic test table; ARR, MPO and manual targets fully usable |
| Q5  | ⚠ defaults in CRICKET_RULES.md (`noBallByesScoredAs = BYES`, impact-player batting cap, quota reduction)                                       | Keep the stated defaults; all configurable                                              |

## 2. Package layout

```
packages/scoring-engine/
  src/
    index.ts                 public API (only file other packages import)
    types/
      events.ts              MatchEvent discriminated union + payload types
      rules.ts               MatchRules, presets types
      state.ts               MatchState, InningsState, BatterLine, BowlerLine, Partnership, FoW, …
      results.ts             MatchResult union
      errors.ts              RuleViolation { code, rule: "R-…", message, seq? }
    rules/
      presets.ts             TEST, ODI, T20, T10, HUNDRED, LAST_MAN_STANDS, BOX_CRICKET, CUSTOM
      dismissals.ts          the §8 table as data + helpers (allowedOn, creditsBowler, …)
    reducer/
      apply-event.ts         dispatch on event.type → handler; atomic (works on a draft)
      lifecycle.ts           MATCH_STARTED, TOSS, INNINGS_STARTED, INNINGS_ENDED, awaiting computation
      delivery.ts            runs, boundaries, extras, penalty-on-delivery, strike rotation
      dismissal.ts           DELIVERY.dismissal + WICKET + RETIREMENT/RESUMPTION
      over.ts                END_OF_OVER, BOWLER_CHANGE, quotas, consecutive overs, mid-over change
      substitution.ts        CONCUSSION / IMPACT / FIELDING
      multi-day.ts           DECLARATION, FOLLOW_ON, innings ordering, draw
      interruptions.ts       INTERRUPTION, PLAY_RESUMED (overs reduction)
      ties.ts                SUPER_OVER_STARTED, super-over innings, BOWL_OUT_RESULT, boundary count
      result.ts              computeResult + MATCH_RESULT verification
    log/
      resolve.ts             effective log: UNDO stack, CORRECTION patches (ADR-0005 §4–5)
      replay.ts              replay(), replayFrom(snapshot), incremental apply
    target-revision/
      strategy.ts            TargetRevisionStrategy interface
      arr.ts  mpo.ts  dls-standard.ts  resource-table.ts (loader + validation)
      fixtures/synthetic-table.json   NOT official; test-only
    metrics/
      batting.ts bowling.ts team.ts projections.ts nrr.ts
    format/
      overs.ts               "12.3", balls-display for Hundred
      dismissal-text.ts      "c Smith b Jones", "run out (Smith/†Buttler)"
      commentary.ts          auto-commentary text per event (needed in Phase 5; pure, so it lives here)
    internal/draft.ts        copy-on-write helper (no Immer; ADR-0006)
  test/
    unit/…                   one file per reducer module; test names cite R-IDs
    property/
      arbitraries.ts         fast-check generators of *valid* event logs (driven by state.awaiting)
      invariants.test.ts     CRICKET_RULES §16
    golden/
      *.events.json  *.expected.json  golden.test.ts
    rules-coverage.test.ts   fails if any R-ID in CRICKET_RULES.md has no test
    bench/replay.bench.ts    vitest bench
  tools/
    cli.ts                   `pnpm --filter @cricket/scoring-engine replay <file.json> [--json] [--at seq]`
    cricsheet/convert.ts     dev-only Cricsheet → event log converter (ADR-0012)
packages/schemas/src/
  events.ts                  Zod schemas for every event payload
  events.type-test.ts        expectTypeOf<z.infer<…>>().toEqualTypeOf<MatchEvent>()
```

## 3. Public API

```ts
// construction & replay
export function initialState(): MatchState;                        // pre-MATCH_STARTED
export function applyEvent(state: MatchState, event: MatchEvent): MatchState; // throws RuleViolation
export function tryApplyEvent(state, event): { ok: true; state } | { ok: false; error: RuleViolation };
export function replay(log: readonly MatchEvent[]): MatchState;    // resolves UNDO/CORRECTION first
export function replayFrom(snapshot: MatchState, tail: readonly MatchEvent[]): MatchState;
export function resolveLog(log: readonly MatchEvent[]): MatchEvent[];

// what the UI may do next
export function awaiting(state: MatchState): ReadonlySet<MatchEvent["type"]>;
export function eligibleBatters(state): PlayerId[];
export function eligibleBowlers(state): { playerId; reasonIfNot? }[];
export function allowedDismissals(state, delivery: DeliveryDraft): DismissalKind[];

// derived
export const metrics: { strikeRate, economy, runRate, requiredRunRate, projectedScores, … };
export function netRunRate(summaries: NrrInput[]): number;
export const targetRevision: { arr, mpo, dlsStandard(table, g50) };
export const presets: Record<PresetId, MatchRules>;
export const ENGINE_VERSION: string;
```

`MatchState` is plain JSON (no classes, Maps or Dates), so it can be `structuredClone`d,
stored as a JSONB snapshot, and sent over the wire. Immutability: `applyEvent` copies only the
branches it touches (copy-on-write helper), so incremental application is O(change), not
O(state). `replay` folds the same way.

**Errors:** `RuleViolation` carries `code` (e.g. `BOWLER_CONSECUTIVE_OVERS`), the rule ID, a
human message for the scorer, and the `seq`. These codes become the server's 409 payload and
the scorer UI's messages.

## 4. Milestones (each = one or more conventional commits, tests green at every commit)

| #   | Milestone                                  | Rules covered                     | Exit criterion                                                          |
| --- | ------------------------------------------ | --------------------------------- | ----------------------------------------------------------------------- |
| M1  | Types, rules, presets, errors, Zod schemas | §2, §3                            | Type-equality test passes; every preset validates                       |
| M2  | Lifecycle + legal deliveries + strike      | R-LC-\*, R-RUN-\*, R-STR-01/05/06 | Can score a single-innings match of dot balls and runs                  |
| M3  | Extras & penalty runs                      | R-EXT-\*, R-STR-02..04            | Unit tests for every extra × runs × boundary combination                |
| M4  | Overs & bowlers                            | R-OV-\*                           | Quotas, consecutive overs, mid-over change, miscount, Hundred sets      |
| M5  | Dismissals & batters                       | R-DIS-\*, R-SUB-04/05, R-LMS-\*   | Every dismissal kind × delivery type matrix test (table-driven from §8) |
| M6  | Innings end & limited-overs results        | R-INN-\*, R-RES-01/02/05/06       | T20 & ODI matches end and produce results                               |
| M7  | Undo / correction / replay / snapshots     | R-UNDO-\*, R-COR-\*               | Undo/redo and snapshot-equivalence tests pass                           |
| M8  | Property-test harness                      | §16 invariants                    | fast-check, 1,000 runs per invariant in CI (10k nightly later)          |
| M9  | Multi-day                                  | R-MD-\*, R-RES-04                 | 4-innings matches, declarations, follow-on, innings victory, draw       |
| M10 | Ties & super overs                         | R-RES-03                          | Repeat super overs, boundary-count rule, bowl-out recording             |
| M11 | Substitutions                              | R-SUB-01..03                      | Concussion & impact-player eligibility                                  |
| M12 | Interruptions & target revision            | R-TR-\*                           | ARR/MPO hand-calculated cases; DLS formula against synthetic table      |
| M13 | Metrics, NRR, formatting, commentary       | §15                               | NRR worked examples (incl. all-out quota rule)                          |
| M14 | Golden matches                             | end-to-end                        | All 5 golden scorecards match exactly                                   |
| M15 | CLI + bench + docs                         | —                                 | `replay` prints scorecard; full Test replay < 50 ms; CLAUDE.md updated  |

The order puts the hard, foundational pieces (state machine, deliveries, undo) first, so
property tests (M8) start catching bugs while the long tail (M9–M13) is built.

## 5. Testing strategy

- **Unit tests:** a tiny test DSL keeps logs readable:
  `match(T20).toss("A","BAT").open("a1","a2","b1").balls("1 . 4 W(caught b3) 6wd").state()`.
  It compiles to real events; tests assert on state.
- **Rule coverage gate:** `rules-coverage.test.ts` parses `CRICKET_RULES.md` for `R-…` IDs and
  fails if any ID isn't cited by a test name. The spec and tests can't drift.
- **Property tests (fast-check):** a model-based generator walks `awaiting(state)` and picks a
  random _valid_ next event (runs, extras, dismissals allowed at that point, bowler from
  `eligibleBowlers`). That yields thousands of valid full matches across random presets,
  including LMS and The Hundred. Invariants: §16. A second "hostile" generator mixes in invalid
  events and asserts atomic rejection (R-LC-03).
- **Golden tests:** converted logs replay to final state, and the formatted scorecard is
  compared field by field with a hand-checked expected file (batting, bowling, extras, FoW,
  result).
- **Coverage:** `vitest --coverage` with 100% thresholds (already configured in Phase 0 and
  enforced in CI). Unreachable defensive branches get an `assertNever`, never an ignore comment.
- **Old-engine regression:** port the 18 scenarios from `apps/web/lib/cricket/engine.test.ts`
  where they agree with the spec.

## 6. Golden matches (proposed)

Chosen for the edge cases they exercise. All available in Cricsheet; licence to be confirmed
on download.

| Match                                                  | Exercises                                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 2019 ODI World Cup final, ENG v NZ (Lord's)            | Tie → tied super over → boundary-count rule; overthrow-to-boundary (2+4)           |
| 2019 Ashes 3rd Test, Headingley (ENG won by 1 wkt)     | 4 innings, a 67 all out, 359 chased with a 76-run last-wicket stand                |
| A rain-affected ODI or T20 with a published DLS target | Target revision via `TARGET_REVISED { override: true }` (official target recorded) |
| A The Hundred match                                    | 5-ball sets, consecutive sets, ball-count display                                  |
| A T20I with a retired hurt / concussion substitute     | Retirements and substitutions                                                      |

The DLS golden uses the officially published target as an override, so it doesn't depend on
having the table (Q4).

## 7. Dependencies to add (exact versions checked at install time)

| Package                | Where                | Why                         |
| ---------------------- | -------------------- | --------------------------- |
| `fast-check`           | scoring-engine (dev) | Property tests              |
| `tsx`                  | scoring-engine (dev) | CLI and Cricsheet converter |
| `zod` (already pinned) | schemas              | Event schemas               |

The engine itself gets **no runtime dependencies** (ADR-0006).

## 8. Risks

| Risk                                                                 | Mitigation                                                                                      |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Rule ambiguity (Laws vs playing conditions)                          | ⚠ items configurable; defaults listed for sign-off (Q5)                                         |
| Cricsheet doesn't model some events cleanly (retirements, penalties) | Converter flags anything unknown; I review each golden by hand against Cricinfo                 |
| 100% branch coverage pushes toward test-shaped code                  | Table-driven rules (dismissal matrix as data) reduce branches; `assertNever` for exhaustiveness |
| Copy-on-write bugs (accidental mutation of the input state)          | Tests deep-freeze input state in dev; property test checks input is unchanged                   |
| Scope: §5 is large                                                   | Milestones are independently shippable; you can review after M7 (core limited-overs engine)     |

## 9. Out of scope for Phase 1

UI, DB tables, server actions, realtime, IndexedDB, win probability (Phase 5), career
aggregates (Phase 5), points table (Phase 6, though the NRR formula ships now).

## 10. Definition of done

- `pnpm turbo run lint typecheck test test:coverage` green; 100% coverage on the engine.
- Every `R-…` ID cited by at least one test.
- 5 golden matches pass; CLI prints their scorecards.
- `CLAUDE.md` (glossary, gotchas) and `CRICKET_RULES.md` (any rule clarifications) updated;
  new ADRs for anything decided along the way.
- Phase summary: what was built, how to run it, what's tested, known gaps.
