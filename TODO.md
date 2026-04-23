# NBA Commish — TODO

## NEXT SESSION — Pickup Point (2026-04-24)
ALSO CRITICLA: 
Signing
Team Opt.
Jun 29, 2030
Cleveland Cavaliers has exercised their team option on Sadiq White.

Sadiq WhiteCleveland Cavaliers
Trade
Jul 18, 2028
TRADE: Los Angeles Lakers sends Sadiq White, Slobodan Perkovic, Jamal Cain + 2029 1st Rd (PHI) to Cleveland Cavaliers for Ayo Dosunmu.

Sadiq WhiteCleveland Cavaliers
View →
Draft
Jun 28, 2028
The Los Angeles Lakers select Sadiq White as the 6th overall pick of the 2028 NBA Draft.

Sadiq WhiteLos Angeles Lakers


and hten salary histoy inp layerbioview:
Bird Rights
Rookie Ext · Rose Rule
Season	Team	Lg	Salary	Type
2031–32	Cleveland Cavaliers	NBA	$7.4M	Rookie
Career Earnings	$7.4M



CRITICAL! can be delegated. no preaseaosn internaiotnal games and others as well might be missing on season +1 or subsequent seasons.



**Status:** Prompts 1–5 complete. Regression from Prompt 4 fixed (Pass 3 reorder). Two-way fill now 70/90 league-wide (was 1/90). But **roster fill is still broken** — many teams still 6–13/15 with K2 80+ FAs available. Need to root-cause why Pass 4 isn't filling.

**Active investigation files:**
- `src/services/AIFreeAgentHandler.ts` — pass order is now: Pass 1 (best-fit) → Pass 2 (two-way) → Pass 3 (NG camp) → Pass 4 (min-roster fill) → Pass 5 (min payroll floor). Reordered today to fix two-way starvation.
- `scripts/audit-economy.js` — quick health check
- `scripts/audit-economy-deep.js` — per-team payroll comp + under-rostered investigation

**Audit results from Dec 31 2030 save (after prompt 1–5 fixes):**
- ✅ Two-way 70/90 (78%) — Pass 3 reorder worked
- ✅ No teams above $400M
- ✅ No bench mega-contracts other than Brunson (legitimate father-time decline from prior star deal)
- ❌ **Atlanta 6/15** (with Tajh Ariza 90, CJ Rosser 88 already on roster — 3 two-ways too)
- ❌ Lakers 11, Wizards 12, Hornets 13, Pistons 13, 76ers 11, Magic 11, Bucks 13, Kings 13, Celtics 12, Jazz 12, Phoenix 14
- ❌ 12 teams below floor at 15/15 → need shortfall distribution
- ❌ 11 teams below floor with open slots → Pass 5 should clear them next FA round (verify by simming forward)

**FA pool at audit time:** Plenty of talent. Noa Essengue K2 93, Sayon Keita 94 (FCB), Braylon Mullins 89, Carter Bryant 87, Bennett Stirtz 87, Morez Johnson Jr 86, Matt Able 86, Isaiah Collier 86, dozens of K2 80+ FAs. So pool isn't the bottleneck.

### Hypotheses for why Pass 4 isn't filling rosters

1. **`playerMoodForTeam` mood floor.** `getBestFit` filters out players where `playerMoodForTeam(p, team, state) < 1`. For losing teams (`winPct < 0.35`) mood starts at 0.7, then `posCount >= 3` deducts 0.2 → 0.5. Lots of FAs would fail this gate for rebuilders. **But Pass 4 doesn't call `getBestFit`** — it builds candidates directly. So this only blocks Pass 1, not Pass 4. Verify.
2. **MLE/cap affordability gate too strict in Pass 4.** Pass 4 checks `offer.salaryUSD <= effectiveCapSpace + 2_000_000` OR MLE. If a K2 86 FA's `computeContractOffer` returns $25M and the team is over cap with no MLE, they're skipped. Then last-resort min-deal signs ONE per round. With `faFrequency=14` Oct–Feb, that's ~9 fills max per offseason — not enough to recover from a season of trades + waivers + retirements.
3. **`autoTrimOversizedRosters` over-cutting.** Trade overflow + bad waiver logic could be cutting faster than Pass 4 fills. Check trim logs.
4. **Trades dumping salaries.** AI trades may be moving 3-for-1 deals that drop teams to 11–13 standard, with no immediate refill before next FA round date.

### Suggested order tomorrow

**Prompt 6 (recommended FIRST):** Add roster-fill diagnostic logging — instrument Pass 4 to console.log per-team: `[Pass4] team=X, currentRoster=N/15, candidates=K, signed=M, reason for stop`. Sim 2 weeks, read the logs, identify the actual blocker.

**Prompt 7 (after diagnosis):** Either (a) loosen Pass 4 affordability to allow over-cap min-salary signings up to roster minimum (NBA actually allows this — minimum-salary contracts don't trigger cap penalties), or (b) widen FA cadence near opening-night to daily until rosters compliant.

**Prompt 8 — Shortfall distribution for 15/15 floor violators:** Add `enforcePayrollFloor()` called from `seasonRollover.ts` at year-end. For teams at 15/15 below floor, distribute the gap as a one-time bonus across existing players (raise `contract.amount` proportionally, capped at maxSalary per player). Real NBA rule.

**Prompt 9 — External-league contract unstick** (originally Prompt 6 in old plan — `seasonRollover.ts:282-285`).

**Prompt 10 — Bidding war refactor** (originally Prompt 7 in old plan — biggest, save for fresh budget).

### Top-prospect post-option signings collapsing to $2M

**Evidence:** Cameron Boozer (BBGM OVR 65 ≈ K2 88) — CHA exercises team option Jun 29 2028, then signs with POR for $2M/1yr on Jul 1 2030. Should be $30M+ via rookie extension OR competitive bidding war. Same family as "AI doesn't max stars / Bird Rights ignored" cluster. Possible causes:
1. Team option exercise doesn't trigger immediate rookie extension attempt (mid-season ext is the only path; if it fires once and player declines, he flags `midSeasonExtensionDeclined: true` and hits FA with no further offer history)
2. `computeContractOffer` mispricing young blue-chips — age curve too aggressive or "no contract history" path collapses to min-tier
3. Bird Rights premium (~1.4× multiplier for prior team) not applied — every team offers the same conservative number

**First test:** sim with Pass 1 fill loop + Pass 4 OVR-DESC sort fix in place. If Pass 1's new ordering catches Boozer-tier players at market rate before they fall to $2M last-look offers, this self-resolves. If not, attack `computeContractOffer` next.

### Skipped / deferred from independent audit

- Mid-season ext `roll > 0` half-rejection (one-line, in `runAIMidSeasonExtensions`) — fixed inline today
- `playerCurrentSeason` stats-MAX vs `state.leagueStats.year` — known issue, not blocking
- Pass 4 last-resort signs at market rate not min — design choice (single-shot, not amplified)
- `newMinContract` unit fallback in seasonRollover (`?? 1_272_870` treated as millions = $1.27T) — easy fix, do tomorrow
- `faMarketTicker` hardcoded cap thresholds — easy fix, do tomorrow

### Files modified today (session 2026-04-23 s25)

- `src/utils/salaryUtils.ts` — removed 10+ YOS auto-supermax (line ~440)
- `src/components/commissioner/rules/view/EconomyContractsSection.tsx` — UI text fix
- `src/components/commissioner/rules/view/EconomyTab.tsx` — added missing supermaxMinYears + rookieExt props to interface
- `src/services/AIFreeAgentHandler.ts` — Pass 2 fill loop + TWO_WAY_OVR_CAP 52→60 + Pass 5 min payroll + pass reorder (two-way before fill)
- `CLAUDE.md` — created with pipeline notes, audit script usage, unit gotchas
- `scripts/audit-economy.js` — created
- `scripts/audit-economy-deep.js` — created

---

## FIXED — Session 2026-04-22

- ✅ **Lazy sim draft pick ownership** (`autoResolvers.ts`) — Drafted slots now correctly resolve to the *current owner* of the pick, not the original team. Adds `r1TradedMap`/`r2TradedMap` from `state.draftPicks` and a `resolvePickOwner()` helper that swaps in the trade recipient before building `draftOrder`.

- ✅ **Jump start simulates to X instead of X-1** (`initialization.ts`) — Added `stopBefore: true` to the `lazySimTo()` call in `handleStartGame`, so pick-a-date on game start now lands with that day's games still unplayed (same behavior as "Simulate To Date" from the schedule).

- ✅ **Mobile player selector modal header cutoff** (`TeamIntel.tsx`, `TradingBlock.tsx`) — Changed `max-h-[92vh]` → `max-h-[92dvh]`. On iOS, `vh` includes browser chrome in measurement, pushing the header (Done button) above the visible area. `dvh` always measures the actual visible viewport.

- ✅ **SigningModal unscrollable on mobile** (`SigningModal.tsx`) — Three-part fix:
  1. Backdrop: `overflow-y-auto` → `overflow-hidden` (pointer-events-none meant touch-scrolling was always broken anyway)
  2. Inner modal: `min-h-screen` → `h-[100dvh]` — gives the flex chain a real fixed height on mobile, which makes `flex-1 overflow-y-auto` inside actually scroll instead of expanding infinitely
  3. Middle flex container: `overflow-visible` → `overflow-hidden` — was breaking the scroll chain; desktop already had `lg:overflow-hidden`

- ✅ **SigningModal year display off by +1** (`SigningModal.tsx`) — Cap projection rows were displaying `row.year–{row.year+1}` but `row.year` was already the season end year. Fixed to `{row.year - 1}–{String(row.year).slice(-2)}`.

- ✅ **Minimum roster gate blocking FA signings** (`useRosterComplianceGate.tsx`) — The `< minRoster` guard was firing year-round. Now only enforces during regular season OR while the user's team is still in playoffs. Training camp / offseason (Jul–Oct 21) and post-elimination are unrestricted.

- ✅ **Team option showing "Unknown" in PlayerBioView** — Two-part fix:
  - `PlayerBioContractTab.tsx`: added `lastKnownTeamName` fallback — when a season has no stat entry (cut/FA mid-contract), it now reuses the most recently known team name instead of falling back to "Unknown".
  - `rosterService.ts` (`applyContractOverrides`): added `teamOptionExp: hasTeamOption ? expYear : undefined` so the `seasonRollover` team-option guard (`teamOptExp !== nextYear`) fires correctly.

- ✅ **TeamDetailView tab bar horizontal overflow on mobile** (`TeamDetailView.tsx`) — Tab container now has `overflow-x-auto [scrollbar:hidden]` and every button has `shrink-0` so the Moves tab (added after Stats) doesn't wrap or get clipped.

- ✅ **MLE signings picking up draft prospects** (`rosterService.ts`, `AIFreeAgentHandler.ts`, `faMarketTicker.ts`) — Fixed `> startYear` → `>= startYear` for current-year prospect classification, plus runtime guards in FA pool filters to exclude players with `draft.year >= currentYear`.

- ✅ **DayView mobile layout** (`DayView.tsx`) — Outer div changed from `flex-1` to `min-h-full`. `flex-1` was constraining the container to the parent's leftover height and clipping the overflow; `min-h-full` lets the game grid grow naturally and the parent `overflow-y-auto` wrapper in ScheduleView handles the scroll.

- ✅ **Resign blocked when roster full** (`SigningModal.tsx:596`) — The roster-full preflight was blocking re-signings even though they don't add roster slots (player is already on team). Changed condition from `if (roster.totalFull && !rosterFullOverridden)` to `if (roster.totalFull && !rosterFullOverridden && !isResign)` so re-signings always go through.

---

## BUGS — Active / High Priority

- **Double draft dates on calendar** — ✅ FIXED. `getDraftDate()` returned Jun 25 but both `lazySimRunner.ts` and `gameLogic.ts` hardcoded Jun 26 as the execution date, so `draftDayStr2` was added as a band-aid to mark both days visually. Removed `draftDayStr2` from CalendarView and aligned sim execution to Jun 25 in both lazySimRunner and gameLogic.

- **Gameplan rotation minutes drift off 240 after major transactions ✅** — After a trade or signing that changes the active roster, the saved gameplan's `minuteOverrides` can total 241+ (rounding from the old player set survives into the new one). The seeding effect re-seeds from the saved plan without re-normalizing, so the total stays off. Reproduce: trade away a rotation player mid-season, open Gameplan tab — total shows 241. Fix: normalize the seeded total to 240 in the seeding `useEffect`, same way `resetToAuto` does.

---

## OPUS SESSION — Prompts for Tomorrow (2026-04-24)

Paste these one at a time. Let each one finish before pasting the next.

### Prompt 1 — Load context (no code changes yet)

```

Read TODO.md (MULTI-SEASON ECONOMY sections), then read these files in full:
- src/services/AIFreeAgentHandler.ts
- src/utils/salaryUtils.ts
- src/services/logic/seasonRollover.ts
- src/services/faMarketTicker.ts
- src/store/logic/turn/simulationHandler.ts (lines 700-950 only)

After reading, give me a 1-paragraph summary of the current state of the
multi-season economy pipeline and confirm you see the bugs TODO.md lists.
Do NOT write any code yet.
```

### Prompt 2 — Proactive audit (find NEW bugs)

```
Now audit those same files for multi-season bugs NOT already in TODO.md.
Look specifically for:
- Unit mismatches (USD vs thousands vs millions)
- Off-by-one errors in year / contract.exp / leagueStats.year comparisons
- Dead settings (UI exposes a knob but no sim code reads it)
- Gates that can never fire (tautologies, unreachable conditions)
- Race conditions between rollover, FA round, and extension passes
- Silent failures (decline paths that don't log, errors swallowed)

Output as a ranked list: severity (critical/high/medium), file:line, one-line
description, one-line fix. Don't write code yet — just the list.
```

### Prompt 3 — Fix supermax auto-qualify (smallest, highest leverage)

```
Fix the supermax auto-qualify bug in salaryUtils.ts:440 (inside
isSupermaxAwardQualified). Real NBA rule: 10+ YOS players still need awards.
Remove the auto-return and let the award criteria run for everyone above
minYears. Then grep the codebase for any other places that assume 10+ YOS
means supermax and patch those too. Type-check before finishing.
```

### Prompt 4 — Pass 2 inner fill loop + 2W cap bump

```
In AIFreeAgentHandler.ts, Pass 2 (line ~262) currently signs at most ONE
player per team per round. Wrap the inner signing block so it keeps signing
from `candidates` until `rosterSize >= fillTarget` OR `pool` is empty.
Re-check rosterSize/capSpaceUSD after each signing since both change.

Same treatment for Pass 3 (two-way, line ~370): already has an inner fill
loop, but bump TWO_WAY_OVR_CAP from 52 → 60 so the post-progression pool
isn't empty.

Confirm no regression on the "first team wins" issue — that's a separate fix.
```

### Prompt 5 — Minimum payroll Pass 4

```
Add a Pass 4 to runAIFreeAgencyRound that enforces minimum payroll.

- Read leagueStats.minimumPayrollEnabled and leagueStats.minimumPayrollPercentage.
- Compute floor = salaryCap * (minimumPayrollPercentage / 100). Real NBA: 90%.
- For any AI team with payroll < floor AND rosterSize < maxStandard, keep
  signing from pool until either floor is cleared or roster is full.
- To close the gap faster, raise the per-signing offer: the last N signings
  should get priced at max(marketOffer, (floor - payroll) / openSlots).
  Floor this at minSalaryUSD so we don't hand out $0 contracts.
- Mood-gate stays relaxed: teams below floor will overpay slightly.

Run the round on a test state where 5 teams are $40M+ below floor and
confirm all 5 clear the floor within one round.
```

### Prompt 6 — External-league contract unstick

```
Fix the external-league contract freeze in seasonRollover.ts:173-178.

Current: EXTERNAL_LEAGUES guard skips all contract logic, so Barcelona deals
signed Oct 2025 with exp=2026 stay current forever.

Fix: in that branch, if player status is in EXTERNAL_LEAGUES AND
contract.exp <= currentYear, flip them to tid:-1, status:'Free Agent',
twoWay:undefined (but keep the age increment). routeUnsignedPlayers on Oct 1
will re-route them. If contract is still active, keep current behavior
(just age).

Also verify routeUnsignedPlayers reads the age-incremented player correctly
(confirm it pulls age from state.players post-rollover, not stale).
```

### Prompt 7 — Bidding war refactor (BIG — save if running low on context)

```
Refactor the FA signing pipeline to use parallel interest collection instead
of sequential first-team-wins:

1. For every FA with K2 OVR >= 70, skip Pass 1/2 and route through
   faMarketTicker instead. Markets open with N interested teams (based on
   team fit + cap room), resolve 2-5 days later by best offer × mood.
2. Pass 1 and Pass 2 become roster-minimum fills only (K2 < 70 FAs,
   minimum-salary deals).
3. Update sortedAITeams so lottery teams still get a shot — currently
   sorted by wins desc, which means rebuilders never even get to look at
   good FAs.

This is the biggest change. Write a plan first, get my approval, then
implement. Do NOT implement without approval.
```

### Prompt 8 — Validation

```
After all fixes, sim 5 seasons forward from the current save. Report:
- Payroll distribution (min, median, max) year-by-year
- Roster compliance (teams <14, teams at 15)
- Two-way utilization (0/3 league-wide should be gone)
- Supermax handouts per year (should be 3-8, not 30+)
- Any player with contract AAV > 35% of cap (shouldn't exist)

If any number looks wrong, find the root cause before calling it done.
```

---

## MULTI-SEASON ECONOMY — Critical (Feb 9 2030 audit, session 2026-04-23 s24)

League state after 4 simmed seasons: $301M 2nd-apron payrolls sitting next to $46M cap-floor-violating teams, OKC 6/15 rostered, 0/3 two-ways league-wide, bench players on $58.6M extensions. Root causes:

- **Supermax auto-qualify at 10+ YOS** (`salaryUtils.ts:440` in `isSupermaxAwardQualified`): `if (yearsOfService >= 10) return true;` — every veteran with 10+ seasons auto-qualifies for supermax regardless of awards. Cascades through extension logic: `salaryUSD = maxContractUSD = capM × 0.35` for anyone 10+ YOS. Evidence: 77-OVR Sexton at $58.6M/yr, 65-OVR Jonathan Isaac at $58.6M/yr on same CHI roster. Fix: remove the auto-qualify line; let the award criteria run for 10+ YOS players too (real NBA CBA rule).

- **Pass 2 signs only ONE player per team per round** (`AIFreeAgentHandler.ts:262-313`): the per-team loop picks one candidate and `break`s, no inner fill loop. With `faFrequency=14` Oct–Feb and 5-10 expiries each summer, rosters net down every year. Fix: wrap Pass 2's inner signing block in `while (rosterSize < fillTarget && pool.length > 0)` so it fills to 15.

- **Two-way signing gated at OVR ≤ 52 BBGM** (`AIFreeAgentHandler.ts:374`): after multi-season progression, sub-52 BBGM OVR FAs are near-extinct. League-wide 0/3 2W at Feb 2030 is the symptom. Fix: bump `TWO_WAY_OVR_CAP` to 60 and add the same inner fill loop Pass 2 needs.

- **No minimum payroll enforcement** — `minimumPayrollEnabled`/`minimumPayrollPercentage` are wired into `EconomyTab.tsx` + `leagueStats` but no sim code reads them. Fix: add a Pass 4 to `runAIFreeAgencyRound` that forces any team below `salaryCap × minimumPayrollPercentage/100` to keep signing (raising price on each signing to close the gap) until it clears the floor.

- **Team-label heuristic decoupled from reality** — 27-25 UTA at $46M payroll is labeled "Contending". Label should require `winPct ≥ 0.55 && payroll ≥ luxuryTax`, else fall back to Retool/Mid/Rebuilding.

- **FA signing round is sequential, not a bidding war** (`AIFreeAgentHandler.ts` Pass 1 + Pass 2) — `sortedAITeams` sorted by wins desc; first team whose `getBestFit` likes a FA calls `signPlayer` and removes them from the `pool`. Every subsequent team in the loop sees the shrunken pool — no bidding, no counter-offer, no second team even considering. By team #29 the pool is drained. Combined with the "one signing per team per round" bug, this means each FA gets ONE offer from ONE team (the highest-wins team that happened to fit them first), not competitive bids. Evidence: players complaining "no one offers" even though 10+ teams have cap space. `faMarketTicker` does simulate bidding for notable FAs but it only fires for tier-gated stars (K2 ≥ 78 approx); everyone else goes through the broken sequential path. Fix: for every K2 ≥ 70 FA, collect interest from ALL teams in parallel first, resolve winner by offer × mood × team fit. Make `faMarketTicker` the default path; sequential round remains only for roster-fill minimums.
              
● For this work — yeah, Opus is the right call for tomorrow.                                                                                                         
                                                            
  Here's why:                                                                                                                                                        
                                                                                                                                                                     
  This isn't a one-shot bug fix. It's a cascade of interacting systems:                                                                                              
  - Supermax qualification → extension pipeline → FA round → min payroll → roster fill → two-way → bidding logic
  - Fixing one wrong can cause regressions in another (e.g. if you kill the 10+ YOS auto-qualify but don't also fix Pass 2's fill loop, rosters still collapse — you
  just get different symptoms)
  - Each fix needs cross-checking against multiple files (salaryUtils.ts, AIFreeAgentHandler.ts, seasonRollover.ts, simulationHandler.ts, faMarketTicker.ts)

  Sonnet would do it, but you'd spend more turns re-explaining state and catching missed edge cases. Opus holds the whole system in one head.

  Plan:
  1. Start the session with "read TODO.md MULTI-SEASON ECONOMY section + seasonRollover.ts + AIFreeAgentHandler.ts + salaryUtils.ts" so Opus loads full context on
  one turn
  2. Fix supermax line first (30 sec, confirms the loop works)
  3. Then Pass 2 inner loop + min-payroll Pass 4 together (they interact)
  4. Then external-league unstick (isolated, easy)
  5. Bidding war refactor last (biggest surface area — save it for when Opus budget is fresh)

  Budget check: your weekly "All models" is 99% used. If that resets tomorrow — Opus. If it doesn't reset until Saturday — Sonnet, save Opus for the bidding war
  refactor on Saturday when the weekly rolls over.

  Plan around your reset timer. 👍
## MULTI-SEASON ECONOMY — Fixed

- ✅ **Team-option → extension coupling** (session 2026-04-23, `seasonRollover.ts`) — Mid-season extension window (Oct–Feb) uses a single deterministic roll per (player, year); if a franchise cornerstone rolled the 15-20% decline bucket, they silently hit FA with no retry. Added §0c pass alongside the team option exercise: bundled summer negotiation with basePct 0.90 floor (0.95 for MVP/All-NBA in last 3 yrs, 0.97 for LOYAL), distinct seed from mid-season so unlucky rolls don't cascade. Also patched the `teamOptionExercisedIds` branch to compute `hasBirdRights`/`superMaxEligible` (previously stale until next rollover). Case study: Victor Wembanyama signed with LAC on Jul 6 2027 after 4-year MVP/All-NBA Spurs run — SA's mid-season ext fired Oct 2026, rolled decline, never retried.

## MULTI-SEASON EXTERNAL LEAGUES — Critical

- **External-league contracts never expire** (`seasonRollover.ts:173-178`) — The `EXTERNAL_LEAGUES.includes(status)` guard short-circuits the player branch with only `{...p, age+1}`, skipping contract expiry entirely. A 1-year Barcelona deal signed Oct 2025 (`contract.exp=2026`) stays current forever because rollover never runs expiry on external players. Evidence: player bio shows "2025–26 FC Barcelona" still active in 2030. Fix: in that branch, if `status` is external AND `contract.exp <= currentYear`, flip to `tid:-1, status:'Free Agent', twoWay:undefined` so `routeUnsignedPlayers` on Oct 1 re-signs them. Router already weights by OVR, so good Euroleague guys tend to re-land in Euroleague — no extra home-country bias needed for the unstick fix. Follow-up: EXTERNAL_ROSTERS.md "90% stay in same league" bias is a separate enhancement.

---

## BUGS — Cosmetic

- **Statistical feats overwrite team records** — When a sim feat fires it should *merge* with the gist team history, not overwrite the existing high value.✅

---

## KNOWLEDGE GAPS — Lottery System (don't fix yet)

These are known limitations introduced alongside the `src/lib/lotteryPresets.ts` single-source-of-truth refactor. Documented here so future work has context.

### ~~DraftLotteryView always renders 14 teams regardless of preset~~ ✅ FIXED
`activeTeams` now slices to `Math.min(14, activePreset.chances.length)` so nba1966 shows 2 balls, nba1985/1987/1990 show 7–11, etc. `activePreset` added to useMemo deps.

### ~~autoRunLottery slices to 14 regardless of preset~~ ✅ FIXED
`autoResolvers.ts:autoRunLottery` now uses `Math.min(14, preset.chances.length)` matching the view fix.

### ~~Subtitle and column header hardcoded to "NBA 2019 Rules · Top 4 picks drawn"~~ ✅ FIXED
Both now use `activePreset.label` and `activePreset.numToPick` dynamically.

### ~~oddsTop4 naive multiplication~~ ✅ FIXED
Replaced with `computeTopKOdds()` in `src/lib/lotteryPresets.ts` — exact Plackett-Luce recursive formula, memoised on (available-set, k). nba2019 worst team now correctly shows ~52% top-4 odds instead of inflated 56%.

### DraftPicks.tsx picks have no lottery-odds context
`src/components/central/view/TeamOffice/pages/DraftPicks.tsx` shows pick inventory (round + season) but has no awareness of what lottery system is in use. A 1st-round pick under nba1966 (coin flip) has very different implied value than under nba2019 (smoothed odds). No pick-value estimate is shown anywhere.

---

## FEATURES — Backlog (low priority)

### Draft Scouting sidebar — mock-team projections + POT-weighted comparisons
DraftScouting tab in Team Office already has 70/30 value/fit scoring. Remaining for **DraftScoutingView**:
1. Show which team is projected at each slot (mock draft).
2. Weight POT for young players in player comparisons, not just current OVR.

### External-league roster repopulation at rollover
Nothing currently calls `generateProspect(..., 'Europe' | 'NBL' | 'G-League' | 'Endesa' | 'B-League')` at rollover to refill external-league rosters as players age out. Without this, Euroleague/NBL/etc. rosters shrink over long sims.

### Hall of Fame — tiered eligibility wait
Currently everyone waits the same 3 seasons regardless of first-ballot vs regular. Diff it: first-ballot = 1 year, regular = 3, borderline = 5.

### Dead money / ghost contracts (Luol Deng rule)
Waived-player stretch across multiple years.


### Rose Rule Not triggering
Signing
Player Opt.
Jun 30, 2026
Victor Wembanyama re-signs with San Antonio Spurs before free agency: $129M/4yr (player option)

Victor WembanyamaSan Antonio Spurs
Signing
Team Opt.
Jun 29, 2026
San Antonio Spurs has exercised their team option on Victor Wembanyama.

Victor WembanyamaSan Antonio Spurs

Trophy Case
All-Star
2026-27
D
Defensive Player of the Year
2026-27
All-NBA First Team
2026-27
D
All-Defensive First Team
2026-27
All-Star
2025-26
D
Defensive Player of the Year
2025-26
All-NBA First Team
2025-26
D
All-Defensive First Team
2025-26
League Blocks Leader
2024-25
All-Star
2024-25
Rookie of the Year
2023-24
All-Rookie Team
2023-24
D
First Team All-Defensive
2023-24
League Blocks Leader
2023-24
Career Summary
Defensive Player of the Year
2X
2025-26–27



CRITICAL BUG! 
playoff view box score of subsecqunt seasons from playoff view takes the box score of the first sim and not the playogf box score of that season. that means playoff boox score dont have year id?
---

## SEPARATE DEVELOPMENTS

| Project | Account |
|---------|---------|
| Draft Lottery / Draft | princealjohnmogatas@gmail.com |
| Coaching | lemakicatta@gmail.com |
| GrubHub | mogatas.princealjohn.05082003@gmail.com |
| FranchiseHub | lemakicatta@gmail.com |
| Restaurants gist | https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbarestaurantsdata |
| Hall of Fame UI | princealjohnmogatas@gmail.com |
| Team Office | mogatas.princealjohn.05082003@gmail.com |

---

## History

Session-by-session fixed lists now live in [`NEW_FEATURES.md`](./NEW_FEATURES.md) and [`CHANGELOG.md`](./CHANGELOG.md). Read those before assuming an item is still open.