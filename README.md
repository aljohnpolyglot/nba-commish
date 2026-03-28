## Run Locally

**Prerequisites:** Node.js, a Gemini API key

1. Install dependencies: `npm install`
2. Set `GEMINI_API_KEY` in `.env.local`
3. Run: `npm run dev`

---

## 📓 Developer Diary (Notes)

**This README is a living document.** If you discover something surprising, fix a tricky bug, or notice something non-obvious about this codebase. Think of it as a dev diary — not just architecture docs.

### Discovered Bugs & Fixes Log

| Date | Issue | Fix |
|------|-------|-----|
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
- **Sidebar Legacy group**: Approvals, Viewership, and Finances are now under the "Legacy" group in NavigationMenu — not in Command Center. Don't move them back.
- **Raw OVR vs 2K-ified OVR**: `player.overallRating` (and `ratings[n].ovr`) is the raw BBGM-style 0–100 scale. `convertTo2KRating(ovr, hgt)` in `utils/helpers.ts` converts to approximate NBA 2K scale (~60–99 for pros). Always use `convertTo2KRating` when displaying player ratings in 2K-style contexts (Defense2KService, BadgeService, SeasonalView dunk contest). Never display raw `overallRating` as a 2K rating — the scales differ significantly (raw 70 ≈ 2K 78; raw 90 ≈ 2K 92).
- **Streak news thresholds**: Win/lose streaks fire at `[5, 7, 10, 14]` games. Streaks of 8+ use the `long_win_streak` template (more dramatic language). `streak_snapped` fires when a team had a W streak ≥5 last batch and is now on an L streak. Requires `prevTeams` arg in `generateLazySimNews`.
- **KNOBS_PRESEASON**: `SimulatorKnobs.ts` now has `KNOBS_PRESEASON` — lower efficiency (0.90), deeper rotation (13 players), lower 3PA rate (0.85x), refs let it go more (ftRateMult 0.80). Use this for preseason games instead of `KNOBS_DEFAULT`.
- **Celebrity game LLM-off fallback**: When `enableLLM: false`, `AllStarCelebrityGameSim` fills custom roster names with all-20 attributes and runs `simulateCelebrityWithGameSim`. No LLM call attempted, no crash.
- **All-NBA / All-Defense / All-Rookie Teams**: `AwardService.calculateAllNBATeams()` produces 3 All-NBA, 2 All-Defense, 2 All-Rookie teams using positional slots (2G, 2F, 1C). Players can only appear on one team per category (shared `globalUsed` Set across picks). Returns `AllNBATeams` type with `allNBA`, `allDefense`, `allRookie` arrays. Visible in Award Races view under the "allNBA" tab.
- **Coach of the Year**: `AwardService.calculateCOY(teams, season, staff)` scores coaches by win% + improvement over previous season. Coach name resolved via `state.staff.coaches` (matching by `team.name` or `team.abbrev`). Falls back to `"<TeamName> Head Coach"` if no staff entry found. Visible as "coy" tab in Award Races.
- **Award announcement dates**: Each award tab in `AwardRacesView` shows its announcement date (CoY=Apr 19 → MVP=May 21). Dates shown in the tab selector and in the info card header.
- **All-Star break fix**: `breakStart` changed from `allStarSunday - 3` (Thursday) to `allStarSunday - 2` (Friday). Thursday games before All-Star break now simulate normally. The break filter in `simulationRunner.ts` only activates starting Friday (Rising Stars day).
- **Seasonal sidebar badge**: `NavigationMenu` computes `seasonalBadge` — counts urgent seasonal actions (≤7 days to deadline, not completed). Checks: rig voting, celebrity roster, dunk contest, 3-point contest, injured All-Star. Badge count shown on the "Seasonal Actions" nav item.

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
