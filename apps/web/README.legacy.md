# Crease - Cricket Scoring App

A fast, mobile-first cricket scorer built with **Next.js 16**, **React 19**, **TypeScript** and **Tailwind CSS 4**. Score a match ball by ball with one tap per delivery, and get a full scorecard and result. Everything is saved in the browser, so it works with no account, no server and no signal at the ground.

> This project was originally a Spring Boot + MySQL backend (a `Team` REST API). It has been rewritten as a Next.js app; the `Team` entity (name, location) lives on as teams with squads, short names and colours.

## Features

- **Teams & squads** - create, edit and delete teams; add players one by one or paste a whole list; one-click sample teams to try it out.
- **Match setup** - pick two teams, overs per innings (presets or custom, 1-50), the playing squads (2-11 players, in batting order), venue, toss winner and decision.
- **Live scoring**
  - One-tap keypad for dot, 1, 2, 3, 4, 6 (plus 5 or 7 for overthrows)
  - Extras: wides (+ runs), no-balls (+ runs off the bat), byes and leg byes
  - Wickets: bowled, caught, LBW, run out (striker or non-striker, with runs completed), stumped, hit wicket - with the fielder
  - Free hit after a no-ball (only a run out is allowed)
  - Automatic strike rotation, end of over, end of innings (all out, overs complete, target reached) and manual "end innings"
  - A bowler can't bowl consecutive overs
  - Live run rate, target, runs/balls needed and required rate, partnership, this-over ball strip
  - **Undo** for any entry, restoring the exact previous state
- **Scorecard** - batting (dismissals like `c Smith b Jones`), bowling (O-M-R-W, economy, wides/no-balls), extras breakdown, fall of wickets, did not bat, over-by-over history.
- **Result** - winner and margin ("won by 6 runs", "won by 4 wickets (8 balls left)", tie) with top batters and bowlers.
- **Match history** - in-progress and completed matches, filterable, resumable at any time.
- Light and dark mode, keyboard and screen-reader friendly, installable-feeling mobile layout with a bottom tab bar.

## How it works

The match stores only what the scorer entered - an ordered list of events (`startInnings`, `ball`, `newBatter`, `newBowler`, `swapStrike`, `endInnings`). Every total, figure and scorecard is **derived** by replaying those events in a pure TypeScript engine (`lib/cricket/engine.ts`). That keeps the laws of the game in one tested place and makes undo exact: it simply drops the last event.

```
app/                Next.js routes (App Router, Cache Components)
  page.tsx          Home
  teams/            Teams & squads
  matches/          Match list, new-match wizard, /matches/[id] scoring
components/         UI primitives, app shell, navigation
features/           Screens: home, teams, matches, scoring (keypad, pickers, scorecard, result)
lib/cricket/        Domain types, scoring engine (+ tests), formatting
lib/store.ts        Local-first persistence (localStorage, synced across tabs)
```

## Getting started

Requires **Node.js 20.9+**.

```bash
npm install
npm run dev        # http://localhost:3000
```

| Script                               | What it does                       |
| ------------------------------------ | ---------------------------------- |
| `npm run dev`                        | Development server                 |
| `npm run build` / `npm start`        | Production build / serve it        |
| `npm test`                           | Scoring-engine unit tests (Vitest) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript                |
| `npm run check`                      | Lint + typecheck + tests           |

## Data

Matches and teams are stored in your browser's `localStorage` on the device you score on. Clearing site data removes them. A server database (e.g. Postgres) can be added later behind `lib/store.ts` without touching the engine or the UI.

## Deploy

Works out of the box on [Vercel](https://vercel.com/new) - no environment variables needed.
