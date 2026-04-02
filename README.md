## Developer Docs

| Doc | What it covers |
|-----|----------------|
| [EVENTS_README.md](./EVENTS_README.md) | Full event pipeline — actions → social posts → news feed → UI |
| [SOCIAL_README.md](./SOCIAL_README.md) | Social feed deep-dive — handles, templates, SocialEngine, Charania builders |
| [NEWS_README.md](./NEWS_README.md) | News feed deep-dive — NewsItem type, NewsGenerator, lazySimNewsGenerator 5 passes, NewsFeed.tsx anatomy, photo enrichment, knowledge gaps |

---

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Run: `npm run dev`

> **No API keys needed on the client.** All LLM calls route through Cloudflare Workers (Groq for chat, Together AI for everything else). Keys live on the workers, not in `.env.local`. Any reference to `GEMINI_API_KEY` or `GoogleGenAI` in this codebase is legacy/broken — use `generateContentWithRetry` from `src/services/llm/utils/api.ts`.

---

## NBA 2K Data Sources

Gist-backed data files fetched once per session (cached in memory):

| File | Gist | Used by |
|------|------|---------|
| `NBA2kBadges.ts` | `aljohnpolyglot/e7b25218…` — player badge tiers (HOF/Gold/Silver/Bronze) | `badgeService.ts` → live game commentary, dunk contest sim |
| `NBA2kRatings.ts` | `aljohnpolyglot/10016f08…` — full NBA 2K26 attribute ratings per team/player | `Defense2KService.ts` (team defense weighting), `DunkContestModal.tsx` (dunk/vertical scores) |
| `injuryService.ts` | `aljohnpolyglot/nba-store-data/nbainjurieslist` — 100+ injury types with real historical frequency + avg games missed | `InjurySystem.ts` (injury selection), `PersonSelectorModal.tsx` (manual injury picker UI) |
| `playerInjuryData.ts` | `aljohnpolyglot/nba-store-data/nbainjuriesdata` — per-player career injury history: total count + body part breakdown | `InjurySystem.ts` → durability multiplier + body-part weighted injury selection |

`NBA2kBadges.ts` exports `loadBadges()` + `getBadgeProb(player, badge, baseProb)` — badge tier multiplies the base probability (HOF ×1.5, Gold ×1.2, Silver ×1.0, Bronze ×0.6, none → 0).

`NBA2kRatings.ts` exports `loadRatings()` + `getRawTeams()` — consumers call `await loadRatings()` then `getRawTeams()` and parse the attributes they need.

`injuryService.ts` exports `fetchInjuryData()` + `getInjuries()` — call fetch at app startup (App.tsx), then use `getInjuries()` synchronously anywhere. No local fallback — if the gist is unreachable, `getInjuries()` returns `[]`. `src/data/injuries.ts` has been deleted; the gist is the only source.

`playerInjuryData.ts` exports `fetchPlayerInjuryData()` + `getPlayerInjuryProfile(name)` + `get2KExplosiveness(name, pos)`. Profile lookup does exact normalized match first, then last-name+first-initial fallback. `normalizeBodyPart(raw)` collapses messy gist keys into canonical buckets (ankle, knee, foot, achilles, groin, etc.).

---

## 📓 Developer Diary (Notes)

**This README is a living document.** If you discover something surprising, fix a tricky bug, or notice something non-obvious about this codebase. Think of it as a dev diary — not just architecture docs.

### Discovered Bugs & Fixes Log

| Date | Issue | Fix |
|------|-------|-----|
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
| Mar 2026 | LLM echoed payload outcomeText verbatim in news/social/emails | `simulation.ts` instruction #2 + `isSpecificEvent` block + `system.ts` line 94 reworded: `outcomeText` is now an "event hint" (factual context only). LLM writes its own response `outcomeText`; all content (news, @Shams tweets, fan posts, emails) must use authentic voices — never copy the hint verbatim. |
| Mar 2026 | Dinner action excluded referees | Added `includesRefs: true` to `dinner` eligibility in `personActionDefs.ts`. Refs now appear alongside players and league office staff. |
| Mar 2026 | SIMULATE_TO_DATE crossing Apr 13–20 didn't generate/simulate play-in | `runSimulation` day loop in `simulationHandler.ts` didn't run bracket injection (that happened in `gameLogic.ts` after the loop returned). Fixed by extracting `applyPlayoffLogic()` and calling it BEFORE each day (inject games) and AFTER (advance bracket). `gameLogic.ts` now prefers `stateWithSim.playoffs` over `state.playoffs` to prevent double-generation. |
| Apr 2026 | Shams/news spamming same injury every batch | Injury news IDs now stable: `news-injury-${playerId}-${injuryType}`. Section 4 of `lazySimNewsGenerator` only processes players in `allSimResults.injuries` (newly injured this batch) — pre-existing BBGM injuries never appear in sim results so they're silently skipped. Shams posts use stable ID `shams-injury-${playerId}-${injuryType}` deduplicated by `existingPostIds`. |
| Apr 2026 | Imagn photo enrichment broken (complex caption/subject matching failing) | `enrichNewsWithPhoto` rewrote to: flatten all fetched photos into one pool, pick by `seed % min(poolSize,10)` where seed = article ID char sum — deterministic so same article always gets same photo, but simple enough to never fail. Removed `pickBestPhoto`/`isSubjectOfCaption` from news path. |
| Apr 2026 | Team home page had no team-specific news | Added `teamNews` useMemo in `TeamDetailView.tsx` — filters `state.news` by team name mention, player last name mention, or `gameId`/`homeTeamId`/`awayTeamId` match. Rendered as a "Team News" section (with thumbnail + headline + date) between Schedule and Roster. |
| Apr 2026 | Top Stories sidebar showed stale all-time high-impact items | Replaced with last-7-days window sorted by `gameScore` of top performer in linked game — surfaces the craziest recent performances instead of oldest `isNew` items. |
| Mar 2026 | `state.bets` grew unbounded — no archival for resolved bets | After `resolveBets()` in `gameLogic.ts`: keep all `pending` + 50 most-recent resolved (sorted by date desc). Older resolved bets pruned each turn. |
| Mar 2026 | RealStern `monthlyPassive` income was cosmetic only | `gameLogic.ts`: `monthlyPassive = inventory.reduce(price × 0.004)` applied as ghost `personalWealth` addition per turn (`monthlyPassive × daysToAdvance / 30 / 1M`). Same in `lazySimRunner.ts` per batch. Payslip unchanged — shows league salary only. |
| Mar 2026 | Sportsbook wager showed $100M when entering 100 | `formatCurrency(wager)` treated wager as millions. Fixed: `formatCurrency(wager, false)`. Validation: `wager > personalWealth * 1_000_000`. Input uses string state (`wagerStr`) to allow clearing and cents (step=0.01). |
| Mar 2026 | Sportsbook input stuck at 0, couldn't clear to retype | Wager state was `number` — `Number('')` = 0 prevented clearing. Changed to `string` state; parsed to float only on use. `Math.max(0, ...)` removed from onChange. |
| Mar 2026 | RealStern portfolio cards had cluttered inline action buttons | Replaced with `RealSternActionModal` — cards are now fully clickable, modal shows all actions (invite, gift, sell 80%, abandon with confirm). |
| Mar 2026 | RealStern purchase had no misclick protection | Added checkbox confirmation to `PurchaseModal`: "I confirm I want to acquire X for $Y". Button disabled until checked + affordable. |
| Mar 2026 | TeamFinancesView / Detailed not mobile-friendly | Pie chart containers: `w-56 h-56 sm:w-64 sm:h-64`. Legend: `sm:ml-8`. Flex direction: `flex-col sm:flex-row`. Header font sizes and padding scale with `sm:` breakpoints. |
| Apr 2026 | Injury system overhauled — player-profile aware + gist-backed | `InjurySystem.ts` rewritten: durabilityMultiplier (career injuries ÷ yearsPro ÷ 10, clamped 0.2–3x), computeBMIWear (BMI > 25 × 2K speed factor → lower-body injury bias for Zion/Embiid, cancels out for Jokic), profiledInjury (body-part weighted from career breakdown → BODY_PART_TO_INJURIES → exact name from gist list), genericInjury (cumulative-sum frequency pick). `src/data/injuries.ts` deleted — gist is the only source. `PersonSelectorModal` updated to use `getInjuries()`. HighlightGenerator added: 13 event types (driving_dunk, standing_dunk, posterizer with victimName, alley_oop with assisterName, fastbreak_dunk, break_starter, layup_mixmaster, versatile_visionary, limitless_3, ankle_breaker with victimName, tech_foul, timeout, coach_challenge). Driving vs standing dunks use separate 2K attributes — Gobert can't posterize. bleacherReport.ts and nbaCentel.ts templates updated to use highlight victim/passer names. |
| Apr 2026 | Young/lottery teams (SA Spurs, OKC) gave starters 35+ min, benched young players 5 min | `MinutesPlayedService.ts`: when `starMpgTarget ≤ 31` (lottery/development signal), all 5 starters step down proportionally (star: ~31 min, 2nd: ~29, 3rd: ~27, 4th: ~25, 5th: ~23) instead of slots 1-4 always getting 35-38 min. Deep bench slots 3+ get +6 min bonus in youth mode. OKC/SA rookies (Harper, Wembanyama backups) now get 10-16 min. |
| Apr 2026 | TransactionsView trade entry showed just "Trade" with no detail text | `tradeActions.ts`: added `result.outcomeText` fallback after `advanceDay` returns — if LLM returns empty string, fills in canonical trade text (`TeamA and TeamB complete a trade. TeamB receive: X. TeamA receive: Y.`). History entry always has rich text now. |
| Apr 2026 | ScheduleView rig game → watch live: rigged team didn't persist for other same-day games | `ScheduleView.executeWatchGame`: captured `riggedForTid` before clearing state, passes it to `ADVANCE_DAY` dispatch. Also calls `setRiggedForTid(undefined)` on cleanup. Now matches `NBACentral.executeWatchGame` behavior. |
| Apr 2026 | Pre-existing injuries flooded league news and social at season start | `lazySimRunner.ts`: `reportedInjuries` Set now pre-seeded with all injuries already on players before the lazy sim begins (`initialState.players.filter(injured).map(key)`). Only injuries that occur DURING the sim generate Shams posts and news items. |

### Non-Obvious Architecture Notes

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
- **Sidebar Legacy group**: Approvals, Viewership, and Finances are under "Legacy" in NavigationMenu. The **Finances** legacy tab now renders `LeagueFinancesView` with `initialTab="revenue"` — showing the League Revenue chart directly. Don't move them back or restore `Dashboard initialTab="finances"` — that tab was retired.
- **League Finances tabs**: `LeagueFinancesView` has tabs `cap | trade | attendance | revenue`. The Revenue tab button is hidden in the normal tab bar (`League Finances` nav item) since it's accessible via `Legacy > Finances`. Don't re-add the Revenue button to the tab bar.
- **LLM prompt always has full league context**: `leagueContext` (top 50 players, rosters) and `leagueSummaryContext` (standings, streaks, stats leaders) are injected at the top of EVERY `generateAdvanceDayPrompt` call — even when `isSpecificEvent: true`. The `isSpecificEvent` block only narrows the FOCUS of the narrative; it does not remove league awareness. The LLM always knows who's on what team.
- **LLM providers (post-Mar 2026)**: `@google/genai` package removed. Local type shims in `api.ts` replace `GenerateContentParameters` / `GenerateContentResponse` / `ThinkingLevel`. Chat → Groq Worker (no fallback). Non-chat → Together AI Worker (`TOGETHER_WORKER_URL`). `workerProviders.ts` uses `TOGETHER_WORKER` constant.
- **`general` PersonSelectorModal actionType**: Used by RealStern invite/gift. Registered in `PERSON_ACTION_MAP` via `GENERAL_ACTION_DEF` in `personActionDefs.ts`. Eligibility: players (all statuses) + staff + league office. Shows an optional "Reason for Invite" text box. Don't remove this entry — without it the modal only shows players (no staff/league office).
- **Referees in social actions**: `dinner` and `movie` both include refs (`includesRefs: true`) — refs are league office staff and appear wherever `includesLeagueOffice: true`. `bribe`, `fine`, `suspension`, `contact` also include refs. The rule: if an action includes league office, it includes refs too.
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
- **All-NBA / All-Defense / All-Rookie Teams**: `AwardService.calculateAllNBATeams()` produces 3 All-NBA, 2 All-Defense, 2 All-Rookie teams using positional slots (2G, 2F, 1C). Players can only appear on one team per category (shared `globalUsed` Set across picks). Returns `AllNBATeams` type with `allNBA`, `allDefense`, `allRookie` arrays. Visible in Award Races view under the "allNBA" tab. Cards show W-L team record below position/abbrev.
- **AwardService season-start fallback**: `getBestStat(stats, season)` tries `season` first, then `season - 1`. This handles day 1 where current-season stats don't exist yet (only prior-season BBGM data loaded). `isEligible` uses `gp >= 1` threshold on day 0 (teamGames === 0). All per-game calcs use `Math.max(gp, 1)` as divisor to avoid divide-by-zero. Without this fallback, all award races show empty on game start.
- **Coach of the Year**: `AwardService.calculateCOY(teams, season, staff)` scores coaches by win% + improvement over previous season. Coach name resolved via `state.staff.coaches` (matching by `team.name` or `team.abbrev`). Falls back to `"<TeamName> Head Coach"` if no staff entry found. Visible as "coy" tab in Award Races. Coach portraits fetched via `getCoachPhoto(name)` from `src/data/photos/coaches.ts` — call `fetchCoachData()` once on mount to hydrate the gist cache.
- **`src/data/` is the home for all external/static data**: Coach photos (`data/photos/coaches.ts`), celebrity rosters (`data/celebrities.ts`), and any other gist-backed lookup tables live here. Always check `src/data/` first before searching services or components for portrait URLs or external data.
- **`src/components/shared/` is for reusable UI**: `PlayerPortrait`, `TeamDropdown`, `TabBar`, `SortableTh` are already there. Always use or extend shared components before writing inline UI in a feature component.
- **Award announcement dates**: Each award tab in `AwardRacesView` shows its announcement date (CoY=Apr 19 → MVP=May 21). Dates shown in the tab selector and in the info card header.
- **All-Star break fix**: `breakStart` changed from `allStarSunday - 3` (Thursday) to `allStarSunday - 2` (Friday). Thursday games before All-Star break now simulate normally. The break filter in `simulationRunner.ts` only activates starting Friday (Rising Stars day).
- **Seasonal sidebar badge**: `NavigationMenu` computes `seasonalBadge` — counts urgent seasonal actions (≤7 days to deadline, not completed). Checks: rig voting, celebrity roster, dunk contest, 3-point contest, injured All-Star. Badge count shown on the "Seasonal Actions" nav item.
- **betResolver — wager deduction model (Model A)**: `placeBet` in `GameContext.tsx` deducts the wager from `personalWealth` immediately at placement. `resolveBets` therefore returns `netChange = potentialPayout - wager` on a win and `0` on a loss (money is already gone). Don't switch to Model B (deduct-on-loss) without updating both `placeBet` and `resolveBets`.
- **betResolver — reb fallback**: `PlayerGameStats.reb` is initialized at 0 in coordinated stats but may stay 0. Always use `stat.reb || (stat.orb + stat.drb)` when resolving reb/pra props. The fallback is baked into `betResolver.ts`.
- **Sportsbook wager units**: `wager` is always in ACTUAL DOLLARS (not millions). `placeBet` divides by 1,000,000 to deduct from `personalWealth`. All display calls must use `formatCurrency(wager, false)` (isBaseMillions=false). Validation: `wager > state.stats.personalWealth * 1_000_000`. Default wager is $10. Quick buttons: $10/$50/$100/$500. Input accepts step 0.01 for cents.
- **Sportsbook file split (Mar 2026)**: `SportsBookView.tsx` imports from `./sportsbook/` subfolder — `sportsbookTypes.ts` (types + pure helpers), `SportsbookShared.tsx` (OddsButton, TabButton, StatusBadge, EmptyState), `BetSlipPanel.tsx` (wager + slip UI). Mobile: slip appears as FAB + bottom drawer on screens < md; desktop keeps the right sidebar.
- **Mobile-first design requirement**: All views must be responsive via Tailwind breakpoints (`sm:`, `md:`, `lg:`). Mobile-first means: default classes apply to small screens, breakpoint-prefixed classes override for larger screens. Use `flex-col` → `sm:flex-row`, `text-sm` → `sm:text-xl`, `p-3` → `sm:p-6` patterns. Never hardcode fixed widths (e.g. `w-64`) without a mobile fallback. Pie chart containers: use `w-56 h-56 sm:w-64 sm:h-64`. Grids: `grid-cols-1 sm:grid-cols-2` or `grid-cols-2 sm:grid-cols-4`.
- **Confirmation modals for destructive/costly actions**: Always gate irreversible purchases with a checkbox ("I confirm I want to acquire X for $Y") before the submit button activates. `PurchaseModal` in `RealStern.tsx` uses a `useState(false)` checkbox — button is `disabled={!canAfford || !confirmed}`. This pattern prevents misclicks on expensive real estate.
- **PersonSelectorModal reuse**: `src/components/modals/PersonSelectorModal.tsx` is the single modal for picking contacts (players, staff, league office, refs). Pass `actionType="general"` for neutral contexts (invite, gift, donate). Pass `title` to customize the header. `onSelect` receives `(contacts: Contact[], reason?: string)` — the optional `reason` textarea appears for `actionType="general"`. Always reuse this modal instead of building custom contact pickers.
- **AssetActionModal (CommishStore)**: `src/components/modals/AssetActionModal.tsx` — actions for store inventory items: Gift (→ PersonSelectorModal), Sell (70% refund), Discard, Deploy (LLM-driven). For real estate inventory use `RealSternActionModal.tsx` (separate file, different actions: Invite, Gift, Sell 80%, Abandon).
- **RealSternActionModal**: `src/components/modals/RealSternActionModal.tsx` — replaces inline action buttons in `InventoryCard`. Click any portfolio card → modal opens. Actions: Invite Guest (→ PersonSelectorModal with optional reason), Gift (→ PersonSelectorModal), Sell 80%, Abandon (inline confirm inside modal). InventoryCard is now fully clickable with no action buttons on card surface.
- **betResolver — playerId is internalId**: `BetLeg.playerId` is `player.internalId` (the BBGM UUID string), NOT the NBA.com numeric ID. `GameResult.homeStats[].playerId` is also `internalId`. Never join on `player.id` or `nbaId` for bet resolution.
- **betResolver — DNP behavior**: If a player appears in `GameResult.playerDNPs` or is absent from both `homeStats` and `awayStats`, their leg returns `null` → bet stays `pending`, never `lost`. This prevents bettors from losing wagers on scratches/DNPs.
- **Youth rotation mode (starMpgTarget ≤ 31)**: In `allocateMinutes`, when `starMpgTarget ≤ 31` (lottery team signal from `standingsProfile`), ALL starters get stepped-down minutes: slot 0 = target, slot 1 = target-2, …, slot 4 = target-8 (floor 20 min). Deep bench slots (depth 3+) get +6 min bonus. This makes OKC/SA play their young guys instead of giving every starter 35+ min. Don't remove `isYouthMode` — it's intentional for rebuilding franchises.
- **Injury system — gist-only, no local fallback**: `src/data/injuries.ts` is deleted. `getInjuries()` returns the fetched gist list or `[]` if the fetch failed. `InjurySystem.ts` and `PersonSelectorModal.tsx` both call `getInjuries()`. Never re-add a local INJURIES constant — update the gist instead.
- **Injury profiling — three layers**: (1) `durabilityMultiplier`: historical injury frequency → scales per-game injury rate 0.2–3x. (2) `profiledInjury`: body-part weighted from career breakdown, boosted toward lower-body for high-BMI explosive players via `computeBMIWear`. (3) `genericInjury`: cumulative-sum frequency pick from gist list when no profile exists. Zion/Embiid get lower-body bias; Jokic's low 2K speed cancels out his high BMI.
- **`BODY_PART_TO_INJURIES` in `playerInjuryData.ts`**: Maps canonical body-part buckets (knee, ankle, achilles, etc.) to exact injury names from the nbainjurieslist gist. The string match must be exact — if you add/rename an injury in the gist, update this map too.
- **HighlightGenerator — driving vs standing dunks are separate**: `driving_dunk` uses `Inside Scoring['Driving Dunk']` from 2K gist; `standing_dunk` uses `['Standing Dunk']`. Only driving dunks can posterize (victim via `pickRimDefender()` — C/PF on the opposing team). Standing dunks never posterize. Gobert has high standing dunk but low driving dunk — this is intentional.
- **HighlightGenerator — victim and passer fields**: Posterizer + ankle_breaker store `victimId` + `victimName`. Alley_oop + fastbreak_dunk + versatile_visionary store `assisterId` + `assisterName`. Social templates access these via `(ctx.game as any).highlights ?? []`. Both `GameResult` types (`src/types.ts` + `src/services/simulation/types.ts`) must have `highlights?: GameHighlight[]`.
- **Injury news — only fresh injuries**: `lazySimRunner.ts` pre-seeds `reportedInjuries` with all players' current injuries before the sim loop. This prevents existing injuries (e.g. season-opening carryovers) from generating Shams posts and news items. Only injuries that first appear DURING the lazy sim batch trigger coverage. Regular day-by-day games are always fresh (injuries come from `result.injuries`, which is only populated by that game's `InjurySystem.checkInjuries` call).
- **betResolver — parseLine**: Extracts the numeric line from a description string. Handles `"Over X"` / `"Under X"` patterns (for totals and props) and signed spread patterns like `"LAL -3.5"` / `"BOS +3.5"`. Spread descriptions come from SportsBookView as `"${abbrev} ${sign}${number}"` (e.g. `"BOS +3.5"` or `"LAL -3.5"`). Over/Under descriptions are `"Over 220.5 pts"` or `"LeBron James Over 25.5 PTS"`.
- **betResolver — parlay batching**: Parlay legs all use `gameId` or `playerId` to look up results. If any leg's game isn't in the current `allSimResults` batch, the whole parlay stays pending. Same-day parlays resolve in one turn. Multi-day parlays resolve only if all their games fall within the same `SIMULATE_TO_DATE` batch.
- **LLM stack — Groq + Together AI only. No Google SDK.**: `@google/genai` package is NOT used anywhere in this app. ALL LLM calls go through `generateContentWithRetry` in `src/services/llm/utils/api.ts`. Chat calls → Groq Worker (`GROQ_WORKER_URL`, model `llama-3.3-70b-versatile`). Everything else → Together AI Worker (`TOGETHER_WORKER_URL`) which proxies to Gemini models on the backend. `process.env.GEMINI_API_KEY` is irrelevant — keys are on the worker, not the client. Any component that imports `GoogleGenAI` from `@google/genai` and uses `process.env.GEMINI_API_KEY` directly will silently fail (no API key on client). Always use `generateContentWithRetry`.
- **Article viewer LLM elaboration**: `ArticleViewer.tsx` uses `generateContentWithRetry` (not GoogleGenAI). Box score context (`buildBoxScoreContext`) + highlight plays are injected into the prompt when `item.gameId` is set. The `enableLLM` check in `generateContentWithRetry` will return a mock if disabled — but the gate is in the worker, so the viewer should always attempt elaboration.
- **Accurate article dating — game date, not sim end date**: Game-specific news articles (monster_performance, game_result, duo_performance, team_feat, triple_double, major_injury) must use `game.date` as the article date — the actual date the game was played, stored on `GameResult`. Batch-level articles (batch_recap, streaks, drama, standings) use `currentDate` (end of sim batch). Shams injury posts use `result.date` (the game's date). LLM-generated news (`result.newNews`) uses `n.date` if provided by the LLM, otherwise falls back to `endDateString`. Never use `state.date` (sim START date) as the date for news/social items — it's always stale.
- **GameResult snapshot W-L records**: `GameResult` stores `homeWins/homeLosses/awayWins/awayLosses` — the team records AT TIP-OFF (before this game's result is applied). `engine.ts` captures these from `homeTeam.wins/losses` at simulation time. `BoxScoreModal` always displays these snapshot values so historical box scores show the correct record, not the team's current live record.
- **teamOnly news items**: Articles tagged `teamOnly: true` (generated by `lazySimNewsGenerator` section 3c for 30-39 PT games and triple-doubles) are filtered from the main `NewsFeed` but still appear in `TeamDetailView`'s `teamNews` filter which reads raw `state.news`. Don't move `teamOnly` into a separate state array — the filter approach keeps a single source of truth.

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

*Lead the league. Build your legacy. Become the ultimate NBA Commissioner.*

---

## Knowledge Gaps (Things That Are Broken, Unfinished, or Surprising)

These are issues discovered while reading the code — not bugs that crashed things, but sharp edges that will cause problems during a makeover or when adding new features.

### News Feed

| Gap | Location | Impact |
|-----|----------|--------|
| `NewsItem` has no `category` field | `types.ts:461` | Every card says "Breaking News" hardcoded — can't badge by type without parsing the ID string |
| Drama pass (coach hot seat + trade rumor) never fires in regular gameplay | `lazySimNewsGenerator.ts:173` | `if (skipInjuries) return news` exits BEFORE Pass 5. `socialHandler` always passes `skipInjuries=true`. Drama only fires during multi-day lazy sim. |
| 4 playoff/finals templates exist but have zero callers | `newsTemplates.ts` | `playoff_series_win`, `playoff_elimination`, `nba_champion`, `finals_mvp` are scaffolding only — no code calls `NewsGenerator.generate()` for these yet |
| "Read Full Report" button is a dead CTA | `NewsFeed.tsx:111` | No click handler, no modal. Either remove or wire a `NewsDetailModal` |
| Bookmark + Share buttons are visual-only | `NewsFeed.tsx:87-93` | No state, no handler, no persistence |
| `newsType: 'weekly' as any` cast in fallback | `lazySimNewsGenerator.ts:239` | `NewsItem` type was missing `newsType` when fallback was written — needs cleanup |
| `gamesToTime()` duplicated in two files | `lazySimNewsGenerator.ts` + `charania.ts` | Identical function exists twice. Fix in one doesn't fix the other |

### Social Feed

| Gap | Location | Impact |
|-----|----------|--------|
| `wojnarowski.ts` and `aggregators.ts` are commented out | `templates/index.ts` | These template files exist but are not loaded — probably incomplete/broken. Check before makeover |
| `handlers.ts` (legacy `TWITTER_HANDLERS[]`) is not consumed by `SocialEngine` | `src/data/social/handlers.ts` | Has `probability` and `descriptions` fields. Unknown if anything still imports it. Don't delete without grepping usages |
| `src/data/social/templates.ts` is a separate barrel from `src/services/social/templates/` | Both paths exist | Two `templates.ts` files with different shapes. The data folder one may be legacy. Confirm before makeover |
| `LLM_OWNED_HANDLES` suppresses `shams`+`woj` `type:'news'` templates when LLM ON | `SocialEngine.ts:13` | If you add a new insider template and forget `type:'news'`, it will duplicate with LLM posts |
| `photoEnricher` cache never cleared between simulations unless explicitly called | `photoEnricher.ts` | `clearPhotoEnricherCache()` must be called when starting a new game — otherwise stale photo → null mappings persist from prior session |

### Sportsbook

| Gap | Location | Impact |
|-----|----------|--------|
| Lines/odds regenerate every time the view opens | `SportsBookView.tsx` | Cosmetic inconsistency — opened bets show different odds than when placed |
| Push (exact tie) resolves as loss | `betResolver.ts` | No push/refund logic. Bettors lose on exact ties |
| ~~`state.bets` grows unbounded~~ — **FIXED Mar 2026** | `gameLogic.ts` | After each `resolveBets` call: all `pending` bets kept + up to 50 most-recent resolved bets by date. Older resolved bets pruned. |

### RealStern

| Gap | Location | Impact |
|-----|----------|--------|
| ~~`monthlyPassive` income purely cosmetic~~ — **FIXED Mar 2026** | `gameLogic.ts`, `lazySimRunner.ts` | `monthlyPassive` (`price × 0.004` per asset) now silently added to `personalWealth` each day advance (pro-rated: `monthlyPassive × days / 30 / 1_000_000`). Not in payslips — payslip is league salary only. Both regular turns and lazy-sim batches wired. |

### Architecture

| Gap | Location | Impact |
|-----|----------|--------|
| `GameResult` defined in two places | `src/types.ts` + `src/services/simulation/types.ts` | Any new field MUST be added to BOTH files or TypeScript errors in the engine only |
| Raw BBGM OVR vs 2K OVR conflation risk | everywhere | `player.overallRating` is ~0–100 BBGM scale. `convertTo2KRating()` maps to ~60–99 2K scale. Displaying `overallRating` directly as a 2K number (e.g. "OVR 72") understates good players significantly |
| `Revenue` labels say "Expected" — sponsor system not built | `Dashboard.tsx`, `BroadcastingView.tsx` | "Expected Annual Revenue" is a placeholder. When sponsors are added the label and value formula both change |
| `workerProviders.ts` `TOGETHER_WORKER` constant | `api.ts` | `@google/genai` package removed Mar 2026. Local shims replace `GenerateContentParameters` etc. If you add a new LLM call, use Together AI Worker path, not any `@google/genai` import |

---

## Session Contributions (What Was Added to This Codebase and Why)

A reverse-chronological record of significant additions from dev sessions, with the rationale preserved so future sessions understand the context.

### Mar 30, 2026 — Bets archival + RealStern passive income
- `state.bets` was growing unbounded — after each `resolveBets`, pruned to `pending` bets + 50 most-recent resolved (by date desc)
- `monthlyPassive` real estate income was cosmetic-only — now silently applied to `personalWealth` in both `gameLogic.ts` (regular turns, pro-rated by `daysToAdvance`) and `lazySimRunner.ts` (lazy-sim batches, pro-rated by `batchDays`). Rate: `price × 0.004` per asset per month. Not surfaced in payslips — payslip is league salary only.

### Mar 30, 2026 — Social & News Docs
- Added `SOCIAL_README.md` — full social feed system documentation (handles registry, SocialEngine, template architecture, Charania two-layer system, transaction injection pattern)
- Added `NEWS_README.md` — full news feed documentation (NewsItem type, NewsGenerator, lazySimNewsGenerator 5 passes, NewsFeed anatomy, photo enrichment, knowledge gaps)
- Updated `README.md` developer docs table + knowledge gaps section + session contributions

### Mar 2026 — Sportsbook
- `SportsBookView.tsx` split into `./sportsbook/` subfolder: `sportsbookTypes.ts` (pure types + helpers), `SportsbookShared.tsx` (shared UI atoms), `BetSlipPanel.tsx` (wager + slip)
- Wager state changed from `number` to `string` to allow clearing/retyping (input stuck at 0 bug)
- `formatCurrency(wager, false)` fix — wager is actual dollars, not millions
- Mobile: BetSlip appears as FAB + bottom drawer on `< md`; desktop keeps right sidebar

### Mar 2026 — RealStern
- `RealSternActionModal.tsx` added — replaces inline action buttons on portfolio cards
- Click any owned asset → modal with: Invite Guest, Gift, Sell 80%, Abandon (confirm inside modal)
- `PurchaseModal` added checkbox confirmation guard ("I confirm I want to acquire X for $Y")
- Mobile: pie chart / legend layout uses `sm:` breakpoints for responsiveness

### Mar 2026 — Playoff + Play-in Fix
- `applyPlayoffLogic()` extracted in `simulationHandler.ts`, called BEFORE each day (inject games) and AFTER (advance bracket)
- Fixes `SIMULATE_TO_DATE` crossing Apr 13–20 not generating play-in games

### Mar 2026 — Mood System (Phase 1)
- `src/utils/mood/` barrel added: `moodScore.ts`, `moodTraits.ts`, `dramaProbability.ts`, `moodTypes.ts`
- 7 traits: DIVA, LOYAL, MERCENARY, COMPETITOR (BBGM-inspired), VOLATILE, AMBASSADOR, DRAMA_MAGNET
- `computeMoodScore()` is stateless (computed fresh, not cached in player object)
- Traits stored in `player.moodTraits?` — backfilled lazily in `gameLogic.ts`
- Discipline story lottery now mood-weighted

### Mar 2026 — FightGenerator
- `src/services/FightGenerator.ts` — 0.4% base per game, boosted by VOLATILE/DRAMA_MAGNET traits
- `GameResult.fight?: FightResult` on both `types.ts` AND `simulation/types.ts`
- Fight seeds injected into `actionProcessor.ts` story loop alongside discipline stories

### Mar 2026 — Win Streak / Snapped News
- Streak thresholds changed from `[5, 8, 12]` to `[5, 7, 10, 14]`
- `long_win_streak` category added (8+ games, more dramatic language)
- `streak_snapped` category added — fires when team drops from 5+ W streak to L
- `prevTeams` optional arg added to `generateLazySimNews` for streak comparison

### Mar 2026 — LLM Anti-Echo Fix
- `simulation.ts` prompt instruction #2: `outcomeText` reframed as "event hint" not output to copy
- `isSpecificEvent` block + `system.ts` line 94 updated to same effect
- All generated content must use authentic voices — never verbatim from the hint

### Mar 2026 — Paycheck / Lazy Sim Batch Fix
- `generatePaychecks` now called per batch in `lazySimRunner.ts` with `lastPayDate` tracking
- Prevents all paychecks from stacking and firing on the next real day

### Real Stern — passive income not wired
- `monthlyPassive` income is computed in RealStern UI but **not** wired into `generatePaychecks`.
- **TODO**: Add `state.realEstatePassive` ($/month number) and accumulate monthly in the payslip logic.

### ~~LLM outcome text echoing~~ — FIXED Mar 2026
- `generateAdvanceDayPrompt` instruction #2 and `isSpecificEvent` block now explicitly tell the LLM to treat `outcomeText` as an **event hint/context** — not text to copy verbatim.
- LLM must write its own fresh `outcomeText` in the response JSON.
- News headlines, @Shams/@woj social posts, fan tweets, and emails are each instructed to use their own voice and phrasing — never copy the hint directly.
- `system.ts` line 94 also updated to the same effect.
- The payload field name `outcomeText` was NOT renamed (too many dispatch sites); the prompt refers to it as "eventHint (also called outcomeText)" for clarity.

### Sports Book — known gaps
- Lines/odds regenerate on each open (cosmetic only — placed bets unaffected).
- Push (exact tie on spread/total) resolves as a loss — no push/refund logic in `betResolver.ts`.
- `state.bets` grows unbounded — no archival for old resolved bets.

---

## LLM Mode vs. Lazy Sim (Non-LLM) — Important Separation

The simulation has **two completely separate narrative modes**. Understand this before touching `advanceDay` or prompt logic.

### Non-LLM ("lazy sim") — `enableLLM: false`
- Default / fast mode. No API calls.
- `advanceDay()` returns static text: `action.payload.outcomeText` (factual description) or a game-count summary.
- News, social, emails generated by `generateLazySimNews()` (template-based).
- Full game simulation still runs — only the **narrative flavor** is templated.
- Commissioner's Diary entries read as plain factual text with no embellishment.

### LLM ("live sim") — `enableLLM: true`
- Calls **Groq Worker** (chat: `bypassLLMCheck: true`) or **Together AI Worker** (all sim/narrative turns).
- `advanceDay()` sends full league context + action → LLM returns rich JSON: `outcomeText`, `statChanges`, `newEmails`, `newNews`, `newSocialPosts`.
- The payload `outcomeText` is provided as an **event hint** — factual context about what happened. The LLM writes its own fresh `outcomeText` in the response, and all generated content (news, social, emails) must be written in authentic voices, not copied from the hint.
- Provider routing: chat → Groq Worker only (no fallback). Non-chat → Together AI Worker (worker-side Gemini fallback, server only).
- `@google/genai` npm package is **not used** (removed Mar 2026). Local type shims live in `src/services/llm/utils/api.ts`.

### Key files
| File | Purpose |
|------|---------|
| `src/services/llm/generators/simulation.ts` | `advanceDay()` entry point, LLM vs lazy-sim branch |
| `src/services/llm/prompts/system.ts` | Master system prompt |
| `src/services/llm/prompts/simulation.ts` | `generateAdvanceDayPrompt()` with `isSpecificEvent` handling |
| `src/services/llm/utils/api.ts` | Groq Worker vs Together Worker routing |
| `src/services/llm/generators/lazySimNews.ts` | Template news for non-LLM mode |
