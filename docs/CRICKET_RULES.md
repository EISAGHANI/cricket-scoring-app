# Cricket Rules Specification (scoring engine)

This is the **specification** for `@cricket/scoring-engine`. Every rule has a stable ID
(`R-…`). Every test names the rule IDs it covers (`it("R-EXT-03: wide to boundary scores 5")`),
and Phase 1 isn't done until every ID has at least one test.

Baseline: MCC Laws of Cricket (2017 Code, 3rd edition 2022) and current ICC men's playing
conditions, with the differences between them as **configurable rules**, never hard-coded.
Items marked ⚠ are ones where Laws and playing conditions differ or the author isn't certain.
They're configurable, and their default needs owner sign-off.

---

## 1. Vocabulary

| Term                | Meaning in the engine                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| Delivery            | Any ball bowled, legal or not. One `DELIVERY` event.                                                      |
| Legal ball          | A delivery that's not a wide and not a no-ball. Only legal balls count toward the over.                   |
| Over / set          | A sequence of deliveries from one end ending with `END_OF_OVER`. "Set" is The Hundred's name for an over. |
| Striker/non-striker | Batters at the striker's / bowler's end before the delivery.                                              |
| Runs completed      | Runs physically run by the batters.                                                                       |
| Boundary            | 4 or 6 allowance. Replaces runs completed unless runs completed are greater (Law 19.8).                   |
| Extras              | Wides, no-balls, byes, leg byes, penalty runs.                                                            |
| Bowler's runs       | Runs charged to the bowler: bat runs + all wide runs + no-ball penalties.                                 |
| Innings             | One side's batting turn. Includes super-over innings (`kind: "SUPER_OVER"`).                              |
| `MatchRules`        | The full configuration for a match, snapshotted at `MATCH_STARTED`.                                       |

---

## 2. Match configuration (`MatchRules`)

Snapshotted into `MATCH_STARTED`, so later preset changes never affect a recorded match.

| Field                  | Type / default                                                                                    | Notes                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `playersPerSide`       | int 2–15, default 11                                                                              | Max batters = this; all out = `playersPerSide − 1` wickets (unless LMS). |
| `ballsPerOver`         | int 1–10, default 6                                                                               | The Hundred: 5. Box cricket often 6 or custom.                           |
| `oversPerInnings`      | int or `null` (unlimited)                                                                         | Test = `null`. The Hundred: `100 / 5 = 20` sets.                         |
| `inningsPerSide`       | 1 or 2                                                                                            | 2 = multi-day format.                                                    |
| `maxDays`              | int or `null`                                                                                     | Multi-day only. Drives the follow-on margin.                             |
| `bowlerLimit`          | `{ maxOvers?, maxBalls? }`                                                                        | T20: 4 overs. ODI: 10. Hundred: 20 balls. Test: none.                    |
| `consecutiveOvers`     | `{ maxConsecutive: 1 }` default                                                                   | Hundred: 2 (a bowler may bowl two consecutive sets of 5).                |
| `wideRuns`             | int, default 1                                                                                    | Penalty for a wide.                                                      |
| `noBallRuns`           | int, default 1                                                                                    | Penalty for a no-ball. ⚠ Some leagues use 2.                             |
| `freeHit`              | `"NONE" \| "ALL_NO_BALLS"`, default `ALL_NO_BALLS` limited                                        | Test default `NONE`.                                                     |
| `noBallByesScoredAs`   | `"BYES" \| "NO_BALLS"`, default `"BYES"`                                                          | ⚠ ICC convention vs Law 21.10 wording. See R-EXT-08.                     |
| `powerplays`           | array of `{ name, fromOver, toOver, mandatory }`                                                  | Informational for the engine (fielding restrictions aren't scored).      |
| `lastManStands`        | bool, default false                                                                               | See R-LMS-\*.                                                            |
| `tieBreaker`           | `"NONE" \| "SUPER_OVER" \| "SUPER_OVER_REPEAT" \| "SUPER_OVER_THEN_BOUNDARY_COUNT" \| "BOWL_OUT"` | Default `SUPER_OVER_REPEAT` for limited overs.                           |
| `superOver`            | `{ balls: 6, wicketsToEnd: 2 }`                                                                   |                                                                          |
| `followOn`             | `{ enabled, margin? }`                                                                            | Margin derived from `maxDays` unless given (R-MD-04).                    |
| `substitutions`        | `{ concussion: bool, impactPlayer: { maxPerTeam } \| null }`                                      |                                                                          |
| `retiredHurtMayReturn` | bool, default true                                                                                |                                                                          |
| `targetRevision`       | `{ strategy: "ARR" \| "MPO" \| "DLS_STANDARD" \| "MANUAL", g50?, tableId? }`                      |                                                                          |
| `boundaryValues`       | `{ four: 4, six: 6 }`                                                                             | Box/indoor cricket variants can override.                                |

**Presets** (`presets.ts`): `TEST`, `FIRST_CLASS_4DAY`, `ODI`, `T20`, `T10`, `HUNDRED`,
`LAST_MAN_STANDS`, `BOX_CRICKET`, `CUSTOM`. A preset is just a `MatchRules` value; there's no
code path specific to a preset.

---

## 3. Events (the input language)

Every event has: `id` (UUIDv7), `seq` (per-match, gapless), `type`, `payload`, `createdBy`,
`deviceId`, `clientTimestamp`, `schemaVersion`. The engine reads only `type`, `payload`, `id`
and `seq`; the rest is metadata.

| Event                | Key payload                                                                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MATCH_STARTED`      | `rules`, `teams[2]` with `playingXI[]`, `substitutes[]`, `captainId`, `wicketKeeperId`                                                                                                                                                                             |
| `TOSS`               | `winnerTeamId`, `decision: BAT \| BOWL`                                                                                                                                                                                                                            |
| `INNINGS_STARTED`    | `battingTeamId`, `strikerId`, `nonStrikerId`, `bowlerId`, `kind: REGULAR \| SUPER_OVER`, `followOn?: bool`                                                                                                                                                         |
| `DELIVERY`           | `runs` (completed), `boundary?: 4\|6`, `extra?: { kind: WIDE \| NO_BALL \| BYE \| LEG_BYE, … }`, `noBallRunsFrom?: BAT \| BYE \| LEG_BYE`, `dismissal?`, `penaltyRuns?`, `overthrow?`, `overMiscount?`, optional detail (`wagon`, `pitch`, `shot`, `deliveryType`) |
| `WICKET`             | Non-delivery dismissals only (ADR-0005 §2): `kind`, `batterId`, `fielderIds?`                                                                                                                                                                                      |
| `BATTER_IN`          | `batterId`, `end: STRIKER \| NON_STRIKER`                                                                                                                                                                                                                          |
| `BOWLER_CHANGE`      | `bowlerId`, `reason: NEW_OVER \| INJURY \| SUSPENDED \| OTHER`                                                                                                                                                                                                     |
| `END_OF_OVER`        | `reason?: MISCOUNT`                                                                                                                                                                                                                                                |
| `PENALTY_RUNS`       | `toTeamId`, `runs` (default 5), `law`, `reason`                                                                                                                                                                                                                    |
| `RETIREMENT`         | `batterId`, `kind: HURT \| OUT \| NOT_OUT`                                                                                                                                                                                                                         |
| `RESUMPTION`         | `batterId` (a retired-hurt batter returns)                                                                                                                                                                                                                         |
| `SUBSTITUTION`       | `kind: CONCUSSION \| IMPACT \| FIELDING`, `outPlayerId`, `inPlayerId`                                                                                                                                                                                              |
| `SWAP_STRIKE`        | Manual override, with `reason`                                                                                                                                                                                                                                     |
| `DECLARATION`        | (current innings)                                                                                                                                                                                                                                                  |
| `FOLLOW_ON`          | `enforced: bool`                                                                                                                                                                                                                                                   |
| `INTERRUPTION`       | `kind: RAIN \| BAD_LIGHT \| LUNCH \| TEA \| STUMPS \| OTHER`, `at` timestamp                                                                                                                                                                                       |
| `PLAY_RESUMED`       | `oversPerInnings?` (revised), `bowlerLimitOvers?` (revised)                                                                                                                                                                                                        |
| `TARGET_REVISED`     | `strategy`, `target`, `overs`, `inputs`, `override: bool`                                                                                                                                                                                                          |
| `INNINGS_ENDED`      | `reason: ALL_OUT \| OVERS \| TARGET \| DECLARED \| FORFEITED \| CONCEDED \| TIME`                                                                                                                                                                                  |
| `SUPER_OVER_STARTED` | `round` (1, 2, …)                                                                                                                                                                                                                                                  |
| `BOWL_OUT_RESULT`    | `winnerTeamId`, `attempts[]` (recorded result; not simulated)                                                                                                                                                                                                      |
| `MATCH_RESULT`       | Result (see §11), `override: bool`                                                                                                                                                                                                                                 |
| `UNDO`               | `targetId`                                                                                                                                                                                                                                                         |
| `CORRECTION`         | `targetId`, `patch`                                                                                                                                                                                                                                                |

---

## 4. Lifecycle & state machine

**R-LC-01** The first event must be `MATCH_STARTED`; `TOSS` must precede the first
`INNINGS_STARTED`.
**R-LC-02** The engine exposes `state.awaiting`, the set of event types accepted next:
`TOSS`, `INNINGS_STARTED`, `BATTER_IN`, `BOWLER_CHANGE`, `DELIVERY`, `END_OF_OVER`,
`MATCH_RESULT`, … Any other event is rejected with `RuleViolation { code, rule, message }`.
**R-LC-03** A rejected event never changes state (atomicity).
**R-LC-04** `applyEvent` is pure and deterministic: same state + same event → structurally
equal state, no clock, no randomness, no I/O.
**R-LC-05** `replay(events)` ≡ folding `applyEvent` over the effective log (after resolving
UNDO/CORRECTION).

---

## 5. Deliveries, runs & boundaries

**R-RUN-01** Runs completed (0–N, any non-negative integer; 5 and 7 are valid) are credited to
the striker and the bowler, and count as balls faced and legal balls.
**R-RUN-02** A boundary scores its allowance (4/6, configurable) instead of runs completed,
unless runs completed _before_ the boundary are greater (Law 19.8).
**R-RUN-03** Overthrow to boundary: runs completed + boundary allowance + the run in progress
if the batters had crossed at the throw (Law 19.8). The scorer enters the total; the engine
records `overthrow: true` for stats and commentary. (2019 World Cup final: 2 + 4 = 6.)
**R-RUN-04** Short runs: the scorer records only the runs that count. Deliberate short running
→ separate `PENALTY_RUNS` to the fielding side.
**R-RUN-05** Team total = Σ batter runs + Σ extras (all kinds incl. penalty). Property-tested.
**R-RUN-06** Dot ball = legal ball with 0 runs to the batter and 0 extras.

## 6. Extras

**R-EXT-01 Wide.** Adds `wideRuns` + runs completed (or the boundary allowance), **all scored as
wides** and charged to the bowler. Not a legal ball; not a ball faced.
**R-EXT-02** Wide that runs to the boundary = `wideRuns` + 4 (= 5 by default).
**R-EXT-03 No-ball.** Adds `noBallRuns` penalty, charged to the bowler. It isn't a legal ball,
but it **is** a ball faced by the striker.
**R-EXT-04** Bat runs off a no-ball are credited to the striker and charged to the bowler.
**R-EXT-05 Byes / leg byes.** Count to the total and extras only, not to the batter or the
bowler. A bye is a legal ball and a ball faced.
**R-EXT-06** Leg byes can't be scored without an attempt to hit or avoid the ball (Law 23.2).
The engine can't know this; it's the umpire's call and isn't validated.
**R-EXT-07** Wide + byes is impossible; runs run off a wide are wides (R-EXT-01).
**R-EXT-08 ⚠** Runs run off a no-ball that didn't hit the bat: with
`noBallByesScoredAs = "BYES"` (ICC convention, default) they're byes/leg byes and _not_
charged to the bowler. With `"NO_BALLS"` (literal Law 21.10 reading) they're no-ball extras.
The no-ball penalty itself is always charged to the bowler.
**R-EXT-09 Penalty runs** (default 5, Law 41) go to the batting side's current innings, or to the
fielding side's **most recent completed innings**. If that side hasn't batted yet, they go to
its next innings (Law 41.17). They're never charged to the bowler or a batter.
**R-EXT-10** Penalty runs on a delivery (e.g. ball hits the fielding side's helmet on the
ground) are in addition to runs completed, and the delivery still counts (or not) as normal.

## 7. Overs & bowlers

**R-OV-01** An over is _due_ after `ballsPerOver` legal balls. Further `DELIVERY` events are
rejected unless flagged `overMiscount: true` (Law 17.5). `END_OF_OVER` is then required.
**R-OV-02** `END_OF_OVER` with fewer legal balls requires `reason: "MISCOUNT"` or an innings-ending
condition.
**R-OV-03** At `END_OF_OVER` the batters change ends (strike swaps), unless the innings has ended.
**R-OV-04 Maiden.** A completed over with zero runs charged to the bowler (byes/leg byes don't
spoil it; wides and no-balls do). Overs cut short or completed by another bowler can't be
maidens.
**R-OV-05** A new over needs `BOWLER_CHANGE`. The bowler must be on the fielding side, not
the bowler of the previous over (with `maxConsecutive: 1`), and must not exceed
`bowlerLimit`.
**R-OV-06 Mid-over change** (injury or suspension, Law 17.8): another bowler completes the
over. That bowler must not have bowled the previous over and can't bowl the next one. Legal
balls are credited to whoever bowled each delivery. A bowler suspended for the innings can't
bowl again in it.
**R-OV-07** Overs notation: `O.B` where B = legal balls in the current over (`12.3`). For the
bowler's figures a partial over is shown the same way. Arithmetic always uses legal balls,
never decimals.
**R-OV-08** Hundred mode: `ballsPerOver = 5`, `consecutiveOvers.maxConsecutive = 2`,
`bowlerLimit.maxBalls = 20`, and overs are displayed as balls (`"67 balls"`).

## 8. Dismissals

| Kind                  | Bowler credited | On wide? | On no-ball / free hit? | Who can be out  | Notes                                       |
| --------------------- | --------------- | -------- | ---------------------- | --------------- | ------------------------------------------- |
| BOWLED                | yes             | no       | no                     | striker         |                                             |
| CAUGHT                | yes             | no       | no                     | striker         | Includes c&b, keeper, substitute fielder    |
| LBW                   | yes             | no       | no                     | striker         |                                             |
| RUN_OUT               | no              | yes      | yes                    | either          | Fielders involved, direct hit, which end    |
| STUMPED               | yes             | yes      | no                     | striker         |                                             |
| HIT_WICKET            | yes             | yes      | no                     | striker         |                                             |
| OBSTRUCTING_THE_FIELD | no              | yes      | yes                    | either          |                                             |
| HIT_BALL_TWICE        | no              | no       | yes                    | striker         |                                             |
| HANDLED_THE_BALL      | no              | yes      | yes                    | either          | Legacy only (pre-2017); allowed if enabled  |
| TIMED_OUT             | no              | —        | —                      | incoming batter | `WICKET` event, no delivery                 |
| RETIRED_OUT           | no              | —        | —                      | either          | `RETIREMENT { kind: OUT }`; counts a wicket |
| RETIRED_HURT          | —               | —        | —                      | either          | Not a wicket; may resume                    |

**R-DIS-01** The engine rejects a dismissal kind not allowed for the delivery type or free-hit
state (table above).
**R-DIS-02** Bowler wickets increase only for credited kinds.
**R-DIS-03** `CAUGHT` requires a fielder id from the fielding side (substitutes included). If
the fielder is the bowler, it renders as "c & b".
**R-DIS-04** `STUMPED` requires the designated wicket-keeper (keeper changes are tracked via
`SUBSTITUTION`/`MATCH_STARTED` metadata).
**R-DIS-05 Run out.** Payload: `batterId` (who is out), `runsCompleted` (count), `end`
(STRIKER/NON_STRIKER: which wicket was broken), `fielderIds[]`, `directHit`. Runs completed
before the run out count. On a no-ball the penalty still counts. The not-out batter stays at
the end they reached, and the new batter goes to the vacant end.
**R-DIS-06 Caught, new batter on strike.** After a catch, the incoming batter takes strike,
whether or not the batters crossed (Law 18.11, 2022), unless the catch was the last ball of
the over.
**R-DIS-07** Other striker dismissals (bowled, LBW, stumped, hit wicket): the incoming batter
takes strike, unless it was the last ball of the over.
**R-DIS-08** Run out of the non-striker before the delivery (Law 38.3) is a `WICKET` event. It's
not a ball, the bowler isn't credited, and the over count doesn't change.
**R-DIS-09** After any wicket the engine requires `BATTER_IN` (unless the innings has ended).
The incoming batter must be from the batting XI (or an eligible substitute, §12), not
already dismissed, and not currently batting.
**R-DIS-10 Timed out**: the incoming batter is out without facing; recorded via `WICKET`
after (instead of) `BATTER_IN`.
**R-DIS-11** Fall of wicket records `{ wicketNo, score, overs (legal balls), batterId, partnership }`.

## 9. Strike rotation

**R-STR-01** Odd runs completed swap strike; even don't. Boundary allowances don't swap
strike unless runs completed before the boundary were odd and exceeded the allowance
(R-RUN-02).
**R-STR-02** Wides: runs _completed_ (excluding the penalty) decide rotation. A wide to the
boundary doesn't swap.
**R-STR-03** No-balls: runs completed (bat or byes) decide rotation; the penalty doesn't.
**R-STR-04** Byes / leg byes rotate by runs completed.
**R-STR-05** `END_OF_OVER` swaps (R-OV-03). An odd run off the last ball followed by the end
of over therefore leaves the original striker on strike.
**R-STR-06** `SWAP_STRIKE` is a manual override and records a reason for the audit trail.
**R-STR-07** Dismissal strike handling per R-DIS-05..07.

## 10. Innings & match structure

**R-INN-01** Playing XI: exactly `playersPerSide` players per side; substitutes listed
separately. Captain and keeper must be in the XI.
**R-INN-02** The innings ends automatically (the engine sets `awaiting: INNINGS_ENDED`
proposal with reason) when:

- all out: wickets = `playersPerSide − 1`, or no eligible batter remains (retired hurt who
  can't resume, absent hurt);
- overs complete (`oversPerInnings` × `ballsPerOver` legal balls, after any revision);
- target reached (chasing side's total ≥ target);
- super over: `wicketsToEnd` wickets or `superOver.balls` legal balls.

**R-INN-03** `INNINGS_ENDED` with `DECLARED` is valid only in multi-day, and only for the
batting side. With `FORFEITED` or `CONCEDED` it's valid at innings start or anytime
respectively.
**R-INN-04** Legal balls in an innings never exceed `oversPerInnings × ballsPerOver`
(property-tested), except for recorded miscounts.
**R-INN-05** Wickets never exceed `playersPerSide − 1` (or `playersPerSide` in LMS;
property-tested).
**R-INN-06** Batting order is free: any eligible player may come in (R-DIS-09). The order of
appearance is recorded.
**R-INN-07** Target for the side batting last = opponent aggregate − own previous
aggregate + 1 (limited overs: opponent total + 1), or as revised (§13).

### Multi-day

**R-MD-01** `inningsPerSide = 2`: the order is A, B, A, B, unless the follow-on is enforced
(A, B, B, A).
**R-MD-02** Declarations (R-INN-03); forfeit of an innings (Law 15) is allowed.
**R-MD-03** Draw when time expires (`MATCH_RESULT { kind: DRAW }`) with the result undecided.
**R-MD-04 Follow-on** (Law 14): available when the side batting second in a two-innings match
trails by at least 200 runs (5+ day match), 150 (3–4 days), 100 (2 days) or 75 (1 day). The
margin comes from the days remaining when play actually began (Law 14.1.2), or `followOn.margin`
if configured. The engine sets `followOnAvailable`; `FOLLOW_ON { enforced }` decides.
**R-MD-05** Win by an innings: if the side batting first in a two-innings match isn't required
to bat again, the result is "won by an innings and N runs".
**R-MD-06** Days and sessions are tracked from `INTERRUPTION`/`PLAY_RESUMED` (STUMPS, LUNCH,
TEA) for display only; the engine doesn't enforce session lengths.

### Last Man Stands

**R-LMS-01** With `lastManStands`, the innings continues when one batter remains: there's no
non-striker, that batter keeps strike, and odd runs don't rotate.
**R-LMS-02** All out = `playersPerSide` wickets.
**R-LMS-03** Run outs can happen at either end. The scorer must give the end.

## 11. Results

**R-RES-01** Chasing side passes target → "won by W wickets", where W = `playersPerSide − 1 −
wickets lost` (LMS: `playersPerSide − wickets`). Limited overs: plus "(B balls remaining)".
**R-RES-02** Side batting last falls short → "won by R runs", where R = target − 1 − chasing total
(with a revised target, the revised one; label "(DLS method)" when that strategy applied).
**R-RES-03** Scores level at the end of the match → **tie**, then tie-breaker per config:
`SUPER_OVER` (one; if it's tied, the match is tied), `SUPER_OVER_REPEAT` (repeat until there's
a result), `SUPER_OVER_THEN_BOUNDARY_COUNT` (legacy 2019 rule: tied super over → more
boundaries in match + super over), `BOWL_OUT` (result recorded), `NONE` (tie stands).
**R-RES-04** Multi-day: tie only when the side batting last is all out with scores level
(Law 16.4); otherwise a draw at time.
**R-RES-05** Non-playing results set by `MATCH_RESULT`: `NO_RESULT`, `ABANDONED`, `FORFEIT`
(walkover; winner given), `AWARDED` (by officials; winner given), `CONCEDED`.
**R-RES-06** Every `MATCH_RESULT` is checked against the computed result. A mismatch is rejected
unless `override: true` (officials' decision, audited).

## 12. Substitutions & retirements

**R-SUB-01 Fielding substitute**: may field (and take catches) but can't bat, bowl or keep
(keeping is allowed under current ICC conditions with umpire consent; configurable).
**R-SUB-02 Concussion replacement** (when enabled): like-for-like replacement. The replaced
player takes no further part. The replacement takes over the replaced player's eligibility:
if the replaced player had been dismissed, the replacement can't bat in that innings; if they
were not out, the replacement may bat. The replacement may bowl any remaining overs, but the
over quota counts the replaced player's overs already bowled.
**R-SUB-03 Impact player** (when enabled, `maxPerTeam`): replaces any XI player. The replaced
player takes no further part. ⚠ Batting is capped at `playersPerSide` distinct batters per
innings (IPL rule); bowling quota per player is unchanged.
**R-SUB-04 Retired hurt**: not out, not a wicket. The batter may resume (`RESUMPTION`) when a
wicket falls or another batter retires. If they can't, they show as "retired not out" and
count as unavailable for all-out purposes.
**R-SUB-05 Retired out**: counts as a wicket, not credited to the bowler.

## 13. Interruptions & target revision

**R-TR-01** `INTERRUPTION` stops play. `PLAY_RESUMED` may reduce `oversPerInnings` for one or
both innings and reduce bowler quotas proportionally. The quota reduction is
`ceil(newOvers / 5)` for a 50-over match (⚠ playing-condition dependent; the value comes from
config).
**R-TR-02** `TargetRevisionStrategy` interface:
`revise(ctx: { firstInnings, secondInnings, interruptions, rules }) → { target, overs, par(ballsBowled, wicketsLost) }`.
**R-TR-03 ARR** (average run rate): target = floor(team1 runs × revisedOvers2 / overs1) + 1.
**R-TR-04 MPO** (most productive overs): target = Σ of team 1's highest-scoring N overs + 1,
where N = revised overs for team 2.
**R-TR-05 DLS Standard-style**: resources from the configured table (ADR-0013).
`R1`, `R2` = resources available to team 1 and 2. If `R2 < R1`: `T = floor(S × R2/R1) + 1`.
If `R2 > R1`: `T = floor(S + G × (R2 − R1)/100) + 1`, where `G` = `rules.targetRevision.g50`.
The table and G are inputs; the engine never embeds an official table.
**R-TR-06** Par score at any point is exposed for display: the score at which the chasing side
would win if no more play were possible.
**R-TR-07 Manual override**: `TARGET_REVISED { override: true }` is accepted as given.
**R-TR-08** A match is a no result if the minimum overs for a result (config, e.g. 5 in T20,
20 in ODI) weren't possible for the side batting second.

## 14. Undo & corrections

**R-UNDO-01** `UNDO { targetId }` must target the latest _effective_ event; otherwise it's
rejected.
**R-UNDO-02** `replay(log + UNDO(e))` ≡ `replay(log without e)` (property-tested).
**R-UNDO-03** Redo = `UNDO` of the `UNDO`; `replay(log + UNDO(e) + UNDO(UNDO(e)))` ≡
`replay(log)` (property-tested).
**R-UNDO-04** `MATCH_STARTED` can't be undone; abandon the match instead.
**R-COR-01** `CORRECTION { targetId, patch }`: the patch is validated per event type (e.g.
DELIVERY: `dismissal.fielderIds`, `runs`, `extra`, detail fields). The corrected log must
replay without violations; otherwise the correction is rejected with the first failing `seq`.
**R-COR-02** Corrections of corrections apply in `seq` order (last writer wins per field).

## 15. Derived metrics (exposed by the engine)

| Metric                 | Formula / rule                                                                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strike rate            | 100 × runs / balls faced (balls faced includes no-balls, excludes wides)                                                                                                                                                          |
| Economy                | bowler runs / (legal balls / ballsPerOver)                                                                                                                                                                                        |
| Bowling average        | bowler runs / credited wickets (career, Phase 5)                                                                                                                                                                                  |
| Batting average        | runs / dismissals (not outs and retired hurt excluded; career, Phase 5)                                                                                                                                                           |
| Run rate               | team runs / (legal balls / ballsPerOver)                                                                                                                                                                                          |
| Required run rate      | runs needed / (balls remaining / ballsPerOver)                                                                                                                                                                                    |
| Projected score        | current runs + current RR × overs remaining; also at RR = current ±1, ±2 and fixed 6, 8, 10                                                                                                                                       |
| Partnerships           | per wicket: runs (incl. extras), balls (legal), each batter's contribution                                                                                                                                                        |
| Dot ball %, boundary % | per batter and per bowler                                                                                                                                                                                                         |
| Balls per boundary     | balls faced / (4s + 6s)                                                                                                                                                                                                           |
| Maidens                | R-OV-04                                                                                                                                                                                                                           |
| Bowler wides / NBs     | counts of deliveries (not runs)                                                                                                                                                                                                   |
| Net run rate           | (Σ runs scored / Σ overs faced) − (Σ runs conceded / Σ overs bowled). A side **all out counts as having faced its full quota of overs**. With revised overs, the revised quota is used. No-result/abandoned matches are excluded. |

NRR is a pure helper over completed match summaries. It ships in Phase 1 because it's an
engine-level formula; the points table that uses it is Phase 6.

## 16. Invariants (property tests)

1. Team total = Σ batter runs + Σ extras (R-RUN-05).
2. Σ bowler runs + byes + leg byes + penalty runs = team total (with `noBallByesScoredAs` taken into account).
3. Legal balls ≤ quota (R-INN-04); wickets ≤ limit (R-INN-05).
4. Determinism: `replay(log)` deep-equals `replay(log)`, and also the incremental fold.
5. Snapshot equivalence: `replayFrom(snapshot at seq k, log[k+1..])` ≡ `replay(log)`.
6. Undo / redo (R-UNDO-02, R-UNDO-03).
7. Striker ≠ non-striker; both are in the batting XI and not dismissed.
8. Σ partnership runs = team total (penalty runs between deliveries belong to the current
   partnership). Number of FoW entries = wickets.
9. Bowler legal balls sum = innings legal balls.
