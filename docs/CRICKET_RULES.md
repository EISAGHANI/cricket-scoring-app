# Cricket Rules Specification (scoring engine)

This is the **specification** for `@cricket/scoring-engine`. Every rule has a stable ID (`R-…`).
Tests cite the IDs they cover in their names (`it("R-EXT-02: …")`), and
`test/rules-coverage.test.ts` fails the build if any ID here is not cited by a test.

Baseline: MCC Laws of Cricket (2017 Code, 3rd edition 2022) and current ICC men's playing
conditions. Where they differ, the difference is a **configurable rule**, not hard-code.
Items marked ⚠ were owner-approved defaults (Phase 1 plan, Q5); §17 lists known gaps.

---

## 1. Vocabulary

| Term               | Meaning in the engine                                                                |
| ------------------ | ------------------------------------------------------------------------------------ |
| Delivery           | Any ball bowled, legal or not. One `DELIVERY` event.                                 |
| Legal ball         | Not a wide and not a no-ball. Only legal balls count toward the over.                |
| Over / set         | Deliveries from one bowler's turn, ended by `END_OF_OVER`. A "set" in The Hundred.   |
| Runs completed     | Runs physically run (`DELIVERY.runs`).                                               |
| Boundary allowance | 4 or 6 (configurable) when the ball reaches the boundary.                            |
| Bowler's runs      | Runs charged to the bowler: bat runs + all wide runs + no-ball penalties (R-EXT-08). |
| Innings            | One side's batting turn; `kind` is `REGULAR` or `SUPER_OVER`.                        |
| `MatchRules`       | The full configuration for a match, snapshotted in `MATCH_STARTED`.                  |

---

## 2. Match configuration (`MatchRules`)

Flat and fully explicit; snapshotted in `MATCH_STARTED` so preset changes never alter a recorded
match. Validated at match start (R-LC-01).

| Field                                            | Meaning / default                                                                                  |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `format`                                         | Display label only.                                                                                |
| `playersPerSide`                                 | 2–15. All out = `playersPerSide − 1` wickets (`playersPerSide` in Last Man Stands).                |
| `ballsPerOver`                                   | 1–10. The Hundred: 5.                                                                              |
| `oversPerInnings`                                | Required for one-innings matches; `null` (unlimited) for multi-day.                                |
| `inningsPerSide`                                 | 1 or 2.                                                                                            |
| `maxDays`                                        | Multi-day length; drives the follow-on margin.                                                     |
| `bowlerMaxOvers`                                 | Overs a bowler may start (T20: 4, ODI: 10).                                                        |
| `bowlerMaxBalls`                                 | Legal-ball quota (The Hundred: 20).                                                                |
| `maxConsecutiveOvers`                            | Overs in a row by one bowler. 1; The Hundred 2.                                                    |
| `oversPerEnd`                                    | Overs bowled from one end before ends change. 1; The Hundred 2 (10-ball ends).                     |
| `wideRuns`, `noBallRuns`                         | Penalties. 1 / 1; The Hundred: no-ball 2 (confirmed against real match data).                      |
| `freeHit`                                        | `ALL_NO_BALLS` (limited overs) or `NONE` (Test).                                                   |
| `noBallByesScoredAs`                             | ⚠ `BYES` (ICC, default) or `NO_BALLS` (literal Law 21.10). See R-EXT-08.                           |
| `lastManStands`                                  | Last batter bats alone (§10.3).                                                                    |
| `allowHandledTheBall`                            | Legacy dismissal (pre-2017), off by default.                                                       |
| `boundaryFour/Six`                               | Boundary allowances (box/indoor variants).                                                         |
| `tieBreaker`                                     | `NONE`, `SUPER_OVER`, `SUPER_OVER_REPEAT` (default), `SUPER_OVER_THEN_BOUNDARY_COUNT`, `BOWL_OUT`. |
| `superOverBalls`, `superOverWickets`             | Super-over length (6; Hundred 5) and wickets that end it (2).                                      |
| `followOnEnabled`, `followOnMargin`              | Follow-on; margin `null` = derived from `maxDays` (R-MD-04).                                       |
| `concussionReplacements`, `impactPlayersPerTeam` | Substitution rules (§12).                                                                          |
| `retiredHurtMayReturn`                           | Default true.                                                                                      |
| `powerplays`                                     | Informational (fielding restrictions are not scored).                                              |
| `minOversForResult`                              | Overs the side batting second must face for a result (R-TR-08).                                    |
| `targetRevision`, `dlsG50`                       | `ARR`, `MPO`, `DLS_STANDARD` (needs a resource table), `MANUAL` (§13).                             |

**R-PRE-01** Presets (`TEST`, `FIRST_CLASS_4DAY`, `ODI`, `T20`, `T10`, `HUNDRED`,
`LAST_MAN_STANDS`, `BOX_CRICKET`, `CUSTOM`) are plain `MatchRules` values and all validate.
`LAST_MAN_STANDS` and `BOX_CRICKET` are starting points for organisers to adjust.

---

## 3. Events

Every event: `id` (client UUIDv7), `seq` (per match, strictly increasing), `type`, `payload`.
Device and audit metadata live outside the engine (`@cricket/schemas` `EventSubmissionSchema`).
Every payload field is required; optional values are `null`.

| Event                | Payload                                                                                                                                                                                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MATCH_STARTED`      | `rules`, `teams[2]` (`playingXI`, `substitutes`, `captainId`, `wicketKeeperId`)                                                                                                                                                                                                                       |
| `TOSS`               | `winnerTeamId`, `decision: BAT \| BOWL`                                                                                                                                                                                                                                                               |
| `INNINGS_STARTED`    | `battingTeamId`, `strikerId`, `nonStrikerId`, `bowlerId` (kind/round derived)                                                                                                                                                                                                                         |
| `DELIVERY`           | `runs`, `boundary: FOUR\|SIX\|null`, `overthrow`, `extra` (`WIDE`, `NO_BALL{runsFrom: BAT\|BYE\|LEG_BYE}`, `BYE`, `LEG_BYE` or null), `dismissal` (`kind`, `batterId`, `fielderIds`, `end`, `directHit`) or null, `penaltyRuns`, `overMiscount`, `detail` (wagon, pitch, shot, delivery type) or null |
| `WICKET`             | Dismissals without a delivery: `TIMED_OUT`, `RUN_OUT`, `OBSTRUCTING_THE_FIELD`, `HANDLED_THE_BALL`                                                                                                                                                                                                    |
| `BATTER_IN`          | `batterId` (fills the vacant end; also how a retired-hurt batter resumes)                                                                                                                                                                                                                             |
| `BOWLER_CHANGE`      | `bowlerId`, `reason: NEW_OVER \| INJURY \| SUSPENDED \| OTHER`                                                                                                                                                                                                                                        |
| `END_OF_OVER`        | `reason: NORMAL \| MISCOUNT`                                                                                                                                                                                                                                                                          |
| `PENALTY_RUNS`       | `toTeamId`, `runs`, `reason`                                                                                                                                                                                                                                                                          |
| `RETIREMENT`         | `batterId`, `kind: HURT \| OUT`                                                                                                                                                                                                                                                                       |
| `SUBSTITUTION`       | `kind: CONCUSSION \| IMPACT \| FIELDING`, `teamId`, `outPlayerId`, `inPlayerId`                                                                                                                                                                                                                       |
| `SWAP_STRIKE`        | `reason` (manual override)                                                                                                                                                                                                                                                                            |
| `DECLARATION`        | `teamId`                                                                                                                                                                                                                                                                                              |
| `FOLLOW_ON`          | `enforced`                                                                                                                                                                                                                                                                                            |
| `INTERRUPTION`       | `kind: RAIN \| BAD_LIGHT \| LUNCH \| TEA \| STUMPS \| OTHER`                                                                                                                                                                                                                                          |
| `PLAY_RESUMED`       | `revisedOvers`, `revisedBowlerMaxOvers` (both nullable)                                                                                                                                                                                                                                               |
| `TARGET_REVISED`     | `target`, `overs`, `override`                                                                                                                                                                                                                                                                         |
| `INNINGS_ENDED`      | `reason: ALL_OUT` (no batter available) \| `FORFEITED` (before a multi-day innings)                                                                                                                                                                                                                   |
| `SUPER_OVER_STARTED` | `round`                                                                                                                                                                                                                                                                                               |
| `BOWL_OUT_RESULT`    | `winnerTeamId` (recorded, not simulated)                                                                                                                                                                                                                                                              |
| `MATCH_RESULT`       | `result`, `override`                                                                                                                                                                                                                                                                                  |
| `UNDO`               | `targetId`                                                                                                                                                                                                                                                                                            |
| `CORRECTION`         | `targetId`, `patch`                                                                                                                                                                                                                                                                                   |

---

## 4. Lifecycle

**R-LC-01** The first event is `MATCH_STARTED` (rules and team sheets validated); `TOSS` comes
before the first innings.
**R-LC-02** `awaiting(state)` lists the event types that may be accepted next (advisory for UIs;
`applyEvent` is the authority). Nothing is accepted after the match is complete. Unknown event
types are programming errors (plain `Error`), not rule violations.
**R-LC-03** A rejected event throws `RuleViolation { code, rule, message, seq }` and never changes
state. Hostile input is property-tested to fail only this way.
**R-LC-04** `applyEvent` is pure and deterministic: no clock, randomness or I/O, and the input
state is never mutated.
**R-LC-05** `replay(log)` ≡ folding `applyEvent` over the effective log; `replayFrom(snapshot,
tail)` ≡ `replay(log)`.
**R-LC-06** Event `seq` numbers must strictly increase.

## 5. Runs and boundaries

**R-RUN-01** Runs completed (any whole number 0–20) are credited to the striker, the bowler and
the team, and a legal ball is counted.
**R-RUN-02** A boundary scores its allowance, unless the runs completed before it are greater
(Law 19.8). A six can have no runs completed and no overthrow.
**R-RUN-03** An overthrow to the boundary scores runs completed (including the run in progress if
the batters had crossed) plus the allowance. It is not a "four" to the batter.
**R-RUN-04** Short runs: only the runs that count are recorded; deliberate short running is a
separate `PENALTY_RUNS`.
**R-RUN-05** Team total = Σ batter runs + Σ extras (property-tested).
**R-RUN-06** A batter's dot is a legal ball faced with nothing off the bat; a bowler's dot is a
legal ball with no runs charged (so a bye is a dot for the bowler).

## 6. Extras

**R-EXT-01 Wide.** `wideRuns` plus runs completed, all scored as wides and charged to the bowler.
Not a legal ball, not a ball faced.
**R-EXT-02** A wide to the boundary scores `wideRuns + 4`. It is not a boundary off the bat.
**R-EXT-03 No-ball.** `noBallRuns` penalty charged to the bowler. Not a legal ball, but a ball
faced. With `freeHit = ALL_NO_BALLS` the next delivery is a free hit; a wide or no-ball on a free
hit keeps it.
**R-EXT-04** Bat runs off a no-ball are credited to the striker and charged to the bowler.
**R-EXT-05 Byes / leg byes** need at least one run, count to the total and extras only, and are
legal balls faced. Byes can be a four, never a six.
**R-EXT-06** Leg-bye legitimacy (Law 23.2) is the umpire's call; the engine records it as given.
**R-EXT-07** Runs run off a wide are wides, never byes.
**R-EXT-08 ⚠** Runs run off a no-ball that missed the bat: `BYES` → byes/leg byes, not charged to
the bowler; `NO_BALLS` → no-ball extras, charged to the bowler. The penalty is always charged.
**R-EXT-09** Penalty runs (`PENALTY_RUNS`, default 5) go to the batting side's current innings.
Awarded to the fielding side, they go to its most recent completed innings, or to its next innings
if it has not batted (Law 41.17). Dependent targets and the provisional result are recomputed.
Runs awarded while a crease is vacant join the next partnership.
**R-EXT-10** `DELIVERY.penaltyRuns` adds penalty runs on a delivery, in addition to its runs.

## 7. Overs and bowlers

**R-OV-01** An over is due after `ballsPerOver` legal balls; further deliveries are rejected
unless flagged `overMiscount` (the umpire allowed an extra ball, Law 17.5).
**R-OV-02** `END_OF_OVER` before the over is due must say `MISCOUNT`; the short over counts as
complete.
**R-OV-03** At `END_OF_OVER` the batters change ends when the bowling end changes (every
`oversPerEnd` overs).
**R-OV-04 Maiden**: a full over by one bowler with no runs charged to the bowler (byes and leg byes
do not spoil it; wides and no-balls do).
**R-OV-05** A new over needs `BOWLER_CHANGE { NEW_OVER }`. The bowler must be in the fielding XI,
not suspended, within quota (`bowlerMaxOvers` counts overs started; `bowlerMaxBalls` counts legal
balls), and not over `maxConsecutiveOvers`. Before the first ball the selection may be changed
(reason ≠ `NEW_OVER`) without counting an over.
**R-OV-06 Mid-over change** (injury, suspension): someone who did not bowl the previous over (or
in this over) completes it, within quota. Nobody who took part in a shared over may bowl the next
one. A `SUSPENDED` bowler may not bowl again in the innings. Balls are credited to whoever bowled
them.
**R-OV-07** Overs read `O.B` (completed overs, legal balls in the current over), for teams and
bowlers.
**R-OV-08** The Hundred: 5-ball sets, two consecutive sets allowed from one end, 20-ball quotas,
progress shown in balls ("67 balls").

## 8. Dismissals

| Kind                  | Credits bowler | Legal | Wide | No-ball / free hit | Byes | Who      | Runs allowed |
| --------------------- | -------------- | ----- | ---- | ------------------ | ---- | -------- | ------------ |
| BOWLED                | yes            | yes   |      |                    |      | striker  | no           |
| CAUGHT                | yes            | yes   |      |                    |      | striker  | no           |
| LBW                   | yes            | yes   |      |                    |      | striker  | no           |
| STUMPED               | yes            | yes   | yes  |                    |      | striker  | no           |
| HIT_WICKET            | yes            | yes   | yes  |                    |      | striker  | no           |
| HIT_BALL_TWICE        |                | yes   |      | yes                |      | striker  | no           |
| RUN_OUT               |                | yes   | yes  | yes                | yes  | either   | yes          |
| OBSTRUCTING_THE_FIELD |                | yes   | yes  | yes                | yes  | either   | yes          |
| HANDLED_THE_BALL      |                | yes   | yes  | yes                | yes  | either   | yes (legacy) |
| TIMED_OUT             |                | —     | —    | —                  | —    | incoming | `WICKET`     |
| RETIRED_OUT           |                | —     | —    | —                  | —    | either   | `RETIREMENT` |

**R-DIS-01** A dismissal not allowed for the delivery type or free hit is rejected; striker-only
kinds must name the striker; the ball is dead after non-run-out dismissals, so no runs can be
recorded with them, and a run out cannot coincide with a boundary.
**R-DIS-02** Only the kinds marked "credits bowler" count to the bowler.
**R-DIS-03** A catch names exactly one fielder from the fielding side (substitutes allowed).
Scorecards show "c & b", "†" for the keeper and "sub (Name)".
**R-DIS-04** Only the wicket-keeper stumps; an empty fielder list means the keeper.
**R-DIS-05 Run out**: runs completed count (and a no-ball penalty). `end` names the wicket that
was broken (`null` = the dismissed batter's end); the survivor stays at the other end and the new
batter goes to `end`.
**R-DIS-06** After a catch the new batter takes strike (Law 18.11, 2022), except on the last ball
of the over (the end-of-over change then applies). Matches played under the older crossing rule
record the difference with `SWAP_STRIKE`.
**R-DIS-07** Other striker-only dismissals vacate the striker's end; the new batter takes strike.
**R-DIS-08** `WICKET` records a run out or obstruction without a delivery (e.g. the non-striker
backing up): not a ball, no bowler credit.
**R-DIS-09** After a wicket, `BATTER_IN` is required before the next ball. The batter must be in
the active XI, not already out or batting, and within the distinct-batter limit. Two vacancies
need two batters before a partnership starts.
**R-DIS-10** `WICKET { TIMED_OUT }` dismisses the incoming batter without a ball faced; dismissals
between overs record no bowler at the time.
**R-DIS-11** Fall of wicket records wicket number, score, legal balls, `O.B` and batter.

## 9. Strike rotation

**R-STR-01** Odd runs completed swap strike. A boundary does not, unless more (odd) runs were
completed. For an overthrow boundary, rotation follows runs completed.
**R-STR-02** Wides rotate on runs completed, not the penalty.
**R-STR-03** No-balls rotate on runs completed (bat or byes).
**R-STR-04** Byes and leg byes rotate on runs completed.
**R-STR-05** `END_OF_OVER` changes ends, so a single off the last ball keeps the original
striker on strike.
**R-STR-06** `SWAP_STRIKE` is a manual override (both batters must be in).
**R-STR-07** After a dismissal, strike follows R-DIS-05..07 rather than the runs.

## 10. Innings and match structure

**R-INN-01** Exactly `playersPerSide` in each XI, no player listed twice, captain and keeper in
the XI, two different teams; openers are two different eligible players and the bowler is in the
fielding XI.
**R-INN-02** The innings closes automatically when the target is reached, all wickets are down, or
the overs are used up (a final over needs no `END_OF_OVER`). `INNINGS_ENDED { ALL_OUT }` closes it
when a batter is needed but none can come in (e.g. absent hurt).
**R-INN-03** `DECLARATION` by the batting side, multi-day only.
**R-INN-04** Completed overs never exceed the allocation (property-tested).
**R-INN-05** Wickets never exceed `playersPerSide − 1` (`playersPerSide` in LMS; property-tested).
**R-INN-06** Batting order is free; order of appearance is recorded.
**R-INN-07** The side batting last chases opponent aggregate − own aggregate + 1 (limited overs:
first-innings total + 1), unless revised (§13).

### 10.1 Multi-day

**R-MD-01** Innings alternate A, B, A, B; after an enforced follow-on A, B, B, A. The side batting
last chases the aggregate.
**R-MD-02** An innings may be forfeited before it starts (`INNINGS_ENDED { FORFEITED }`, Law 15).
**R-MD-03** `MATCH_RESULT { DRAW }` when time runs out.
**R-MD-04 Follow-on**: available when the side batting first leads by at least 200 (5+ days), 150
(3–4), 100 (2) or 75 (1) — or `followOnMargin`. `FOLLOW_ON` must decide before the third innings.
**R-MD-05** A side that has batted twice and is still behind loses by an innings and N runs; level
after three innings, the last side needs 1.
**R-MD-06** Days advance when play resumes after `INTERRUPTION { STUMPS }`; sessions are
informational.

### 10.2 Super overs

**R-SO-01** Round 1: the side that batted second in the match bats first; later rounds: the side
that batted second in the previous round.
**R-SO-02** Batters dismissed in one round cannot bat in the next.
**R-SO-03** A bowler from the previous round cannot bowl in the next.
**R-SO-04** A super-over innings is one over of `superOverBalls` legal balls and ends at
`superOverWickets` wickets; the chase target is the first super-over score + 1.

### 10.3 Last Man Stands

**R-LMS-01** When one batter is left (also if they come back in), they bat alone, keep strike, and
odd runs and ends don't rotate.
**R-LMS-02** All out = every player out.
**R-LMS-03** The last batter can be run out at either end.

## 11. Results

**R-RES-01** Chasing side reaches the target → won by `maxWickets − wickets` wickets, with balls
remaining in limited-overs cricket.
**R-RES-02** Chasing side falls short → won by `target − 1 − score` runs; "(ARR/MPO/DLS method)"
when the target was revised.
**R-RES-03** Scores level → per `tieBreaker`: tie stands; super over (decides either way; tied
again → tie, or another round with `SUPER_OVER_REPEAT`); boundary count (fours and sixes **off the
bat** across the match and super overs — the 2019 World Cup final was 26–17; equal → tie); or a
recorded bowl-out.
**R-RES-04** Multi-day: tie only when the side batting last is out with scores level; short →
won by runs.
**R-RES-05** Results that cannot be computed are declared: `NO_RESULT`, `ABANDONED`, `DRAW`
(multi-day), or a win by `FORFEIT` / `AWARDED` / `CONCEDED`. A pending innings closes as
`MATCH_ENDED`.
**R-RES-06** `MATCH_RESULT` must equal the computed result (or the R-TR-08 result) unless
`override: true` (officials' decision, audited by the event itself).

## 12. Substitutions and retirements

**R-SUB-01** Substitutes listed on the team sheet may field (and catch) without joining the XI
(`SUBSTITUTION { FIELDING }` is informational). Only XI players may be replaced, only by listed
substitutes.
**R-SUB-02 Concussion replacement** (when enabled): the replaced player takes no further part;
the replacement inherits their batting state for the innings (cannot bat if the replaced player
was out), their bowling quota (overs already bowled count), and the gloves. A batter at the
crease must retire first; the current bowler must be changed first.
**R-SUB-03 Impact player** (up to `impactPlayersPerTeam`): replaces any XI player, who takes no
further part. No more than `playersPerSide` distinct batters per innings.
**R-SUB-04 Retired hurt**: not a wicket, ends the partnership; the batter may resume with
`BATTER_IN` (if `retiredHurtMayReturn`). Unbeaten at the end: "retired not out".
**R-SUB-05 Retired out**: a wicket, not credited to the bowler.

## 13. Interruptions and target revision

**R-TR-01** During an `INTERRUPTION` no balls, wickets or innings starts are accepted.
`PLAY_RESUMED` may revise the overs of the current innings (or the next one, between innings),
recorded as a reduction for DLS, and may revise the bowler quota explicitly. Revised overs below
what has been bowled are rejected; reaching the new limit closes the innings.
**R-TR-02** `TARGET_REVISED` applies only to the chase in a one-innings match (before or during
it), with whole positive values and overs not below those used. Unless `override`, it must equal
the configured strategy's target.
**R-TR-03 ARR**: `floor(team1 runs × team2 overs / team1 overs) + 1`, where team 1's overs are
its full allocation if it was all out.
**R-TR-04 MPO**: sum of team 1's highest-scoring `team2 overs` overs + 1.
**R-TR-05 DLS Standard-style**: resources `R1`, `R2` from an externally supplied table
(ADR-0013; rows = overs remaining, columns = wickets lost, linear interpolation), net of
reductions. If `R2 < R1`: `floor(S × R2 / R1) + 1`; else `floor(S + G50 × (R2 − R1) / 100) + 1`.
Tables are validated (bounds, monotonic). The repository ships only a synthetic test table.
**R-TR-06** `parScore(state)` gives the chasing side's par now, for every strategy that can
compute one (not `MANUAL`, not DLS without a table).
**R-TR-07** `MANUAL` targets must be overrides.
**R-TR-08** If play ends during the chase: before `minOversForResult` → no result; after → win,
loss or tie against par (`resultIfNoMorePlay`).

## 14. Undo and corrections

**R-UNDO-01** `UNDO { targetId }` must target the latest effective event.
**R-UNDO-02** `replay(log + UNDO(e))` ≡ `replay(log without e)` (property-tested).
**R-UNDO-03** Undoing an `UNDO` is a redo; any new event clears the redo stack (property-tested).
**R-UNDO-04** `MATCH_STARTED` cannot be undone.
**R-COR-01** `CORRECTION { targetId, patch }` may only change listed fields of an effective event
(e.g. a delivery's runs, extras, dismissal, detail). The match is re-replayed; if a later event
becomes invalid, the correction is rejected with that event's `seq`.
**R-COR-02** Later corrections win per field; corrections can be undone like any event.

## 15. Derived metrics

**R-MET-01** Strike rate (100 × runs / balls faced), economy (runs / overs), averages, run rate —
`null` when undefined.
**R-MET-02** Required run rate and projected scores (current rate, ±1/±2, and fixed 6/8/10 RPO).
**R-MET-03** Dot-ball %, boundary %, balls per boundary (batters), dot-ball % (bowlers).
**R-MET-04** Net run rate: (Σ runs for / Σ overs faced) − (Σ runs against / Σ overs bowled); a side
all out counts its full (revised) allocation; no-result, abandoned, forfeited and multi-day
matches are excluded.
**R-MET-05** Plain-text scorecard (batting, dismissal text, extras, FoW, bowling, result) and
result wording.
**R-MET-06** Ball labels for the over strip (`•`, `4`, `2wd`, `3nb`, `1lb`, `W`, `+5p`) and
one-line auto-commentary per delivery.

## 16. Invariants (property tests, `test/property`)

1. Team total = Σ batter runs + Σ extras.
2. Σ bowler runs + byes + leg byes + penalties = team total (both no-ball conventions).
3. Completed overs ≤ allocation; wickets ≤ limit.
4. `replay(log)` equals the incremental fold, every time.
5. Replay from any snapshot equals a full replay.
6. Undo removes exactly the last event; redo restores it.
7. Striker ≠ non-striker; both are batting for the batting side.
8. Σ partnership runs (+ runs awaiting the next partnership) = total − penalty runs added
   outside play; FoW entries = wickets.
9. Σ bowler legal balls = innings legal balls.
10. Hostile events fail only with `RuleViolation`.

## 17. Known gaps and simplifications

- Keeper changes are not modelled except through a concussion replacement of the keeper.
- A bowler completing someone else's over does not "start" an over for `bowlerMaxOvers`
  (legal balls still count toward ball-based limits).
- An umpire's miscount in the final over of an innings cannot be recorded (the innings closes at
  the full count).
- Boundary-count ties end as ties (the 2019 regulations had further steps).
- The follow-on margin uses match length, not days remaining when play started (Law 14.1.2);
  set `followOnMargin` explicitly when a match starts late.
- Fielding restrictions, new balls and session timings are not scored.
- Historical matches converted from Cricsheet record revised targets at the start of the chase,
  since the data does not say when play stopped.
