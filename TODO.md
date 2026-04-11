# NBA Commish — TODO (updated 2026-04-13)

---

## FIXED ✅

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
- **Player Bios mobile list** — Replaced mobile-only card view with unified scrollable table (sticky player name column, minWidth 900px). All columns now reachable on mobile.
- **Player resigning visible in TransactionsView** — Extensions + FA signings now write to `state.history` with type `'Signing'` in simulationHandler.ts.
- **Trade initiation gating** — `generateAIDayTradeProposals` now computes conference rank + GB for each team and passes to `getTradeOutlook`. Youth-franchise check (star ≤ 25, OVR ≥ 65 BBGM, outside playoffs) blocks those teams from initiating as buyers.
- **PLAYIN_END hardcoded** — Now dynamic: `` `${year}-04-20` `` using `state.leagueStats.year` in PlayoffView.tsx.
- **FGM/3PM/FTM don't sum to final score** — Fixed in two places: (1) `reconcileToScore` in engine.ts now has a second pass that adjusts FGM (2-pt) if FTM-based pass can't fully close the gap; (2) `teamStats` in useLiveGame.ts now uses `finalResult` stats directly when game ends, guaranteeing pts = finalScore and consistent FGM/FTM.
- **Extension amounts all at minimum ($2M)** — Root cause: `player.overallRating` was `undefined` for most players (defaulting to 60 → $2M minimum). Fixed: `estimateMarketValueUSD` now falls back to `ratings[last].ovr`. Same fix applied to `playerValue` and `isBuildingAroundYouth` in AITradeHandler.

---

## REMAINING — DO BEFORE MULTISEASON

### HIGH PRIORITY

- **Player BioView mobile tables** — Historical Data + Game Log tables inside PlayerBioView detail view (when viewing a specific player): confirm both now scroll horizontally on mobile with min-w-max fix.

### LOWER PRIORITY

- **Duplicate players (NBA + G-League same person)** — NBA player + G-League/overseas counterpart appearing as two separate rows in PlayerBiosView (e.g. "LJ Cryer" GSW + "L.J. Cryer" G-League, "Nick Smith Jr." + "Nick Smith", "TyTy Washington Jr." + "TyTy Washington"). NBA entry should absorb/supersede the G-League entry so only one row shows. Need dedup logic in enriched/filtered pass.

- **POT floor too high for aged/washed players** — POT is floored at 66 universally. Should go lower for old/washed players (age ≥ 29–30) and very old historical leagues, matching OVR decay. The floor should track OVR downward for players past their prime, not hold at 66.
- **Watch Game Live header button** — confirm the "Watch Game Live" button at NBA Central header works with new pre-sim flow.

---

### SEPARATE DEVELOPMENTS

### DRAFT LOTTERY/DRAFT-->princealjohnmogatas@gmial.com
### COACHING-->lemakicatta@gmail.com
### GRUBHUB--> mogatas.princealjohn.05082003@gmail.com
### FRANCHISEHUB-lemakicatta@gmail.com
### restaurants gist-->https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbarestaurantsdata

*Last updated: 2026-04-13*
