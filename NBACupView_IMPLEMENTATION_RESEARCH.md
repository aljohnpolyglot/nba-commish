# NBACupView Implementation Research

## Scope

This document is a code-level implementation audit of `src/components/central/view/NBACupView.tsx`, based on:

- `README.md`
- `CLAUDE.md`
- `TODO.md`
- `src/components/central/view/NBACupView.tsx`
- `src/components/layout/MainContent.tsx`
- `src/types.ts`

It focuses on what the view actually does today, how it is wired, what data it expects, and what is currently broken or incomplete.

## High-Level Verdict

`NBACupView.tsx` is a self-contained, presentation-heavy React view for displaying historical NBA Cup data from a remote JSON source, but it is not currently integrated into the app’s main navigation flow and appears partially malformed.

The important implementation conclusion is:

1. The component has a complete UI concept and internal rendering logic.
2. It fetches remote historical data instead of reading from `GameState`.
3. It is not exposed through the app’s `Tab` routing.
4. The file currently contains structural problems that strongly suggest it is unfinished or dead code.

## Project Context From Root Docs

### README implications

The project architecture described in `README.md` says the app is centered on a single in-memory `GameState` object and routed through React views. The important rule is that league/player/team information should normally come from app state, not ad hoc external fetches.

That matters here because `NBACupView` does **not** use `useGame()` or `GameState`. It bypasses the sim state entirely and fetches from:

- `https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/nbacupdata`

See `src/components/central/view/NBACupView.tsx:18,321-340`.

### CLAUDE implications

`CLAUDE.md` is mostly economy-specific, but the practical takeaway for this view is that this codebase expects working, integrated features rather than isolated prototypes. `NBACupView` currently does not meet that bar because it is not routed and contains file-shape issues.

### TODO implications

`TODO.md` does not mention `NBACupView`, which is also a signal: this view is not part of the active implementation pipeline right now.

## Routing and Reachability

`NBACupView` is defined as a default export in:

- `src/components/central/view/NBACupView.tsx:315`

But it is **not** imported or rendered in `MainContent.tsx`.

Relevant evidence:

- `src/components/layout/MainContent.tsx:1-54` imports many major views, but not `NBACupView`
- `src/components/layout/MainContent.tsx:61-264` switches on `Tab`
- `src/types.ts:1279-1280` defines the `Tab` union

There is no `NBA Cup` tab in `Tab`, and no `case` in `MainContent` that renders `NBACupView`.

### Practical result

As currently written, this view is not part of the normal app shell. Even if the file compiles, the user cannot reach it through the main routed interface.

## File Structure Audit

## Imports

`NBACupView.tsx` imports:

- React hooks from `react` at `:2`
- animation primitives from `motion/react` at `:3`
- icons from `lucide-react` at `:4-15`
- types from `../types` at `:16`

### Issue: invalid or missing relative type import

The file imports:

```ts
import { NBACupYearData, Standing, BracketTeam, WikiYearData, WikiTable } from '../types';
```

at `src/components/central/view/NBACupView.tsx:16`.

But under `src/components/central`, there is no matching `types.ts` file. The actual workspace listing shows only:

- `src/components/central/view/`
- `src/components/central/StandingsTable.tsx`

So `../types` does not resolve to an existing source file in this directory structure.

### Issue: duplicated local types in same file

The file later declares the same data interfaces locally at:

- `Standing` at `:878-889`
- `BracketTeam` at `:895-899`
- `NBACupYearData` at `:901-921`
- `WikiTable` at `:924-928`
- `WikiYearData` at `:930-938`

So the file both imports those types and defines them locally. That is internally inconsistent.

## Major structural problem at file tail

After the React component code ends, the file continues with:

- raw Tailwind CSS `@import "tailwindcss";` at `:866`
- an `@layer utilities` CSS block at `:868-876`
- exported TypeScript interfaces at `:878-938`

This means a `.tsx` file contains raw CSS syntax after executable/component code. In a normal Vite + TSX setup, that is not valid component-file structure.

### Practical interpretation

This file looks like content from multiple source files merged together:

1. the React view
2. a CSS utility snippet
3. a type-definition file

That is the strongest signal in the codebase that `NBACupView` is not production-ready in its current form.

## Data Source and Data Flow

## Remote source

The component uses a hardcoded remote dataset URL:

- `src/components/central/view/NBACupView.tsx:18`

```ts
const DATA_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/nbacupdata';
```

This is not save-scoped, not state-backed, and not cached in local app state.

## Fetch lifecycle

The fetch happens once on mount:

- `src/components/central/view/NBACupView.tsx:321-340`

Behavior:

1. `fetch(DATA_URL)`
2. `response.json()`
3. if result is an array, transform via `transformWikiData`
4. store in local component state
5. default `selectedYear` to the last transformed year
6. always clear loading in `finally`

### State used by the component

The component maintains four local states:

- `data` at `:316`
- `selectedYear` at `:317`
- `view` at `:318`
- `loading` at `:319`

This is a pure local-state page. It does not use context, reducers, or app actions.

## Data Transformation Layer

The main normalization logic is `transformWikiData(wikiData)`, implemented at:

- `src/components/central/view/NBACupView.tsx:143-313`

This is the core of the feature. The UI is basically a renderer for the output of this function.

## Summary extraction

The function derives the displayed year from:

- `yearData.season.split('_')[0]` at `:145`

It maps infobox fields into a normalized `summary` object at `:148-158`:

- `Location`
- `Date`
- `Venues`
- `Teams`
- `Purse`
- `Champions`
- `Runner-up`
- `MVP`

Any missing value becomes `''`.

## Group table extraction

Group parsing runs at `:160-203`.

Implementation details:

1. It iterates `yearData.tables`
2. It lowercases headers for case-insensitive matching
3. It only considers tables containing both `pos` and `team`
4. It tries to locate optional columns:
   - `pld`
   - `w`
   - `l`
   - `pf`
   - `pa`
   - `pd`
   - `grp`
   - `qualification`
5. It maps each row into a `Standing`
6. It filters obvious header-row junk
7. It stores the table by caption, or assigns fallback `Group A/B/...`

### Notable heuristics

Header mismatch handling:

- `src/components/central/view/NBACupView.tsx:179-195`

The mapper rejects rows where the row itself looks like a repeated header:

- `row[teamIdx] === 'Team'`
- `row[posIdx] === 'Pos'`
- `row.includes('W')`
- `row.includes('L')`

That is defensive, but also fairly loose. It is designed for messy wiki-shaped scraped tables.

## All-Tournament team extraction

This is parsed from the first table whose caption contains:

- `All-NBA`
- or `All-Tournament`

See:

- `src/components/central/view/NBACupView.tsx:205-212`

Behavior:

1. row `[0]` = position
2. row `[1]` = player name
3. row `[2]` = team
4. `(MVP)` is stripped from player display name
5. `is_mvp` is inferred by searching for `(MVP)` in the original cell

## Bracket parsing

Bracket parsing is split into two modes.

### Mode 1: structured object bracket

Handled at:

- `src/components/central/view/NBACupView.tsx:217-248`

If `yearData.bracket` is an object:

1. `extractTeams(game)` returns two parsed teams
2. each team string may include seed prefixes like `E1` or `W2`
3. parsed fields are:
   - `seed`
   - `team`
   - `score`
4. bracket rounds are flattened in this order:
   - quarterfinals
   - semifinals
   - final

### Mode 2: raw string bracket

Handled at:

- `src/components/central/view/NBACupView.tsx:250-311`

Behavior:

1. find rough boundaries for:
   - `quarterfinals`
   - `semifinals`
   - `championship` or `final`
2. parse teams with regex:

```ts
/(\d+)\s*([A-Za-z\s.-]+?)\s*(\d{2,3})/g
```

3. bucket matches into quarterfinal, semifinal, or final arrays by string position
4. rebalance rounds if earlier buckets are overloaded
5. return a flattened bracket array in QF -> SF -> Final order

### Important constraint

`BracketDisplay` expects the bracket array to already be flattened in a very specific order:

- first 8 entries = quarterfinal teams
- next 4 entries = semifinal teams
- last 2 entries = final teams

That assumption is baked into:

- `src/components/central/view/NBACupView.tsx:776-779`

## View-Level Derived State

The main derived selector is `categorizedGroups` at:

- `src/components/central/view/NBACupView.tsx:345-383`

It classifies raw group tables into four UI buckets:

- `east`
- `west`
- `wildcard`
- `qualified`

### Classification rules

Wildcard:

- table name contains `wildcard`
- or `second-placed`
- or is `unknown` and any row has `grp`

Qualified:

- table name contains `qualified`
- or `knockout`
- or is `unknown`, has no `grp`, and length `<= 4`

East:

- table name contains `east`

West:

- table name contains `west`

Fallback:

- ambiguous groups default into `east`

### Design implication

This is not modeling the tournament with strict domain objects. It is using heuristics to coerce inconsistent source tables into a stable presentation model.

That is acceptable for scraped historical data, but it is brittle.

## Rendered UI Structure

## Loading and null guards

At `:385-395`, the component shows a full-screen loading spinner.

At `:397`, if `currentData` is absent after loading, it returns `null`.

That means failure mode is mostly silent except for a console error:

- `console.error('Error fetching NBA Cup data:', error);` at `:333-334`

No user-facing error state exists.

## Header

The page header is implemented at:

- `src/components/central/view/NBACupView.tsx:401-451`

It contains:

1. title and year badge
2. segmented view toggle:
   - `groups`
   - `bracket`
3. year `<select>` built from fetched dataset years

## Groups mode

Groups mode starts at:

- `src/components/central/view/NBACupView.tsx:458-606`

It renders:

1. Prize pool section
2. Summary cards
3. East/West group tables
4. Wildcard and qualified tables when available
5. All-Tournament Team cards

### Prize pool

`PrizePool()` is defined at `:109-141`.

Important detail: the prize amounts are fully hardcoded and the section title is hardcoded to:

- `2025 Prize Pool Breakdown`

See `:472`.

So this part is not actually year-aware.

### Summary cards

Rendered at `:477-502` using `SummaryCard`.

Fields:

- Champion
- Runner-up
- Tournament MVP
- Final Venue

### Hardcoded venue problem

The “Final Venue” card is not driven by `currentData.summary`. It is hardcoded to:

- `T-Mobile Arena`
- `Las Vegas, NV`

See `:496-500`.

That means historical years will still show the same fixed venue card.

### Group standings

The group standings section begins at `:504`.

It visually splits into East and West columns and conditionally renders extra sections for wildcard or qualification tables.

### All-Tournament team

Rendered at `:575-605`.

This is purely display logic over `currentData.all_tournament_team`.

## Bracket mode

Bracket mode starts at:

- `src/components/central/view/NBACupView.tsx:607-617`

It passes `currentData.bracket` into `BracketDisplay`.

`BracketDisplay` at `:757-826`:

1. shows an empty-state panel if bracket is missing
2. groups the flat team array into two-team games
3. slices those games into:
   - 4 quarterfinals
   - 2 semifinals
   - 1 final

This logic assumes an 8-team knockout bracket.

## Helper Components

## `SummaryCard`

Defined at:

- `src/components/central/view/NBACupView.tsx:625-642`

Pure presentational wrapper for summary metrics.

## `GroupTable`

Defined at:

- `src/components/central/view/NBACupView.tsx:644-755`

This is the main standings renderer.

Notable behaviors:

1. visual variants:
   - `default`
   - `info`
   - `success`
2. optional `Grp` column based on `standings[0]?.grp`
3. optional `Status` column if any row has `qualification`
4. team logo image uses `getTeamLogo(row.team)`
5. fallback image URL uses `via.placeholder.com`
6. `onError` hides broken images entirely

### Point-differential coloring

PD color logic is at:

- `src/components/central/view/NBACupView.tsx:738-739`

Positive:

- if it starts with `+`
- or if it does not start with `−` and is not `0`

Neutral:

- exactly `0`

Negative:

- otherwise

This means any non-zero string without a true minus sign gets treated as positive. That is another heuristic edge.

## `MatchCard`

Defined at:

- `src/components/central/view/NBACupView.tsx:828-865`

It determines a winner with:

```ts
const winnerIndex = teams[0].score > teams[1].score ? 0 : 1;
```

Implication:

If scores are equal or missing, team 2 is considered the winner visually.

## Logo Resolution Strategy

The file implements its own logo mapping instead of using shared team utilities.

Relevant code:

- `TEAM_IDS` at `:20-53`
- `getTeamLogo()` at `:55-107`

Behavior:

1. strips seed prefixes like `E1`, `W2`
2. normalizes some alias names:
   - `okc` -> `Oklahoma City Thunder`
   - `philly` / `sixers` -> `Philadelphia 76ers`
   - `clippers` -> `LA Clippers`
3. exact match against `TEAM_IDS`
4. fallback partial string match
5. returns NBA CDN SVG logo URL

### Limitations

This is a local, duplicated name-resolution layer. It is not tied to app team state and not shared with other views.

## External Dependencies

The view relies on:

- `react`
- `motion/react`
- `lucide-react`
- NBA CDN logo URLs
- GitHub raw data URL
- `via.placeholder.com` image fallback

### Important architectural note

Compared with most of the sim, this view is much more web-content-driven and much less game-state-driven.

## What It Does Not Use

`NBACupView` does **not** use:

- `useGame()`
- `GameState`
- `state.schedule`
- `state.boxScores`
- `state.leagueStats.inSeasonTournament`
- any commissioner actions
- any persisted local save data

So this is a historical reference page, not a live NBA Cup simulation view.

## Concrete Problems and Risks

## 1. Not reachable from app routing

Evidence:

- no import in `MainContent.tsx`
- no `Tab` union entry in `src/types.ts`

Impact:

- feature is effectively invisible in normal app usage

## 2. Broken or stale type import

Evidence:

- import from `../types` at `NBACupView.tsx:16`
- no matching `src/components/central/types.ts`

Impact:

- likely compile failure if file is included by the bundler/typechecker

## 3. CSS embedded in TSX file

Evidence:

- `@import "tailwindcss";` at `:866`
- `@layer utilities` at `:868-876`

Impact:

- invalid file composition for a normal TSX module

## 4. Duplicate type definitions in same file

Evidence:

- imported types at `:16`
- local exported interfaces at `:878-938`

Impact:

- signals unresolved merge/copy state

## 5. Hardcoded presentation values

Evidence:

- `2025 Prize Pool Breakdown` at `:472`
- fixed final venue card at `:496-500`

Impact:

- historical year switching is only partially real

## 6. No user-facing error state

Evidence:

- fetch errors only go to `console.error` at `:333-334`
- missing `currentData` returns `null` at `:397`

Impact:

- blank screen on bad data path

## 7. Heuristic parsing is brittle

Evidence:

- group classification at `:354-380`
- string bracket regex at `:264`
- row header filtering at `:179-195`

Impact:

- source-shape changes can silently distort display

## 8. View is disconnected from simulation

Evidence:

- no use of `GameState`
- remote-only dataset

Impact:

- even if routed, it would be an encyclopedia page, not a live cup dashboard

## Implementation Characterization

The file is best understood as:

- a polished visual prototype
- a historical NBA Cup explorer
- a scraped-data presentation layer

It is **not** currently implemented as:

- a core league-system view
- a live simulation feature
- a properly integrated routed page

## Suggested Refactor Direction

If this feature is meant to ship, the clean implementation path is:

1. Split the file into:
   - `NBACupView.tsx`
   - `nbacupTypes.ts`
   - optional CSS/global utility location if still needed
2. Remove the invalid `../types` import or replace it with a real local module.
3. Add `NBA Cup` to `Tab` in `src/types.ts`.
4. Add a `MainContent` route case.
5. Decide product intent:
   - historical reference page backed by remote dataset
   - or live in-save NBA Cup view backed by `GameState`
6. Replace hardcoded year/venue content with actual per-year data.
7. Add a real error UI for fetch failure and malformed payloads.
8. Consider moving shared logo/name normalization into a reusable utility.

## Bottom Line

`NBACupView` has substantial UI work already done, especially around:

- summary rendering
- group standings
- wildcard/qualifier presentation
- bracket display
- all-tournament team cards

But from an implementation standpoint it is currently incomplete.

The biggest facts are:

1. It is not wired into app navigation.
2. It is not driven by the simulator state model described in `README.md`.
3. The source file itself is malformed enough that it should be treated as a prototype or abandoned branch artifact until cleaned up.
