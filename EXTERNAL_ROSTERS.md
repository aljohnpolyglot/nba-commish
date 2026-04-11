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
| Euroleague | +1000  | 1000–1999   |
| PBA        | +2000  | 2000–2999   |
| WNBA       | +3000  | 3000–3999   |
| B-League   | +4000  | 4000–4999   |
| Endesa     | +5000  | 5000–5999   |
| G-League   | +6000  | 6000–6999   |

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

All external league attrs are **pre-scaled at fetch time** (`scaleRatings()` in `externalRosterService.ts`). Every downstream consumer — sim engine, AI trade logic, UI display — gets correctly scaled values automatically with no per-consumer multiplier logic needed.

### Multiplier Table

| League     | Attr Mult | hgt Mult | OVR Source | Notes |
|------------|-----------|----------|------------|-------|
| Euroleague | 0.780     | —        | srcOvr × mult | Best non-NBA competition |
| B-League   | 0.850     | —        | srcOvr × mult | Japan pro league |
| PBA        | 0.540     | 0.85     | calcRawOvr × mult | Philippines; hgt nerfed (source heights inflated); source `ovr` field is flat ~122 for all players so calcRawOvr used instead |
| WNBA       | —         | —        | item.ratings.ovr | Separate sim, not scaled |
| G-League   | 0.780     | —        | srcOvr × mult | NBA developmental; bumped from 0.750 |
| Endesa     | 0.830     | —        | srcOvr × mult | Liga ACB Spain; age<19 hidden; bumped from 0.800 |

> **Multipliers scale BBGM attribute ratings** — they are NOT a direct proxy for league-vs-NBA win probability. The source BBGM exports were auto-generated independently (Python scripts + browser console) and not calibrated to real-world league strength. Multipliers bring attr values into the right sim range.

### OVR Strategy (two paths in `computeLeagueOvr`)

Most leagues: **`srcOvr × mult`** — uses BBGM's own position-aware `ovr` field, which already has natural diversity per player. This is the preferred path.

PBA only: **`calcRawOvr × mult`** — PBA's BBGM export has a flat `ovr` of ~122 (outside normal 0-100 range) for every player, so we recompute from individual attrs instead.

Fallback: if `srcOvr` is missing or 0, falls through to `calcRawOvr`.

### Skipped attributes (never multiplied)
`hgt`, `ft`, `ovr`, `pot`, `fuzz`, `injuryIndex`, `skills`, `jerseyNumber`, non-numeric fields.

- **`hgt`** — physical measurement, not a skill level
- **`ft`** — free throw is pure shooting form; no defender guards you regardless of league level

### Adding a new league
One entry in `LEAGUE_MULTIPLIERS` (`leagueOvr/index.ts`) + call `scaleRatings(item.ratings, LEAGUE_MULTIPLIERS['NewLeague'])` in the fetch function. No changes needed to `helpers.ts`, `StarterService.ts`, or `useLeagueScaledRatings.ts`.

### Progression
External players **do progress** (daily attr drift + seasonal breakouts/busts). The fix: after each progression tick, OVR is recomputed using `calculateLeagueOverall(rating)` instead of `calculatePlayerOverallForYear`. The NBA formula has a `Math.max(40,...)` floor that floors scaled attrs to 40 → display 66. The external path avoids that floor entirely.

---

## Preseason International Games

**Status: Fully playable** (as of 2026-04-06). Updated 2026-04-09.

Games scheduled via the **International Preseason** modal (`ADD_PRESEASON_INTERNATIONAL` action) are added to the schedule with `isPreseason: true` and the nonNBA team's `tid` as `homeTid` or `awayTid`.

The simulator now handles these correctly:
- When one side's `tid ≥ 100` (nonNBA offset), a **synthetic team object** is built on the fly
- That team's actual players (already in the shared `players` pool with their status tag) are used as the roster
- Sim stat multipliers from `getScaledRating()` still nerf their performance appropriately
- Standings and season stats are **not affected** (`isPreseason` flag skips score updates and stat accumulation)
- The game IS logged in boxScores and the game log for flavor/narrative
- **Minimum 9 players required** per non-NBA team to schedule a game (enforced in the modal)

League strength for synthetic team: **computed from top-8 player OVR average** (not hardcoded). With correct multipliers, realistic gaps emerge automatically — PBA teams average ~40–45, G-League ~55–65, Euroleague top clubs ~65–75, NBA ~82–88.

### NBA Central — International Team Logos (Fixed 2026-04-09)

`DailyGamesBar` and `GameBar` (shown in `TeamDetailView` schedule strip) previously received only `state.teams`, so international teams (tid ≥ 100) were never resolved and their game cards returned null or showed no logo.

**Fix:** `NBACentral.tsx` now passes a merged array to both components:
```ts
[...state.teams, ...(state.nonNBATeams ?? []).map(t => ({
  id: t.tid, name: t.name, abbrev: t.abbrev, logoUrl: t.imgURL || '', ...
}))]
```
`DailyGamesBar` also renders a text-initial circle badge when `logoUrl` is empty (instead of a broken `<img>`).

### Game Preview Modal — International Starters (Fixed 2026-04-09)

`WatchGamePreviewModal` for `team.id >= 100` previously took the top-5 by OVR regardless of position. Now picks **1C → 2F → 2G** (each group sorted by OVR descending) with fallback fill from remaining roster if a position slot is empty. Uses `p.pos` field directly.

### `resolveTeam(tid)` — the canonical helper for mixed-league game lookups

Any place that needs a team object for a game that might involve an international team (tid ≥ 100) **must** use `resolveTeam(tid)` from `ScheduleView.tsx`. It checks `state.nonNBATeams` first, builds an `NBATeam`-shaped object (`id, name, abbrev, logoUrl: t.imgURL`), then falls back to `getTeamForGame`. **Never** call `getTeamForGame` directly when `tid` could be ≥ 100.

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

### Pitfall 6: Player list views must exclude Draft Prospects

Any view that lists players for browsing (e.g. `PlayerBiosView`) should filter out draft prospects:
```ts
if (p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect') return false;
```
Draft prospects have no bio data, no real stats, and `PlayerBioView` will show a near-empty card for them.

### Pitfall 7: External roster players in new player list views

When building a new player browsing view that passes a player to `PlayerBioView` on click, pass the player object directly (it has `status` set from `externalRosterService`). Do NOT re-look-up by name — the `status` field is load-bearing for `getNonNBABioData()` and the nonNBA gist fetch path.

**Why bios look blank**: External roster players (PBA/Euroleague/B-League/WNBA) will still show a bio but it may be sparse if:
- The player has no `notes` field (no gist match by name) — bio bullets are empty
- The player has no `imgURL` — portrait is blank

This is expected for players not covered by the gist data. `PlayerBioView` still renders; it just shows stats-bar data with no photo or bio bullets. Not a bug — data coverage limitation.

**The `playerLeague` classification in list views** must match the same logic as `status`:
```ts
const playerLeague = 
  p.status === 'Retired'    ? 'Retired'    :
  p.status === 'WNBA'       ? 'WNBA'       :
  p.status === 'PBA'        ? 'PBA'        :
  p.status === 'Euroleague' ? 'Euroleague' :
  p.status === 'B-League'   ? 'B-League'   : 'NBA';
```
If a new league is added, add its `status` string here too or its players will be mis-bucketed into the NBA filter.

### Pitfall 8 (was 6): StarterService has its own copy of getScaledRating
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
- `0.54` = PBA (Philippine league, large gap from NBA)
- `0.78` = G-League (NBA developmental, best non-NBA domestic players)
- `0.78` = Euroleague (top European competition, some NBA-caliber players)
- `0.83` = Endesa/ACB Spain (comparable to Euroleague top tier)
- `0.85` = B-League (Japan; elevated because source BBGM ratings are calibrated lower)

OVR is computed from the source BBGM `ovr` field × multiplier for most leagues (preserves BBGM's position-aware diversity). PBA uses calcRawOvr (source `ovr` is flat). A player with BBGM `ovr` = 75 in the Euroleague export shows as ~59 in the sim (`75 × 0.78`).
