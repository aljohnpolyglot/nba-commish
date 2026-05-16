# Plan - PBA Isolated Mode

> Audited: May 15, 2026 against `README.md`, `PRODUCT.md`, `ARCHITECTURE.md`, `TODO.md`, recent `CHANGELOG.md`, and the current worktree.

## Goal

Build a GM-only Philippine Basketball Association career mode that feels like its own league, not a reskinned NBA save.

The user picks one PBA team, plays through three conferences per season, manages conference imports, navigates PBA-specific draft/offseason rules, and sees only PBA surfaces in the normal UI. NBA simulation may keep running in the background only if existing architecture requires it, but PBA mode must hide NBA season, playoff, award, and transaction surfaces unless the user explicitly enters a future NBA portal.

## Product Shape

- `leagueStats.uiMode = 'pba_isolated'`
- GM mode only for MVP.
- 12-team PBA setup, no guest teams in MVP.
- Three conferences per season:
  - Philippine Cup: no imports.
  - Commissioner's Cup: one import, no height limit.
  - Governors' Cup: one import, max 6'5".
- PHP currency across PBA UI.
- 4-point line enabled by default.
- Existing NBA views should be reused where they already work, but the user should not see NBA labels, NBA-only rules, or irrelevant CBA concepts.
- League News / Social Feed is post-MVP. Avoid half-wired narrative spam in MVP.

## Audit Findings

### Already Present In The Worktree

- `src/services/competition/types.ts`
  - `CompetitionPlayoffFormat.qfFormat?: 'twice-to-beat' | 'best-of'`
  - `CompetitionSpec.importRule?: 'none' | 'one_no_height_limit' | 'one_max_6ft5'`
- `src/data/templates/philippines/competitions.ts`
  - Three PBA `CompetitionSpec`s already exist.
- `src/data/templates/philippines/teamPopulations.ts`
  - PBA team metadata, population overrides, arenas, ticket pricing, and corporate blocks already exist.
- `src/constants.ts`
  - `EXTERNAL_CURRENCY.PBA = { symbol: '₱', code: 'PHP', rate: 56.2 }`
  - `EXTERNAL_SALARY_SCALE.PBA`
  - `LEAGUE_HEIGHT_CEILING.PBA`
  - `EXTERNAL_LEAGUE_OVR_CAP.PBA`
  - `NATIONALITY_LEAGUE_BIAS.Philippines = 'PBA'`
- PBA teams already use the external league model via `nonNBATeams[]` and PBA TID range `2000-2999`.
- PBA appears in external player status unions and many player/team views.
- Four-point line support is already a saved rule field and has UI/stat support.

### Not Yet Present

- `isPbaIsolatedMode(state)` helper.
- `LeagueStats.uiMode` does not currently include `'pba_isolated'`.
- PBA career setup flow.
- `PBA_ISOLATED_DEFAULTS`.
- PBA active competition seeding on save start.
- PBA-specific conference transition state.
- PBA import lifecycle service.
- PBA offseason task rows.
- PBA draft eligibility and draft flow.
- PBA hub navigation and three-conference tab behavior.
- PBA awards catalog.
- PBA opening ceremony and muse UI.

### Current Plan Risks

- The old draft mixed MVP and flavor. Muses, opening ceremony, awards, trade lopsidedness, All-Star, and PBA draft cannot all be treated as equal launch blockers.
- It assumed Euro's two-tab `domestic | continental | nba` hub can simply become a PBA three-tab hub. The current `LeagueTabId` type is hard-coded to those three values, so PBA needs either a generic competition-tab refactor or a separate PBA hub wrapper.
- It said several views need "zero changes". That is too optimistic. Views may render, but many default filters, labels, action buttons, and NBA-only sections need PBA gates.
- It treated external signing routing as the import pipeline. It is useful background AI behavior, but user import signing needs a separate one-import-per-team contract and waiver lifecycle.
- It had duplicate phase numbering and put setup/defaults too late. Defaults and setup must land before UX work can be trusted.

## MVP Definition

Ship the smallest mode that can be started, played, saved, loaded, and advanced across all three conferences without NBA leakage or roster corruption.

### MVP Must Have

1. PBA isolated save can be created from setup.
2. User can select a PBA team and enter a PBA-only GM career.
3. Save starts on September 1 before the PBA draft / season setup window.
4. PBA defaults seed:
   - `uiMode: 'pba_isolated'`
   - `currency: 'PHP'`
   - `fourPointLine: true`
   - `draftType: 'pba_draft'`
   - `pbaConference: 'philippine'`
   - `activeCompetitions: PBA_COMPETITIONS`
5. Sidebar hides NBA-only surfaces.
6. PBA Hub shows three conference tabs and clear current/past/future states.
7. Philippine Cup can run without imports.
8. Commissioner's and Governors' Cup can start with or without an import, after a clear confirmation.
9. Import signing enforces one active import per PBA team for import conferences.
10. Governors' Cup import signing enforces 6'5" max height.
11. Conference completion records champion and awards placeholders safely.
12. Rollover / transition moves to the next PBA conference, not NBA offseason.
13. Loading an older NBA/Euro/Fictional save is unchanged.

### MVP Can Defer

- League News / Social Feed.
- Guest teams.
- Commissioner PBA mode.
- Muse portraits if face generation becomes a blocker.
- Full ceremony animation.
- Corporate block loyalty mechanics.
- Detailed PBA award voting.
- PBA D-League.
- Typhoon / regional venue events.
- International games.
- Player-coach mechanics.

## Architecture Rules

- All state changes go through `GameContext` reducer or existing reducer helpers.
- `state.players` remains the only player list.
- `player.tid` remains the roster link.
- No global localStorage keys for PBA settings. Anything outside `GameState` must be scoped by `state.saveId`.
- Every PBA-only behavior must be gated by `isPbaIsolatedMode(state)` or a future league-profile helper.
- NBA, Euro, and Fictional paths must keep their current behavior.
- Avoid adding a new framework for competitions. Reuse `CompetitionSpec`, schedule, box score, and `useHubScope` patterns where feasible.
- Do not encode PBA rules as one-off UI text only. Rules must live in defaults/specs/services so sim, UI, and save/load agree.

## Data Model

### Mode Detection

File: `src/utils/uiMode.ts`

```ts
export function isPbaIsolatedMode(state: {
  leagueStats?: { uiMode?: string | null };
}): boolean {
  return state.leagueStats?.uiMode === 'pba_isolated';
}
```

Also update `isEuroIsolatedMode` consumers only where the old logic actually means "any non-NBA isolated league". Do not broaden Euro behavior accidentally.

### `LeagueStats` Extensions

File: `src/types.ts`

```ts
uiMode?: 'nba' | 'euro_isolated' | 'pba_isolated';

pbaConference?: 'philippine' | 'commissioners' | 'governors';
pbaConferencePhase?: 'setup' | 'regularSeason' | 'playoffs' | 'complete';
pbaDraftComplete?: boolean;
pbaOpeningWatched?: boolean;
pbaMuseSelected?: boolean;

pbaConferenceChampions?: Array<{
  season: number;
  conference: 'philippine' | 'commissioners' | 'governors';
  teamId: number;
  teamName: string;
  finalsMvpId?: string;
  bestPlayerId?: string;
  bestImportId?: string;
}>;

pbaGrandSlam?: Array<{
  season: number;
  teamId: number;
  teamName: string;
}>;
```

Use player IDs instead of names for awards where possible. Names are display-only and drift after edits.

### Player Import Fields

File: `src/types.ts`

```ts
isImport?: boolean;
importConference?: 'commissioners' | 'governors';
importTeamId?: number;
importSeason?: number;
importOriginalContractAmount?: number;
```

Keep import status orthogonal to `player.status`. A foreign player signed as a PBA import should still be queryable as a PBA roster player by `tid`, while `isImport` explains why import-only rules apply.

### Team Muse Fields

File: `src/types.ts`

```ts
pba?: {
  muse?: {
    name: string;
    face?: FaceConfig;
    season: number;
    conference: 'philippine' | 'commissioners' | 'governors';
  };
  museOfTheYear?: boolean;
};
```

MVP can store only name and season/conference. Portraits are polish.

## Defaults

File: `src/constants.ts`

Add `PBA_ISOLATED_DEFAULTS: Partial<LeagueStats>`.

Recommended MVP defaults:

```ts
export const PBA_ISOLATED_DEFAULTS: Partial<LeagueStats> = {
  uiMode: 'pba_isolated',
  currency: 'PHP',
  tradesAllowed: true,
  draftType: 'pba_draft',
  pbaConference: 'philippine',
  pbaConferencePhase: 'setup',
  fourPointLine: true,
  fourPointLineDistance: 27,
  quarterLength: 12,
  numQuarters: 4,
  shotClockEnabled: true,
  shotClockValue: 24,
  foulOutLimit: 6,
  overtimeEnabled: true,
  overtimeDuration: 5,
  maxPlayersPerTeam: 15,
  maxStandardPlayersPerTeam: 15,
  twoWayContractsEnabled: false,
  luxuryTaxEnabled: false,
  apronsEnabled: false,
  minimumPayrollEnabled: false,
  rookieScaleType: 'none',
  rookieContractLength: 2,
  rookieTeamOptionsEnabled: false,
  rookieRestrictedFreeAgentEligibility: false,
  tradeMatchingRatioUnder: 0,
  stepienRuleEnabled: false,
  allStarGameEnabled: true,
};
```

Open question before implementation: whether to enforce the official PBA team salary cap in MVP. If the current salary/cap UI cannot represent PBA cleanly, prefer `salaryCapEnabled: false` for MVP and add a visible "PBA contracts are handled by league rules" note in finance surfaces. A misleading NBA-style cap is worse than deferring the cap.

## Competition Specs

File already exists: `src/data/templates/philippines/competitions.ts`.

Keep the existing three specs, but audit these before code relies on them:

- Date ranges that cross a calendar year, especially Philippine Cup end date.
- Whether `regular-league` scheduler supports three separate regular-league specs using the same 12 teams in one season.
- Whether playoff resolver supports `qfFormat: 'twice-to-beat'` behavior or only stores the field.
- Whether stat views can freeze completed conference standings instead of recomputing from all season games.

### Conference Order

Every season starts at the Philippine Cup opening. No pre-game offseason for any season.

1. Philippine Cup opening (Heads-Up screen → play).
2. Mini-offseason after Philippine Cup:
   - All-Star Weekend.
   - Commissioner's Cup import decision.
   - Muse selection.
   - Opening ceremony.
   - Commissioner's Cup.
3. Mini-offseason after Commissioner's Cup:
   - Import reuse / waive decision.
   - Governors' Cup import decision with height gate.
   - Muse selection.
   - Opening ceremony.
   - Governors' Cup.
4. Full offseason after Governors' Cup:
   - Record season awards.
   - Check Grand Slam.
   - Advance PBA season year.
   - Return to September.

## PBA Hub UX

The PBA Hub is the primary mode surface. It should make the user feel oriented within a three-conference season.

### Layout

Top band:

- Current team identity: logo/abbr/name, record, current conference.
- Season progress: `Philippine Cup -> Commissioner's Cup -> Governors' Cup`.
- Next key date: draft, opening, next game, playoffs, finals, import deadline, or offseason.
- Primary CTA: "Continue", "Find Import", "Watch Opening", "Start Playoffs", or "Advance to Next Conference".

Conference tabs:

- `Philippine Cup`
- `Commissioner's Cup`
- `Governors' Cup`

Tab states:

- Current: live record, schedule, standings, leaders.
- Completed: champion badge, final standings, finals MVP, best player/import placeholders.
- Future: start date, import rule, roster requirements, preview CTA if next.

Sub-tabs:

- Overview.
- Standings.
- Schedule.
- Stats.
- Import Tracker for Commissioner's/Governors' only.
- Awards for completed conferences.

### UX Acceptance Criteria

- User can always answer "what do I do next?" within five seconds.
- Current conference is visible in the sidebar and hub header.
- Past conference tabs never look editable.
- Future conference tabs do not show empty tables as if something is broken.
- No NBA standings, NBA playoff bracket, NBA Cup, NBA Central, or NBA Hall of Fame appears in normal PBA mode.
- Empty states use PBA-specific copy:
  - "No imports are active for the Philippine Cup."
  - "Governors' Cup imports must be 6'5\" or shorter."
  - "This conference starts after the current finals finish."

## Hub Implementation Strategy

The current Euro helper is not generic enough:

```ts
export type LeagueTabId = 'domestic' | 'continental' | 'nba';
```

Do not force PBA into `domestic` / `continental`. Pick one of these:

### Option A - Generic Competition Tabs (Preferred)

Refactor `euroLeagueDefaults.ts` into generic helpers:

- `getCompetitionTabs(state)`
- `getDefaultCompetitionTabId(state)`
- `getTeamsForCompetitionTab(state, tabId)`
- `filterScheduleByCompetitionTab(state, tabId, schedule)`
- `filterBoxScoresByCompetitionTab(state, tabId, boxScores)`

Then keep Euro as a profile that produces Endesa / Euroleague / NBA tabs, and PBA as a profile that produces the three cup tabs.

### Option B - PBA-Specific Wrapper

Add a `pbaHubTabs.ts` helper and leave Euro helpers alone. Faster MVP, more duplication.

Recommendation: Option A if the implementation is still early. Option B if Euro worktree risk is high and the user wants PBA shipped quickly.

## Sidebar UX

File: `src/components/sidebar/NavigationMenu.tsx`

PBA isolated mode should:

- Add `PBA Hub`.
- Show current conference badge below team identity.
- Keep:
  - Schedule.
  - Standings.
  - Player Stats.
  - Player Bios.
  - Player Ratings.
  - Player Comparison.
  - Player Search.
  - Free Agents.
  - Injuries.
  - Transactions.
  - Draft Scouting.
  - Draft Board.
  - Team Office.
  - Front Office.
  - Training Center.
  - Trade Machine.
  - Trade Finder.
- Hide:
  - NBA Central.
  - NBA Cup.
  - All-Star if it routes only to NBA All-Star. Re-add when PBA All-Star is scoped.
  - Hall of Fame.
  - League Office surfaces that assume NBA.
  - Commissioner-only rule/action surfaces in GM-only MVP.
  - Euro-only Front Office transfer market routes.

Do not remove a route only because it has "NBA" in its old internal name. Remove it if its behavior or copy is NBA-specific.

## Setup UX

Entry path:

`Modded League -> NBA | Europe | Philippines -> Pick Team -> Heads-Up -> Start Phil. Cup`

The Philippines option appears as a third card alongside NBA and Europe in `LeagueTypeSelector`.

Setup screens:

1. League card
   - PBA logo/identity.
   - "Three conferences, import decisions, 4-point line."
   - GM-only badge.
2. Team picker
   - 12 team grid.
   - Show popularity, championships, corporate group, colors.
   - Include difficulty labels:
     - Easy: Ginebra, San Miguel, Magnolia.
     - Medium: TNT, Meralco, Rain or Shine, NLEX.
     - Hard: Phoenix, Converge, Titan Ultra, Blackwater, Terrafirma.
3. Heads-Up screen (season preview before first game)
   - Your team roster overview (Starting 5 + key bench, OVR/K2, coach).
   - Season road map: `Phil. Cup (Oct–Feb) → All-Star → Comm. Cup (Mar–Aug) → Gov. Cup (Sep–Dec)`.
   - Philippine Cup format card: "22 games, All-Filipino, Twice-to-Beat QF, Best-of-7 SF/Finals".
   - "No imports in this conference" callout.
   - "Start Philippine Cup" CTA.
4. Start
   - Seeds `PBA_ISOLATED_DEFAULTS`.
   - Seeds active competitions.
   - Sets date to Philippine Cup opening (~October 5).
   - Sets `pbaConference: 'philippine'`.
   - Sets user team.
   - Rosters are already complete from the BBGM gist. No pre-game draft or FA phase.
   - **Jumpstart timeline** — reuse `StartDateTimeline` + `JumpReviewScreen` with PBA key dates.

### Jumpstart — Reuse NBA Timeline, PBA Key Dates

Same `StartDateTimeline` component, different `keyDates` config via `getPbaKeyDates()`.

**PBA Timeline:** Oct 5 → Dec (next year), spanning all 3 conferences.

```
Phil. Cup         All-Star    Comm. Cup              Gov. Cup           Off
|─────────────────|──|────────────────────────|──────────────────────|───|
Oct    Nov    Dec    Jan    Feb    Mar    Apr    May    Jun    Jul    Aug    Sep    Oct    Nov    Dec
```

**PBA Key Dates (`getPbaKeyDates()` in `keyDates.ts`):**

| Date | Label | Zone |
|---|---|---|
| Oct 5 | Phil. Cup Opening | philippineCup |
| Dec 15 | Phil. Cup Playoffs | philippineCup |
| Jan 28 | Phil. Cup Finals | philippineCup |
| Mar 6 | All-Star Weekend | allstar |
| Mar 11 | Comm. Cup Opening | commissionersCup |
| Mar 11 | Import Search | commissionersCup |
| Jul 1 | Comm. Cup Playoffs | commissionersCup |
| Aug 8 | Comm. Cup Finals | commissionersCup |
| Sep 10 | Gov. Cup Opening | governorsCup |
| Sep 10 | Import Search (≤6'5") | governorsCup |
| Nov 10 | Gov. Cup Playoffs | governorsCup |
| Dec 14 | Gov. Cup Finals | governorsCup |
| Dec 28 | Season Awards | offseason |

**PBA Zone Colors + Labels:**

```ts
const PBA_ZONE_COLORS: Record<string, string> = {
  philippineCup:    '#1B4D3E',  // green — Phil. Cup accent
  allstar:          '#854d0e',  // gold — reuse NBA
  commissionersCup: '#C41E3A',  // red — Comm. Cup accent
  governorsCup:     '#B8860B',  // dark gold — Gov. Cup accent
  offseason:        '#334155',  // slate — reuse NBA
};
```

**Jumpstart behavior:**
- User picks any point on the PBA timeline.
- `runLazySim` sims all days/conferences up to that point.
- Conference transitions (import acquisition, muse, opening) auto-resolve during lazy sim.
- `JumpReviewScreen` shows what was auto-resolved (conference winners, imports signed, awards given).
- Picking "Gov. Cup Opening" lands you at Gov. Cup with Phil. Cup + Comm. Cup results frozen.
- Default position: Phil. Cup Opening (leftmost, no sim needed).

## Offseason Tasks

Files:

- `src/types.ts`
- `src/services/offseason/offseasonState.ts`
- `src/components/offseason/OffseasonAufgaben.tsx`

Add rows:

```ts
| 'pbaDraft'
| 'pbaLocalFreeAgency'
| 'pbaImportSearch'
| 'pbaImportDecision'
| 'pbaMuseSelection'
| 'pbaOpeningCeremony'
| 'pbaAllStarWeekend'
| 'pbaConferenceAwards'
```

Do not overload NBA `draft` if the UI copy, draft order, or completion flags differ. Reuse `DraftSimulatorView` under a PBA row, but keep the row identity PBA-specific.

### Full Offseason Row Order

Before Philippine Cup (after Gov. Cup ends, before next season opening):

1. PBA Draft.
2. Local Free Agency.
3. Muse Selection.
4. Opening Ceremony.
5. Training Camp.

### Mini-Offseason Row Order

Before Commissioner's Cup:

1. All-Star Weekend.
2. Import Decision.
3. Import Search if needed.
4. Muse Selection.
5. Opening Ceremony.
6. Training Camp.

Before Governors' Cup:

1. Conference Awards / Recap.
2. Import Reuse or Waive.
3. Import Search if needed.
4. Muse Selection.
5. Opening Ceremony.
6. Training Camp.

### Task UX Rules

- Engine-driven rows should not have a manual "Mark Done" button.
- Soft flavor rows can have "Skip" if no mechanic depends on them.
- Import Search is done only when:
  - user signs an eligible import, or
  - user confirms playing without import.
- Opening Ceremony should have "Watch" and "Skip to Conference" if assets fail.
- Training Camp should not block if the team is roster-compliant.

## Import System

### Rules

Imports come from the existing free-agent pool.

Eligibility:

- `player.tid === -1`
- Player is not Filipino.
- Player is not retired or draft prospect.
- Commissioner's Cup: no height limit.
- Governors' Cup: `player.hgt <= 77` or `<= 78` depending on the app's height encoding audit.

Implementation note: verify the height scale before hardcoding. In this codebase height is often inches. If 6'5" is represented as 77, use 77. The old draft used 78, which is 6'6" in standard inches.

### `importManager.ts`

New file: `src/services/pba/importManager.ts`

Responsibilities:

- `getImportRuleForConference(conference)`
- `isImportEligible(player, conference)`
- `getActiveImport(players, teamId, conference, season)`
- `canSignImport(state, teamId, playerId, conference)`
- `signImport(state, teamId, playerId, conference)`
- `waiveImport(state, teamId, playerId)`
- `clearConferenceImports(state, conference, season)`
- `buildImportTrackerRows(state, conference)`

Do not let normal sign/waive flows accidentally skip these constraints. Import signing needs a distinct action type or a guarded branch in the existing signing path.

### Import UX

Use `FreeAgentsView` patterns but provide a PBA-specific mode:

- Header: "Import Search - Commissioner's Cup" or "Import Search - Governors' Cup".
- Filters pinned by default:
  - Non-Filipino.
  - Free agents.
  - Height eligible for Governors' Cup.
- Player rows show:
  - Height.
  - Nationality.
  - OVR / K2.
  - Asking salary.
  - Last league/team.
  - "Sign as Import" CTA.
- Once signed:
  - CTA becomes disabled across all other candidates.
  - Team import slot card shows active import and "Waive Import".
- If no import:
  - Show "Play all-Filipino" confirmation, not a hard blocker.

Confirmation copy:

> Start the Commissioner's Cup without an import? You can play all-Filipino, but most PBA teams use the import slot in this conference.

Governors' Cup rejection copy:

> Governors' Cup imports must be 6'5" or shorter.

### Import Lifecycle

At conference start:

- Import is on roster with `tid = userTeamId`.
- `isImport = true`.
- `importConference`, `importTeamId`, and `importSeason` are stamped.

During conference:

- Import cannot be traded.
- Import cannot receive extensions.
- Import can be waived and replaced.
- Import should show a distinct roster chip.

At conference end:

- Active imports are automatically waived.
- `isImport` and import fields are cleared.
- A reuse decision can remember the previous import candidate, but must still validate availability.

## PBA Draft

MVP can reuse `DraftSimulatorView` and `DraftScoutingView`, but rules and labels must be PBA-specific.

Rules:

- Draft occurs in early September.
- 12 teams.
- Minimum two rounds.
- Rounds after the second are optional. Teams can pass.
- Draft order is reverse previous Governors' Cup standings.
- Undrafted players become free agents.

Eligibility:

- Filipino passport or Filipino-foreigner eligibility.
- Minimum age rule needs final data verification before strict enforcement.
- No active contract in another league once that rule is enabled.

MVP shortcut:

- Filter to PBA-eligible prospects generated by existing external sustainer / draft pools.
- Enforce two rounds.
- Defer optional rounds if draft UI cannot support pass behavior cleanly.

UX:

- Draft board title says "PBA Draft".
- Pick cards show team abbreviations from PBA teams.
- After draft: row auto-completes only when `pbaDraftComplete` is true.

## Awards

MVP should record conference winners first, not build full voting.

### MVP Awards

At conference end:

- Champion.
- Finals MVP placeholder by best finals performance.
- Best Player of the Conference placeholder by conference stats.
- Best Import only for import conferences.

At season end:

- MVP placeholder.
- Rookie of the Year placeholder.
- Mythical First Team placeholder.
- Grand Slam if one team wins all three conferences.

### Post-MVP Catalog

- Most Valuable Player.
- Rookie of the Year.
- Most Improved Player.
- Defensive Player of the Year.
- Coach of the Year.
- Executive of the Year.
- Mr. Quality Minutes.
- Scoring Champion.
- Comeback Player of the Year.
- Order of Merit.
- Sportsmanship Award.
- Mythical First and Second Team.
- All-Rookie Team.
- All-Defensive Team.

## All-Star Weekend

### Real-Life Format (2024 PBA All-Star Weekend Reference)

Held between Philippine Cup and Commissioner's Cup. Out-of-town venue (Bacolod 2024, Candon 2025).

**Saturday:**

1. Obstacle Challenge — big men only, bracket elimination, timed finals.
2. Three-Point Shootout — two editions: Guards and Big Men. No Slam Dunk Contest.
3. Greats vs Stalwarts (Blitz Game) — rookies, sophomores, and juniors drafted into two teams. 4-point line and 3-point dunk enabled.

**Sunday:**

1. Shooting Stars — mixed team (reporter, official, sportswriter, fan). Pure flavor.
2. All-Star Game — fan-voted 24 players + 2 coaches. Top two vote-getters become captains and draft their teams (NBA-style captain draft since 2024). 4-point line and 3-point dunk enabled. Can end in a tie (2024: 140-140, first in PBA history). Co-MVPs possible (Japeth Aguilar and Robert Bolick, 2024).

### MVP Implementation — Hook From NBA, Reskin

Reuse existing NBA All-Star infrastructure with PBA labels. No new skill challenge mechanics.

**What to hook:**

| NBA Feature | PBA Reskin |
|---|---|
| East vs West selection | Captain draft — top 2 fan vote-getters pick teams |
| All-Star roster generation | Same voting/selection sim, scoped to PBA players only |
| All-Star Game sim | Same sim engine, 4-point line ON |
| 3-Point Contest | Reuse as-is, scoped to PBA players |
| Game MVP | Same stat-based selection, allow co-MVPs |

**What to skip in MVP:**

- Obstacle Challenge (no game mechanic, pure flavor).
- Blitz Game / Greats vs Stalwarts (requires rookie/sophomore year tracking per PBA conference count).
- Shooting Stars (pure flavor, no sim value).
- 3-point dunk mechanic (visual only).
- Out-of-town venue selection (flavor text only, use `PBA_ARENAS` tier: 'special').

**Labels to reskin:**

- "Eastern Conference" / "Western Conference" → "Team [Captain A]" / "Team [Captain B]".
- "NBA All-Star Game" → "PBA All-Star Game".
- All-Star counts and history should track PBA selections separately from NBA.

**Offseason row:** `'pbaAllStarWeekend'` — placed in mini-offseason before Commissioner's Cup. Auto-sims the weekend, shows results summary. User can view rosters and game box score.

**State:**

```ts
pbaAllStarResults?: {
  season: number;
  captainA: { playerId: string; playerName: string };
  captainB: { playerId: string; playerName: string };
  teamAScore: number;
  teamBScore: number;
  mvpIds: string[];
  threePointWinnerId?: string;
  venue?: string;
};
```

### Post-MVP All-Star Additions

- Blitz Game (Greats vs Stalwarts) with rookie/soph/junior draft.
- Obstacle Challenge as a mini-game or auto-sim event.
- Out-of-town venue picker with attendance boost.
- All-Star fan voting UI with real vote counts.
- Import All-Star exhibition game.

## Opening Ceremony And Muse

This is flavor, not a sim blocker.

### MVP Behavior

- User selects or auto-generates a muse name before each conference.
- Opening Ceremony screen shows:
  - Conference name.
  - All 12 team tiles.
  - User team's muse.
  - Opening matchup.
  - "Start Conference" CTA.
- If muse generation fails, use a text-only candidate.

### UI Direction

- Avoid marketing-page hero layout.
- Treat it like an in-game event screen:
  - Dense team parade grid.
  - Compact top banner.
  - Clear next action.
  - No giant decorative cards.
- Use team colors from `PBA_TEAM_DATA`.
- Keep visual noise below the gameplay surfaces. This is a one-minute ritual, not the main mode.

## Trade And Market Flavor

PBA large-market advantage is post-MVP unless the user specifically wants it in the first pass.

When implemented:

- Use `PBA_TEAM_DATA.pop`.
- Apply only inside PBA trade valuation.
- Keep modifier visible in trade explanation UI.
- Corporate block loyalty should not silently make unfair trades pass. It should be an explained morale / destination preference adjustment.

Suggested modifiers:

- `pop >= 10`: +15% destination desirability.
- `pop >= 5`: +8% destination desirability.
- `pop < 2`: -10% destination desirability.
- Same corporate block: reduced morale penalty.

## File Plan

### Already Created

- `src/data/templates/philippines/competitions.ts`
- `src/data/templates/philippines/teamPopulations.ts`

### New Files

- `src/services/pba/importManager.ts`
- `src/services/pba/conferenceTransition.ts`
- `src/services/pba/pbaDefaults.ts` if defaults become too large for `constants.ts`
- `src/services/pba/draftRules.ts`
- `src/services/pba/awards.ts`
- `src/services/pba/museGenerator.ts`
- `src/components/pba/PBAHubView.tsx`
- `src/components/pba/PBAImportTracker.tsx`
- `src/components/pba/PBAOpeningCeremonyView.tsx`
- `src/components/pba/PBASetupReview.tsx` if setup needs a separate review component

### Existing Files To Edit

- `src/types.ts`
  - Add `pba_isolated` mode, PBA state, PBA action types, PBA rows.
- `src/utils/uiMode.ts`
  - Add `isPbaIsolatedMode`.
- `src/constants.ts`
  - Add or re-export PBA defaults.
- `src/components/CommissionerSetup.tsx`
  - Add PBA setup path.
- `src/App.tsx`
  - Route setup review and PBA event overlays if needed.
- `src/store/GameContext.tsx`
  - Add `INIT_PBA_CAREER`, import actions, conference transition actions, load healing.
- `src/services/offseason/offseasonState.ts`
  - Add PBA row order and visible-row branch.
- `src/components/offseason/OffseasonAufgaben.tsx`
  - Add PBA row labels, descriptions, instruction modals, auto-complete rules.
- `src/components/sidebar/NavigationMenu.tsx`
  - Add PBA navigation gates.
- `src/utils/euroLeagueDefaults.ts` or replacement generic helper
  - Generalize competition tabs or add PBA tab helpers.
- `src/hooks/useHubScope.ts`
  - Scope PBA standalone views to PBA teams/players.
- `src/components/layout/MainContent.tsx`
  - Route `PBA Hub`.
- `src/components/players/view/FreeAgentsView.tsx`
  - Add import-search mode or wrapper.
- `src/components/modals/SigningModal/SigningModal.tsx`
  - Hide NBA-only CBA sections in PBA mode; block normal contract extension for imports.
- `src/components/central/view/TradeMachineModal.tsx`
  - PBA team scoping and import trade block.

## Implementation Order

### Phase 0 - Stabilize The Plan Boundary

- Confirm no one is actively editing the same PBA plan/code files.
- Keep current Euro worktree changes untouched.
- Do not refactor Euro helpers until the PBA hub decision is made.

Acceptance:

- Plan file is current.
- No code changed yet except deliberate PBA foundation.

### Phase 1 - Foundation ✅

- ✅ `isPbaIsolatedMode` + `isNonNbaIsolatedMode` in `uiMode.ts`.
- ✅ `uiMode: 'pba_isolated'` on LeagueStats type.
- ✅ PBA state fields on LeagueStats (pbaConference, pbaConferencePhase, pbaConferenceChampions, pbaGrandSlam, pbaAllStarResults).
- ✅ Player import fields (isImport, importConference, importTeamId, importSeason).
- ✅ 8 PBA offseason rows with labels, descriptions, tabs, checklist defaults.
- ✅ `PBA_ISOLATED_DEFAULTS` in constants.ts.
- ✅ `moddedLeagueBase: 'philippines'` in GameState type.
- Seed `activeCompetitions` from `PBA_COMPETITIONS` — deferred to INIT_PBA_CAREER reducer.
- Add load healing defaults for missing PBA fields — deferred to INIT_PBA_CAREER reducer.

### Phase 2 - Setup And Sidebar ✅

- ✅ Philippines as third card in `LeagueTypeSelector` (NBA | Europe | Philippines).
- ✅ `ModdedLeagueBase` type extended with `'philippines'`.
- ✅ PBA team picker reuses Endesa pattern — `fetchPBARoster` loads 12 PBA teams.
- ✅ Commissioner card disabled for PBA (GM-only, like Europe).
- ✅ PBA-specific GM tags ("3 Cups", "Imports", "4-Point Line").
- ✅ `getPbaKeyDates()` in `keyDates.ts` — 13 key dates across 3 conferences.
- ✅ PBA zone colors + labels (philippineCup green, commissionersCup red, governorsCup gold).
- ✅ PBA start date: October 5 (Philippine Cup opening).
- ✅ PBA team pick → timeline (jumpstart with PBA key dates).
- ✅ `StartDateTimeline` PBA mode branch — uses `getPbaKeyDates()`, PBA_TIMELINE_MIN/MAX, PBA_ZONE_COLORS/LABELS, PBA zone segments, PBA month ticks (Oct–Jan 16 months).
- ✅ Sidebar gates — `pbaGmGroups` with PBA Hub route.
- ✅ JumpReviewScreen PBA mode — shows PBA-specific auto-resolved and upcoming items instead of NBA items.
- [ ] Heads-Up screen (roster overview, season road map) — deferred to post-MVP.
- ✅ `INIT_PBA_CAREER` reducer — seeds defaults, generates Phil Cup schedule, sets phase to regularSeason.

### Phase 3 - Competition Hub And Scoping ✅

- ✅ PBA Hub (`PBAHubView.tsx`) with 3 conference tabs (Philippine Cup / Commissioner's Cup / Governors' Cup).
- ✅ Tab states: current (standings, upcoming, leaders, import tracker), completed (champion), future (start date, import rule).
- ✅ Scope standings to PBA (flat 12-team W-L from boxScores).
- ✅ Scope stats, injuries, leaders, feats, award races, power rankings to PBA via `useHubScope`.
- ✅ Scope schedule to PBA — ScheduleView filters to PBA teams only.
- ✅ Scope transactions to PBA — default filter set to 'PBA' in PBA mode.
- ✅ PBA Hub route in MainContent.tsx — uses PBAHubView in isolated mode, InternationalLeagueHub otherwise.
- ✅ "Advance to Next Conference" / "Next Season" CTA in Hub header when phase = complete.

### Phase 4 - Conference Transitions ✅

- ✅ `conferenceTransition.ts` service — getNextConference, generateNextConferenceSchedule, clearConferenceImports, recordConferenceChampion, checkGrandSlam.
- ✅ `ADVANCE_PBA_CONFERENCE` reducer — generates next conference schedule, clears imports, advances date.
- ✅ `RECORD_PBA_CHAMPION` reducer — records champion + sets phase to complete.
- ✅ Season loop: Phil Cup → Comm Cup → Gov Cup → advance year → Phil Cup.

### Phase 5 - Import System ✅

- ✅ `importManager.ts` — isFilipino (dual-nationality), isImportEligible, canSignInPba, getActiveImport, stampImportFlags.
- ✅ Import signing gate in usePlayerQuickActions — blocks signing based on conference rules.
- ✅ Import flag stamping after SIGN_FREE_AGENT in PBA mode.
- ✅ Import auto-clear at conference end via clearConferenceImports in ADVANCE_PBA_CONFERENCE.
- ✅ Gov Cup height gate (77 inches / 6'5").
- ✅ One-import-per-team enforcement.
- ✅ "Import" badge on FreeAgentCard for non-Filipino players.
- ✅ Import Tracker sub-tab in PBA Hub (Commissioner's/Governors' Cup tabs).
- ✅ `allPBA` team selector in competitionScheduler.

### Phase 6 - Draft ✅

- ✅ `draftRules.ts` — getPbaDraftPool (Filipino-only filter), getPbaDraftOrder (reverse Gov Cup standings), PBA_DRAFT_ROUNDS.
- PBA draft UI reskin and draft pool scoping deferred — existing DraftSimulatorView + DraftScoutingView work with PBA teams.

### Phase 7 - Polish MVP Flavor ✅

- ✅ Opening Ceremony (`PBAOpeningCeremonyView.tsx`) — team parade grid, conference info, Start/Skip CTAs.
- ✅ Basic conference awards service (`awards.ts`) — computeConferenceBestPlayer, computeConferenceBestImport, computeSeasonMVP.
- ✅ Import Tracker sub-tab in PBA Hub.
- Muse selection deferred — MVP can skip.
- All-Star Weekend PBA reskin deferred — existing NBA All-Star sim runs, PBA-specific captain draft is post-MVP.

Acceptance:

- Flavor rows can be skipped without breaking season flow.
- Awards and champion display survive save/load.
- All-Star auto-sims and results are viewable.

### Phase 8 - Verification And Docs

- `npm run lint`.
- `npm run build`.
- Manual PBA new-save browser run:
  - setup -> draft -> Philippine Cup start.
  - skip/sim to Philippine Cup end.
  - sign Commissioner's import.
  - transition to Governors' Cup.
  - verify height gate.
  - finish Governors' Cup.
  - verify next September loop.
- Manual NBA existing-save smoke:
  - sidebar unchanged.
  - FA signing still works.
  - draft still works.
- Manual Euro existing-save smoke:
  - Euro sidebar and transfer tasks unchanged.

Docs after code lands:

- Update `README.md`, `PRODUCT.md`, `TODO.md`, and `CHANGELOG.md`.
- Mark whether PBA mode is shipped, worktree-only, or deferred.

## QA Checklist

### Save/Load

- New PBA save reloads into PBA Hub.
- Active import reloads with correct chip and action restrictions.
- Completed conference champion reloads.
- Future conference does not appear completed after reload.
- NBA save does not gain PBA defaults.
- Euro save does not gain PBA defaults.

### UI

- No overlapping text at 1366x768.
- Sidebar remains usable at laptop height.
- Mobile sheet can reach PBA Hub and current task.
- Long team names fit:
  - Magnolia Chicken Timplados Hotshots.
  - Rain or Shine Elasto Painters.
  - Titan Ultra Giant Risers.
- Currency displays PHP/Peso in PBA financial/signing surfaces.
- Import status is visible on roster, free agency, player card, and import tracker.

### Simulation

- Three conferences do not double-count standings.
- Completed conference stats do not disappear.
- Twice-to-beat quarterfinals either works or is explicitly downgraded with a TODO before shipping.
- Four-point stats appear only when enabled.
- Imports are eligible for games only during their conference.

### Roster Integrity

- No player appears on two teams.
- Imports cleared after conference end are `tid = -1` unless signed normally later.
- Waived import has no ghost contract corruption.
- User team cannot exceed max roster through import signing.
- Filipino players are not marked as imports.

## Production Risks

### Highest Risk

- Calendar and season-year math across three conferences.
- Reusing the current Euro hub helpers without overfitting PBA to Euro concepts.
- Import lifecycle bypassing existing signing/waive cleanup.
- Schedule and standings mixing all three conferences together.

### Medium Risk

- Draft UI assumptions about 30 NBA teams and lottery.
- Salary/cap UI showing NBA-only concepts.
- All-Star code using NBA conferences and negative team IDs. Mitigated: hook and reskin, captain draft replaces conference split.
- Hidden NBA background events firing visible modals.

### Lower Risk

- Muse and ceremony flavor.
- Team population modifiers.
- Ticket pricing and arena data.

## Stop Conditions

Stop and write a blocker note before continuing if:

- PBA setup requires destructive changes to Euro setup flow.
- Generic competition tab refactor starts breaking Euro mode.
- Conference transition creates duplicate schedule entries.
- Imports cannot be waived without contract corruption.
- PBA save leaks NBA playoffs, NBA draft, or NBA offseason tasks into the main flow.

## Deferred Ideas

### Gameplay

- Guest teams.
- Player-coach mechanic.
- Sweetener economy.
- Corporate block loyalty.
- Team personality modifiers.
- Jump-league ban.
- First overall pick two-season trade ban.
- Pocket tournament with foreign teams.

### Events And Culture

- PBA League News / Social Feed.
- International games.
- Out-of-town games.
- Jersey reveals and rebrand events.
- PBA 50 Greatest Players / Hall of Fame.
- Flagrant foul and brawl events.
- Leo Awards ceremony.
- Jersey retirement ceremonies.
- Christmas Day rivalry games.
- Philippine Arena special events.
- Typhoon postponements.

### Infrastructure

- PBA D-League feeder system.
- Arena upgrade system.
- Ticket pricing revenue model.
- Commissioner mode.
- FIBA window coordination.
- Franchise sale / acquisition mechanics.

