# Plan: Euro Medical Budget + Bankruptcy-as-Progression

> Status: **DRAFT v2 — AC sign-off pending**
> Owner: claude + user
> Created: 2026-05-12, revised after user redirect ("warum promotion shit — bankruptcy ist der cap")
> Related: [euro-sponsorship-phase1.md](./euro-sponsorship-phase1.md), [TODO.md NEXT SESSION section](../TODO.md)

## Goal

Three coupled features that move the Euro-Tycoon system from a *static-tier-lookup* model to a *Football-Manager-style investment-freedom* model:

1. **Medical Budget Slider** — user invests annual EUR in medical/recovery staff. Investment lowers `injuryRate` (prevention) and `gamesRemaining` (recovery time). Same UX as the existing sponsorship/ticket-price sliders, plumbed into `InjurySystem.ts`.

2. **Cash-Gate / Bankruptcy = Natural Progression** — there is **no tier-promotion mechanic**. Tier-S/A/B/C/D stays as a cosmetic starting label (and initial sponsorship pool). A D-tier club can invest in S-tier stadium upgrades or €5M medical staff — they will just go bankrupt if they can't afford it. The bankruptcy risk + owner pressure IS the progression cap. Sponsor offers respond to *actual investment levels + recent success*, not to a tier label.

3. **Euro-Mode Min-Salary Floor Fix** — `getContractLimits` currently returns NBA-min (~€1.06M shown) for Euro-mode signings. Real Euroleague min: €50K (Y1) – €110K (Y5+) net. ACB sits below. Add league-aware floor + extend Commissioner-Settings modal so the user can tune league-specific values.

All three ship in one plan because they share state (Cash-on-Hand drives bankruptcy + medical budget is a new annual cash-out + Commissioner-Settings UI gets one refactor pass).

---

## Why no tier-promotion

The original v1 of this plan proposed a `prestigeScore` that recomputed tier each year-end based on investment + success. **User killed that** with the observation: *"D-level tier can invest in S-tier stadium — but they will go bankrupt. Same with medical. Why promotion shit."*

This is correct:
- Tier was always just a starting label + sponsor-pool seed.
- Once Year 1 ends, what actually matters is **cash position + objective investment levels**.
- Sponsors don't need to know "your tier" — they look at your stadium capacity, your recent results, your city prestige.
- If Río Breogán somehow runs €5M medical + €30M stadium upgrade while staying solvent (e.g. won Euroleague three years running, big TV income), they ARE an S-tier club by every measurable metric — no label flip needed.
- If they overspend without the income to back it up, they go bankrupt. That's the FM-promise: *freedom + consequences*, not *gated promotion*.

So the plan drops `prestigeScore` and tier-recompute entirely. Tier stays static. Sponsor floors get computed from objective levers.

---

## Acceptance Criteria

### Medical Budget (Slice A)
- **AC-M1** New `tycoon.medicalBudget: number` field (EUR/year, default €500K, slider range €100K – €5M+)
- **AC-M2** `medicalQuality(team)` returns 0..1 score. €100K → 0.14, €1M → 0.45, €2M → 0.63, €5M+ asymptotic → 1.0 (`sqrt(budget/5_000_000)` clamped). No hard ceiling — user can crank to €10M, just diminishing returns.
- **AC-M3** `InjurySystem.checkInjuries` reduces `injuryRate` by up to 30% (`× (1 - quality × 0.30)`)
- **AC-M4** `InjurySystem` reduces non-season-ending `gamesRemaining` by up to 15% (`× (1 - quality × 0.15)` after `enforceSeasonEndingMinimum`)
- **AC-M5** `MedicalCard` component in Front Office: slider, prose label ("Premium sport-science staff — measurably healthier roster"). No raw multipliers on screen.
- **AC-M6** Annual ledger has new `expenses.medical` line. Wired into Annual Projection card.
- **AC-M7** AI teams: flat tier-default for v1 (Tier S = €3M, A = €1.5M, B = €800K, C = €400K, D = €200K).

### Cash-Gate (Slice B)
- **AC-C1** When user attempts a signing/upgrade that would push `projected year-end cash` negative, SigningModal/FacilityUpgradeModal shows banner: *"Vertrag verursacht €Xm Defizit — Owner becomes concerned"*
- **AC-C2** User **can override**. On override: `tycoon.boardConfidence -= 10` and a log entry is added.
- **AC-C3** Two overrides in same season → `ownerFiringRisk` flag set → triggers offseason-event review (out of scope here, just the flag)
- **AC-C4** AI teams: hard block. `AIFreeAgentHandler` already has cap-check; extend to project-cash-after-signing < 0 = skip the offer.
- **AC-C5** Sponsor offers in `getMarketOffer` no longer read `TIER_BASE[tier].sponsorshipFloor` blindly. New formula: floor scales with `stadium.level × 1.10 + successScore × 1.15 + cityPrestige × 1.20`. Stays in the same magnitude as TIER_BASE for the starting tier (calibrated so Madrid year-1 offers don't change), but lets investment + success bump them up.
- **AC-C6** Bankruptcy event: if `cashOnHand < 0` at year-end → **GAME OVER** for current team. Offseason-Aufgabe `BANKRUPTCY_CHOOSE_TEAM` fires → modal lists other Euro teams (sorted by tier/cityPrestige) → user picks new club to manage. League-state preserved (other teams continue), only `userTeamId` swaps. Old team becomes AI-managed under new owner placeholder. FM-Style Save-Migration.

### Min-Salary Fix + Commissioner Settings (Slice C)
- **AC-S1** `getContractLimits` in Euro-mode (`leagueStats.uiMode === 'euro_isolated'`) reads from `EXTERNAL_SALARY_SCALE.Endesa` / `EXTERNAL_SALARY_SCALE.Euroleague`, not from `minContractStaticAmount` (1.273M).
- **AC-S2** New `leagueStats.euroMinSalaryUSD` + `euroMaxSalaryUSD` overrides (settings-tunable). Defaults from `EXTERNAL_SALARY_SCALE` at currency rate.
- **AC-S3** Commissioner Settings modal — new section "Euro Mode Salaries" with fields for league-specific min/max floors + cap-floor (€10M BRL for Euroleague, €5.85M LRL, etc.)
- **AC-S4** SigningModal MIN/MAX bounds reflect league-aware values (€110K – €4M typical for Euroleague star)
- **AC-S5** `getMinSalaryUSD` in `AIFreeAgentHandler` also reads from same league-aware helper.

### Cross-cutting
- **AC-X1** No regressions in existing budget tests (`scripts/test-tycoon-sponsor.ts`).
- **AC-X2** Front Office card order: Annual Projection → Sponsorship + Medical (grid) → Travel Logistics → Ledger History.
- **AC-X3** UI never shows raw `medicalQuality` float or raw `boardConfidence` number. Wrapped in prose/labels.

---

## Design — Slice A: Medical Budget (unchanged from v1)

### Quality curve
```
quality(budget) = clamp(sqrt(budget / 5_000_000), 0, 1)
```
| Budget   | Quality | Prose Label                                              |
|----------|---------|----------------------------------------------------------|
| €100K    | 0.14    | "Skeleton medical staff — frequent injuries"             |
| €500K    | 0.32    | "Below-average sports-medicine investment"               |
| €1M      | 0.45    | "Solid medical team"                                     |
| €2M      | 0.63    | "Strong sport-science investment"                        |
| €5M      | 1.00    | "Elite performance lab — league-best recovery times"     |
| €10M     | 1.00    | (same — diminishing returns past €5M)                    |

### Injury hooks
```ts
const medicalQ = medicalQuality(team);
injuryRate *= (1 - medicalQ * 0.30);                                  // up to 30% rate reduction

// After enforceSeasonEndingMinimum:
const recoveryReduction = 1 - medicalQ * 0.15;
result.gamesRemaining = isSeasonEnding
  ? result.gamesRemaining
  : Math.max(1, Math.round(result.gamesRemaining * recoveryReduction));
```

### Files
- `src/types/tycoon.ts` — `medicalBudget?: number`
- `src/services/tycoon/medicalEngine.ts` — **new** (`medicalQuality`, `defaultMedicalBudgetForTier`)
- `src/services/tycoon/budgetEngine.ts` — `expenses.medical` line
- `src/services/simulation/InjurySystem.ts` — accept `medicalQuality` arg, apply hooks
- `src/services/simulation/GameSimulator/engine.ts` + `RealisticEngine.ts` — pass per-team quality
- `src/components/tycoon/MedicalCard.tsx` — **new**
- `src/components/central/view/FrontOfficeView.tsx` — render
- `src/components/central/view/TeamFinancesViewDetailed.tsx` — render readOnly

---

## Design — Slice B: Cash-Gate

### Projected cash check
```ts
function projectYearEndCash(team: NBATeam, plannedSpend: number): number {
  const tycoon = team.tycoon!;
  const annualBudget = computeAnnualBudget(team, ctx);
  return tycoon.cashOnHand + annualBudget.profit - plannedSpend;
}
```

### SigningModal banner
When `projectYearEndCash < 0`:
```
🟡 Owner concerned — this contract pushes you €X.XM into the red
   Signing it anyway will damage board confidence and increase firing risk.
   [Sign anyway]   [Cancel]
```

### Sponsor floor formula (replaces TIER_BASE[tier].sponsorshipFloor lookup)
```ts
function sponsorFloor(team: NBATeam, slot: SponsorshipSlot): number {
  const tycoon = team.tycoon!;
  const baseFloor = TIER_BASE[tycoon.tier].sponsorshipFloor[slot];  // starting tier still seeds the floor
  const stadiumBonus  = 0.10 * (tycoon.facilities.stadium.level - 1);   // +10% per level
  const successScore  = computeSuccessScore(team.recentEndesa, team.recentEuro); // existing
  const successBonus  = 0.15 * successScore;
  const cityBonus     = 0.20 * tycoon.cityPrestige!;
  return baseFloor * (1 + stadiumBonus + successBonus + cityBonus);
}
```

Starting Madrid (S-tier, stadium L1, no success yet, cityPrestige 1.0): `baseFloor × (1 + 0 + 0 + 0.20)` = +20% from city alone. Old formula gave baseFloor flat. Need to **rebalance baseFloor down by 20%** so Madrid Year 1 offers don't suddenly inflate. Easy adjustment — divide TIER_BASE values by 1.20 once during migration, or hardcode the new scaled values.

Rio Breogán (D-tier, stadium L1, no success, cityPrestige 0.35): baseFloor × (1 + 0 + 0 + 0.07) = +7%. Slight bump. After 3 years of EL Final Four + stadium L4: `1 + 0.30 + 0.225 + 0.07` = +60%. Now their D-tier sponsor pool offers more — without ever changing the "tier" label.

### Files
- `src/services/tycoon/budgetEngine.ts` — `projectYearEndCash` helper
- `src/services/tycoon/sponsorshipEngine.ts` — replace `TIER_BASE[t.tier].sponsorshipFloor[slot]` with `sponsorFloor(team, slot)`
- `src/components/modals/SigningModal/SigningModal.tsx` — cash-gate banner
- `src/services/AIFreeAgentHandler.ts` — projected-cash check for AI signings
- `src/store/logic/seasonRollover.ts` — bankruptcy event trigger

---

## Design — Slice C: Min-Salary + Commissioner Settings

### Current bug
`src/utils/salaryUtils.ts:944` reads `minContractType` + `minContractStaticAmount` (1.273M) regardless of `uiMode`. Euro-mode signings get NBA min × EUR rate ≈ €1.17M floor. Real Euroleague: €50K – €110K (net) per [EFA agreement].

### Fix
```ts
// In getContractLimits:
const isEuroMode = (leagueStats as any).uiMode === 'euro_isolated';
const euroScale = isEuroMode
  ? EXTERNAL_SALARY_SCALE[detectEuroLeague(player, leagueStats)] ?? EXTERNAL_SALARY_SCALE.Endesa
  : null;

let minSalaryUSD: number;
if (euroScale) {
  // Override: use league-scale min (~$290K Endesa, ~$460K Euroleague at $154M cap)
  // → display ~€266K / ~€423K — much closer to real-world €50K-€500K range
  const overrideMin = (leagueStats as any).euroMinSalaryUSD;
  minSalaryUSD = overrideMin ?? salaryCapUSD * euroScale.minPct;
} else if (minType === 'none') {
  minSalaryUSD = 0;
} else if (minType === 'static') {
  minSalaryUSD = staticMinM * 1_000_000;
} else {
  // existing dynamic path
}
```

### Commissioner Settings — Euro Mode section
New section between "Economy - Contracts" and "Economy - Cap Inflation":
```
─ Euro Mode Salaries ─────────────────────────
[ ] Use league-specific min/max (recommended for euro_isolated)
    Min salary (Endesa):       €290,000   [slider €50K - €500K]
    Min salary (Euroleague):   €460,000   [slider €100K - €1M]
    Max salary (Endesa):       €3.0M      [slider €1M - €5M]
    Max salary (Euroleague):   €5.0M      [slider €2M - €10M]
    Cap floor (Euroleague BRL): €10M     [slider €5M - €20M]
─────────────────────────────────────────────
```

### Files
- `src/utils/salaryUtils.ts` — `getContractLimits` Euro-mode branch
- `src/services/AIFreeAgentHandler.ts:1175` — `getMinSalaryUSD` Euro-mode branch
- `src/types.ts` — `LeagueStats` Euro-salary override fields
- `src/components/modals/CommissionerSettings/*.tsx` — new section (find existing settings modal)
- `src/constants.ts` — `EURO_ISOLATED_DEFAULTS` adds `euroMinSalaryUSD`, `euroMaxSalaryUSD`, etc.

---

## Implementation Order

```
Phase 1 — Bug fix (small, high value)
1.  AC-S1 + AC-S5             Euro-mode min-salary in getContractLimits + AIFreeAgentHandler
2.  AC-S2 + AC-S3 + AC-S4     Commissioner Settings UI + override fields

Phase 2 — Medical
3.  AC-M1, AC-M2, AC-M6       medicalEngine.ts + ledger line + types
4.  AC-M3, AC-M4              InjurySystem.ts hooks
5.  AC-M5, AC-M7              MedicalCard UI + AI defaults

Phase 3 — Cash-Gate
6.  AC-C5 (rebalance)         Sponsor floor formula change (do first so Madrid stays balanced)
7.  AC-C1, AC-C2, AC-C3       SigningModal banner + boardConfidence hits
8.  AC-C4                     AIFreeAgentHandler cash check
9.  AC-C6                     Bankruptcy event in seasonRollover

Phase 4 — Verification
10. AC-X1, AC-X3              Test pass + UI-internals audit
```

Phase 1 alone closes the immediate user-visible bug. Phases 2-3 add the new mechanics. Each phase is independently shippable.

---

## Open Questions (resolve before coding)

1. **Sponsor-floor rebalance**: divide existing `TIER_BASE.sponsorshipFloor` values by 1.20 (offset for +20% city baseline of S-tier Madrid), or hardcode new scaled values? **Recommendation**: hardcode — only Spain spec exists currently, simple find-replace.

2. **boardConfidence numeric on UI**: currently exists in type but unused. Show as labeled bar ("Owner Mood: 🟢 Satisfied / 🟡 Concerned / 🔴 Furious"), not 0-100 number. Locked.

3. **Euroleague vs Endesa min for the same player**: a player can be in both competitions. Use Endesa min (lower) as the salary floor — Euroleague min is the team-budget floor, not the per-player floor. Locked.

4. **Bankruptcy consequence**: just -25% sponsor renewals for v1? Could also be: forced player sale, GM firing, relegation flag. Defer to Phase 5 plan. Locked for v1.

---

## Akzeptanz-Sign-off

Pending. User-Review der ACs erforderlich bevor Slice-A-Code startet.

Locked design changes from v1:
- ❌ DROPPED: prestigeScore, tier-promotion, tier-demotion, hysteresis, tier-change news events
- ✅ KEPT: Medical Budget Slider, all M-series ACs
- ➕ NEW: Cash-Gate / Bankruptcy mechanic (replaces promotion as natural cap)
- ➕ NEW: Sponsor floor responds to objective levers (stadium-level, success, city) — not tier-label upgrades
- ➕ NEW: Euro Min-Salary bug fix + Commissioner Settings extension
