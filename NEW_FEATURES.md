# New Features -- NBA Commish Sim

A chronological log of features added across development sessions.

---

## Prompt L — Bidding-war refactor remaining phases (QUEUED)

**Status:** PR1 shipped (Session 27), design doc complete. PR2–PR4 + PR6 pending user approval of 8 Open Questions in [`docs/bidding-war-refactor.md`](./docs/bidding-war-refactor.md).

**PR2 — Escalation rounds** 
- 3-round parallel bid window (Days 1–2 / 3–4 / 5), sealed re-bids (Round 2/3 teams commit to floors from Round 1)
- Tier-based round count: K2 ≥ 88 → 3 rounds, K2 80-87 → 2 rounds, K2 70-79 → 1 round
- Shams tweet templates for escalation updates (per-tier gating, off by default)

**PR3 — Resolution formula upgrade**
- Highest $ × `legacyMult` (super-vet multiplier) × `championshipMult` (recent champion bonus) × `moodMult` (trait-driven preference)
- Bird Rights tiebreak (prior-team gets +15% final-offer floor) before RNG
- LOYAL trait override: any prior-team bid wins regardless of $ amount

**PR4 — Gut sequential pipeline**
- Pass 1 → Bird Rights re-sign only (Jul 1, `runAIBirdRightsResigns`)
- Pass 4 candidate filter restricted to K2 < 70 OR (market-unsigned AND date >= Aug 1)
- All K2 ≥ 70 FAs route through `faMarketTicker` exclusively
- Remaining passes (2, 3, 5) unchanged

**PR6 — LOAD_GAME save migration**
- Backfill new `FreeAgentMarket` schema fields for existing save markets
- Backfill `pendingMatch` state for any in-progress RFA markets from prior versions

---

## Backlog idea — Apron-tier cap mechanics (Football Manager-tier depth)

**Status:** intentionally NOT shipped. Sim is currently fast and approachable; full apron rules would push it toward Football Manager territory (deep but slower, more gates, more "you can't do that" friction). File for a hypothetical future "Hardcore Mode" toggle.

Real NBA 2024+ CBA introduced staircase cap penalties — luxury tax → 1st apron → 2nd apron — each adding stricter restrictions. Currently we model the dollar thresholds but not the *behavioral consequences*.

Symptom that motivated this entry: LAL retained LeBron + Reaves + Mark Williams in the same offseason post-Bird-Rights Pass 0 → roster steamroll. Real NBA: 2nd-apron teams literally can't aggregate contracts in trades, can't sign waived players to MLE, can't include cash, etc. Those frictions ARE what stops super-team stacking.

If we ever build the hardcore mode, the cleanest scope:

**Cap thresholds (already modeled):** salary cap → luxury tax → 1st apron → 2nd apron

**1st apron team restrictions:**
- Can't acquire players via sign-and-trade (receiver side)
- MLE capped to taxpayer MLE (~$5M instead of $14M)
- Can't take back more salary than sent in trades (currently can up to 125%)
- Bird Rights premium tapers from +15% to +5% (so re-signs are still possible but less aggressive)

**2nd apron team restrictions (the real teeth):**
- Can't aggregate contracts in trades — only 1-for-1 swaps
- 1st-rd picks 7 yrs out frozen (can't trade them)
- Can't include cash in trades
- Bird Rights premium → 0% (no incumbent over-pay)
- MLE eliminated entirely
- Picks freeze if 2 of 4 future seasons end above 2nd apron → pick moves to back of round

**Per-team Bird Rights cap (separate but related):**
- First 2 retentions per offseason → full +15% premium
- 3rd retention → +5% premium  
- 4th+ retention → 0% premium (the "you can't keep everyone" reality check)

**UI surface:**
- Cap ticker shows current tier with color thread (green / yellow / orange / red)
- Trade Machine + SigningModal disable affected actions when over 2nd apron with explanatory tooltip
- New Settings toggle: "Hardcore Cap Rules (NBA 2024 CBA)" — default OFF

Why deferred: this is a 200-300 line implementation across `salaryUtils`, `tradeFinderEngine`, `freeAgencyBidding`, `runAIBirdRightsResigns`, plus matching UI gates and tooltips everywhere. Pays off only for users who want NBA-realism over fluid gameplay. Most casual users want to build their super-team without the league preventing it.

The current "Lakers re-sign all their stars" outcome is closer to NBA 2010s than NBA 2024 — defensible as design (super-team narratives sell) until a "Realism" mode toggle exists.

---

## Backlog idea — "Off-Books" tab (Kawhi-Aspiration cap-circumvention play)

Hidden tab next to **Team Offers** in `SigningModal`. GM-mode only. Surfaces a covert salary-cap-circumvention mechanic — modeled directly on the real Kawhi Leonard / Aspiration / Ballmer scandal.

```
Real-world inspiration:
  Apr 2024 — Aspiration (green fintech, Ballmer-invested) signs Kawhi
  to a 4yr/$28M endorsement deal via "KL2 Aspire LLC"
  Allegations: no-show job, Ballmer paying Kawhi outside cap rules
  Sep 2025 — NBA opens investigation
  Apr 2026 — Kawhi: "not stressing, I'll be in the clear"
  diabolical af
```

**Mechanic:**
- A new "Off-Books" tab appears on the SigningModal for over-cap teams that have **already maxed Bird Rights / MLE** but still want to sweeten an offer
- Slider: **"Endorsement supplement"** $0–$30M total over the contract length
- Funnels through a fake LLC in the player profile (`offBooksDeals[]: { llcName, totalUSD, donorEntity, signedYear }`) — visible only in commissioner dev tools and player's "Suspicious Activity" subtab in PlayerBio
- The supplement adds **+15-30% offer strength** (slider scales) without showing on the cap sheet, but writes a hidden flag on `state.investigations[]`

**Risk system:**
- Each off-books deal has a `whistleBlowProb` (per-season seeded RNG, 8-15% based on amount + GM Trade Aggression attribute)
- If triggered: NBA Investigation opens → news cycle ("League looks into [Team] / [Player] endorsement deal — sources say"), Shams posts, ESPN PH headlines, the works
- Investigation outcomes (resolved over 2-3 sim months):
  - **Clear** (40%): "Investigation finds no wrongdoing" — flavor news only
  - **Reprimand** (30%): owner fined $5M, draft pick docked (one 2nd-rd lost)
  - **Sanctions** (25%): $25M fine, 1st-rd pick stripped, GM suspended 30 days
  - **Voided + suspended** (5%): contract voided, player becomes FA, team loses 1st-rd + suspended GM 50 games

**UI surfaces:**
- New "Investigations" subtab in `EventsView` (Commissioner's Diary) — shows ongoing probes with timeline
- Shams template lib gets a "investigation" type with quote variants
- PlayerBio gains a tiny shield icon next to portrait when an active off-books deal exists (commissioner-visible only)

**Settings (EconomyTab toggle):**
- `capCircumventionEnabled: boolean` (default OFF — opt-in for spicy commissioners)
- `whistleBlowMultiplier: 0.5x–2.0x` for tuning risk

**Why it's worth building:**
- BBGM doesn't model owner skullduggery at all
- Real NBA has *exactly this happening right now* (per the Kawhi case) — and we have the news/Shams/Events infrastructure to surface it dramatically
- Creates a tradeoff for over-the-cap contender GMs: take the legal route and lose your guy to a cap-rich rival, or risk it for the bag and pray the league doesn't find out
- Generates the kind of story arcs ("Aspiration probe enters month 4, owner Ballmer testifies before commissioner Silver") that elevate the sim from "manage roster" to "run a basketball drama"

Long-term hook: tie into the **Owner** layer (which is currently flat) — different owner archetypes have different `riskTolerance` (Ballmer = high, small-market = low). Owner pressures GM for off-books deals when the team is contending but capped out.

---

## Backlog idea — Contract Thoughts (FA bidding-period flavor)

During the bidding window, surface a short first-person quote on each FA's bio header — varies by status + traits + age:

```
Contract Expired · Unrestricted Free Agent
"I'm a free agent. Keeping my options open — a good locker room,
real minutes, a clear role. That's what I'm listening for."
```

Variations by trait + tier:
- **LOYAL veteran**: "I've been a {City} guy my whole career. Hard to picture wearing anything else."
- **MERCENARY star**: "I bet on myself. Whoever brings the bag and the role, that's who I'm signing with."
- **COMPETITOR mid-career**: "I want to win. Show me a real path to a ring and we can talk."
- **RFA (offer sheet pending)**: "Y'all know how this works — they've got 48 hours."
- **Aging vet**: "Last contract probably. I want to play meaningful basketball for the team that wants me."

Source from a small templated lib (mirror existing Shams/Woj template pattern in `src/services/social/templates/`). Surface in PlayerBio header during FA window only.

Cheap dynamic-narrative win — no game-logic impact, pure flavor.

---

## Milestone — Apr 23, 2026: Past BBGM on feature surface

Snapshot of what's shipped vs. what BBGM ships:

**Contract system** — supermax eligibility, Rose Rule rookie extensions, Bird Rights, MLE (non-taxpayer / taxpayer / room / bi-annual), team options, player options, two-way contracts, non-guaranteed training camp deals, external-league buyouts with FIBA cap. BBGM has a simpler flat contract model.

**Multi-league ecosystem** — NBA + WNBA + Euroleague + PBA + B-League + G-League + Endesa + China CBA + NBL Australia, all with their own rosters, ratings, bios, preseason schedules, and economy tiers. BBGM is single-league.

**Mood & drama** — 7 traits (DIVA / LOYAL / MERCENARY / COMPETITOR / VOLATILE / AMBASSADOR / DRAMA_MAGNET / FAME), mood score -10 to +10, drama probability weighting, fight generator with severity tiers, family ties / nepotism system.

**Media surface** — Shams Charania posts, NBA Central, Legion Hoops, Hoop Central, NBA Official in-season social feed, daily vs. weekly news split, Events (Commissioner's Diary) separate from Transactions, staggered award announcements Apr-May, Season Preview, live Award Races projections.

**All-Star Weekend** — Dunk Contest + 3PT Contest with 2K-style dunk/vertical ratings, Celebrity Game, Rising Stars, All-Star Rig Voting, replacement flow, history browser, configurable host city with 10-season cooldown.

**Draft & scouting** — Draft Combine, DraftScouting big board (70% value + 30% fit), infinite simulated draft classes via `genDraftPlayers.ts`, multiple historical lottery presets (1966-2019) with exact Plackett-Luce odds, lottery UI with ball reveal animation.

**Economy** — phase-weighted season revenue, `EXTERNAL_SALARY_SCALE` caps, broadcasting cap inflation, media rights deals, transaction calendar (trade deadline / FA start / moratorium) fully commissioner-editable, minimum payroll + luxury tax + apron hierarchy.

**Trade systems** — Trade Finder (all 29 teams scanned), Trade Machine with salary eyebrow + pick sweeteners + 3rd player gap-fill, AI-AI trade execution with GM personalities (trade_aggression / scouting_focus), dynamic ratio thresholds by TV, pick protection.

**UX** — IndexedDB portrait cache (5-concurrent auto-download on load), BBGM → CDN → initials fallback chain, facesjs for generated players, responsive mobile refactors across 15+ views, GM mode vs. Commissioner mode with differentiated UI.

BBGM's strength is its deep sim engine and 20-year polish. This game now matches the sim depth and exceeds it on UX, multi-league scope, media immersion, and contract sophistication. The remaining multi-season cap/FA bugs (documented in TODO.md) are the last structural items before the sim is genuinely beyond BBGM on every axis.

Session-by-session work below.

---

## Session 26 (Apr 23, 2026)

- **Team-option → extension coupling** (`seasonRollover.ts`) — New §0c pass fires alongside team option exercise: bundled summer negotiation with basePct floor of 0.90 (0.95 for MVP/All-NBA in last 3 yrs, 0.97 for LOYAL trait), distinct deterministic seed (`currentYear * 97`) from mid-season ext so unlucky rolls don't cascade. Writes Jun 30 history entries like "X has signed a rookie extension with the Y: $ZM/Nyr (Rose Rule)". Also patched the `teamOptionExercisedIds` branch in the player map to compute `hasBirdRights` and `superMaxEligible` — previously these were stale until the next rollover because only the "still under contract" branch set them. Motivated by Wembanyama case: 4-year MVP/All-NBA run with SAS, mid-season ext fired Oct 2026 and rolled the 20% decline bucket, silent fail, hit FA Jul 2027, signed LAC. Coupled extension gives franchise cornerstones a proper negotiation window with high acceptance before the lossy mid-season path can fail them.

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
- **Dual-affiliation academy prospects (Luka-Real-Madrid model)** — architectural upgrade over BBGM's college-as-metadata model. Pre-assign `draft.year` at generation for academy youth so they're simultaneously at their youth club (`tid = clubTid`, `status = 'Euroleague' / 'B-League' / etc.`) AND tagged for a future draft class. Real Luka was playing Real Madrid senior at 16 while everyone knew he was declaring 2018 — sim can model that. Replaces the Prompt C age-19 status-flip mechanism with a pre-committed draft year. DraftScouting surfaces prospects 1-4 years out with club attached ("Alejandro Garcia — Real Madrid Youth → declares 2032"). Enables scouting-budget expansion (commit to follow a prospect years ahead for better intel). BBGM can't do this because it treats college as string metadata only — this sim's first-class `nonNBATeams` makes youth-club-as-playable-team possible.
- **Scouting staff & spending** — `getFuzzedOvr` is already implemented (dead code) and `rating.pot` now drifts via seasonRollover, so the infrastructure is ready. Scouting budget unlocks tighter fuzz ranges: low budget shows opponents as "75 | 82" when reality is "75 | 75" (at-ceiling bust); high budget reveals the gap, letting you distinguish a genuine breakout candidate from a stalled player. Visible bust signal already works (OVR|POT converge over seasons, never shown below OVR in UI); scouting spend determines how early and accurately the GM sees it for non-owned players.
- **FA pool debug dashboard** (FreeAgentsView header) — OVR tier counters: K2 >90 / >85 / >80 / >75 / total, each updating live as filters change. League column on each FA row showing their current league (NBA FA, G-League, Euroleague, etc.). Bottom summary strip per external team: "FC Barcelona — Spain ×5, France ×2, USA ×1" showing nationality breakdown of that club's roster. Same panel for all external leagues. Pure debug/transparency tool — great for catching routing inflation and nationality drift at a glance.

- **Progression / Regression sliders in Settings** — Commissioner-only sliders to globally tune player development speed and aging decline. Two independent dials: Progression (young player growth rate, default 1.0x) and Regression (35+ aging curve harshness, default 1.0x). Multiplies the existing `calcBaseChange` per-age values. Lets commissioners run high-development "everyone develops" leagues or 90s-style "cliff at 33" leagues without code edits. Reuses existing `inflationEditor` pattern in SettingsModal.

- **Coaching / Training Dev staff (paid feature)** — GM-mode staff hire system tied directly to the progression/regression engine. Spend cap-room or owner budget on player-development coaches: each tier provides a multiplier to your team's young players' progression rate (Progression Coach: +5% to +25%) and slows aging decline for vets (Athletic Trainer: -5% to -20% regression). Modeled after real NBA Player Development departments (e.g. Sam Cassell-tier developer hires). Reuses the `getFuzzedOvr` scouting-staff infrastructure. Integration point: ProgressionEngine reads `team.staffMultipliers.progression` and `team.staffMultipliers.regression` per player. Free agency competition between teams for elite dev coaches creates strategic depth.

---

*Last updated: 2026-04-18 (session 25)*
