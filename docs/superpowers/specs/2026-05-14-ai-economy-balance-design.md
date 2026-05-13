# AI-Economy Balance + Front-Office IA-Refactor — Design

**Date:** 2026-05-14
**Component scope:**
- New: `src/services/tycoon/aiBudgetDecision.ts`, `tvRightsPool.ts`, `aiTightening.ts`, `seasonAIPass.ts`
- New: `src/components/central/view/FrontOffice/sections/TVRightsSection.tsx`
- Modified: `src/services/tycoon/budgetEngine.ts` (TV-Rights via pool, not `tb.tvRevenue × starBoost`)
- Modified: `src/services/seasonRollover.ts` (call `seasonAIPass()` after ledger writes)
- Modified: `src/services/AIFreeAgentHandler.ts` (respect `team.tycoon.aiWageBudgetTarget` if set)
- Modified: `src/components/central/view/FrontOfficeView.tsx` (three-group layout)
- Modified: `src/components/central/view/LeagueFinancesView.tsx` (matching group headers)
- Modified: `src/utils/tierMapping.ts` (new — central `mapSetupTierToTycoonTier()`)
- Modified: `src/types/tycoon.ts` (add `aiWageBudgetTarget?: number` to `TycoonState`)

**Read-only / out-of-scope (parallel agent's scope):**
- `src/data/sponsorCatalogFetcher.ts`, `src/utils/sponsorLogos.ts`
- `src/components/central/view/FrontOffice/sections/SponsorshipSection.tsx`
- `src/components/tycoon/SponsorshipNegotiationModal.tsx`
- `src/services/tycoon/specs/spain.ts` (parallel agent owns sponsor-catalog migration; we touch only `TIER_BASE.tvRevenue` if absolutely needed — see Risks)

**Out of scope:**
- New leagues' tycoon data (only Endesa + Euroleague get the TV-pool numbers; other leagues fall back to legacy `tb.tvRevenue`).
- Mid-season Auto-Tightening (only end-of-season rollover triggers; in-season cuts deferred).
- Owner-Vision implementation (this design *consumes* `team.ownerProfile?.vision` if present, but the field comes from the separate Euro-Setup-Hybrid spec).
- Renaming `TycoonTier` (S/A/B/C/D) — Setup-spec's Powerhouse/.../Underdog labels become UI labels only, mapped to existing S/A/B/C/D internally.

## Problem

Joventut-Badalona-snapshot illustrates the core balance issue:

| Line | Value |
|---|---|
| Total revenue | €1.78M |
| Total expenses | €14.11M (Medical alone: €4.25M = 30%) |
| Projected profit | **–€12.33M** |
| Year-end cash | **–€12.18M** |

The cause is structural: AI teams use the same `medicalBudget` and `travelPreferences` defaults as user-controlled S-tier teams. There is no AI-side decision logic that adjusts spending to revenue. Combined with a fixed `tb.tvRevenue` per tier that does not account for league-pool dynamics, every AI team below Tier A is in a slow bankruptcy spiral.

Adjacent issue: the Front Office UI groups Medical & Recovery under "Operations", which is semantically wrong — Medical is squad-care, not facility-ops. The user flagged it explicitly.

## Goals

- AI teams below Tier S **survive long-term** without manual intervention: spending defaults scale with tier; two-loss seasons trigger automatic tightening; two-profit seasons trigger graceful expansion.
- TV-Rights becomes a **league-pool with standing-based distribution** so first-place teams earn meaningfully more than last-place teams (real-world La Liga / Euroleague behaviour).
- Sponsor-renewal-bonus (already coded in `recentSuccessBonus`) is **verified to apply to AI teams too**, not just the user team.
- Front-Office UI uses three semantically correct groups: **Revenue / Squad Investment / Operations**, with TV-Rights becoming visible as its own section.
- All changes are **additive**: `tb.tvRevenue` stays as a fallback for leagues without pool data, `aiWageBudgetTarget` is optional on tycoon state, existing user-team behaviour unchanged.

## Non-Goals

- Mid-season Auto-Tightening (only end-of-season rollover triggers).
- Per-tier minimum-payroll floor (NBA-style shortfall distribution) — that's an NBA Pass-5 problem, out of scope here.
- New news-feed UI for tightening events — uses existing `state.history` text-event system.
- Tier-renaming for S/A/B/C/D ↔ Powerhouse/.../Underdog harmonization beyond a helper.
- Refactoring `sponsorshipEngine.recentSuccessBonus` — kept verbatim, just verified.

## Design

### 1. Architecture

```
Existing pipeline (core untouched):
  budgetEngine.computeAnnualBudget()  → AnnualLedger
  seasonRollover  → writes ledger to team.tycoon.ledgerHistory
  sponsorshipEngine.recentSuccessBonus()  → already applies to renewals

New layer (additive):
  services/tycoon/aiBudgetDecision.ts   ← decides medical/travel/wages per AI-team
  services/tycoon/tvRightsPool.ts       ← liga-pool + per-team share
  services/tycoon/aiTightening.ts       ← 2-loss / 2-profit rules
  services/tycoon/seasonAIPass.ts       ← orchestrator, called from seasonRollover

Modified:
  budgetEngine.ts        ← TV-line reads from tvRightsPool
  seasonRollover.ts      ← calls seasonAIPass() after ledger writes
  AIFreeAgentHandler.ts  ← respects team.tycoon.aiWageBudgetTarget
  FrontOfficeView.tsx    ← three-group layout
  LeagueFinancesView.tsx ← matching group headers
  tierMapping.ts         ← new central helper
```

### 2. AI-Spending decision (`aiBudgetDecision.ts`)

Pure function:
```ts
type AIBudgetDecision = {
  medicalBudget: number;         // EUR
  travelPreferences: { hotel: number; flight: number; bus: number };
  aiWageBudgetTarget: number;    // EUR — soft cap consulted by FA handler
};

function chooseAIBudgets(
  team: NBATeam,
  recentLedgers: AnnualLedger[],
  ownerVision?: 'WinNow' | 'Develop' | 'Frugal',
): AIBudgetDecision;
```

Tier-default table:

| Tier | Medical | Hotel | Flight | Bus | Wage-Target (% of cap) |
|---|---|---|---|---|---|
| S | €4–6M | 4.0★ | 3.0★ Business | 3.0★ | 95% |
| A | €2–3M | 3.5★ | 2.5★ Business | 2.5★ | 85% |
| B | €1–1.5M | 3.0★ | 2.0★ Premium-Econ | 2.5★ | 75% |
| C | €500K–1M | 2.5★ | 1.5★ Econ | 2.0★ | 65% |
| D | €300–500K | 2.0★ | 1.0★ Econ | 1.5★ | 55% |

Owner-Vision modifies (only when `team.ownerProfile?.vision` is set by the Euro-Setup spec):
- `WinNow` → push 1 tier higher in Medical + Travel (B-team gets Mid medical instead of Skeleton)
- `Frugal` → push 1 tier lower in Medical + Travel
- `Develop` → unchanged (default behaviour)

Within-tier jitter: deterministic per team-id, so two C-tier teams don't end up with identical spend (small variation for liga colour).

### 3. TV-Rights pool (`tvRightsPool.ts`)

```ts
const TV_POOL_EUR: Partial<Record<LeagueId, number>> = {
  endesa: 40_000_000,
  euroleague: 100_000_000,
};

computeTVShare(
  team: NBATeam,
  leagueId: LeagueId,
  prevStanding: number | null,
  totalTeams: number,
): number;
```

Formula:
- `pool = TV_POOL_EUR[leagueId]` — if undefined, return legacy `team.tycoon.tier`-based number (defensive fallback)
- `equalShare = pool * 0.60 / totalTeams`
- Standing-weight: `w(rank) = 2 * (totalTeams - rank) / (totalTeams - 1)` → first=2.0, last=0.0, mid≈1.0
- Closed-form: `sum_{r=1..N} w(r) = N` (weights average to 1.0), so `standingShare(rank) = pool * 0.40 * w(rank) / totalTeams`. This guarantees `sum(standingShare) = pool * 0.40` (no rounding leak across the league)
- If `prevStanding == null` (first season) → `standingShare = pool * 0.40 / totalTeams` (equal-share fallback)
- Total: `equalShare + standingShare`

Endesa worked example (18 teams):
- equalShare = 40M × 0.60 / 18 = **€1.333M / team**
- First-place standing share = (40M × 0.40 × 2.0) / 18 = **€1.778M**
- Last-place standing share = 0
- → First-place total: **€3.11M**, Last-place total: **€1.33M**, Average: ~€2.22M

Euroleague (18 teams, €100M pool):
- equalShare = €3.33M / team
- First-place total: €7.78M, Last-place: €3.33M

`budgetEngine.computeAnnualBudget` line 92 changes from `tv = Math.round(tb.tvRevenue * starBoost)` to:
```ts
const poolShare = computeTVShare(team, leagueId, ctx.prevStanding, ctx.totalTeams);
const tv = poolShare > 0
  ? Math.round(poolShare * starBoost)  // star-boost still applies on top
  : Math.round(tb.tvRevenue * starBoost);  // legacy fallback
```

`BudgetContext` gains `prevStanding?: number | null` and `totalTeams?: number` (filled in by `seasonRollover` when calling `computeAnnualBudget`).

### 4. Auto-Tightening (`aiTightening.ts`)

```ts
type TighteningAction =
  | { kind: 'tighten'; medicalCut: number; travelStarCut: number; wageTargetCut: number }
  | { kind: 'expand'; medicalRaise: number; travelStarRaise: number; wageTargetRaise: number };

function evaluateTightening(team: NBATeam, ledgerHistory: AnnualLedger[]): TighteningAction | null;
function applyTightening(team: NBATeam, action: TighteningAction): void;
```

Rules:
- Need `ledgerHistory.length >= 2`
- If `ledgerHistory[-1].profit < 0 && ledgerHistory[-2].profit < 0`:
  - `{ kind: 'tighten', medicalCut: 0.25, travelStarCut: 0.5, wageTargetCut: 0.10 }`
- If `ledgerHistory[-1].profit > 0 && ledgerHistory[-2].profit > 0`:
  - `{ kind: 'expand', medicalRaise: 0.15, travelStarRaise: 0.3, wageTargetRaise: 0.05 }`
  - Capped at tier-default from `aiBudgetDecision` (no infinite escalation)
- Otherwise `null`

Application:
- `team.tycoon.medicalBudget *= (1 - cut)` / `*= (1 + raise)` clamped to tier range
- `team.tycoon.travelPreferences.{hotel,flight,bus} -= cut` clamped to [0.5, 5.0]
- `team.tycoon.aiWageBudgetTarget *= (1 - cut)` (Free-Agency handler reads this)

News event in `state.history`:
- Tighten: `"{Team} has cut medical and travel budgets after a difficult fiscal year."`
- Expand: `"Following two profitable seasons, {Team} has invested in elite medical facilities."`

Uses `getTeamFullName(team)` per CLAUDE.md rule 1 (never inline `${team.region} ${team.name}`).

### 5. Season AI orchestrator (`seasonAIPass.ts`)

```ts
function seasonAIPass(state: GameState): GameState {
  for (const team of state.teams) {
    if (team.tid === state.userTeamId) continue;          // skip user team
    if (!team.tycoon) continue;                            // non-Euro team
    const history = team.tycoon.ledgerHistory ?? [];
    // 1. Apply tightening/expansion from last 2 seasons
    const action = evaluateTightening(team, history);
    if (action) applyTightening(team, action);
    // 2. (Re-)decide budgets for upcoming season
    const decision = chooseAIBudgets(team, history, team.ownerProfile?.vision);
    team.tycoon.medicalBudget = decision.medicalBudget;
    team.tycoon.travelPreferences = decision.travelPreferences;
    team.tycoon.aiWageBudgetTarget = decision.aiWageBudgetTarget;
  }
  return state;
}
```

Called from `seasonRollover.ts` after `computeAnnualBudget` has written current-season ledgers but before next season starts. Pure function (returns mutated state via shallow clone, per existing rollover conventions).

### 6. Front-Office IA-Refactor

`FrontOfficeView.tsx` layout reorder (no component splits, just group wrappers):

```tsx
<SectionGroup title="REVENUE STREAMS">
  <SponsorshipSection ... />     {/* parallel agent's polished version */}
  <MatchdaySection ... />         {/* existing */}
  <TVRightsSection ... />         {/* NEW — see below */}
</SectionGroup>

<SectionGroup title="SQUAD INVESTMENT">
  <MedicalSection ... />          {/* moved from Operations */}
  <FacilitiesSection ... />       {/* existing; rename intro to "Player Development" */}
</SectionGroup>

<SectionGroup title="OPERATIONS">
  <TravelSection ... />           {/* existing */}
  <StaffWagesSection ... />       {/* existing, if separate; else inlined */}
  <FacilityOpsSection ... />      {/* existing */}
</SectionGroup>
```

`SectionGroup` is a thin wrapper: bold header + horizontal rule + children. Lives next to `FrontOfficeView.tsx` as a local subcomponent (not its own file — too thin to justify).

`LeagueFinancesView.tsx` pie-chart-legend gets matching group headers (Revenue lines grouped, Expense lines grouped under Squad/Ops).

`TVRightsSection.tsx` (new):
```
┌─────────────────────────────────────────────┐
│ TV Rights              €3.11M / year        │
│ Endesa pool share — 1st place last season    │
│ ▸ Base (equal share)         €1.33M         │
│ ▸ Performance share          €1.78M         │
└─────────────────────────────────────────────┘
```
Pure display; no controls. Uses existing `state.tycoon.ledgerHistory` for breakdown.

### 7. Tier mapping helper (`utils/tierMapping.ts`)

```ts
export type SetupTierLabel = 'Powerhouse' | 'Established' | 'MidTier' | 'Underdog';
export type TycoonTier = 'S' | 'A' | 'B' | 'C' | 'D';

export function mapSetupTierToTycoonTier(label: SetupTierLabel): TycoonTier {
  switch (label) {
    case 'Powerhouse':  return 'S';
    case 'Established': return 'A';
    case 'MidTier':     return 'B';
    case 'Underdog':    return 'C';
  }
}

export function getTycoonTierUILabel(tier: TycoonTier): string {
  // For Review Screen / UI display
  return { S: 'Powerhouse', A: 'Established', B: 'Mid-Tier', C: 'Underdog', D: 'Lower-Tier' }[tier];
}
```

Setup-Spec writes only `team.tycoon.tier` (the existing S/A/B/C/D field). The Setup Review Screen displays labels via `getTycoonTierUILabel`.

### 8. Testing

Vitest:
- `aiBudgetDecision.test.ts` — per-tier defaults match table; Vision-override pushes correct direction; jitter is deterministic
- `tvRightsPool.test.ts` — sum of all team shares == pool (within rounding); first-place beats last-place by ~2.3×; first-season fallback returns equal share
- `aiTightening.test.ts` — 2-loss → tighten action; 2-profit → expand action (capped); 1-loss-1-profit → null
- `seasonAIPass.test.ts` — user team is skipped; non-tycoon team is skipped; history mutates correctly
- `budgetEngine.test.ts` regression — old saves without `prevStanding` fall back to legacy `tb.tvRevenue`
- `IA-Refactor` — snapshot test of `FrontOfficeView` confirms three groups + section order

Manual smoke:
1. Joventut-Badalona save: load → seasonRollover → verify ledger shows TV jumping from ~€400K to ~€1.33M (last-place share), Medical cut to ~€800K (Skeleton C-tier), Travel down to Bus 2.0★ / Hotel 2.5★. Year-end cash projection: positive within 1 season.
2. Real-Madrid save: TV bumps to ~€3M, Medical stays Premium, no tightening fires (profitable).
3. Front-Office UI: open Joventut Front Office, verify Medical is now under "Squad Investment" header, TV-Rights visible as separate card under "Revenue Streams".

## Risks

1. **`TIER_BASE.tvRevenue` becomes vestigial** — kept as fallback for leagues without pool data, but B/C/D-tier sims now see much lower TV revenue swings team-to-team. Old saves without `BudgetContext.prevStanding` still get legacy behaviour, so no regression. Risk: documentation drift if a future PR adds a new league but forgets to add a pool entry. Mitigation: log a one-time warning when `tvRightsPool` falls back to legacy.
2. **Wage-target clamp in `AIFreeAgentHandler`** — adding a soft cap could over-constrain AI signings if mis-tuned (AI never bids on stars). Mitigation: clamp is a *target*, not a *hard cap* — handler can exceed it by 10% for a clear best-fit (existing `salary-ASC` Pass-4 behaviour preserved). Test coverage: ensure no team ends up under min-roster-size due to wage-target.
3. **Tier-jitter making AI decisions non-deterministic** — could cause replay desync. Mitigation: jitter seed is `hash(team.tid, season)`, deterministic.
4. **Conflict with parallel agent's sponsor work** — they touch `specs/spain.ts`. My PR may need to read `TIER_BASE.tvRevenue` if their refactor breaks the import. Mitigation: my `tvRightsPool.ts` does *not* import from `specs/spain.ts` — pool constants live in their own const. Only `budgetEngine.ts` keeps the `tb.tvRevenue` fallback reference; if their PR renames it, the fallback simply doesn't fire (everything routes through pool). Acceptable.
5. **Owner-Vision dependency** — `chooseAIBudgets` reads `team.ownerProfile?.vision`. If Euro-Setup-Hybrid PR lands first, both work. If this PR lands first, the optional chain returns `undefined` and Vision-override does nothing. No build break either way.

## Open questions

None — all axes answered:
- AI-Spending: Konservativ-Default (Tier-based table)
- TV-Pool: Liga-Pool 60/40 (Endesa €40M, Euroleague €100M)
- Auto-Tightening: 2 consecutive losses → tighten; 2 consecutive profits → expand (capped)
- Medical-IA: full restructure into Revenue / Squad Investment / Operations groups
