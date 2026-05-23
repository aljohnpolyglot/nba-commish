# Long Files Refactor Plan

## Goal

Reduce the repo's highest-maintenance files without changing feature behavior.

This plan targets logic-heavy files first. Large data payloads like `src/data/2kImport/captions.ts` are explicitly out of scope unless they start causing runtime or tooling problems.

## Current Hotspots

| File | Lines | Notes |
| --- | ---: | --- |
| `src/utils/debugCheats.ts` | 5053 | Mixed registry, audits, save-heal flows, sim diagnostics |
| `src/store/GameContext.tsx` | 3650 | Provider, bootstrap, migration/heal, save wiring, app orchestration |
| `src/components/offseason/OffseasonAufgaben.tsx` | 2780 | Badge, CTA, sidebar, modal stack, footers, helper logic |
| `src/services/AIFreeAgentHandler.ts` | 2066 | Multiple signing passes, trims, extensions, Bird rights, MLE swaps |
| `src/store/logic/turn/simulationHandler.ts` | 1965 | Day sim orchestration, cup/playoff/rollover passes, messaging |
| `src/types.ts` | 1909 | Domain types collapsed into one file |
| `src/components/modals/SigningModal/SigningModal.tsx` | 1903 | Negotiation UI + contract logic + roster/cap gating |
| `src/components/commissioner/rules/view/useRulesState.ts` | 1854 | Giant form-state hook |
| `src/components/transferMarket/EuroTransferMarketView.tsx` | 1809 | Whole screen + modals + display atoms |
| `src/services/logic/seasonRollover.ts` | 1347 | Broad season-end orchestration |

## Guardrails

- Preserve public component exports during each phase.
- Prefer extraction by feature boundary, not by arbitrary line-count slicing.
- Avoid touching generated/data files in the same pass as logic refactors.
- Each phase should end with at least `npm run lint`.
- Keep TODO/plan status explicit when a phase is only worktree-complete.

## Phases

### Phase 1 — OffseasonAufgaben Foundation

Status: in progress

Scope:
- Extract shared helper logic from `src/components/offseason/OffseasonAufgaben.tsx` into a dedicated local module.
- Move date/row-signal logic, sponsorship coverage helpers, staff-opening helpers, and small formatting helpers out of the main file.
- Keep `OffseasonAufgaben.tsx` as the composition surface for badge, CTA, sidebar, and footers.

Deliverable:
- New shared module consumed by `OffseasonAufgaben.tsx`
- No behavior change intended

### Phase 2 — OffseasonAufgaben UI Split

Scope:
- Split `OffseasonPhaseBadge`, `OffseasonNextActionButton`, `OffseasonAufgabenSidebar`, and the mobile/footer pieces into local files under `src/components/offseason/`.
- Leave modal-heavy state in the parent until extraction boundaries are stable.

### Phase 3 — AI Free Agency Decomposition

Scope:
- Break `src/services/AIFreeAgentHandler.ts` into `freeAgency/` submodules:
  - fit scoring
  - main signing round
  - auto-trim / promotions
  - extensions
  - Bird-rights re-signs
  - MLE upgrade swaps
- Keep a thin orchestrator file exporting the current public API.

### Phase 4 — Simulation Pipeline Split

Scope:
- Break `src/store/logic/turn/simulationHandler.ts` into pipeline passes:
  - cup logic
  - playoff logic
  - daily progression
  - roster normalization / post-day cleanup
  - social/message side effects
- End state: `runSimulation` reads like a pass pipeline instead of one long control block.

### Phase 5 — GameContext Provider Cleanup

Scope:
- Extract bootstrap effects, save-id syncing, load-game heal/migration paths, and provider action helpers out of `src/store/GameContext.tsx`.
- Keep the provider focused on state/context wiring.

### Phase 6 — Commissioner Rules Hook Split

Scope:
- Break `useRulesState.ts` into grouped hooks by domain:
  - schedule/playoffs
  - all-star
  - gameplay
  - economy
  - draft / eligibility
- Add pure defaults/mapping helpers so resets and migrations stop living inline.

### Phase 7 — Modal/View Splits

Scope:
- `SigningModal.tsx`: extract tab bodies plus a negotiation-state hook.
- `EuroTransferMarketView.tsx`: extract tabs, modals, and display atoms.

### Phase 8 — Types Domain Split

Scope:
- Split `src/types.ts` into domain files and re-export from an index.
- Do this only after the higher-churn feature files above stabilize.

## Suggested Order

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6
7. Phase 7
8. Phase 8
