# NBA Commish — TODO (updated 2026-04-17, session 22)

---

## ACTIVE — Verify on Next Playthrough

- **TeamFinancesView timeline rollover** — likely auto-resolved by session 21. Verify columns shift.
- **ContractYears history preservation** — fixed session 22. Verify on NEW save.
- **July games after rollover** — batch=1 near Jun 30 + yearAdvanced safeSchedule guard added. Verify no ghost games.
- **Retirements in season 2+** — code is wired (`retirementChecker` called at rollover). Verify players actually retire.

---

## BUGS — Season 2+ Rollover Issues

### G-League trade grace period ✅ FIXED
`yearsWithTeam === 0 && teamGP < 14` guard prevents immediate assign/recall loop for traded players.

### ~~Standings stale W-L after rollover~~ ✅ FIXED
StandingsView now derives ALL data from box scores (not team.wins/losses), filtered by season year (Oct 24 → Apr 20 date range). Year chevron added to browse historical seasons. Playoff box scores excluded via date range + isPlayoff flag.

### ~~Two-way contract distribution~~ ✅ FIXED
Two-way pool now capped at raw OVR ≤ 45 (K2 ~70) — established players (Ben Simmons, Terry Rozier) no longer eligible. Double team name ("Indiana Indiana Pacers") also fixed.

### Roster trimming (season 2+)
Verify `autoTrimOversizedRosters` fires in preseason (21 limit) and regular season (15 limit) for season 2+.

### ~~Historical playoff bracket~~ ✅ FIXED
Ugly 4-column grid deleted. BracketLayout used for ALL views (live, historical sim, no-playoffs empty).

### ~~Power Rankings View rollover~~ ✅ FIXED
In-season columns (Last Wk, ▲▼, Streak, Diff, Last 10) hidden when `seasonNotStarted`. Shows preseason-only view with rank + team + Pre-S rank + Avg Age.

### CRITICAL: No players retiring across multiple seasons
**Symptom:** 43-year-old LeBron, 42-year-old Al Horford (91% retire probability shown in UI), 42-year-old Kyle Lowry — ALL still active FAs after 3 seasons. Nobody retires despite high probability.
**Root cause candidates:**
1. Save isolation bug — `saveSeed` may be identical across saves, causing the seeded random in `retirementChecker.ts` to always roll the same "survive" result
2. Retirement check may run but the result isn't persisted — check if `runRetirementChecks` returns retirees but they're not applied to state
3. The age used in retirement calc may be stale (hardcoded 2026 instead of current year)
**Debug:** Add `console.log` in `retirementChecker.ts` to print retire roll for each 35+ player at rollover. Check `state.retirementAnnouncements` after rollover.
**Files:** `retirementChecker.ts`, `seasonRollover.ts` (retirement block), `initialState.ts` (saveId uniqueness)


### Statistical feats: store career highs for PlayerBioView
**What:** Track `player.careerHighs: { pts, reb, ast, stl, blk, gameId }` — updated after each game if a new career high is set. Display in PlayerBioView overview tab. Connect with `boxScoreHistory` from game settings for pruning.
**Files:** `postProcessor.ts` (update career highs), `PlayerBioOverviewTab.tsx` (display)

### bioCache.ts age uses hardcoded date instead of game state
**Symptom:** `bioCache.ts:116` has `SIM_DATE = new Date("2026-01-08")` — age calc uses real-world hardcoded date instead of `state.leagueStats.year`. After season 2+, player ages in hero bio are wrong.
**Fix:** Pass `leagueStats.year` into bioCache age calc. Use `simYear - born.year` instead of `new Date("2026-01-08").getFullYear() - born.year`.
**Files:** `bioCache.ts` (line 116-121), `PlayerBioView.tsx` (passes age context)

### 2026 draft class players disappearing from Draft History / becoming FAs
**Symptom:** Some 2026 draft picks (picks #2, #6, #10, #12, #13, #20, #21 missing) don't show in Draft History. Others from the 2026 class become free agents the next year — their rookie contracts may be 1-year instead of the configured length from Economy tab.
**Fix:** (1) Draft History should show ALL drafted players regardless of current FA status. (2) Check `finalizeDraft()` rookie contract length — may not be reading `leagueStats.rookieContractLength` correctly for all picks.
**Files:** `DraftHistoryView.tsx` (show FAs too), `DraftSimulatorView.tsx` (finalizeDraft contract length), `autoResolvers.ts` (autoRunDraft contract length)

### Draft picks visible in TransactionsView
**What:** Draft picks should appear as transactions: "The [Team] selects [Player] as the Xth overall pick of the 20XX NBA Draft." Add `'Draft'` as a transaction type with its own icon/style in TransactionsView. Write to `state.history` from both `finalizeDraft()` and `autoRunDraft()`.
**Files:** `DraftSimulatorView.tsx` (finalizeDraft history), `autoResolvers.ts` (autoRunDraft history), `TransactionsView.tsx` (add Draft type style + filter option)

### Rookie contract length/salary not matching Economy tab settings
**Symptom:** Some rookies get 1-year contracts instead of the configured 2+2 (2 guaranteed + 2 team option) from Economy tab. Salary amounts may also vary unexpectedly.
**Fix:** Verify `finalizeDraft()` and `autoRunDraft()` both read `leagueStats.rookieContractLength`, `rookieTeamOptionsEnabled`, `rookieTeamOptionYears` correctly.
**Files:** `DraftSimulatorView.tsx`, `autoResolvers.ts`

### COY award shows "SAS Coach" instead of real coach name
**Symptom:** League History detail view shows COY as "SAS Coach" instead of the actual coach name from staff data. AwardService already reads from staffService but the name isn't propagating to historicalAwards.
**Files:** `AwardService.ts` (COY name resolution), `LeagueHistoryDetailView.tsx` (display)

### CRITICAL: Save file isolation — progression leaks between saves
**Symptom:** All saves share the same progression outcomes because `saveId`/`saveSeed` isn't unique per save or gets reset on load. Player progressions (lightning strikes, Father Time, bust lottery) are seeded by `saveSeed` — if two saves have the same seed, identical players get identical outcomes.
**Fix:** Add `meta: { uniqueId, commissionerName }` to the save JSON root. Generate `uniqueId = crypto.randomUUID()` at game creation. Use `uniqueId` as the `saveSeed` for ALL seeded systems. On LOAD_GAME, verify `saveId` matches and DON'T share seeds across saves.
**Files:** `initialState.ts` (generate uniqueId), `GameContext.tsx` (LOAD_GAME — preserve uniqueId), all seeded systems already use `state.saveId`

---

## BUGS — UI

### ~~League Leaders View — season year chevron~~ ✅ FIXED
### ~~Statistical Feats View — season year chevron~~ ✅ FIXED

### External league players losing portraits after routing
NBA players routed to G-League/PBA lose ProBallers portrait. LOAD_GAME migration may strip imgURL on status change. **Fix:** Don't touch `imgURL` for players with ProBallers URLs regardless of status.

### ~~Game log shows playoff/play-in games as "Preseason" (PRE)~~ ✅ FIXED
Added `isPlayoff` / `isPlayIn` flag checks before `isPreseason`. Playoff games show "PLF" label with indigo tint, play-in shows "PI" with sky blue. Preseason games still show "PRE" with amber. Playoff divider header added.

### ~~Veteran players signing overseas instead of retiring~~ ✅ FIXED
Age gate added: players 36+ with K2 < 72 skip external routing, stay as unsigned FAs → retire at next rollover.

### G-League duplicate players (Nick Smith vs Nick Smith Jr.)
**Symptom:** G-League roster has "Nick Smith" (85 OVR) who is the same person as NBA "Nick Smith Jr." (75 OVR). Both appear in game.
**Fix:** In `externalRosterService.ts` G-League fetch, when deduplicating by name, treat "Jr." as optional — if NBA roster already has "Nick Smith Jr.", delete the G-League "Nick Smith" entry. Prefer NBA roster file over G-League for the same person.
**Files:** `externalRosterService.ts` (G-League fetch dedup), `initialization.ts` (name collision guard)

### ~~Career/3Y progression chart data lost at rollover~~ ✅ FIXED
Chart now merges `ratings[]` (BBGM historical) + `ovrHistory[]` (sim rollover snapshots) + current live OVR. No data loss across seasons. `ovrHistory` takes priority for overlapping seasons.

### Sim-to-date from DayView may not show progress overlay
**Status:** Fixed in session 22 — ALL `SIMULATE_TO_DATE` uses overlay mode now. If still seeing "Processing Executive Order", hard refresh (`Ctrl+Shift+R`) to clear stale bundle cache.

### News cards missing player photos
Transaction news (signings, player options) show blank image. Attach `imageUrl: player.imgURL` to news objects.

---

## FEATURES — Next Priority

### AI trade: contending teams protect K2 80+ players
Bump protection from K2 78 → 80. Sort tradeable players K2 ascending (worst first) when building packages.

### Dead money / ghost contracts (Luol Deng rule)
Waived players' remaining guaranteed salary counts against cap. `deadContracts[]` on team state. Gray dashed row in TeamFinancesView.

### ~~MLE remaining column in Cap Overview~~ ✅ FIXED
Shows MLE type (Room/NT/Tax) + remaining amount in cyan per team. Uses `getMLEAvailability()` from salaryUtils.

### BroadcastingView auto-inflation
Cap should grow automatically at rollover even if commissioner doesn't touch BroadcastingView.

### Image caching (Performance setting)
Cache player portraits in localStorage/IndexedDB. Default ON. `SettingsModal.tsx` Performance tab.

---

## FUTURE / BACKLOG

### Live Trade Debug UI (GM Dashboard)
- **Trading Block** — mood ≤ −3 players, toggleable `onTradingBlock` flag
- **Team Needs** — 30 teams × 5 positions heatmap
- **Untouchables** — `player.untouchable` flag; AI never proposes them

---

## SEPARATE DEVELOPMENTS (Accounts)

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

## FIXED ✅ (Session 22 — 30+ items)

- **§1 UNIFIED SIMULATION ENGINE** — `runLazySim` single engine for ALL multi-day advances
- **ADVANCE_DAY event date-match** — `>=` so events fire on exact day
- **Simulate-to-Date always overlay** — progress screen for all skips (batchSize 1 vs 7)
- **Season Preview** — Oct 1 trigger, rank-based tiers, double name fix, W-L→O/U only, nav date-gated
- **F2-F7** — signing cards clickable, training camp cut, FAME trait, G-League filters, Draft History View, Stats tab upgraded
- **AI contractYears sync** — all 3 signing paths + history preservation
- **ImageGen guard** — checks enableLLM
- **POT mismatch** — overallRating + born.year age
- **Minutes cap** — reg ~40-42, playoffs ~44-46 with jitter + isPlayoffs knob
- **G-League DNP** — reads GP from allSimResults + trade grace period
- **B-League signing** — fallback chain fix
- **COMPETITOR morale** — effectiveRecord for offseason
- **Draft R?P?** — defensive display fallback
- **PBA preseason** — per-team knobs (NBA vs intl)
- **Twitter avatar** — post feed fallback
- **Shams transactions** — buildShamsTransactionPost for signings/extensions
- **Social feed perf** — removed JSON.stringify cascade + SET_FEED dispatch
- **Team W-L reset** — rollover now zeros wins/losses + archives to team.seasons[]
- **Team streak reset** — prevents "rock bottom" news after rollover
- **July games guard** — batch=1 near Jun 30 + yearAdvanced safeSchedule
- **Award Races offseason** — "season hasn't started" screen
- **PlayoffView** — shows last year's historical bracket when no active playoffs
- **Progression dark colors** — ensureVisibleColor() luminance check
- **Career OVR snapshot** — ovrHistory[] at rollover, chart reads it
- **Player options date** — Jul 1 so they show in new season TransactionsView
- **Player option history** — seasonRollover writes playerOptionHistory + news

## FIXED ✅ (Sessions 8–21)

146+ items. See git history and session memory files.

*Last updated: 2026-04-17 (session 22)*
