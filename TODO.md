# NBA Commish — TODO (updated 2026-04-12)

---

## FIXED ✅

- **Lightning strikes: WNBA players affected** — WNBA excluded from `eligiblePool` in `seasonalBreakouts.ts`; pool now 70 (all leagues except WNBA).
- **Lightning strikes: only 3-6 attrs boosted** — Now boosts ALL 14 BOOST_ATTRS (hgt excluded) matching BBGM; pct range [0.05, 0.95] to match +1 → +22 spread; maxBoostForAge table recalibrated.
- **Lightning strikes: same players across saves** — `saveSeed` (from `state.saveId`) injected into `weightedPickN` baseSeed; each save gets unique lottery.
- **Father Time: only subset of attrs declined** — `numDecliningAttrs` limiter removed; all 14 attrs in DECLINE_TABLE now decline every year (matches BBGM). DECLINE_TABLE shooting/skill maxes raised to 5 (was 3) based on Sabonis age-30 data.
- **DraftSimulatorView crash** — `leagueYear` before initialization. Fixed.
- **WNBA/external players leaking to FA pool** — `seasonRollover.ts` external status guard + `tid >= 100` belt-and-suspenders.
- **PlayerStatsView players disappear after contract expires** — stats-based team filter.
- **BUG 2: Playoff cascade / TBD sidebar** — PlayoffAdvancer rewritten with MATCHUP_PAIRS per-feeder scheduling.
- **BUG 4: Pre-Aug14 lazy sim wipes schedule** — defensive guard in lazySimRunner.
- **BUG 5: Oct 21 first game** — `isScheduleRevealed` fixed to day >= 24.
- **Intl preseason box score crash** — resolveTeam() with nonNBATeams fallback in NBACentral + PlayerBioView.
- **Trade Machine rebounds NaN** — fallback to last season with gp > 0.
- **NBA Playoffs logo timeout** — onError fallback in DayView.tsx.
- **"Watch Draft" button text** — changed from "Open Draft Board".
- **Awards not in PlayerBioView** — All-NBA, All-Star, NBA Champion, All-Defensive, All-Rookie all flow to player.awards now.
- **Watch Game from NBA Central** — pre-sim + ADVANCE_DAY before opening viewer; Leave Game = pure close.
- **DNP spoiler** — coach decisions hidden pre-sim; only injuries shown until game completes.
- **Player portrait fallback** — BBGM → NBA HD CDN → initials chain in PlayerPortrait.tsx.
- **All player progression same trajectory (CRITICAL)** — per-player careerOffset (-2 to +2 annual) in ProgressionEngine; stable deterministic internalIds in bbgmParser + rosterService.
- **Young players flat all season (Cooper Flagg stuck at 80 OVR)** — `calcBaseChange` bases too low for young ages. Rebalanced: age≤18→6, age≤20→5, age≤21→4, age≤22→3, age≤25→2, age≤27→1. Bust still possible at all ages via Gaussian(-4) + careerOffset(-2).
- **K2 OVR chart mismatch (header 86, chart 81)** — `weeklyData` in PlayerBioView + PlayerRatingsModal was using bare `0.88*ovr+31` formula, missing hgt/tp bonuses. Fixed to use `convertTo2KRating(ovr, hgt, tp)` matching the header display.
- **MiddleClassBoosts redesign** — Old logic was random single-attr. Rebuilt: 40 buff picks weighted by current attr value (`pow(v/99, 2.0)`, attrs < 25 excluded — fixes Zubac TP bug), 40 nerf picks split between physical decay (−1 to physMax) and skill wobble (50% −1/−4, 35% zero, 15% +1). WNBA excluded. saveSeed injected for cross-save uniqueness.
- **Lightning strikes: gradual mode** — 50% of strikes are now gradual (trickle-in from strikeDate → graduationDate, forced complete on graduation day). Tracked via `isGradual`, `graduationDate`, `applied` dict on `PendingLightningBoost`.
- **Breakout season: injured players included** — `applySeasonalBreakouts` now skips players with `injury?.gamesRemaining > 0`.
- **OVR/POT K2 floor stuck at 66** — `calculateOverallFromRating` floored at `Math.max(40,...)`, and `convertTo2KRating(40) = 66`. Lowered floor to `Math.max(25,...)` so washed/weak players can display K2 OVRs down to ~53 instead of always 66. Duplicate players (G-League dedup): already handled in `initialization.ts:65-68` via name-match filter. Player BioView mobile tables: `overflow-x-auto + min-w-max` already present on both table wrappers.
- **Player Bios mobile list** — Replaced mobile-only card view with unified scrollable table (sticky player name column, minWidth 900px). All columns now reachable on mobile.
- **Player resigning visible in TransactionsView** — Extensions + FA signings now write to `state.history` with type `'Signing'` in simulationHandler.ts.
- **Trade initiation gating** — `generateAIDayTradeProposals` now computes conference rank + GB for each team and passes to `getTradeOutlook`. Youth-franchise check (star ≤ 25, OVR ≥ 65 BBGM, outside playoffs) blocks those teams from initiating as buyers.
- **PLAYIN_END hardcoded** — Now dynamic: `` `${year}-04-20` `` using `state.leagueStats.year` in PlayoffView.tsx.
- **FGM/3PM/FTM don't sum to final score** — Fixed in two places: (1) `reconcileToScore` in engine.ts now has a second pass that adjusts FGM (2-pt) if FTM-based pass can't fully close the gap; (2) `teamStats` in useLiveGame.ts now uses `finalResult` stats directly when game ends, guaranteeing pts = finalScore and consistent FGM/FTM.
- **Extension amounts all at minimum ($2M)** — Root cause: `player.overallRating` was `undefined` for most players (defaulting to 60 → $2M minimum). Fixed: `estimateMarketValueUSD` now falls back to `ratings[last].ovr`. Same fix applied to `playerValue` and `isBuildingAroundYouth` in AITradeHandler.

---

## REMAINING — DO BEFORE MULTISEASON

> **Context:** Cleaning up single-season sim before multiseason launch. Focus on stability + correctness, not new features.

*(All pre-multiseason items resolved — see FIXED above.)*

---

### SEPARATE DEVELOPMENTS

### DRAFT LOTTERY/DRAFT-->princealjohnmogatas@gmial.com
### COACHING-->lemakicatta@gmail.com
### GRUBHUB--> mogatas.princealjohn.05082003@gmail.com
### FRANCHISEHUB-lemakicatta@gmail.com
### restaurants gist-->https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbarestaurantsdata

*Last updated: 2026-04-14*
