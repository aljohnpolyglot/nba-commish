# Sidebar Integration Guide

This guide explains how to add new views/tabs to the application sidebar and main content area.

## 3-Step Process to Add a New Sidebar Item

### Step 1: Update the Tab Type (`src/types.ts`)

Add your new view name to the `Tab` type union:

```typescript
export type Tab = 'Inbox' | 'Messages' | ... | 'Your New View';
```

**Example:**
```typescript
export type Tab = 'Inbox' | 'Messages' | 'Social Feed' | ... | 'Trade Machine' | 'Your New View';
```

---

### Step 2: Add Navigation Menu Item (`src/components/sidebar/NavigationMenu.tsx`)

#### 2a. Import the Icon
Add your icon from `lucide-react` at the top of the file:

```typescript
import {
  Inbox, MessageSquare, Newspaper, Activity, Trophy, Sparkles,
  // ... other icons ...
  YourIcon, // ← Add your icon here
} from 'lucide-react';
```

#### 2b. Add Menu Item to Group
Add your item to one of the `NavGroup` arrays in the `groups` constant:

```typescript
const groups: NavGroup[] = [
  {
    label: 'League',
    items: [
      { id: 'NBA Central', label: 'NBA Central', icon: Trophy },
      { id: 'Standings', label: 'Standings', icon: Table2 },
      { id: 'Transactions', label: 'Transactions', icon: ArrowRightLeft },
      { id: 'Your New View', label: 'Your New View', icon: YourIcon }, // ← Add here
      { id: 'Players', label: 'Players', icon: Search },
    ],
  },
  // ... other groups ...
];
```

**Available Groups:**
- `Command Center`
- `Communications`
- `League`
- `Analytics`
- `Draft`
- `Operations`
- `Personal`

**Icon Sources:** Browse [lucide-react icons](https://lucide.dev)

---

### Step 3: Wire Up the View (`src/components/layout/MainContent.tsx`)

#### 3a. Import Your View Component
At the top of the file:

```typescript
import { YourNewView } from '../path/to/YourNewView';
```

**Example:**
```typescript
import { TradeMachineView } from '../central/view/TradeMachineView';
```

#### 3b. Add Case to Switch Statement
Add your view case in the switch statement:

```typescript
export const MainContent: React.FC<MainContentProps> = ({ currentView }) => {
  switch (currentView) {
    // ... other cases ...
    case 'Your New View':
      return <YourNewView />;
    case 'Next Case':
      return <NextCase />;
    // ... rest of cases ...
  }
};
```

---

## Example: Adding "Trade Machine"

### Step 1: Update types.ts
```typescript
// Before
export type Tab = '...' | 'Transactions';

// After
export type Tab = '...' | 'Transactions' | 'Trade Machine';
```

### Step 2: Update NavigationMenu.tsx
```typescript
// Import icon
import { ..., Cpu } from 'lucide-react';

// Add to League group
{
  label: 'League',
  items: [
    { id: 'NBA Central', label: 'NBA Central', icon: Trophy },
    { id: 'Standings', label: 'Standings', icon: Table2 },
    { id: 'Transactions', label: 'Transactions', icon: ArrowRightLeft },
    { id: 'Trade Machine', label: 'Trade Machine', icon: Cpu }, // ← Added
    { id: 'Players', label: 'Players', icon: Search },
  ],
}
```

### Step 3: Update MainContent.tsx
```typescript
// Import
import { TradeMachineView } from '../central/view/TradeMachineView';

// Add case
case 'Trade Machine':
  return <TradeMachineView />;
```

---

## File Checklist

When adding a new sidebar item, modify these files in order:

- [ ] `src/types.ts` — Add to `Tab` type
- [ ] `src/components/sidebar/NavigationMenu.tsx` — Add menu item
- [ ] `src/components/layout/MainContent.tsx` — Import view & add case

---

## Tips

1. **Keep labels consistent** - The `id` in NavigationMenu must exactly match the `Tab` type
2. **Icon placement** - Menu items appear in the order they're defined in the `items` array
3. **Grouping** - Place related items in the same `NavGroup`
4. **Badges** - Add `badge: badgeValue` to show notification counts:
   ```typescript
   { id: 'Messages', label: 'Messages', icon: MessageSquare, badge: 5 }
   ```
5. **Lazy loading** - Views can be lazy-loaded for performance if needed

---

## Common Lucide Icons

| Icon | Name | Use Case |
|------|------|----------|
| `Cpu` | Cpu | Tools, Trade Machine |
| `ArrowRightLeft` | ArrowRightLeft | Transactions, Trades |
| `Search` | Search | Player Search, Browsing |
| `Trophy` | Trophy | League, Awards, Playoffs |
| `BarChart2` | BarChart2 | Statistics, Analytics |
| `Users` | Users | Teams, Players |
| `DollarSign` | DollarSign | Finances, Salary Cap |
| `Calendar` | Calendar | Schedule, Events |
| `Settings2` | Settings2 | Configuration, Options |

Find more at: https://lucide.dev

---

## Troubleshooting

### Sidebar item appears but view is blank
- ✅ Check `MainContent.tsx` has the case statement
- ✅ Verify the Tab name matches exactly (case-sensitive)
- ✅ Ensure view component is imported correctly

### Type errors
- ✅ Make sure you added the view name to the `Tab` type
- ✅ Check spelling is consistent across all 3 files

### Icon not showing
- ✅ Verify icon is imported from `lucide-react`
- ✅ Check the icon name matches lucide's naming

---

## Structure Overview

```
src/
├── types.ts                           ← Tab type union
├── components/
│   ├── sidebar/
│   │   └── NavigationMenu.tsx        ← Sidebar items
│   ├── layout/
│   │   └── MainContent.tsx           ← View routing
│   └── central/view/
│       ├── TradeMachineView.tsx       ← Your view component
│       └── ... other views
```

---

**Last Updated:** 2026-03-27

---

## Planned Feature: Player Creator

Purpose: add a commissioner-grade `Player Creator` sidebar view for creating fully custom players, inspired by Basketball GM's create-player screen but built around this app's existing NBAPlayer, K2/2K rating, facesjs, draft, team, and external-league systems.

### Design Goals

- Create a player into any roster state: NBA team, free agent, draft prospect, retired, or supported external league team.
- Edit real basketball body data: height, weight, wingspan, position, jersey number, age, country, college/path, draft metadata, salary, contract expiration, injury, Hall of Fame, mood traits, and face/photo.
- Provide a 2K-build-editor-style ratings workflow: physical measurements drive the locked BBGM `hgt` value and K2 detailed attributes show live 2K-style category/sub-rating feedback.
- Reuse existing generation logic where possible: `facesjs` basketball-constrained faces from `genDraftPlayers.ts`, archetype profiles from `ARCHETYPE_PROFILES`, K2 conversion from `k2Engine.ts`, and external salary/team conventions from `externalLeagueSustainer.ts`.
- Avoid copying the Basketball GM UI directly. Use it only as a field checklist and inspiration.

### Sidebar Wiring

Add a new view named `Player Creator`.

Files:

- [ ] `src/types.ts` - add `'Player Creator'` to the `Tab` union.
- [ ] `src/components/sidebar/NavigationMenu.tsx` - add a menu item, likely under `Operations` for commissioner mode. Suggested icon: `UserPlus` from `lucide-react`.
- [ ] `src/components/layout/MainContent.tsx` - import and route `PlayerCreatorView`.
- [ ] New component: `src/components/central/view/PlayerCreatorView.tsx`.
- [ ] New service: `src/services/playerCreator.ts`.
- [ ] Optional shared helpers: `src/utils/playerMeasurements.ts`, `src/utils/playerCreatorValidation.ts`.

Recommended placement:

```typescript
// NavigationMenu.tsx, Operations group, commissioner mode only
{ id: 'Player Creator' as Tab, label: 'Player Creator', icon: UserPlus }
```

### Existing Code To Reuse

- `src/components/central/view/TeamOffice/pages/lib/k2Engine.ts`
  - Use `calculateK2`, `K2_CATS`, `convertTo2KRating`, and `calculateOverallFromRating`.
  - Keep one source of truth for K2 preview and overall calculation.
- `src/components/modals/PlayerRatingsModal.tsx`
  - Reuse the BBGM rating keys, display names, K2 category layout, and 2K direct-edit driver concept.
  - Improve it for creator mode by allowing height/body edits instead of keeping height locked.
- `src/services/genDraftPlayers.ts`
  - Reuse `ARCHETYPE_PROFILES`, `potEstimator`, `pickWeighted`, `sandboxToNBAPlayer`, and the basketball-filtered `facesjs` generation approach.
  - Consider exporting a small `generateBasketballFace(opts)` helper so the creator does not duplicate private face-generation code.
- `src/services/externalLeagueSustainer.ts`
  - Reuse salary scale and external-team status conventions.
  - Match external league player creation to `status`, `tid`, `contract`, `contractYears`, nationality, and league caps.

### Data Model

Create a `PlayerCreatorForm` type in `playerCreator.ts`.

Core identity:

- `firstName`, `lastName`, `knownAs`
- `age`, `bornYear`, `country`, `college`
- `position`
- `jerseyNumber`
- `teamMode`: `activeTeam | freeAgent | draftProspect | retired | externalTeam`
- `tid`
- `status`

Body and build:

- `heightIn`
- `weightLbs`
- `wingspanIn`
- `bodyType`: `slight | lean | normal | strong | bulky`
- `handedness`
- `finalHgt`, `finalWeight`

Ratings:

- BBGM ratings: `hgt`, `stre`, `spd`, `jmp`, `endu`, `ins`, `dnk`, `ft`, `fg`, `tp`, `oiq`, `diq`, `drb`, `pss`, `reb`
- Extra 2K-flavored traits already used elsewhere: `drivingDunk`, `standingDunk`, `durability`, `composure`, `clutch`, `workEthic`
- `overallRating`, `potential`
- Optional creator metadata: `creatorPreset`, `archetype`, `ratingsLocked`

Contract and draft:

- `contract.amount` in thousands, matching `NBAPlayer.contract.amount`
- `contract.exp`
- `contractYears` rows for salary display consistency
- `draft.year`, `draft.round`, `draft.pick`, `draft.tid`, `draft.originalTid`

Appearance:

- `face` from `facesjs`
- `imgURL`
- `race`
- `nationality`

### Measurement Rules

Use body measurements to drive ratings instead of letting the user enter contradictory data.

- Convert height to BBGM `hgt`: existing draft generation maps 68-90 inches to 0-99. Keep that mapping for consistency:

```typescript
hgt = clamp(round(((heightIn - 68) / 22) * 99), 0, 99)
```

- Wingspan should affect K2/display traits, not replace height:
  - Longer wingspan boosts block, standing dunk, interior defense, rebounding, and shot contest.
  - Shorter wingspan slightly boosts ball handle, speed with ball, shooting consistency, and agility.
  - Store `wingspanIn` on the player as custom metadata for future systems.
- Weight/body type should affect `stre`, `spd`, `jmp`, `endu`, and durability:
  - Heavier/stronger builds gain strength and post control.
  - Lighter builds gain speed/agility but lose strength/interior defense.
  - Avoid unrealistic min-maxing by applying capped adjustments.

### Creator UI Concept

Layout:

- Left panel: identity, team assignment, body, contract, draft, appearance.
- Right panel: live player card, K2 radar, overall/potential, rating editor.
- Bottom sticky action: `Create Player`, `Create And Open Bio`, `Reset`, `Randomize`.

Sections:

- `Identity`
  - Name fields with random buttons.
  - Age/country/college/path.
  - Position and jersey number.
- `Assignment`
  - Team select includes Free Agent, Draft Prospect, Retired, NBA teams, and external teams.
  - Changing assignment sets `tid` and `status` correctly.
- `Build Editor`
  - Height, weight, wingspan, body type.
  - Presets: Small Guard, Scoring Wing, 3&D Wing, Point Forward, Stretch Big, Rim Runner, Unicorn, Custom.
  - Live warnings for unrealistic combinations.
- `Ratings`
  - Simple BBGM sliders.
  - Detailed 2K/K2 sliders grouped by category.
  - Archetype randomizer using `ARCHETYPE_PROFILES`.
  - Overall and potential preview.
- `Contract`
  - Salary amount in `$M`, saved as thousands.
  - Expiration year.
  - Options for rookie, two-way, non-guaranteed, player option if needed later.
- `Draft`
  - Draft class, round, pick, draft team.
  - If assignment is Draft Prospect, default `tid = -2` and `status = 'Draft Prospect'`.
- `Appearance`
  - facesjs random face.
  - Image URL override.
  - Race/gender options if exposed.

### State Mutation Plan

Current issue: `useGameActions.ts` has `updatePlayerRatings`, but no general player creation action.

Add:

```typescript
createPlayer: (player: NBAPlayer, options?: { openBio?: boolean }) => void
```

Behavior:

- Append the player to `state.players`.
- Add a transaction/history entry:
  - NBA team: signed/created for team.
  - Free agent: entered player pool.
  - Draft prospect: added to draft class.
  - External team: joined external league team.
  - Retired: added as retired historical player.
- Normalize jersey number if assigned to a team.
- Generate `contractYears` when a contract exists.
- Recalculate team strengths if needed by existing post-processors.

### Creation Service

`src/services/playerCreator.ts` should expose:

```typescript
export function buildCreatedPlayer(
  form: PlayerCreatorForm,
  context: {
    season: number;
    date: string;
    salaryCap: number;
    teams: any[];
    nonNBATeams: any[];
    existingPlayers: NBAPlayer[];
  }
): NBAPlayer
```

Responsibilities:

- Validate and clamp input.
- Build a stable `internalId`, e.g. `created-${Date.now()}-${slug}`.
- Derive `born.year` from season and age.
- Derive `ratings[0]` with current season, `ovr`, `pot`, and all BBGM attrs.
- Derive `overallRating` using `calculateOverallFromRating` or `calculatePlayerOverallForYear`.
- Derive `potential` using form value or `potEstimator`.
- Build `contract` and `contractYears`.
- Attach extra attributes used by simulation: `drivingDunk`, `standingDunk`, `durability`, `composure`, `clutch`, `workEthic`, `archetype`, `face`, `race`, `nationality`, `finalHgt`, `finalWeight`, `wingspanIn`.
- Return a valid `NBAPlayer`.

### Validation Rules

- Height: 60-91 inches hard clamp. Warn below 68 or above 90 because core generation expects 68-90.
- Wingspan: height - 4 to height + 12.
- Weight: 140-340 lbs.
- Age: 15-50 for active/prospect, higher allowed only for retired historical players.
- Salary: never negative. Store as thousands.
- Draft prospect cannot have an active NBA `tid`; must use `tid = -2`.
- Free agent must use `tid = -1` and `status = 'Free Agent'`.
- Active NBA player must use an NBA team `id` and `status = 'Active'`.
- External player must use external `tid` and status matching the team league.
- Retired player should have `status = 'Retired'`, `retiredYear`, and no active contract unless intentionally preserved for history.

### Implementation Phases

1. Foundation
   - Add `Player Creator` sidebar route.
   - Add `createPlayer` action.
   - Add `playerCreator.ts` service with validation and `NBAPlayer` builder.

2. Creator UI
   - Build `PlayerCreatorView.tsx`.
   - Include identity, assignment, build, contract, draft, appearance, and rating sections.
   - Add live preview using `calculateK2` and `PlayerPortrait`.

3. Rating/Build Integration
   - Extract shared constants from `PlayerRatingsModal.tsx` if useful: BBGM names, editable keys, K2 drivers.
   - Add wingspan/body adjustments.
   - Add archetype presets from `ARCHETYPE_PROFILES`.

4. Face Generation
   - Export/reuse basketball-only facesjs helper from `genDraftPlayers.ts`.
   - Add randomize face and randomize identity buttons.

5. Persistence and UX Polish
   - Add success toast/history entry.
   - Add `Create And Open Bio`.
   - Guard against duplicate jersey numbers.
   - Add reset/randomize buttons.

6. Testing
   - Unit test `buildCreatedPlayer`.
   - Test NBA team, free agent, draft prospect, external team, and retired outputs.
   - Test salary conversion and `contractYears`.
   - Smoke test sidebar route and creation flow.

### Non-Goals For First Version

- No full custom league-file editor.
- No complex badge/tendency editor unless the current sim uses those fields.
- No direct editing of existing players from this view; existing player edits should remain in player bio/ratings modal until a separate editor is planned.
- No attempt to perfectly clone Basketball GM form layout.
