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

---

## Staff Service Data Sources (Updated)

### Gist URLs
| Data | URL |
|------|-----|
| Staff (owners/GMs/coaches/league office) | `https://gist.githubusercontent.com/aljohnpolyglot/27eff0d6d9a204338987e03c7f3bf444/raw/staff_complete_2025` |
| GM Ratings | `https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbagmratings` |
| Coach Photos | `https://gist.githubusercontent.com/aljohnpolyglot/60f5ef1e4d09066d1001a9acf3de127a/raw/516852da634669f0f2cd68d6fb1ba5371cb5d15a/coach_photos.json` |
| Coach Bios | `https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbacoachesbio` |
| NBA2K Coach List | `https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nba2kcoachlist` |
| Coach Contracts | `https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbacoachescontract` |
| Coach Assistants Worker | `https://fragrant-bar-f766.mogatas-princealjohn-05082003.workers.dev/?slug={slug}` |

### Data Types

**CoachData** (from `nbacoachesbio`):
```ts
{ staff, team, startSeason, yearsInRole, birthDate, nationality, img? }
```

**NBA2KCoachData** (from `nba2kcoachlist`):
```ts
{ name, image, url, team, position, league, born, age, nationality, college?, coaching_career?, career_history?, playing_career?, nba_draft?, high_school?, weight?, height? }
```

**CoachContractData** (from `nbacoachescontract`):
```ts
{
  name, total_exp_years, current_team_2026,
  history: [{ team, contract_length, start_year, end_year, annual_salary, total_value }]
}
```

**GM Ratings** (from `nbagmratings`):
```ts
// Array of GM objects with trade tendency, build strategy, draft focus fields
// Exact schema TBD — fetch and log to see structure
```

### Staff Service Functions (from api.ts)

```ts
getStaffData(players, teamNameMap)  → { owners, gms, coaches, leagueOffice }
getGMRatings()                      → GM ratings array
fetchCoachData()                    → loads photos + bios + 2K + contracts (cached)
getCoachPhoto(name)                 → image URL
getCoachBio(name)                   → CoachData
getNBA2KCoach(name)                 → NBA2KCoachData
getTeamStaff(teamName)              → NBA2KCoachData[] (all staff for team)
getCoachContract(name)              → CoachContractData
getCoachAssistants(coachName)       → string[] (scraped from worker)
normalizeName(name)                 → lowercase stripped string for matching
```

### Image Priority for Staff
1. Explicit override (`COACH_IMAGES`, `OWNER_IMAGES`)
2. `imageUrl` from gist
3. RealGM pattern: `basketball.realgm.com/images/nba/4.2/profiles/photos/2006/{Last}_{First}.jpg`
4. Player portrait match (if staff member was a former player)
5. Team logo fallback

### Owner Replacement Pool (for fire/hire UI)
```ts
['Mark Cuban', 'Peter Guber', 'Larry Ellison', 'David Tepper', 'Tilman Fertitta']
```

### EnrichedStaffMember Type
```ts
interface EnrichedStaffMember {
  name: string;
  position?: string;      // team name (new gist format)
  team?: string;           // team name (legacy format)
  jobTitle?: string;
  imageUrl?: string | null;
  playerPortraitUrl?: string;  // resolved portrait
  teamLogoUrl?: string;        // fallback logo
}
```

### Migration Plan for api.ts → Game State

The current `api.ts` in TeamOffice fetches independently. Migration:

1. **Move staff fetching to `staffService.ts`** (already exists at `src/services/staffService.ts`)
   - Merge `getStaffData`, `fetchCoachData`, `getGMRatings` into the existing service
   - Store results in `state.staff` (already has `owners`, `gms`, `coaches`, `leagueOffice`)
   - Add new fields: `state.staff.coachBios`, `state.staff.coachContracts`, `state.staff.gmRatings`

2. **TeamOffice pages use `useGame()` hook** instead of direct fetch
   - `Home.tsx` → reads `state.teams`, `state.staff`, `state.leagueStats`
   - `GeneralManager.tsx` → reads `state.staff.gms` + `state.staff.gmRatings`
   - `CoachingView.tsx` → reads `state.staff.coaches` + coach bios/contracts/photos
   - `DraftPicks.tsx` → reads `state.draftPicks`
   - `TeamNeeds.tsx` → computes from `state.players` by position
   - `TradingBlock.tsx` → reads `player.onTradingBlock` + mood ≤ -3
   - `TeamIntel.tsx` → AI-generated or template-based scouting

3. **GM Ratings → AI Trade Handler**
   - Load at init alongside staff data
   - Pass GM tendency to `generateAIDayTradeProposals`
   - Aggressive GM: frequency ×1.5, overpay tolerance +10%
   - Conservative GM: frequency ×0.5, only clear wins
   - Win-now GM: protect picks less, target stars
   - Rebuild GM: hoard picks, dump salary

*Created: 2026-04-17 (session 22)*
