## Run Locally

**Prerequisites:** Node.js, a Gemini API key

1. Install dependencies: `npm install`
2. Set `GEMINI_API_KEY` in `.env.local`
3. Run: `npm run dev`

---

## Simulate-to-Date Architecture (Session 22 Fix)

**"Simulate to Date" now routes through two paths:**

| Gap | Engine | UI | Status |
|-----|--------|----|--------|
| **> 30 days** | `runLazySim` (iterative, day-by-day batches) | Progress overlay (phase labels, %) | ✅ All events fire correctly |
| **≤ 30 days** | `processTurn` (single batch) | Game results modal | ✅ Calendar events fire via post-sim auto-resolver loop |

Long skips (> 30 days) now use the same reliable `runLazySim` engine as the LOAD_GAME jumpstart — it checks every calendar event trigger at every day boundary. Short skips show the familiar game results modal.

**Developer guidance:**
- Both paths use `runLazySim` — single source of truth for all multi-day simulation
- `runLazySim` handles season rollover (`applySeasonRollover`) when crossing Jun 30
- `processTurn` is now ONLY used for single-day `ADVANCE_DAY` actions
- To add a new calendar event: add it to `buildAutoResolveEvents()` in `lazySimRunner.ts` — it fires automatically at the right date boundary

---

## Player Portrait Priority

Portrait images across all views (PlayerBioHero, PlayerBiosView, PlayerPortrait component, TransactionsView, TradeMachineModal, etc.) follow a strict priority order:

1. **`player.imgURL`** (BBGM gist URL) — canonical source for NBA and all external league players. NBA players use ProBallers cutout photos via the alexnoob BBGM roster gist. External league players (PBA, Euroleague, B-League, G-League, etc.) use whatever imgURL the league's BBGM export provides — these are NOT ProBallers URLs and that is expected/correct.
2. **NBA CDN fallback** (`cdn.nba.com/headshots/...`) — only for NBA players who have no `imgURL` at all. External league players never fall back to the NBA CDN, since those passport-style headshots would show the wrong person.
3. **Initials avatar** — shown when both 1 and 2 fail.

**Important:** The `LOAD_GAME` migration in `GameContext.tsx` only clears `head-par-defaut` placeholders and NBA CDN URLs on external players. It must NOT clear other URLs just because they are not `proballers.com` — external league gist URLs are legitimate portraits from basketball-reference, ESPN, etc.

Key files:
- `src/components/central/view/bioCache.ts` — `getPlayerImage(player)` implements this priority; external statuses are skipped before the NBA CDN step.
- `src/components/shared/PlayerPortrait.tsx` — shared portrait component; `onError` goes straight to initials (no CDN retry).
- `src/components/central/view/PlayerBioHero.tsx` — hero portrait; `onError` hides the image (no CDN retry).

The NBA.com bio fetch (`fetchWithDedup`) only runs for NBA players and only updates `portraitSrc` if the player has **no** `imgURL` at all (line in `PlayerBioView.tsx`).

---

## NBA 2K Data Sources

Two gist-backed data files live in `src/data/` and are fetched once per session (cached in memory):

| File | Gist | Used by |
|------|------|---------|
| `NBA2kBadges.ts` | `aljohnpolyglot/e7b25218…` — player badge tiers (HOF/Gold/Silver/Bronze) | `badgeService.ts` → live game commentary, dunk contest sim |
| `NBA2kRatings.ts` | `aljohnpolyglot/10016f08…` — full NBA 2K26 attribute ratings per team/player | `Defense2KService.ts` (team defense weighting), `DunkContestModal.tsx` (dunk/vertical scores) |

`NBA2kBadges.ts` exports `loadBadges()` + `getBadgeProb(player, badge, baseProb)` — badge tier multiplies the base probability (HOF ×1.5, Gold ×1.2, Silver ×1.0, Bronze ×0.6, none → 0).

`NBA2kRatings.ts` exports `loadRatings()` + `getRawTeams()` — consumers call `await loadRatings()` then `getRawTeams()` and parse the attributes they need.

---

## 📓 Developer Diary (Notes)

**This README is a living document.** If you discover something surprising, fix a tricky bug, or notice something non-obvious about this codebase. Think of it as a dev diary — not just architecture docs.

### Discovered Bugs & Fixes Log

| Date | Issue | Fix |
|------|-------|-----|
markdown

| Mar 2026 | Sportsbook player props crashed — `team.players` undefined | `NBATeam` has no `players` array. Players live in `state.players` (top-level). Props tab now filters `state.players` by `tid` matching today's game teams. `team.players` will always be undefined — never try to read it. |
| Mar 2026 | Props used wrong player ID field (`pid`) | `NBAPlayer` uses `internalId`, not `pid`. All bet leg IDs, slip dedup logic, and `playerId` fields in `placeBet` now use `player.internalId`. |
| Mar 2026 | `getBestStat` was a naive `.find(season)` — wrong for mid-season | Mirrored `AwardService.getBestStat` exactly: filter `s.season === season && !s.playoffs`, then reduce to the entry with the highest `gp`. This handles players who appear multiple times in the stats array (e.g. after a trade mid-season). |
| Mar 2026 | `getTrb` was `s.trb ?? (s.orb + s.drb)` — crashed when both undefined | Use the full fallback chain: `s.trb ?? s.reb ?? ((s.orb ?? 0) + (s.drb ?? 0))`. Matches AwardService. Apply this same pattern anywhere you're reading rebounds off a raw stat object. |
| Mar 2026 | Sportsbook redesign — tabs, player props, parlay builder | `SportsbookView.tsx` rebuilt. Three tabs: **Today's Lines** (moneyline + O/U per game), **Player Props** (pts/reb/ast O/U for top 4 active players per team playing today), **My Bets** (history with P&L bar + win rate). Bet slip supports **Single / Parlay toggle** — parlay mode accumulates legs and shows combined decimal odds. Conflicting legs (same game moneyline, same player same stat) are auto-replaced. |
| Mar 2026 | Sportsbook odds were loose vig (implied 47.6% each side) | O/U props now use `-110` equivalent: `1 / (0.52 + 0.005) = 1.909` over, `1 / (0.48 + 0.005) = 2.062` under. Moneyline juice applied as `+0.05` added to each team's implied probability before converting to decimal. Real books run ~4.5–5.5% vig — this is in range. |
| Mar 2026 | Injured players appeared in Player Props | Props now filter `state.players` by `p.injury?.gamesRemaining === 0` (or falsy). No point showing a line for someone DNP. |
| Mar 2026 | Mood system added (Phase 1 — drama-only) | `src/utils/mood/` barrel: `moodScore.ts` (computeMoodScore), `moodTraits.ts` (genMoodTraits), `dramaProbability.ts`, `moodTypes.ts`. 7 traits: DIVA/LOYAL/MERCENARY/COMPETITOR (4 core, BBGM-inspired F/L/$/W) + VOLATILE/AMBASSADOR/DRAMA_MAGNET. `NBAPlayer.moodTraits?: MoodTrait[]` in `types.ts`. Backfill runs lazily in `gameLogic.ts` after `processSimulationResults`. `generatePlayerDisciplineStory` now does mood-weighted player selection + mood-based severity routing. Pass `state.date` and `state.endorsedPlayers` from `actionProcessor.ts`. |
| Mar 2026 | In-game fights added (FightGenerator.ts) | `src/services/FightGenerator.ts` — base 0.4% per game, boosted by VOLATILE/DRAMA_MAGNET traits and real-player propensity map. Returns `FightResult` attached to `GameResult.fight`. Story seed injected into `actionProcessor.ts` story loop so LLM narrates brawls. Both `GameResult` types updated (`src/types.ts` + `src/services/simulation/types.ts`). |
| Mar 2026 | LLM hallucinated "Christmas games upcoming" in February | Added `buildSeasonCalendarContext()` to simulation prompt + gated Christmas context to only appear pre-Dec 25 |
| Mar 2026 | Steve Ballmer email said personal gifts used league funds | System prompt now explicitly separates `personalWealth` vs `leagueFunds`; personalWealth cap reduced from $50M to $8M/day |
| Mar 2026 | Lazy sim stacked all paychecks for collection on next real day | Added `generatePaychecks` call per batch in `lazySimRunner.ts` with `lastPayDate` tracking |
| Mar 2026 | "Week in Review" showed single-game stats (not weekly) | Added `newsType: 'daily' | 'weekly'` to `NewsItem`; NewsFeed now has Daily/Period Recaps tabs; batch_recap template reworded |
| Mar 2026 | Club debuff applied as rating reduction (broken pipeline) | Moved debuff to `nightProfile.ts` as multiplier penalties; removed `R()` reduction from helpers |
| Mar 2026 | `ChevronDown is not defined` in TradeMachineModal | Added `ChevronDown` to lucide-react import |
| Mar 2026 | Gift confirm button greyed out in PersonSelectorModal | Changed `actionType="give_money"` to `actionType="general"` in AssetActionModal |
| Mar 2026 | TransactionsView mixed commissioner diary entries with roster moves | Created EventsView (Commissioner's Diary) — League Events go there; Transactions stays clean for roster moves only. History entries now stored as structured `{text, date, type}` objects. |
| Mar 2026 | All-Star game score too low (115-129 instead of ~163-175 per team) | Added `exhibitionScoreMult: 1.48` to `KNOBS_ALL_STAR`. Engine now applies this to actual game scores BEFORE stat generation. Set `paceMultiplier: 1.0` to avoid double-counting. |
| Mar 2026 | All-Star rotation broken — stars got 36+ min, bench players got 2-3 min | Changed `flatMinutes: false` → `flatMinutes: true, flatMinutesTarget: 20` in `KNOBS_ALL_STAR`. Rating-weighted distribution now gives stars ~26-30 min and role players ~12-16 min. |
| Mar 2026 | BoxScoreModal showed broken image for All-Star East/West logos | Added `renderTeamLogo()` helper in `BoxScoreModal.tsx` — when `team.id < 0`, renders a styled E/W conference badge instead of the broken Wikipedia img. |
| Mar 2026 | Season revenue chart was flat then spiked (static linear accrual) | Replaced `(days/365)*annualRev` with phase-weighted formula in `Dashboard.tsx`. Finals days earn ~3–6x more daily revenue than Preseason. Uses `VIEWERSHIP_MEANS` weights from `ViewershipService.ts`. |
| Mar 2026 | "Revenue" label misleading — no sponsor system yet | Renamed to "Total Expected Rev" / "Expected Annual Revenue" across `Dashboard.tsx`, `StatsCards.tsx`, `BroadcastingView.tsx`, `RevenueChart.tsx`. Placeholder for future sponsor integration. |

| Mar 2026 | Season actions (celebrity, christmas, global games) cluttering Actions tab | Moved all seasonal actions to new `SeasonalView.tsx` with deadline banners + chronological sort. `actionConfig.ts` season array is now empty `[]`. |
| Mar 2026 | Rig All-Star Voting, Dunk/3PT Contestants, Replacement — no UI existed | Added 4 new seasonal actions in `SeasonalView.tsx`. Rig voting is immediate + `ADVANCE_DAY`. Dunk/3PT use `SET_DUNK_CONTESTANTS` / `SET_THREE_POINT_CONTESTANTS` (immediate, no day advance). Replacement uses `ADVANCE_DAY`. |
| Mar 2026 | Sidebar was flat — Approvals/Viewership/Finances buried in Command Center | Restructured sidebar: Command Center (Schedule+Actions only), Seasonal, Events, Commish Store, Legacy (Approvals+Viewership+Finances) groups. |
| Mar 2026 | Social thread "Load More Replies" silently failed when LLM off | Modal now shows "Enable AI in settings to load more replies" when `enableLLM: false`. Also fixed duplicate `key=""` React warning — replies with missing IDs get fallback keys (index+handle). `saveSocialThread` now patches missing IDs before saving. |
| Mar 2026 | Dunk/3PT contestant modals capped at top-30, no search, no portraits | Both modals now show all active NBA players with search filter (name/pos/team) and PlayerPortrait avatars. `.slice(0, 30)` removed. Cards no longer lock after announcement — show "Editing" banner + "Update Contestants" button. |
| Mar 2026 | Rig voting available before starters announced (wrong gate) | Changed lock condition: rig voting now requires `allStar.startersAnnounced === true`. Previously gated on voting window dates only. |
| Mar 2026 | Celebrity game crashed when LLM off + custom (non-rated) roster names | Added LLM-off fallback in `AllStarCelebrityGameSim`: fills unknown names with `hgt/attrs=20` and runs `simulateCelebrityWithGameSim` instead of attempting LLM call. |
| Mar 2026 | Win streaks only reported at 5/8/12 games; no "streak snapped" news | Thresholds changed to `[5, 7, 10, 14]`. Added `long_win_streak` category (8+, more dramatic language). Added `streak_snapped` category: fires when a team had a 5+ W streak last batch and is now on L. `lazySimRunner` + `socialHandler` now pass `prevTeams` for comparison. |
| Mar 2026 | Timeline crash `undefined is not an object (evaluating 'r.type')` | `resolveEntry` in `LeagueEvent.tsx` was casting null/undefined history entries directly to `HistoryEntry`. Added null guard + `.filter((e): e is HistoryEntry => e != null)` in the events useMemo chain. |
| Mar 2026 | Trade machine showing hardcoded "22.3 PER / 19.1 PTS" for all players | Replaced with live `player.stats` lookup: finds current season stats, computes PPG/RPG/APG from `pts/gp`, `trb/gp`, `ast/gp`. Both PlayerRow usages pass `currentSeason={state.leagueStats.year}`. |
| Mar 2026 | All-NBA cards only showed PPG (missing REB/AST) | `AwardRacesView.tsx` AllNBASection cards now render a 3-column PPG+RPG+APG stat block. Uses `trb \|\| (orb+drb)` fallback for total rebounds. |
| Mar 2026 | BoxScore/game log showed "Coach's Decision" for historically injured players | DNP reason was read from current `player.injury` state, not from game time. Fixed with `playerDNPs?: Record<string, string>` on `GameResult` (both `src/types.ts` AND `src/services/simulation/types.ts`). `engine.ts` populates it at sim time; `BoxScoreModal` + `PlayerBioView` use it first, fall back to current state. |
| Mar 2026 | SIMULATE_TO_DATE crossing Apr 13–20 didn't generate/simulate play-in | `runSimulation` day loop in `simulationHandler.ts` didn't run bracket injection (that happened in `gameLogic.ts` after the loop returned). Fixed by extracting `applyPlayoffLogic()` and calling it BEFORE each day (inject games) and AFTER (advance bracket). `gameLogic.ts` now prefers `stateWithSim.playoffs` over `state.playoffs` to prevent double-generation. |
| Apr 2026 | Team minutes total drifting below 240 after foul redistribution | `coordinated.ts` hard cap (clip to 48 min) ran after the foul-stolen-minutes correction block but could still leave the total short. Added a final enforcer pass AFTER the hard cap: sum all minutes, distribute the remainder to the highest-minute player not at the per-game cap. Guarantees exact total = 240 + (otCount × 25). |
| Apr 2026 | Players exceeding 48 min in non-OT games (KD 51:53, Sengun/Amen 48+ on same team) | `initial.ts` wrote raw float `playerMinutes[i]` (e.g. 51.88) directly to the stat object's `min` field BEFORE `coordinated.ts` could clip it — frontend reads `min` from that unclipped object. Two-layer fix: (1) `GamePlan.ts` raw minutes draw capped at `1.50` (was unbounded Box-Muller tail); (2) iterative per-player enforcer added in `initial.ts` after re-normalization — clips each player to `48 + otCount × 5`, re-normalizes to maintain 240 total, repeats up to 4 passes. `playerMinutes[i]` can never exceed the per-game ceiling before being written to `min`. |
| Apr 2026 | League-wide 3P% 4pp below target for all player tiers | `threePmBase` default was `0.27` — produced ~33% for elite shooters and ~22-25% for low-tp players. Bumped to `0.31` (+4pp flat). |
| Apr 2026 | tp 30-60 players still shooting 3-8pp below expected after threePmBase bump | Three compounding mechanisms: (1) `volDecay` per-attempt penalty `0.025` too steep — KAT (tp=51, 11 3PA, naturalVol=6) lost 12.5% efficiency from volume alone; (2) `naturalVol` thresholds too low for the tp 55-70 bracket (got vol=6 but naturally shoots 9-11 3PA); (3) `tpFloorPenalty` coefficient `0.0045` too aggressive (tp=35 lost 6.75pp). Fixes: naturalVol `tp>85→11, tp>70→9, tp>60→8, tp>50→6, else 4`; volDecay coefficient `0.025→0.018`; tpFloorPenalty coefficient `0.0045→0.003`. |
| Apr 2026 | League assists 4+ too high; leader averaging 14-17 ast (should be ~10-12) | `assistRatio` was `0.77` — real NBA teams assist on ~62% of FGM not 77%. Soft cap at 14 was too lenient. Fixed: `assistRatio` `0.77→0.62`, floor `0.55→0.42`; soft cap threshold `14→11` with `0.55→0.45` survival factor. |
| Apr 2026 | `fgaMult` knob added to NightProfile — FGA attempt volume independent of pts/efficiency | Night tiers had no way to express "jacking shots into a slump" vs "efficient scoring" independently of `ptsTargetMult`. Added `fgaMult: number` to `NightProfile` interface and all 20+ return paths. Tier values: BRICKFEST ×1.60, DESPERATE CHUCKER ×1.45, OFF-NIGHT ×1.40, COREY BREWER ×1.40, SIMMONS EFFECT ×0.72, HUSTLE GOD ×0.75, TORCH ×0.88, HOT ×0.90. Normal night path computes `fgaMult` inversely from `ptsTargetMult` so bad pts nights produce more attempts. Wired in `initial.ts`: `estimatedFga = (ptsTarget / 1.1) * nightProfile.fgaMult`. |
| Apr 2026 | League rebounds inflated ~4/game after fgaMult added (Jokic averaging 15 REB) | Bad-night tiers (BRICKFEST ×1.60, etc.) increased team misses ~25% → DRB and ORB pools grew proportionally. Fixed by scaling DRB multiplier `0.69→0.56` in `engine.ts` (both home and away miss pools) and ORB multiplier `0.25→0.20` in `coordinated.ts`. |
| Apr 2026 | First-option scoring too high (Edwards 35+ PPG); star players not soft-capped effectively | `initial.ts` soft cap was triggering at `rawTarget > 30` with only 50% survival — stars above 24 PPG range were not being throttled. Tightened: threshold `30→24`, surplus shaved at 60% to `teamBonusBucket` (redistributed to supporting cast) with 40% survival. Puts realistic ceiling around 28-30 PPG for the biggest games. |
| Apr 2026 | Team FGA not correlating with team score (111 FGA on 154 pts, 55-111 shooting) | High-efficiency teams would have correct `efficiencyMultiplier` from `getEfficiencyMultFromScore` but `fgaMult` was applied without an efficiency offset. Fixed: `estimatedFga = (ptsTarget / 1.1) * (nightProfile.fgaMult / effScore)` where `effScore = clamp(efficiencyMultiplier, 0.88, 1.12)`. High-scoring nights now naturally produce fewer attempts at higher efficiency, not more attempts at the same rate. |
| Apr 2026 | Mid-game injuries not surfaced (Randle's random 12-min game had no injury explanation) | Any player can now roll for a mid-game injury. Probability is weighted by minutes played: `<15 min → 20%, <25 min → 7%, <35 min → 2%, 35+ min → 0.6%`. Rolling uses `getRandomInjury()` from `injuryService.ts` with a duration multiplier based on minutes (low-minute players get shorter injuries). Result stored in `playerInGameInjuries: Record<string, string>` on `GameResult` — this plugs into the existing injury pipeline (post-processor applies it to player state, `lazySimRunner` generates Shams news). BoxScoreModal now shows `✦ Left early (InjuryName)` in orange on the player's played row. |
| Apr 2026 | `null is not an object (evaluating 't.id')` crash watching preseason intl games | `getTeamForGame(tid, state.teams)` returns null for tid ≥ 100 (non-NBA / international teams). Added `resolveTeam(tid)` helper in `ScheduleView.tsx` that checks `state.nonNBATeams` first, builds a fake `NBATeam` shape from the nonNBA record (id, name, abbrev, imgURL), then falls back to `getTeamForGame`. All `WatchGamePreviewModal` and `GameSimulatorScreen` team props now call `resolveTeam()` instead of `getTeamForGame()`. |
| Apr 2026 | Intrasquad scrimmage `WatchGamePreviewModal` showed same team on both sides | Intrasquad games have `homeTid === awayTid` by design. Preview can't show two different teams in this case. Fix: `handleWatchGame` in `ScheduleView.tsx` now detects `homeTid === awayTid` and skips the preview entirely — dispatches `ADVANCE_DAY` directly to simulate. |
| Apr 2026 | `ProfileView` showed no banners/headers; own avatar/banner missing after EditProfile | Two separate bugs: (1) For non-own profiles, `fetchProfileData` was never called if the handle wasn't in `state.cachedProfiles`. Added `useEffect` with `isFetching` state to trigger a fetch on mount for uncached handles. Skeleton `animate-pulse` shown on banner, avatar, name block, and follower counts during fetch. (2) Own profile reads `state.userProfile` (set by `EditProfile`) but `ProfileView` was reading `cached?.avatarUrl` which only reflects the social API cache, not the locally saved profile. Fix: `ownAvatarUrl = isOwnProfile ? (state.userProfile?.avatarUrl \|\| cached?.avatarUrl) : cached?.avatarUrl`. Same pattern for `bannerUrl`, `name`, `bio`. |
| Apr 2026 | "Leave Game" button in watch game triggered re-simulation → game duplication | Watch game flow restructured: when user confirms "Watch Live" in the preview modal, `GameSimulator.simulateGame` runs immediately and `RECORD_WATCHED_GAME` + `ADVANCE_DAY` are dispatched BEFORE the watch screen opens. The watch screen is now pure visual playback of the precomputed result. "Leave Game" (and the X button) call `onClose()` only — no re-simulation possible. The "other events today" confirmation dialog is also gone (irrelevant since ADVANCE_DAY already ran). `precomputedResult` prop carries the result into `useLiveGame` which skips its own simulation when a result is provided. |
| Apr 2026 | Under-19 players appearing in Free Agent market (unrealistic) | Added age filter to `FreeAgentsView.tsx`: computes player age from `p.born?.year` vs current year from `state.date`, falls back to `p.age ?? 99`. Players under 19 filtered out of the FA list. They remain visible in Universal Player Search and on their team roster. |
| Apr 2026 | Playoff series showing "2-0 after Game 1" (double-counting) | `gameLogic.ts` called `PlayoffAdvancer.advance()` with `allSimResults` AFTER `runSimulation` had already advanced the bracket per-day in `simulationHandler.ts`. Each game's wins were counted twice. Fix: guard step 3 in `gameLogic.ts` with `const simHandledPlayoffs = stateWithSim.playoffs != null && stateWithSim.playoffs !== state.playoffs` — only re-advance if `simulationHandler` didn't already handle it. |
| Apr 2026 | Play-in/playoff games using exhibition-style rotations (12-deep, 26 MPG stars) | After 82 regular-season games, `buildStandingsContext()` sets `gamesRemaining = 0` for every team. `standingsProfile()` treats `gbFromLeader > gamesRemaining` (any GB > 0) as "eliminated" → 12-player rotation, 26 MPG stars — same profile as garbage-time. Fix: in `engine.ts`, playoff/play-in games override `gbFromLeader: 0, gamesRemaining: 7` before building knobs, preventing the elimination branch. |
| Apr 2026 | Playoff bracket showing wrong seeds in rounds 2+ (HOU shown as #2 seed instead of #5) | `PlayoffGenerator.buildNextRound()` hardcoded `higherSeed: 1, lowerSeed: 2` for all semi/finals matchups. Fix: added `getWinnerSeed()` helper that looks up the winner's original seed in `prevSeries`, then assigns the lower-numbered seed as `higherSeedTid` and correct `higherSeed`/`lowerSeed` values. |
| Apr 2026 | Feb 12 games missed by simulation (day before All-Star break) | `getAllStarSunday()` used `new Date(year, 1, 1)` + `setDate()` (local time), causing `breakStart.toISOString()` to shift one day earlier in UTC+8 timezones — Feb 12 instead of Feb 13 — making the All-Star break filter skip Feb 12 games. Fix: (1) Rewrite `getAllStarSunday` with `Date.UTC` + `setUTCDate/getUTCDate`. (2) Extended `breakStart` from Friday (Feb 13) to Thursday (Feb 12) so the scheduler also redistributes games away from that slot, preventing future misses. |
| Apr 2026 | All-Star injury replacements not triggered in lazy sim | `autoSimAllStarWeekend` (called on `2026-02-13`) didn't check for injured roster members before simulating. Fix: loop through `allStar.roster` pre-simulation, mark injured players `isInjuredDNP: true`, then find and add conference-matched healthy replacement (sorted by OVR) as `isInjuryReplacement: true`. |
| Apr 2026 | All-Star Game not indicated in PlayerBio game log | Game log rows showed rank/PRE label but no All-Star indicator. Fix: detect `schedGame.isAllStar` during log entry construction, set `isAllStar` flag + override `teamAbbrev: 'ASG'`. Row renders ⭐ in the rank column when `log.isAllStar` is true. |
| Apr 2026 | Series score in playoff detail panel displayed horizontally ("1 — 4") | Redesigned `SeriesDetailPanel.tsx` header: replaced side-by-side team columns with two stacked rows (logo + abbrev on left, win count on right per row), separated by a divider. Winner's count highlighted in emerald. Also removed the "View Box Score" button from `SeriesActionMenu.tsx`. |
| Apr 2026 | `LeagueHistoryDetailView` — award winner photos missing, All-NBA shows no avatars, wrong schema detection | Same dual-schema bug as LeagueHistoryView. `getDetailAwardObj` used broken pid lookup; `hasAllLeague` only checked BBGM nested `allLeague` not flat autoResolver entries; `resolveTeamArray` had no imgURL fallback; `semifinalsMvps` used broken pid check. Fixed: `findPlayer()` with string-pid-first logic; `hasAllLeague` also checks for `All-NBA*`/`All-Defensive*`/`All-Rookie*` flat types; `buildFlatTeams(prefix, names[])` helper assembles autoResolver flat entries into AllTeamSection shape; bref fallback now also looks up player photos via name matching in `state.players`; all missing imgURLs fall back to `ui-avatars`. |
| Apr 2026 | `brefFetcher.ts` — manual async loops in each consumer, no shared cache access | Added `useBRefSeason(year)` and `useBRefSeasonsBatch(years[])` hooks directly in `brefFetcher.ts`. Both hooks read from the module-level `_cache` Map first (instant, no re-fetch). `LeagueHistoryDetailView` replaced its `useEffect+setState` pattern with `useBRefSeason`. `LeagueHistoryView` replaced its manual batch loop with `useBRefSeasonsBatch`. |
| Apr 2026 | `LeagueHistoryView` player photos showing initials (ui-avatars) instead of headshots | Root cause: `a.pid` (BBGM integer) never matched `p.internalId` (string "nba-Name-tid"), and the name fallback was only reached when `a.pid` was falsy. Fix: `findPlayer()` now checks string `pid` against `internalId` first (catches autoResolver entries), then falls back to exact name match, then case-insensitive name match. AutoResolver awards use `internalId` as pid → direct match → real imgURL. |
| Apr 2026 | `LeagueHistoryView` runner up always "—"; best record columns missing | `state.teams` objects were built without `seasons` data — `playoffRoundsWon` was always undefined. Fix: `rosterService.ts` now includes `seasons: t.seasons.map(…)` in `processedTeams`. Runner up is now found via `playoffRoundsWon === maxRounds - 1`. Added "Best (E)" and "Best (W)" columns using the same `seasons` data. |
| Apr 2026 | `LeagueHistoryView` not showing current-season awards even after announcement | Two schemas coexist in `state.historicalAwards`: BBGM format (`{ season, mvp: {…}, dpoy: {…} }` — no `type` field) and autoResolver/lazySimRunner format (`{ season, type: 'MVP', name, pid, tid }` — flat). LeagueHistoryView only handled BBGM format. Fix: split by presence of `type` field, resolve each award via `flat(type) ?? bbgmRecord?.[key]`. Champion/Runner Up also resolved from autoResolver `'Champion'`/`'Runner Up'` type entries first (most reliable), falling back to `playoffRoundsWon`. COY now also resolved (was hardcoded to null). |
| Apr 2026 | International team logos missing in NBA Central preseason schedule | `DailyGamesBar` and `GameBar` (via `TeamDetailView`) received only `state.teams` — nonNBATeams (tid ≥ 100) were never found, so cards returned null. Fix: `NBACentral.tsx` now passes a merged array `[...state.teams, ...nonNBATeams.map(t => ({ id: t.tid, logoUrl: t.imgURL, ... }))]` to both components. `DailyGamesBar` guard changed from `return null` (both missing) to rendering a text-initial fallback badge when `logoUrl` is empty. |
| Apr 2026 | International preseason game modal showed nonsensical starters (5 best by OVR, no positional logic) | `WatchGamePreviewModal` for `team.id >= 100` used `.sort().slice(0,5)`. Now picks 1C → 2F → 2G by `p.pos` (all sorted by OVR), with fallback fill from remaining roster if a position slot is empty. |
| Apr 2026 | `LeagueHistoryView` — `historicalAwards` always empty | `UPDATE_STATE` was in `ActionType` but had no handler in `GameContext.tsx` `dispatchAction`. It fell through to the `else` branch → `processTurn()` which ignores it → no state update. Fix: added explicit `UPDATE_STATE` guard before the `isProcessing` block: `setState(prev => ({ ...prev, ...payload })); return;`. Now the safety-net fetch in `LeagueHistoryView` correctly backfills `historicalAwards` for saved games. |
| Apr 2026 | `LeagueHistoryView` runner-up always "—" after lazy sim | `lazySimRunner.ts` derived `loserTid` from `finalsSeries.winnerId` which could be unset even after `bracketComplete`. Fix: derive loser directly from `champTid` — `finalsSeries.higherSeedTid === champTid ? lowerSeedTid : higherSeedTid`. No longer depends on `winnerId` or `status === 'complete'`. |
| Apr 2026 | Added **Player Bios** sidebar view (`PlayerBiosView.tsx`) | Filterable/sortable table of all players (NBA + intl + retired) with search, league/team/pos/college/country dropdowns, column filters (`>80`, `!USA`, etc.), OVR badge coloring, and HOF badge. Click any row → `PlayerBioView`. "Players" sidebar tab renamed to "Player Search". `Tab` type updated. Draft prospects (`tid === -2`) are **excluded** — they are incoming NBA rookies (appear next to Free Agents in BBGM data) who haven't officially entered the league yet. Their BBGM data does include bio info — future work can build a dedicated prospect bio view for them. |
| Apr 2026 | Rookie jersey numbers missing in `PlayerBioView` | `rosterService.ts` extracted jersey number only from `p.stats[last].jerseyNumber`. Rookies with no season stats yet (empty `stats[]`) have `jerseyNumber` at the **top-level** BBGM player object (`p.jerseyNumber`). Fix: fallback to `String(p.jerseyNumber)` when stats-based lookup yields nothing. |
| Apr 2026 | `LeagueHistoryDetailView` players not clickable | Added `onClick` handlers to all player cards in detail view: Awards (MVP, DPOY, SMOY, MIP, ROY, Finals MVP chip), All-NBA/Defensive/Rookie cards, Stat Leaders, Semifinals MVPs, All-Stars. Clicking navigates to `PlayerBioView` via `setViewingPlayer`. Players not found in `state.players` (historical BBGM players) show a "Records not available" toast instead of crashing. `PlayerBioView` renders at Historical Data tab (default), not Awards tab. |
| Apr 2026 | `PlayerBioView` showed "FREE AGENT" for retired legends (Tim Duncan, Kobe, etc.) | `team` useMemo only checked `player.tid` — retired players have `tid: -1`. Fix: when no current team found, aggregate career regular-season GP by tid from `player.stats`, and return the team with the most GP. Tim Duncan correctly shows SAN ANTONIO SPURS with Spurs colors as the background. |
| Apr 2026 | `PlayerBioView` padding too tight; content felt claustrophobic | Bumped `Historical Data` and `Game Log` tab wrapper from `p-4` to `p-4 md:p-8`. Tab bar gets `px-4 md:px-8 mt-5` (was `px-2 mt-4`). Mobile spacing preserved — extra padding only kicks in at `md:` breakpoint. |
| Apr 2026 | Hall of Fame players had no badge in `PlayerBioView` | Added HoF badge (Naismith Basketball Hall of Fame logo) as a circular overlay on the player portrait — bottom-right corner, `w-10 md:w-14`. Only renders when `player.hof === true`. Passed via `isHoF` prop to `PlayerBioHero`. |
| Apr 2026 | `PlayerBiosView` team dropdown showed only nickname (e.g. "Heat"), not full team name | Non-NBA teams (Euroleague, PBA, B-League) have both `region` and `name` fields. The dropdown was only using `t.name`. Fix: render `{t.region ? \`${t.region} ${t.name}\` : t.name}` in the NonNBA option. |
| Apr 2026 | `PlayerBiosView` college/country dropdowns reset when switching leagues | `allColleges` and `allCountries` were derived from `filtered` (all active filters). Switching league cleared the college list → selected college disappeared from dropdown. Fix: derive from `filteredBase` (all filters except college/country), so dropdowns stay populated while still reflecting league/team/pos constraints. |
| Apr 2026 | External roster players showed `—` for college, weight, and experience in `PlayerBiosView` | Gist data (PBA/Euroleague/B-League bio) was fetched in `PlayerBioView` but never in the list view. Fix: `useEffect` calls `ensureNonNBAFetched` for all external leagues on mount. `gistVersion` state increments after each fetch completes, triggering a useMemo re-run. `enriched` useMemo reads `getNonNBAGistData` per player and fills college (`gist.s`), weight (`gist.w`), experience (derived from `gist.d` draft year), and country. |
| Apr 2026 | `PlayerBiosView` OVR values different from `FreeAgentsView` and `UniversalPlayerSearcher` | `convertTo2KRating(ovr, hgt, tp)` was being called with `p.hgt` (bio inches ~78) instead of the BBGM attribute `lastRating.hgt` (0-100 scale). Result: height multiplier always applied at max, inflating OVR for tall players. Fix: use `lastRating?.hgt ?? 50` and `lastRating?.tp` as the second and third args. |
| Apr 2026 | Draft prospects in `PlayerBiosView` showing draft info as "2026 RundefinedPundefined" | `player.draft.round` and `player.draft.pick` are `undefined` for unassigned prospects. Fix: separate path — if `isProspect`, show `"Draft Eligible: YEAR"` or `"Draft Prospect"`; otherwise show `"YEAR R? P?"` with `?? '?'` guards. |
| Apr 2026 | Non-NBA class suffix `(So)` showing in "Last Attended" field | `nonNBACache.ts` `buildFlatEntry` set `s = item.pre_draft` raw. PBA/Euroleague data includes class year in parens, e.g. `"Texas Tech (So)"`. Fix: strip with `.replace(/\s*\([^)]*\)\s*$/, '').trim()`. |
| Apr 2026 | `PlayerBioView` portrait grey silhouette for retired BBGM legends (KG, etc.) | `PlayerBioHero.tsx` portrait `onError` compared `img.src !== playerImgURL` to decide whether to try the BBGM fallback. After browser URL normalization, equality can fail and the image is hidden before the BBGM URL is tried. Fix: use `img.dataset.triedFallback` flag instead of URL equality — first `onError` always tries `playerImgURL`, second `onError` hides. Also added `referrerPolicy="no-referrer"` to the portrait img (BBGM CDN requires it). |
| Apr 2026 | `PlayerBioView` hero stats showed `0.0/0.0/0.0` for retired players | `getBestStat(player.stats, curYear)` returns null when no stats exist for `curYear` (retired player's last season was before current sim year). Fix: when `ss` is null, aggregate career regular-season totals across all `player.stats` entries where `!s.playoffs && s.tid >= 0`, then divide by total GP. Career averages now show instead of zeros. |
| Apr 2026 | Clicking historical BBGM legends in `LeagueHistoryDetailView` showed "Records not available" | `handlePlayerClick` called `findPlayer(awardEntry)` which searched `state.players`. Retired legends (Manu Ginobili, etc.) from pre-sim BBGM history are not in `state.players`. Fix: when `findPlayer` returns null but `awardEntry.name` is known, build a minimal `NBAPlayer` stub (`tid: -1`, `stats: []`, `ratings: []`, `imgURL: undefined`) and open `PlayerBioView` with it. `PlayerBioView` then uses `extractNbaId("", player.name)` (now name-aware) which checks `NAME_TO_ID` — if the player is in the map, their NBA CDN portrait and full bio are fetched. |
| Apr 2026 | `LeagueHistoryView` runner-up missing for current sim season | After lazy sim completes, `historicalAwards` has the `Runner Up` flat entry but `LeagueHistoryView`'s `playoffRoundsWon` fallback is skipped because `t.seasons[season].playoffRoundsWon` stays `-1` (never updated by the sim). Fix: in `lazySimRunner.ts`, when the championship fires, mutate `stateWithSim.teams` to set `playoffRoundsWon: 4` on the champion and `playoffRoundsWon: 3` on the runner-up for the current season. Both the flat-award path AND the `playoffRoundsWon` fallback now work independently. |
| Apr 2026 | **Added `LeagueHistoryView` + `LeagueHistoryDetailView`** — wiki-backed season browser | Two new views under Analytics sidebar. `LeagueHistoryView` lists all sim seasons with champion, runner-up, best records (E/W), COY, MVP, DPOY, SMOY, MIP, ROY, Finals MVP — pulled from `state.historicalAwards` (both BBGM + flat schemas). `LeagueHistoryDetailView` drills into a single season: award cards with portraits, All-NBA/Defensive/Rookie teams, statistical leaders, All-Stars, semifinals MVPs. Wikipedia bref data supplements sim history (real NBA seasons before sim start). |
| Apr 2026 | `LeagueHistoryView`/`DetailView` historical teams unmatched (relocated franchises) | Manual `.includes()` matching failed for "Minneapolis Lakers", "Seattle SuperSonics", "Baltimore Bullets", etc. Fix: `FRANCHISE_MERGE` constant in `brefFetcher.ts` maps ~25 historical franchise names to their modern successor nickname. `matchTeamByWikiName()` checks the merge map first, then falls back to exact full-name and nickname-endsWith matching. `generateAbbrev()` utility auto-generates abbreviations for teams missing one (3+ words → first letters, 2 words → 2+1 chars). |
| Apr 2026 | `LeagueHistoryView` runner-up Nx badge missing | Finals appearances count (runner-up) wasn't tracked. Fix: `ruYearsByTeamId` map built from flat 'Runner Up' awards + Wikipedia `bref.runnerUp` data (franchise-merge aware). `countRunnerUp(teamId)` helper returns count. Displayed as `Nx Finals` badge alongside champion ring count. |
| Apr 2026 | **Added `TeamHistoryView`** — per-franchise deep-dive | New sidebar view under Analytics → "Team History". Team grid with logo, color-coded accent, search. Per-team tabs: **Overview** (retired jersey numbers + all-time top players sorted by WS composite), **Records** (gist franchise records — regular/playoff toggle, top 5 per stat), **Leaders** (career totals + per-game averages from gist + live sim override), **Season History** (W-L table per season with playoff round, champion/runner-up highlight). `Tab` type updated, BookOpen icon added to NavigationMenu, case added to MainContent. |
| Apr 2026 | `TeamHistoryView` everyone showing Atlanta Hawks leaders | `filterToTeam` used `fr.includes(region.toLowerCase())` — when region was empty string, `fr.includes('')` is always `true`. Every gist row matched every team. Fix: use `fr.endsWith(' ' + nameLower)` with a length guard (`nameLower.length >= 4`) and exact full-name match. Exact TM abbreviation match is the primary path. |
| Apr 2026 | `TeamHistoryView` season history empty (0-0 all seasons) + retired jerseys missing | `rosterService.ts` mapped teams to `NBATeam` objects without including `seasons[]` or `retiredJerseyNumbers[]`. Both were stripped. Fix: added `seasons: t.seasons.map(s => ({ season, won, lost, playoffRoundsWon, imgURLSmall }))` and `retiredJerseyNumbers: t.retiredJerseyNumbers ?? []` to `processedTeams` mapping. Affects new game loads only — existing saves won't have this data in state. |
| Apr 2026 | `TeamHistoryView` career leaders name duplication ("Dominique Wilkins D. Wilkins") | Gist data appends abbreviated form after full name. Fix: `cleanName()` in `franchiseService.ts` — strips `X. LastName` suffix when second-to-last word matches `^[A-Z]\.$`, and deduplicates "Reggie Miller Reggie Miller"-style strings. Applied to all name display in Leaders and Records tabs. |
| Apr 2026 | `TeamHistoryView` top players sorted by GP instead of meaningful metric | `totalWS` is 0 for most BBGM sim players (WS not stored by default). Fallback was `totalGP` — not a useful ranking. Fix: composite score: `WS * 100` when WS > 0, else `PTS + 0.5*REB + 0.5*AST + STL + BLK`. Display shows `X.X WS` when WS available, `X,XXX PTS` otherwise. |
| Apr 2026 | `TeamHistoryView` career leaders show only gist data — active sim players don't update | Curry's 3PM, Jokic's REB, etc. were frozen at their pre-sim gist values. Fix: `computeLiveTotals(state.players, teamId)` aggregates career stats per player from `player.stats[]` (non-playoff, same tid). `mergeCareerLeaders(gistRows, liveTotals)` and `mergeAverageLeaders(gistRows, liveTotals)` take max-per-player per category, then re-rank. Both are computed as useMemos in `TeamHistoryView` — live stats flow through automatically as the sim advances. |
| Apr 2026 | Non-NBA preseason schedule only generated 3 games (not 9) | `generateSchedule` in `gameScheduler.ts` required ≥9 NBA teams per pairing before adding non-NBA games. With intl tid offsets, the `nbaTeams.length` check was blocking entries. Fix: removed the `nbaTeams.length >= 9` guard for intl preseason; each non-NBA team now gets its own games entry directly. |
| Apr 2026 | League Leaders required ≥10 GP minimum — filter too aggressive early in preseason | `LeagueLeadersView` filtered `gp >= 10`. In preseason only 4-6 games had been played. Fix: lowered minimum to `gp >= 3` for preseason (detect via phase), and `gp >= 10` remains for regular season. |
| Apr 2026 | Assist leaders averaging 14-17 APG in sim (should be ~10-12) | `assistRatio` in `engine.ts` was `0.77` (77% of FGM assisted), real NBA is ~62%. Soft cap at 14 was too lenient. Fix: `assistRatio 0.77→0.62`, floor `0.55→0.42`, soft cap threshold `14→11`, survival factor `0.55→0.45`. |
| Apr 2026 | **Weekly OVR progression chart — garbled x-axis "0, 20 7,20 4,20"** | `ProgressionEngine` was storing dates as locale strings (`"Apr 20, 2026"`) from the game state. Chart code did `s.date.slice(5, 10)` on that format → garbage. Fix: store dates as YYYY-MM-DD via `normalizeDate(date)` in `ProgressionEngine` before saving to `ovrTimeline`. Chart splits on `'-'` and builds `"Jan 5"` labels cleanly. |
| Apr 2026 | **Weekly OVR progression chart — flat for all players** | `convertTo2KRating()` rounds to integer; weekly progression deltas are ~0.07-0.14 BBGM points/week → always rounds to same integer. Fix: store raw `overallRating` float in `ovrTimeline` (not rounded K2). Chart converts with `parseFloat((0.88 * s.ovr + 31).toFixed(2))` — sub-1pt weekly changes now visible as smooth curves. |
| Apr 2026 | **OVR badge discrepancy between list view (95) and modal (72)** | List used `convertTo2KRating(player.overallRating, hgt, tp)` directly. Modal used `k2Overall` = average of all K2 category OVRs — a very different number. Fix: modal and BioView OVR badge now both use `overall2k = convertTo2KRating(player.overallRating, lastRating.hgt, lastRating.tp)`. `k2Overall` is still used for category-level display only. |
| Apr 2026 | **POT (Potential) showing stored value (always 0 for NBA players)** | `currentRatings.pot` was being read directly — this field is 0 or unset for all NBA players. POT in BBGM is a derived metric, not stored. Fix: compute POT fresh everywhere via BBGM `potEstimator` formula: age < 29 → `72.31428908571982 + (-2.33062761 * age) + (0.83308748 * rawOvr)`, clamped with `Math.max(rawOvr, formula)`. Age ≥ 29: POT = OVR (peaked). Then convert to 2K scale via `convertTo2KRating(potBbgm, hgt, tp)`. Implemented in `PlayerRatingsModal`, `PlayerBioView`, `PlayerBiosView`, `PlayerRatingsView`. |
| Apr 2026 | **`PlayerBiosView` OVR inflated for tall players** | `convertTo2KRating(ovr, p.hgt, p.tp)` was using `p.hgt` (bio inches ~78) instead of BBGM attribute `lastRating.hgt` (0-100 scale). Height bonus applied at max, inflating OVR for tall players. Fix: use `lastRating?.hgt ?? 50` and `lastRating?.tp` as args. |
| Apr 2026 | **Column filters added to PlayerStatsView, PlayerRatingsView, PlayerBiosView** | All three views now support per-column filter inputs. `evaluateFilter()` utility supports operators: `>=`, `<=`, `>`, `<`, `|` (OR), `!` (NOT/exclude). PlayerRatingsView got a new Filter toggle button (SlidersHorizontal icon) + filter row in `<thead>` (as `<th>` cells — not between `</thead>` and `<tbody>` which is invalid HTML). |
| Apr 2026 | **AI FA signings ignored entirely (everyone signed for ~$2M flat)** | `runAIFreeAgencyRound` used `p.contract.amount * 1_000_000` (stale BBGM value, not a real market offer) for cap-space filtering, and `SigningResult` carried no salary/years. When applying signings, `simulationHandler` only set `tid` + `status`, leaving the player's old rookie/stale contract in place. Fix: (1) `computeContractOffer(player, leagueStats, moodTraits, moodScore)` added to `salaryUtils.ts` — uses §6c formula `score = OVR×0.5 + POT×0.5; salary = MAX(min, maxContract×((score-68)/31)^1.6)` with service-tiered max/min tables that scale with cap inflation. (2) `SigningResult` now carries `salaryUSD`, `contractYears`, `contractExp`. (3) `getBestFit` uses `computeContractOffer` for affordability check. (4) `simulationHandler` applies `contract: { amount, exp }` when stamping the signed player. (5) `runAIMidSeasonExtensions` switched from `estimateMarketValueUSD` to `computeContractOffer`. Hardcoded `2026 - born.year` in the legacy helper also fixed to use `state.leagueStats.year`. |
| Apr 2026 | **Draft lottery results ignored by draft board (wrong teams assigned picks)** | `DraftSimulatorView` picked teams by standings order, not lottery order. `state.draftLotteryResult` held the correct reordered picks but was never read. Fix: `DraftSimulatorView` reads `draftLotteryResult` from state and uses it as the pick-order source; `lotterifiedPicks` maps lottery slots 1–14 to the winning team, then appends playoff teams in seed order for picks 15–30. |
| Apr 2026 | **`PlayerBioHero` defaulting to NBA CDN instead of BBGM imgURL** | The hero component's primary `src` was set to `cdnUrl` (NBA CDN) and `imgURL` was only tried on CDN error — reversing the intended priority. Fix: primary src = `player.imgURL` (BBGM), fallback = NBA CDN, final fallback = ui-avatars initials. |
| Apr 2026 | **Mid-season extension contract stored as $3,200 instead of $3.2M** | `simulationHandler.ts` applied `amount: ext.newAmount` directly but `newAmount` is in millions (e.g. 3.2). BBGM convention is thousands. Fix: `amount: Math.round(ext.newAmount * 1_000)`. Existing saves with old entries can't be retroactively fixed — they'll show garbage in TransactionsView but new sims are clean. |
| Apr 2026 | **All hardcoded 2025/2026 date literals removed for multi-season** | `START_DATE_STR` removed from `constants.ts`. New `src/utils/dateUtils.ts`: `resolveSeasonDate()`, `getSeasonSimStartDate()`, `getOpeningNightDate()` all derive from `leagueStats.year`. Fixed in: `initialState.ts`, `initialization.ts`, `CommissionerSetup.tsx`, `Dashboard.tsx`, `PlayerBioView.tsx`, `StatisticalFeatsView.tsx`, `lazySimNewsGenerator.ts` (added `seasonYear` param), `GlobalGamesModal.tsx` (added `seasonYear` prop). `BroadcastingView.tsx` deal summary string now uses dynamic season label. |
| Apr 2026 | **`seasonHistory[]` not written during normal day-by-day sim** | `lazySimRunner.ts` wrote `seasonHistory` at `bracketComplete`, but `gameLogic.ts` (regular `ADVANCE_DAY` sim) had no equivalent. Result: playing through the playoffs manually would never append to `seasonHistory` — LeagueHistoryView would miss the season. Fix: added the same `bracketComplete` guard + `SeasonHistoryEntry` construction to `gameLogic.ts` return block. Now fires in ALL sim paths. |
| Apr 2026 | **`TransactionsView` showed all seasons mixed together** | No way to see just this season's trades/signings vs last season. Added left/right chevron year picker at top-right of the view header. `getSeasonYear(dateStr)` converts transaction dates to NBA season year (Oct-Dec → calYear+1, else → calYear). Initialized to `leagueStats.year`. Navigates through all seasons that have transaction entries. |
| Apr 2026 | **Calendar events (All-Star, awards, schedule gen) missed when using day-view sim or SIMULATE_TO_DATE** | `processTurn` in `gameLogic.ts` called `runSimulation` directly — a batch that had no auto-resolve event loop. Unlike `runLazySim`, no All-Star votes, schedule generation, or award announcements fired. Two fixes: (1) Eager preflight — if no regular-season schedule exists and target is past Aug 14, fire broadcasting/global_games/intl_preseason/schedule_generation before the sim runs. (2) Post-sim event sweep — after `runSimulation` returns, fire all `buildAutoResolveEvents` entries whose date fell within the sim window. All resolvers are idempotent (guarded by state flags), so re-firing is safe. `buildAutoResolveEvents` exported from `lazySimRunner.ts`. |
| Apr 2026 | **Real contract data (China CBA / NBL Australia / etc.) — leagues renamed with spaces** | `ChinaCBA` → `China CBA`, `NBLAustralia` → `NBL Australia` everywhere in display strings. Code identifiers kept camelCase (`fetchChinaCBARoster`, `calculateChinaCBAOverall`). All object literal keys with spaces now quoted. |
| Apr 2026 | **Real per-season contract amounts from nbacontractsdata gist** | `applyContractOverrides` now stores ALL seasons as `contractYears[]` on each player. `PlayerBioContractTab` uses real per-year guaranteed amounts (path A) vs `annualRaise` escalator only for game-generated contracts (path B). `TeamFinancesViewDetailed` shows Player Option (dashed yellow) / Team Option (dashed blue) cell styling. |
| Apr 2026 | **Draft board missing external league players who were NBA-drafted** | `latestDraftClass` only looked at `player.draft.round/pick` from BBGM data. Players whose draft info comes from bio gists (e.g. Willy Hernangomez "2015 Round 2, Pick 5, Philadelphia Sixers") had no draft fields in their BBGM object. Fix: for external league players, fall back to `getNonNBAGistData` → `parseBioDraftStr()` to extract year/round/pick/team. Draftee team resolved by fuzzy-matching team name against `state.teams`. Current team logo from `nonNBATeams` for overseas players. |
| Apr 2026 | **Market size percentile — all 30 teams showing "High"** | `TeamDetailView.tsx` computed `marketTier` percentile using `allTeams` which included non-NBA external teams (CBA/NBL/WNBA with `pop: 0`). This flattened the distribution making every NBA team's pop land in the top tier. Fix: filter to `conference === 'East' \|\| 'West'` before building the percentile array. |
| Apr 2026 | **TransactionsView stops showing entries after Jun 30 offseason** | `selectedYear` was initialized with `useState(state.leagueStats.year)` — React only runs the initializer once. After rollover bumped `leagueStats.year` to 2027, `selectedYear` stayed 2026, and all Jul+ entries (season=2027) were filtered out. Fix: `useEffect(() => setSelectedYear(state.leagueStats.year), [state.leagueStats.year])` in `TransactionsView`, `TeamTransactionsTab`, and `TeamStatsView`. |
| Apr 2026 | **G-League assignments appearing in Commissioner Diary for everyone** | `LeagueEvent.tsx` `TRANSACTION_TYPES` set didn't include `'g-league assignment'` / `'g-league callup'`. History entries bypassed the `commissioner: true` gate and fell through to the text-based catch-all regex — `'assigned'` didn't match `\bsigned?\b` so they appeared everywhere. Fix: add both keys to `TRANSACTION_TYPES`. |
| Apr 2026 | **FA pool drains entirely to external leagues** | `externalSigningRouter.ts` routed all K2 55+ unsigned players overseas on every offseason cycle, leaving zero good players for NBA FAs. Fix: protect top 30 K2 ≥ 70 players and top 30 K2 60–69 players as NBA FAs before routing the remainder. |
| Apr 2026 | **Two-way contracts not detected on first-season load** | BBGM data loads players with ~$625K salaries (two-way scale) but no `twoWay: true` flag. `autoTrimOversizedRosters` counted them as standard roster spots → teams with 15+3 two-way players got their two-way slots incorrectly waived. Fix: `rosterService.ts` detects `contract.amount < 800` (< $800K) on load and sets `twoWay: true`. Same detection runs in `LOAD_GAME` migration in `GameContext.tsx`. |
| Apr 2026 | **Season 2 unplayable — schedule never generates after rollover** | `applySeasonRollover` returned no `schedule` key — old season's games stayed in state. `autoGenerateSchedule`'s guard `state.schedule.some(regularGame)` found those stale games and returned `{}` without generating the new season. Additionally, `lazySimRunner.ts` never called `applySeasonRollover` — simming past Jun 30 via lazy sim left `leagueStats.year` stuck at 2026 forever. Three-part fix: (1) `seasonRollover.ts` now returns `schedule: []` to clear old games. (2) `autoGenerateSchedule` guard is year-scoped — only counts games within `Oct(year-1)..Jun(year)` date range. (3) `lazySimRunner.ts` main loop now calls `applySeasonRollover` / `shouldFireRollover` when crossing Jun 30. |
| Apr 2026 | **"Left early" label in box score for healthy players** | `engine.ts` added players to `playerInGameInjuries` unconditionally when rolling an in-game injury. In edge cases `gamesRemaining` could be 0 (minor bruise, immediate recovery) — player showed "Left early" in the box score but appeared healthy in subsequent games. Fix: guard `playerInGameInjuries[id] = injuryName` with `if (gamesRemaining > 0)`. |
| Apr 2026 | **TradeProposals shows "AI GM" instead of real GM name** | `AITradeHandler.ts` hardcoded `proposingGMName: 'AI GM'`. Fix: `getGMName(state, teamId)` helper looks up `state.staff.gms` by team name / city / abbrev, falls back to `"${team.name} GM"`. |
| Apr 2026 | **Player option history missing from TransactionsView** | `seasonRollover.ts` opt-in branch added no history entry. Opt-out branch said "exercised his player option" (should be "declined"). Fix: added `playerOptionHistory[]` written to `state.history` for both decisions; corrected wording; added `playerOptionNewsItems[]` to the rollover news array. |
| Apr 2026 | **Commissioner signing (`SignFreeAgentModal`) missing `contractYears`** | `playerActions.ts` `handleSignFreeAgent` stamped `contract: { amount, exp }` but no `contractYears[]`, so `PlayerBioContractTab` showed the old pre-signing deal. Fix: build a 1-year minimum `contractYears[]` entry (`$1.3M`) alongside the minimum contract in both result.players branches. |

### Investigation Findings (Things Discovered Through Digging)

Non-obvious facts uncovered while tracing bugs — saved here so we don't have to rediscover them.

- **`"Runner Up"` only saved by `lazySimRunner.ts`** — `AwardService.ts` does NOT save it. Only fires when `bracketComplete` transitions false→true in a lazy sim batch. Manual play-through doesn't auto-save runner up — it relies on `playoffRoundsWon` fallback instead.
- **`lazySimRunner` was using `finalsSeries.winnerId` to derive the loser** — but `winnerId` can be unset even after `bracketComplete`. Safer: derive loser as `higherSeedTid === champTid ? lowerSeedTid : higherSeedTid` directly from the series object.
- **`"Runner Up"` type entry has `tid` but no `pid`** — it's a team award, not a player award. `name` is the team name. Don't try to `findPlayer()` on it.
- **`state.teams[i].seasons` is stripped by `rosterService.processedTeams`** — unless you explicitly include it in the mapping. This means `playoffRoundsWon` lookups silently return `undefined` on every team in a fresh new game. Always add `seasons` to `processedTeams` when you need historical round data.
- **`player.hof` exists on `NBAPlayer` (line 624 of `types.ts`)** — it's a boolean set from the BBGM JSON. Can be used directly in components without any extra fetch.
- **Retired players have `player.tid === -1`** — but their full career `player.stats[]` array is intact, including every season with every team. Most-GP team = career team. No external lookup needed. In `PlayerBioView`, the `team` useMemo aggregates career GP by tid from `player.stats` (skipping `playoffs: true` and `tid < 0` rows) to surface the career team with Spurs/Lakers/etc. branding instead of "FREE AGENT".
- **Draft prospects have `player.tid === -2`** (also `status: 'Draft Prospect'` or `'Prospect'`). They appear alongside Free Agents (`tid === -1`) in BBGM data but represent incoming rookies who haven't entered the active roster yet. Exclude them from any general player browsing view (`PlayerBiosView`, `PlayerBioHero`, etc.) since their bio fields are sparse/empty. They DO carry BBGM data (ratings, draft year, college) — a dedicated Prospect Scout view could use it in the future.
- **Rookie `jerseyNumber` lives at the top-level player object**, not inside `stats[]`. Rookies have an empty `stats` array their first year — `p.stats[last].jerseyNumber` is unreachable. Always fall back to `p.jerseyNumber` (top-level string) when the stats-based lookup returns nothing. This is fixed in `rosterService.ts`.
- **`nonNBACache.ts` gist URLs are hardcoded** — PBA, Euroleague, B-League each have their own raw gist URL. Adding a new league requires adding to the `GIST_URLS` map there AND to `GIST_URL` in `bioCache.ts` (separate file).
- **`extractNbaId()` in `helpers.ts` has a `NAME_TO_ID` override map** — if a player's imgURL doesn't contain an extractable NBA ID, check if their name is in that map first before assuming they have no photo.
- **`state.historicalAwards` "Runner Up" entry shape**: `{ season: number, type: 'Runner Up', name: string (team name), tid: number }` — no `pid`, no `name` of a player.
- **`playoffRoundsWon` is NOT updated by the sim** — `lazySimRunner.ts` only saves to `historicalAwards`. The BBGM roster data sets `playoffRoundsWon` for historical seasons but never for the current sim year. LeagueHistoryView's `playoffRoundsWon` fallback is therefore useless for current-season results unless the sim explicitly patches team seasons. Now fixed: `lazySimRunner` stamps `playoffRoundsWon: 4` (champion) and `3` (runner-up) in `stateWithSim.teams` on championship completion.
- **`img.src !== playerImgURL` in onError can mis-fire** — the browser normalizes `img.src` to an absolute URL. If `playerImgURL` is already absolute and matches, equality may fail due to trailing slashes or encoding differences. Safer pattern: track fallback attempts via `img.dataset.triedFallback` rather than URL comparison.
- **Historical BBGM players are not in `state.players`** — players who retired before the sim started (Manu Ginobili, KG, etc.) exist in `state.historicalAwards` and team `seasons` data but are never loaded into `state.players`. `findPlayer()` will always return undefined for them. Don't show an error toast; instead build a minimal player stub and pass it to `PlayerBioView`, which will then use `NAME_TO_ID` to fetch real bio/portrait data.
- **`extractNbaId(imgURL, name)` name param is underused** — the second `name` arg checks `NAME_TO_ID` first. Many historical callers only pass `imgURL`. For stubs with no `imgURL` (historical legends), pass `player.name` as the second arg so the name-lookup path fires. Fixed in `PlayerBioView.tsx` for both `isSyncing` initial state and the `run()` fetch.
- **Career stats for retired players**: `getBestStat(player.stats, curYear)` returns null when the player last played before `curYear`. Don't show zeros. Instead sum all regular-season entries (`!s.playoffs && s.tid >= 0`) and divide by total GP. The `trb` fallback chain applies here too: `s.trb ?? s.reb ?? ((s.orb ?? 0) + (s.drb ?? 0))`.
- **External roster players need BBGM fields `draft` and `college`** added to their player objects in `externalRosterService.ts`
- **`lazySimRunner` NEVER called `applySeasonRollover`** — the rollover was only wired in `simulationHandler.ts` (normal day-advance turns). If the user used "Simulate to Date" across Jun 30, contracts never expired, year stayed at 2026 forever, and `schedule_generation` couldn't re-fire. Always add season-rollover logic to BOTH `simulationHandler` and `lazySimRunner` when making rollover changes.
- **`applySeasonRollover` must return `schedule: []`** — without clearing the schedule, old season games remain in state. `autoGenerateSchedule` guards on `state.schedule.some(regularGame)` — it will skip generating the new season if any regular-season games exist, regardless of their date.
- **`state.staff.gms` keyed by team field**: each GM object has a `position` or `team` field containing the team name (e.g. "Atlanta Hawks"). Match by `teamName.toLowerCase()` or `teamCity.toLowerCase()` — never by `tid`. Staff data is loaded once per session from the gist and stored in `state.staff`. — these were previously omitted, causing experience and college to always show as `—`. Add `draft: item.draft, college: item.college` to each league's player construction in all four fetchers (Euroleague, PBA, WNBA, B-League).

### BBGM vs K2 Rating Scales — CRITICAL (Read Before Touching Any Rating Logic)

**Two separate rating scales coexist in this codebase. Confusing them breaks routing, contracts, and thresholds.**

#### BBGM OVR scale (`player.overallRating`, `ratings[].ovr`) — practical range in this sim: 35–82
This is the raw basketball ability score computed by `calculateOverallFromRating()` using weighted BBGM attributes. BBGM's own docs describe the *theoretical* scale (0–99), but with our 2024 roster data + `calculateOverallFromRating()` formula the **practical range is compressed**:

| BBGM OVR (our sim) | Player tier |
|---|---|
| **78–82** | True superstar (LeBron/Giannis ceiling — barely 5 players) |
| **72–77** | MVP candidate / franchise player |
| **65–72** | All-Star caliber |
| **58–65** | Good starter |
| **50–58** | Rotation / role player |
| **42–50** | Fringe NBA / end-of-bench |
| **below 42** | G-League / not NBA caliber |

**Why compressed:** `calculateOverallFromRating()` averages 4 component groups (scoring, playmaking, defense, physicals). Even elite players don't max all groups — Giannis scores ~76 BBGM because his TP/FG drag scoring down; Curry scores ~79 because his defense/physicals are below elite. The superstar boost (rawOvr > 80 → `80 + excess * 1.4`) only fires for truly exceptional all-around players, which is rare with real 2024 BBGM attributes.

**Key rule:** Any threshold `>= 85` in game logic is effectively dead code. `>= 90` never fires. Use 68–72 for "star-level", 74–78 for "MVP-level" comparisons.

#### K2 scale (`convertTo2KRating(bbgmOvr, hgtAttr, tp)`) — mapped to ~66–99 for real NBA players
Used for display and salary tiers. Formula: `0.88 * bbgmOvr + 31` + height/TP bonuses. Quick reference for real 2024 player data:
- K2 97–99 → BBGM ~75–82 (True superstar — Giannis/Curry level)
- K2 92–96 → BBGM ~70–74 (All-Star / franchise player)
- K2 87–91 → BBGM ~64–68 (Good starter / MVP candidate range)
- K2 82–86 → BBGM ~58–63 (Solid starter)
- K2 75–81 → BBGM ~50–57 (Rotation/role player)
- K2 66–74 → BBGM ~40–49 (Fringe/G-League caliber)

Salary tiers in `salaryUtils.ts` (K2 scale): ≥95 Superstar | ≥90 Star | ≥85 All-Star | ≥78 Starter | ≥72 Bench | <72 Charity

#### Rule: always document which scale a threshold uses
```ts
// WRONG — mixes scales silently:
if (player.overallRating >= 72) { /* "rotation level" — but 72 BBGM is an All-Star! */ }

// CORRECT option A — K2 comparison:
const k2Ovr = convertTo2KRating(player.overallRating, lastRating?.hgt ?? 50);
if (k2Ovr >= 72) { /* rotation-level (K2 72 = BBGM ~47) */ }

// CORRECT option B — explicit BBGM threshold:
if (player.overallRating >= 47) { /* BBGM 47 = rotation-level per BBGM docs */ }
```

Salary logic (`computeContractOffer`, `salaryUtils.ts`) uses **K2 scale** throughout — it converts via `convertTo2KRating` before all tier comparisons. External routing (`externalSigningRouter.ts`) and option-exercise logic also use K2. Do not pass raw BBGM OVR to any function that expects K2 tier thresholds.

---

### Non-Obvious Architecture Notes

- **`state.players` is the player source — always**: No component should ever try to read `team.players`. The `NBATeam` type has no such field. Players belong to `state.players` and link to their team via `player.tid`. Any feature that needs "players on team X" should filter `state.players.filter(p => p.tid === X)`. This tripped up the initial Sportsbook props build and will trip up anything else that assumes team objects carry rosters.
 
- **`getBestStat` pattern is canonical**: Whenever you need a player's current season stats, use the same two-step `AwardService` uses — `filter(s => s.season === season && !s.playoffs)` then `reduce` to the entry with the highest `gp`. Don't use `.find()` by season alone; a traded player will have two entries for the same season (one per team) and you want the one with more games. Copy `getBestStat` into any service or component that needs it rather than rolling a one-off.
 
- **`getTrb` fallback chain**: Always read rebounds as `s.trb ?? s.reb ?? ((s.orb ?? 0) + (s.drb ?? 0))`. The `trb` field is not guaranteed to be pre-computed on every stat object — some paths only populate `orb`/`drb`. The `?? 0` guards are load-bearing; without them a single undefined turns the whole expression into `NaN` which then silently poisons every downstream calculation (PPG-weighted scores, O/U lines, award race scores, all of it). Same pattern lives in `AwardService.ts` as `getTrb` — keep them in sync.
 
- **Sportsbook bet slip dedup logic**: In parlay mode, adding a new leg auto-removes any conflicting leg for the same game (moneyline) or same player + same stat category (props). The condition check is `l.gameId === leg.gameId && l.type === 'moneyline'` for game conflicts, and `l.playerId === leg.playerId && l.condition.split('_')[0] === leg.condition.split('_')[0]` for prop conflicts (e.g. `pts_over` vs `pts_under` share the `pts` prefix). If you add new prop types, make sure the condition string follows the `{stat}_{direction}` pattern so this dedup keeps working.
 
- **Sportsbook O/U line generation**: Prop lines are set to the player's season average rounded to the nearest 0.5 (`Math.round(avg * 2) / 2`). This is intentionally simple — a real book would shade the line based on matchup, rest days, home/away splits. If you ever wire in a more sophisticated model, the line generation lives in the `playerProps` useMemo in `SportsbookView.tsx`. The odds themselves (over slightly juiced, under slightly plus) simulate the asymmetry real books use on star players where the public hammers overs.
 
- **Parlay combined odds**: Decimal odds multiply cleanly — `legs.reduce((acc, l) => acc * l.odds, 1)`. A 4-leg parlay of four -110s (1.909 each) = `1.909^4 ≈ 13.3x`, which is roughly what DraftKings would pay. The payout shown in the slip is `wager * combinedOdds - wager` (profit only), matching how real slips display "to win." Don't show total return as the headline — it confuses players into thinking they're getting more than they are.
 
- **`placeBet` type field for parlays**: The existing `placeBet` signature expects `type: 'moneyline' | 'over_under'`. Parlays pass `type: 'parlay' as any` to avoid a TypeScript error without changing the shared type. If the bet resolution logic ever needs to handle parlays differently from singles (e.g. all legs must win), add `'parlay'` to the union in `types.ts` and update the resolver. For now the game doesn't auto-resolve bets, so the cast is safe.
- **`state.historicalAwards` has two coexisting schemas**: (1) BBGM format loaded at startup — `{ season, mvp: {pid,name,tid}, dpoy: {…}, finalsMvp: {…} }` — one object per season, no `type` field; (2) AutoResolver / lazySimRunner format — `{ season, type: 'MVP'|'DPOY'|'Champion'|'Runner Up'|'Finals MVP'|…, name, pid, tid }` — multiple flat objects per season, each with a `type` field. Distinguish by `!!a.type`. `LeagueHistoryView` and anything that reads `historicalAwards` must handle both. In the flat format, `pid` is the player's `internalId` (string); in BBGM format `pid` is a raw integer. When looking up a player, check `typeof pid === 'string'` to decide which field to match.
- **`NBATeam.name` already includes the city — never concatenate `region + name` for NBA teams**: `NBATeam.name` is always the full team name (e.g. `"Oklahoma City Thunder"`, `"Cleveland Cavaliers"`). `NBATeam.region` is just the city (`"Oklahoma City"`, `"Cleveland"`). Concatenating them gives `"Oklahoma City Oklahoma City Thunder"` — the bug that inspired this note. For display, just use `team.name` directly. The ONLY place `region` is needed is **two-tone typography** (gray city / colored mascot): `<span className="text-gray-400">{team.region} </span><span style={{ color: accent }}>{getTeamMascot(team.name, team.region)}</span>`. `getTeamMascot(name, region)` strips the region prefix from the full name and returns just the nickname. — **NonNBATeam is different**: Euroleague/PBA/B-League teams store city and nickname separately (`region + name`), so combining them IS correct for those leagues. The safe pattern: if the data is `NBATeam`, use `team.name`; if it's `NonNBATeam`, use `t.region ? \`${t.region} ${t.name}\` : t.name`.
- **Immediate actions** (no day advance): Register in `GameContext.tsx` before `processTurn`. Must `return` early. Examples: `STORE_PURCHASE`, `MARK_EMAIL_READ`.
- **`batch_recap` vs `daily` news**: `batch_recap` fires for 7-day lazy sim batches. Daily news fires from LLM on each turn. Tag with `newsType` accordingly.
- **`totalNetPay` in lazy sim**: Always passed as `0` during lazy sim — paychecks are now applied per-batch via `generatePaychecks`.
- **Christmas context**: Only include in LLM context if `currentDate <= Dec 25`. The `currentState.christmasGames` persists all season, so we must gate the context injection.
- **nightProfile club debuff**: `activeClubDebuffs` Map is set by `engine.ts` via `setClubDebuffs()` before each game simulation. `nightProfile.ts` reads it directly. The Map is populated from `state.pendingClubDebuff` in `simulationRunner.ts`.
- **Email vs Chat routing**: LLM `senderRole` field controls routing. `'Player' | 'Coach' | 'Agent'` → Chat. `'Owner' | 'GM' | 'Sponsor'` → Email. See `communicationHandler.ts`.
- **Events tab vs Transactions**: `history[]` entries tagged `type: 'League Event'` → EventsView (commissioner diary). Entries with trade/signing/waive text → TransactionsView. Both read from the same `state.history` array.
- **Phase-weighted season revenue**: `Dashboard.tsx` computes `seasonRevB` using `VIEWERSHIP_MEANS` from `ViewershipService`. Total weighted budget = `sum(phase.days * phaseMean)` over all season phases (~265 days total). Finals days count ~6x more than Preseason. Don't revert to simple `days/365` — it was the source of the flat-then-spike chart bug.
- **"Revenue" = "Expected Revenue"**: Labels across Finance tab and Broadcasting page deliberately say "Expected" — the sponsor system hasn't been built yet. When sponsors are added, revenue should become dynamic and the label should drop "Expected".
- **ViewershipTab Season toggle**: `timeRange` type is `7 | 30 | 90 | 'all'`. The `'all'` case skips `.slice()` entirely. Don't add a numeric "season" length constant — `'all'` is the right sentinel.
- **All-Star game score**: `exhibitionScoreMult` in `SimulatorKnobs` boosts the actual scoreboard score BEFORE stat generation. `paceMultiplier` must stay at `1.0` for All-Star — if both are > 1.0, stats will be double-boosted above the displayed score. Rising Stars uses `exhibitionScoreMult: 1.18`.
- **All-Star rotation**: `flatMinutes: true` in `KNOBS_ALL_STAR` distributes minutes by overall rating. `flatMinutesTarget: 20` → 12 players × 20 avg = 240 total minutes. Stars (~OVR 90) get ~28-30 min, role players (~OVR 78) get ~12-14 min. Don't change to `flatMinutes: false` or stars log 36+ min.
- **BoxScoreModal All-Star logos**: `renderTeamLogo(team)` helper checks `team.id < 0` (All-Star fake teams) and renders a styled blue/amber E/W badge. Wikipedia hotlinking is blocked — never use Wikipedia image URLs for logos.
- **All-Star + Playoffs in Seasonal sidebar**: Both live under the "Seasonal" nav group (not League). Don't move them back to League.
- **Seasonal actions live in SeasonalView**: `actionConfig.ts` `season: []` is intentionally empty — all seasonal actions (Celebrity, Christmas, GlobalGames, PreseasonIntl, InvitePerformance + 4 new All-Star actions) are in `SeasonalView.tsx`. Don't add seasonal items back to actionConfig.
- **Seasonal action immediate vs LLM**: `SET_DUNK_CONTESTANTS` and `SET_THREE_POINT_CONTESTANTS` are immediate (update `allStar.dunkContestContestants` / `threePointContestants` in GameContext, no ADVANCE_DAY). `RIG_ALL_STAR_VOTING` fires both an immediate state patch (updates vote counts + sets `hasRiggedVoting`) AND an `ADVANCE_DAY` call for LLM narrative.
- **Rig voting one-time gate**: `allStar.hasRiggedVoting` (boolean, set immediately in GameContext) prevents firing again. Check before enabling the Seasonal card. Rig voting is additionally gated on `allStar.startersAnnounced` — can't rig before the ballot is published.
- **Dunk contestants 2K fetch**: SeasonalView fetches the same gist URL used by Defense2KService. Extracts `attributes["Inside Scoring"]["Driving Dunk"]` and `attributes.Athleticism.Vertical`. Keys may have `+1 /  -2 ` prefixes — strip them with `.replace(/^[+-]\d+\s+/, '').trim()`. Players without 2K data still appear in the selector (shown as "no 2K data") so any active player can be picked.
- **Dunk/3PT contestant modals are always editable**: Cards are never `disabled/completed` after announcement. The modal shows an "Editing" banner when contestants already exist. The description line updates to show count (e.g. "6 contestants set — click to edit").
- **Sidebar Legacy group**: Approvals, Viewership, and Finances are now under the "Legacy" group in NavigationMenu — not in Command Center. Don't move them back.
- **Mood system — Phase 1 (drama-only)**: `src/utils/mood/` is a barrel export. `computeMoodScore(player, team, dateStr, endorsed, suspended, sabotaged)` returns `{ score, components }` — score is −10 to +10, computed fresh each call (no cached field in Phase 1). `genMoodTraits(internalId)` is deterministic (string hash). Traits are stored in `player.moodTraits?: MoodTrait[]`. `gameLogic.ts` lazily backfills traits for any player missing them on each day advance. `dramaProbability(score, traits)` outputs per-player weight for the discipline story lottery. 7 traits: 4 core personality types (DIVA=F, LOYAL=L, MERCENARY=$, COMPETITOR=W — BBGM-inspired) plus VOLATILE, AMBASSADOR, DRAMA_MAGNET.
- **FightGenerator**: `src/services/FightGenerator.ts` — base probability 0.4% per game. Weighted by both players' mood/traits. Real player propensity map matches by `player.name` substring (case-insensitive). Result stored in `GameResult.fight?: FightResult`. Engine calls `FightGenerator.generate(homeStats, awayStats, players, teams, date)` after the game sim loop. Fight story seeds injected into `actionProcessor.ts` story loop (same path as discipline/sponsor stories). Both `GameResult` interfaces must stay in sync — `src/types.ts` AND `src/services/simulation/types.ts`.
- **Raw OVR vs 2K-ified OVR**: `player.overallRating` (and `ratings[n].ovr`) is the raw BBGM-style 0–100 scale. `convertTo2KRating(ovr, hgt)` in `utils/helpers.ts` converts to approximate NBA 2K scale (~60–99 for pros). Always use `convertTo2KRating` when displaying player ratings in 2K-style contexts (Defense2KService, BadgeService, SeasonalView dunk contest). Never display raw `overallRating` as a 2K rating — the scales differ significantly (raw 70 ≈ 2K 78; raw 90 ≈ 2K 92).
- **Streak news thresholds**: Win/lose streaks fire at `[5, 7, 10, 14]` games. Streaks of 8+ use the `long_win_streak` template (more dramatic language). `streak_snapped` fires when a team had a W streak ≥5 last batch and is now on an L streak. Requires `prevTeams` arg in `generateLazySimNews`.
- **KNOBS_PRESEASON**: `SimulatorKnobs.ts` now has `KNOBS_PRESEASON` — lower efficiency (0.90), deeper rotation (13 players), lower 3PA rate (0.85x), refs let it go more (ftRateMult 0.80). Use this for preseason games instead of `KNOBS_DEFAULT`.
- **Celebrity game LLM-off fallback**: When `enableLLM: false`, `AllStarCelebrityGameSim` fills custom roster names with all-20 attributes and runs `simulateCelebrityWithGameSim`. No LLM call attempted, no crash.
- **`GameResult` lives in two files**: `src/types.ts` (used everywhere in the UI) AND `src/services/simulation/types.ts` (used by `engine.ts`). Any new field on `GameResult` must be added to BOTH files or TypeScript will error only in the engine.
- **`playerDNPs` — DNP reason stored at sim time**: `GameResult.playerDNPs` is a `Record<playerId, reason>` map populated by `engine.ts` when the game is simulated. Always prefer `result.playerDNPs[playerId]` over computing the reason from current `player.injury` — injury state changes after the game is played, so the historical reason is only accurate from the stored map.
- **`applyPlayoffLogic` in simulationHandler**: The multi-day sim loop in `simulationHandler.ts` runs `applyPlayoffLogic(state, [], ...)` BEFORE each day (injects bracket/play-in games into schedule) and `applyPlayoffLogic(state, results, ...)` AFTER (advances the bracket). This mirrors the playoff block in `gameLogic.ts` so that `SIMULATE_TO_DATE` crossing April 13–20 correctly generates and simulates play-in games. Don't remove either call.
- **Playoff games in DayView**: `DayView` renders games from `gamesForSelectedDate`, filtered from `state.schedule`. Playoff/play-in games only appear there after being injected by `PlayoffGenerator.injectPlayInGames`. With the `simulationHandler` fix, games are injected during multi-day sim. For manual day-by-day advancement, bracket injection still happens in `gameLogic.ts`.
- **All-NBA / All-Defense / All-Rookie Teams**: `AwardService.calculateAllNBATeams()` produces 3 All-NBA, 2 All-Defense, 2 All-Rookie teams using positional slots (2G, 2F, 1C). Players can only appear on one team per category (shared `globalUsed` Set across picks). Returns `AllNBATeams` type with `allNBA`, `allDefense`, `allRookie` arrays. Visible in Award Races view under the "allNBA" tab.
- **Coach of the Year**: `AwardService.calculateCOY(teams, season, staff)` scores coaches by win% + improvement over previous season. Coach name resolved via `state.staff.coaches` (matching by `team.name` or `team.abbrev`). Falls back to `"<TeamName> Head Coach"` if no staff entry found. Visible as "coy" tab in Award Races. Coach portraits fetched via `getCoachPhoto(name)` from `src/data/photos/coaches.ts` — call `fetchCoachData()` once on mount to hydrate the gist cache.
- **Staff/coach photo sources live in `src/data/photos/coaches.ts`** — Two gist endpoints: (1) `coach_photos.json` maps coach name → headshot URL; (2) `coaches_slug` maps name → team/conf/div/slug for B-Ref links. Both fetched once via `fetchCoachData()`. `getCoachPhoto(name)` returns the URL or `undefined`. Any component rendering a coach portrait MUST call `fetchCoachData()` on mount (add `useEffect(() => { fetchCoachData().then(() => setCoachPhotosReady(true)); }, [])`). The `_fetched` guard makes repeated calls no-ops.
- **`src/data/` is the home for all external/static data**: Coach photos (`data/photos/coaches.ts`), celebrity rosters (`data/celebrities.ts`), and any other gist-backed lookup tables live here. Always check `src/data/` first before searching services or components for portrait URLs or external data.
- **`src/components/shared/` is for reusable UI**: `PlayerPortrait`, `TeamDropdown`, `TabBar`, `SortableTh` are already there. Always use or extend shared components before writing inline UI in a feature component.
- **Award announcement dates**: Each award tab in `AwardRacesView` shows its announcement date (CoY=Apr 19 → MVP=May 21). Dates shown in the tab selector and in the info card header.
- **All-Star break fix**: `breakStart` changed from `allStarSunday - 3` (Thursday) to `allStarSunday - 2` (Friday). Thursday games before All-Star break now simulate normally. The break filter in `simulationRunner.ts` only activates starting Friday (Rising Stars day).
- **Seasonal sidebar badge**: `NavigationMenu` computes `seasonalBadge` — counts urgent seasonal actions (≤7 days to deadline, not completed). Checks: rig voting, celebrity roster, dunk contest, 3-point contest, injured All-Star. Badge count shown on the "Seasonal Actions" nav item.
- **Per-player minutes cap is in `initial.ts`, not `coordinated.ts`**: The hard 48-min clip in `coordinated.ts` is NOT sufficient — `initial.ts` writes `playerMinutes[i]` directly to the stat object's `min` field, and that object is what the frontend reads. The authoritative cap lives in `initial.ts` as an iterative post-normalization loop (up to 4 passes). `coordinated.ts`'s cap is a safety net only. If you modify minute allocation logic, make sure no player can leave `initial.ts` with `min > 48 + otCount * 5`.
- **Watch game = pre-simulate then playback**: When the user clicks "Watch Live" in `WatchGamePreviewModal`, `ScheduleView` immediately runs `GameSimulator.simulateGame`, dispatches `RECORD_WATCHED_GAME` + `ADVANCE_DAY`, then opens `GameSimulatorScreen` with `precomputedResult`. The watch screen only plays back the result visually. "Leave Game" / X button call `onClose()` only — no simulation or dispatch happens on leave. Never put `onComplete(result)` logic back into `doLeaveGame`; game duplication is the consequence.
- **`resolveTeam(tid)` in ScheduleView**: Non-NBA / international teams (tid ≥ 100) live in `state.nonNBATeams`, NOT `state.teams`. `getTeamForGame(tid, state.teams)` returns null for these. Any place that needs a team object for a game involving international teams must use `resolveTeam()` (checks `nonNBATeams` first, builds an `NBATeam`-shaped object). Never call `getTeamForGame` directly when tid could be ≥ 100.
- **`GamePlan.ts` is the sole source of per-game variance (nightProfile retired)**: `nightProfile.ts` is dead code. Per-slot variance is driven by three independent basketball rolls (`rollS`, `rollV`, `rollH`) producing 7 correlated multiplier arrays. All arrays normalize to mean=1.0 to preserve season averages. σ by slot: `min(0.65, 0.20 + slot*0.06)`. Club debuffs are applied post-generation in `initial.ts` by multiplying into the relevant gamePlan arrays. Do not add new variance logic back to nightProfile.
- **`fgaMult` is the attempt volume knob; `efficiencyMult` is the make-rate knob**: They are independent. A BRICKFEST night has `fgaMult=1.60` (player jacks 60% more shots) AND `efficiencyMult=0.65` (player makes far fewer per attempt). Together they produce authentic 3-for-22 lines. `fgaMult` only affects `estimatedFga`, which then flows into `threePa` and `twoPa` calculations. It does NOT affect `fgPts` or `threePm`/`twoPm` directly — makes are still anchored to `ptsTarget` via the `fgPts / 3` cap.
- **`volDecay` thresholds by raw tp**: `naturalVol` in `initial.ts` uses RAW `tp` (BBGM rating), not `tpComposite`. Thresholds: `tp>85→11, tp>70→9, tp>60→8, tp>50→6, else 4`. Every attempt above `naturalVol` costs `0.018` efficiency (down from original `0.025`). Players with tp=51-60 have naturalVol=6 and commonly shoot 8-11 3PA — previously hit 5-12% decay; now 2-7%.
- **3P% formula summary** (`initial.ts`): `threePctEffective = threePctBase * efficiencyMult * perimPenalty * knobs.efficiencyMultiplier * volDecay`. Where `threePctBase = 0.31 + (tp/100)*0.13 - tpFloorPenalty + tierEfficiencyBonus`. `tpFloorPenalty = tp<50 ? (50-tp)*0.003 : 0`. `tierEfficiencyBonus = (tp>=60 && tp<80) ? 0.025 : 0`. The `0.31` base is the primary lever for league-wide calibration.

---

### ⚠️ Draft Data Model Pitfalls (learned Apr 2026)

These bit us building the Draft Board — document them so we never repeat them.

| Pitfall | Wrong | Right |
|---------|-------|-------|
| Deceased player check | `player.born?.died` | `(player as any).diedYear` — top-level field, NOT nested inside `born` |
| Drafting team | `player.draft?.originalTid` | `player.draft?.tid` = team that made the pick; `originalTid` = team that originally owned the pick before any trade |
| External league players in draft results | Using `player.draft.year` alone | PBA (tid 2000+) and Euroleague (tid 1000+) players have real-world `draft.year` values — always filter using `nbaTids.has(p.tid)` where `nbaTids = new Set(state.teams.map(t => t.id))` |
| Draft prospects in results | Checking `draft.year` only | Draft prospects have `tid === -2`; they appear in BBGM data with `draft.year` set — exclude them from results panels |
| Duplicate picks | Treating each player row as unique | Multiple players can share the same `draft.round + draft.pick` — deduplicate by pick slot via `Map<slot, player>` keeping highest OVR |
| Historical draft accuracy | Assuming `draft.tid` matches real NBA history | Pre-sim historical data from alexnoob roster may have inaccurate `draft.tid` values for years before the simulation started — this is a data fidelity limitation, not a code bug |
| POT at draft time | `estimatePot(currentOvr, ...)` | For historical classes, find `ratings.find(r => r.season === draftYear)` and compute `draftAge = player.age - (currentYear - draftYear)` — current ratings are inflated by years of development |
| Draft board gating | Showing interactive board at all times | Gate the board: before June 25 → prospects shown as read-only scouting; on/after June 25 → interactive; after `state.draftComplete` → results only |
| Lazy sim vs commissioner draft | No conflict handling | `autoRunDraft` checks `if (state.draftComplete) return {}` — commissioner-run draft takes precedence; lazy sim only runs the draft if the commissioner hasn't done it yet |

**Key canonical checks:**
- `player.tid === -2` → future draft prospect (not yet in the league)
- `player.tid === -1` → free agent
- `(state as any).draftComplete === true` → commissioner or lazy sim ran the draft this season (cleared on rollover)
- `state.draftLotteryResult` → lottery was run this season (cleared on rollover)
- Lottery date: May 14 (`${season}-05-14`), Draft date: June 25 (`${season}-06-25`), rollover: June 30

---

# NBA Commissioner Simulator

A deep, narrative-driven NBA management game where you play as the **Commissioner of the entire NBA** — not a team. Every decision you make ripples through the league: player careers, team finances, public opinion, and your own legacy.

---

## What Makes This Game Different

You're not a GM. You're not a coach. You're the **most powerful person in basketball**. You control:

- **The entire league structure** — expansion, rules, salary cap, trade enforcement
- **Individual players** — suspensions, fines, drug tests, sabotage, hypnosis
- **Finances** — both league funds (millions) and your personal wealth
- **The narrative** — every action generates real LLM-powered news, social media reactions, and DMs

---

## Core Systems

### 🎮 Action System
Actions are the heart of the game. They're split into categories:

| Category   | Examples |
|------------|----------|
| Executive  | Force trades, set Christmas games, rig lottery, league rule changes |
| Season     | All-Star format, invite performers, watch games |
| Personal   | Dinner, travel, go to club, DM players |
| Covert     | Hypnosis, sabotage, drug tests, bribery |
| Commish Store | Buy assets, gift items to players, deploy items via LLM |

Most actions **advance the day** and trigger the LLM pipeline. A few (buy/sell in Commish Store, immediate refunds) are **instant** and don't advance the day.

### 🤖 LLM Narrative Engine
Powered by **Gemini**. Every day advance generates:
- **News headlines** (1–5 per day)
- **Social media posts** (10–20+ per day) — Woj tweets, fan reactions, player drama
- **Emails/DMs** — routed to Inbox (formal) or Chat (players/coaches/agents)
- **Stat changes** — approval ratings, league funds, personal wealth, legacy

Key LLM files:
- `src/services/llm/prompts/system.ts` — master system prompt with all rules
- `src/services/llm/prompts/simulation.ts` — `generateAdvanceDayPrompt` (main day-advance prompt)
- `src/services/llm/generators/simulation.ts` — `advanceDay()` entry point
- `src/services/llm/prompts/context.ts` — league context (top 50 players, team leadership)

The prompt includes a **SEASON CALENDAR AWARENESS** block so the LLM knows what events have passed vs. are upcoming (e.g., Christmas, All-Star, Trade Deadline, Playoffs).

### 🏀 Game Simulation Engine
Daily games are simulated via a modular stat generator:
- `src/services/simulation/StatGenerator/nightProfile.ts` — per-player per-game variance profiles
  - Named dice rolls: Disaster, Explosion, Point God, Zubac Goliath, Limbo Shooter, Passive Star, Corey Brewer 50-Bomb, Hustle God, Simmons Effect
  - Shooter roller (7 tiers) and Microwave roller (3 tiers)
  - **Club debuff** applied as night-profile multiplier penalties (not rating reduction)
  - Console logs fire for every rare roll
- `src/services/simulation/StatGenerator/initial.ts` — per-player initial stat targets using night profile
- `src/services/simulation/StatGenerator/coordinated.ts` — league-wide stat coordination
- `src/services/simulation/GameSimulator/engine.ts` — game-level simulation loop
- `src/services/logic/simulationRunner.ts` — reads `pendingClubDebuff` from state, builds Map, passes to engine
- **Commissioner rules → sim wiring:** `SimulatorKnobs.ts` knobs (pace, shot location, FT rate, blocks, efficiency) are built from `leagueStats` fields in `engine.ts`. See **[LEAGUE_RULES_README.md](./LEAGUE_RULES_README.md)** for the full step-by-step wiring guide and **[RULES_SIM_CONNECTION_PLAN.md](./RULES_SIM_CONNECTION_PLAN.md)** for the current wired vs. stored-only status of every rule.

### 💰 Economy & Finance
Two separate economies:
- **League Funds** — revenue from games, broadcasting deals, expansions (millions)
- **Personal Wealth** — used for personal actions, Commish Store purchases, gifts, bribes

The **Commish Store** (`src/components/central/view/CommishStore.tsx`) is a light-themed in-game Amazon-style store:
- Products are fetched from Amazon-style catalog via `commishStoreassets.ts`
- Buying dispatches `STORE_PURCHASE` (immediate, no day advance)
- Assets are stored in the commish's inventory
- **Asset actions** (in `AssetActionModal.tsx`):
  - **GIFT** → PersonSelectorModal → ADVANCE_DAY with LLM outcomeText
  - **DEPLOY** → textarea → ADVANCE_DAY with LLM outcomeText
  - **SELL** → 70% refund, immediate, no day advance
  - **DISCARD** → immediate remove, no day advance

### 🌙 Club Debuff System
If the commissioner visits a nightclub with players, those players get a debuff the next game:
- Severity based on club rank: `heavy` (rank ≤5), `moderate` (rank ≤15), `mild` (rank >15)
- Stored in `state.pendingClubDebuff` as `{ playerId, severity, clubName }[]`
- `simulationRunner.ts` converts it to a Map and passes to engine
- Engine calls `setClubDebuffs()` in `helpers.ts` before each game, `clearClubDebuffs()` after
- `nightProfile.ts` reads `activeClubDebuffs` and applies multiplier penalties to the final profile:
  - **heavy**: pts×0.78, eff×0.82, ballControl×0.72 (more TOs)
  - **moderate**: pts×0.88, eff×0.90
  - **mild**: pts×0.94, eff×0.96

### 📧 Inbox & Chat Routing
All LLM-generated messages are automatically routed:
- `senderRole = 'Player' | 'Coach' | 'Agent'` → **Chat** (DM style, casual)
- `senderRole = 'Owner' | 'GM' | 'Sponsor' | 'Media'` → **Email** (formal inbox)
- `communicationHandler.ts` does the routing and attaches portraits/logos

### 📅 Season Flow
The game tracks the season via date:
- `getGamePhase(date)` returns: Preseason, Opening Week, Regular Season (Early/Mid/Late), All-Star Break, Trade Deadline, Playoffs, Finals
- Season progression drives: standings, player stats accumulation, injury risk, narrative tone

---

## Project Structure

```
src/
├── components/
│   ├── actions/view/       — ActionsView, action configs
│   ├── central/view/       — NBACentral, PlayerBioView, CommishStore, TradeMachine, etc.
│   ├── commissioner/       — Dashboard, Rules, Viewership, Approvals
│   ├── inbox/              — EmailList, EmailContent, EmailEmptyState
│   ├── layout/             — MainContent.tsx (tab routing)
│   ├── modals/             — TradeMachineModal, AssetActionModal, PersonSelectorModal, etc.
│   ├── players/            — PlayersView, FreeAgentsView
│   ├── schedule/           — ScheduleView, DayView
│   ├── sidebar/            — NavigationMenu
│   └── shared/             — PlayerPortrait, TeamDropdown
├── services/
│   ├── llm/
│   │   ├── generators/     — simulation.ts (advanceDay), interaction.ts, content.ts
│   │   ├── prompts/        — system.ts, simulation.ts, context.ts, chat.ts, directMessage.ts
│   │   └── context/        — leagueSummaryService.ts
│   ├── simulation/
│   │   ├── GameSimulator/  — engine.ts
│   │   ├── StatGenerator/  — initial.ts, coordinated.ts, nightProfile.ts, helpers.ts
│   │   └── StarterService.ts, RotationService.ts, MinutesPlayedService.ts
│   └── logic/
│       ├── actions/        — clubActions.ts, tradeActions.ts, playerActions.ts, etc.
│       └── turn/           — simulationHandler.ts, communicationHandler.ts, statUpdater.ts
├── store/
│   ├── GameContext.tsx      — main state store, immediate actions, processTurn
│   └── logic/
│       ├── actionProcessor.ts — routes each action type to handler
│       └── initialization.ts  — sets up initial game state
├── types.ts                — all TypeScript types (Tab, ActionType, GameState, etc.)
└── utils/
    ├── helpers.ts          — getGamePhase, formatDate, normalizeDate
    ├── salaryUtils.ts
    ├── attendanceUtils.ts
    └── broadcastingUtils.ts
```

---

## Adding New Actions (Quick Reference)

1. Add to `ActionType` union in `types.ts`
2. Add handler in `src/store/logic/actions/` or `actionProcessor.ts`
3. If **immediate** (no day advance): add early-return handler in `GameContext.tsx` before `processTurn`
4. If **LLM-driven**: call `advanceDay(state, customAction, storySeeds, simResults, ...)`
5. Add `payload.outcomeText` — this is what the LLM narrates
6. Add UI in `src/components/actions/view/actionConfig.ts`

See `ACTIONS_README.md` for the full pipeline documentation.

See `LEAGUE_RULES_README.md` for how to wire commissioner rule toggles/sliders to the sim engine.

---

## Key State Fields

| Field | Description |
|-------|-------------|
| `state.date` | Current game date (e.g., "Feb 13, 2026") |
| `state.day` | Day number in the season |
| `state.stats.personalWealth` | Commissioner's personal funds (millions) |
| `state.stats.leagueFunds` | League treasury (millions) |
| `state.stats.publicApproval` | Fan approval (0–100) |
| `state.stats.ownerApproval` | Owner approval (0–100) |
| `state.stats.playerApproval` | Player approval (0–100) |
| `state.stats.legacy` | Long-term legacy score (0–100) |
| `state.pendingClubDebuff` | Players debuffed from last night out |
| `state.pendingHypnosis` | Active hypnosis commands for next LLM call |
| `state.inbox` | Formal emails |
| `state.chats` | DM conversations |
| `state.schedule` | Full season game schedule |
| `state.leagueStats.year` | Current NBA season year |

---

### Session Apr 8, 2026 — Playoff Engine + Award System + League History

#### All items from the Apr 8 to-do list — status:

| # | Issue | Status | Fix |
|---|-------|--------|-----|
| 1 | Feb 12 games missed by simulation | ✅ Done | `AllStarWeekendOrchestrator.getAllStarSunday()` rewrote to use `Date.UTC` throughout. Also extended break start from Feb 13 → Feb 12 so scheduler redistributes games away from that slot. |
| 2 | All-Star injury replacements in lazy sim | ✅ Done | `autoSimAllStarWeekend` pre-sim loop marks injured All-Stars `isInjuredDNP: true`, finds healthy same-conference replacements sorted by OVR. |
| 3 | Game log star icon for All-Star games | ✅ Done | `PlayerBioView.tsx` sets `isAllStar=true` + `teamAbbrev: 'ASG'` on log entries where `schedGame.isAllStar`. Renders ⭐ in rank column. |
| 4 | Play-In "? TBD" for one team in loser game | ✅ Done | `PlayoffAdvancer.resolvePlayInLoserGame()` now partially populates: team1 (loser of 7v8) set as soon as 7v8 resolves; team2 (winner of 9v10) set when 9v10 resolves. Previously required both games done. |
| 5 | Playoff cards not appearing in daily view | ✅ Done | Root cause: `simulationHandler.ts` already advances bracket per-day; `gameLogic.ts` also ran `PlayoffAdvancer.advance` → double-counted every win. Added guard: only re-advance in `gameLogic.ts` when `stateWithSim.playoffs !== state.playoffs`. |
| 6 | Simulating play-in doesn't trigger next phase | ✅ Done | Same fix as above — double-count guard. |
| 7 | "2-0 after Game 1" double-count | ✅ Done | Same fix as above. |
| 8 | Exhibition rotations in play-in/playoff games | ✅ Done | `engine.ts` — after 82 reg-season games, `gamesRemaining=0` → all teams appear "eliminated" → 12-deep rotation, 26 MPG. Added `isPlayIn || isPlayoff` branch that overrides `gbFromLeader: 0, gamesRemaining: 7` before building knobs. |
| 9 | Incorrect seeding when advancing rounds 2+ | ✅ Done | `PlayoffGenerator.buildNextRound()` hardcoded `higherSeed: 1, lowerSeed: 2`. Added `getWinnerSeed()` helper that looks up original seed from `prevSeries`. |
| 10 | Series score vertically stacked + remove "View Box Score" | ✅ Done | `SeriesDetailPanel.tsx` replaced horizontal "1 — 4" with two stacked team rows. `SeriesActionMenu.tsx` removed "View Box Score" button. |
| 11 | Award announcements in league news | ✅ Done | `autoAnnounceAwards` auto-resolver fires April 13. Calculates MVP/DPOY/ROY/SMOY/MIP/All-NBA winners, stores in `state.historicalAwards[]`, updates `player.awards[]`, generates `award_mvp` / `award_dpoy` / `award_roty` / `award_allnba` news items. |
| 12 | Regular-season templates deactivate in playoffs (news) | ✅ Done | `lazySimNewsGenerator.ts` accepts `playoffs?` param. Drama suppressed; standings fallback replaced with active series status during playoffs. |
| 13 | Staggered award announcement dates | ✅ Done | 7 separate auto-resolvers: COY Apr 19, SMOY Apr 22, MIP Apr 25, DPOY Apr 28, ROY May 2, All-NBA May 7, MVP May 21. Each is idempotent (checks `historicalAwards` before running). Award Races UI shows "Projected Winner" / "Winner" per tab independently. |
| 14 | League news: playoff advances, eliminations, Finals MVP, championship | ✅ Done | `lazySimRunner.ts` `generatePlayoffSeriesNews()` detects newly-completed series each batch → fires `playoff_series_win`, `playoff_elimination`, `nba_champion`, `finals_mvp` news. Championship winner + Finals MVP stored in `historicalAwards`. |
| 15 | Playoff-aware social feed (series leads, WCF/ECF/Finals context) | ✅ Done | `SocialEngine.generatePlayoffPosts()` fires for every playoff game. Posts: official series score (NBA Official), series lead / tied reactions (NBA Central), top performer shoutouts (Legion Hoops / Hoop Central), series-clinching / elimination posts, "one away" dramatic moments. Regular-season social templates remain active alongside. |

#### New features added this session:

| Feature | Files | Notes |
|---------|-------|-------|
| `historicalAwards` state field | `src/types.ts` | `HistoricalAward { season, type, name, pid?, tid? }`. Authoritative store for past award winners. |
| `LeagueHistoryView` | `src/components/central/view/LeagueHistoryView.tsx` | Per-season table: Champion, Runner Up, Finals MVP, MVP, **COY**, DPOY, SMOY, MIP, ROY. Current season always shown as top row with "NOW" badge and TBA cells. Clicking any season opens `LeagueHistoryDetailView`. Sources `historicalAwards[]` first, falls back to `player.awards[]`. Accessible via Analytics → League History. |
| `LeagueHistoryDetailView` | `src/components/central/view/LeagueHistoryDetailView.tsx` | Per-season detail page. Sections: Champion hero (logo + Finals MVP), Season Awards grid (MVP/DPOY/COY/SMOY/MIP/ROY/Finals MVP with player portraits + PPG/RPG/APG stat line), All-NBA First Team gallery, All-Stars roster (East/West, current season only), Stat Leaders in 6 categories (PPG/RPG/APG/SPG/BPG/3PM, top 5, computed from `player.stats[]`). |
| Award Races "Winner" / "Projected Winner" label | `src/components/view/AwardRacesView.tsx` | Each tab independently checks `historicalAwards` for its own award. Shows "Projected Winner" (indigo) before announcement date, "Winner" (amber) after. |
| 65-Game Rule (real NBA) | `src/services/logic/AwardService.ts` | Hard minimum at season end, proportional mid-season. Injury exception: `minGames - 3` with active injury qualifies. Commissioner-configurable via `leagueStats.minGamesRequirement`. |
| 7 staggered award resolvers | `src/services/logic/autoResolvers.ts` + `lazySimRunner.ts` | COY Apr 19 → SMOY Apr 22 → MIP Apr 25 → DPOY Apr 28 → ROY May 2 → All-NBA May 7 → MVP May 21. Each is idempotent. |
| 7 new news template categories | `src/services/news/newsTemplates.ts` | `award_mvp`, `award_dpoy`, `award_roty`, `award_allnba`, `award_smoy`, `award_mip`, `award_coy` |
| Playoff social posts | `src/services/social/SocialEngine.ts` | `generatePlayoffPosts()` fires for every playoff game result. Official scoreline (NBA Official), series lead/tied reactions (NBA Central), performer callouts (Legion Hoops / Hoop Central), series-clinching posts, elimination posts, "one win away" dramatic moments. |
| NBA Official multi-player "FINAL SCORES" template | `src/services/social/templates/nbaOfficial.ts` | `nba_final_scores_multi` — fires once per game (home ctx only). "🏀 DAY'S FINAL SCORES 🏀" format: star headline + win streak (if 3+) + 3-4 performer stat lines. Career-high flag when `pts ≥ 30` and new career best. |
| NBA Official seeding clinch template | `src/services/social/templates/nbaOfficial.ts` | `nba_clinch_seeding` — fires when winning team has `clinchedPlayoffs` set. Describes what was clinched (#1 seed / top-2 / playoff spot / play-in spot). Priority 102. |
| `LeagueHistoryDetailView` | `src/components/central/view/LeagueHistoryDetailView.tsx` | Per-season detail: Champion hero (logo + Finals MVP), Awards grid (7 awards with player portraits + stat lines), All-NBA First Team gallery, All-Stars East/West (current season), Stat Leaders 6 categories (PPG/RPG/APG/SPG/BPG/3PM top 5 computed from `player.stats[]`). |

#### Architecture notes (Apr 8):

- **`historicalAwards` vs `player.awards`** — `historicalAwards` is the new authoritative source for current-season winners (set by `autoAnnounceAwards`). `player.awards[]` contains normalized strings like "Most Valuable Player" for voter fatigue calculations. Both coexist; `LeagueHistoryView` checks `historicalAwards` first.
- **Finals MVP timing** — determined in `lazySimRunner.ts` when `bracket.bracketComplete` flips. Uses highest `gameScore` from the championship-winning batch (approximation, since we don't have series-long playoff stats isolated at that moment).
- **Award announcement dates** — 7 separate auto-resolvers fire on their real NBA dates (COY Apr 19 → MVP May 21). Each checks `historicalAwards` for idempotency. `AwardRacesView.tsx` `AWARD_DATES` shows these same dates in the UI tab bar.
- **PlayoffAdvancer double-count guard** — Never re-advance the bracket in `gameLogic.ts` if `stateWithSim.playoffs !== state.playoffs`. The `simulationHandler.ts` already runs `applyPlayoffLogic` per-day.
- **standingsProfile "eliminated" trap** — Any team with `gbFromLeader > gamesRemaining` gets 12-man roster + 26 MPG. After 82 games, every non-#1 team hits this. Always override `isPlayIn || isPlayoff` before building knobs.
- **`autoAnnounceAllNBA` now stores all 9 award types** — All-NBA 1st/2nd/3rd (15 entries), All-Defensive 1st/2nd (10 entries), All-Rookie 1st/2nd (10 entries). All written into `historicalAwards` in a single resolver call so idempotency check (`'All-NBA First Team'` already stored) covers the whole batch.
- **`LeagueHistoryDetailView` stat rebound fix** — Season stats in `player.stats[]` may use `reb` (game-level field) OR `trb` (post-processor output) depending on whether the row came from the simulator or from a roster import. Always use `getStatValue(stat, 'REB')` from `statUtils.ts` which handles the `trb || reb || orb+drb` fallback chain.
- **`PlayerPortrait` OVR badge is current-season data** — For historical season detail views, never pass `overallRating` to `PlayerPortrait`. The badge would show the player's *current* OVR, not their rating during the displayed season. Use `MiniPortrait` (photo + team badge only) for any historical context.
- **COY award has no `pid`** — COY is stored as `{ type: 'COY', name: coachName, tid: teamId }` with no `pid`. Resolve it via `tid` → team record; display team logo + W-L instead of a player portrait.

---

#### BBGM architecture lessons (from reference files Apr 8):

- **`idb.getCopy.playersPlus`** — BBGM's player enrichment pipeline (attrs + ratings + stats). Used as reference for multi-season stat/rating hydration. Our equivalent is reading `player.stats[]` directly since we don't have a DB layer.
- **`mergeByPk` + cache/league split** — BBGM separates hot data (IndexedDB cache) from cold data (IndexedDB league store) and merges them per-request. We use a single in-memory Redux-style `GameState`. Good to know for when we add IndexedDB persistence.
- **`getTeamInfoBySeason`** — BBGM has per-season team metadata (abbrev, colors) since teams can relocate. Our teams are static objects. For multi-season, we'll need `team.seasons[].abbrev` stored so historical views show the right city.
- **`fixRatingsStatsAbbrevs`** — Retroactively patches team abbrev on all stat/rating rows after a team relocation. Worth keeping in mind for our multi-season `ADVANCE_SEASON` rollover.
- **`playersPlus` career stats** — BBGM computes `careerStats`, `careerStatsCombined`, `careerStatsPlayoffs` on the fly by summing per-season rows. Our `computeCareerStats(player)` util (planned in `multiseason_todo.md §6`) should follow the same pattern: sum totals, then derive per-game averages.
- **`p.stats.filter(row => row.gp > 0)`** — BBGM always filters zero-GP rows before exposing stats. We should do the same in any stat-aggregation utility to avoid dividing by zero.
- **Per-season `AwardsAndChamp` layout** — Champion + Finals MVP hero → Best Record (by conf) → MVP → DPOY/SMOY/MIP/ROY → All-League/All-Defensive/All-Rookie. This is the canonical BBGM history layout; our `LeagueHistoryDetailView` mirrors it.
- **`groupAwards` for player profiles** — BBGM groups `player.awards[]` by type and counts them ("3× MVP (2022, 2024, 2026)"). Our `PlayerBioView` already does this in a simpler way; formalize when building player profile pages.

---

#### Session Apr 12 2026 — Fixes:

| Fix | Files | Notes |
|-----|-------|-------|
| **WNBA/external roster FA leak** | `src/services/logic/seasonRollover.ts` | Added `EXTERNAL_LEAGUES` guard in contract-expiry loop. Players with status `WNBA / Euroleague / PBA / B-League / G-League / Endesa` now skip contract expiry entirely — they just age, roster stays frozen. Without this, any WNBA player whose BBGM contract year expired was converted to `tid:-1, status:'Free Agent'` and immediately picked up by `runAIFreeAgencyRound`. |
| **PlayerStatsView — players disappear after contract expires** | `src/components/central/view/PlayerStatsView.tsx` | Pre-filter used `player.tid` (current tid = -1 after expiry) for team filter, hiding any player whose contract expired. Fix: active NBA players (`tid > 0`) still pre-filtered; FA/expired players pass through and are filtered at the stats-record level using `agg.tid` (the team they actually played for). |
| **DraftSimulatorView crash — leagueYear before initialization** | `src/components/draft/DraftSimulatorView.tsx` | `leagueYear` was declared inside the component body after the `allProspects` useMemo that referenced it, causing a TDZ error. Moved the entire date-gating block (`leagueYear`, `draftDate`, `today`, `isDraftTime`, `isDraftDone`) above `allProspects`. Removed the duplicate block. |

---

*Lead the league. Build your legacy. Become the ultimate NBA Commissioner.*

Basketball GM (BBGM) Data Architecture

If you are building a custom UI, parsing export files, or writing mods for Basketball GM, it is crucial to understand how the engine structures and stores its data. BBGM operates heavily on JSON-like document stores (via IndexedDB in the browser).

1. Historical Awards & Records (The "Gotcha")

A common mistake when parsing BBGM data is assuming awards are stored as a flat list of individual trophies (e.g., [{type: "MVP"}, {type: "DPOY"}]).

Instead, BBGM stores one single master object per season in the awards store.

Individual Awards are keys on this season object (mvp, dpoy, roy, finalsMvp).

Team Awards (All-League, All-Defensive) are nested arrays of objects.

Champions are not explicitly stored in the awards table. To find the champion, you must query the playoffSeries store for the current season or check a team's playoffRoundsWon attribute.

code
JSON
download
content_copy
expand_less
// Example of BBGM Awards Data Structure
{
  "season": 2024,
  "mvp": { "pid": 57, "name": "Nikola Jokic", "tid": 7 },
  "allLeague": [
    { "title": "First Team", "players": [{ "pid": 57, "name": "Nikola Jokic" }, ...] },
    { "title": "Second Team", "players": [...] }
  ]
}

(Note: Coach of the Year (COY) is not natively tracked or calculated by the BBGM engine).

2. Player History & Progression

BBGM does not maintain separate SQL-like tables for "Player Stats" and "Player Ratings". All historical data is embedded directly inside the Player Object.

player.stats: An array where each entry represents a stint with a team in a specific season. If a player is traded mid-season, they will have multiple entries for that year, plus an invisible "Total" row (usually tid = -1 or -2).

player.ratings: An array capturing the player's attributes (Speed, 3PT, OVR, POT) for every season. Player development (progression/regression) happens during the Preseason phase and appends a new row here.

3. The Simulation Engine (GameSim)

The actual "gameplay" math is separated from the database writing.

Math & Rules: worker/core/GameSim.basketball/index.ts dictates shot probabilities, synergy logic, foul rates, and substitution AI. It generates an in-memory box score and Play-by-Play text.

Persistence: Once the simulation finishes, writeGameStats.ts, writePlayerStats.ts, and writeTeamStats.ts are responsible for taking the simulation results and saving them permanently to the DB (updating records, applying injuries, calculating finances).

4. Real-World NBA History (realRosters)

When starting a "Real Players" league, the game does not simulate past seasons. Instead, it injects history via specific loader files:

getAwards.ts: Maps historical MVPs, Champions, and Rookies of the Year to their BBGM slug (unique real-player ID).

addSeasonInfoToTeams.ts: Handles franchise timelines (e.g., Seattle SuperSonics becoming the OKC Thunder, mapping old abbreviations to modern ones).

formatPlayerFactory.ts: The translation layer that converts real-life box score averages (e.g., 27 PPG, 7 RPG) into BBGM's 0-100 internal rating scales.

5. The State Machine (Phases)

The league's timeline is governed by the phase system. The most critical transitions happen here:

Preseason (Phase 1): The "Reset". Ages increment, ratings develop/regress, team records reset to 0-0, and the new schedule is generated.

Regular Season (Phase 2): Games are played, stats accumulate.

Playoffs (Phase 3): Bracket logic, Series MVPs, and Championship crowning.

---

## Stats & Data Hubs (Quick Reference for Feature Work)

This section maps out where stats and data live so you can jump straight to the right file.

### Per-Game Advanced Stats Pipeline

```
advancedstats.ts          ← Compute per-game advanced stats from box score rows
  └→ engine.ts            ← Assign computed stats to homeStatsFinal / awayStatsFinal
       └→ postProcessor.ts ← Accumulate game stats into player.stats[] (season totals)
```

**Key files:**
| File | Role |
|------|------|
| `src/services/simulation/GameSimulator/advancedstats.ts` | Computes PER, EWA, TS%, ORB%, DRB%, TRB%, AST%, STL%, BLK%, TOV%, USG%, OWS, DWS, OBPM, DBPM per game |
| `src/services/simulation/GameSimulator/engine.ts` | Runs game sim; assigns advanced stats to `homeStatsFinal[i]` / `awayStatsFinal[i]` (look for the `Object.assign` block) |
| `src/store/logic/turn/postProcessor.ts` | After each game, accumulates per-game box score rows into `player.stats[]` season totals. Also initializes new season entries with zeroed fields. |

**Fields on `NBAGMStat` (types.ts) worth knowing:**
- `per`, `tsPct`, `efgPct`, `usgPct`, `ortg`, `drtg`, `bpm`, `obpm`, `dbpm`
- `ws`, `ows`, `dws`, `ewa`, `vorp`
- `orbPct`, `drbPct`, `rebPct`, `astPct`, `stlPct`, `blkPct`, `tovPct`

### Where Stats Are Displayed

| View | File | Notes |
|------|------|-------|
| Player bio stats history | `PlayerBioStatsHistory.tsx` | Per-season table + advanced tab, reads `player.stats[]` |
| League-wide player stats | `PlayerStatsView.tsx` | Sortable table, all BBGM advanced cols, bref career row fallback |
| Team stats (feats, opp) | `TeamStatsView.tsx` | DD/TD/QD/5x5 are integer totals (not per-game) |
| Award races | `AwardRacesView.tsx` | Reads `player.stats[]` directly; uses `getBestStat()` helper |
| League leaders | `LeagueLeadersView.tsx` | Reads `player.stats[]` directly |

### Player Bio View Architecture

The player bio view (`PlayerBioView.tsx`) is now split into dedicated tab files:

| Tab | File |
|-----|------|
| Overview (bio text) | `PlayerBioOverviewTab.tsx` |
| Ratings / Progression | `PlayerBioRatingsTab.tsx` |
| Game Log | `PlayerBioGameLogTab.tsx` |
| Historical Stats | `PlayerBioStatsHistory.tsx` |
| Awards | `AwardsView.tsx` |

### Staff / Coach Data

Coaches are loaded from an external gist via `staffService.ts`. Two data formats exist:
- **Legacy format:** `c.team` holds the team name/abbrev
- **New gist format:** `c.position` holds the team name (e.g. `"Atlanta Hawks"`)

`AwardService.ts` COY lookup checks **both** `c.team` and `c.position` when finding a coach for a team.

### Draft Pick Schema

`DraftPick` has: `dpid`, `tid` (current owner), `originalTid`, `season`, `round`. In `TradeMachineModal.tsx`, picks are grouped by season for display. See `project_draft_picks_schema.md` in memory.

Draft & Free Agency (Phases 4-6): Players retire, rookies are generated via genPlayers.ts, and AI teams manage their salary caps to sign free agents.

---

### Session Apr 17, 2026 — Sessions 21–22

#### Bugs Fixed:
| Bug | Fix | Files |
|-----|-----|-------|
| Next season unplayable (schedule ends at Sep) | `lazySimRunner` now calls `applySeasonRollover` when crossing Jun 30; `schedule: []` clears old games; `autoGenerateSchedule` guard scoped to current season dates | `lazySimRunner.ts`, `seasonRollover.ts`, `autoResolvers.ts` |
| No FA/trade activity in offseason | Root cause was rollover never firing in lazy sim — same fix as above | `lazySimRunner.ts` |
| Player option news/history missing | `seasonRollover.ts` writes `playerOptionHistory[]` + `playerOptionNewsItems[]`; corrected wording "exercised → declined" for opt-out | `seasonRollover.ts` |
| "Left early" for healthy players | `engine.ts` only adds to `playerInGameInjuries` when `gamesRemaining > 0` | `engine.ts` |
| TradeProposals shows "AI GM" | `getGMName()` helper looks up `state.staff.gms` by team name/city/abbrev | `AITradeHandler.ts` |
| Commissioner signing missing contractYears | `handleSignFreeAgent` now builds `contractYears[]` | `playerActions.ts` |
| AI extension/signing salary not synced to PlayerBioView | Mid-season extensions, season-end extensions, and FA signings now all build `contractYears[]` preserving historical rows | `simulationHandler.ts` |
| ImageGen fires when AI disabled | `photoEnricher.ts` checks `enableLLM` before AI fallback paths | `photoEnricher.ts` |
| POT mismatch in Draft Board vs other views | Draft board was using stale `lastRatings.ovr` instead of `p.overallRating`; age calc now uses `born.year` relative to sim year — matches `PlayerBiosView` exactly | `DraftHistoryView.tsx`, `PlayerRatingsModal.tsx` |

#### Features Added:
| Feature | Details | Files |
|---------|---------|-------|
| Simulate-to-Date routing | >30 days → `runLazySim` (progress overlay); ≤30 days → `processTurn` (game results modal) | `GameContext.tsx` |
| TransactionsView signing cards clickable | Card row navigates to PlayerBioView; "View Profile →" hint on hover | `TransactionsView.tsx` |
| FAME trait + market size morale rework | All players get base market tier bonus (High+2/Mid+1/Low+0); FAME doubles; win cap raised to +5 | `moodScore.ts`, `moodTypes.ts`, `PlayerBioMoraleTab.tsx` |
| G-League filter options | "G-League Assignment" and "G-League Callup" in Transaction Type dropdown | `TransactionsView.tsx` |
| Training camp roster cut | Oct+ trim releases players to FA with `'Training Camp Release'` type; Jul-Sep assigns to G-League | `simulationHandler.ts`, `TransactionsView.tsx`, `LeagueEvent.tsx` |
| Draft History View (separated from Draft Simulator) | `DraftHistoryView.tsx` — standalone view; `MainContent` shows simulator only on draft day, otherwise draft history | `DraftHistoryView.tsx`, `DraftSimulatorView.tsx`, `MainContent.tsx` |

#### Investigation Findings:
- `runSimulation` in `simulationHandler.ts` handles playoff logic per-day inside its loop — short-skip ≤30 day `SIMULATE_TO_DATE` fires calendar events via the post-sim auto-resolver loop
- `contractYears[]` must be built on EVERY signing/extension path — `contract.amount` alone only updates TeamFinances; `PlayerBioContractTab` reads `contractYears[]` exclusively when it exists (Path A)
- `estimatePot` formula must use `p.overallRating` (updated by ProgressionEngine) NOT `lastRatings.ovr` (stale ratings array entry); age must come from `born.year - simYear` not `p.age` for consistency

---

## Biggest Pitfalls & Lessons Learned (Dev Guide)

### 1. Simulation Architecture — The One Ring
**Before session 22:** Three separate simulation paths (`processTurn` for ADVANCE_DAY, `processTurn` for SIMULATE_TO_DATE, `runLazySim` for LOAD_GAME). Events fired at different times, causing playoffs/awards/All-Star to be skipped depending on which path was used.

**After session 22:** `runLazySim` is the single engine for ALL multi-day advances. `processTurn` only handles single-day ADVANCE_DAY.

**Rule:** If you need to add a new calendar event (new award, new phase gate), add it to `buildAutoResolveEvents()` in `lazySimRunner.ts`. It automatically fires at the right date in every sim path. Never add event logic directly to `processTurn` or `gameLogic.ts`.

### 2. contractYears[] Must Be Built on EVERY Signing Path
`TeamFinancesViewDetailed` reads `contract.amount` (BBGM thousands). But `PlayerBioContractTab` reads `contractYears[]` (per-year breakdowns from gist). If you update `contract.amount` without building `contractYears[]`, TeamFinances shows the new salary but PlayerBioView shows the old one.

**There are 4 signing paths** — all must build `contractYears[]`:
1. AI FA signing (`simulationHandler.ts` ~line 580)
2. AI mid-season extension (`simulationHandler.ts` ~line 320)
3. AI season-end extension (`simulationHandler.ts` ~line 390)
4. Commissioner signing (`playerActions.ts` `handleSignFreeAgent`)

**Critical:** When building new `contractYears[]`, preserve historical rows (`existingPast` filter keeps `yr < currentYear`) so career history from the gist isn't lost.

### 3. overallRating vs ratings[].ovr
`player.overallRating` is updated by `ProgressionEngine` every season — it's the authoritative current OVR. `player.ratings[last].ovr` is the raw BBGM value from the ratings array which can be stale (especially after progression runs).

**Rule:** Always use `p.overallRating` for OVR. Use `ratings[last].hgt` and `ratings[last].tp` for height/three-point (these don't change). Never use `ratings[last].ovr` as the primary OVR source.

### 4. Age Calculation
Use `player.born.year` relative to the game's `state.leagueStats.year` (or `simYear`), NOT `player.age` (can be stale) or `new Date().getFullYear()` (real-world clock, wrong in simulation). The canonical pattern:
```ts
const age = p.born?.year ? simYear - p.born.year : (typeof p.age === 'number' ? p.age : 25);
```

### 5. SimulatorKnobs Are Per-Team
International preseason games must use different knobs for each team. The NBA team gets `KNOBS_PRESEASON`, the international team gets their league-specific knobs (KNOBS_PBA, KNOBS_BLEAGUE, etc.). Setting `homeKnobs = awayKnobs = intlKnobs` makes both teams play at the same reduced level.

### 6. Auto-Resolver Idempotency
All resolvers in `buildAutoResolveEvents()` must be idempotent. `ADVANCE_DAY` fires events with `event.date >= simStartNorm` (inclusive), so the same event can be checked multiple days in a row. Resolvers guard with checks like:
- `if (historicalAwards.some(a => a.type === type && a.season === season)) return {};`
- `if (state.draftLotteryResult) return {};`
- `if (hasRegularSeason) return {};`

### 7. Minutes Allocation
`MinutesPlayedService.allocateMinutes` caps individual player minutes at ~40-42 min (regular season) or ~44-46 min (playoffs) with random jitter to avoid robotic "42:00" lines. The `isPlayoffs` flag on `SimulatorKnobs` controls this — set by `engine.ts` when `game.isPlayIn || game.isPlayoff`.

### 8. External League Routing
`externalSigningRouter.ts` routes unsigned FAs to overseas leagues. Two critical guards:
- **Top 30 K2≥70 + top 30 K2 60-69 always kept as NBA FAs** (prevents roster stagnation)
- **Fallback chain must NOT skip the target league** — if B-League has 0 teams loaded (gist 404), the fallback tries all leagues in order without skipping

### 9. G-League Assignment Timing
The DNP-based G-League assignment in `simulationHandler.ts` reads from `allSimResults` (box scores from the current batch), not from `player.stats[]` (which isn't updated until `postProcessor` runs after the sim loop). If you only check `p.stats[].gp`, it's always stale during the sim loop.

### 10. Season Rollover in Lazy Sim
`lazySimRunner` must call `applySeasonRollover` when the date crosses Jun 30. Without this, `leagueStats.year` stays frozen, no new schedule generates, FA/trade activity stops, and season 2+ is unplayable. The rollover clears `schedule: []`, advances the year, resolves player/team options, and prunes old data.

### 11. Rollover Must Reset ALL Team State
At rollover, `seasonRollover.ts` must reset on every team object:
- `wins: 0, losses: 0` — or standings carry last season's records
- `streak: { type: 'W', count: 0 }` — or "rock bottom" news fires after first loss in new season
- Archive completed season to `team.seasons[]` before zeroing

### 12. Batch Size Near Jun 30
`lazySimRunner` uses `batchSize=1` when within 5 days of Jun 30 (`nearRollover` guard). Without this, a 7-day batch crossing Jun 30 would sim July 1-5 with the OLD schedule before rollover fires, causing ghost games in July.

### 13. G-League Assignment Grace Period
Don't auto-assign newly traded/signed players to G-League. Check `yearsWithTeam === 0 && teamGP < 14` — gives the player 14 team games to earn playing time before the DNP trigger fires. Without this, traded players get immediately sent down and recalled in a loop.

### 15. Dead Money Display (Luol Deng Rule)
Waived/bought-out players with remaining guaranteed salary should appear in `TeamFinancesViewDetailed` as a grayed-out row with dashed border — still counted in cap payroll but visually distinct from active roster. The `deadContracts[]` array on team state stores `{ playerName, amount, expYear }`. These rows should have a "WAIVED" label badge and reduced opacity so they don't look like active players.

### 17. Training Camp Shuffle (trainingCampShuffle.ts)
At Oct 1 each season, every active player (all leagues) is assigned to one of three buckets:
- **1/3 Progress** — all 14 attrs get +2 to +4 (subtle improvement, "came into camp in the best shape of his life")
- **1/3 Stale** — no change
- **1/3 Regress** — all 14 attrs get -2 to -3 ("lost a step over the summer")

This is a **flat 1/3 split regardless of age** — age-based decline is handled separately by Father Time, bust lottery, and washed algorithm. The camp shuffle creates roster variability so each season feels different.

Changes are **gradual** (MARK at Oct 1, RESOLVE daily Oct 1-23) so roster cuts during preseason are informed by training camp performance. Players who regressed in camp are more likely to be cut.

### 16. Preseason Self-Scrimmages Are Intentional
Game logs may show "DET @ DET W, 161-118" during preseason — this is an **intrasquad scrimmage**, not a bug. NBA teams hold these during training camp. The schedule generator creates them by design. Players on the game log who show a different team (e.g. GSW playing on Oct 11, traded to DET on Oct 13) is correct historical accuracy — they WERE on that team at game time.

### 14. safeSchedule Guard After Rollover
The defensive `safeSchedule` check in `lazySimRunner.ts` (`stateWithSim.schedule.length === 0 && state.schedule.length > 0`) must NOT restore the old schedule when the year just advanced. Check `yearAdvanced` flag — if the year changed, the empty schedule is intentional (rollover cleared it).