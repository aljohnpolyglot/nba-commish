# No-Draft / EuroLeague Plan

## Goal

Enable commissioner-controlled non-NBA league flows without forcing an NBA-style draft.

Phase 1 is intentionally narrow:
- if `leagueStats.draftType === 'no_draft'`, offseason must not require lottery, draft, or rookie-contract tasks
- auto-resolvers must not fire lottery/draft
- GM offseason UI must skip draft-only rows cleanly

This is the prerequisite for EuroLeague-first team control.

## Why This Comes First

EuroLeague and similar leagues are transfer/signing ecosystems, not draft-centered ecosystems.

As long as the current offseason pipeline assumes:
- lottery result exists
- draft day is mandatory
- rookie contracts follow draft completion

the app cannot support a European primary league without brittle exceptions everywhere.

## Phase 1 — No-Draft Offseason Decoupling

### Scope

- Add first-class `no_draft` behavior to the offseason checklist flow
- Skip draft-only automation in offseason and auto-resolvers
- Keep existing NBA flows unchanged

### Code Areas

- `src/services/offseason/offseasonState.ts`
- `src/store/GameContext.tsx`
- `src/components/offseason/OffseasonAufgaben.tsx`
- `src/services/logic/autoResolvers.ts`
- `src/components/commissioner/rules/view/DraftLotterySettings.tsx`

### Deliverables

1. Rules UI can select `no_draft`.
2. Default offseason checklist marks `draftLottery`, `draft`, and `rookieContracts` as skipped.
3. Offseason self-heal converts existing pending draft rows to skipped when `no_draft` is active.
4. `autoRunLottery` and `autoRunDraft` early-return when `no_draft` is active.
5. Tasks sidebar hides draft-only rows when `no_draft` is active.

### Non-Goals

- No EuroLeague schedule generation yet
- No Endesa support yet
- No multi-competition calendar yet
- No changes to player acquisition beyond removing draft requirements

## Phase 2 — EuroLeague As Primary Playable League

### Goal

Allow `gameMode='gm'` with a EuroLeague team as the user-controlled club under commissioner settings.

### Required Work

- promote playable primary competition identity beyond `leagueType`
- define EuroLeague roster/team source and standings source
- create EuroLeague season calendar template
- make league labels, standings, playoffs, and awards competition-aware

### Exit Criteria

- user can start a EuroLeague save
- control one EuroLeague team
- simulate a full EuroLeague season without NBA draft dependencies

## Phase 3 — League-Aware Rules

### Goal

Commissioner settings stop assuming NBA defaults for every save.

### Required Work

- separate draft, roster-limit, contract, and schedule assumptions by competition
- hide or repurpose NBA-only settings in non-draft leagues
- add sane default presets for EuroLeague

## Phase 4 — Schedule Generalization

### Goal

Make the schedule model competition-aware instead of NBA-regular-season-centric.

### Required Work

- classify games by competition type
- support league, cup, euroleague, preseason, playoffs in one unified schedule
- preserve existing NBA cup/playoff behavior

## Phase 5 — Endesa

### Goal

Add Endesa as a second playable league after EuroLeague works standalone.

### Reason For Ordering

Endesa becomes much more valuable once dual-league scheduling exists. Doing it before schedule generalization would create more temporary architecture than durable product value.

## Phase 6 — Dual Leagues

### Goal

Support one club participating in both a domestic league and EuroLeague simultaneously.

### Required Work

- concurrent calendars
- conflict resolution for same-day fixtures
- rotation/fatigue logic across competitions
- standings/playoff qualification tracked per competition

## Recommended Build Order

1. Phase 1: `no_draft` offseason decoupling
2. Phase 2: standalone EuroLeague team-control
3. Phase 3: league-aware commissioner settings
4. Phase 4: generalized multi-competition schedules
5. Phase 5: Endesa
6. Phase 6: dual leagues
