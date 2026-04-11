# NBA Commish — Multi-Season & Economy Master Plan

> Last updated: 2026-04-10 (session 3)
> Goal: Full multi-season loop (development → offseason → draft → FA → new season) + AI trades/FA + economy inflation.
> **Consolidates:** `multiseason_todo.md` + `AI_AND_ECONOMY_PLAN.md` (delete that file — it's now here)

---

## STATUS LEGEND
- ✅ Done
- 🔧 In progress / partial
- [ ] Not started

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
- [ ] **`src/constants.ts`** — Remove `START_DATE_STR`. Add `SEASON_YEAR_OFFSET = 1`. Replace `[10, 24]` in `SEASON_DATES` with `{ month: 10, ordinal: 4, day: 'Tue' }` named ordinals.
- [ ] **`src/utils/dateUtils.ts`** (new) — `resolveSeasonDate(seasonYear, month, ordinal, day): Date`. Given year 2027, month=10, 4th Tuesday → finds actual date. No string literals in output.
- [ ] **`src/store/initialState.ts`** — Derive `date` from `leagueStats.year`, not `START_DATE_STR`.
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
- [ ] **`initialization.ts`** — Audit all `new Date('2025-...')` / `new Date('2026-...')` literals.
- [ ] **Search sweep:** `grep -rn "2025\|2026\|2027\|START_DATE_STR\|currentSeason = 20" src/`

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

### Future enhancements
- [ ] **Injury history modifier** — players with prior `gamesRemaining > 30` injury take extra `[-2, 0]` athleticism hit
- [ ] **Breakout event** — 2% chance per young player per season to get `+8` to one key rating + news headline
- [ ] **Retire detection** — age > 37 AND ovr < 65 → roll retire probability. Move to `retiredPlayers[]`.
- [ ] **HOF eligibility** — trigger `hofActions.ts` check on retired players
- [ ] **Rating edit audit** — `manualRatingEdit: true` flag on player when edited via modal
- [ ] **Draft prospects rating display** — add "Prospects" filter to `PlayerRatingsView`
- [ ] **Position archetypes** — preset buttons in edit mode: "3&D Wing", "Pass-First PG", etc.

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
- [ ] Wire execution of accepted AI-vs-AI proposals into daily loop (execute automatically after N days pending)

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
- [ ] `DraftPickGenerator.ts` — on rollover, `generateFuturePicks(teams, currentYear, N)`
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
- [ ] `player.contract.exp <= currentYear` → `tid = -1`, `status = 'Free Agent'`
- [ ] Track `yearsWithTeam` per player for Bird Rights
- [ ] Player option: if `hasPlayerOption && currentYear === exp` → AI opts in if `marketValue > contractAmount × 0.9`

### §6b — Free Agency Phase
- [ ] `phase === 'Free Agency'` start: all expired players become FAs
- [ ] AI signing loop (`AIFreeAgentHandler.runAIFreeAgencyRound`) — runs each "day" of FA period
- [ ] Salary cap refresh at rollover (§4c inflation applies first)
- [ ] After July 31: remaining FAs become mid-season available

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

### §8d — Key pure functions ✅ DONE Apr 2026
`src/services/draft/runLottery.ts` — `runDraftLottery(teams)` implements weighted draw with NBA 2019 odds (140/140/140/125/105/90/75/60/45/30/20/15/10/5). Top 4 picks drawn from combination pool, picks 5-14 fill in standing order.

---

## 9. Season Preview UI

### When it appears
- **Trigger:** On the first DayView date of the new season — Aug 14 (preseason schedule generation day) — as a special DayView card, **before** any preseason games. Think of it as finding the "Season Preview" card in the calendar the same way you'd find the Draft Lottery or NBA Draft card.
- **Persistent access:** Also pinned in the sidebar nav under a "Season Preview" entry (visible Aug–Oct until user dismisses).
- **Not a blocker** — user can skip it and come back from sidebar. No "Begin Season" gate needed (schedule already regenerates via autoResolvers on Aug 14).

### DayView card (Aug 14)
```tsx
// Show when: new season year detected (leagueStats.year incremented) && !state.seasonPreviewDismissed
// Card sits at top of Aug 14 DayView alongside schedule regen notice
{showSeasonPreviewCard && (
  <div className="col-span-full bg-[#111] border border-amber-500/20 rounded-2xl p-6">
    <div className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Season Preview</div>
    <h3 className="text-2xl font-black text-white">{leagueStats.year} Season Outlook</h3>
    <p className="text-slate-500 text-xs mt-1">Preseason tips off in 2 weeks — see the offseason recap & power rankings</p>
    <button onClick={() => onViewChange('Season Preview')}>Open Preview</button>
  </div>
)}
```

### Modal / View content
- [ ] **`src/components/seasonPreview/SeasonPreviewModal.tsx`**:
  - Offseason recap: top trades, FA signings, draft results (pull from `state.history[]` filtered to Jun–Sep)
  - Power rankings: all 30 teams sorted by projected OVR (`calculateTeamStrength`), shown as ranked list with OVR bar + additions/departures
  - Predicted finish: OVR sort + mild seeded randomness per team
  - Retirement announcements section (see §9a below)
  - Dismiss button → sets `state.seasonPreviewDismissed = true`, removes sidebar entry

### §9a — Retirement Announcements
Retirement should be **announced before the season starts** (shown prominently in the Season Preview modal AND as a standalone news item on Aug 14).

**Who gets announced:**
- Any player whose `status === 'Retired'` as of the new season start
- **Prominent announcement** (top of Season Preview, dedicated news headline): players with **5+ All-Star appearances** (`career.allStarAppearances >= 5`) — e.g. Tim Duncan, Kobe, LeBron-tier. Should feel like a real send-off.
- **Standard announcement** (news item only, listed in Season Preview): starters/rotation players with OVR ≥ 70 at retirement
- **Quiet retirement** (no announcement): role players / bench depth

**Announcement format:**
```
[Player Name] Announces Retirement After [N]-Year Career
"[Player] officially announced his retirement today, ending a [N]-year career that included [X] All-Star selections, [Y] championships, and [Z] career points."
```

**Tasks:**
- [ ] `retirementChecker.ts` — run at rollover (age > 37 AND ovr < 65 → probabilistic retire roll). Sets `player.status = 'Retired'`, stamps `player.retiredYear = currentYear`, `player.careerStats` snapshot.
- [ ] All-Star appearance count — `player.careerAllStarAppearances: number` incremented each year a player makes the All-Star game (in `allStarActions.ts` or All-Star orchestrator)
- [ ] `retirementAnnouncements[]` on `GameState` — populated at rollover, consumed by Season Preview + news generator on Aug 14
- [ ] Prominent news item for 5+ AS retirees: `type: 'retirement_legend'` renders with player photo, career stats, tribute format

- [ ] Data shape:
  ```ts
  interface SeasonPreviewData {
    seasonYear: number;
    teams: { tid: number; name: string; ovr: number; projectedRecord: [number, number]; additions: string[]; departures: string[] }[];
    draftResults: { pick: number; round: 1|2; name: string; tid: number }[];
    majorSignings: { name: string; teamName: string; years: number; aav: number }[];
    retirements: { playerId: string; name: string; age: number; allStarAppearances: number; championships: number; careerPts: number; isLegend: boolean }[];
  }
  ```

---

## 10. Stat History & Legacy

- [ ] **`computeCareerStats(player)`** util — `career.pts = Σ stats[].pts`, etc. for career totals UI
- [ ] **`GameState.seasonHistory[]`** — snapshot per season: `{ year, champion, mvp, roty, champion_tid }`. Auto-appended on `bracketComplete`.
- [ ] **Transactions log** — `state.history[]` already works. Ensure rollover does NOT clear it. Partition display by `season`.

---

## 11. Multi-Season Checklist (Season → Season)

Run through this before starting each new season:

- [ ] `leagueStats.year` incremented (+1)
- [ ] `schedule` regenerated for new year
- [ ] All players have fresh `stats` entry with new season after first game
- [ ] No player has `contractLength < 0` (expiry logic ran)
- [ ] Draft class from roster file available (`tid === -2`, correct season)
- [ ] Draft lottery result assigned (`state.draftLotteryResult` populated)
- [ ] `boxScores` cleared (or partitioned by season)
- [ ] `allStar` reset to `undefined`
- [ ] `bets` — expired bets pruned
- [ ] HOF check ran for retired players
- [ ] Season preview shown before first game

---

## 12. File Map

| Concern | File |
|---|---|
| Daily player progression | `src/services/playerDevelopment/ProgressionEngine.ts` ✅ |
| Cap thresholds | `src/utils/salaryUtils.ts` ✅ |
| Trade outlook (buyer/seller) | `src/utils/salaryUtils.ts → getTradeOutlook()` ✅ |
| Attendance estimates | `src/utils/attendanceUtils.ts` ✅ |
| AI trade logic | `src/services/AITradeHandler.ts` [ ] |
| AI FA logic | `src/services/AIFreeAgentHandler.ts` [ ] |
| Draft lottery pure fn | `src/services/draft/runLottery.ts` — copy from user's `lottery.ts` |
| Draft class generation | `src/services/draft/DraftClassGenerator.ts` [ ] |
| Trade execution | `src/store/logic/actions/tradeActions.ts → handleExecutiveTrade()` ✅ |
| Sim day loop | `src/store/logic/turn/simulationHandler.ts` ✅ |
| Cap inflation | `src/utils/finance/inflationUtils.ts` [ ] |
| Broadcasting cap calc | `src/components/operations/BroadcastingView.tsx` ✅ |
| Economy settings | `src/components/commissioner/rules/view/EconomyTab.tsx` ✅ |
| News injection | `src/services/lazySimNewsGenerator.ts → NewsGenerator` ✅ |
| Draft Lottery View | `src/components/draft/DraftLotteryView.tsx` ✅ Apr 2026 | Built last session — ball animation, real team records, saves result |
| Draft Board View | `src/components/draft/DraftSimulatorView.tsx` ✅ Apr 2026 | Built last session — state prospects, auto-sim, pick modal, draft table |
| Player Stats View | `src/components/central/view/PlayerStatsView.tsx` ✅ Apr 2026 | BBGM-style full rewrite: team/season/phase/stat-type filters, career aggregation, per-36/advanced, bref fetch, HOF highlights, mobile-friendly |

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
| `initialization.ts` | TBD | any 2025/2026 strings | audit | [ ] |
| `lazySimRunner.ts` | 58-76, 156-162 | milestone dates | `buildAutoResolveEvents(year)` + year-aware `getPhaseLabel` | ✅ Apr 2026 session 5 |
