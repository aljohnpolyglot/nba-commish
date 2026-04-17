# Team Office — Integration Plan

> **Status:** Standalone UI fully built (all pages have content). Needs: missing lib/utils files, sidebar wiring, game state connection.
> **Delete this file** when integration is complete.

---

## Current File Structure

```
src/components/central/view/TeamOffice/
├── TeamOfficeView.tsx          ← Main view (BrowserRouter + Layout) — 5.7 KB ✅
├── data/
│   ├── api.ts                  ← Standalone data fetcher (2K gist + BBGM roster) — 7.5 KB ✅
│   └── staff.ts                ← ❌ MISSING — imported by GeneralManager.tsx
└── pages/
    ├── Home.tsx                ← Team selector grid (30 teams, logo + OVR) — 4.7 KB ✅
    ├── GeneralManager.tsx      ← GM profile + attribute bars (trade aggression, scouting, etc.) — 9 KB ✅
    ├── CoachingViewMain.tsx    ← Standalone coaching app (fetches own data) — 8.5 KB ✅
    ├── CoachingView/
    │   ├── CoachingView.tsx    ← Detailed coaching view (court SVG, systems, roster) — 39.9 KB ✅
    │   ├── PlayerPortrait.tsx  ← Coach portrait with OVR badge — 2.9 KB ✅
    │   └── TeamCard.tsx        ← Team card with K2 sliders/proficiencies — 11.5 KB ✅
    ├── DraftPicks.tsx          ← Placeholder (just shows "Draft Picks UI Placeholder") — 1.1 KB ⚠️
    ├── TeamIntel.tsx           ← Scouting report (lineup, cap space, status, expiring) — 11.7 KB ✅
    ├── TeamNeeds.tsx           ← Positional strength + category needs (grades A-F) — 11.3 KB ✅
    └── TradingBlock.tsx        ← 3-column (Targets, Block, Untouchables) + PlayerPortrait — 12.5 KB ✅

Missing utility files (referenced but don't exist):
├── lib/
│   ├── utils.ts                ← ❌ MISSING — exports `cn()` (classname merge)
│   ├── staffService.ts         ← ❌ MISSING — exports coach data functions
│   ├── k2Engine.ts             ← ❌ MISSING — exports `convertTo2KRating`
│   ├── starterService.ts       ← ❌ MISSING — exports `StarterService`
│   └── systemDescriptions.ts   ← ❌ MISSING — exports system/scheme descriptions
├── utils/
│   └── nbaTeams.ts             ← ❌ MISSING — exports `NBA_TEAMS`, `getTeamLogo`
└── data/
    └── staff.ts                ← ❌ MISSING — exports `getStaffData`, `getGMRatings`, `StaffData`, `EnrichedStaffMember`
```

---

## What's Built (Page-by-Page)

### TeamOfficeView.tsx
- Uses `BrowserRouter` + `react-router-dom` (standalone app pattern)
- `Layout` component: top nav bar ("Team **Office**"), team selector header, tab navigation
- Tabs: General Manager, Coaching, Team Intel, Team Needs, Trade Hub, Draft Picks
- Uses `Outlet` context to pass `{ currentTeam, setCurrentTeam }` to child pages
- **Integration issue:** BrowserRouter conflicts with main app's router — needs refactor to local state tabs

### Home.tsx
- Team selector grid (30 teams) — loads from `data/api.ts` `loadRatings()`
- Shows team logo (NBA CDN), player count, Team OVR (top-8 average)
- Click → sets currentTeam + navigates to `/general-manager`
- **Integration note:** Replace `loadRatings()` with `useGame().state.teams` + `state.players`

### GeneralManager.tsx
- GM profile hero banner (portrait, name, years with team, trades, drafts)
- GM Attribute bars: Trade Aggression, Scouting Focus, Work Ethic, Spending (50-100 scale)
- Fetches from `data/staff.ts` (`getStaffData`, `getGMRatings`) — **file doesn't exist yet**
- Has detailed integration notes in comments about how attributes map to AI behavior:
  - Trade Aggression 80+: spam trade offers; 50-60: rarely initiates
  - Scouting Focus high: values picks > 75 OVR players; low: values "win now" players
  - Work Ethic high: constant roster churn; low: stable roster
  - Spending above 75: overpays 10-20%; 50-60: lowballs

### CoachingViewMain.tsx
- Standalone app — fetches BBGM roster JSON + staff gist independently
- Computes K2 ratings, 2K ratings, coach sliders, system proficiencies
- Imports from `./lib/k2Engine`, `./lib/staffService`, `./lib/coachSliders` (standalone lib, different from `../lib/`)
- **Integration note:** This is the entry point that feeds data into `CoachingView/CoachingView.tsx`

### CoachingView/CoachingView.tsx (39.9 KB — largest file)
- Court SVG visualization with player positions
- Coaching system selector with proficiency ratings
- Coach info (photo, bio, contract from staffService)
- Player K2 breakdown, starter rotation, bench analysis
- Imports: `../lib/staffService`, `../lib/starterService`, `../lib/systemDescriptions`

### CoachingView/PlayerPortrait.tsx
- Portrait component with OVR badge, team logo badge, incoming arrow
- Uses `../lib/k2Engine` for `convertTo2KRating`
- Comment says "delete this because this is already from shared" — duplicate of TradingBlock's PlayerPortrait

### CoachingView/TeamCard.tsx
- Team summary card with K2 category bars, preference sliders, system proficiencies
- Uses local types (`K2Result`, `PlayerK2`, `CoachSliders`)

### DraftPicks.tsx
- **Placeholder only** — shows centered icon + "Draft Picks UI Placeholder" text
- Comment: "Import the picks UI from the main game here"
- Needs: wire to `state.draftPicks` and build actual pick inventory table

### TeamIntel.tsx
- Team scouting report: hero banner (logo, record, cap space), lineup sidebar, status text
- Status computed from top-8 OVR: CONTENDING / BUYING / REBUILDING
- Dynamic prose based on status (trade outlook, untouchables, expiring contracts)
- Has extensive inline comments with exact text templates for each status

### TeamNeeds.tsx
- Two panels: Positional Strength (PG-C bars) + Category Needs (11 categories graded A+-F)
- Categories: 3PT Shooting, Int Defense, Per Defense, Rebounding, Playmaking, Inside Scoring, Ball Handling, Shot Creation, Mid-Range, Basketball IQ, Size
- Computes vs league averages — "Gap" badge when below average

### TradingBlock.tsx
- Three columns: Target List, Trading Block, Untouchables (3 players each)
- `calculateTradeValue()` function: OVR/POT-based with contract surplus, age penalty, expiring discount
- Mode-aware: contend vs rebuild affects who goes on block and who's targeted
- "Add Item" button placeholder (comment: use All-Star replacements modal style)
- Exports shared `PlayerPortrait` component used by other pages

---

## Integration Steps

### Step 1: Create Missing Utility Files
These files are imported but don't exist — the app won't compile without them.

| Missing File | Imported By | What It Needs |
|-------------|------------|---------------|
| `lib/utils.ts` | Home, GM, TeamIntel, TeamNeeds, TradingBlock | `cn()` — use `clsx` + `tailwind-merge` or copy from shadcn |
| `utils/nbaTeams.ts` | Home, GM, TeamIntel, TeamOfficeView | `NBA_TEAMS` (id, name, primaryColor), `getTeamLogo(name)` |
| `data/staff.ts` | GeneralManager | `getStaffData()`, `getGMRatings()`, `StaffData`, `EnrichedStaffMember` types |
| `lib/staffService.ts` | CoachingView | Coach data functions (photos, bios, 2K data, contracts, assistants) |
| `lib/k2Engine.ts` | CoachingViewMain, PlayerPortrait | `calculateK2`, `getSystemProficiency`, `convertTo2KRating`, `calculateOverallFromRating` |
| `lib/starterService.ts` | CoachingView | `StarterService` class |
| `lib/systemDescriptions.ts` | CoachingView | System/scheme description text map |

**Option A (standalone first):** Create these files to make TeamOffice work as-is with standalone data.
**Option B (integrate directly):** Skip standalone files, refactor pages to use `useGame()` + main app services.

### Step 2: Wire to Sidebar
1. Add `'Team Office'` to `Tab` type in `src/types.ts:1154`
2. Add menu item to `NavigationMenu.tsx:165-172` ("Operations" group, use `Briefcase` icon — `Building2` already used by League Office)
3. Add `case 'Team Office':` to `MainContent.tsx` switch (before `default:` at line 233)

### Step 3: Refactor TeamOfficeView.tsx Router
Current: uses `BrowserRouter` + `Routes` + `react-router-dom` (standalone app pattern).
Problem: main app already has its own router — nested BrowserRouter will conflict.
Fix: replace with local `useState` tab switching (like other views in the app).

```
TeamOfficeView.tsx should:
1. Accept selectedTeamId prop (or manage internally)
2. Use useState for active tab ('home'|'gm'|'coaching'|'intel'|'needs'|'trading'|'picks')
3. Render the matching page component directly (no Routes)
4. Pass team data via props instead of Outlet context
```

### Step 4: Connect Pages to Game State
Replace `loadRatings()` / standalone fetches with `useGame()` hook reads.

| Page | Currently Fetches | Replace With |
|------|------------------|-------------|
| Home | `loadRatings()` → 2K gist + BBGM roster | `state.teams` (NBATeam[]) — render team grid from game state |
| GeneralManager | `loadRatings()` + `getStaffData()` + `getGMRatings()` | `state.staff.gms` + new `state.staff.gmRatings` |
| CoachingViewMain | BBGM roster JSON + staff gist (full standalone fetch) | `state.players` + `state.teams` + `state.staff.coaches` |
| CoachingView | `../lib/staffService` (coach photos/bios/contracts) | Merge coach data into `state.staff` at lazy-load time |
| TeamIntel | `loadRatings()` | `state.teams` + `state.players` (compute lineup, cap, status) |
| TeamNeeds | `loadRatings()` | `state.players` (compute positional + category needs) |
| TradingBlock | `loadRatings()` | `state.players` + future `player.onTradingBlock` flag |
| DraftPicks | Nothing (placeholder) | `state.draftPicks` — build real pick inventory table |

### Step 5: Extend Staff Service + State
Merge standalone staff/coach/GM data into the existing `staffService.ts` + `state.staff`:

1. **Add to `StaffData` interface** (`types.ts:750`):
   ```ts
   coachBios?: Map<string, CoachData>;
   coachContracts?: Map<string, CoachContractData>;
   gmRatings?: GMRating[];
   ```

2. **Add to `staffService.ts`** (`src/services/staffService.ts`):
   - `fetchCoachData()` — load photos + bios + 2K + contracts (cached)
   - `getGMRatings()` — fetch from `nbagmratings` gist
   - Individual lookup functions: `getCoachPhoto`, `getCoachBio`, `getNBA2KCoach`, etc.

3. **Lazy-load in GameContext.tsx** (alongside existing staff load at line 676):
   - Fetch coach bios/contracts/GM ratings in parallel with staff gist
   - Store in `state.staff.coachBios`, `state.staff.coachContracts`, `state.staff.gmRatings`

### Step 6: GM Attributes → AI Trade Handler
Wire GM attributes from `GeneralManager.tsx` into `AITradeHandler.ts`:

| Attribute | AI Behavior |
|-----------|------------|
| Trade Aggression 80+ | `generateAIDayTradeProposals` frequency ×1.5, more proposals per day |
| Trade Aggression 50-60 | frequency ×0.5, declines most offers |
| Scouting Focus high (70+) | Values picks > 75 OVR players — "sell high" on vets |
| Scouting Focus low (50-60) | Values win-now players — treats picks as filler |
| Work Ethic high (70+) | Constant roster churn — cycles bench/FAs for marginal upgrades |
| Work Ethic low (50-60) | Stable roster from opening night to playoffs |
| Spending above 75 | Offers 10-20% above market value |
| Spending 50-60 | Lowballs, walks away if player asks for more |

### Step 7: Trading Block Feature (New)
1. Add `onTradingBlock?: boolean` to `NBAPlayer` interface (`types.ts:623`)
2. Commissioner can toggle in TradingBlock page UI ("Add Item" button → player selector modal)
3. `AITradeHandler.ts` respects it: trading block players proposed first
4. Players with mood ≤ -3 auto-flagged as "wants out"
5. A player CANNOT be on both Untouchables and Trading Block (already enforced in UI logic)

### Step 8: Build Real DraftPicks Page
Replace placeholder with actual pick inventory:
- Read `state.draftPicks` filtered by team
- Show: round, season, original team, current owner
- Mark traded picks visually
- Group by season (current year + future)

---

## Staff Service Data Sources

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
{
  name: string;
  tenures: [{ team, span }];
  stats: { trades, drafts };
  attributes: { trade_aggression, scouting_focus, work_ethic, spending }; // 50-100 scale
}
```

### Staff Service Functions (needed in lib/staffService.ts)

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

---

## Key In-Code Notes (from the user's comments)

These comments are embedded in the source files — preserve their intent during integration:

- **TeamOfficeView.tsx:152** — "Remove this dropdown of team and team logo in the future. It will be connected directly to the whole team office UI in the header."
- **TeamOfficeView.tsx:90** — "This second tab is reserved for Coaching.tsx which is developed in isolation"
- **TeamOfficeView.tsx:95** — "This tab should list all available picks of the team based on game state. Import the picks UI from the main game."
- **GeneralManager.tsx:100-118** — Detailed GM attribute → AI behavior mapping notes
- **TeamIntel.tsx:129** — "Clicking player name here opens their playerbioview"
- **TeamIntel.tsx:144-168** — Detailed status text templates (REBUILDING, BUYING, CONTENDING)
- **TradingBlock.tsx:99-101** — "Untouchables list can hold up to 10 players. A player CANNOT be on both lists."
- **TradingBlock.tsx:161** — "Add Item button opens a specific team player selector modal. Use the UI/modal style from 'all star replacements' because it 'looks sick'."
- **TradingBlock.tsx:139** — "Do not change anything here. Keep everything 1:1, just changing the game state."
- **TradingBlock.tsx:220** — "Default to the game player portrait vs CDN here."
- **CoachingView/PlayerPortrait.tsx:1** — "delete this because this is already from shared"

---

## Bugs to Address During Integration

- Team records not passed to League History view for best records display
- Staff coaches may not load in time for COY award (see TODO)
- GM names in trade proposals should come from `state.staff.gms` (partially done via `getGMName`)
- CoachingView/PlayerPortrait.tsx is a duplicate — delete and use TradingBlock's shared `PlayerPortrait` export

---

## Duplicate Code to Consolidate

| Component | Location A | Location B | Resolution |
|-----------|-----------|-----------|------------|
| PlayerPortrait | `TradingBlock.tsx:200-318` (shared export) | `CoachingView/PlayerPortrait.tsx` (standalone) | Delete CoachingView/PlayerPortrait.tsx, import from TradingBlock |
| cn() | Needs `lib/utils.ts` | Main app may already have this | Use main app's if exists, otherwise create |
| NBA_TEAMS | Needs `utils/nbaTeams.ts` | Could exist elsewhere in main app | Check main app for team data utilities |
| Staff fetching | `data/api.ts` (standalone) + `data/staff.ts` (missing) | `src/services/staffService.ts` (main app) | Use main app's staffService via `state.staff` |

---

*Updated: 2026-04-17 (session 23 — accurate audit of all built files)*
