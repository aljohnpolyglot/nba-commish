# Plan — Euro Isolated MVP (Spain Template)

> **Scope:** ship a Spain-template Euro-Isolated GM mode where the user picks an Endesa club, plays both Endesa AND Euroleague schedules in real-life cadence, NBA simulates quietly in the background and is invisible in UI.
> **Phase 1 + Phase 2 are prerequisites.** Phase 4 (schedule generalization) is *part of this plan* — there is no MVP without dual-competition schedules.
> Future templates (Greece, Germany, France, Italy, …) ship after this plan closes; the architecture here must allow them as drop-ins (new roster gist + market mapping).

## Goal

A Spain-modded save with `gameMode='gm'` and `userTeamId` pointing at an Endesa club lets the user manage that club through a full season — domestic Endesa games + Euroleague group stage / Play-In / Final Four — without crashing on hidden NBA assumptions, while NBA itself simulates silently and stays out of the UI.

## Current status snapshot (2026-05-10)

- **Prereq reality:** Phase 1 is largely in place and Phase 2 is now materially further along: non-NBA team resolution, roster rendering, Team Office / Coaching / Training / Team Intel / FA subviews are no longer blocked on NBA-only `state.teams.find(...)` or `p.status === 'Active'` assumptions.
- **Foundation now landed in worktree:** `LeagueStats.uiMode`, `LeagueStats.currency`, and `LeagueStats.tradesAllowed` now exist; Spain Euro-Isolated starts seed `EURO_ISOLATED_DEFAULTS`; `NavigationMenu` now independently gates Draft / Trade / NBA-season tabs off `isNoDraftLeague`, `tradesAllowed === false`, and `isEuroIsolatedMode(state)` instead of one monolithic assumption.
- **What is not shipped yet:** this MVP's core architecture is still outstanding. There is no `uiMode` save flag in active use, no generalized competition/spec engine, no dual-competition schedule generation, no Euroleague tab reuse, no Endesa standings branch, no portal mode, and no broad currency/cap/trade-default migration across the app.
- **Meaning:** this file remains a roadmap for the next major implementation wave, not a description of already-shipped behavior. Use it as the execution backlog after Phase 2 browser verification, not as release notes.

## Codex execution status (2026-05-11)

- `Status (2026-05-11): shipped/partial.` Landed the MVP code hooks for Slices 2b, 2c, 3, 4, 4b, 5, 6, 6b, 7, 8b, 9, 9b, 9c, 9d, 10, 10b, and 10c: shared team selector, country flags, generic competition scheduler, Spain spec expansion, schedule badges, Euro schedule filtering, Endesa standings, Euroleague tab, Euro finance variants, Euro player/FA defaults, draft/trade deletion gates, AI trade disable gates, offseason Euro rows, and NBA Portal toggle.
- `Status (2026-05-11): simulation wiring follow-up shipped.` Simulated BoxScores now inherit `competitionId`/`competitionPhase` from scheduled games, so Euro standings, CompetitionView, and rollover champion history can read completed Endesa/Euroleague games. Both schedule-generation paths (`gameLogic` and `autoResolvers`) merge active competition fixtures.
- `Status (2026-05-11): NBA fallback gates tightened.` Team Needs now includes international roster statuses, Trade Hub/Trade Board/Trade Machine/Finder/Proposals are hidden or centrally blocked when trades are disabled, no-draft saves no longer trigger draft-event modals, stale Playoffs/NBA-season routes no longer show NBA-only copy in Euro mode, and League History now uses user-facing European trophy archive language.
- `Status (2026-05-11): competition UX follow-up shipped.` Competition tables seed every Endesa/Euroleague club immediately at 0-0, highlight the user's club, show qualification status, prize pool, and recent results. The early-season "if season ended today" projection was removed because it looked like false bracket content before the season had meaningful results. Euro Free Agency scouting hides NBA Bird Rights while formatting asks in the active currency.
- `Status (2026-05-11): competition schedule repair shipped.` Endesa/Euroleague scheduling now builds real round-robin rounds for all AI clubs instead of serial pair-by-pair games, centralizes competition team selection including merged Euroleague clubs via `clubAliasMap`, caps standings seeds to the competition spec, and repairs malformed in-flight schedules while preserving already-played results.
- `Status (2026-05-11): PlayButton Europe refactor shipped.` Euro-isolated saves now use a competition-aware PlayButton branch based on real `competitionId`/`competitionPhase` fixtures: next fixture, Endesa/EuroLeague regular-season ends, EuroLeague play-in/playoffs/Final Four, and through Endesa/EuroLeague/all competitions. NBA-only skip targets are removed from Euro/no-draft saves.
- `Status (2026-05-11): Euro schedule/recap bugfix shipped.` Calendar cells, watched-game screens, watched-game boxscores, news/social photo lookups, and game recap seeds now resolve Endesa/Euroleague clubs through `resolveAnyTeam`; watched Euro boxscores preserve `competitionId`/`competitionPhase` so recaps and standings keep the game.
- `Status (2026-05-11): competition resolver logic shipped.` Endesa/Euroleague now inject playable Play-In/QF/SF/Final games into the simulation schedule, resolve outcomes from real played KO box scores when present, keep regular-season standings isolated from KO games, persist `competitionHistory`, and write Euro Champion/Runner Up records into both `history` and `historicalAwards`.
- `Status (2026-05-11): schedule event cleanup shipped.` Euro calendar/day views now filter to competition fixtures and suppress NBA Draft/Lottery/All-Star/Playoff event cards.
- `Status (2026-05-11): gameplay audit fix pass shipped.` League Finances now uses Endesa clubs and real `team.tycoon` data instead of NBA payroll rows; Euro schedule sim now catches up unplayed past-dated competition games; DayView displays final score plus W/L; Euro `Playoffs` routes to the Endesa competition hub; knockout champions are not resolved until finals are actually won; lazy-sim blocks rollover while due Euro competition games remain unplayed; background NBA AI trades run even when Euro trade UI is hidden.
- `Status (2026-05-11): Euro logic hardening shipped.` Euro QF/SF/Final games are marked as postseason and processed into playoff stats, not regular-season stats; stale generated Euro KO games are interpreted correctly by the stat processor; NBA playoff generation is blocked in Euro saves in both daily and lazy sim paths; NBA All-Star/Draft/HOF/Christmas/global auto-events are skipped for Euro saves; Bracket UI only renders materialized phases instead of projected future SF/Final matchups.
- `Status (2026-05-11): deferred follow-up.` Slice 8 now has playable Endesa/Euroleague postseason injection plus rollover history, but browser playthrough still needs to validate late-May/June cadence end-to-end. Slice 10b now blocks the main portal mutations in central dispatch, but exhaustive read-only enforcement for every obscure reducer action remains follow-up. Slice 1b currency rollout now covers Euro finance views, FA chrome, SigningModal terms/buyouts/finance rows, and TradeMachine player salary pills; remaining work is a final legacy money-string sweep outside those core surfaces.
- `Type-check (2026-05-11): clean in changed files.` `npx tsc --noEmit` still reports pre-existing errors in `DraftSimulatorView.tsx`, `fictionalLeagueGenerator.ts`, `GameContext.tsx` expansion action comparisons, and `initialization.ts`; no errors remain in the new or patched Euro-MVP files.

## Current status snapshot (2026-05-10)

- **Prereq reality:** Phase 1 is largely in place and Phase 2 is now materially further along: non-NBA team resolution, roster rendering, Team Office / Coaching / Training / Team Intel / FA subviews are no longer blocked on NBA-only `state.teams.find(...)` or `p.status === 'Active'` assumptions.
- **Foundation now landed in worktree:** `LeagueStats.uiMode`, `LeagueStats.currency`, and `LeagueStats.tradesAllowed` now exist; Spain Euro-Isolated starts seed `EURO_ISOLATED_DEFAULTS`; `NavigationMenu` now independently gates Draft / Trade / NBA-season tabs off `isNoDraftLeague`, `tradesAllowed === false`, and `isEuroIsolatedMode(state)` instead of one monolithic assumption.
- **What is not shipped yet:** this MVP's core architecture is still outstanding. There is no `uiMode` save flag in active use, no generalized competition/spec engine, no dual-competition schedule generation, no Euroleague tab reuse, no Endesa standings branch, no portal mode, and no broad currency/cap/trade-default migration across the app.
- **Meaning:** this file remains a roadmap for the next major implementation wave, not a description of already-shipped behavior. Use it as the execution backlog after Phase 2 browser verification, not as release notes.

## Acceptance Criteria (observable, not implementation)

- [ ] **AC-1** Setup → Modded → Europe → Spain → Real Madrid → Start commits a save with `state.userTeamId` = Real Madrid Endesa tid, `state.leagueStats.draftType === 'no_draft'`, both Endesa and Euroleague rosters loaded.
- [ ] **AC-2** Sidebar in this save shows no Draft Scouting, Draft Lottery, Draft Board, All-Star, NBA Cup, Hall of Fame, NBA Central, Trade Proposals, or Trade Finder entries. Trade Machine still visible (commissioner side) but hidden from GM-mode menu.
- [ ] **AC-3** A new "Euroleague" tab (NBACupView repurposed) shows a live group stage table + bracket for the current season, with Real Madrid's group highlighted.
- [ ] **AC-4** Standings tab shows the Endesa table (18 teams, real-life points/W-L) for the user's domestic competition. No NBA East/West.
- [ ] **AC-5** Schedule tab and DayView show real-life-cadence games: Endesa fixtures on weekends, Euroleague on Tuesday/Thursday. A Real Madrid week typically has 1 Euroleague + 1 Endesa game.
- [ ] **AC-6** Simulating one full week advances both competitions: Endesa standings update, Euroleague group standings update, Real Madrid's record reflects both.
- [ ] **AC-7** Player Stats / Bios / Ratings views default to Euro-league players. NBA players still queryable through the search filter but not in the default list.
- [ ] **AC-8** Free Agents view shows NBA FAs + Endesa FAs + Euroleague FAs pooled together; user can sign any of them subject to cap.
- [ ] **AC-9** Reaching season end (June) triggers offseason: Endesa playoffs, Euroleague Final Four, retirements, external-league FA churn — all per existing pipelines. No draft-related task surfaces.
- [ ] **AC-10** Throughout, `state.boxScores` accrues NBA games quietly (NBA still sims) but no NBA UI surfaces them in this mode.
- [ ] **AC-11** Commissioner Settings panel exposes Euro-specific defaults when `uiMode === 'euro_isolated'`: currency (default EUR), salary-cap value (in EUR), trades-allowed toggle (default false), schedule cadence (Sat/Sun for Endesa, Tue/Thu for Euroleague), FA window dates. Every default is user-overridable.
- [ ] **AC-12** Salaries, cap, contracts, prize pools all display in the active currency (€ for Spain, configurable elsewhere) — `formatSalary` consults `state.leagueStats.currency` instead of hardcoded `$`.
- [ ] **AC-13** Every team picker / dropdown / selector in the app — Trade Machine, Trade Finder, Player Stats team filter, TeamOffice Home grid, TrainingFranchisePicker, Visit-Other-Team modal, Standings team toggle — renders via the same shared `<TeamSelector>` component, scoped to the active league via `getActiveLeagueTeams(state)` by default. Adding France/Germany/Italy templates later requires zero picker-component changes — only new spec data files.

## Architectural Alignment (read before slicing)

### Tournament refactor (`docs/tournament-refactor.md`)
Already specs out a `TournamentSpec` covering group-stage + knockout + awards + scheduling for NBA Cup / Summer League / FIBA / Olympics. **The Spain MVP must align with this** — we extend that spec to also cover regular-league formats (Endesa) instead of inventing a parallel `CompetitionConfig`.

Concretely: rename / generalize `TournamentSpec` → `CompetitionSpec` adding a `format: 'regular-league' | 'group-knockout' | 'knockout' | 'tournament'` discriminant. Endesa is `'regular-league'`, Euroleague is `'group-knockout'` (group → playoffs → Final Four), Copa del Rey is `'knockout'`, Supercopa is `'tournament'`. Each gets its own `CompetitionSpec` record in `src/services/competition/specs/`.

This means the Spain MVP delivers PR 1–4 of the tournament refactor by necessity — both initiatives now ship together.

### File ownership rule (per user mandate)
**Most code lives in new files. Existing NBA files get ~20-line "hook coats", nothing more.**

New files (greenfield):
- `src/types/competitionSpec.ts` — generalized spec type
- `src/services/competition/` — engine: `drawGroups`, `scheduleGenerator`, `applyResult`, `resolveStage`, `awards`
- `src/services/competition/specs/spain.ts` — Spain template configs (4 specs)
- `src/services/competition/specs/index.ts` — `ALL_SPECS` aggregator (NBA Cup, Spain, future France/Germany)
- `src/components/competition/` — generic `CompetitionView`, `BracketDisplay`, `GroupTable`, `CompetitionBadge`
- `src/utils/uiMode.ts` — `isEuroIsolatedMode(state)`
- `src/utils/teamLookup.ts` — already created, extends with helpers
- `src/data/templates/` — country templates (Spain now, France/Germany/Italy later)

Hook coats (≤20 LOC each, in existing NBA files):
- `gameScheduler.ts` — call out to `competitionScheduler.generateAll(activeCompetitions)` once, leave NBA path untouched
- `simulationHandler.ts` — replace inline NBA Cup tick with the loop already proposed in `tournament-refactor.md` §3e
- `MainContent.tsx` — route `'NBA Cup'` tab → `<CompetitionView specId={'nba-cup'} />` (rename only)
- `NavigationMenu.tsx` — already gating draft tabs on Phase 1; add Euro Isolated gate
- `LOAD_GAME` reducer — migration: `state.nbaCup` → `state.competitions['nba-cup']`

## NBA → Euro View Reuse Map

Each existing NBA view either becomes generic-with-spec-prop or stays NBA-only and gets a sibling component for Euro. Mostly the former.

| NBA view (today) | Euro equivalent (this plan) | Reuse | Slice |
|---|---|---|---|
| `NBACupView` (group stage + knockout + Final Four + prize pool) | `<CompetitionView specId="euroleague">` | ~95% — same component, fed by EL CompetitionSpec data | 7 |
| `StandingsView` (NBA East / West / division toggle) | `StandingsView` with `conferences=false` flag — single Endesa table, no conference filter | ~85% — drop the conference grouping branch when active spec doesn't define conferences | 6 |
| `PlayoffView` (16-team bracket, 4 rounds Best-of-7) | Endesa: 8-team bracket QF Bo3 / SF Bo5 / Final Bo5; Euroleague: 8-team Bo5 + Final Four (Slice 7 owns the EL bracket) | ~70% — `PlayoffView` reads bracket size + series-format from active spec | 8 |
| `BracketDisplay` (NBACupView component) | Reused as-is for Copa del Rey + Euroleague playoffs | ~100% | 7, 8 |
| `<GroupTable>` | Reused as-is for Euroleague group stage | ~100% | 7 |
| `<MatchCard>` | Reused as-is for any cup matchup | ~100% | 7 |
| `<PrizePool>` | Reused as-is, fed by `competitionSpec.prizePool` | ~100% | 4, 7 |
| `<CupChampionHero>` | Reused, parameterized on competition's MVP / Champion award types | ~95% | 7 |
| `<CupAllTournamentSection>` | Reused as `<CompetitionAllTournamentTeam>` | ~95% | 7 |
| `gameScheduler.ts` (NBA 82-game generator) | Stays NBA-only; new `competitionScheduler.ts` engine handles Euro generators | New file, hooks back into `gameScheduler` ~20 LOC | 3 |
| `simulationHandler.ts` NBA Cup tick | Generic `applyTournamentTick(spec, ...)` loop iterating ALL_SPECS | Aligned with `tournament-refactor.md` §3e | 7 |
| `LeagueHistoryView` / `LeagueHistoryDetailView` | NBA-only for now; Euro history → `competition.history` Phase 5+ (you'll provide a gist) | NBA path unchanged | future |
| `Hall of Fame`, `All-Star`, `Award Races` | NBA-only, hidden in Euro mode (Slice 2) | unchanged | 2 |
| `TeamFinancesView` | Branched: NBA-cap-centric stays for NBA path; Euro variant in Tycoon Slice T8 reads single annual ledger | ~50% (shared chrome, different data shape) | Tycoon T8 |
| `Standings team toggle / dropdown` | Replaced by shared `<TeamSelector>` everywhere | 100% | 2b |

**Result:** ~80% of existing NBA UI carries forward via `competitionSpec` parameterization. The Euro-specific work is mostly:
1. New CompetitionSpec data files (Spain template + future templates)
2. New schedule generator engine (one file, replaces NBA-cup-specific scheduling logic)
3. Tycoon-layer-specific files (FM-style budgeting; entirely new surface)
4. ~20-LOC hooks per existing NBA file

## Pre-Existing Work (confirmed by research / earlier slices)

- `isEuropeModded` + `isSpainEurope` flags in `initialization.ts:42-43` route Spain saves correctly.
- `draftType: 'no_draft'` auto-applies (initialization.ts:465).
- `runExternalFreeAgency` (Session 30, `services/externalFreeAgency.ts`) handles Endesa + Euroleague yearly roster churn — this is the rookie/sustainer mechanism. **No new rookie generator needed.**
- `resolveAnyTeam` + `getActiveLeagueTeams` + `isOnRoster` helpers (Phase 2 Slices 1–7).
- Synthetic staff fallbacks (`staffFallback.ts` from Phase 2 Slice 8).
- `EUROLEAGUE_TEAM_COUNTRIES` + `ENDESA_TEAM_COUNTRY` constants for nationality bias.
- `NBACupView` + `BracketDisplay` + `GroupTable` are nearly perfect for Euroleague (group stage + Final Four).

## Slice Ordering & Dependencies

Implementation flows top-down. Each slice depends on everything above it being green.

```
1.   uiMode flag + dual-league club merge
1a.  CompetitionSpec schema (aligned with tournament-refactor.md)
1b.  Commissioner Settings: Currency / Trades / Euro Defaults preset
1c.  Endesa + Euroleague pop overrides
─── Foundation done ───
2.   Sidebar gates (3 independent: draft / trades / mode)
2b.  Reusable <TeamSelector>
2c.  Country flags
─── Navigation + pickers done ───
3.   Generic schedule generator engine
4.   Spain template configs (4 specs as data)
4b.  Schedule indicator eyebrow / calendar dots
5.   Multi-competition DayView + ScheduleView
─── Schedule layer done; user sees calendar ───
6.   Standings → Endesa table (single league)
6b.  TeamIntel Euro adaptation
7.   NBACupView → CompetitionView reuse, Euroleague variant
8.   Offseason: Endesa playoffs + EL Final Four
8b.  TeamFinancesViewDetailed Euro variant
─── Single-league season fully playable ───
9.   Player views default Euro pool
9b.  Draft-UI deletion sweep (gated on isNoDraftLeague)
9c.  Offseason Aufgaben Euro structure
9d.  Trade-UI deletion sweep (gated on tradesAllowed === false)
10.  Free Agents pool: NBA + Endesa + EL combined
10b. 🌐 League Portal (sidebar footer, NBA preview overlay)
10c. League Finances View Euro variant
─── UI complete ───
11.  Browser smoke test
```

Slice 1 unblocks 1a (which needs the uiMode field). 1a unblocks 3 + 4 + 7 (which all consume CompetitionSpec). 3 unblocks 4. 4 unblocks 5/6/7/8. Everything else can run in parallel after foundation.

## Explicit Decisions (no longer open)

- **Save migration**: `LOAD_GAME` of an existing NBA save with `uiMode: 'nba'` (or undefined) just keeps NBA defaults. User toggles `uiMode: 'euro_isolated'` mid-game → runs through "Apply Euro Defaults" preset (Slice 1b) which bulk-flips settings; competition specs not yet loaded means schedule generation re-runs at next Aug 14 hook. Acceptable for MVP — no special migration code beyond what Slice 1b already does.
- **LLM rebranding for Euro**: deferred entirely. MVP is pure-gameplay FM-sim — no LLM narrative work. News/social feed continues to render NBA-flavored content; user previously confirmed "ich glaube das es ist ok". Future polish slice once gameplay solid.
- **Slice ordering**: as listed above (top-down). Each slice mergeable independently per the planning skill, but dependency arrows respected.

## Out of Scope (future plans)

- Other country templates (Greece, France, Germany, Italy, …) — drop-in once Spain works.
- Spanish-language UI — Phase 5+.
- Youth academy / draft-replacement generator — relying on `runExternalFreeAgency` for now.
- NBA visibility (showing NBA standings/scores from background sim) — future "NBA window" feature.
- Cross-league trades (Real Madrid trades with Lakers) — Phase 6+.
- Game-day simulator polish (Realistic engine for Euro games) — engine already works for any roster, calibration is a future polish pass.
- **Promotion / Relegation** between Endesa and LEB Oro — explicitly deferred. Requires a 2nd-tier league + multi-tier hierarchy + relegation/promotion playoff bracket. Worth doing later but heavy enough to be its own plan. 18th-place Endesa team just stays in Endesa next season for MVP.

## Slices

Each slice is one mergeable PR. Type-check must stay green after each.

### Slice 1 — Setup commits Euro Isolated save with `uiMode` flag + merged dual-league clubs

- `Status (2026-05-10): shipped. Spain Euro-Isolated init now seeds/stores `clubAliasMap`, remaps merged Euroleague club rosters onto canonical Endesa tids, and drops duplicate Euroleague team rows from `state.nonNBATeams` while keeping the stronger Euro roster for shared clubs.`

- `Status (2026-05-10): shipped. Spain Euro-Isolated init now seeds/stores `clubAliasMap`, remaps merged Euroleague club rosters onto canonical Endesa tids, and drops duplicate Euroleague team rows from `state.nonNBATeams` while keeping the stronger Euro roster for shared clubs.`

- **One sentence:** Add a `state.leagueStats.uiMode === 'euro_isolated'` flag so every UI consumer branches once, AND merge dual-league clubs (Real Madrid, Barcelona, Valencia) into a single team that plays both Endesa and Euroleague — like a real football club playing domestic + Champions League.
- **Value:** Foundation for everything downstream. Single source of truth for "hide NBA UI" + correct team identity for the user.
- **Path:**
  - New field `LeagueStats.uiMode?: 'nba' | 'euro_isolated'`. Setup commits `'euro_isolated'` for `isSpainEurope && gameMode === 'gm'`.
  - Helper `isEuroIsolatedMode(state)` in new `src/utils/uiMode.ts`.
  - **Dual-league merge:** at init, identify clubs that exist in both Endesa and Euroleague rosters (today: SHADOWED_ENDESA_TEAM_TIDS = {5006 Barcelona, 5012 Real Madrid}, plus Valencia if loaded). Drop the Euroleague duplicate `nonNBATeam` for those clubs but **map** its Euroleague-tid → canonical Endesa-tid in a new `clubAliasMap: Record<number, number>` on state. Schedule + standings consume `clubAliasMap` so Euroleague matches reference the canonical Endesa-tid.
  - Roster source: prefer the Euroleague roster (0.85 mult, slightly stronger player ratings) for merged clubs.
- **AC:** Loading a Spain save shows `state.leagueStats.uiMode === 'euro_isolated'`, `state.players.filter(p => p.tid === 5012).length > 0`, and the Euroleague-tid Real Madrid is gone from `state.nonNBATeams`.

### Slice 1a — Competition config schema (data-driven, transferable across countries)

- `Status (2026-05-10): shipped. Added `CompetitionSpec` in `src/services/competition/types.ts`, seeded `state.activeCompetitions`, and authored the four Spain competition records as static template data.`

- `Status (2026-05-10): shipped. Added `CompetitionSpec` in `src/services/competition/types.ts`, seeded `state.activeCompetitions`, and authored the four Spain competition records as static template data.`

- **One sentence:** Define a generic `CompetitionConfig` shape so every domestic-league, continental-cup, mid-season-cup, preseason-tournament is a data record — Spain seeds 4 configs (Endesa, Euroleague, Copa del Rey, Supercopa); France/Germany/Italy templates later seed their own without touching engine code.
- **Value:** Foundation for transferability + no-hardcode mandate. Without this, every new country requires new generator files + UI patches.
- **Path:**
  - New `src/types/competitionConfig.ts`:
    ```
    interface CompetitionConfig {
      id: string;                    // 'endesa' | 'euroleague' | 'copa-del-rey' | 'supercopa'
      displayName: string;           // 'Liga Endesa' / 'Turkish Airlines EuroLeague' / ...
      shortName: string;             // 'ACB' / 'EL' / 'Copa' / 'Supercopa'
      format: 'round-robin' | 'group-knockout' | 'knockout' | 'tournament';
      teamSelector: 'allEndesa' | 'allEuroleague' | 'top8Standings' | 'top4Prior+CupWinner' | ...;
      seasonStart: { month: number; day: number };
      seasonEnd:   { month: number; day: number };
      gamesPerTeam?: number;         // 34 (ACB), 38 (EL regular), undefined for knockouts
      daysOfWeek: ('Mon'|'Tue'|...)[];  // ['Sat', 'Sun'] for ACB / ['Tue', 'Thu'] for EL
      blackoutPeriods?: { start: ..., end: ... }[];  // FIBA windows, Copa weekend
      playoffFormat?: { qfBest: 5, sfBest: 5, finalFormat: 'final-four' | 'best-of-5' };
      accentColor: string;           // for the eyebrow / calendar dots
      icon: string;
    }
    ```
  - Configs live in `src/data/competitionConfigs/` as static JSON-like exports. `spain.ts` exports an array of 4 configs. France/Germany/etc. are future drop-ins.
  - State carries `state.activeCompetitions: CompetitionConfig[]` populated at setup.
- **AC:** Loading a Spain Euro Isolated save → `state.activeCompetitions.length === 4` with ids `['endesa', 'euroleague', 'copa-del-rey', 'supercopa']`. NBA save → empty array.

### Slice 1b — Commissioner Settings exposes Euro defaults + currency

- `Status (2026-05-11): shipped/partial. Economy rules expose Currency, Trades Allowed, and Apply Euro Defaults; Euro finance views, Free Agents chrome, SigningModal terms/buyouts/finance rows, and TradeMachine player salary pills use league currency. Remaining work is a final long-tail money-string sweep outside the core surfaces.`

- `Status (2026-05-10): in progress. Economy rules now expose Currency, Trades Allowed, and an always-visible Apply Euro Defaults preset button; the preset bulk-flips the core Spain MVP finance/draft/FIBA toggles. Remaining work in this slice is the full salary-display rollout to every money surface.`

- **One sentence:** Apply a comprehensive set of Euro-specific defaults to every commissioner-facing toggle when a save commits as Euro Isolated, plus add 2 new settings (`currency`, `tradesAllowed`) and an "Apply Euro Defaults" preset button that bulk-applies the table below.
- **Value:** AC-11 + AC-12. Every NBA-flavored toggle has a sane Euro default; commissioner can override anything; user mandate: "list nun die settings booleans... alles".
- **Path:**
  - New `LeagueStats.currency?: 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CNY' | 'AUD' | 'PHP'` (reuses existing `EXTERNAL_CURRENCY` shape).
  - New `LeagueStats.tradesAllowed?: boolean` (default true; Euro Isolated default = false).
  - `EconomyTab` gets a Currency dropdown + Trades Allowed checkbox.
  - New "Apply Euro Defaults" preset button in `RulesView` header — single dispatch that updates the full Euro defaults table below.
  - Setup flow auto-applies Euro defaults when committing a Spain Euro Isolated save (so the user starts with sane values without clicking the preset).
  - All `$`-hardcoded sites → `formatCurrency(amount, leagueStats)` helper.

#### Euro Defaults Table (every relevant `LeagueStats` field)

Grouped by area. Bold = Euro default differs from NBA.

**Draft / Lottery**
| Field | NBA default | **Euro default** | Notes |
|---|---|---|---|
| `draftType` | `'nba2019'` | **`'no_draft'`** | Phase 1 already wires this for `isEuropeModded` |
| `draftEligibilityRule` | `'one_and_done'` | **`'none'`** | No draft → no eligibility rule |
| `minAgeRequirement` | 19 | **18** | FIBA pro contracts allowed at 18 |
| `tradableDraftPickSeasons` | 7 | **0** | No picks exist to trade |
| `stepienRuleEnabled` | true | **false** | NBA-only rule |
| `rookieScaleType` | `'dynamic'` | **`'none'`** | No rookies → no rookie scale |
| `rookieMaxContractPercentage` | 9 | **0** | n/a |
| `rookieContractLength` | 2 | **0** | n/a |
| `rookieTeamOptionsEnabled` | true | **false** | n/a |
| `rookieRestrictedFreeAgentEligibility` | true | **false** | n/a |
| `rookieContractCapException` | true | **false** | n/a |
| `r2ContractsNonGuaranteed` | true | **false** | n/a |

**Cap / Apron / Tax**
| Field | NBA | **Euro** | Notes |
|---|---|---|---|
| `salaryCapEnabled` | true | **false** | Most Euro leagues have no hard cap; Tycoon T1 budget framework replaces this |
| `salaryCapType` | `'soft'` | **`'none'`** | n/a |
| `salaryCap` | 154,647,000 (USD) | **45,000,000 (EUR)** | Real Madrid wage budget tier; commissioner-overridable |
| `luxuryPayroll` | 171,000,000 | **0** | No luxury tax in Euro |
| `luxuryTaxEnabled` | true | **false** | |
| `luxuryTaxThresholdPercentage` | 121.5 | **0** | n/a |
| `apronsEnabled` | true | **false** | NBA-only concept |
| `numberOfAprons` | 2 | **0** | |
| `firstApronPercentage` | 126.7 | **0** | n/a |
| `secondApronPercentage` | 134.4 | **0** | n/a |
| `minimumPayrollEnabled` | true | **false** | Euro doesn't enforce payroll floors |
| `minimumPayrollPercentage` | 90 | **0** | |
| `mleEnabled` | true | **false** | NBA-only Mid-Level Exception |
| `roomMleAmount` / `nonTaxpayerMleAmount` / `taxpayerMleAmount` / `biannualAmount` | filled | **0** | n/a |
| `biannualEnabled` | true | **false** | |
| `restrictCashSendOver2ndApron`, `restrictAggregationOver2ndApron`, `restrictSignAndTradeAcquisitionOver1stApron`, `freezePickAt2ndApron`, `restrictTPEProvenanceOver2ndApron` | true | **false** | All apron-derived; off |
| `tradeMatchingRatioUnder` / `Over1st` / `Over2nd` | 1.25 / 1.10 / 1.00 | **n/a (trades disabled)** | If user enables trades, simple 100% matching ratio |
| `postSigningMoratoriumEnabled` | true | **false** | NBA-only July moratorium |
| `tradeExceptionsEnabled` | true | **false** | NBA-only TPE concept |
| `disabledPlayerExceptionEnabled` | true | **false** | NBA-only |
| `rfaMatchingEnabled` | true | **false** | NBA RFA system; Euro has buyout clauses instead (Tycoon T10) |
| `rfaMatchWindowDays` | 2 | **0** | |
| `rfaAutoDeclineOver2ndApron` | true | **false** | |

**Contracts**
| Field | NBA | **Euro** | Notes |
|---|---|---|---|
| `minContractType` | `'dynamic'` | **`'static'`** | Euro min wage stays at a flat EUR amount |
| `minContractStaticAmount` | 1.272 (USD M) | **0.06 (EUR M)** | FIBA min ~€60K/yr |
| `maxContractType` | `'service_tiered'` | **`'static'`** | Euro doesn't tier by service years |
| `maxContractStaticPercentage` | 30 | **40** | Top star can earn ~€18M of €45M club budget; commissioner-overridable |
| `supermaxEnabled` | true | **false** | NBA Designated Veteran rule; doesn't exist in Euro |
| `supermaxPercentage` | 35 | **0** | n/a |
| `birdRightsEnabled` | true | **false** | NBA cap-exception mechanic; Euro uses simpler buyout clauses |
| `minContractLength` | 1 | 1 | Same |
| `maxContractLengthStandard` | 4 | **5** | Euro allows longer deals |
| `maxContractLengthBird` | 5 | **0** | Bird disabled |
| `playerOptionsEnabled` | true | true | Common in Euro too |
| `tenDayContractsEnabled` | true | **false** | NBA-specific roster mechanic |
| `twoWayContractsEnabled` | true | **false** | NBA G-League linkage; doesn't exist in Euro |
| `nonGuaranteedContractsEnabled` | true | true | Common in Euro for fringe players |

**Roster Sizes** (calibrated to real Liga ACB + EuroLeague rules)
| Field | NBA | **Euro** | Real-life basis |
|---|---|---|---|
| `minPlayersPerTeam` | 14 | **11** | Liga ACB minimum registered |
| `maxPlayersPerTeam` | 17 | **16** | EuroLeague total registration cap (12 active + reserves + junior slots) |
| `maxStandardPlayersPerTeam` | 15 | **12** | EuroLeague + ACB gameday active max |
| `maxTwoWayPlayersPerTeam` | 3 | **0** | NBA-only G-League linkage; doesn't exist in Euro |
| `maxTrainingCampRoster` | 21 | **20** | Preseason allows expanded squad for evaluation |

**Schedule / Playoffs** — *NBA-globals stay NBA-default so the background NBA sim keeps running*

The global `leagueStats.gamesPerSeason / numGamesPlayoffSeries / divisionGames / conferenceGames / playIn / inSeasonTournament` fields stay at NBA values in any save (incl. Euro Isolated). NBA's quiet background sim reads them. **Euro reads its schedule + playoff format from the active `CompetitionSpec` records instead** — never from the globals.

| Field | NBA & Euro | Read by | Notes |
|---|---|---|---|
| `gamesPerSeason` | **82** (unchanged in Euro saves) | NBA background sim only | Endesa reads `34` from its spec, EL reads `38` from its spec |
| `divisionGames` | **16** | NBA only | n/a for Euro |
| `conferenceGames` | **36** | NBA only | n/a for Euro |
| `numGamesPlayoffSeries` | **[7, 7, 7, 7]** | NBA only | Endesa playoff series read from spec: [3, 5, 5]; EL: [5, FinalFour] |
| `inSeasonTournament` | **true** | NBA only | Toggles NBA Cup; doesn't affect Euroleague (which is a first-class CompetitionSpec, not the NBA-Cup spec) |
| `cupPrizePoolEnabled` | **true** | NBA Cup only | Per-competition prize pools live on each spec (Slice 4) |
| `cupPrizeWinner/RunnerUp/Semi/Quarter` | filled | NBA Cup only | EL/Endesa/Copa/Supercopa each carry their own prize pool on the spec |
| `playIn` | **true** | NBA only | EL spec defines its own Play-In Showdown shape |

**Trade Deadline / Free Agency** — these are global windows used by both NBA and Euro modes
| Field | NBA | **Euro (Spain)** | Notes |
|---|---|---|---|
| `tradeDeadlineMonth` / `Ordinal` / `DayOfWeek` | Feb / 1st / Thu | **n/a (trades off by default)** | If commissioner enables `tradesAllowed`, mid-Feb is correct for both |
| `faStartMonth` / `faStartDay` / `faMoratoriumDays` | Jul / 1 / 6 | **Jun / 30 / 0** | Euro FA opens earlier, no moratorium |
| `regularSeasonFAEnabled` | true | true | Same |
| `postDeadlineMultiYearContracts` | true | true | Same |
| `minGamesRequirement` | 65 | **20** | FIBA awards eligibility, lower threshold (per-mode override of the global) |

**Architectural rule:** Every Euro consumer (schedule generator, standings calc, playoff bracket, prize pool display) reads from `CompetitionSpec`, never from `leagueStats.*` schedule globals. NBA consumers continue to read from globals. This keeps the NBA background sim untouched while Euro evolves freely per-competition.

**Game Rules (FIBA defaults)**
| Field | NBA | **Euro / FIBA** | Notes |
|---|---|---|---|
| `quarterLength` | 12 | **10** | FIBA quarters are 10 min |
| `numQuarters` | 4 | 4 | Same |
| `overtimeDuration` | 5 | 5 | Same |
| `foulOutLimit` | 6 | **5** | FIBA disqualification at 5 fouls |
| `teamFoulPenalty` | 5 | **5** | Same |
| `threePointLineDistance` | 23.75 | **22.15** | FIBA 6.75m |
| `defensiveThreeSecondEnabled` | true | **false** | FIBA has no def-3-second |
| `defensiveThreeSecondValue` | 3 | **0** | n/a |
| `clutchTimeoutLimit` | 2 | **2** | Same |
| `maxTimeouts` | 7 | **5** | FIBA: 2 in H1, 3 in H2, 1 per OT |
| `coachChallenges` | true | **false** | Not in FIBA |
| `maxCoachChallenges` | 2 | **0** | n/a |

**All-Star / Awards / Cup**
| Field | NBA | **Euro** | Notes |
|---|---|---|---|
| `allStarGameEnabled` | true | **false** | No All-Star in Euro Isolated MVP |
| `allStarDunkContest` | true | **false** | |
| `allStarThreePointContest` | true | **false** | |
| `allStarShootingStars` / `allStarSkillsChallenge` / `allStarHorse` / `allStarOneOnOneEnabled` / `allStarThroneEnabled` | various | **all false** | |
| `risingStarsEnabled` | true | **false** | NBA Rising Stars Game |
| `celebrityGameEnabled` | true | **false** | |

**Inflation**
| Field | NBA | **Euro** | Notes |
|---|---|---|---|
| `inflationEnabled` | true | true | Same — wage inflation matters in Euro too |
| `inflationMin` / `Max` / `Average` / `StdDev` | tuned for NBA | **smaller range** | Euro budgets are smaller; absolute deltas smaller |

**New Euro-only fields (introduced by this slice)**
| Field | Default | Used by |
|---|---|---|
| `currency` | `'EUR'` (Spain) | Slice 1b formatCurrency, all salary displays |
| `tradesAllowed` | `false` | Slice 2 sidebar gate |
| `uiMode` | `'euro_isolated'` | Every league-aware helper |

**New Tycoon-layer fields (introduced by FM tycoon plan, default values)**
| Field | Default | Used by |
|---|---|---|
| `tycoonEnabled` | true (Spain) / false (NBA) | Tycoon T1 |
| `ffpRollingYears` | 3 | Tycoon T16 |
| `ffpDeficitThresholdEUR` | 30,000,000 | Tycoon T16 |
| `boardConfidenceStart` | 60 | Tycoon T17 |

- **AC:** Spain save inspection: every field above matches the Euro column. Commissioner can flip any individually. NBA save: untouched.

### Slice 1c — Endesa + Euroleague team population overrides

- `Status (2026-05-10): shipped. Added `src/data/templates/spain/teamPopulations.ts` and applied its overrides inside `fetchEuroleagueRoster` / `fetchEndesaRoster` whenever incoming population data is missing or still the `1.0` placeholder.`

- `Status (2026-05-10): shipped. Added `src/data/templates/spain/teamPopulations.ts` and applied its overrides inside `fetchEuroleagueRoster` / `fetchEndesaRoster` whenever incoming population data is missing or still the `1.0` placeholder.`

- **One sentence:** Add a constants table mapping every Endesa and Euroleague club to its realistic city population (Madrid 6.7M, Barcelona 5.6M, Burgos 0.18M, Athens 3.1M, Tel Aviv 4.4M, …); apply at fetch time when the source gist's `pop` is missing or the flat 1.0 default.
- **Value:** Foundation for the whole Tycoon layer. AC-T1 (real budget) and AC-T4 (sponsorships tied to prestige) both consume `team.pop`. Without realistic pops, every Endesa club ends up with the same revenue tier and the budgeting depth collapses. Also affects matchday revenue, attendance modeling, and external-FA "home city bias".
- **Path:**
  - New constants table `src/data/templates/spain/teamPopulations.ts` exporting `ENDESA_TEAM_POPULATIONS: Record<number, number>` keyed by post-offset tid (e.g. `5012` for Real Madrid → 6.7).
  - Same pattern for `EUROLEAGUE_TEAM_POPULATIONS: Record<number, number>` covering the 20 EL clubs (cities span Madrid, Barcelona, Athens, Tel Aviv, Istanbul, Belgrade, Paris, Berlin, Munich, Milan, Bologna, Vilnius, Kaunas, Monaco, Vitoria, Valencia, Dubai).
  - Patch `fetchEndesaRoster` and `fetchEuroleagueRoster` in `externalRosterService.ts` (~10-line hook each): when `t.pop` is missing or === 1.0, look up override; fall back to 1.0 only if no override found.
  - Mirrors the existing `pbaOverrides` pattern in `VisitNonNBAModal.tsx:79-95` — same idea, applied at fetch time so every consumer benefits.
- **AC:**
  - `state.nonNBATeams.find(t => t.tid === 5012).pop === 6.7` (Real Madrid).
  - `state.nonNBATeams.find(t => t.tid === 5008).pop` ≈ 0.18 (Burgos) — small-market clubs feel the squeeze.
  - All 18 Endesa teams + all 20 Euroleague teams have pop overrides defined; no team falls through to the flat 1.0 default.
  - Tycoon plan's AC-T1 budget computation produces realistic spread: Real Madrid budget tier ≫ Burgos budget tier.

### Slice 2 — Sidebar nav: three independent gates (draft / trades / mode)

- **One sentence:** `NavigationMenu` reads **three independent gates**, each driven by a single commissioner setting — `isNoDraftLeague(state.leagueStats)` hides all Draft tabs, `state.leagueStats.tradesAllowed === false` hides Trade Machine + Trade Finder + Trade Proposals, and `isEuroIsolatedMode(state)` hides All-Star / NBA Cup / Hall of Fame / NBA Central — so commissioners can compose any combination without the gates leaking into each other.
- **Value:** AC-2. Pure commissioner-setting drives each visibility decision. Trade visibility decoupled from "is this Euro" — a commissioner who sets `tradesAllowed: false` in any save (NBA, Euro, fictional) gets clean trade-free UI.
- **Path:** Wrap nav-group items in conditional spreads, gates composed by `&&`:
  ```ts
  // Draft gate
  ...(isNoDraftLeague(state.leagueStats) ? [] : [
    { id: 'Draft Scouting', ... },
    { id: 'Draft Lottery', ... },
    { id: 'Draft Board', ... },
  ]),
  // Trade gate — pure commissioner setting, independent of mode/league type
  ...(state.leagueStats.tradesAllowed === false ? [] : [
    { id: 'Trade Machine', ... },
    { id: 'Trade Finder', ... },
    ...(isGM ? [{ id: 'Trade Proposals', ... }] : []),
  ]),
  // Euro-mode gate — purely UI mode (different from setting toggles)
  ...(isEuroIsolatedMode(state) ? [] : [
    { id: 'All-Star', ... },
    { id: 'NBA Cup', ... },
    { id: 'Hall of Fame', ... },
    { id: 'NBA Central', ... },
  ]),
  ```
- **AC:** Each gate verifiable independently:
  - NBA-default save (`draftType !== 'no_draft'`, `tradesAllowed !== false`, `uiMode !== 'euro_isolated'`): full sidebar.
  - NBA save + `draftType: 'no_draft'` only: Draft tabs gone; everything else stays.
  - NBA save + `tradesAllowed: false` only: Trade UI gone; everything else stays (NBA Cup, All-Star still visible).
  - NBA save + both `draftType: 'no_draft'` and `tradesAllowed: false`: Draft + Trade UI gone; All-Star / NBA Cup still visible.
  - Spain Euro Isolated save (auto-applies all three settings): Draft + Trade + NBA-mode UI all gone; Euroleague + Endesa-Standings tabs visible (added by other slices).

### Slice 2b — Reusable league-aware team picker (`<TeamSelector>`)

- **One sentence:** Replace every ad-hoc team dropdown / picker / selector across the app with one canonical `<TeamSelector>` component that auto-scopes to the active league(s) via `getActiveLeagueTeams(state)` and supports three render variants — `'grid' | 'dropdown' | 'list'` — for the different consumer needs.
- **Value:** AC-2 + AC-7 + AC-8 + transferability mandate. Today there are ~12 team pickers, each with its own NBA-only `state.teams.map` or `state.teams.find`. Adding France/Germany/Italy templates without this slice means patching 12 places per template.
- **Path:**
  - New `src/components/shared/TeamSelector.tsx` exporting `<TeamSelector variant="grid|dropdown|list" value={tid} onChange={...} scope?="active|nba|all|nonNba" />`.
  - Default `scope` is `'active'` → consumes `getActiveLeagueTeams(state)`. Overrides for Trade Machine commissioner-mode (`'nba'`), Visit Non-NBA modal (`'nonNba'`), debug (`'all'`).
  - Variants:
    - `grid` — replaces `TeamOffice/Home.tsx`'s 30-team grid + `TrainingFranchisePicker`'s East/West split (when in non-NBA mode, falls back to single bucket sorted by OVR).
    - `dropdown` — replaces filter dropdowns in `PlayerStatsView`, `Trade Finder`, `Trade Machine` (`<TeamDropdown>` in Trade Machine), `Standings` toggles, etc.
    - `list` — replaces sidebar lists in `VisitNonNBATeams`, `LeagueOfficeSearcher`, `NewChatModal` org picker.
  - Each consumer call site shrinks from ~30 LOC of bespoke filtering to `<TeamSelector variant="..." value={...} onChange={...} />`.
- **AC:** All ~12 team-picker sites in the codebase render via `<TeamSelector>`. Spain Euro Isolated save: every dropdown/picker/grid shows Endesa + Euroleague teams, not NBA. NBA-default save: every picker shows the 30 NBA teams (no behavioral regression). Adding a France template later requires zero picker-component changes.
- **Out of scope of this slice:** the picker itself only renders + emits `onChange(tid)`. Selection-side-effects (cap recompute, narrative dispatch, etc.) stay with the consumer.

### Slice 2c — Country flags in setup picker + team selectors

- **One sentence:** Setup's country/template picker shows a country flag for each available template (🇪🇸 Spain, future 🇬🇷 Greece, 🇫🇷 France, 🇩🇪 Germany, 🇮🇹 Italy …); `<TeamSelector>` in cross-country contexts (Euroleague picker) shows each team's country flag inline next to the club name.
- **Value:** Visual clarity at the most important UX moments — picking your country at setup, scanning a Euroleague picker with 20 clubs from 11 countries.
- **Path:**
  - New `src/utils/countryFlags.ts` with `getCountryFlag(country: string): string` — returns emoji flag (`'Spain' → '🇪🇸'`, `'Greece' → '🇬🇷'`, …) for the 11 Euroleague countries plus a few extras for future. Pure-string emoji works without image assets.
  - For Endesa teams: all flags are 🇪🇸 (`ENDESA_TEAM_COUNTRY` is `'Spain'`).
  - For Euroleague teams: lookup via existing `EUROLEAGUE_TEAM_COUNTRIES` constants table (`tid → country`).
  - `<TeamSelector>` accepts a `showFlag?: boolean` prop (default true for Euroleague, false for Endesa-only contexts to avoid 18 identical flags).
  - Setup country/template picker (in `CommissionerSetup`): flag rendered next to country name + Endesa/Euroleague club count preview.
- **AC:**
  - Setup → Modded → Europe → country picker: each country option (Spain for now) shows its flag prominently. Template registration is data-driven so France/Germany/Italy templates surfacing later automatically render with their flag.
  - Euroleague-context team selector (e.g. when scouting opponents): each of the 20 clubs shows its country flag (Real Madrid 🇪🇸, Olympiacos 🇬🇷, Bayern 🇩🇪, ASVEL 🇫🇷, …).
  - Endesa-only team selector (scouting Endesa rivals): flag column suppressed since all are 🇪🇸.

### Slice 3 — Generic schedule generator engine (config-driven, no hardcoded league)

- **One sentence:** One generator `services/scheduling/competitionScheduler.ts` reads a `CompetitionConfig` and emits the right schedule shape — round-robin, knockout, group+knockout, tournament — so adding France's LNB or Germany's BBL is just a new config file.
- **Value:** Replaces 4 separate hardcoded generators with one engine. AC-5 + transferability mandate.
- **Path:**
  - `generateForCompetition(config: CompetitionConfig, teams: Team[], seasonStart: Date)` returns `Game[]` tagged with `competitionId` + `phase`.
  - Engine handles each `format`:
    - `round-robin` → double round-robin if `gamesPerTeam = (teamCount-1)*2`, single if `gamesPerTeam = teamCount-1`.
    - `knockout` → single-elimination from selected teams, scheduled across given days.
    - `group-knockout` → group stage round-robin then knockout (Euroleague-style).
    - `tournament` → fixed bracket structure (Supercopa = 2 SF + 1 Final, Final Four = 2 SF + 1 Final).
  - Date placement consumes `daysOfWeek` and `blackoutPeriods` from config.
- **AC:** Fresh Spain save: `state.activeCompetitions.forEach(c => generateForCompetition(c, ...))` produces ~306 ACB + 380 EL + 7 Copa + 3 Supercopa games. Each tagged correctly. No competition-specific code branches.

### Slice 4 — Spain template config: ACB + Euroleague + Copa + Supercopa as data

- **One sentence:** Author 4 `CompetitionConfig` records in `src/data/templates/spain/competitions.ts` — Endesa (round-robin Sep–May), Euroleague (group-knockout Sep–May, incl. Best-of-5 QFs + Final Four), Copa del Rey (knockout Feb), Supercopa (tournament Sep) — each with realistic real-world prize-pool values, and wire them through Slice 3's generator on Spain save init.
- **Value:** AC-3 + AC-5 + AC-9. Whole Spanish calendar materializes from config. Prize pools feed directly into Tycoon-layer revenue (AC-T1).
- **Path:**
  - `spain/competitions.ts` exports `SPAIN_COMPETITIONS: CompetitionSpec[]`.
  - Setup commits `state.activeCompetitions = SPAIN_COMPETITIONS` for Spain Euro Isolated saves.
  - Schedule generation at season start iterates `state.activeCompetitions` and calls `generateForCompetition` for each.
  - **Prize pools** (real-world calibrated, in EUR; the existing NBACupView `<PrizePool>` component is reused via Slice 7's `CompetitionView`):
    - **Euroleague** — by far the biggest pot. Champion ~€1M, Runner-Up ~€500K, Semis ~€250K, QF ~€100K. Plus group-stage participation fee per club ~€200K (paid even if eliminated early). Real-world EL Champion's Bonus is the biggest non-NBA basketball prize on the calendar.
    - **Endesa** — Champion ~€500K, Runner-Up ~€200K, smaller per-round bonuses.
    - **Copa del Rey** — Champion ~€200K, smaller knockout payouts.
    - **Supercopa** — Champion ~€100K, Runner-Up ~€50K (it's a 1-weekend opener, prize is symbolic).
    - All values are commissioner-overridable (Slice 1b's settings panel).
  - At season-end rollover, each club's prize-pool earnings (per finish position) are added to `team.budget.revenue` for the Tycoon layer.
- **AC:** Real Madrid in a Spain save plays:
  - 34 Endesa games on Fri-Sun
  - 38 Euroleague regular Tue-Thu
  - up to 7 EL playoff games (QF Best-of-5 + Final Four if seeded)
  - up to 3 Copa del Rey knockout (if top-8)
  - up to 2 Supercopa games (if qualified)
- **AC (prize pool):** End-of-season Tycoon ledger shows per-competition prize earnings. Winning Euroleague adds ~€1M to `team.budget.revenue` next season. Failing to qualify for EL Final Four costs ~€750K vs winning. Endesa title is meaningful but financially smaller than EL Final Four run.

### Slice 4b — Schedule View / DayView competition indicator (eyebrow badge)

- **One sentence:** Every game card in `ScheduleView`, `DayView`, and `GameBar` shows a competition badge (color + short label like "EL Group Stage" / "ACB R20" / "Copa SF") above the matchup, mirroring how NBA Cup games carry an "NBA Cup" eyebrow.
- **Value:** AC-5 visual clarity — user instantly sees what competition each game is.
- **Path:**
  - Read `game.competitionId` + `game.phase`, look up the matching `CompetitionConfig` for `accentColor` + `displayName` + `shortName`.
  - Add a small `<CompetitionBadge competitionId={...} phase={...} />` component reused across `DayView`, `ScheduleView` calendar dots, `GameBar` strip, `BoxScoreModal` header.
  - Calendar dots: tinted by competition accent (orange for EL, red for Endesa, gold for Copa, etc.).
- **AC:** Schedule for May 2026 in Real Madrid save shows:
  - May 22 EL Final Four SF with orange badge
  - May 25 ACB W33 with red badge
  - May 30 ACB W34 with red badge
  - Calendar dots colored to match.

### Slice 5 — Schedule view + DayView render multi-competition fixtures

- **One sentence:** Schedule UI groups today's games by competition (Endesa / Euroleague / NBA-hidden) and shows Real Madrid's combined week in DayView.
- **Value:** AC-5. User can navigate the season calendar and see the right games per day.
- **Path:** `ScheduleView` already iterates `state.schedule` — add a competition-tag-aware filter. NBA games stay in `state.schedule` but get filtered out when `isEuroIsolatedMode(state)`.
- **AC:** Open Schedule tab on a Tuesday → Euroleague games. Saturday → Endesa. Real Madrid week shows 1 EL + 1 Endesa.

### Slice 6 — Standings view becomes competition-aware

- **One sentence:** `StandingsView` reads `competition`-tagged games and produces an Endesa points table (per Endesa rules: 2 pts win / 1 loss).
- **Value:** AC-4. Real Endesa standings instead of NBA East/West fallback.
- **Path:** Branch in `StandingsView`: if `isEuroIsolatedMode(state)` → render Endesa table from `state.boxScores.filter(b => b.competition === 'endesa')`. NBA path unchanged.
- **AC:** Sim one Endesa weekend → standings table updates with new W/L.

### Slice 7 — Repurpose `NBACupView` as `CompetitionView`, render Euroleague variant

- **One sentence:** Extract the cup-style Group + Bracket + AllTournament components into a generic `CompetitionView` and add a Euroleague variant fed by Euroleague schedule data.
- **Value:** AC-3. Euroleague tab shows real group standings, knockout bracket, Final Four when reached.
- **Path:** `NBACupView` becomes a thin wrapper that passes NBA-specific data to `CompetitionView`. New `EuroleagueView` does the same with Euroleague data + orange-red palette. Sidebar gets one new tab "Euroleague" (only in Euro Isolated mode).
- **AC:** Open Euroleague tab → group standings populate as games sim. After group stage, bracket renders.

### Slice 8 — Offseason wires Euroleague Final Four + Endesa playoffs

- **One sentence:** Season rollover detects Euro-Isolated mode and runs Endesa playoffs (top-8 bracket Best-of-3 / Best-of-5 / Best-of-5) and Euroleague Final Four (single-elimination, neutral site).
- **Value:** AC-9. Season ends with real competitions, not just NBA Finals stuck in some hidden state.
- **Path:** New entries in `seasonRollover.ts` keyed on competition. Reuse `playoffs` state shape per competition. Final Four = 2 SF + 1 Final, sim'd as exhibition-style (no home/away).
- **AC:** Sim past June → Endesa Champion + Euroleague Final Four winner appear in `state.history`.

### Slice 9 — Default views (Player Stats / Bios / Ratings) scope to active league pool

- **One sentence:** `PlayerStatsView` / `PlayerBiosView` / `PlayerRatingsView` default their league filter to `Euroleague` + `Endesa` (combined) when `isEuroIsolatedMode(state)`; user can still flip to NBA in the dropdown.
- **Value:** AC-7. Real Madrid GM doesn't see LeBron stats by default.
- **Path:** Each view has an existing league dropdown; just change the default.
- **AC:** Open Player Stats fresh → top 50 are Euroleague + Endesa players, not NBA.

### Slice 10 — Free Agents view pools NBA + Endesa + Euroleague FAs

- **One sentence:** `FreeAgentsView` filter logic includes NBA-FA + Euro-league-FA in the default list when in Euro Isolated mode.
- **Value:** AC-8.
- **Path:** Audit `state.players.filter(p => p.tid === -1 ...)`; ensure Euro FAs don't get filtered out by an NBA-only branch.
- **AC:** Free Agents tab shows ~200+ players spanning all loaded leagues.

### Slice 10b — League Portal (NBA preview overlay) — sidebar footer

- **One sentence:** Add a **League Portal** button at the bottom of the sidebar (under the Finances group) that swaps the entire UI into a read-only preview of any other loaded league — primarily NBA from the Spain user's POV — with a "Back to Liga ACB" button to return; same mechanism extends to future portal targets (peek into Greece's HEBA from a Spain save once that template loads).
- **Value:** AC-10 visibility upgrade. The Portal is the *named architectural surface* for navigating between parallel league experiences in one save. Confirms NBA is alive, gives flavor, and pre-shapes the cross-league exploration story.
- **Path:**
  - New transient field `state.portalTarget?: 'nba' | string | null` (null = active primary league; string = a competition-spec id loaded but not primary). NOT persisted in saves — purely a UI overlay.
  - New `useEffectiveUiMode(state)` hook returns: `state.portalTarget === 'nba' ? 'nba' : (state.leagueStats.uiMode ?? 'nba')`.
  - All league-aware helpers (`isEuroIsolatedMode`, `getActiveLeagueTeams`, `<TeamSelector>` default scope, sidebar nav gating, Standings/PlayerStats/CompetitionView/etc.) consult `useEffectiveUiMode` instead of `leagueStats.uiMode` directly.
  - New `<LeaguePortalButton>` rendered as sidebar footer (after Finances group):
    - `portalTarget === null` + `uiMode === 'euro_isolated'`: button reads "🌐 Open NBA Portal".
    - `portalTarget === 'nba'`: button reads "← Back to Liga ACB" (text driven by active league's `displayName`).
    - NBA-default saves: button hidden (no useful target).
  - Read-only enforcement in Portal: dispatch actions that mutate (sign FA, save gameplan, edit roster, etc.) blocked with toast "Close the Portal to make changes". Browse + sim-result views all work.
  - Future extension: when other country templates ship, Portal can target their leagues too — same component, just another spec id. The Portal is the durable surface, not a one-off NBA toggle.
- **AC:** Spain Real Madrid save:
  - Sidebar footer shows "🌐 Open NBA Portal" button.
  - Click → sidebar replaces Endesa/Euroleague tabs with NBA Cup, All-Star, NBA Central. Standings → NBA East/West. Player Stats defaults to NBA pool.
  - Button now reads "← Back to Liga ACB".
  - Trying to dispatch a roster mutation while in Portal: toast appears, dispatch dropped.
  - Click "Back": returns to Euro Isolated UI; nothing was mutated.

### Slice 6b — TeamIntel Euro adaptation

- **One sentence:** TeamIntel banner shows Endesa-points-table rank + Euroleague-group-rank instead of NBA Conf/Div ranks; "Cap Space" replaced with "Wage Headroom" (transfer + wage budget pulled from Tycoon T1); `Trading Block` / `Untouchables` / `Target List` cards stay (work for any roster); `Expiring Contracts` card stays unchanged.
- **Value:** AC-2 + AC-13 visible: TeamIntel today is a rich GM dashboard — without this slice it shows NBA "Conf/Div TBD" placeholders and a meaningless cap-space figure for Euro clubs. With this slice it's a first-class Euro intel hub.
- **Path:**
  - Banner read: `team.conference` ranking → look up via active CompetitionSpec (Endesa = single table, no Conf/Div; Euroleague = group A/B if applicable, else single bracket position).
  - Branch in `TeamIntel.tsx`:
    - `isEuroIsolatedMode(state)` → render two stat boxes: "Endesa #N" + "EL #N (Group X)" instead of "Conf #N / Div #N".
    - Cap Space label → "Wage Headroom" with currency from Slice 1b. Value = Tycoon T1's `team.budget.wageBudget - team.budget.playerWages - team.budget.staffWages`.
  - **Drop**: NBA `Trading Block — Picks` row (handled by Slice 9b "draft UI deletion sweep" below).
  - Status pill (`CONTENDING` / `REBUILDING` / etc.) — works as-is, just feeds via existing `resolveTeamStrategyProfile` which is league-agnostic.
- **AC:** Real Madrid TeamIntel banner: "Endesa #1 · EL #2 (Group A) · Wage Headroom €18.4M". Trading-block / untouchables / targets all work, list Endesa+Euroleague players. No Draft Picks row.

### Slice 8b — TeamFinancesViewDetailed Euro variant

- **One sentence:** When `isEuroIsolatedMode(state)`, TeamFinancesView swaps the NBA cap utilization bar for a Tycoon-style annual ledger (revenue → wages → facility/scouting/travel → prize-pool earnings → profit), the payroll pie becomes a wage-pie + revenue-pie pair, contract timeline stays, two-way/dead-money panels are dropped (irrelevant in Euro), draft-related rows are gone.
- **Value:** AC-1 + AC-12 + AC-13 — the most-used finance screen in the app, fully Euro-native. Reuses 70% of the existing NBA-side chrome (header, contract timeline, contract pie) but the data shape underneath flips.
- **Path:**
  - Branch in `TeamFinancesViewDetailed.tsx` on `isEuroIsolatedMode(state)`:
    - **Top row**:
      - "Total Payroll" → "Annual Wage Bill" (player + staff in EUR).
      - "Cap Utilization" → "Budget Utilization" — same 4-segment bar shape, but segments now mark Wage Budget / Operating Costs / Prize Earnings / Profit Margin (or deficit).
    - **Contract Timeline**: kept — works for any contract, currency from Slice 1b.
    - **Position Payroll Pie**: kept — Guards/Forwards/Centers split, displayed in EUR.
    - **High-Earners Pie**: kept — threshold becomes `>€2M` instead of `$8M+` (configurable).
    - **Two-Way / Non-Guaranteed / Dead Money panels**: hidden (concepts don't apply in Euro).
    - **NEW Euro panel**: "Annual Ledger" card listing each Tycoon T1 line (Revenue • Player Wages • Staff Wages • Facility Ops • Scouting Ops • Travel • Prize Pool Earnings • Sponsorships • **Profit**) with delta from prior year.
    - **NEW Euro panel**: "Sponsorship Deals" card (3 slots from Tycoon T2) with `valuePerYear` + `yearsRemaining` per deal.
  - Old NBA path (when not Euro Isolated) untouched.
- **AC:** Real Madrid TeamFinancesView shows: Annual Wage Bill €60M / Budget Utilization bar with profit margin / Position pie in EUR / Annual Ledger panel summing to +€44M profit / Sponsorship Deals panel listing kit/sleeve/stadium with remaining years. Burgos shows the same view shape but with smaller numbers, possibly negative profit triggering Tycoon T7 bankruptcy ladder.

### Slice 9b — Draft-UI deletion sweep (gated on `isNoDraftLeague`, not on Euro mode)

- **One sentence:** Every draft-pick artifact across the app — Trading Block "Picks" subsection, Trade Machine pick-asset picker, TeamOffice Draft Picks tab, DraftScouting tab, Trade Finder pick-aware suggestions, Pick Trade History — is **gone** from the UI when `isNoDraftLeague(state.leagueStats)` returns true.
- **Value:** AC-2 strict completeness. The right gate: a commissioner who simply turns off the draft (in any save) gets clean UI. User mandate: "kein draft, nicht weil es ist euro, sondern weil draft ist nicht aktive da. im settings".
- **Path:** Audit every site that renders a `DraftPick` shape:
  - `TeamOffice/pages/DraftPicks.tsx` — already gated (Slice 2 sidebar removes the tab) but the component-level `if (isNoDraftLeague(state.leagueStats)) return null` defence-in-depth.
  - `TradingBlock.tsx` — Picks subsection wrapped in `!isNoDraftLeague(state.leagueStats) && (...)`.
  - `TradeMachineModal.tsx` — pick-asset selector wrapped in `!isNoDraftLeague(state.leagueStats) && (...)`.
  - `TradeFinderView.tsx` — disable pick-aware suggestions when no_draft.
  - `Trade Proposals` views — pick rows hidden when no_draft.
  - `TeamIntel.tsx` — Trading Block Picks row hidden (already noted in Slice 6b but using the right gate).
  - Any LLM prompts that mention "draft picks" — branch via `isNoDraftLeague` and emit transfer-fee language instead.
  - Schedule generator / lazySimRunner — `autoRunDraft` / `autoRunLottery` already gated by `isNoDraftLeague` (Phase 1 Slice 3).
- **AC:** Three verifiable scenarios:
  - NBA-default save: all draft UI present (no regression).
  - NBA save + commissioner toggles `draftType: 'no_draft'` mid-game: every draft artifact disappears across the app.
  - Spain Euro Isolated save (which auto-applies `no_draft`): same clean UI as scenario 2 plus Euro-specific UI from other slices.
  - DOM inspection in no_draft saves: zero matches for "Pick" / "Round" / "Lottery" outside legacy LLM-rendered text from before the toggle.

### Slice 9d — Trade-UI deletion sweep (gated on `tradesAllowed === false`)

- **One sentence:** Same sweep as Slice 9b but for trade-related artifacts — every trade UI / button / panel / engine path checks `state.leagueStats.tradesAllowed === false` and disappears, mirroring how Slice 9b deletes draft-pick UI.
- **Value:** AC-2 strict. User mandate: "alle trade und so weiter" — trade UI must be fully gone when commissioner sets `tradesAllowed: false`, regardless of league type or mode.
- **Path:** Audit every site that renders or dispatches trade-related logic:
  - **Sidebar entries** (Slice 2 already covers): Trade Machine, Trade Finder, Trade Proposals.
  - **`TeamIntel.tsx`** — Trading Block / Untouchables / Targets sections. Wrap whole sub-block in `!tradesDisabled && (...)` guard. (`Untouchables` is arguably useful even without trades — debatable; default = hide along with rest.)
  - **`TeamOffice/pages/TradingBlock.tsx`** — top-level `if (state.leagueStats.tradesAllowed === false) return null` defence-in-depth. Tab also hidden via Slice 2 sidebar gate.
  - **`TradingBlockStore`** — keep persistence working in case user re-enables trades; just hide the UI surface.
  - **Trade buttons across modals** — Player Action Modal "Propose Trade", PlayerBio "Add to Trade Block", any "Initiate Trade" entry points get hidden.
  - **AI trade engine** — `AITradeHandler.runDailyTradeCycle` already runs at sim time; gate the entire entry: if `tradesAllowed === false`, early-return `{}`. Same for `inboundProposalGenerator`. Same for `findOffers` in Trade Finder.
  - **Inbox events** — drop "trade offer received" / "trade declined" / "trade approved" event types when trades disabled (don't generate, don't render if legacy-pending).
  - **LLM prompts** — trade-narrative prompt branch via gate; emit transfer-fee or signing language instead.
  - **TeamFinancesViewDetailed** — drop "Recent Trades" panel if present; Two-Way / Dead-Money panels already gated by Slice 8b's Euro variant.
  - **Stat / Ledger entries** — `state.history` events of type `'Trade'` continue to render in the Transactions log (historical record matters), but no NEW trade entries get appended while disabled.
- **AC:** Three verifiable scenarios:
  - Default save (`tradesAllowed !== false`): full trade UX (no regression).
  - NBA save + commissioner sets `tradesAllowed: false`: every trade button / tab / panel / proposal flow disappears across the app. AI sim runs without generating trades.
  - Spain Euro Isolated save (auto-applies `tradesAllowed: false`): same clean trade-free UI plus other Euro-specific changes.
  - Re-enabling `tradesAllowed: true` mid-game restores everything live; persisted trading-block state intact.

### Slice 9c — Offseason Aufgaben Euro structure

- **One sentence:** `OffseasonAufgaben` sidebar in Euro Isolated mode shows a tailored Euro task list — Player Options, Qualifying Offers, My FAs (re-sign), Free Agency, Sponsor Renewals (Tycoon T2), Facility Upgrades (Tycoon T5), Training Camp — instead of the NBA list with skipped Draft rows.
- **Value:** Phase 1 already filters draft rows out via `getVisibleOffseasonRows`. This slice extends the list with **new** Euro-only rows (Sponsor Renewal Deadline, Facility Upgrade Selection, Pre-Season Friendlies / Supercopa) so the GM has Euro-specific things to do during the offseason.
- **Path:**
  - Add new `OffseasonChecklistRow` enum values: `'sponsorRenewals' | 'facilityUpgrades' | 'preseasonFriendlies'`.
  - `getVisibleOffseasonRows` returns Euro-specific row order when `isEuroIsolatedMode(state)`: `['options', 'qualifyingOffers', 'myFAs', 'freeAgency', 'sponsorRenewals', 'facilityUpgrades', 'preseasonFriendlies', 'trainingCamp']`.
  - New `OFFSEASON_ROW_LABELS` + `_DESCRIPTIONS` entries for the three new rows.
  - Sponsor Renewals deep-links to the new TeamFinancesView "Sponsorship Deals" card.
  - Facility Upgrades deep-links to TeamOffice → Facilities (Tycoon T5).
  - Preseason Friendlies deep-links to Schedule view filtered for `competitionId: 'supercopa'` + exhibition slots.
- **AC:** Spain Real Madrid offseason: sidebar lists 8 actionable rows, none draft-related. Clicking "Sponsor Renewals" navigates to TeamFinancesView with the deals card scrolled into view.

### Slice 10c — League Finances View Euro variant (other-teams overview)

- **One sentence:** `LeagueFinancesView` (the all-teams payroll/attendance overview) gets an Euro variant: each row is an Endesa club with annual budget tier, sponsorship rank, recent EL run, projected profit/loss — same row+sort shape as the NBA version but Euro columns.
- **Value:** Lets the user compare their club's tycoon footing against rivals — central FM-style screen.
- **Path:**
  - Branch in `LeagueFinancesView.tsx` on `isEuroIsolatedMode(state)`.
  - Replace NBA columns (Cap status, MLE, TPE, expiring count) with Euro columns (Budget tier, Sponsorship value, EL appearance years/3, Profit projection).
  - Reuse the existing row layout + sort / filter chrome — only the data shape changes.
  - Reuse `estimateAttendance` from `attendanceUtils` for the matchday revenue column (it already takes `team` + `players`, doesn't assume NBA).
- **AC:** Real Madrid GM opens League Finances → sees all 18 Endesa clubs ranked by budget tier; Real Madrid #1, Burgos #18; column headers in EUR; can sort by sponsorship value, profit projection.

### Slice 11 — Browser smoke test (deferred to user)

- **One sentence:** Walk a fresh Spain Real Madrid save through Setup → first week → Trade Deadline → Final Four → Offseason and check off all 10 ACs.
- **Owner:** User. After confirming, delete this plan file.

## Risks & Open Questions

- **R1: Schedule generator complexity**: real Endesa + Euroleague calendars have rest days, EuroBasket international windows, blackout dates. MVP tolerates a simplified calendar (no breaks); polish later.
- **R2: NBA in background may bloat saves**: NBA games still simulate, accrue boxscores/history. Consider adding a "NBA pruning" pass that drops old NBA boxscores periodically. Or just live with it for MVP.
- **R3: News/Social feed will still pump NBA narrative**: the LLM pipeline doesn't know we're hiding NBA. User said "ich glaube das es ist ok" — leave for MVP, fix in a follow-up by passing `uiMode` to the LLM context.
- **OQ-1**: Is there a difference between the Euroleague-loaded Real Madrid (tid in 1000-range) and the Endesa-loaded Real Madrid (tid in 5000-range)? Today the `SHADOWED_ENDESA_TEAM_TIDS` keeps both in Spain mode. Slice 1 needs to decide: does the user pick *one* Real Madrid (probably Endesa, tid 5012, since they're playing domestic primarily)? Then Euroleague matches reference the Euroleague-tid version, which has same name but separate roster?
- **OQ-2**: Should the Trade Machine stay accessible in commissioner-mode but hidden in GM-mode for Euro Isolated? Current decision: hide trade UI in GM-mode entirely.

## Process

1. **Right now:** user confirms ACs (or adjusts) before any code starts.
2. Slices ship one at a time, each as a mergeable PR. Type-check green after each.
3. Slices 3–7 are the heavy ones. If any of those balloons, split it further before merging.
4. Slice 11 closes the plan; delete this file when checked.
