# New Features -- NBA Commish Sim

A chronological log of features added across development sessions.

---

## Session 25 (Apr 18, 2026)

- **Generated draft classes (infinite sim)** -- `genDraftPlayers.ts`, `draftClassFiller.ts`, `sportData.ts`, `genplayersconstants.ts`, `nameDataFetcher.ts`. `ensureDraftClasses` tops thin years to 100 prospects at rollover. Path mix 70% College / 10% Europe / 6% G-League / 6% Endesa / 4% NBL / 4% B-League. `currentSimYear` rewinds age+ratings for far-future classes. ×0.80 skill nerf + `potEstimator`-derived POT.
- **Faces (facesjs)** -- `MyFace.tsx` ZenGM-pattern wrapper, 2:3 aspect, reject-loop for non-basketball accessories. `PlayerPortrait` renders faces only when descriptor has real body+head slots. `DraftScoutingView` small + big avatars on facesjs path.
- **SigningModal end-to-end** -- GM preflight ("Testing Free Agency"), commissioner auto-accept + override, 2-decimal salary + hold-ramp chevrons, MLE row + "Sign with MLE", cap-violation final gate, roster-slot awareness (standard vs two-way), external-league buyout slider with FIBA cap + Mother Team Interest bar. External-league contracts synthesized at init for leagues missing gist contracts. `EXTERNAL_SALARY_SCALE` caps NBA offer at ~3x overseas peak.
- **Trade Proposals (GM)** -- `inboundProposalGenerator.ts` scans every team vs. user's trading block, builds 1/2/3-for-1/2/3 combos with +/-15% TV parity + salary legality. Auto-refreshes on `state.date` change. Hidden for commissioners.
- **`usePlayerQuickActions` hook** -- unifies player-row clicks (view_bio / view_ratings / sign / resign / waive) across NBACentral, PlayersView, FreeAgentsView, PlayerRatingsView, PlayerStatsView, PlayerBiosView.
- **Transaction Calendar (commissioner-editable)** -- `EconomyTab` section with trade-deadline month/ordinal/day-of-week, FA start, moratorium slider, year-round FA toggle, post-deadline multi-year toggle. `dateUtils` gained `getTradeDeadlineDate`, `getFreeAgencyStartDate`, `isPastTradeDeadline`, `isInFreeAgencyWindow`, `canSignMultiYear`.
- **All-Star Weekend refactor** -- `getAllStarSunday` uses `resolveSeasonDate(y, 2, 3, 'Sun', 0)` so Fri/Sat/break offsets always land on real weekdays. Announcement dates anchored as weekly offsets. `LeagueStats.allStarHosts` seeded. `AllStarHostPickerModal` + `hostAutoResolver.ts` (10-season cooldown). New `AllStarHistoryView` (gist 1951+). Portrait fix (BBGM first, CDN only on fallback).
- **Finals MVP formula** -- Finals-only aggregate (`finalsSeries.gameIds`), avg pts/reb/ast/stl/blk - tov, TS% above league avg x8, min-3-GP eligibility, minutes-load bonus. Was picking single-highest-gameScore across ALL playoff rounds.
- **Semifinals MVP** -- one per round-3 series completed in the batch, written to `historicalAwards` + `player.awards[]`. Visible in `LeagueHistoryDetailView`.
- **LeagueHistoryView best records 0-0 fix** -- rollover now overwrites BBGM-preseeded `seasons[]` entry (was kept as stale 0-0 by old `alreadyArchived` check).
- **GM Mode polish** -- welcome news tailored to "{Team} Hires {GM Name}", user's team hoists to front of TeamOffice grid with team-color glow + "Your Team" badge. TradingBlock edit-gated. Upcoming FA defaults to user team. Waive dispatches directly.
- **Inflation editor** -- integrated in `SettingsModal` via `InflationEditor` (commissioner only).
- **Draft Scouting polish** -- `maxYear` caps at furthest real-prospect year. Right chevron expands to `current+4` on fresh games. Dicebear -> facesjs.

---

## Session 24 (Apr 18, 2026)

- **DraftScouting tab (Team Office)** -- advisor big board (70% value + 30% fit), pick inventory with range projections, team mode awareness. `DraftScouting.tsx`, `TeamOfficeView.tsx`
- **Game log DNPs for season-start injured** -- `joinedMidSeason` guard lets pre-injured players show DNP rows. `PlayerBioGameLogTab.tsx`
- **G-League K2 >= 78 guard** -- no more Paul George / star tier assignments to G-League. `simulationHandler.ts`
- **External salary scale** -- Euroleague capped $5M (was $16M).
- **Currency display** -- EUR/JPY/PHP/CNY/AUD in transactions + `PlayerBioContractTab`.
- **PlayerBioContractTab** -- external team names + league column from `player.status`.
- **PlayerStatsView badges** -- ring + All-Star icons (was "RING"/"AS" text).
- **GM-mode UI hides** -- edit ratings + heal player hidden in GM mode.
- **Jumpstart lazy-sim** -- passes `stopBefore: true` so picking Oct 24 lands with opening-night games unplayed.

---

## Session 23 (Apr 17, 2026)

- **Image Caching** -- IndexedDB blob cache, auto-downloads all player portraits on game load (5-concurrent, 50ms delay), Settings toggle, default ON, clear cache button. `src/services/imageCache.ts`
- **External League Economy** -- contracts with salaries via `EXTERNAL_SALARY_SCALE` when routing to external leagues. `externalSigningRouter.ts`
- **Retirement legendMult** -- 0.30 multiplier for 15+ All-Stars now applied to ALL OVR tiers (was calculated but never used). `retirementChecker.ts`
- **Two-way contract wiring** -- `twoWay: true` flag transfer, `maxTwoWay` default 3, `TWO_WAY_OVR_CAP` raised to 52. `simulationHandler.ts`, `constants.ts`
- **Draft pick trade filter** -- completed draft picks filtered from TradeFinderView, TradeMachineModal, and AI findOffers

---

## Session 22 (Apr 17, 2026) -- 70+ items

- **Simulate-to-date lazy sim routing** -- gaps >30 days use `runLazySim` (iterative, day-by-day batches with progress overlay); <=30 days use `processTurn`. `lazySimRunner.ts`, `GameContext.tsx`
- **FAME trait** -- added to mood system. `src/utils/mood/`
- **Draft-complete view switch** -- auto-switch to results view after draft completes. `DraftSimulatorView.tsx`
- **Unified sim engine** -- `runLazySim` is now the single source of truth for all multi-day simulation
- **`computeAge()` helper** -- all 6 progression files + 9 UI components now use `born.year` instead of stale `player.age`. `src/utils/helpers.ts`
- **MLE 3-pass FA signing** -- over-cap teams sign FAs via Mid-Level Exception. `AIFreeAgentHandler.ts`
- **Broadcasting cap inflation** -- `mediaRights` inflated at rollover. `seasonRollover.ts`
- **Save isolation** -- unique `saveId` per save file
- **Training camp shuffle** -- roster shuffling during preseason
- **Playoff archival + BracketLayout everywhere** -- bracket layout used in all playoff views
- **Year chevrons** -- Standings, League Leaders, Statistical Feats all have season navigation
- **Career OVR snapshot** -- stored at rollover for progression tracking
- **Season Preview** -- Oct 1 dismissible preview card. `DayView`, `ScheduleView`

---

## Session 21 (Apr 17, 2026)

- **Season rollover in lazy sim** -- `lazySimRunner.ts` now calls `applySeasonRollover` when crossing Jun 30 (root cause of "season 2 unplayable")
- **Year-scoped schedule guard** -- `autoGenerateSchedule` checks date range, not just game existence. `autoResolvers.ts`
- **Player option history entries** -- both opt-in and opt-out written to `state.history` with news items. `seasonRollover.ts`
- **Trade GM name resolution** -- `getGMName()` helper looks up real GM names from `state.staff.gms`. `AITradeHandler.ts`
- **Commissioner signing contractYears** -- `handleSignFreeAgent` builds proper `contractYears[]`. `playerActions.ts`

---

## Session 19 (Apr 16, 2026)

- **G-League assignment system** -- auto-assign at 0 GP after 15 team games, recall on GP > 0, orange/sky badges in TransactionsView. `TransactionsView.tsx`, `simulationHandler.ts`
- **Training camp roster (21-man)** -- `maxTrainingCampRoster` in LeagueStats, preseason uses 21 slots, regular season 15. `EconomyTeamsSection.tsx`, `AIFreeAgentHandler.ts`
- **Trade salary sync on LOAD_GAME** -- syncs `contract.amount` from `contractYears[]` for current season. `GameContext.tsx`

---

## Session 17 (Apr 16, 2026)

- **AI pick sweeteners** -- buyers with >4 future 2nd rounders auto-include one; gap-fill adds up to 2 R2s + 1 R1 to close value gaps. `AITradeHandler.ts`
- **Trade Finder 3rd player slot** -- if gap >40 TV after 2 players, adds a 3rd matching player. `TradeFinderView.tsx`
- **Dynamic trade ratio threshold** -- >=200TV uses 1.15, >=100TV uses 1.35, else 1.45. `TradeFinderView.tsx`
- **Contract JSON integration** -- real per-season contract amounts from `nbacontractsdata` gist. `rosterService.ts`, `constants.ts`
- **Lazy sim pre-Aug14 eager schedule** -- fires broadcasting/global_games/intl_preseason/schedule_generation before first sim batch. `lazySimRunner.ts`

---

## Session 16 (Apr 16, 2026)

- **Player morale market size buff** -- DIVA/MERCENARY get market delta from `team.pop`; LOYAL tenure bonus. `moodScore.ts`
- **Top-3 star trade override** -- `topNAvgK2()` helper; teams with avg K2 OVR of top-3 >= 88 always classified as heavy_buyer/Contending. `salaryUtils.ts`
- **External routing age gate + distribution** -- players 30+ redirect G-League to ChinaCBA/Euroleague; seeded random distribution across leagues. `externalSigningRouter.ts`

---

## Session 15 (Apr 15, 2026)

- **effectiveRecord() helper** -- falls back to previous season W-L when GP < 10 (offseason/preseason). `salaryUtils.ts`
- **TransactionsView league filter** -- filter transactions by league
- **AI trade frequency slider** -- `aiTradeFrequency` setting (default 50) with Settings UI. `SettingsManager.ts`, `SettingsModal.tsx`

---

## Session 14 (Apr 15, 2026)

- **Trade Finder (full rewrite)** -- connected to `useGame()`, real players/picks/mood, "Find Offers" scans all 29 teams, "Manage Trade" opens TradeMachineModal inline. `src/components/central/view/TradeFinderView.tsx`
- **Trade Value Engine** -- pure calculation functions: `calcPlayerTV`, `calcPickTV`, `getTeamMode`, `autoBalance`, `isSalaryLegal`. `src/services/trade/tradeValueEngine.ts`
- **AI-AI trade execution** -- `executeAITrade()` physically moves players/picks between teams, writes history. `AITradeHandler.ts`
- **TradeMachineModal salary eyebrow** -- live salary validity badge next to each "Outgoing" header
- **Trade deadline frequency** -- normal: every 7 days, pre-deadline: every 3 days, final week: every day. `simulationHandler.ts`
- **FreeAgentsView ChinaCBA + NBLAustralia pool buttons**

---

## Session 13 (Apr 15, 2026)

- **China CBA league** -- mult 0.70, tid+7000, ratings + bio gists. `externalRosterService.ts`
- **NBL Australia league** -- mult 0.75, tid+8000, ratings + bio gists. `externalRosterService.ts`
- **WNBA gist update** -- 3 new gists (wnbaratings + wnbabio1 + wnbabio2)
- **Euroleague multiplier bump** -- 0.780 to 0.980 (final). `leagueOvr/index.ts`
- **8-league preseason schedule** -- all international teams get preseason games within Oct 1-15 window. `autoResolvers.ts`

---

## Session 12 (Apr 15, 2026)

- **BBGM/K2 rating scale consistency pass** -- all OVR thresholds across externalSigningRouter, seasonRollover, AIFreeAgentHandler, AITradeHandler, charania.ts corrected to proper scale. README reference table added.

---

## Session 11 (Apr 15, 2026)

- **Two-way contracts** -- `twoWay?: boolean` on NBAPlayer, auto-assign undrafted FAs to two-way slots, cap exclusion, purple "2W" chip in TeamFinances. `types.ts`, `autoResolvers.ts`, `salaryUtils.ts`
- **Super max eligibility** -- `superMaxEligible` flag set at rollover based on Bird Rights + service years + recent awards. `seasonRollover.ts`, `salaryUtils.ts`
- **Contract salary formula** -- `computeContractOffer()` with OVR/POT scoring, service-tiered max, mood modifiers. `salaryUtils.ts`
- **External signing router** -- routes unsigned FAs to Euroleague/G-League/PBA/B-League by OVR tier. `src/services/externalSigningRouter.ts`
- **Season-end extensions** -- `runAISeasonEndExtensions` fires every 7 days in May-June. `AIFreeAgentHandler.ts`
- **Settings modal redesign** -- 3 tabs: AI & Narrative / Gameplay / Performance. Max Box Score Years slider.
- **Box scores pruning at rollover** -- filters by `maxBoxScoreYears` setting. `seasonRollover.ts`
- **March 1 playoff eligible flag** -- `playoffEligible?: boolean`, set false for late signings. `simulationHandler.ts`
- **Draft picks full window at init** -- 2027-2033 picks available in trade machine from day 1. `initialization.ts`

---

## Session 10 (Apr 14, 2026)

- **Draft pick season filter** -- TradeMachineModal filters picks by `tradablePickCutoff`. `TradeMachineModal.tsx`
- **DraftScoutingView 404 fallback** -- when gist fails, shows all `tid === -2` prospects sorted by OVR with generated scouting reports. `DraftScoutingView.tsx`

---

## Session 9 (Apr 13, 2026)

- **`src/utils/dateUtils.ts`** -- `resolveSeasonDate()`, `getSeasonSimStartDate()`, `getOpeningNightDate()` for fully dynamic season dates
- **Hardcoded date sweep** -- all 2025/2026 literals replaced with `leagueStats.year`-derived expressions across 10+ files
- **`retirementChecker.ts`** -- probabilistic retirement based on age + OVR viability threshold, seeded. `src/services/playerDevelopment/retirementChecker.ts`
- **`DraftPickGenerator.ts`** -- `generateFuturePicks()` (idempotent R1+R2), `pruneExpiredPicks()`. `src/services/draft/DraftPickGenerator.ts`
- **PlayerBiosView mobile** -- unified scrollable table with sticky name column. `PlayerBiosView.tsx`
- **Resignings in TransactionsView** -- mid-season extensions and offseason FA signings push history entries

---

## Session 8 (Apr 13, 2026)

- **Contract salary system** -- `computeContractOffer()`: `score = OVR*0.5 + POT*0.5; salary = MAX(min, maxContract*((score-68)/31)^1.6)`. `salaryUtils.ts`
- **Draft lottery results used for pick order** -- DraftSimulatorView reads `state.draftLotteryResult` for picks 1-14. `DraftSimulatorView.tsx`
- **Draft + Lottery auto-fire in all sim paths** -- `wasDateReached(May14)` triggers lottery, `wasDateReached(Jun26)` triggers draft in `gameLogic.ts`
- **Season Preview flow** -- DayView card (Aug 14) + ScheduleView prop + NavigationMenu Seasonal entry
- **Trade deadline gate** -- AI proposals gated by Feb 15; TradeSummaryModal shows deadline override buttons. `simulationHandler.ts`, `TradeSummaryModal.tsx`
- **Broadcasting deadline moved to June 30** -- `BroadcastingView.tsx`, `NavigationMenu.tsx`
- **Sportsbook wager input fix** -- `type="text"` + `inputMode="decimal"` for mobile. `BetSlipPanel.tsx`
- **Mobile refactors** -- TeamFinancesView, TeamFinancesViewDetailed, RealStern all responsive

---

## Session 7 (Apr 12, 2026)

- **Awards flow to player.awards** -- All-NBA/Defensive/Rookie, All-Star, Champion all write to `player.awards[]`. `autoResolvers.ts`, `lazySimRunner.ts`
- **Watch Game from NBA Central** -- pre-sim + RECORD_WATCHED_GAME + ADVANCE_DAY before opening viewer
- **DNP spoiler fix** -- coach decisions hidden until game simulated. `GameSimulatorScreen.tsx`
- **PlayerPortrait fallback chain** -- BBGM to NBA HD CDN to initials avatar. `src/components/shared/PlayerPortrait.tsx`
- **Deterministic player progression** -- `internalId` now deterministic, `careerOffset` per-player developmental fingerprint. `bbgmParser.ts`, `rosterService.ts`, `ProgressionEngine.ts`
- **PlayoffAdvancer rewrite** -- MATCHUP_PAIRS per-feeder scheduling. `PlayoffAdvancer.ts`

---

## Apr 11, 2026 -- Ratings & Progression

- **POT (Potential) system** -- BBGM `potEstimator` formula, derived fresh everywhere (not stored). Age < 29: formula-based, age >= 29: POT = OVR. `PlayerRatingsModal`, `PlayerBioView`, `PlayerBiosView`, `PlayerRatingsView`
- **OVR/POT badge consistency** -- modal + BioView OVR badge both use `convertTo2KRating(player.overallRating, hgt, tp)`
- **Weekly OVR timeline chart** -- records every Sunday in ProgressionEngine, raw BBGM float, chart converts to K2. Last 56 snapshots (~1yr). `ProgressionEngine.ts`
- **Column filters** -- `evaluateFilter()` supports `>=`, `<=`, `>`, `<`, `|` (OR), `!` (NOT). Added to PlayerStatsView, PlayerRatingsView, PlayerBiosView
- **`buildAutoResolveEvents(year)`** -- all milestone dates derived from `leagueStats.year`. `lazySimRunner.ts`

---

## Apr 10, 2026 -- Draft System & Stats

- **Draft Lottery UI** -- Fanspo CSS ball reveal animation, results table, history section, speed selector, NBA 2019 odds. `src/components/draft/DraftLotteryView.tsx`
- **Draft Simulator** -- 2-round draft from `state.players` prospects, position filter, auto-sim with speed control, pick modal, full draft table. `src/components/draft/DraftSimulatorView.tsx`
- **PlayerStatsView BBGM-style rewrite** -- team/season/per-mode/reg-playoff selectors, advanced stats, bref career fetch, HOF highlighting, pagination. `PlayerStatsView.tsx`
- **Progression tab rework** -- K2 view with collapsible categories + Simple view with career OVR line chart
- **Missing portraits gist** -- `fetchMissingPortraits()` from `nbamissingportraits5000pts` gist. `franchiseService.ts`

---

## Apr 8, 2026 -- Playoff Engine & Awards

- **Staggered award announcements** -- 7 individual resolvers: COY (Apr 19), SMOY (Apr 22), MIP (Apr 25), DPOY (Apr 28), ROY (May 2), All-NBA (May 7), MVP (May 21). `autoResolvers.ts`, `lazySimRunner.ts`
- **Award Races projected/winner labels** -- before announcement: "Projected Winner"; after: "Winner" in amber. `AwardRacesView.tsx`
- **LeagueHistoryView** -- per-season browser: Champion, Runner Up, Best Records (E/W), COY, MVP, DPOY, SMOY, MIP, ROY, Finals MVP. Both BBGM + flat schemas. `src/components/central/view/LeagueHistoryView.tsx`
- **LeagueHistoryDetailView** -- single-season drill-in: award cards with portraits, All-NBA/Defensive/Rookie teams, stat leaders, All-Stars, semifinals MVPs, Wikipedia bref data
- **Playoff series news in lazy sim** -- `generatePlayoffSeriesNews()` detects completed series, championship, Finals MVP. `lazySimRunner.ts`
- **Playoff social feed** -- NBA Official, NBA Central, Legion Hoops, Hoop Central post templates for playoff/championship games. `SocialEngine.ts`
- **AwardService 65-game rule** -- hard floor when 82 GP, proportional mid-season, injury exception, commissioner config. `AwardService.ts`

---

## Mar 2026 -- Foundation Features

### Views & Navigation
- **PlayerBiosView** -- filterable/sortable table of all players (NBA + intl + retired) with search, dropdowns, column filters, OVR badge coloring, HOF badge. `src/components/central/view/PlayerBiosView.tsx`
- **TeamHistoryView** -- per-franchise deep-dive: retired jerseys, all-time top players, franchise records, career leaders (gist + live), season history. `src/components/central/view/TeamHistoryView.tsx`
- **EventsView (Commissioner's Diary)** -- separated from TransactionsView; League Events go here, roster moves stay in Transactions
- **SeasonalView** -- all seasonal actions (celebrity, christmas, global games, All-Star actions) with deadline banners. `SeasonalView.tsx`
- **Sidebar restructure** -- Command Center (Schedule+Actions), Seasonal, Events, Commish Store, Legacy (Approvals+Viewership+Finances)

### Sportsbook
- **Sportsbook redesign** -- 3 tabs: Today's Lines (moneyline + O/U), Player Props (pts/reb/ast for top 4 active per team), My Bets (P&L + win rate). Single/Parlay toggle, auto-replace conflicting legs. `SportsbookView.tsx`
- **Sportsbook odds** -- O/U props use -110 equivalent (1.909/2.062), moneyline +0.05 juice per side (~4.5-5.5% vig)

### Simulation Engine
- **Watch Game precomputed playback** -- "Watch Live" pre-sims, dispatches RECORD_WATCHED_GAME + ADVANCE_DAY, then opens pure visual playback. No re-simulation on leave. `ScheduleView.tsx`, `useLiveGame.ts`
- **Mid-game injuries** -- probability weighted by minutes played (20%/7%/2%/0.6%), stored in `playerInGameInjuries` on `GameResult`, orange "Left early" in BoxScoreModal. `engine.ts`
- **Win/lose streak news** -- thresholds [5,7,10,14], `long_win_streak` (8+), `streak_snapped` (5+ W then L). `lazySimRunner.ts`, `socialHandler.ts`
- **Lazy sim paychecks** -- `generatePaychecks` per batch with `lastPayDate` tracking. `lazySimRunner.ts`
- **Daily/Weekly news split** -- `newsType: 'daily' | 'weekly'` on NewsItem; NewsFeed has Daily/Period Recaps tabs

### Mood & Drama
- **Mood system (Phase 1)** -- 7 traits (DIVA/LOYAL/MERCENARY/COMPETITOR/VOLATILE/AMBASSADOR/DRAMA_MAGNET), mood score -10 to +10, drama probability weighting. `src/utils/mood/`
- **FightGenerator** -- base 0.4% per game, boosted by traits + real-player propensity map, severity: scuffle/ejection/brawl. `src/services/FightGenerator.ts`

### All-Star Weekend
- **All-Star Weekend actions** -- Rig Voting, Dunk/3PT Contestants, Replacement. `SeasonalView.tsx`, `GameContext.tsx`
- **Dunk/3PT contestant modals** -- all active players with search, portraits, 2K dunk/vertical scores. Always editable
- **All-Star replacement flow** -- injury detection, conference-matched replacement, DNP/replacement badges. `AllStarReplacementModal.tsx`, `AllStarRoster.tsx`
- **All-Star game scoring** -- `exhibitionScoreMult: 1.48`, `flatMinutes: true` with 20 avg target. `KNOBS_ALL_STAR`

### Economy & Contracts
- **`salaryUtils.ts`** -- shared library: `contractToUSD`, `getTeamPayrollUSD`, `formatSalaryM`, `getCapThresholds`, `getCapStatus`. `src/utils/salaryUtils.ts`
- **LeagueFinancesView** -- league-wide cap dashboard: 30 teams sorted by payroll/cap space, per-team payroll bar with cap/tax/apron markers. `LeagueFinancesView.tsx`
- **Phase-weighted season revenue** -- Finals days earn ~3-6x more daily revenue than Preseason. `Dashboard.tsx`, `ViewershipService.ts`
- **Revenue history tracking** -- `LeagueStats.revenueHistory` with AreaChart + 7D/30D/90D/Season filter. `LeagueFinancesView.tsx`

### Player Bio
- **PlayerBioHero** -- extracted component with portrait priority (BBGM to NBA CDN to initials), HoF badge overlay. `PlayerBioHero.tsx`
- **Career team for retired players** -- aggregates career GP by tid, shows most-GP team instead of "FREE AGENT". `PlayerBioView.tsx`
- **TransactionsView year picker** -- left/right chevron year navigation. `TransactionsView.tsx`

### Data Sources
- **NBA 2K Badges** -- gist-backed badge tiers (HOF/Gold/Silver/Bronze), probability multipliers. `src/data/NBA2kBadges.ts`
- **NBA 2K Ratings** -- full attribute ratings per team/player for defense weighting and dunk contest. `src/data/NBA2kRatings.ts`
- **Coach photos** -- dual gist endpoints for headshot URLs and B-Ref slugs. `src/data/photos/coaches.ts`

### Shared Components
- **TeamDropdown** -- reusable team selector. `src/components/shared/TeamDropdown.tsx`
- **TabBar** -- shared tab component. `src/components/shared/ui/TabBar.tsx`
- **SortableTh** -- sortable table header. `src/components/shared/ui/SortableTh.tsx`

---

## Planned / Critical Features

- **AI trade: contending teams protect K2 80+ players** — prevent AI sellers from trading franchise cornerstones
- **Dead money / ghost contracts (Luol Deng rule)** — waived player salary stretches across multiple years
- **Career highs tracking** — track per-game career highs (PTS, REB, AST, etc.) and display in PlayerBioView game highs table
- **DraftClassGenerator for 2029+ seasons** — procedurally generate draft classes beyond loaded gist data
- **GM Mode** — see `GM_MODE_README.md` for full implementation plan
- **External league currency display** — show Euroleague salaries in EUR (€), CBA in CNY (¥), PBA in PHP (₱), B-League in JPY (¥), NBL in AUD (A$). Store in USD internally, convert at display time with static exchange rates in constants.ts

---

*Last updated: 2026-04-18 (session 25)*
