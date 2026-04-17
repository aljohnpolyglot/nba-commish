# Commissioner Mode -- Implementation Guide

You control the **entire NBA**, not one team. Every action ripples through player careers, team finances, public opinion, and your legacy.

---

## 1. Action System

Actions are the core gameplay loop. Most advance the day and trigger the LLM pipeline. A few are instant.

| Category | Examples | Day Advance? |
|----------|----------|--------------|
| **Executive** | Force trades, set Christmas games, rig lottery, league rule changes | Yes |
| **Season** | All-Star format, invite performers, watch games | Yes |
| **Personal** | Dinner, travel, go to club, DM players | Yes |
| **Covert** | Hypnosis, sabotage, drug tests, bribery | Yes |
| **Commish Store** | Buy/sell assets, gift items, deploy items | Buy/Sell/Discard: No. Gift/Deploy: Yes |

Key files: `src/components/actions/view/actionConfig.ts`, `src/store/logic/actionProcessor.ts`

Seasonal actions (Celebrity Game, Christmas, Global Games, All-Star rigging) live in `SeasonalView.tsx`, NOT in `actionConfig.ts` (its `season: []` array is intentionally empty).

---

## 2. LLM Narrative Engine (Gemini)

Every day-advance generates news (1-5), social posts (10-20+), and emails/DMs.

| File | Role |
|------|------|
| `src/services/llm/prompts/system.ts` | Master system prompt |
| `src/services/llm/prompts/simulation.ts` | `generateAdvanceDayPrompt` |
| `src/services/llm/generators/simulation.ts` | `advanceDay()` entry point |
| `src/services/llm/prompts/context.ts` | Top 50 players, team leadership context |

The prompt includes a **Season Calendar Awareness** block so the LLM knows past/upcoming events. Christmas context is gated to `currentDate <= Dec 25`.

---

## 3. Economy & Finance

Two separate economies -- never mix them:

| Field | Purpose | Used For |
|-------|---------|----------|
| `state.stats.personalWealth` | Commissioner's personal funds (millions) | Club visits, gifts, bribes, Commish Store |
| `state.stats.leagueFunds` | League treasury (millions) | Broadcasting deals, expansions, league operations |

The LLM system prompt explicitly separates these. `personalWealth` is capped at $8M/day.

### Commish Store (`src/components/central/view/CommishStore.tsx`)

Amazon-style in-game store. Products from `commishStoreassets.ts`.

| Asset Action | Modal | Advances Day? | Notes |
|--------------|-------|---------------|-------|
| **Gift** | PersonSelectorModal | Yes | LLM narrates `outcomeText` |
| **Deploy** | Textarea | Yes | LLM narrates `outcomeText` |
| **Sell** | None | No | 70% refund, immediate |
| **Discard** | None | No | Immediate remove |

`STORE_PURCHASE` is an immediate action (registered before `processTurn` in `GameContext.tsx`).

---

## 4. Club Debuff System

When the commissioner visits a nightclub with players, those players get a next-game debuff.

| Severity | Club Rank | pts mult | eff mult | ballControl mult |
|----------|-----------|----------|----------|-------------------|
| Heavy | <= 5 | 0.78 | 0.82 | 0.72 |
| Moderate | <= 15 | 0.88 | 0.90 | -- |
| Mild | > 15 | 0.94 | 0.96 | -- |

Pipeline: `state.pendingClubDebuff` -> `simulationRunner.ts` (builds Map) -> `engine.ts` calls `setClubDebuffs()` -> `GamePlan.ts` applies multipliers in `initial.ts` -> `clearClubDebuffs()` after game.

---

## 5. Inbox & Chat Routing

All LLM-generated messages route by `senderRole` in `communicationHandler.ts`:

| senderRole | Destination | Style |
|------------|-------------|-------|
| Player, Coach, Agent | **Chat** (DMs) | Casual |
| Owner, GM, Sponsor, Media | **Email** (Inbox) | Formal |

State fields: `state.inbox` (emails), `state.chats` (DM conversations).

---

## 6. Seasonal Actions & All-Star

All seasonal actions live in `SeasonalView.tsx` with deadline banners and chronological sort.

| Action | Type | Gate | Key Behavior |
|--------|------|------|--------------|
| Rig All-Star Voting | Immediate + ADVANCE_DAY | `allStar.startersAnnounced === true`, one-time (`hasRiggedVoting`) | Updates vote counts, LLM narrates |
| Dunk Contest Contestants | Immediate (SET_DUNK_CONTESTANTS) | None | Always editable, "Editing" banner if already set |
| 3PT Contest Contestants | Immediate (SET_THREE_POINT_CONTESTANTS) | None | Always editable |
| Injured All-Star Replacement | ADVANCE_DAY | Injured roster member detected | Conference-matched healthy replacement by OVR |

**Sidebar badge**: `NavigationMenu` computes `seasonalBadge` -- counts urgent actions <= 7 days to deadline, not completed.

**All-Star game score**: `exhibitionScoreMult: 1.48` in `KNOBS_ALL_STAR` boosts scoreboard BEFORE stat generation. `paceMultiplier` must stay `1.0` to avoid double-boost. Rising Stars uses `1.18`.

**All-Star rotation**: `flatMinutes: true`, `flatMinutesTarget: 20`. Stars ~28-30 min, role players ~12-14 min.

---

## 7. Mood System (7 Traits)

File: `src/utils/mood/` (barrel export)

| Trait | BBGM Analog | Effect |
|-------|-------------|--------|
| DIVA | F (Fame) | Drama weight up |
| LOYAL | L (Loyalty) | Stabilizing |
| MERCENARY | $ (Money) | FA flight risk |
| COMPETITOR | W (Winning) | Winning matters more |
| VOLATILE | -- | Fight/drama probability up |
| AMBASSADOR | -- | PR boost |
| DRAMA_MAGNET | -- | Attracts incidents |
| FAME | -- | Doubles market-size morale bonus |

`genMoodTraits(internalId)` is deterministic (string hash). Traits stored in `player.moodTraits?: MoodTrait[]`. Backfilled lazily in `gameLogic.ts`.

`computeMoodScore(player, team, dateStr, endorsed, suspended, sabotaged)` returns score (-10 to +10). `dramaProbability(score, traits)` outputs per-player weight for discipline story lottery.

---

## 8. FightGenerator

File: `src/services/FightGenerator.ts`

- Base probability: 0.4% per game
- Boosted by VOLATILE/DRAMA_MAGNET traits and real-player propensity map
- Result stored in `GameResult.fight?: FightResult`
- Story seed injected into `actionProcessor.ts` story loop for LLM narration
- `GameResult` lives in TWO files: `src/types.ts` AND `src/services/simulation/types.ts` -- both must be updated

---

## 9. Watch Game Flow

"Watch Live" does NOT simulate live. It pre-simulates, then plays back visually:

1. User clicks "Watch Live" in `WatchGamePreviewModal`
2. `ScheduleView` runs `GameSimulator.simulateGame` immediately
3. Dispatches `RECORD_WATCHED_GAME` + `ADVANCE_DAY`
4. Opens `GameSimulatorScreen` with `precomputedResult`
5. "Leave Game" / X button calls `onClose()` only -- no re-simulation

---

## 10. Key State Fields

| Field | Description |
|-------|-------------|
| `state.stats.personalWealth` | Personal funds (millions) |
| `state.stats.leagueFunds` | League treasury (millions) |
| `state.stats.publicApproval` | Fan approval (0-100) |
| `state.stats.ownerApproval` | Owner approval (0-100) |
| `state.stats.playerApproval` | Player approval (0-100) |
| `state.stats.legacy` | Long-term legacy score (0-100) |
| `state.pendingClubDebuff` | `{ playerId, severity, clubName }[]` |
| `state.pendingHypnosis` | Active hypnosis commands for next LLM call |
| `state.leagueStats.year` | Current NBA season year |

---

## 11. Adding New Actions (Quick Reference)

1. Add to `ActionType` union in `src/types.ts`
2. Add handler in `src/store/logic/actions/` or `actionProcessor.ts`
3. If **immediate** (no day advance): add early-return handler in `GameContext.tsx` before `processTurn`
4. If **LLM-driven**: call `advanceDay(state, customAction, storySeeds, simResults, ...)`
5. Add `payload.outcomeText` -- this is what the LLM narrates
6. Add UI in `src/components/actions/view/actionConfig.ts`

Full pipeline docs: `ACTIONS_README.md`. Rule wiring: `LEAGUE_RULES_README.md`.
