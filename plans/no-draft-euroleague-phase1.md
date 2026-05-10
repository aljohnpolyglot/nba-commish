# Plan — Phase 1: `no_draft` Offseason Decoupling

> **Scope of this plan:** only Phase 1 of `NO_DRAFT_EUROLEAGUE_PLAN.md`.
> Phase 2 (EuroLeague playable) gets its own plan once Phase 1 lands.
> Delete this file after the slice list is fully checked off.

## Goal

A save with `leagueStats.draftType === 'no_draft'` advances through a full offseason → in-season cycle without surfacing, blocking on, or auto-running any draft-related task.

## Acceptance Criteria

Observable from a real user session — not implementation details.

- [ ] **AC-1** Starting a new modded-Europe save: GM offseason sidebar (`OffseasonAufgaben.tsx`) shows no `Draft Lottery`, `NBA Draft`, or `Rookie Contracts` rows.
- [ ] **AC-2** Simulating from June 1 through October 24 in a no-draft save produces zero draft-related artifacts: no rookies (`tid === -2 → tid >= 0` transition), no `state.history` entries containing "Draft", no `state.draftPicks` mutation past initial setup.
- [ ] **AC-3** Loading a legacy NBA save with `offseasonChecklist.draft.status === 'pending'`, then dispatching `UPDATE_RULES { draftType: 'no_draft' }`, results in those pending draft rows flipping to `'skipped'` without crash on next render.
- [ ] **AC-4** Commissioner Settings → Draft Lottery shows the `No Draft - transfer/signing league` option; selecting it hides the Rookie-Contract settings panel (`EconomyRookieContractsSection`).
- [ ] **AC-5** Reaching September 29 in a no-draft save fires the Training Camp → in-season transition without manual `Mark Done` on any draft row — the offseason-complete gate works without ever setting `draftComplete = true`.

## Pre-Existing Work (already in the worktree)

Confirmed by research before drafting this plan:

- `isNoDraftLeague()` helper — `src/services/offseason/offseasonState.ts:239`
- `getVisibleOffseasonRows()` filters draft rows — `offseasonState.ts:245-251`
- `defaultOffseasonChecklist()` marks draft rows `'skipped'` at init — `offseasonState.ts:325`
- `autoRunLottery()` early-returns on `no_draft` — `src/services/logic/autoResolvers.ts:1078`
- `autoRunDraft()` early-returns on `no_draft` — `autoResolvers.ts:1117`
- `EconomyRookieContractsSection` returns null on `no_draft` — `EconomyRookieContractsSection.tsx:21`
- `OffseasonAufgaben.tsx` consumes `getVisibleOffseasonRows()` — sidebar filtering
- `isEuropeModded` flag in setup auto-applies `draftType: 'no_draft'` — `src/store/logic/initialization.ts:42`

So Phase 1 is ~80% shipped. Remaining work is small and verification-heavy.

## Slices

Each slice is a single one-sentence behavior, mergeable on its own, leaving the codebase green.

### ✓ Slice 1 — `LOAD_GAME` self-heals legacy `pending` draft rows when `no_draft` is active

- **Status:** SHIPPED in worktree, awaiting review/commit.
- **Value:** A user who switches an existing save's `draftType` to `no_draft` doesn't end up with a permanently stuck checklist row.
- **Path:** `src/store/GameContext.tsx` LOAD_GAME reducer (~line 1125) → after restoring state, if `isNoDraftLeague(loaded.leagueStats)` is true and any of `draftLottery|draft|rookieContracts` rows are still `'pending'` or `'in-progress'`, flip them to `'skipped'` and pass via `setState({ ..., offseasonChecklist: healedOffseasonChecklist })`.
- **Acceptance:** AC-3. Repro: hand-craft a save JSON with `draftType: 'nba2019'`, `offseasonChecklist.draft: 'pending'`, edit `draftType` to `'no_draft'`, reload — sidebar must not list `NBA Draft`. Browser walkthrough deferred to Slice 4.
- **Test status:** Type-check clean (only pre-existing expansion-action errors unrelated to this slice).

### ~~Slice 2 — Offseason completion gate uses `getVisibleOffseasonRows`~~ (DROPPED)

- **Why dropped:** `isChecklistComplete()` in `offseasonState.ts:388-394` already treats `'done'` AND `'skipped'` as resolved. With Slice 1 ensuring draft rows are always `'skipped'` for no_draft saves (both fresh and legacy), the gate already closes correctly.
- **Defensive variant** (optional, not blocking): replace `OFFSEASON_ROW_ORDER.every(...)` with `getVisibleOffseasonRows(leagueStats).every(...)` for clarity. Punt to Phase 2 cleanup if desired.

### Slice 3 — Lock in auto-resolver guards with a regression check

- **Value:** Future refactors of `autoRunDraft` / `autoRunLottery` cannot silently reintroduce draft simulation for transfer leagues.
- **Path:** Either a Vitest unit test that calls `autoRunDraft` with `leagueStats.draftType === 'no_draft'` and asserts empty return, OR a documented DevTools snippet in `CLAUDE.md` for manual verification.
- **Acceptance:** Test exists and passes; OR snippet documented and confirmed once.
- **Workflow:** RED (failing test if guard removed), GREEN (test passes against current guard), REFACTOR.

### Slice 4 — End-to-end browser walkthrough

- **Value:** Confirms AC-1, AC-2, AC-4, AC-5 in a real session — the only way to catch a missed coupling.
- **Path:** `npm run dev`, start fresh modded-Europe save, sim May → October, observe sidebar / state / phase transitions.
- **Acceptance:** All five AC items checked off here.
- **Workflow:** Manual; documented as a checklist note appended to this plan and removed when the plan is deleted.

## Out of Scope (Defer to Phase 2 plan)

- EuroLeague schedule generation
- EuroLeague team-control as user team
- Multi-competition calendars (NBA + EuroLeague concurrent)
- Endesa setup beyond what `isEuropeModded` already handles
- League-aware `getGamePhase()` refactor (Phase 4)

## Process

1. **Right now: get acceptance-criteria sign-off from the user before writing any code.**
2. Pick one slice. RED → GREEN → REFACTOR. Open a PR. Request approval.
3. After Slice 4 passes, delete this file and remove `plans/` if empty.
