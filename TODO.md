# NBA Commish — TODO (updated 2026-04-18, session 25)

---

## Next-session chores

### Connect draft-class generator (`genplayersconstants.ts` + `services/genDraftPlayers.ts` + `data/bioData.ts`) for infinite-sim

Three blockers before these compile:

1. **Missing npm deps** — `npm install d3-random @types/d3-random facesjs` (the generator uses `randomNormal` for noise + facesjs for headshots).
2. **Missing `./sportData` module** — `genplayersconstants.ts` line 1 imports `defaultCountries, defaultColleges`. Needs a small data module with those frequency maps (can be cribbed from BBGM's `names.json` or hand-rolled).
3. **Leftover sandbox tail** already stripped from `genDraftPlayers.ts` (was a React App component using `facesjs/react` + `./lib/generator`). Core `generateDraftClass` / `generateProspect` / `generatePlayer` exports are intact.
4. **Wire-in point**: in `services/logic/seasonRollover.ts`, after draft-lottery creation, call `generateDraftClass(nextDraftYear, 60, seededRng, nameData, 'College')` to synthesize the next class (instead of relying on finite BBGM import). Store in state as draft prospects (`tid = -2`, `status = 'Draft Prospect'`).
5. Also extend with `generateProspect(..., 'Europe' | 'NBL' | 'G-League' | 'Endesa' | 'B-League')` to repopulate external-league rosters each rollover once existing players age out.


- **Trade contract salaries roll over too late — CONFIRMED BUG.** Contract amounts flip to the new season's number only at preseason / regular-season tip-off, not at June 30. Real NBA: July 1 = new league year, all trades after that use the new salary. Our `shouldFireRollover` fires on June 30, so the date gate is right, but `syncedContractAmount` either (a) isn't applied uniformly to every active-contract player, or (b) the trade handler reads `player.contract.amount` before rollover state has persisted. Example: Capela/Randle trade on July 19, 2025 used 2024-25 numbers ($27.6M / $22.3M) instead of 2025-26 ($28.9M / $6.7M). Fix next session — either force the contract-sync write-through into the rollover patch before any July trade can execute, or pull salary from `contractYears[{season}]` in the trade handler instead of `contract.amount`.

---

## ACTIVE — Verify on New Save

- **Retirements** — legendMult applied to ALL tiers + user All-Star clamps. Verify LeBron/Curry survive past 2026.
- **Two-way contracts** — twoWay flag transferred, maxTwoWay=3, OVR cap=52. Verify 15+3 rosters.
- **Rookie team options** — teamOptionExp fixed (was off-by-1). Verify no instant decline after draft.
- **Player option chronology** — options Jun 29, FA Jun 30+. Verify correct order in TransactionsView.
- **Draft pick trading** — completed picks filtered. Verify no past-draft picks tradeable.
- **Playoff game log** — per-game opening night. Verify no PLF as PRE.
- **Image caching** — IndexedDB auto-download, default ON. Verify cache works.
- **External league economy** — contracts generated at routing. Verify salary in PlayerBio.
- **Exhibition stale scores** — pruned at rollover. Verify clean All-Star Weekend in season 2.
- **MLE tracking** — `mleSignedVia` now saved on player. Verify TeamFinancesView can color cells.
- **COY coach name** — staff lookup fix (agent). Verify real coach name shows.
- **Dashboard salary cap** — reads live `leagueStats.salaryCap`. Verify updates after rollover.
- **League History best records** — reads from `team.seasons[]`. Verify sim seasons show.
- **News card photos** — player portraits on news cards. Verify photos render.
- **PlayerStatsView historical** — shows all players + ring/All-Star badges.
- **G-League K2 guard** — K2 >= 78 never sent down. Verify no PG-tier stars in G-League.
- **Game log DNPs** — season-start injured players show DNP rows (joinedMidSeason guard). Verify.
- **StarterService top-5-by-OVR** — starters picked by OVR first, then position-fit. Verify Tatum starts over Pritchard.
- **Trade engine unified** — `tradeFinderEngine.ts` powers both TradeFinder UI + AI trades. Verify AI trade quality matches UI.
- **GM Mode Phase 1+2** — mode picker, sidebar gating, trade lock to user team, AI accept/reject, deadline+FA gating. Verify gating works end-to-end.
- **Draft Scouting tab (Team Office)** — advisor big board 70% value + 30% fit, pick inventory with range projections. Verify mock aligns with lottery results.

---

## BUGS — Remaining

### Nepotism / family ties system
Brothers on same team (Antetokounmpo, Ball, Holiday, etc.) should: (1) never appear on trading block together, (2) get morale boost from playing with family. Use `rosterService` relatives data to detect family ties. Thanasis/Alex shouldn't be trade block candidates if Giannis is untouchable — they're package deals. Wire into `isOnTradingBlock()` + `computeMoodScore()`.

### Draft Scouting sidebar: projected team per pick slot + player comparisons use POT not just OVR
DraftScouting tab in Team Office already has 70/30 value/fit scoring (session 24). Remaining: main sidebar DraftScoutingView should (1) show which team is projected at each slot (mock draft), (2) weight POT for young players in player comparisons, not just current OVR. Wire the same 70/30 engine into the sidebar view.

### GM MODE FOLOW UP — remaining
Partially done in session 25: `EconomyTab` now has Transaction Calendar (trade deadline month/ordinal/day-of-week, FA start, moratorium, year-round FA toggle, post-deadline multi-year toggle). `dateUtils` added `getTradeDeadlineDate` / `isInFreeAgencyWindow` / `canSignMultiYear`. `NavigationMenu` now shows FA tab year-round in regular season when enabled. `TradeSummaryModal` + `simulationHandler` use dynamic deadline.
**Still remaining:** (1) hard-block trade submit in TradeMachineModal past deadline (not just banner), (2) wire `canSignMultiYear()` into SigningModal once user finishes it, (3) "next phase opens X" banner where tabs disappear in GM mode.

<!-- ALL-STAR host + history + date refactor — DONE in session 25 (see FIXED). -->

### Finals MVP formula — DONE (session 25 fix)
Was picking the single-highest-`gameScore` game across ALL playoff rounds → Chet's one outlier beat Shai's full-Finals dominance. Now: aggregates Finals-only (round 4 via `finalsSeries.gameIds`), averages pts+reb+ast+stl+blk−tov, adds TS% delta vs league avg (×8), min-3-GP eligibility, minutes load bonus, avgPts tiebreaker. Files: `lazySimRunner.ts` lines ~509-600.

### Inflation editor in Game Settings modal
Add Min/Max/Avg/StdDev % inputs to `SettingsModal.tsx`. Values already in leagueStats.

### Start Date timeline: reverted to 1 season, manual date for multi-season


<!-- LeagueHistoryView Best Records 0-0 bug — fixed session 25 (see FIXED below). -->
---

## FEATURES — Next Priority



### SEMIFINALS MVP!!!
we can now fetch mvp on finals. wwhy not also do semifinalsmvp visible in awards section..iti s already visible as well in wards like 
Semifinals MVP
2021-22.. i nstephecnurry trophy case anyways.. so add semifinalsmvp.. it is begin read anyways alread yby legague history view deatailed so why not?

### GM Mode (see `GM_MODE_README.md`)
Phase 1: mode toggle + sidebar gating + player action filtering + settings toggle
Phase 2: trade system (lock to user team, AI accept/reject)
Phase 3: FA signing modal (contract builder, value meter, cap display)
Phase 3.5: Draft — "Sim One Pick" + "Sim to My Pick" buttons

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

## FIXED — Session 25 (2026-04-18)

- **Transaction Calendar (commissioner-editable)** — `EconomyTab` section with trade deadline month/ordinal/day-of-week dropdowns, FA start month+day, moratorium slider, year-round regular-season FA toggle, post-deadline multi-year deals toggle. Live-preview resolved dates. `LeagueStats` fields added.
- **Day-of-week resolvers unified** — `dateUtils.ts` gained `getTradeDeadlineDate`, `getFreeAgencyStartDate`, `getFreeAgencyMoratoriumEndDate`, `isPastTradeDeadline`, `isInFreeAgencyWindow`, `isInMoratorium`, `isRegularSeasonSigningOpen`, `canSignMultiYear`. All use existing `resolveSeasonDate()`.
- **Sidebar trade + FA gating** — `NavigationMenu` uses dynamic deadline (not hardcoded Feb 6). FA tab now year-round in regular season when `regularSeasonFAEnabled` instead of the 3-month-only window.
- **TradeSummaryModal + simulationHandler** — both switched to dynamic `getTradeDeadlineDate()`; banner text resolves from stats.
- **All-Star Weekend dates (day-of-week refactor)** — `getAllStarSunday` now uses `resolveSeasonDate(y, 2, 3, 'Sun', 0)`. Friday/Saturday/breakStart/breakEnd offset from Sunday → always real weekdays. Announcement dates (starters/reserves/celebrity/rising stars/dunk/3PT) anchored as weekly offsets. Voting window uses `resolveSeasonDate` for start.
- **All-Star hosts data model** — `LeagueStats.allStarHosts` added, seeded with 2026 Inglewood/Intuit Dome + 2027 Phoenix/Mortgage Matchup Center.
- **All-Star host picker modal** — `AllStarHostPickerModal` in `src/components/seasonal/`. ModalShell + bucket UI (Current Season / Future Seasons). Click year → team grid editor. City+arena autofill from `arenaData.ts` when a team is picked. Advances the day on save via `UPDATE_STATE` + `ADVANCE_DAY` with `outcomeText`. GM mode card hidden — auto-resolver fills in.
- **All-Star host auto-resolver** — `services/allStar/hostAutoResolver.ts`. Deterministic (seeded by league year), 10-season team cooldown, pulls city+arena from `arenaData`. Runs in `lazySimRunner` after each rollover with `horizon: 1` so current + next year are always booked.
- **Shared `TeamPickerGrid`** — `components/shared/TeamPickerGrid.tsx`. Search + single/multi select + accent colors. Ready for InvitePerformance and future modals to adopt.
- **All-Star history view** — new `AllStarHistoryView.tsx` + `allStarHistoryFetcher.ts` (fetches gist 1951→today). Merge rule: `hasPlayed(year)` suppresses gist winner/MVP/score for unplayed years so 2026 in your save shows UPCOMING with Inglewood host but no winner until sim runs past Feb 15. History toggle button in `AllStarView` top-right.
- **All-Star portrait fix** — `AllStarRoster.tsx` (4 locations) + `AllStarVotes.tsx` switched from NBA CDN to `getPlayerImage(player)` (BBGM/ProBallers first, CDN only as onError fallback).
- **Finals MVP formula** — aggregates Finals-only (`finalsSeries.gameIds`), avg pts/reb/ast/stl/blk − tov, TS% above league avg ×8, min-3-GP eligibility, minutes-load bonus, avgPts tiebreaker. Was picking single-highest-`gameScore` across ALL playoff rounds which let Chet's outlier beat Shai's full-Finals dominance.
- **LeagueHistoryView best records 0-0 (sim seasons)** — BBGM import pre-seeds a current-year `seasons[]` entry with `won: 0, lost: 0`. Old rollover's `alreadyArchived` check kept that stale entry and **discarded** the real sim W-L. Fix: rollover now *overwrites* the pre-seeded entry (spreading `existingRecord` first to preserve `imgURLSmall` etc), emits both `{wins,losses}` AND `{won,lost}` schemas, and preserves any `playoffRoundsWon` the lazy-sim bracket hook already stamped. Also defensively normalized champ/runner-up record renderers in `LeagueHistoryDetailView` (`ts.won ?? ts.wins`). Files: `seasonRollover.ts` ~401, `LeagueHistoryDetailView.tsx` ~653/704.

## FIXED — Session 24 (2026-04-18)

- **DraftScouting tab in Team Office** — advisor big board (70% value + 30% fit), pick inventory with range projections, team mode awareness (`DraftScouting.tsx`, `TeamOfficeView.tsx`)
- **TradingBlock hooks crash** — early return before useMemo caused React hooks error
- **Game log DNP for season-start injured** — `joinedMidSeason` guard lets pre-injured players show DNP rows (`PlayerBioGameLogTab.tsx`)
- **G-League K2 >= 78 guard** — no more Paul George / star tier assignments to G-League (`simulationHandler.ts`)
- **External salary scale** — Euroleague capped $5M (was $16M)
- **Currency display** — EUR/JPY/PHP/CNY/AUD in transactions + `PlayerBioContractTab`
- **PlayerBioContractTab** — external team names + league column from `player.status`
- **PlayerStatsView badges** — ring 💍 + All-Star ⭐ icons (was "RING"/"AS" text)
- **GM mode UI hide** — edit ratings button hidden, heal player hidden in GM mode
- **DraftScouting prospect card** — `pos | age` format matches trade hub style

## FIXED — Session 23 (30+ items)

- **Retirement legendMult** applied to ALL OVR tiers + user All-Star clamps
- **Two-way contracts (3 bugs)** — twoWay flag transfer, maxTwoWay 2→3, OVR cap 45→52
- **Rookie team option off-by-1** — `teamOptionExp = season + baseYrs` (was -1)
- **Player option chronology** — options Jun 29, FA Jun 30+ (`getSeasonYear` boundary moved)
- **Draft pick trade filter** — `minTradableSeason` filter in TradeFinderView, TradeMachineModal, findOffers AI
- **Playoff game log PRE fix** — `isPreseason` computes per-game's own season
- **G-League "overseas" label** — checks `r.league === 'G-League'` for domestic
- **Exhibition stale scores** — pruned at rollover (negative team IDs), AllStarDayView hardcoded fallbacks removed
- **Dead PlayoffView chevron** — unused confFilter/eastStandings/westStandings removed
- **External league economy** — contracts generated via `externalSigningRouter.ts` + `EXTERNAL_SALARY_SCALE`
- **Image caching** — `imageCache.ts` IndexedDB blob cache, Settings toggle (default ON)
- **StarterService top-5-by-OVR** — lineup picks by OVR first, then position fit (fixed Tatum-benched bug)
- **Game log DNP for season-start injured** — shipped here (refined further in session 24)
- **K2 >= 78 G-League guard** — shipped here (refined in session 24)
- **CRITICAL: Injured players G-League tid mutation** — resolved via DNP guard + K2 guard; `tid` no longer mutated, `gLeagueAssigned` flag used instead
- **Unified trade engine** — `tradeFinderEngine.ts` powers TradeFinder UI + AITradeHandler; `isUntouchable()` / `isOnTradingBlock()` centralized (loyalty 10yr, contending K2 82+, rebuilding young+pot); durability from real injury history
- **GM Mode Phase 1+2** — mode picker at startup, sidebar/action gating, trade lock to user team, AI accept/reject with TV evaluation, trade deadline + FA period gating, settings toggle
- **FA bidding engine**, **PlayerSelectorGrid** shared component, **TeamIntel real trade value**, **TradingBlock editable lists**, **team injuries tab in NBA Central**, **SigningModal placeholder**
- **MLE tracking** (`mleSignedVia`), **COY coach name**, **Dashboard salary cap live**, **League History records from `team.seasons[]`**, **news card photos**, **PlayerStats historical**, **mobile pagination**, **All-Star box score clickable**

## FIXED — Session 22 (70+ items)

Age system rewrite (born.year), retirement BBGM thresholds, player/team options nextYear, unified sim engine (runLazySim), MLE 3-pass, draft picks in TransactionsView, year chevrons, playoff bracket, rollover W-L reset, and 50+ more.

**Full history:** See `CHANGELOG.md` and `README_OLD.md`

*Last updated: 2026-04-18 (session 24)*
