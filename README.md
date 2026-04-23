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
| **GM** | One team — roster, trades, free agency, draft, extensions | Live |

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

### Persistence — Save-Scoped Storage (CRITICAL)
Anything written to `localStorage` or `IndexedDB` outside of `GameState` MUST be scoped by `state.saveId` or it will leak between saves.

- `state.saveId` is minted in `initialization.ts` (`nba_commish_<ts>_<rand>`) and swapped on `LOAD_GAME` / `UPDATE_SAVE_ID`.
- `GameContext` already watches `state.saveId` and calls `setActiveSaveId()` on the gameplan store; follow the same pattern for any new per-save side store.
- Reference: `src/store/gameplanStore.ts` keys localStorage as `nba-commish-gameplans::<saveId>` and rehydrates when the active saveId changes. Do NOT use a single global key for user-editable per-save settings (starters, minute overrides, rotation presets, etc.) — that's how the Gameplan minutes leaked across saves before the fix.
- Sim-side consumers (e.g. `StatGenerator/initial.ts`) read via `getGameplan(teamId)` — the store resolves the active saveId internally, so the engine signature stays save-agnostic.

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

## Session 25 additions (2026-04-18)

### Generated draft classes — infinite sim
- `src/services/genDraftPlayers.ts` — `generateDraftClass`, `generateDraftClassForGame(year, count, rng, nameData, currentSimYear?)`, `sandboxToNBAPlayer(p)`. Realistic path mix (70% College / 10% Europe / 6% G-League / 6% Endesa / 4% NBL / 4% B-League). `currentSimYear` param rewinds age + ratings for far-future classes so a 2029 prospect synthesized in 2026 starts as a 16yo raw HS kid, not a 19yo draft-ready stud.
- `src/services/draftClassFiller.ts` — `ensureDraftClasses(players, currentYear)` tops any thin year up to 100 prospects. Runs at `seasonRollover` only; init is a no-op because `DraftScoutingView` fetches its gist directly. Filter uses only `tid === -2` (not status) — prevents double-fill on classes that already have BBGM-imported prospects.
- `src/sportData.ts` — frequency tables for country + college pools (ZenGM format).
- `src/genplayersconstants.ts` — sandbox types (`Player`, `Ratings`, `NameData`, `Position`, `MoodTrait`), NBA/Euroleague/Endesa/NBL/B-League team maps, race-freq table by nationality.
- `src/data/nameDataFetcher.ts` — one-shot ZenGM names fetch, localStorage cache (`nba-commish:namedata-v2`), offline fallback. Validates schema before caching so malformed payloads don't poison future loads.
- **Nerf:** prospects get `×0.80` on skill attrs + OVR at the `sandboxToNBAPlayer` adapter. Potential derived from `potEstimator(nerfedOvr, age)` — same formula `PlayerRatingsModal` uses. No hand-tuned pot multiplier.

### Faces (facesjs)
- `src/components/shared/MyFace.tsx` — ZenGM-pattern wrapper. 2:3 aspect, `ignoreDisplayErrors`, optional team colors + jersey overrides.
- `generateFace` reject-loop drops non-basketball accessories (`hat*`, `eye-black`) on roll.
- `PlayerPortrait.tsx` renders face ONLY when `player.face` has real feature slots (body + head). Stale stubs fall through to initials; existing NBA/external players without descriptors stay on the standard portrait pipeline.
- `DraftScoutingView.tsx` dicebear fallback → facesjs path. (Small + big avatar both.)

### Signing / Contracts
- `SigningModal` end-to-end: GM-only preflight ("Testing Free Agency"), commissioner auto-accept + override buttons, 2-decimal salary + hold-ramp chevrons, MLE row in Finances + "Sign with MLE" button, cap-violation final gate, roster-slot awareness (standard vs two-way), external-league buyout slider with FIBA cap + Mother Team Interest bar that responds to your contribution.
- External-league contracts synthesized at init for Euroleague/PBA/B-League/G-League/Endesa/CBA/NBL players missing `contract` from the gist. Drives FA expiry + transaction feed.
- `EXTERNAL_SALARY_SCALE` in `constants.ts` now also caps NBA offer at `~3× overseas peak` — PBA stars don't command $5M NBA deals anymore.
- `getContractLimits` respects all EconomyContractsSection toggles (`minContractType`/`maxContractType` modes, supermax, Bird Rights).
- MLE / Biannual now percentage-based in EconomyTab — scales with cap automatically.

### Trade Proposals
- `usePlayerQuickActions` hook — unifies player-row clicks across all views. Renders PlayerActionsModal + routes view_bio / view_ratings / sign_player / resign_player / waive into a single stack. Views just do `quick.openFor(player)` + `{quick.portals}`. Replaced the copy-pasted pattern in NBACentral, PlayersView, FreeAgentsView, PlayerRatingsView, PlayerStatsView, PlayerBiosView.
- `src/services/trade/inboundProposalGenerator.ts` — scans every team vs. user's trading block, builds 1/2/3-for-1/2/3 combos with ±15% TV parity + salary legality. Fires auto on `state.date` change so proposals refresh daily while simming. GM-only view; commissioner hides the Trade Proposals tab entirely.

### GM mode
- Welcome post + news + email tailored in `initialization.ts`: `"{Team} Hires {GM Name} as General Manager"` instead of "Commissioner X on the job".
- **User's team hoists to front of the TeamOffice grid with a team-color glow + "Your Team" badge** (`TeamOffice/pages/Home.tsx`).
- TradingBlock page edit-gated: GM read-only on non-own teams, commissioner edits any team.
- Upcoming FA tab defaults to user's team; Available FA defaults to NBA pool.
- Waive action dispatches directly (no next-day sim tick).

### Misc
- `PlayerRatingsView`, `PlayerStatsView`, `PlayerBiosView`, `DraftScoutingView` dicebear fallbacks cleaned up.
- `maxYear` in DraftScoutingView now caps at the furthest year with real prospects in state (no more navigating into empty years).

---

## Session 26 additions (2026-04-23)

### Team-option → rookie extension coupling
- `src/services/logic/seasonRollover.ts` — new §0c pass fires right after the team option exercise loop. For every option-exercised player in the rookie-ext window (YOS 3-4), computes an offer via `computeContractOffer({ ...p, hasBirdRights: true })` and runs a deterministic acceptance roll with a high floor: `basePct = 0.90` baseline, `0.95` for foundational (MVP or All-NBA in last 3 yrs), `0.97` for LOYAL trait. Uses `currentYear * 97` as the seed multiplier (distinct from mid-season's `* 31`) so unlucky rolls don't cascade across both pipelines. Accepted extensions write `contractYears[]` entries starting at `contract.exp + 1` with 5% annual raises and preserve the existing team-option-year contract year. Labels surface as `Rose Rule` / `Rookie Ext` / `Supermax` in the history log, dated `Jun 30, {currentYear}`.
- Patched the `teamOptionExercisedIds` branch in the main player-map to compute `hasBirdRights` and `superMaxEligible` — previously these were stale until the next rollover because only the "still under contract" branch set them.
- Motivated by the Wembanyama case: 4-year MVP/All-NBA Spurs run, mid-season extension fired Oct 2026, rolled the 20% decline bucket on a deterministic seed, silent fail (declines don't write to history), hit FA Jul 2027, signed LAC. The coupled extension gives franchise cornerstones a proper bundled-summer negotiation window with high acceptance before the lossy mid-season path can fail them.

---

*Last updated: 2026-04-23 (session 26)*
