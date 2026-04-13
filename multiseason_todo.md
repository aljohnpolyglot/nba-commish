# NBA Commish — Multi-Season & Economy Master Plan

> Last updated: 2026-04-13 (session 9)
> Goal: Full multi-season loop (development → offseason → draft → FA → new season) + AI trades/FA + economy inflation.
> **Consolidates:** `multiseason_todo.md` + `AI_AND_ECONOMY_PLAN.md` (delete that file — it's now here)
> **Focus:** Multi-season loop only. Player archetypes, position presets, cosmetic features → move to todo.md.

---

## STATUS LEGEND
- ✅ Done
- 🔧 In progress / partial
- [ ] Not started

---

## 🔴 CRITICAL REMAINING FOR MULTI-SEASON (Priority Order)

| # | Task | File | Status |
|---|------|------|--------|
| 1 | **§6 `yearsWithTeam` tracking + Bird Rights** | `seasonRollover.ts` | ✅ Apr 2026 session 9 |
| 2 | **§6 Player options at rollover** | `seasonRollover.ts` | ✅ Apr 2026 session 9 (fires for AI-generated contracts) |
| 3 | **§6 FA window extended July–Feb, March 1 cutoff** | `simulationHandler.ts` | ✅ Apr 2026 session 9 |
| 4 | **§6 Bets pruning at rollover** | `seasonRollover.ts` | ✅ Apr 2026 session 9 |
| 5 | **§3 MAX_ROSTER uses `leagueStats.maxPlayersPerTeam`** | `AIFreeAgentHandler.ts` | ✅ Apr 2026 session 9 |
| 6 | **§3 Transaction log + news for AI FA signings** | `simulationHandler.ts` | ✅ Already wired (history entries logged) |
| 7 | **§2 AI-vs-AI trade execution in daily loop** | `simulationHandler.ts` | [ ] In progress by user |
| 8 | **§4d pick season filter in tradeService** | `tradeService.ts` | [ ] |
| 9 | **§7 Fallback for DraftScoutingView 404** | `DraftScoutingView.tsx` | [ ] |
| 10 | **`bioCache.ts` age calc uses hardcoded 2026-01-08** | `bioCache.ts:107` | [ ] low priority |

---

## ✅ ALREADY BUILT (Do Not Rebuild)

| System | File | Notes |
|--------|------|-------|
| Draft Lottery UI | `src/components/draft/DraftLotteryView.tsx` ✅ Apr 2026 | Integrated, real team records, ball animation, history |
| Draft Board UI | `src/components/draft/DraftSimulatorView.tsx` ✅ Apr 2026 | Integrated, game state prospects, auto-sim |
| `getCapThresholds()` | `salaryUtils.ts` | Luxury tax auto-derives from % |
| `getTradeOutlook()` | `salaryUtils.ts` | Fixed Apr 2026: playoff teams under luxury tax = buyer |
| `getTeamCapProfile()` | `salaryUtils.ts` | Full cap + apron status per team |
| `LeagueFinancesView` | `central/view/LeagueFinancesView.tsx` | Cap Overview / Trade Board / Attendance tabs |
| `TeamFinancesViewDetailed` | `central/view/TeamFinancesViewDetailed.tsx` | Full team breakdown with charts |
| `attendanceUtils.ts` | `utils/attendanceUtils.ts` | Per-team attendance + revenue estimates |
| `tradeActions.ts` | NewsGenerator wired for trade_confirmed | — |
| `BroadcastingView.tsx` | Persists luxuryPayroll on lock | — |
| `EconomyFinancesSection.tsx` | Shows cap as broadcasting-derived | Live threshold mini-bars |
| `DraftScoutingView.tsx` | Fetches 2026classScouting gist | Static URL for now |
| `DraftLotteryView.tsx` | Shell exists | Needs game-state wiring (§8) |
| Player ratings UI | `PlayerRatingsView`, `PlayerRatingsModal` | Radar chart + attribute bars |
| Daily player progression | `ProgressionEngine.ts` ← **NEW Apr 2026** | Wired into `simulationHandler.ts` |

---

## 0. Season Config — No More Hardcoded Dates

**Problem:** `START_DATE_STR = '2025-08-01'`, `currentSeason = 2026` (postProcessor.ts:60), hardcoded `2026-04-13` playoff start in simulationHandler.

**Target:** Everything derives from `leagueStats.year`. Dates use ordinal pattern ("3rd Tuesday of October") not literal strings.

### Tasks
- ✅ **`src/constants.ts`** — Removed `START_DATE_STR`. Added `SEASON_YEAR_OFFSET = 1`. (Apr 2026 session 9)
- ✅ **`src/utils/dateUtils.ts`** (new) — `resolveSeasonDate`, `getSeasonSimStartDate`, `getOpeningNightDate`. No string literals. (Apr 2026 session 9)
- ✅ **`src/store/initialState.ts`** — Dates derived from `INITIAL_LEAGUE_STATS.year - 1`. No `START_DATE_STR`. (Apr 2026 session 9)
- ✅ **`src/store/logic/turn/postProcessor.ts`** — `currentSeason = 2026` → uses `seasonYear` param (passed from callers via `leagueStats.year`). Both regular + playoff stat blocks fixed.
- ✅ **`simulationHandler.ts`** — `'2026-04-13'` / `'2026-04-15'` → `` `${seasonYear}-04-13` `` / `` `${seasonYear}-04-15` ``. Also: AI trade proposals gated by `beforeTradeDeadline` check (`${year}-02-15`).
- ✅ **`gameLogic.ts`** — All hardcoded `2026` playoff/schedule date literals replaced with `${scheduleYear}` / `${playoffSeasonYear}` derived from `leagueStats.year` (Apr 2026 session 3).
- ✅ **`gameScheduler.ts`** — Added optional `seasonYear` 7th param; all internal dates derive from `yr = seasonYear ?? 2026` (Oct-24 start, Apr-13 end, Dec-25 Christmas, Oct-01 preseason) (Apr 2026 session 3).
- ✅ **`autoResolvers.ts`** — Passes `state.leagueStats.year` as 7th arg to `generateSchedule()`.
- ✅ **`PlayoffAdvancer.ts`** — Round 1 start and fallback dates use `b.season` from bracket object (Apr 2026 session 3).
- ✅ **`statUpdater.ts`** — `OPENING_NIGHT` uses `(leagueStats.year ?? 2026) - 1` (Apr 2026 session 3).
- ✅ **`leagueSummaryService.ts`** — Added `seasonYear?` param; callers pass `leagueStats?.year` (Apr 2026 session 3).
- ✅ **`BroadcastingView.tsx`** — Lock deadline moved from Opening Night to `${leagueStats.year}-06-30` (day before FA opens Jul 1) (Apr 2026 session 3).
- ✅ **`NavigationMenu.tsx`** — Broadcasting badge deadline updated to June 30 of season year (Apr 2026 session 3).
- ✅ **`TradeSummaryModal.tsx`** — Past-deadline amber banner + "Override Deadline & Confirm" / "Force Trade (Override All)" buttons (Apr 2026 session 3).
- ✅ **`initialization.ts`** — `new Date('2025-08-06')` replaced with `getSeasonSimStartDate(INITIAL_LEAGUE_STATS.year)`. Jump threshold also dynamic. (Apr 2026 session 9)
- ✅ **`CommissionerSetup.tsx`** — All `'2025-08-06'` literals replaced with `SIM_START_DATE` derived from `INITIAL_LEAGUE_STATS.year`. (Apr 2026 session 9)
- ✅ **Search sweep done** — Remaining known hardcoded dates:
  - `bioCache.ts:107` `SIM_DATE = new Date("2026-01-08")` — used for age calc in external bio fetch; needs game state passed in (low priority)
  - `SocialGameContext.tsx:41` `date: '2026-04-02'` — standalone social game demo, non-critical
  - `useGameActions.ts:161` `@NBAFan2026` — string in mock social post content, cosmetic only
  - `BroadcastingView.tsx:481` `"2025-26 season"` — display string in media rights text, cosmetic

---

## 1. Daily Player Progression ✅ IMPLEMENTED Apr 2026

**File:** `src/services/playerDevelopment/ProgressionEngine.ts`

### How it works
- `annualDevRate(age)` → rating-points/year: +9 (age 18) → 0 (age 27 peak) → −8 (age 36+)
- Daily delta = `annualRate / 365` — applied to each BBGM attribute separately
- Attribute weights: athleticism (spd, jmp, endu, dnk) weighted higher when growing; IQ (oiq, diq, fg, pss) weighted lower when declining (holds longer)
- **Decline multipliers:** athleticism × 1.6 faster, IQ × 0.35 slower for age 29+
- Deterministic noise ±20% seeded by `playerID + date + attr` (natural variation, no randomness bleed)
- Stagnates during playoffs (`isPlayoffs = true`) — locked in when it matters
- **Wired:** `simulationHandler.ts` calls `applyDailyProgression` after every simulated day

### Known constraints
- External roster players (Euroleague, PBA) have BBGM `ratings[]` — they develop too (correct behavior)
- Draft prospects (`tid === -2`) in the roster file up to 2028 — ✅ ratings FROZEN (Apr 2026 session 5) — they do not develop until drafted
- `overallRating` recalculated via `calculatePlayerOverallForYear` after each update
- HOF/deceased players skipped (`diedYear` check in `applyDailyProgression`)

### What changed Apr 2026
- ✅ **pot (potential) cap** — `potMod(ovr, pot)` in ProgressionEngine. Dev rate tapers as ovr approaches pot ceiling. Creates natural busts for low-pot prospects, non-linear dev for all.
- ✅ **Overseas OVR fix** — ProgressionEngine applies `applyLeagueDisplayScale` before computing overallRating for Euroleague/PBA/B-League players. Now stored OVR is NBA-equivalent everywhere.

### Future enhancements (multiseason-relevant only)
- ✅ **Injury history modifier** — players still injured at training camp take extra −1 to −2 per physique attr (Apr 2026 session 6)
- [ ] **Breakout event** — 2% chance per young player per season to get `+8` to one key rating + news headline *(low priority)*
- ✅ **Retire detection** — `retirementChecker.ts` wired into `seasonRollover.ts`; `RetireeRecord[]` on `state.retirementAnnouncements` (Apr 2026 session 6)
- [ ] **HOF eligibility** — trigger `hofActions.ts` check on retired players at rollover *(medium priority — part of multi-season legacy)*
- [ ] **Rating edit audit** — `manualRatingEdit: true` flag — *move to todo.md, not multiseason-critical*
- [ ] **Draft prospects rating display** — *move to todo.md*
- [ ] **Position archetypes** — *move to todo.md*

---

## 1b. External League Routing & Rating Calibration

### Rosters waiting to connect
- ✅ **Euroleague** — live gist already wired (`externalRosterService.ts`)
- 🔧 **Endesa (Liga ACB)** — user has roster ready, needs gist upload + `fetchEndesa()` added to `externalRosterService.ts` (same pattern as Euroleague, tid offset TBD after Euroleague's 1000–1297 range)
- 🔧 **G-League** — user has roster ready, needs gist + service entry (tid offset 3000+, `status: 'G-League'`, `league: 'G-League'` in `NonNBATeam`)
- ✅ **PBA** — live
- ✅ **B-League** — live

### OVR calibration adjustments ✅ APPLIED Apr 2026
| League | Change | `calculateXOverall` cap | `LEAGUE_DISPLAY_MULTIPLIERS` |
|---|---|---|---|
| Euroleague | **+3 buff** | 70 → **73** | 0.733 → **0.760** |
| B-League | **+3 buff** | 75 → **78** | 0.680 → **0.700** |
| PBA | **−3 nerf** | 60 → **57** | 0.620 → **0.600** |

*Rationale: Euroleague/B-League talent is closer to NBA fringe than previously tuned; PBA is regional-tier.*

### External signing routing (post-rollover / waiver wire)
When a player is released or fails to sign in FA, route them to external leagues based on OVR:

| OVR range | Destination | Notes |
|---|---|---|
| 75–80 | Euroleague / Endesa | Quality comp, can come back as FA next year |
| 70–75 | G-League | NBA affiliate pathway, 2-way contract eligible |
| < 70 | PBA | Last stop / regional league |

**Tasks:**
- [ ] `externalSigningRouter.ts` (new) — `routeReleasedPlayer(player, state): 'Euroleague' | 'G-League' | 'PBA' | null`
  - Run after AI FA round ends each offseason (end of Sep) for any remaining unsigned players with `tid === -1`
  - Sets `player.status = league`, `player.tid = externalTeamTid` (pick best-fit team in that league)
  - Generates news item: "X signs with [team], [league]"
- [ ] Wire into `simulationHandler.ts` after `runAIFreeAgencyRound` block — fire once on Oct 1 if unsigned players remain
- [ ] Add `'G-League'` to `player.status` union in `types.ts`
- [ ] Add `'G-League'` to `LEAGUE_DISPLAY_MULTIPLIERS` (est. 0.720 — between B-League and Euroleague)
- [ ] `calculateGLeagueOverall()` in new `GLeagueSigningLogic.ts` (same pattern, cap ~75)
- [ ] Connect Endesa roster gist once uploaded
- [ ] Connect G-League roster gist once uploaded

---

## 2. AI Trade Engine

### Data layer (✅ READY)
- `getTeamCapProfile()`, `getTradeOutlook()`, `TradeProposal` type, `state.tradeProposals`
- `handleExecutiveTrade()` — executes any trade, triggers news/social/transactions
- `processAITradeProposals()` — expiry skeleton

### §2a — `playerValue(p): number` ✅ IMPLEMENTED Apr 2026
**File:** `src/services/AITradeHandler.ts`

### §2b — `teamNeedsScore(team, roster): Record<string, number>` ✅ IMPLEMENTED

### §2c — `valueChange(teamId, receiving, giving): number` ✅ IMPLEMENTED

### §2d — Pick values ✅ IMPLEMENTED

### §2e — Proposal loop ✅ IMPLEMENTED (`generateAIDayTradeProposals`)

### §2f — Execute in simulationHandler
- For each accepted `isAIvsAI` proposal: call `handleExecutiveTrade(state, teamAId, teamBId, assetsA, assetsB)`

### Tasks
- ✅ `src/services/AITradeHandler.ts` — §2a–§2e implemented Apr 2026
- ✅ Wire `generateAIDayTradeProposals` into `simulationHandler.ts` — runs every 7 days during regular season (day % 7 === 0, gated by `SettingsManager.allowAITrades`)
- [ ] **Wire execution of accepted AI-vs-AI proposals** — in `simulationHandler.ts`: after `generateAIDayTradeProposals`, check `state.tradeProposals` for any `isAIvsAI && status === 'accepted'` entries older than 3 days → call `handleExecutiveTrade`. Currently proposals are generated but never executed.

---

## 3. AI Free Agency Engine

### Data layer (✅ READY)
- Free agents: `state.players.filter(p => p.tid < 0 && p.status === 'Free Agent')`
- `getTeamCapProfile()` → `capSpaceUSD`
- Roster size from `state.players.filter(p => p.tid === team.id).length`

### §3a — `playerMoodForTeam` ✅ IMPLEMENTED Apr 2026
**File:** `src/services/AIFreeAgentHandler.ts`

### §3b — `getBestFit` ✅ IMPLEMENTED

### §3c — `runAIFreeAgencyRound` ✅ IMPLEMENTED

### §3d — Apply signings
- `player.tid = teamId`
- Transaction entry: `{ type: 'signing', playerId, teamId, date, amount }`
- News: `NewsGenerator.generate('fa_signing', ...)`

### Tasks
- ✅ `src/services/AIFreeAgentHandler.ts` — §3a–§3c implemented Apr 2026
- ✅ Wire `runAIFreeAgencyRound` into `simulationHandler.ts` — runs every 3 days during Jul–Sep offseason (gated by `SettingsManager.allowAIFreeAgency`). Applies signings directly to player.tid in sim state.
- [ ] Transaction log entry per signing (news + transactions tab visibility)
- [ ] Social/news post for major AI signings
- ✅ **Mid-season extensions** — `runAIMidSeasonExtensions()` in `AIFreeAgentHandler.ts` (Apr 2026 session 4)
  - Targets players with `contract.exp === currentYear` on AI teams
  - Mood score (via `computeMoodScore`) drives acceptance %: LOYAL=90%, Happy=80%, Neutral=60%, Restless=35%, Unhappy=10%
  - COMPETITOR won't re-sign with win%<40% teams if OVR≥80
  - MERCENARY gets +25% on offer; LOYAL accepts at −10% discount
  - Extension years: 4yr (star ≤29), 3yr (solid ≤31), 2yr (starter), 1yr (role player)
  - `midSeasonExtensionDeclined` flag prevents repeat offers; reset at rollover
  - Fires every 14 days during Oct–Feb in `simulationHandler.ts`

---

## 4. Economy — Salary Cap & Inflation

### §4a — Luxury Tax derives from % ✅ DONE
- `getCapThresholds()` uses `luxuryTaxThresholdPercentage` from `leagueStats`
- BroadcastingView lock also writes `luxuryPayroll`

### §4b — Salary cap from revenue ✅ DONE
```
BroadcastingView → totalRev = mediaRev + lpRev + 3.8 ($B)
salaryCap = 154.6 × (totalRev / 14.3)  ($M)
```

### §4c — Economy Inflation System (BBGM-style)
Each year at rollover, pick a truncated Gaussian cap inflation:
```
inflation% ~ TruncGaussian(mean=μ, std=σ, min=0%, max=8%)
```
All of these scale together: salaryCap, luxuryPayroll, firstApron, secondApron, minContract.

#### Tasks
- ✅ Add to `LeagueStats` type: `inflationEnabled`, `inflationMin`, `inflationMax`, `inflationAverage`, `inflationStdDev` (Apr 2026 session 4)
- ✅ Add to `INITIAL_LEAGUE_STATS`: defaults `{ enabled: true, min: 0, max: 8, avg: 3.5, std: 1.5 }` (Apr 2026 session 4)
- ✅ **`src/utils/finance/inflationUtils.ts`** — `truncatedGaussian` + `applyCapInflation()` DONE Apr 2026
- ✅ **Apply at rollover** in `seasonRollover.ts` — inflation applied on June 30 trigger (Apr 2026 session 4)
- ✅ News item after inflation: "The NBA salary cap for [year] has been set at $[X]M (+/-Y%)" (Apr 2026 session 4)
- ✅ League Settings UI — "Financial Inflation" section in EconomyFinancesSection (Apr 2026 session 4)

### §4d — Trade Pick Seasons Setting
- ✅ Add `tradableDraftPickSeasons: number` (default: 4) to `LeagueStats` (Apr 2026 session 4)
- ✅ League Settings UI — "Draft Picks" card in Economy tab with 1–7 slider (Apr 2026 session 4)
- ✅ `DraftPickGenerator.ts` — `generateFuturePicks()` + `pruneExpiredPicks()`, wired into `seasonRollover.ts` (Apr 2026 session 6). Generates R1+R2 for all 30 NBA tids for each season in the `tradableDraftPickSeasons` window; idempotent; prunes passed seasons.
- [ ] `tradeService.ts` — filter picks to `season <= currentYear + tradableDraftPickSeasons`

---

## 5. Season Rollover Pipeline (`ADVANCE_SEASON` action)

Order of operations when user/system triggers end-of-season advance:

1. **Stamp champion/runner-up** in `historicalAwards` (already done by `lazySimRunner`)
2. **Stamp `playoffRoundsWon`** on team seasons (already done by `lazySimRunner`)
3. **Run player progression** final season pass (ProgressionEngine already handles daily)
4. **Contract expiry** — decrement `contractLength`. Players with `exp <= currentYear` → `status: 'Free Agent'`, `tid: -1`
5. **Bird Rights** — `yearsWithTeam >= 3` → `hasBirdRights: true`
6. **Restricted free agents** — rookies completing 4-year deal → `freeAgencyStatus: 'restricted'`
7. **Clear transient state** — `schedule: []`, `boxScores: []`, `christmasGames: []`, `allStar: undefined`, prune expired bets, clear `pendingHypnosis`, clear `pendingClubDebuff`
8. **Apply cap inflation** (§4c) — scale `salaryCap`, `luxuryPayroll` by inflation %
9. **Draft picks bookkeeping** — expire picks from `season < currentYear` that were never used
10. **Increment `leagueStats.year += 1`**
11. **Regenerate schedule** for new year (call existing generator with `leagueStats.year`)
12. **Age players** — `player.age += 1` for all active players (or derive from `born.year` + new season year)
13. **Generate future draft picks** for new season (§4d)
14. **Season Preview modal** — show offseason summary before first game
15. **HOF check** — `hofActions.ts` for any retired players

### Tasks
- ✅ **`src/services/logic/seasonRollover.ts`** — `applySeasonRollover()` + `shouldFireRollover()` (Apr 2026 session 4)
  - Fires on June 30 of season year (day before FA opens)
  - Contract expiry: players with `contract.exp <= currentYear` → `tid=-1`, `status='Free Agent'`
  - Bird rights: `yearsWithTeam >= 3 && birdRightsEnabled` → `hasBirdRights=true`
  - Year increment: `leagueStats.year += 1`
  - Cap inflation: `applyCapInflation()` scales salaryCap, luxuryPayroll, aprons, minContract
  - Clears: `christmasGames`, `playoffs`, `allStar`, `draftLotteryResult`
  - Generates rollover news item with new cap + expired count
  - Wired into `simulationHandler.ts` daily loop
- ✅ Age increment (step 12) — `player.age += 1` on rollover (Apr 2026 session 5)
  - All active players age (contracted, FA, external league, retired)
  - Deceased (`diedYear` set) and future draft prospects (`tid === -2`) are skipped
- ✅ Schedule regen at rollover is handled by `autoResolvers.ts` on Aug 14 (already done)

---

## 6. Contract Expiry & Free Agency Phase

### §6a — Contract Expiry (at rollover)
- ✅ `player.contract.exp <= currentYear` → `tid = -1`, `status = 'Free Agent'` — `seasonRollover.ts`
- ✅ Track `yearsWithTeam` per player for Bird Rights — incremented at rollover for under-contract players; resets to 0 on FA (Apr 2026 session 9)
- ✅ Player option at rollover — AI opts in if `marketValue < contract × 0.9`; opt-out → FA (Apr 2026 session 9)

### §6b — Free Agency Phase
- ✅ FA detection — `state.players.filter(p => p.tid < 0 && p.status === 'Free Agent')`
- ✅ AI signing loop — tapered frequency: Jul 1–15 daily, Jul 16–31 every 2d, Aug every 4d, Sep every 7d, Oct–Feb every 14d (simulationHandler.ts)
- ✅ FA pool stays open through March 1 (playoff eligibility deadline) — no hard routing to external leagues at July 31
- ✅ Cap refresh — inflation applied at rollover before FA opens
- [ ] **March 1 playoff eligibility deadline** — players signed after March 1 get `playoffEligible: false` flag (cosmetic; AI already stops signing after season winds down)
- [ ] External league routing (`externalSigningRouter.ts`) — route unsigned players (OVR-based) to Euroleague/G-League/PBA on Oct 1 if still unsigned

### §6c — Contract Salary Formula ✅ FULLY IMPLEMENTED

**Formula (in `computeContractOffer` in `salaryUtils.ts`):**
```
Score  = (POT × 0.50) + (OVR × 0.50)
Salary = MAX(minSalary, maxContract × ((MAX(0, Score − 68) / 31) ^ 1.6))
```

All tiers, service-tiered max/min tables, mood modifiers, contract length formula, and player option probability are live in `salaryUtils.ts`. Wired into `AIFreeAgentHandler.ts`. All tasks ✅.

**Remaining §6c tasks:**
- [ ] **AI end-of-season max/supermax extensions** — `runAISeasonEndExtensions()` in May–June window after awards set; supermax-eligible if MVP/DPOY/All-NBA in last 3 seasons.

---

## 7. Draft System

### §7a — Draft Class (ALREADY IN ROSTER FILE up to 2028)
The alexnoob roster file has draft prospects (`tid === -2`) through 2028.
**No generation needed yet** — just use existing prospects.

For 2029+ (future work):
- [ ] `DraftClassGenerator.ts` — generate 60 players per season with BBGM pattern
  - Round 1: age 18-21, OVR ~[45, 65]
  - Round 2: age 19-23, OVR ~[35, 55]
  - Slug deduplication vs `existingPlayers`

### §7b — Draft Scouting View (dynamic URL) ✅ DONE Apr 2026
- ✅ `DraftScoutingView.tsx` — URL now derives from `state.leagueStats.year`: `${GIST_BASE}${draftYear}classScouting`. Re-fetches on year change via `useEffect([draftYear])`.
- [ ] Create gist files per year: `2027classScouting`, `2028classScouting`, ...
- [ ] Fallback: show all `tid === -2` by OVR when gist 404s (error message shows instead)

### §7c — Draft Lottery Logic
- Pure function `runDraftLottery(lotteryStandings): DraftLotteryResult[]`
- 14 non-playoff teams, NBA 2019 odds (140/140/140/125/105/90/75/60/45/30/20/15/10/5)
- Store result in `GameState.draftLotteryResult`
- Update `draftPicks` ownership after lottery

### §7d — Draft Pick Execution
- `EXECUTE_DRAFT_PICK` action: removes from `draftClass`, adds to team with rookie contract
- Rookie contract scale by pick slot (slot 1 = max rookie, slot 60 = minimum)
- Undrafted after 60 picks → `undraftedFreeAgents[]`

---

## 8. Draft Lottery UI + Draft Board UI — INTEGRATION NEEDED

> User has built complete standalone apps for both. Need to adapt into game context.

### §8a — Current State (User's Standalone Apps)

**Lottery App** (`App.tsx` + `lottery.ts` + `teams.ts`):
- Animated lottery balls with reveal sequence
- Weighted draw using `runLottery(teams, chances, numToPick)` pure function
- 14-team seeded table with odds breakdown
- History of past sims
- Speed control (fastest/normal/slow/dramatic)

**Draft Board App** (`DraftSimulator.tsx`):
- "On the Clock" panel with team logo + announcement text
- Available players list (from `players.json` ESPN data) with position filter
- Play/Pause sim with speed control
- Draft modal with player portrait + stats
- Full Draft review table at bottom

### §8b — DayView Cards to Add

In `DayView.tsx`, add two special cards that appear on the right calendar dates:

**Draft Lottery Card** (mid-May, after playoffs end):
```tsx
// Show when: state.playoffs?.bracketComplete && !state.draftLotteryResult
// Date: ~May 14 (derive from leagueStats.year)
{showLotteryCard && (
  <div className="col-span-full bg-[#111] border border-indigo-500/20 rounded-2xl p-6">
    <div className="flex items-center justify-between">
      <div>
        <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">NBA Draft Lottery</div>
        <h3 className="text-2xl font-black text-white">Tonight at 8pm ET</h3>
        <p className="text-slate-500 text-xs mt-1">14 teams competing for the #1 pick</p>
      </div>
      <button onClick={() => onViewChange('Draft Lottery')} className="px-6 py-3 bg-indigo-600 text-white font-black uppercase text-xs rounded-xl">
        Run Lottery
      </button>
    </div>
  </div>
)}
```

**NBA Draft Card** (late June):
```tsx
// Show when: state.draftLotteryResult && !state.draftComplete
{showDraftCard && (
  <div className="col-span-full ... border-amber-500/20">
    <div>2026 NBA Draft</div>
    <button onClick={() => onViewChange('Draft Board')}>Enter Draft Room</button>
  </div>
)}
```

### §8c — Integration Tasks

**Lottery integration:** ✅ DONE Apr 2026
- ✅ `DraftLotteryView.tsx` built — ball animation, real team records, `UPDATE_STATE` dispatch for result
- ✅ `DraftSimulatorView.tsx` built — state prospects, auto-sim, pick modal, draft table
- ✅ Wired into `NavigationMenu.tsx` and `MainContent.tsx`

**Remaining:**
- ✅ Draft pick execution — `finalizeDraft()` in `DraftSimulatorView.tsx` (Apr 2026 session 5)
  - Respects `leagueStats.rookieScaleType` (dynamic/static) and `rookieContractLength`
  - R1 picks: 4-yr rookie deal (user-configurable), R2 picks: 2-yr deal
  - Undrafted prospects (`tid === -2`) → `tid = -1, status = 'Free Agent'`
  - Dispatches `UPDATE_STATE` to persist to game state; shows "Commit Picks" button when draft completes
- ✅ Draft Board always shown in sidebar nav under 'Draft' section (Apr 2026 session 5)
  - Defaults to showing previous draft class results when no current draft is in progress
- ✅ **Draft order uses lottery results** (Apr 2026 session 8) — `draftOrder` useMemo now reads `state.draftLotteryResult` to build picks 1–14 in lottery order, then appends playoff teams (not in lottery) best→worst for picks 15–30. Falls back to standings order when no lottery result present.

### §8d — Key pure functions ✅ DONE Apr 2026
`src/services/draft/runLottery.ts` — `runDraftLottery(teams)` implements weighted draw with NBA 2019 odds (140/140/140/125/105/90/75/60/45/30/20/15/10/5). Top 4 picks drawn from combination pool, picks 5-14 fill in standing order.

### §8e — ✅ FIXED Apr 2026: Auto-Lottery & Auto-Draft Now Fire in All Sim Paths

**Investigated and fixed Apr 12 2026.**

**What's broken:** When simming past May 14 (Draft Lottery) or June 26 (NBA Draft) via:
- Schedule "Simulate Day" / "To Date" (`ADVANCE_DAY` / `SIMULATE_TO_DATE` → `gameLogic.ts`)
- PlayoffView sims (`SIMULATE_TO_DATE` with target like `'2026-06-30'`)
- Any direct dispatch of `SIMULATE_TO_DATE`

...the lottery and draft **never auto-fire**. The DayView Draft Lottery / NBA Draft cards still show "Run Lottery" / "Watch Draft" with the manual button, because `state.draftLotteryResult` and `state.draftComplete` are both `undefined`.

**Why:** `autoRunLottery` and `autoRunDraft` live inside `lazySimRunner.ts`'s event loop (`buildAutoResolveEvents`). `gameLogic.ts` (`processTurn`) calls `runSimulation` directly — it has no equivalent event-firing logic. The only path that fires them today is the initialization `runLazySim` (start game with jump date past June).

**The fix (ready to implement):**

In `src/store/logic/gameLogic.ts`, right before the `return {}` block (after bets, ~line 652), add using the existing `wasDateReached()` helper:

```ts
// ── Draft Lottery & Draft Auto-Fire ──────────────────────────────────────
const draftYear = state.leagueStats?.year ?? 2026;
let autoDraftLotteryResult = state.draftLotteryResult;
let autoDraftComplete = state.draftComplete;

if (wasDateReached(new Date(`${draftYear}-05-14T00:00:00Z`)) && !autoDraftLotteryResult) {
    const { autoRunLottery } = await import('../../services/logic/autoResolvers');
    const patch = autoRunLottery({ ...state, players: updatedPlayers });
    if ((patch as any).draftLotteryResult) {
        autoDraftLotteryResult = (patch as any).draftLotteryResult;
        uniqueNewNews.push({ id: `auto-lottery-gl-${Date.now()}`, headline: 'Draft Lottery Complete',
            content: 'The NBA Draft Lottery has concluded. View the Draft Lottery tab for full results.',
            date: dateString, type: 'league', read: false, isNew: true } as any);
    }
}
if (wasDateReached(new Date(`${draftYear}-06-26T00:00:00Z`)) && !autoDraftComplete) {
    const { autoRunDraft } = await import('../../services/logic/autoResolvers');
    const patch = autoRunDraft({ ...state, players: updatedPlayers, draftLotteryResult: autoDraftLotteryResult } as any);
    if ((patch as any).players) updatedPlayers = (patch as any).players;
    if ((patch as any).draftComplete) {
        autoDraftComplete = true;
        uniqueNewNews.push({ id: `auto-draft-gl-${Date.now()}`, headline: 'NBA Draft Complete',
            content: 'The NBA Draft has concluded. All prospects have been assigned to teams.',
            date: dateString, type: 'league', read: false, isNew: true } as any);
    }
}
```

Then in the `return` statement add:
```ts
draftLotteryResult: autoDraftLotteryResult ?? state.draftLotteryResult,
draftComplete: autoDraftComplete ?? state.draftComplete,
```
(These fields currently aren't spread in the return — that's the second bug.)

**Also:** DraftLotteryView "Sim Lottery" → "Start Lottery" rename (cosmetic). [ ] Still pending.

**Also:** PlayoffView `'2026-06-30'` → ✅ Already uses `` `${year}-06-30` `` (reads `state.leagueStats.year` on line 15).

---

## 9. Season Preview / Retirement Ceremony

> **NOT building a Season Preview modal** — Power Rankings already serves as the season outlook. Retirement ceremony and power rankings will be built as isolated standalone views by the user.

**What exists and is done:**
- ✅ `retirementChecker.ts` — probabilistic retire, seeded deterministic, career totals snapshot (Apr 2026)
- ✅ `retirementAnnouncements: RetireeRecord[]` on `GameState` — populated at rollover, reset yearly, `isLegend` flag for 5+ AS
- ✅ News items generated per retiree at rollover
- ✅ `seasonPreviewDismissed` flag exists on state; DayView card exists

**Moved to `NEW_FEATURES.md`:**
- Retirement Ceremony View (dedicated page with tribute format for legend retirees)
- `retirement_legend` news card type with photo + career stats block
- Power Rankings View (standalone, tier list format)

---

## 10. Stat History & Legacy ✅ DONE

- ✅ **`computeCareerStats(player)`** — `src/utils/playerRatings.ts:159`. Sums all non-playoff stat rows; returns ppg/rpg/apg + shooting splits.
- ✅ **`GameState.seasonHistory[]`** — typed as `SeasonHistoryEntry[]` in `types.ts`. Auto-appended on `bracketComplete` in both `lazySimRunner.ts` AND `gameLogic.ts` (added Apr 2026 session 9). Contains champion, runnerUp, mvp, finalsMvp, roty, dpoy per season.
- ✅ **Transactions year navigation** — `TransactionsView.tsx` has left/right chevron year picker. `state.history[]` is NOT cleared at rollover. (Apr 2026 session 9)

---

## 11. Multi-Season Checklist (Season → Season)

Run through this before each new season to verify the loop is working.

- ✅ `leagueStats.year` incremented (+1) — `seasonRollover.ts`
- ✅ `schedule` regenerated for new year — `autoResolvers.ts` on Aug 14
- [ ] All players have fresh `stats` entry with new season after first game — verify post-rollover
- ✅ Contract expiry ran — `seasonRollover.ts` sets `tid=-1, status='Free Agent'` for expired players
- [ ] No player has `contractLength < 0` — verify after rollover
- ✅ Draft class from roster file available (`tid === -2`) — alexnoob roster has prospects through 2028
- ✅ Draft lottery result assigned — autoRunLottery fires in all sim paths (gameLogic + lazySimRunner)
- [ ] `boxScores` cleared or partitioned by season — currently NOT cleared at rollover; grows unbounded. Add `boxScores: []` to rollover clear list if memory becomes an issue.
- ✅ `allStar` reset to `undefined` — `seasonRollover.ts`
- ✅ `bets` resolved bets older than 2 seasons pruned at rollover — `seasonRollover.ts` (Apr 2026 session 9)
- [ ] HOF check for retired players — `hofActions.ts` not yet wired; move to NEW_FEATURES.md priority
- ✅ Retirement announcements populated — `retirementChecker.ts` + `seasonRollover.ts`
- ✅ Broadcasting lock resets — `mediaRights.isLocked` remains but deadline auto-advances via `${year}-06-30`
- ✅ Cap inflation applied — `applyCapInflation()` in `seasonRollover.ts`
- ✅ Season history snapshot appended — on `bracketComplete` in both sim paths

---

## 12. File Map

| Concern | File |
|---|---|
| Daily player progression | `src/services/playerDevelopment/ProgressionEngine.ts` ✅ |
| Bust lottery | `src/services/playerDevelopment/bustLottery.ts` ✅ Apr 2026 |
| Retirement checker | `src/services/playerDevelopment/retirementChecker.ts` ✅ Apr 2026 |
| Season rollover | `src/services/logic/seasonRollover.ts` ✅ Apr 2026 |
| Cap thresholds | `src/utils/salaryUtils.ts` ✅ |
| Trade outlook (buyer/seller) | `src/utils/salaryUtils.ts → getTradeOutlook()` ✅ |
| Attendance estimates | `src/utils/attendanceUtils.ts` ✅ |
| AI trade logic | `src/services/AITradeHandler.ts` ✅ implemented |
| AI FA logic | `src/services/AIFreeAgentHandler.ts` ✅ implemented |
| Draft pick generator | `src/services/draft/DraftPickGenerator.ts` ✅ Apr 2026 |
| Draft lottery pure fn | `src/services/draft/runLottery.ts` ✅ |
| Draft class generation | `src/services/draft/DraftClassGenerator.ts` [ ] |
| Trade execution | `src/store/logic/actions/tradeActions.ts → handleExecutiveTrade()` ✅ |
| Sim day loop | `src/store/logic/turn/simulationHandler.ts` ✅ |
| Cap inflation | `src/utils/finance/inflationUtils.ts` ✅ |
| Broadcasting cap calc | `src/components/operations/BroadcastingView.tsx` ✅ |
| Economy settings | `src/components/commissioner/rules/view/EconomyTab.tsx` ✅ |
| News injection | `src/services/lazySimNewsGenerator.ts → NewsGenerator` ✅ |
| Draft Lottery View | `src/components/draft/DraftLotteryView.tsx` ✅ Apr 2026 |
| Draft Board View | `src/components/draft/DraftSimulatorView.tsx` ✅ Apr 2026 |
| Player Stats View | `src/components/central/view/PlayerStatsView.tsx` ✅ Apr 2026 |

---

## 13. Hardcoded Values Hunt

Run after every session:
```bash
grep -rn "2025\|2026\|2027\|START_DATE_STR\|currentSeason = 20" src/ --include="*.ts" --include="*.tsx"
```

| File | Line | Value | Fix | Status |
|------|------|-------|-----|--------|
| `src/constants.ts` | 15 | `START_DATE_STR = '2025-08-01'` | derive from `leagueStats.year - 1` | [ ] |
| `src/store/logic/turn/postProcessor.ts` | 60 | `const currentSeason = 2026` | use `leagueStats.year` | ✅ Done |
| `src/store/initialState.ts` | 5,27,28,57 | `new Date(START_DATE_STR)` | use `resolveSeasonDate()` | [ ] |
| `simulationHandler.ts` | ~22,55 | `'2026-04-13'`, `'2026-04-15'` | uses `leagueStats.year` | ✅ Done |
| `gameScheduler.ts` | all | `2026`, `2025` literals | `yr = seasonYear ?? 2026` | ✅ Done |
| `gameLogic.ts` | all | `2026`, `2025` literals | `scheduleYear = leagueStats.year` | ✅ Done |
| `PlayoffAdvancer.ts` | all | `2026` literals | uses `bracket.season` | ✅ Done |
| `statUpdater.ts` | OPENING_NIGHT | `2025-10-24` | `(leagueStats.year ?? 2026) - 1` | ✅ Done |
| `leagueSummaryService.ts` | all | `2026` literals | `seasonYear` param | ✅ Done |
| `BroadcastingView.tsx` | deadline | `10-24` (Opening Night) | `${year}-06-30` | ✅ Done |
| `NavigationMenu.tsx` | badge | `10-24` | `${year}-06-30` | ✅ Done |
| `initialization.ts` | 102, 222 | `'2025-08-06'` | `getSeasonSimStartDate(INITIAL_LEAGUE_STATS.year)` | ✅ Apr 2026 session 9 |
| `CommissionerSetup.tsx` | 24, 52, 58 | `'2025-08-06'` | `SIM_START_DATE` derived from `INITIAL_LEAGUE_STATS.year` | ✅ Apr 2026 session 9 |
| `Dashboard.tsx` | 45 | `new Date('2025-10-24')` | `getOpeningNightDate(leagueStats.year)` | ✅ Apr 2026 session 9 |
| `lazySimNewsGenerator.ts` | 44 | `new Date('2025-10-24')` | `seasonYear` param → `getOpeningNightDate(seasonYear)` | ✅ Apr 2026 session 9 |
| `PlayerBioView.tsx` | 366 | `new Date('2025-10-24')` | `getOpeningNightDate(state.leagueStats.year)` | ✅ Apr 2026 session 9 |
| `StatisticalFeatsView.tsx` | 102 | `new Date('2025-10-24')` | `getOpeningNightDate(state.leagueStats.year)` | ✅ Apr 2026 session 9 |
| `GlobalGamesModal.tsx` | 108-109 | `'2025-10-24'`, `'2026-04-15'` | `seasonYear` prop → `getOpeningNightDate(seasonYear)` | ✅ Apr 2026 session 9 |
| `bioCache.ts` | 107 | `"2026-01-08"` | needs game state context; low-priority | [ ] |
| `lazySimRunner.ts` | 58-76, 156-162 | milestone dates | `buildAutoResolveEvents(year)` + year-aware `getPhaseLabel` | ✅ Apr 2026 session 5 |
| `AIFreeAgentHandler.ts` | ~132 | `2026 - born.year` | use `state.leagueStats.year` | ✅ Done (function deprecated, replaced by `computeContractOffer`) |

---

## 14. Architectural Notes & Design Decisions

> Captured from sessions — non-obvious logic that future dev should know.

### Retirement probability curve (retirementChecker.ts)
- Uses a "viability OVR" threshold per age (62 + 1.0 × (age−34)) — rises each year. OVR below this = real retirement risk.
- `ageFactor` (0→1 over ages 34→43) and `gapContrib` (how far below viability) blend 45/55.
- Age 43+ always retires. Age < 34 never retires unless OVR < 50 (freak injury/career ruin case).
- Seeded deterministic: same player + year → same outcome on replay. Seed: `retire_{internalId}_{year}`.
- **Watch out**: players in FA pool (tid=-1) also get retirement rolls — this is intentional. Unsigned 38-year-old should retire, not sit forever.

### DraftPick ownership invariant
- `tid` = current owner (changes when traded). `originalTid` = who it was issued to (immutable).
- `generateFuturePicks()` creates with `tid === originalTid` — untraded picks belong to original team.
- `pruneExpiredPicks()` keeps `season >= currentYear` — the current year's draft hasn't happened yet so keep it.
- Collision-proof `dpid`: `900000 + counter + Date.now() % 10000`.

### All-Star appearance tracking
- Stored in `player.awards[]` as `{ type: 'All-Star', season: number }`.
- Added by `autoResolvers.ts` when All-Star rosters are announced. No separate counter needed.
- Retirement checker reads `player.awards?.filter(a => a.type === 'All-Star').length` directly.

### 70/30 NBA/outside lottery split (seasonal events)
- `isNBAActive(p)` = on NBA roster, not FA/overseas/retired/WNBA.
- Lightning strikes, Father Time brackets, MiddleClassBoosts: 70% NBA slots / 30% external.
- `applySeasonalBreakouts`: `hitRate = nba ? 1.0 : 0.43` so outside players get ~43% event probability.
- Root cause: 1637 FAs+overseas vs 703 NBA players — without split, FAs dominated all lottery outcomes.

### Portrait fallback chain
- Always: `player.imgURL` (BBGM) → CDN (`hdPortrait(nbaId)`) → initials (ui-avatars).
- `getPlayerImage()` in `bioCache.ts` returns BBGM first. CDN only if no BBGM URL.
- `PlayerBioHero`: eager CDN upgrade removed — only switches to CDN after successful network fetch.
- `AllStarRosterModal`, `AllStarRoster`: all img tags use `fullPlayer?.imgURL || CDN_URL`.

### `saveId` at init
- Fixed: `saveId: \`nba_commish_save_${Date.now()}\`` set at game creation time.
- All lottery seeds use `saveSeed` — without unique saveId, every new save had identical progressions.

### Season rollover order
1. Age all players (except deceased + tid=-2 prospects)
2. Contract expiry → Free Agent
3. Bird rights accumulation
4. Cap inflation
5. **Retirement checks** (new Apr 2026) — runs on post-age players
6. **Draft pick generation** (new Apr 2026) — extends pick window by 1 season
7. News items (inflation + retirements)
8. Clear: `christmasGames`, `playoffs`, `allStar`, `draftLotteryResult`, `draftComplete`
9. Reset: `seasonPreviewDismissed = false`, `retirementAnnouncements = newRetirees`

---

## 15. Future Ideas

> **Moved to `NEW_FEATURES.md`** — see that file for full list of aspirational features (player/team options, QOs, stretch provision, TPEs, buyouts, 2-way, G-League call-ups, salary arb, HOF, power rankings, retirement ceremony, etc.)
