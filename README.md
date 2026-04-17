# NBA Commish Sim

A deep NBA management sim with two modes: **Commissioner** (control the entire league) and **GM** (manage one team). Built with React + TypeScript + Tailwind. LLM narrative via Gemini.

## Run Locally

```bash
npm install
echo "GEMINI_API_KEY=your_key" > .env.local
npm run dev
```

---

## Game Modes

| Mode | You Control | Status |
|------|------------|--------|
| **Commissioner** | Entire league — rules, suspensions, trades, economy, narrative | Live |
| **GM** | One team — roster, trades, free agency, draft | Planned |

See: [`COMMISSIONER_MODE_README.md`](./COMMISSIONER_MODE_README.md) | [`GM_MODE_README.md`](./GM_MODE_README.md)

---

## Architecture Overview

### State Model

All game state lives in a single `GameState` object (`src/types.ts`). No database — everything is in-memory with localStorage save/load.

```
state.players[]     — ALL players (NBA + external leagues + retired + prospects)
state.teams[]       — 30 NBA teams
state.nonNBATeams[] — External league teams (Euroleague, PBA, G-League, etc.)
state.schedule[]    — Current season game schedule
state.boxScores[]   — Game results with per-player stats
state.leagueStats   — Salary cap, rules, year, economy settings
state.allStar       — All-Star Weekend state (cleared at rollover)
state.playoffs      — Playoff bracket (cleared at rollover)
state.history[]     — Transaction log (signings, trades, waivers)
state.news[]        — News feed items
```

**Key rule:** Players link to teams via `player.tid`. Never read `team.players` — it doesn't exist.

### Simulation Engine

| Gap | Engine | UI |
|-----|--------|----|
| **1 day** | `processTurn` → `runSimulation` | Game results modal |
| **2-30 days** | `processTurn` → `runSimulation` (batch) | Game results modal |
| **30+ days** | `runLazySim` (iterative, day-by-day) | Progress overlay |

Both paths use `runLazySim` as the unified engine. Single source of truth.

**To add a calendar event:** Add to `buildAutoResolveEvents()` in `lazySimRunner.ts`.

### File Structure

```
src/
  components/
    actions/          — Commissioner action UI
    central/view/     — Main views (PlayerBio, TradeFinderView, etc.)
    commissioner/     — Dashboard, Rules, Viewership
    draft/            — DraftSimulatorView
    layout/           — MainContent.tsx (tab routing)
    modals/           — TradeMachineModal, SettingsModal, etc.
    playoffs/         — PlayoffView, BracketLayout
    schedule/         — ScheduleView, AllStarDayView
    sidebar/          — NavigationMenu
    shared/           — PlayerPortrait, reusable UI
    team-stats/       — TeamStatsView
  services/
    simulation/       — GameSimulator engine, StatGenerator, knobs
    logic/            — seasonRollover, lazySimRunner, autoResolvers
    playerDevelopment/ — ProgressionEngine, retirementChecker, breakouts
    allStar/          — All-Star Weekend orchestration
    llm/              — Gemini integration (prompts, generators)
    social/           — Social media post generation
  store/
    GameContext.tsx    — State store, action dispatch, LOAD_GAME
    logic/            — gameLogic, initialization, actionProcessor
  types.ts            — All TypeScript interfaces
  constants.ts        — League constants, salary scales, external league config
  utils/              — helpers, dateUtils, salaryUtils
```

---

## Rating Scales (CRITICAL)

Two scales coexist. Confusing them breaks everything.

| Scale | Range | Where Used | Example |
|-------|-------|-----------|---------|
| **BBGM raw** | 35-82 practical | `player.overallRating`, retirement, progression | LeBron ~78, bench ~50 |
| **K2 (2K-style)** | 66-99 | Display, salary tiers, external routing | LeBron ~97, bench ~75 |

**Conversion:** `K2 = 0.88 * BBGM + 31` (via `convertTo2KRating(ovr, hgt, tp)`)

**Rule:** Any threshold `>= 85` BBGM is dead code. Use 65-72 for star, 55-64 for starter. Always document which scale.

---

## Common Pitfalls

### Players & Teams
- `state.players` is the ONLY player source. `team.players` doesn't exist.
- `player.tid === -1` = Free Agent, `tid === -2` = Draft Prospect, `tid >= 100` = External league
- Rebounds: always `s.trb ?? s.reb ?? ((s.orb ?? 0) + (s.drb ?? 0))`
- Current season stats: filter `s.season === year && !s.playoffs`, reduce to highest `gp` entry (handles mid-season trades)
- `NBATeam.name` already includes city ("Oklahoma City Thunder"). Don't concat `region + name`.

### Contracts & Economy
- Contract amounts in BBGM thousands (3200 = $3.2M). Salary utils use USD.
- `EXTERNAL_SALARY_SCALE` in constants.ts — salary ranges per external league
- MLE availability: `getMLEAvailability()` in AIFreeAgentHandler
- Cap thresholds: `getCapThresholds()` from salaryUtils

### Season Flow
- Rollover fires Jun 30 (`shouldFireRollover`). Must run in BOTH `simulationHandler` AND `lazySimRunner`.
- Rollover MUST return `schedule: []` to clear old games.
- `allStar` and `playoffs` cleared at rollover. Exhibition box scores (negative team IDs) pruned.
- Options processed Jun 29 → FA signings Jul 1+ → External routing Oct 1
- `draftComplete` boolean — cleared at rollover, set by DraftSimulatorView

### External Leagues
- TID offsets: Euroleague +1000, PBA +2000, WNBA +3000, B-League +4000, Endesa +5000, G-League +6000, CBA +7000, NBL +8000
- See [`EXTERNAL_ROSTERS.md`](./EXTERNAL_ROSTERS.md) for full integration guide

### UI
- All-Star teams use negative IDs (-1/-2 East/West, -3/-4 Rising Stars, -5/-6 Celebrity)
- `resolveTeam(tid)` handles NBA + nonNBA + negative IDs
- Image priority: `player.imgURL` → NBA CDN → initials. External players skip CDN.
- Image cache: IndexedDB blob cache, toggled in Settings > Performance

---

## Key Documents

| Document | Purpose |
|----------|---------|
| [`COMMISSIONER_MODE_README.md`](./COMMISSIONER_MODE_README.md) | Commissioner features — actions, LLM, economy, club debuffs |
| [`GM_MODE_README.md`](./GM_MODE_README.md) | GM Mode implementation plan — phases, file changes, pitfalls |
| [`EXTERNAL_ROSTERS.md`](./EXTERNAL_ROSTERS.md) | External league integration — TID offsets, scaling, checklist |
| [`LEAGUE_RULES_README.md`](./LEAGUE_RULES_README.md) | Wiring commissioner rules to sim engine |
| [`AI_AND_ECONOMY_PLAN.md`](./AI_AND_ECONOMY_PLAN.md) | AI trade engine + economy design |
| [`TODO.md`](./TODO.md) | Active bugs, verify-on-new-save, feature backlog |
| [`NEW_FEATURES.md`](./NEW_FEATURES.md) | Feature ideas and aspirational features |
| [`CHANGELOG.md`](./CHANGELOG.md) | Historical bug fixes and session notes |
| [`teamoffice.md`](./teamoffice.md) | Team Office integration plan |

---

## Player Portrait Priority

1. `player.imgURL` (BBGM gist) — canonical for all leagues
2. NBA CDN (`cdn.nba.com`) — NBA players without imgURL only
3. Initials avatar — fallback

Image cache (`src/services/imageCache.ts`) pre-downloads all portraits to IndexedDB on game load.

Key files: `bioCache.ts` (`getPlayerImage`), `PlayerPortrait.tsx`, `PlayerBioHero.tsx`

---

## Investigation Findings

Non-obvious facts. Read before touching these areas.

- `historicalAwards` has TWO schemas: BBGM format (no `type` field) and flat format (`type: 'MVP'`). Distinguish by `!!a.type`.
- `state.staff.gms` keyed by team name, not tid.
- `playoffRoundsWon` NOT auto-updated by sim — must be explicitly set in lazySimRunner.
- `extractNbaId(imgURL, name)` — pass name as 2nd arg to enable `NAME_TO_ID` lookup.
- Retired players: `tid === -1`, full `stats[]` intact. Career team = most GP by tid.
- `GameResult` lives in TWO files: `src/types.ts` AND `src/services/simulation/types.ts`. Update both.
- `playerDNPs` stores DNP reason at sim time — prefer over current `player.injury` state.

---

*Last updated: 2026-04-17 (session 23)*
