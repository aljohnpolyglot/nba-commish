# Team Office — Integration Plan

> **Status:** Standalone UI built. Needs wiring to game state + sidebar.
> **Delete this file** when integration is complete.

---

## Current File Structure

```
src/components/central/view/TeamOffice/
├── TeamOfficeView.tsx          ← Main view (tab router)
├── data/
│   └── api.ts                  ← Data fetching (currently standalone, needs game state)
└── pages/
    ├── Home.tsx                ← Dashboard overview
    ├── GeneralManager.tsx      ← GM profile + trade tendencies
    ├── CoachingViewMain.tsx    ← Coaching staff overview
    ├── CoachingView/
    │   ├── CoachingView.tsx    ← Detailed coaching view
    │   ├── PlayerPortrait.tsx  ← Coach portrait component
    │   └── TeamCard.tsx        ← Team card for coaching
    ├── DraftPicks.tsx          ← Draft pick inventory
    ├── TeamIntel.tsx           ← Scouting / intel reports
    ├── TeamNeeds.tsx           ← Positional needs heatmap
    └── TradingBlock.tsx        ← Players on the trading block
```

Supporting files:
- `src/utils/coachSliders.ts` — Coaching slider definitions
- `src/utils/systemDescriptions.ts` — System/scheme descriptions

---

## Integration Steps

### Step 1: Wire to Sidebar (see SIDEBAR_SETUP.md)
1. Add `'Team Office'` to `Tab` type in `src/types.ts`
2. Add menu item to NavigationMenu.tsx (use `Building2` icon from lucide)
3. Add case to MainContent.tsx switch
4. Place in "Operations" or "League" group

### Step 2: Connect to Game State
Currently `data/api.ts` fetches from standalone sources. Replace with game state reads:

| Page | Data Source | Game State Connection |
|------|------------|----------------------|
| Home | — | `state.teams`, `state.leagueStats` |
| GeneralManager | staff gist | `state.staff.gms` — already loaded lazily |
| CoachingView | staff gist | `state.staff.coaches` — already loaded lazily |
| DraftPicks | — | `state.draftPicks` — already in state |
| TeamNeeds | — | Compute from `state.players` by position per team |
| TradingBlock | — | `player.onTradingBlock` flag (new) + mood ≤ -3 |
| TeamIntel | — | AI-generated scouting reports (LLM or template) |

### Step 3: GM Trade Tendencies
The GM data from the staff gist includes trade tendency fields. Wire these into:
- `AITradeHandler.ts` — GM with "aggressive" tendency proposes more trades
- `AIFreeAgentHandler.ts` — GM with "patient" tendency waits longer in FA
- Display in `GeneralManager.tsx` with slider visualizations

### Step 4: Trading Block Feature
New field on player: `onTradingBlock?: boolean`
- Commissioner can toggle in Team Office UI
- AI Trade handler respects it: players on block get proposed first
- Players with mood ≤ -3 auto-flagged as "wants out"
- Display: red border/badge on trading block page

### Step 5: Team Needs Heatmap
Compute from roster composition:
```ts
const needs = computeTeamNeeds(teamId, players);
// Returns: { PG: 'solid', SG: 'moderate', SF: 'major', PF: 'solid', C: 'major' }
// Based on: starter OVR at each position vs league average
```
Display as a 30×5 heatmap (all teams × 5 positions) with red/amber/green cells.

### Step 6: Coaching Sliders
`coachSliders.ts` defines slider categories. Wire to game state so changes persist:
- Store in `state.coachingSettings` per team
- Affect sim engine via `SimulatorKnobs` (e.g. pace slider → paceMultiplier adjustment)

---

## GM Trade Tendency Fields (from staff gist)

The staff gist GM entries may include:
- `tradeTendency`: 'aggressive' | 'moderate' | 'conservative'
- `buildStrategy`: 'win-now' | 'balanced' | 'rebuild'  
- `draftFocus`: 'best-available' | 'positional-need' | 'upside'

Wire into `AITradeHandler.ts`:
- Aggressive GMs: trade frequency ×1.5, more willing to overpay
- Conservative GMs: trade frequency ×0.5, only take clear wins
- Win-now GMs: protect picks less, target stars
- Rebuild GMs: hoard picks, dump salary

---

## Dependencies

- `state.staff` must be loaded (lazy load happens after init — verify timing)
- `SIDEBAR_SETUP.md` for wiring guide
- `RULES_SIM_CONNECTION_PLAN.md` for coaching slider → sim knob mapping
- `AITradeHandler.ts` for GM tendency integration
- `types.ts` for new fields (`onTradingBlock`, `coachingSettings`)

---

## Bugs to Address During Integration

- Team records not passed to League History view for best records display
- Staff coaches may not load in time for COY award (see TODO)
- GM names in trade proposals should come from `state.staff.gms` (partially done via `getGMName`)

---

## Session Notes

- Team Office was built as a standalone app before integration
- Files already exist in the repo (committed session 22)
- The `api.ts` data layer needs to be replaced with `useGame()` hooks
- Each page should be a React component that reads from `state` via `useGame()`
- No new API calls needed — all data is already in game state or staff gist

*Created: 2026-04-17 (session 22)*
