## Run Locally

**Prerequisites:** Node.js, a Gemini API key

1. Install dependencies: `npm install`
2. Set `GEMINI_API_KEY` in `.env.local`
3. Run: `npm run dev`

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

### Non-Obvious Architecture Notes

- **`state.players` is the player source — always**: No component should ever try to read `team.players`. The `NBATeam` type has no such field. Players belong to `state.players` and link to their team via `player.tid`. Any feature that needs "players on team X" should filter `state.players.filter(p => p.tid === X)`. This tripped up the initial Sportsbook props build and will trip up anything else that assumes team objects carry rosters.
 
- **`getBestStat` pattern is canonical**: Whenever you need a player's current season stats, use the same two-step `AwardService` uses — `filter(s => s.season === season && !s.playoffs)` then `reduce` to the entry with the highest `gp`. Don't use `.find()` by season alone; a traded player will have two entries for the same season (one per team) and you want the one with more games. Copy `getBestStat` into any service or component that needs it rather than rolling a one-off.
 
- **`getTrb` fallback chain**: Always read rebounds as `s.trb ?? s.reb ?? ((s.orb ?? 0) + (s.drb ?? 0))`. The `trb` field is not guaranteed to be pre-computed on every stat object — some paths only populate `orb`/`drb`. The `?? 0` guards are load-bearing; without them a single undefined turns the whole expression into `NaN` which then silently poisons every downstream calculation (PPG-weighted scores, O/U lines, award race scores, all of it). Same pattern lives in `AwardService.ts` as `getTrb` — keep them in sync.
 
- **Sportsbook bet slip dedup logic**: In parlay mode, adding a new leg auto-removes any conflicting leg for the same game (moneyline) or same player + same stat category (props). The condition check is `l.gameId === leg.gameId && l.type === 'moneyline'` for game conflicts, and `l.playerId === leg.playerId && l.condition.split('_')[0] === leg.condition.split('_')[0]` for prop conflicts (e.g. `pts_over` vs `pts_under` share the `pts` prefix). If you add new prop types, make sure the condition string follows the `{stat}_{direction}` pattern so this dedup keeps working.
 
- **Sportsbook O/U line generation**: Prop lines are set to the player's season average rounded to the nearest 0.5 (`Math.round(avg * 2) / 2`). This is intentionally simple — a real book would shade the line based on matchup, rest days, home/away splits. If you ever wire in a more sophisticated model, the line generation lives in the `playerProps` useMemo in `SportsbookView.tsx`. The odds themselves (over slightly juiced, under slightly plus) simulate the asymmetry real books use on star players where the public hammers overs.
 
- **Parlay combined odds**: Decimal odds multiply cleanly — `legs.reduce((acc, l) => acc * l.odds, 1)`. A 4-leg parlay of four -110s (1.909 each) = `1.909^4 ≈ 13.3x`, which is roughly what DraftKings would pay. The payout shown in the slip is `wager * combinedOdds - wager` (profit only), matching how real slips display "to win." Don't show total return as the headline — it confuses players into thinking they're getting more than they are.
 
- **`placeBet` type field for parlays**: The existing `placeBet` signature expects `type: 'moneyline' | 'over_under'`. Parlays pass `type: 'parlay' as any` to avoid a TypeScript error without changing the shared type. If the bet resolution logic ever needs to handle parlays differently from singles (e.g. all legs must win), add `'parlay'` to the union in `types.ts` and update the resolver. For now the game doesn't auto-resolve bets, so the cast is safe.
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
- **`src/data/` is the home for all external/static data**: Coach photos (`data/photos/coaches.ts`), celebrity rosters (`data/celebrities.ts`), and any other gist-backed lookup tables live here. Always check `src/data/` first before searching services or components for portrait URLs or external data.
- **`src/components/shared/` is for reusable UI**: `PlayerPortrait`, `TeamDropdown`, `TabBar`, `SortableTh` are already there. Always use or extend shared components before writing inline UI in a feature component.
- **Award announcement dates**: Each award tab in `AwardRacesView` shows its announcement date (CoY=Apr 19 → MVP=May 21). Dates shown in the tab selector and in the info card header.
- **All-Star break fix**: `breakStart` changed from `allStarSunday - 3` (Thursday) to `allStarSunday - 2` (Friday). Thursday games before All-Star break now simulate normally. The break filter in `simulationRunner.ts` only activates starting Friday (Rising Stars day).
- **Seasonal sidebar badge**: `NavigationMenu` computes `seasonalBadge` — counts urgent seasonal actions (≤7 days to deadline, not completed). Checks: rig voting, celebrity roster, dunk contest, 3-point contest, injured All-Star. Badge count shown on the "Seasonal Actions" nav item.
- **Per-player minutes cap is in `initial.ts`, not `coordinated.ts`**: The hard 48-min clip in `coordinated.ts` is NOT sufficient — `initial.ts` writes `playerMinutes[i]` directly to the stat object's `min` field, and that object is what the frontend reads. The authoritative cap lives in `initial.ts` as an iterative post-normalization loop (up to 4 passes). `coordinated.ts`'s cap is a safety net only. If you modify minute allocation logic, make sure no player can leave `initial.ts` with `min > 48 + otCount * 5`.
- **`fgaMult` is the attempt volume knob; `efficiencyMult` is the make-rate knob**: They are independent. A BRICKFEST night has `fgaMult=1.60` (player jacks 60% more shots) AND `efficiencyMult=0.65` (player makes far fewer per attempt). Together they produce authentic 3-for-22 lines. `fgaMult` only affects `estimatedFga`, which then flows into `threePa` and `twoPa` calculations. It does NOT affect `fgPts` or `threePm`/`twoPm` directly — makes are still anchored to `ptsTarget` via the `fgPts / 3` cap.
- **`volDecay` thresholds by raw tp**: `naturalVol` in `initial.ts` uses RAW `tp` (BBGM rating), not `tpComposite`. Thresholds: `tp>85→11, tp>70→9, tp>60→8, tp>50→6, else 4`. Every attempt above `naturalVol` costs `0.018` efficiency (down from original `0.025`). Players with tp=51-60 have naturalVol=6 and commonly shoot 8-11 3PA — previously hit 5-12% decay; now 2-7%.
- **3P% formula summary** (`initial.ts`): `threePctEffective = threePctBase * efficiencyMult * perimPenalty * knobs.efficiencyMultiplier * volDecay`. Where `threePctBase = 0.31 + (tp/100)*0.13 - tpFloorPenalty + tierEfficiencyBonus`. `tpFloorPenalty = tp<50 ? (50-tp)*0.003 : 0`. `tierEfficiencyBonus = (tp>=60 && tp<80) ? 0.025 : 0`. The `0.31` base is the primary lever for league-wide calibration.

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
