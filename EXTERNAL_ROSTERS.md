# External Roster Integration: Lessons Learned

This document covers everything learned from integrating Euroleague, PBA (Philippines), WNBA, and B.League (Japan) as external rosters into the NBA Commissioner sim.

---

## Architecture Overview

External players share the same `NBAPlayer` type as NBA players. They are differentiated by:
- `player.status` — the league name as a string literal (`'Euroleague'`, `'PBA'`, `'WNBA'`, `'B-League'`)
- `player.tid` — a team ID using a **league-specific offset** to prevent collisions with NBA team IDs
- `NonNBATeam.league` — the same string literal used to look up logos, names, etc.

### TID Offset Convention

| League     | Offset | Example tid |
|------------|--------|-------------|
| NBA        | 0      | 0–29        |
| Euroleague | +100   | 100–199     |
| PBA        | +200   | 200–299     |
| WNBA       | +300   | 300–399     |
| B-League   | +400   | 400–499     |

**Why offsets matter:** Many NBA player IDs are small integers (0–30). Without offsets, `player.tid === 5` could mean "LA Lakers" or "B-League team #5" — leading to silent bugs in team lookups.

---

## Adding a New External League: Checklist

When you add a new league (e.g., "NBL Australia"), you need to touch all of these:

### 1. Types (`src/types.ts`)
```ts
// Add to NBAPlayer.status union:
status?: '...' | 'NewLeague';

// Add to NonNBATeam.league union:
league: 'Euroleague' | 'PBA' | 'WNBA' | 'B-League' | 'NewLeague';
```

### 2. Fetch Service (`src/services/externalRosterService.ts`)
- Add `fetchNewLeagueRoster()` function
- Apply attribute scaling to raw ratings (see Scaling section below)
- Set `status: 'NewLeague'` and `tid: originalTid + OFFSET`
- Export from the file

### 3. Initialization (`src/store/logic/initialization.ts`)
- Import the new fetch function
- Await the fetch and destructure `{ players, teams }`
- Deduplicate by `internalId`
- Merge into `players` array and `nonNBATeams` array

### 4. Simulation Scaling (`src/services/simulation/StatGenerator/helpers.ts` and `StarterService.ts`)
- Add `if (p.status === 'NewLeague') return (val as number) * MULTIPLIER;` in `getScaledRating`
- Both files have identical `getScaledRating` implementations — update both

### 5. `isNBA` checks (spread across many files)
Any check like `player.status !== 'WNBA' && player.status !== 'Euroleague' && player.status !== 'PBA'` must also exclude the new league. Use the array pattern:
```ts
const isNBA = !['WNBA', 'Euroleague', 'PBA', 'B-League', 'NewLeague'].includes(player.status || '');
```

### 6. `NonNBATeam` lookups (many files)
Anywhere that looks up a non-NBA team, make sure the `league` filter includes the new league:
```ts
const team = state.nonNBATeams.find(t => t.league === player.status && t.tid === player.tid);
```
This pattern works automatically as long as you set `status` and `tid` correctly during fetch.

### 7. UI Filter Lists
Files that show league filter dropdowns need the new league added:
- `UniversalPlayerSearcher.tsx` — `leagueFilter` options
- `PlayersView.tsx` — league tab list
- `PersonSelectorModal.tsx` — filters array
- `NewChatModal.tsx` — FilterType union + filter list
- `VisitNonNBATeams.tsx` — leagues array with logo
- `PreseasonInternationalModal.tsx` — league state type + leagues array

### 8. LLM Context / Prompts
- `src/services/llm/prompts/context.ts` — exclude new league from top player lists (`p.status !== 'NewLeague'`)
- `src/services/llm/services/freeAgentService.ts` — similar exclusions

### 9. Social / Sim Engine
- `src/services/social/SocialEngine.ts` — `isNBA` checks
- `src/store/logic/turn/socialHandler.ts` — league exclusion arrays
- `src/services/logic/lazySimRunner.ts` — sim eligibility checks

### 10. Chat / Messaging
- `src/components/messages/ChatWindow.tsx` — 3 separate org-lookup blocks
- `src/components/messages/ChatList.tsx` — org display
- `src/components/messages/NewChatModal.tsx` — FilterType + org builder

### 11. Player Display Components
- `PlayerCard.tsx` — statusLabel fallback
- `PlayerBioView.tsx` — league badge
- `PlayerSearchCard.tsx` / `FreeAgentCard.tsx` — team name lookup
- `NBACentral.tsx` — `isNBA` check + org fallback
- `TeamDetailView.tsx` — roster filter

### 12. Action/Modal Filters
- `PlayerActionsModal.tsx` — isFreeAgent / isNBA checks
- `SignFreeAgentModal.tsx` — isInternational check
- `TradeMachineModal.tsx` — roster filter exclusions

---

## Attribute Scaling

External leagues have weaker competition. Raw ratings from their data sources are scaled **down** during fetch to reflect this:

| League     | Attribute Scale | Sim Stat Multiplier | OVR Cap (BBGM) | Notes |
|------------|----------------|---------------------|----------------|-------|
| Euroleague | ~0.90 (varies) | 0.733               | ~75            | Best non-NBA competition |
| B-League   | 0.85           | 0.68                | 75             | Japan pro league |
| PBA        | (raw)          | 0.62                | 60             | Philippines, weaker competition |
| WNBA       | (raw)          | N/A (separate sim)  | —              | Women's league |

**Two-step scaling for B-League:**
1. During `fetchBLeagueRoster()` — scale all non-height attributes by `× 0.85` before storing
2. During simulation in `getScaledRating()` — multiply by `0.68` when retrieving ratings

Height (`hgt`) is **never scaled** — it's a physical measurement.

**OVR Calculation:** Each league has its own OVR formula that tiers down the overall rating:
```ts
// B-League: cap at 75 OVR → best player ~75 2K overall (raised from 68)
if (ovr >= 75) reduction = 18;
// ...
if (ovr > 75) ovr = 75;

// PBA: cap at 60 OVR → best player ~60 2K overall (lowered from 65)
if (ovr >= 75) reduction = 35;
// ...
if (ovr > 60) ovr = 60;
```

**Ratings View — League Display Scaling (Fixed):**
The `getScaledRating()` sim multipliers (0.62 PBA, 0.68 B-League, 0.733 Euroleague) used to apply **only during simulation**, leaving raw BBGM attribute values visible in the UI. This is now fixed.

A `useLeagueScaledRatings` hook (`src/hooks/useLeagueScaledRatings.ts`) was added to mirror the sim multipliers in the display layer:

```ts
// Exported pure function — safe to call inside existing useMemo blocks
export function applyLeagueDisplayScale(status, ratings): Record<string, any>;

// React hook — memoised wrapper for use in components
export function useLeagueScaledRatings(status, rawRatings): Record<string, any>;

// Multipliers mirror getScaledRating() exactly
export const LEAGUE_DISPLAY_MULTIPLIERS = {
  Euroleague: 0.733,
  PBA:        0.62,
  'B-League': 0.68,
};
```

`hgt`, `ovr`, `pot`, `fuzz`, `injuryIndex`, `skills`, and `jerseyNumber` are **never scaled** — only the skill attributes (spd, fg, tp, etc.) are multiplied.

Components updated:
- `PlayerRatingsView.tsx` — uses `applyLeagueDisplayScale` inside the `rows` useMemo
- `PlayerRatingsModal.tsx` — uses `useLeagueScaledRatings` hook; also shows an amber league badge (e.g. "PBA • 62% strength") in the player header so it's clear ratings are nerfed

---

## Preseason International Games

**Status: Fully playable** (as of 2026-04-06).

Games scheduled via the **International Preseason** modal (`ADD_PRESEASON_INTERNATIONAL` action) are added to the schedule with `isPreseason: true` and the nonNBA team's `tid` as `homeTid` or `awayTid`.

The simulator now handles these correctly:
- When one side's `tid ≥ 100` (nonNBA offset), a **synthetic team object** is built on the fly
- That team's actual players (already in the shared `players` pool with their status tag) are used as the roster
- Sim stat multipliers from `getScaledRating()` still nerf their performance appropriately
- Standings and season stats are **not affected** (`isPreseason` flag skips score updates and stat accumulation)
- The game IS logged in boxScores and the game log for flavor/narrative

League strength baselines used for synthetic team:

| League     | Synthetic strength |
|------------|-------------------|
| Euroleague | 85                |
| WNBA       | 75                |
| PBA        | 72                |
| B-League   | 78                |

---

## Common Pitfalls

### Pitfall 1: Forgetting the `else if` chain in ChatWindow
`ChatWindow.tsx` has **three separate** org-lookup blocks (findParticipant × 2, handleSendMessage × 1). If you add a league to one, add it to all three. Use the `includes()` pattern — it handles future leagues automatically:
```ts
if (['PBA', 'WNBA', 'Euroleague', 'B-League'].includes(player.status || '')) {
  const team = state.nonNBATeams.find(t => t.league === player.status && t.tid === player.tid);
  ...
}
```

### Pitfall 2: TID offset collisions
Always check that your new league's offset range doesn't overlap existing ones. The current safe range for a new league is +500 or above.

### Pitfall 3: The internalId must be globally unique
External player `internalId` values should incorporate the TID offset or a league prefix to avoid collisions with NBA player IDs. Example: `bleague_${source_id}` or use the post-offset `tid` in the ID formula.

### Pitfall 4: Disk space during large edits
If your OS runs out of disk space mid-write (Edit tool write partially completes), a file can be zeroed to 0 bytes with no warning. **Always keep git clean before large sessions.** Recovery: `git checkout HEAD -- path/to/file`, then re-apply patches.

### Pitfall 5: `NonNBATeam.league` is a union type
TypeScript will error if you try to set `league: 'NewLeague'` without adding it to the union in `types.ts` first. Fix `types.ts` before implementing the fetch service.

### Pitfall 6: StarterService has its own copy of getScaledRating
`StarterService.ts` duplicates the `getScaledRating` function from `helpers.ts`. They must be kept in sync. Any new league's stat multiplier goes in **both** files.

---

## File Count Reference

Adding one external league requires changes to approximately **26+ files**. The largest categories:

| Category | File Count |
|----------|-----------|
| Type definitions | 1 |
| Fetch + init | 2 |
| Simulation | 2 |
| Chat/messaging UI | 3 |
| Player display UI | 6 |
| Modals | 5 |
| LLM/social/sim logic | 5 |
| Filter dropdowns | 4+ |

---

## Sim Multiplier Calibration

When choosing a sim multiplier for a new league, the question is: how much better is NBA competition?

Reference points:
- `0.62` = PBA (Philippine league, big gap from NBA)
- `0.68` = B-League (Japanese league, semi-pro quality)
- `0.733` = Euroleague (top European competition, some NBA-caliber players)

A player rated 75 OVR in the B-League would perform as if rated ~51 (`75 × 0.68`) in an NBA simulation. This prevents international signings from being OP while still rewarding finding gems.
