# Multi-Season Readiness TODO

> Last updated: 2026-04-01
> Goal: make the sim loop through full seasons without crashing, losing data, or relying on hardcoded 2025/2026 strings.

---

## 0. Season Config — No More Hardcoded Dates

**Problem:** `START_DATE_STR = '2025-08-01'`, `currentSeason = 2026` (postProcessor.ts:60), `season: state.leagueStats.year` — all date/season references baked into source.

**Target system:** Everything derives from `leagueStats.year` (the season year = year the season *ends*). Dates use month + ordinal + day-of-week pattern: "3rd Tuesday of October" instead of "Oct 22, 2025".

### Tasks

- [ ] **`src/constants.ts`** — Remove `START_DATE_STR`. Add `SEASON_YEAR_OFFSET = 1` (season year = calendar year + 1 if month < 7). Replace fixed `[10, 24]` offsets in `SEASON_DATES` with named ordinals:
  ```ts
  // Instead of: start: [10, 24]
  // Use:        start: { month: 10, ordinal: 4, day: 'Tue' }
  ```
- [ ] **`src/utils/dateUtils.ts`** (new file) — `resolveSeasonDate(seasonYear, month, ordinal, day): Date`. Given season year 2027, month=10, 4th Tuesday → finds actual calendar date. No string literals in output; format via `Intl.DateTimeFormat`.
- [ ] **`src/store/initialState.ts`** — Derive `date` from `leagueStats.year`, not `START_DATE_STR`.
- [ ] **`src/store/logic/turn/postProcessor.ts:60`** — Replace `const currentSeason = 2026` with `const currentSeason = state?.leagueStats?.year ?? players[0]?.stats?.at(-1)?.season ?? new Date().getFullYear()`.
- [ ] **`src/store/logic/gameLogic.ts`** — Audit all `new Date('2025-...')` and `new Date('2026-...')` literals. Replace with `resolveSeasonDate(leagueStats.year, ...)`.
- [ ] **`src/store/logic/initialization.ts`** — Same audit.
- [ ] **Search sweep**: `grep -r "2025\|2026" src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules\|\.snap"` — fix every hit.

---

## 1. Season Rollover Pipeline

Fires when `phase === 'Free Agency'` ends (or user triggers "Advance to Next Season").

### Tasks

- [ ] **Archive season stats** — for each player, mark their current-season stat row as finalized (`finalized: true`). Do NOT delete — used for career history.
- [ ] **Reset per-season accumulators** — `gp, pts, ...` do not reset; a new stat entry with `season = leagueStats.year + 1` will be created organically on first game. Confirm `postProcessor.ts` will not re-use the old row (it uses `findIndex` by season, so just incrementing `leagueStats.year` is enough).
- [ ] **Increment `leagueStats.year`** — `+1` in the rollover action. This cascades through all date/schedule generation automatically once the date system is fixed.
- [ ] **Clear transient state** — reset `schedule`, `boxScores`, `christmasGames`, `allStar`, `bets` with expired expiryDate, clear `pendingHypnosis`, clear `pendingClubDebuff`.
- [ ] **Regenerate schedule** — call existing schedule generator with new season year. Confirm it uses `leagueStats.year`, not a hardcoded year.
- [ ] **Reset injuries** — `gamesRemaining > 0` players: keep injury type but recalc if it spans off-season. (Simple rule: if gamesRemaining > 20 at season end, carry forward as "recovering from off-season surgery".)
- [ ] **Draft picks bookkeeping** — picks with `season === oldYear` that were traded but never used: expire them (warn user). Picks with `season === newYear` become available for draft.
- [ ] **Rollover action** — add `ADVANCE_SEASON` to `ActionDistributor.ts`. It's the only place season increment happens.

---

## 2. Draft System

> User is building the **Draft Lottery UI** and **Draft UI** separately. This section covers the data/logic layer only.

### 2a. Draft Lottery

- [ ] **Standings snapshot** — at end of regular season, freeze a `lotteryStandings` object: `{tid, wins, losses, lotteryOdds}[]`. Use real NBA 2019 lottery odds (14 teams, top 4 picks lotteried).
- [ ] **`runDraftLottery(lotteryStandings): DraftLotteryResult[]`** — pure function, no side effects. Returns ordered pick assignments.
- [ ] **Store result** — save to `GameState.draftLotteryResult` (new field). UI reads this for the draft lottery reveal screen.
- [ ] **Assign picks** — after lottery, update `draftPicks` ownership: the team that holds the pick (may be a traded pick) gets the slot number.

### 2b. Draft Class Generation (BBGM pattern)

Reference: `getDraftProspects` in BBGM `worker/core/draft/` (provided by user).

- [ ] **`src/services/draft/DraftClassGenerator.ts`** (new file)
  - Input: `seasonYear`, `numPicks` (60 for 2-round), `existingPlayers: Player[]`
  - Size normalization: always generate exactly `numPicks` prospects (BBGM uses `~70` to allow for pre-draft cuts).
  - `randomDebuts`: each prospect has a `draftYear = seasonYear`. Never re-use.
  - Slug deduplication: check `existingPlayers` for name collisions; append `Jr.` or suffix.
  - Age: round 1 picks age 18-21 (lottery), round 2 age 19-23 (spread wider).
  - Ratings: use existing `RatingGenerator` if it exists, or a simple normal-distribution around `[45, 65]` OVR for round 1, `[35, 55]` for round 2.
  - Tag each generated player: `{ ..., draftInfo: { year: seasonYear, round, pick, college?, country? } }`.
- [ ] **Pre-draft period** — at `phase === 'Draft'` start, load `draftClass` from `GameState.draftClass` (pre-generated) into a visible prospect list. User can scout.
- [ ] **Draft pick execution** — `EXECUTE_DRAFT_PICK` action: removes from `draftClass`, adds to team roster with a rookie contract (scale based on pick slot, using existing rookie contract settings).
- [ ] **Undrafted free agents** — after 60 picks, remaining `draftClass` members become `undraftedFreeAgents`; teams can sign them at minimum.

### 2c. Draft Files to Reference

Key BBGM files (from provided source snippets):
- `worker/core/draft/getDraftProspects.ts` — class generation logic
- `worker/core/draft/runLottery.ts` — lottery math
- `worker/views/draftLottery.ts` — UI data shape
- `worker/views/draft.ts` — pick state

---

## 3. Player Progression & Regression

Without this, rosters become stale after season 2 (everyone stays at their 2025-26 rating forever).

### Tasks

- [ ] **`src/services/playerDevelopment/ProgressionEngine.ts`** (new file)
  - Runs once per season rollover (called inside `ADVANCE_SEASON`).
  - **Young players (age ≤ 24):** each rating has a `+[0, 6]` growth roll, weighted by position archetype. Stars grow faster.
  - **Prime players (25-29):** `±[0, 2]` variance. Minor growth or plateau.
  - **Veterans (30-34):** `±[-3, 1]`. Decline curve begins. Athleticism (`spd`, `jmp`) drops first.
  - **Old veterans (35+):** `[-5, -1]` per year. IQ (`iq`, `fg`) holds longer than athleticism.
  - Clamp all ratings to `[20, 99]`.
  - Overall (`ovr`) recalculated from weighted position formula after ratings change.
- [ ] **Injury history modifier** — players with `injury.gamesRemaining > 30` in the past season take an extra `[-2, 0]` hit to athleticism ratings.
- [ ] **Breakout flag** — 5% chance per young player to get a "breakout" modifier: `+8` to one key rating. Creates a news headline.
- [ ] **Retire detection** — if `age > 37` AND `ovr < 65`, roll retire probability (increases with age). Retired players move to `retiredPlayers[]` (new `GameState` field), removed from active rosters.
- [ ] **HOF eligibility** — `hofActions.ts` already exists; trigger HOF check on retired players with career stats meeting thresholds.

---

## 4. Contract Expiry & Free Agency

### 4a. Contract Expiry

- [ ] At season rollover: decrement `contractLength` on each player. Players with `contractLength === 0` become free agents.
- [ ] Bird Rights: track `yearsWithTeam` per player. If ≥ 3 and `birdRightsEnabled`, mark `hasBirdRights: true`.
- [ ] Restricted free agents: rookies completing their 4-year deal are RFAs. Tag them in `freeAgencyStatus: 'restricted'`.
- [ ] Team options: if `playerOptionsEnabled` and player has `hasPlayerOption: true` on expiring year, player chooses (simple AI: opts in if `marketValue > contractAmount * 0.9`).

### 4b. Free Agency

- [ ] **`src/services/freeAgency/FreeAgencyEngine.ts`** (new file)
  - On `phase === 'Free Agency'` start: collect all `contractLength === 0` players into `freeAgents[]`.
  - Teams with cap space make offers. AI teams prioritize by: need (position scarcity), finances, team OVR.
  - Each "day" of free agency, one AI signing resolves. User can intervene via existing Force Sign action.
  - After July 31 (`phase` ends): remaining free agents stay unsigned (available as mid-season signings).
- [ ] **Salary cap refresh** — at season rollover, recalculate team payrolls. `salaryCap` optionally inflates by `+3%/year` (toggle in league settings).
- [ ] **Rookie contracts** — generated at draft, use existing `rookieScaleType` and `rookieContractLength` settings.

---

## 5. Season Preview UI

Reference: BBGM `SeasonPreview` (provided by user).

### Tasks

- [ ] **`src/components/seasonPreview/SeasonPreviewModal.tsx`** — shows after `ADVANCE_SEASON`, before new season begins:
  - Offseason summary: trades, signings, draft results
  - Each team's projected OVR (avg of top 8 players)
  - Predicted finish: simple sort by OVR with mild randomness
  - "Begin Season" button triggers schedule generation + closes modal
- [ ] **`src/components/offseason/OffseasonTimeline.tsx`** — step-through UI: Draft → Free Agency → Training Camp → Season Preview → Begin Season
- [ ] **Key data shape** (mirrors BBGM `SeasonPreview`):
  ```ts
  interface SeasonPreviewData {
    seasonYear: number;
    teams: { tid: number; name: string; ovr: number; projectedRecord: [number,number]; additions: string[]; departures: string[]; }[];
    draftResults: { pick: number; round: 1|2; name: string; tid: number; }[];
    majorSignings: { name: string; teamName: string; years: number; aav: number; }[];
    majorTrades: { summary: string; }[];
  }
  ```

---

## 6. Stat History & Legacy

- [ ] **Career stats** — `player.stats[]` already accumulates by season. Need a `career` computed view: `career.pts = sum(stats[].pts)`, etc. Add a `computeCareerStats(player)` util.
- [ ] **Season archives** — `GameState.seasonHistory[]` (new field): snapshot of `{year, champion, mvp, roty, ...}` after each Finals. Feeds legacy/HOF screens.
- [ ] **Transactions log** — `GameState.transactions[]` already used (TransactionsView). Ensure rollover does NOT clear it — it's a permanent log. Partition display by `season` in the UI.

---

## 7. Known Hardcoded Values to Hunt Down

Run this after every session to catch regressions:

```bash
grep -rn "2025\|2026\|2027\|START_DATE_STR\|currentSeason = 20" src/ --include="*.ts" --include="*.tsx"
```

| File | Line | Value | Fix |
|------|------|-------|-----|
| `src/constants.ts` | 15 | `START_DATE_STR = '2025-08-01'` | derive from `leagueStats.year - 1` |
| `src/store/logic/turn/postProcessor.ts` | 60 | `const currentSeason = 2026` | use `leagueStats.year` from state |
| `src/store/initialState.ts` | 5,27,28,57 | `new Date(START_DATE_STR)` | use `resolveSeasonDate()` |
| `src/store/logic/initialization.ts` | TBD | any `2025`/`2026` strings | audit |
| `src/store/logic/gameLogic.ts` | TBD | any `2025`/`2026` strings | audit |

---

## 8. Multi-Season Checklist (Season → Season)

Use this at the start of each new season to verify nothing is broken:

- [ ] `leagueStats.year` incremented correctly (+1)
- [ ] `schedule` regenerated for new year (no games from old season remain)
- [ ] All players have a fresh `stats` entry with new `season` year after first game
- [ ] No player has `contractLength < 0` (expiry logic ran)
- [ ] Draft class generated and stored in `GameState.draftClass` (60 players)
- [ ] Draft lottery result assigned (all 30 teams have a first-round pick)
- [ ] `boxScores` cleared (or partitioned by `season`)
- [ ] `allStar` reset to `undefined`
- [ ] `bets` — expired bets pruned
- [ ] HOF check ran for any retired players
- [ ] Season preview shown to user before first game

---

---

## 9. Economy Inflation System (BBGM-style)

> Finances are already well-structured (salary cap, luxury tax, aprons, rookie/max scales are all in `leagueStats`). Inflation is a yearly randomizer on top of that.

### How it works (BBGM model)
Each year before the draft, pick a truncated Gaussian value for cap inflation and apply it to all financial figures:

```
Inflation % ~ TruncGaussian(mean=μ, std=σ, min=minPct, max=maxPct)
```

All of these scale together:
- `salaryCap`
- `luxuryPayroll` (luxury tax threshold)
- `minContract`
- `maxContract` (computed as % of cap — already dynamic in our system)

### Tasks

- [ ] **League Settings toggle** — add "Financial Inflation" section to league rules UI (same area as salary cap settings). Fields:
  ```
  inflationEnabled: boolean        // default: true
  inflationMin: number             // % floor, e.g. 0
  inflationMax: number             // % ceiling, e.g. 8
  inflationAverage: number         // μ, e.g. 3.5
  inflationStdDev: number          // σ, e.g. 1.5
  ```
  Add all 5 fields to `LeagueStats` type and `INITIAL_LEAGUE_STATS`.
- [ ] **`src/utils/finance/inflationUtils.ts`** (new) — `truncatedGaussian(min, max, mean, std): number` using Box-Muller transform, clamp to [min, max].
- [ ] **Apply at rollover** — inside `ADVANCE_SEASON` action, after `leagueStats.year++`:
  ```ts
  if (leagueStats.inflationEnabled) {
    const pct = 1 + truncatedGaussian(...) / 100;
    leagueStats.salaryCap = Math.round(leagueStats.salaryCap * pct);
    leagueStats.luxuryPayroll = Math.round(leagueStats.luxuryPayroll * pct);
    leagueStats.minContract = Math.round(leagueStats.minContract * pct);
    // maxContract recalculates from cap % automatically
  }
  ```
- [ ] **News headline** — after inflation applies, generate a news item: "The NBA salary cap for [year] has been set at $[X]M, a [+/-Y]% change from last season."
- [ ] BBGM note: Inflation is ignored while scheduled events (historical roster updates) are active. We don't have that system — just apply every year unconditionally.

---

## 10. Tradable Draft Pick Seasons (League Settings)

BBGM default: 4 seasons of tradable future picks. We should expose this too.

### Tasks

- [ ] Add `tradableDraftPickSeasons: number` to `LeagueStats` type. Default: `4`. `0` = disable draft pick trading entirely.
- [ ] **`src/constants.ts`** — add to `INITIAL_LEAGUE_STATS`: `tradableDraftPickSeasons: 4`.
- [ ] **League Settings UI** — add under "Draft" section. Number input (0–7), matches BBGM range.
- [ ] **`src/services/draft/DraftPickGenerator.ts`** — on season rollover, call `generateFuturePicks(teams, currentYear, tradableDraftPickSeasons)`. This ensures the picks pool always has `N` future seasons worth of picks per team.
- [ ] **`src/services/tradeService.ts`** — when building tradeable asset lists, filter `draftPicks` to `pick.season <= currentYear + leagueStats.tradableDraftPickSeasons`. If `tradableDraftPickSeasons === 0`, exclude all future picks from trade UI.

---

## 11. DraftScoutingView — Per-Season Handling

> `src/components/central/view/DraftScoutingView.tsx` currently hardcodes `GIST_URL` pointing to `2026classScouting`. Each new season needs a different class.

### Current state
- Fetches from a fixed gist URL (`2026classScouting`)
- Matches gist prospects against `state.players` where `tid === -2` or `status === 'Draft Prospect'`
- No year awareness

### Tasks

- [ ] **Dynamic gist URL** — derive URL from `leagueStats.year`:
  ```ts
  const GIST_BASE = 'https://gist.githubusercontent.com/aljohnpolyglot/bb8c80155c6c225cf1be9428892c6329/raw/';
  const GIST_URL = `${GIST_BASE}${state.leagueStats.year}classScouting`;
  ```
  You'll need to create a new gist file for each year (`2027classScouting`, etc.).
- [ ] **Fallback when gist 404s** — if fetch fails or returns 0 matches, fall back to showing all `tid === -2` players by OVR with no external scouting data. Currently shows error state — that's fine for now.
- [ ] **Auto-populate draft class** — at `phase === 'Draft'` start, if `state.players.filter(p => p.tid === -2).length === 0`, trigger `DraftClassGenerator` to populate it. This is the bridge between the generator (Section 2b) and the scouting view.
- [ ] **Season rollover auto-clear** — in `ADVANCE_SEASON`: remove all `tid === -2` players from `state.players` (undrafted class from previous year expires). Then `DraftClassGenerator` creates the new class.

---

## 12. Player Ratings UI

> Added 2026-04-01. The player ratings system uses BBGM attributes (0–100) as the source of truth for simulation. The UI converts them to a display scale via `calculateK2` in `convert2kAttributes.ts` (cosmetic only — does not touch sim engine).

### Architecture recap
- **`src/utils/helpers.ts`** → `convertTo2KRating(ovr, hgt, tp?)` — single source of truth for overall OVR badge. TP bonus: if `tp > 90`, adds `(tp - 90)` to overall. Steph Curry tp=95 → +5.
- **`src/services/simulation/convert2kAttributes.ts`** → `calculateK2()` — UI-only per-attribute breakdown into 6 categories (OS, AT, IS, PL, DF, RB) with 35 sub-attributes total. Zero sim impact.
- **`src/components/modals/PlayerRatingsModal.tsx`** — per-player modal: radar chart (SVG heptagon, 7 axes) + collapsible category bars + edit mode (BBGM sliders).
- **`src/components/central/view/PlayerRatingsView.tsx`** — sortable table: summary (6 category OVRs) or detailed (all 35 sub-attributes) toggle, team filter + search.

### Tasks

- [ ] **Rating edit audit trail** — when a user edits ratings via the modal, leave a flag on the player object (`manualRatingEdit: true`, `lastEditedSeason: year`). LLM can read this as context (like hypnosis) but it never triggers auto-sim side effects.
- [ ] **Progression integration** — when ProgressionEngine (section 3) runs at season rollover, apply deltas to BBGM ratings AND have `calculateK2` recalculate automatically (it already does, no code change needed — just verify).
- [ ] **Draft prospect ratings** — `tid === -2` players should appear in PlayerRatingsView (currently filtered to Active/Free Agent only). Add a "Prospects" filter option.
- [ ] **Position archetypes** — in edit mode, add preset buttons per position (e.g. "3&D Wing", "Stretch Big", "Pass-First PG") that auto-fill suggested BBGM rating values.

---

## 13. Deferred (User Doing Separately)

- **Draft Lottery UI** — user building the reveal animation + odds display screen
- **Draft Board UI** — user building the pick selection interface
- **Player Portrait in Rig All-Star Voting** — use `PlayerPortrait` shared component (same as All-Star replacement modal); all players should have votes visible
