# All-Star Weekend — Architecture & File Guide

This document explains the All-Star Weekend system in NBA Commish Sim — how it works, what each file does, and how the pieces connect.

---

## Architecture Overview

```
Season advances (ADVANCE_DAY)
        │
        ▼
gameLogic.ts — All-Star block (lines 231–498)
        │  Checks dates: voting, starters, reserves, celebrity, dunk, 3pt, games, weekend
        │  Dispatches updates to allStarPatch
        ▼
AllStarState (in GameState.allStar)
        │  roster[], risingStarsRoster[], dunkContestContestants[], threePointContestants[]
        │  flags: startersAnnounced, reservesAnnounced, gamesInjected, weekendComplete, etc.
        ▼
AllStarView.tsx (7 tabs)
        Overview · Voting · Roster · Rising Stars · Celebrity Game · Dunk Contest · 3-Point Contest
```

---

## Files Reference

### Services (logic)

#### `AllStarWeekendOrchestrator.ts`
The master orchestrator. Responsible for:
- `getAllStarWeekendDates(year)` — returns all key dates for the All-Star calendar
- `injectAllStarGames(schedule, ...)` — injects Rising Stars, Celebrity, Dunk, 3PT, and All-Star game entries into the schedule
- `simulateWeekend(state, { friday, saturday, sunday })` — auto-simulates whichever days need sim; returns `{ allStar, schedule, boxScores }`

#### `AllStarSelectionService.ts`
Handles player selection logic:
- `simulateVotingPeriod(players, teams, year, endDate, currentVotes, days)` — accumulates fan votes
- `selectStarters(votes, players)` — picks 10 starters (top vote-getters by position/conference)
- `selectReserves(players, teams, year, existingRoster)` — picks 14 reserves by stats
- `getRisingStarsRoster(players, year)` — picks rookies/sophomores for Rising Stars game

#### `AllStarDunkContestSim.ts`
- `selectContestants(players)` — picks 4–6 top dunkers by athleticism rating
- `simulate(contestants, ratings)` — runs the dunk contest round-by-round, returns scored entries

#### `AllStarThreePointContestSim.ts`
- `selectContestants(players, year)` — picks top 3-point shooters
- `simulate(contestants)` — runs round-by-round scoring, returns results

#### `AllStarCelebrityGameSim.ts`
- `simulate(celebList)` — runs a low-stakes celebrity game, returns box score

---

### State

#### `AllStarState` (in `types.ts`)
```typescript
{
  season: number;
  votes: AllStarVoteCount[];          // fan vote tallies
  startersAnnounced: boolean;
  reservesAnnounced: boolean;
  risingStarsAnnounced?: boolean;
  celebrityAnnounced?: boolean;
  dunkContestAnnounced?: boolean;     // true = lazy sim won't override commissioner picks
  threePointAnnounced?: boolean;      // same
  hasRiggedVoting?: boolean;
  roster: AllStarPlayer[];            // All-Star game players (may include injury replacements)
  risingStarsRoster?: AllStarPlayer[];
  dunkContestContestants?: NBAPlayer[];
  threePointContestants?: NBAPlayer[];
  dunkContest?: { contestants: DunkContestEntry[]; winnerId?: string; complete: boolean; };
  threePointContest?: { ... };
  gamesInjected?: boolean;
  allStarGameId?: number;
  risingStarsGameId?: number;
  weekendComplete?: boolean;
  // Celebrity
  celebrityTeams?: string[];
  celebrityRoster?: string[];
  // Rising Stars
  risingStarsTeams?: string[];
}
```

#### `AllStarPlayer` (in `types.ts`)
Each entry in `roster[]`:
```typescript
{
  playerId: string;
  playerName: string;
  conference: 'East' | 'West';
  isStarter: boolean;
  position: string;
  category: 'Guard' | 'Frontcourt';
  ovr?: number;
  isInjuredDNP?: boolean;        // player has All-Star honor but won't play (injury)
  isInjuryReplacement?: boolean; // player was added as replacement
  injuredPlayerId?: string;      // which player they replaced
}
```

---

### UI Components

#### `AllStarView.tsx`
Main container with 7 tabs. Handles "Watch Live" routing to game views. Manages contest completion callbacks.

#### `AllStarOverview.tsx`
Summary info: key dates, completed events, upcoming schedule.

#### `AllStarVotes.tsx`
Fan vote leaderboard. Shows top candidates per position/conference.

#### `AllStarRoster.tsx`
Displays the full All-Star roster in East/West columns with starter/reserve sections. Also shows the **Injury Replacements** section (players with `isInjuredDNP`/`isInjuryReplacement` flags).

#### `AllStarGameView.tsx`
Watch the All-Star Game live or view final score/box score.

#### `DunkContestView.tsx`
Watch or review the Slam Dunk Contest.

#### `ThreePointView.tsx`
Watch or review the 3-Point Contest.

#### `RisingStarsView.tsx`
Display Rising Stars game roster and result.

#### `CelebrityGameView.tsx`
Celebrity game roster and box score.

---

### Commissioner Controls (SeasonalView)

| Action Card | What it does |
|---|---|
| Rig All-Star Voting | Injects ghost votes for a fan-vote candidate |
| Celebrity Game Roster | Override the auto-selected celebrity roster |
| Dunk Contest Participants | Override auto-selected dunkers (sets `dunkContestAnnounced: true` to block lazy sim) |
| 3-Point Contest Participants | Override auto-selected shooters (sets `threePointAnnounced: true`) |
| All-Star Roster Edit | Swap any player OR add injury replacements for injured All-Stars |

---

## Key Flows

### Lazy Sim vs. Commissioner Override
When the commissioner manually sets dunk/3-point contestants, `GameContext` immediately sets the `*Announced` flag. The `gameLogic.ts` `wasDateReached()` guards check `!allStarPatch?.dunkContestAnnounced` before auto-selecting, so commissioner choices always win.

### Injury Replacement
See `EVENTS_README.md §8` for the full step-by-step flow.

### Adding a New Weekend Event
1. Add a date to `getAllStarWeekendDates()` in `AllStarWeekendOrchestrator.ts`
2. Add a `wasDateReached()` block in the All-Star block of `gameLogic.ts`
3. Add a boolean flag to `AllStarState` in `types.ts`
4. (Optional) Add a `SeasonalView` action card for commissioner override

---

## Revenue Phasing Note

Daily league revenue is phase-weighted by `calculateDailyLeagueFunds()` in `financialService.ts`. All-Star Weekend days have a 1.3× multiplier. Playoff days scale up to 3.5× (NBA Finals). This means the revenue graph in League Finances spikes during high-profile events.
