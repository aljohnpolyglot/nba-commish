# Euro-Isolated Tycoon Layer (T1+T2+T8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ersetze den kosmetischen Fake-Ledger in `TeamFinancesViewDetailed.tsx` (Euro-Branch) durch eine echte Budget-Engine, drei verhandelbare Sponsoring-Slots und year-over-year persistierte Annual Ledger. Tycoon ist Default-Verhalten von `uiMode === 'euro_isolated'` (kein Toggle).

**Architecture:** Greenfield-Engines unter `src/services/tycoon/` (`budgetEngine`, `sponsorshipEngine`, `ledgerEngine`, `facilityEngine` (stub), `eventChecker`), kleine Hook-Coats in bestehenden Files (`seasonRollover.ts`, `LOAD_GAME`, `offseasonState.ts`, `simulationHandler.ts`, `TeamFinancesViewDetailed.tsx`, `FinancesWidget.tsx`). Neue UI-Cards in `src/components/tycoon/`. State-Erweiterung: optionales `team.tycoon` (`TycoonState`), gefüllt per `LOAD_GAME`-Migration für alle Euro-Saves. Spec-Datei: [`docs/superpowers/specs/2026-05-11-euro-tycoon-mvp-design.md`](../specs/2026-05-11-euro-tycoon-mvp-design.md).

**Tech Stack:** TypeScript, React 19, Vite, idb-keyval (Persistenz via gzipped IndexedDB-Save), keine Test-Library — Verification via `tsx` Smoke-Scripts unter `scripts/` und Browser-Walkthrough.

---

## File Structure

**Greenfield (alles neu):**
| Path | Responsibility |
|------|----------------|
| `src/types/tycoon.ts` | `SponsorshipSlot`, `Sponsorship`, `FacilityState`, `AnnualLedger`, `TycoonState` types |
| `src/services/tycoon/specs/spain.ts` | Klub-Tier-Mapping (S/A/B/C/D), Tier-Base-Werte, Initial-Sponsor-Pool |
| `src/services/tycoon/budgetEngine.ts` | `computeAnnualBudget(team, leagueStats, results) → AnnualLedger` |
| `src/services/tycoon/sponsorshipEngine.ts` | `getMarketOffer`, `applyRenewal`, `applyDecline`, `dekrementSponsorshipYears` |
| `src/services/tycoon/ledgerEngine.ts` | `snapshot(team, ledger)` (push + cash update + FFP recompute) |
| `src/services/tycoon/facilityEngine.ts` | MVP-Stub: `computeFacilityOps`, `getMatchdayCapacity` |
| `src/services/tycoon/eventChecker.ts` | Daily-Tick: In-Season-Sponsor-Events (Endesa-Titel, EL-FF, etc.) |
| `src/services/tycoon/migrate.ts` | `migrateTeamTycoon(team, spec)` für `LOAD_GAME`-Migration |
| `src/components/tycoon/AnnualLedgerCard.tsx` | Revenue/Expenses-Breakdown im TeamFinances Euro-Branch |
| `src/components/tycoon/SponsorshipCard.tsx` | 3 Slots mit Negotiate-Button |
| `src/components/tycoon/LedgerHistoryCard.tsx` | Tabelle letzte 5 Saisons + FFP-Banner + Cash-on-Hand |
| `src/components/tycoon/SponsorshipNegotiationModal.tsx` | Modal mit Accept/Decline pro Slot |
| `scripts/test-tycoon-budget.ts` | Smoke: Real Madrid + Burgos durchrechnen |
| `scripts/test-tycoon-sponsor.ts` | Smoke: Marktwert + Renewal-Decision |

**Hook-Coats (Patches in existierenden Files, ~5–25 LOC pro File):**
| Path | Was wird angepasst |
|------|--------------------|
| `src/types/nba.ts` (oder Team-Typedef-File) | `tycoon?: TycoonState` optional auf `NBATeam` |
| `src/components/central/view/TeamFinancesViewDetailed.tsx` Z. 83–125 | Fake-Ledger raus, drei neue Cards rein |
| `src/services/seasonRollover.ts` | Year-End-Hook: `if (isEuroIsolatedMode) { compute → snapshot → dekrementSponsorshipYears }` |
| `src/store/...` (LOAD_GAME reducer) | Migration aufrufen wenn `uiMode === 'euro_isolated'` |
| `src/services/offseason/offseasonState.ts` | `sponsorRenewals` Row als visible markieren wenn `tycoon`-Slot abgelaufen |
| `src/components/offseason/OffseasonAufgaben.tsx` Z. 566 ff. | `case 'sponsorRenewals'` in `getStepConfirmSpec` (öffnet Modal statt View-Wechsel) |
| `src/services/simulation/simulationHandler.ts` | Daily-Tick: `eventChecker.tick(state)` |
| `src/components/sidebar/FinancesWidget.tsx` | `formatCurrencyWithCode(value, currency)` statt `formatCurrency(value)` |

---

## Phase A — Foundation

### Task 1: Types + Spain spec + Tier-Mapping

**Files:**
- Create: `src/types/tycoon.ts`
- Create: `src/services/tycoon/specs/spain.ts`
- Modify: `src/types/nba.ts` (oder das Team-Typedef-File mit `interface NBATeam`)

- [ ] **Step 1: Erstelle `src/types/tycoon.ts` mit den Type-Definitionen**

```ts
// src/types/tycoon.ts

export type SponsorshipSlot = 'kit' | 'sleeve' | 'stadium';
export type TycoonTier = 'S' | 'A' | 'B' | 'C' | 'D';

export interface Sponsorship {
  sponsor: string;
  valuePerYear: number; // EUR
  yearsRemaining: number;
  signedYear: number;
}

export interface FacilityState {
  level: number; // 1–5
  upgradePending?: {
    targetLevel: number;
    finishYear: number;
    cost: number;
  };
}

export interface StadiumFacilityState extends FacilityState {
  capacity: number;
}

export interface AnnualLedger {
  year: number;
  revenue: {
    matchday: number;
    sponsorship: number;
    prize: number;
    tv: number;
    transfer: number; // MVP = 0
  };
  expenses: {
    wages: number;
    staff: number;
    facility: number;
    scouting: number;
    travel: number;
    financeCosts: number; // MVP = 0
  };
  profit: number;
  cashOnHandEnd: number;
  ffpDeficitContribution: number; // min(profit, 0)
}

export interface TycoonState {
  tier: TycoonTier;
  sponsorships: {
    kit: Sponsorship | null;
    sleeve: Sponsorship | null;
    stadium: Sponsorship | null;
  };
  facilities: {
    stadium: StadiumFacilityState;
    trainingCenter: FacilityState;
    academy: FacilityState;
  };
  ledgerHistory: AnnualLedger[]; // letzte 10, FIFO
  cashOnHand: number; // EUR
  boardConfidence: number; // 0–100, MVP = 60 static
  ffpRollingDeficit: number;
  /** Transient flag von eventChecker, dämpft nächste Sponsorship-Renewal-Berechnung */
  nextRenewalPenaltyFactor?: number;
}

export interface TierBase {
  stadiumCapacity: number;
  ticketPrice: number;
  tvRevenue: number; // EUR/year
  sponsorshipFloor: Record<SponsorshipSlot, number>; // EUR/year per slot
  facilityOpsPerLevel: number;
  travelBase: number;
  scoutingBudget: number;
  startingCash: number;
}
```

- [ ] **Step 2: Erstelle `src/services/tycoon/specs/spain.ts` mit Tier-Mapping**

```ts
// src/services/tycoon/specs/spain.ts
import type { TierBase, TycoonTier, SponsorshipSlot } from '../../../types/tycoon';

export const TIER_BASE: Record<TycoonTier, TierBase> = {
  S: { stadiumCapacity: 15000, ticketPrice: 45, tvRevenue: 8_000_000,
       sponsorshipFloor: { kit: 3_000_000, sleeve: 3_000_000, stadium: 3_000_000 },
       facilityOpsPerLevel: 400_000, travelBase: 800_000, scoutingBudget: 600_000, startingCash: 40_000_000 },
  A: { stadiumCapacity: 10000, ticketPrice: 30, tvRevenue: 3_000_000,
       sponsorshipFloor: { kit: 1_000_000, sleeve: 1_000_000, stadium: 1_000_000 },
       facilityOpsPerLevel: 200_000, travelBase: 500_000, scoutingBudget: 300_000, startingCash: 15_000_000 },
  B: { stadiumCapacity: 7500, ticketPrice: 22, tvRevenue: 1_500_000,
       sponsorshipFloor: { kit: 400_000, sleeve: 400_000, stadium: 400_000 },
       facilityOpsPerLevel: 120_000, travelBase: 350_000, scoutingBudget: 150_000, startingCash: 5_000_000 },
  C: { stadiumCapacity: 5500, ticketPrice: 18, tvRevenue: 800_000,
       sponsorshipFloor: { kit: 200_000, sleeve: 200_000, stadium: 200_000 },
       facilityOpsPerLevel: 80_000, travelBase: 250_000, scoutingBudget: 80_000, startingCash: 2_000_000 },
  D: { stadiumCapacity: 4500, ticketPrice: 15, tvRevenue: 400_000,
       sponsorshipFloor: { kit: 100_000, sleeve: 100_000, stadium: 100_000 },
       facilityOpsPerLevel: 50_000, travelBase: 180_000, scoutingBudget: 40_000, startingCash: 500_000 },
};

export const SPAIN_CLUB_TIERS: Record<string, TycoonTier> = {
  // exact Endesa-Klub-Namen oder Abbrevs (User soll bei Bedarf nachjustieren)
  'Real Madrid': 'S',
  'FC Barcelona': 'S',
  'Valencia Basket': 'A',
  'Baskonia': 'A',
  'Joventut': 'A',
  'Unicaja': 'A',
  'Gran Canaria': 'B',
  'Tenerife': 'B',
  'Bilbao Basket': 'B',
  'UCAM Murcia': 'B',
  'Zaragoza': 'B',
  'San Pablo Burgos': 'B',
  'Manresa': 'C',
  'MoraBanc Andorra': 'C',
  'Río Breogán': 'C',
  'Covirán Granada': 'C',
  // alles andere → D Fallback
};

export const SPAIN_INITIAL_SPONSORS: Record<TycoonTier, Record<SponsorshipSlot, string[]>> = {
  S: { kit: ['Emirates', 'Adidas', 'Herbalife'],
       sleeve: ['Plus500', 'Mahou', 'Iberdrola'],
       stadium: ['WiZink Center', 'Spotify Camp Nou Arena', 'Movistar Arena'] },
  A: { kit: ['Bankia', 'Caixa', 'Mapfre'],
       sleeve: ['Acciona', 'Naturgy', 'Iberia'],
       stadium: ['Pabellón Fuente San Luis', 'Buesa Arena', 'Pabellón Olímpico'] },
  B: { kit: ['Local Bank', 'Cabify Regional', 'Damm'],
       sleeve: ['Provincial Insurance', 'Reale', 'Liberbank'],
       stadium: ['Pabellón Municipal', 'Coliseum', 'Pabellón Insular'] },
  C: { kit: ['Regional Coop', 'Caja Rural'],
       sleeve: ['Local Energy', 'Provincial Tour'],
       stadium: ['Pavelló Municipal', 'Pabellón Río', 'Polideportivo'] },
  D: { kit: ['City Sports', 'Town Supplies'],
       sleeve: ['Local Services'],
       stadium: ['Municipal Sports Hall'] },
};

export function getTierForClub(clubName: string): TycoonTier {
  return SPAIN_CLUB_TIERS[clubName] ?? 'D';
}
```

- [ ] **Step 3: Erweitere `NBATeam`-Typ um optionales `tycoon`-Feld**

Finde das Team-Type. Standard-Ort: `src/types.ts` oder `src/types/nba.ts`. Suche `interface NBATeam`:

Run: `grep -rn "interface NBATeam" src/types/ src/types.ts 2>/dev/null | head -3`

Ergänze um die letzte Zeile vor dem schließenden `}`:

```ts
import type { TycoonState } from './tycoon';

export interface NBATeam {
  // ... existing fields ...
  /** Tycoon-Layer state, only populated in euro_isolated mode after LOAD_GAME migration */
  tycoon?: TycoonState;
}
```

Wenn `tycoon.ts` zirkulär importiert würde, kannst du den Typ-Import als `import type` und am Ende der Datei machen — TypeScript trennt type-imports zur Compile-Zeit.

- [ ] **Step 4: Typing check**

Run: `npx tsc --noEmit`
Expected: Keine NEUEN Errors in `src/types/tycoon.ts`, `src/services/tycoon/specs/spain.ts` oder der Team-Type-Datei. Vorhandene Errors aus `DraftSimulatorView.tsx`/`fictionalLeagueGenerator.ts`/`GameContext.tsx`/`initialization.ts` sind bekannt und nicht von uns verursacht (siehe CODEX-Status in `plans/euro-isolated-spain-mvp.md`).

- [ ] **Step 5: Commit**

```bash
git add src/types/tycoon.ts src/services/tycoon/specs/spain.ts src/types.ts
git commit -m "feat(tycoon): types + Spain tier-mapping foundation"
```

---

## Phase B — Engines

### Task 2: budgetEngine — Revenue + Expenses + Profit

**Files:**
- Create: `src/services/tycoon/budgetEngine.ts`
- Create: `scripts/test-tycoon-budget.ts`

- [ ] **Step 1: Schreibe Smoke-Test zuerst (TDD-Idee — Smoke statt Unit)**

```ts
// scripts/test-tycoon-budget.ts
import { computeAnnualBudget } from '../src/services/tycoon/budgetEngine';
import { TIER_BASE } from '../src/services/tycoon/specs/spain';
import type { NBATeam } from '../src/types';
import type { TycoonState } from '../src/types/tycoon';

function makeTeam(name: string, tier: 'S' | 'A' | 'B' | 'C' | 'D', payrollEUR: number, players: number): NBATeam {
  const tierBase = TIER_BASE[tier];
  const t: any = {
    tid: 1,
    name,
    region: name.split(' ')[0],
    players: Array.from({ length: players }, (_, i) => ({
      tid: 1,
      // contract.amount in BBGM-thousands (USD-equivalent); 1000 = $1M
      contract: { amount: (payrollEUR / players) / 1000, exp: 2027 }
    })),
    tycoon: {
      tier,
      sponsorships: {
        kit:     { sponsor: 'A', valuePerYear: tierBase.sponsorshipFloor.kit * 5, yearsRemaining: 3, signedYear: 2025 },
        sleeve:  { sponsor: 'B', valuePerYear: tierBase.sponsorshipFloor.sleeve * 1.7, yearsRemaining: 2, signedYear: 2025 },
        stadium: { sponsor: 'C', valuePerYear: tierBase.sponsorshipFloor.stadium * 1.3, yearsRemaining: 6, signedYear: 2025 },
      },
      facilities: { stadium: { level: 1, capacity: tierBase.stadiumCapacity }, trainingCenter: { level: 1 }, academy: { level: 1 } },
      ledgerHistory: [],
      cashOnHand: tierBase.startingCash,
      boardConfidence: 60,
      ffpRollingDeficit: 0,
    } as TycoonState,
  };
  return t as NBATeam;
}

const real = makeTeam('Real Madrid', 'S', 35_000_000, 12);
const burgos = makeTeam('San Pablo Burgos', 'B', 3_800_000, 12);

const realLedger = computeAnnualBudget(real, {
  year: 2026,
  endesaFinishPosition: 1,
  euroleagueStage: 'final-four',
  euroleagueAwayGames: 17,
  endesaPrizeEUR: 1_500_000,
  euroleaguePrizeEUR: 1_500_000,
});
const burgosLedger = computeAnnualBudget(burgos, {
  year: 2026,
  endesaFinishPosition: 16,
  euroleagueStage: 'none',
  euroleagueAwayGames: 0,
  endesaPrizeEUR: 100_000,
  euroleaguePrizeEUR: 0,
});

console.log('Real Madrid 2026:', realLedger);
console.log('Burgos 2026:', burgosLedger);

// Assertions
const assert = (cond: boolean, msg: string) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };

assert(realLedger.revenue.matchday > 15_000_000 && realLedger.revenue.matchday < 35_000_000,
  `Real matchday revenue plausible (got ${realLedger.revenue.matchday})`);
assert(realLedger.revenue.sponsorship > 18_000_000, 'Real sponsorship > €18M');
assert(realLedger.expenses.wages === 35_000_000, `Real wages = €35M (got ${realLedger.expenses.wages})`);
assert(realLedger.profit > 5_000_000, `Real profit positive (got ${realLedger.profit})`);

assert(burgosLedger.revenue.matchday < 5_000_000, 'Burgos matchday < €5M');
assert(burgosLedger.profit < 1_000_000, `Burgos profit tight (got ${burgosLedger.profit})`);

assert(realLedger.profit > burgosLedger.profit + 5_000_000, 'Spread Real ≫ Burgos profit');

console.log('\n✓ All budget assertions passed');
```

- [ ] **Step 2: Run smoke test — soll fehlen, weil budgetEngine noch nicht existiert**

Run: `npx tsx scripts/test-tycoon-budget.ts`
Expected: FAIL, "Cannot find module '../src/services/tycoon/budgetEngine'"

- [ ] **Step 3: Implementiere `budgetEngine.ts`**

```ts
// src/services/tycoon/budgetEngine.ts
import type { NBATeam } from '../../types';
import type { AnnualLedger, TycoonState } from '../../types/tycoon';
import { TIER_BASE } from './specs/spain';

export interface BudgetContext {
  year: number;
  endesaFinishPosition: number; // 1..18; 0 = saison läuft noch (live preview)
  euroleagueStage: 'final-four' | 'qf' | 'group' | 'none';
  euroleagueAwayGames: number;
  endesaPrizeEUR: number;
  euroleaguePrizeEUR: number;
}

function successMultiplier(ctx: BudgetContext): number {
  let m = 1.0;
  if (ctx.endesaFinishPosition >= 1 && ctx.endesaFinishPosition <= 4) m = 1.25;
  else if (ctx.endesaFinishPosition <= 8) m = 1.10;
  else if (ctx.endesaFinishPosition <= 14) m = 1.00;
  else if (ctx.endesaFinishPosition <= 18) m = 0.85;
  if (ctx.euroleagueStage === 'final-four') m += 0.20;
  else if (ctx.euroleagueStage === 'qf') m += 0.10;
  else if (ctx.euroleagueStage === 'group') m += 0.05;
  return m;
}

function averageAttendancePct(tier: TycoonState['tier'], success: number): number {
  // Tier-Floor mit Erfolg moduliert
  const floor: Record<TycoonState['tier'], number> = { S: 0.85, A: 0.75, B: 0.65, C: 0.55, D: 0.45 };
  return Math.min(0.99, floor[tier] * success);
}

function wagesEUR(team: NBATeam): number {
  // contract.amount in BBGM-thousands; multiplier × 1000 = USD-cents ish; ×1000 für USD; behandle als EUR 1:1 in Euro-Mode
  return (team.players ?? [])
    .filter((p: any) => p.tid === team.tid)
    .reduce((sum: number, p: any) => sum + ((p.contract?.amount ?? 0) * 1000), 0);
}

export function computeAnnualBudget(team: NBATeam, ctx: BudgetContext): AnnualLedger {
  const t = team.tycoon;
  if (!t) throw new Error(`Team ${team.name} has no tycoon state`);
  const tb = TIER_BASE[t.tier];
  const success = successMultiplier(ctx);

  // Revenue
  const attendancePct = averageAttendancePct(t.tier, success);
  const matchday = Math.round(t.facilities.stadium.capacity * attendancePct * tb.ticketPrice * 30);

  const slotRev = (slot: 'kit' | 'sleeve' | 'stadium'): number => {
    const s = t.sponsorships[slot];
    if (s) return s.valuePerYear;
    return Math.round(tb.sponsorshipFloor[slot] * 0.5); // Default-Fallback
  };
  const sponsorship = slotRev('kit') + slotRev('sleeve') + slotRev('stadium');

  const prize = (ctx.endesaPrizeEUR ?? 0) + (ctx.euroleaguePrizeEUR ?? 0);
  const tv = tb.tvRevenue;
  const transfer = 0;

  // Expenses
  const wages = wagesEUR(team);
  const staff = Math.round(wages * 0.10);
  const facilityLevelSum = t.facilities.stadium.level + t.facilities.trainingCenter.level + t.facilities.academy.level;
  const facility = facilityLevelSum * tb.facilityOpsPerLevel;
  const scouting = tb.scoutingBudget;
  const travel = tb.travelBase + (ctx.euroleagueAwayGames * 40_000);
  const financeCosts = t.cashOnHand < 0 ? Math.round(Math.abs(t.cashOnHand) * 0.05) : 0;

  const profit = matchday + sponsorship + prize + tv + transfer
               - wages - staff - facility - scouting - travel - financeCosts;

  return {
    year: ctx.year,
    revenue: { matchday, sponsorship, prize, tv, transfer },
    expenses: { wages, staff, facility, scouting, travel, financeCosts },
    profit,
    cashOnHandEnd: t.cashOnHand + profit,
    ffpDeficitContribution: Math.min(profit, 0),
  };
}
```

- [ ] **Step 4: Run smoke test — soll passen**

Run: `npx tsx scripts/test-tycoon-budget.ts`
Expected: PASS mit `✓ All budget assertions passed`. Real Madrid: matchday ~€21M, sponsorship >€18M, profit ~+€8–18M. Burgos: profit knapp/leicht negativ.

- [ ] **Step 5: Commit**

```bash
git add src/services/tycoon/budgetEngine.ts scripts/test-tycoon-budget.ts
git commit -m "feat(tycoon): budgetEngine with Real Madrid + Burgos smoke test"
```

---

### Task 3: sponsorshipEngine — Marktwert + Renewal/Decline

**Files:**
- Create: `src/services/tycoon/sponsorshipEngine.ts`
- Create: `scripts/test-tycoon-sponsor.ts`

- [ ] **Step 1: Smoke-Test schreiben**

```ts
// scripts/test-tycoon-sponsor.ts
import { getMarketOffer, applyRenewal, applyDecline, dekrementSponsorshipYears } from '../src/services/tycoon/sponsorshipEngine';
import { TIER_BASE } from '../src/services/tycoon/specs/spain';
import type { TycoonState } from '../src/types/tycoon';

function makeTycoon(tier: 'S' | 'A' | 'B' | 'C' | 'D'): TycoonState {
  return {
    tier,
    sponsorships: {
      kit:     { sponsor: 'X', valuePerYear: 5_000_000, yearsRemaining: 0, signedYear: 2022 },
      sleeve:  { sponsor: 'Y', valuePerYear: 1_500_000, yearsRemaining: 2, signedYear: 2024 },
      stadium: { sponsor: 'Z', valuePerYear: 2_000_000, yearsRemaining: 5, signedYear: 2024 },
    },
    facilities: { stadium: { level: 1, capacity: 15000 }, trainingCenter: { level: 1 }, academy: { level: 1 } },
    ledgerHistory: [],
    cashOnHand: 10_000_000,
    boardConfidence: 60,
    ffpRollingDeficit: 0,
  };
}

const assert = (c: boolean, m: string) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };

const sTycoon = makeTycoon('S');
const offerS = getMarketOffer(sTycoon, 'kit', { recentEndesaPositions: [1, 1, 2], recentEuroleagueStages: ['final-four', 'qf', 'final-four'] });
console.log('S-Tier Kit Offer:', offerS);
assert(offerS.valuePerYear > 3_000_000, `S-Tier with success bonus > tier-base floor`);
assert(offerS.years >= 3 && offerS.years <= 4, 'Years 3–4');

const dTycoon = makeTycoon('D');
const offerD = getMarketOffer(dTycoon, 'kit', { recentEndesaPositions: [16, 18, 17], recentEuroleagueStages: ['none', 'none', 'none'] });
console.log('D-Tier Kit Offer:', offerD);
assert(offerD.valuePerYear < 200_000, 'D-Tier with no success is small');

// Accept
const before = sTycoon.sponsorships.kit?.valuePerYear ?? 0;
applyRenewal(sTycoon, 'kit', offerS, 2026);
assert(sTycoon.sponsorships.kit?.valuePerYear === offerS.valuePerYear, 'kit replaced with new offer');
assert(sTycoon.sponsorships.kit?.yearsRemaining === offerS.years, 'kit years set');
assert(sTycoon.sponsorships.kit?.signedYear === 2026, 'signedYear set');

// Decline
applyDecline(sTycoon, 'sleeve');
assert(sTycoon.sponsorships.sleeve === null, 'sleeve cleared on decline');

// Decrement
const sTycoon2 = makeTycoon('S');
sTycoon2.sponsorships.kit!.yearsRemaining = 1;
dekrementSponsorshipYears(sTycoon2);
assert(sTycoon2.sponsorships.kit === null, 'kit-with-1y becomes null after decrement+expire');
assert(sTycoon2.sponsorships.stadium?.yearsRemaining === 4, 'stadium 5→4');

console.log('\n✓ All sponsor assertions passed');
```

- [ ] **Step 2: Run, soll fehlen**

Run: `npx tsx scripts/test-tycoon-sponsor.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implementiere `sponsorshipEngine.ts`**

```ts
// src/services/tycoon/sponsorshipEngine.ts
import type { Sponsorship, SponsorshipSlot, TycoonState, TycoonTier } from '../../types/tycoon';
import { TIER_BASE, SPAIN_INITIAL_SPONSORS } from './specs/spain';

export interface SuccessHistory {
  recentEndesaPositions: number[]; // letzte 3 Saisons, 1–18 each
  recentEuroleagueStages: Array<'final-four' | 'qf' | 'group' | 'none'>;
}

export interface SponsorshipOffer {
  slot: SponsorshipSlot;
  sponsor: string;
  valuePerYear: number;
  years: number; // 3–4
}

const PRESTIGE: Record<TycoonTier, number> = { S: 0.5, A: 0.3, B: 0.1, C: 0.0, D: -0.1 };

function recentSuccessBonus(h: SuccessHistory): number {
  let b = 0;
  for (const pos of h.recentEndesaPositions ?? []) {
    if (pos >= 1 && pos <= 4) b += 0.05;
  }
  for (const st of h.recentEuroleagueStages ?? []) {
    if (st === 'final-four') b += 0.10;
    else if (st === 'qf') b += 0.05;
  }
  return Math.min(0.45, b);
}

function pickSponsorName(tier: TycoonTier, slot: SponsorshipSlot, existing?: string | null): string {
  const pool = SPAIN_INITIAL_SPONSORS[tier][slot] ?? ['Default Sponsor'];
  const filtered = existing ? pool.filter(n => n !== existing) : pool;
  return filtered.length ? filtered[Math.floor(Math.random() * filtered.length)] : pool[0];
}

export function getMarketOffer(
  state: TycoonState,
  slot: SponsorshipSlot,
  history: SuccessHistory,
): SponsorshipOffer {
  const tb = TIER_BASE[state.tier];
  const existing = state.sponsorships[slot];
  const successBonus = recentSuccessBonus(history);
  const loyaltyBonus = existing ? 0.10 : 0;
  const penalty = state.nextRenewalPenaltyFactor ?? 1.0;
  const noise = 0.95 + Math.random() * 0.10; // 0.95..1.05

  const value = Math.round(
    tb.sponsorshipFloor[slot] *
    (1 + successBonus) *
    (1 + PRESTIGE[state.tier]) *
    (1 + loyaltyBonus) *
    penalty *
    noise
  );

  return {
    slot,
    sponsor: existing?.sponsor ?? pickSponsorName(state.tier, slot, existing?.sponsor),
    valuePerYear: value,
    years: 3 + Math.floor(Math.random() * 2), // 3 or 4
  };
}

export function applyRenewal(state: TycoonState, slot: SponsorshipSlot, offer: SponsorshipOffer, currentYear: number): void {
  state.sponsorships[slot] = {
    sponsor: offer.sponsor,
    valuePerYear: offer.valuePerYear,
    yearsRemaining: offer.years,
    signedYear: currentYear,
  };
  // Verbrauche den Penalty-Faktor (nur einmal anwendbar)
  delete state.nextRenewalPenaltyFactor;
}

export function applyDecline(state: TycoonState, slot: SponsorshipSlot): void {
  state.sponsorships[slot] = null;
}

/** Year-End: dekrementiert alle yearsRemaining, expired Verträge → null */
export function dekrementSponsorshipYears(state: TycoonState): void {
  (['kit', 'sleeve', 'stadium'] as SponsorshipSlot[]).forEach(slot => {
    const s = state.sponsorships[slot];
    if (!s) return;
    s.yearsRemaining -= 1;
    if (s.yearsRemaining <= 0) {
      state.sponsorships[slot] = null;
    }
  });
}

/** Initial-Seed beim LOAD_GAME für neue Euro-Saves */
export function seedInitialSponsorships(tier: TycoonTier, currentYear: number): TycoonState['sponsorships'] {
  const tb = TIER_BASE[tier];
  const make = (slot: SponsorshipSlot): Sponsorship => ({
    sponsor: pickSponsorName(tier, slot, null),
    valuePerYear: Math.round(tb.sponsorshipFloor[slot] * (0.9 + Math.random() * 0.3)),
    yearsRemaining: 1 + Math.floor(Math.random() * 4), // 1..4
    signedYear: currentYear - 1,
  });
  return { kit: make('kit'), sleeve: make('sleeve'), stadium: make('stadium') };
}

export function hasExpiredSlot(state: TycoonState): boolean {
  return (['kit', 'sleeve', 'stadium'] as SponsorshipSlot[]).some(s => state.sponsorships[s] === null);
}
```

- [ ] **Step 4: Run smoke, soll passen**

Run: `npx tsx scripts/test-tycoon-sponsor.ts`
Expected: PASS mit `✓ All sponsor assertions passed`

- [ ] **Step 5: Commit**

```bash
git add src/services/tycoon/sponsorshipEngine.ts scripts/test-tycoon-sponsor.ts
git commit -m "feat(tycoon): sponsorshipEngine — market offers, renewals, year-decrement"
```

---

### Task 4: ledgerEngine — Snapshot + Cash + FFP

**Files:**
- Create: `src/services/tycoon/ledgerEngine.ts`

- [ ] **Step 1: Implementiere ledgerEngine**

```ts
// src/services/tycoon/ledgerEngine.ts
import type { NBATeam } from '../../types';
import type { AnnualLedger } from '../../types/tycoon';

const MAX_HISTORY = 10;

/**
 * Pushes a fresh ledger into team.tycoon.ledgerHistory (FIFO max 10),
 * updates cashOnHand by profit, recomputes 3-year FFP rolling deficit.
 */
export function snapshot(team: NBATeam, ledger: AnnualLedger): void {
  const t = team.tycoon;
  if (!t) return;

  ledger.cashOnHandEnd = t.cashOnHand + ledger.profit;

  t.ledgerHistory.push(ledger);
  if (t.ledgerHistory.length > MAX_HISTORY) t.ledgerHistory.shift();

  t.cashOnHand = ledger.cashOnHandEnd;
  t.ffpRollingDeficit = t.ledgerHistory
    .slice(-3)
    .reduce((sum, l) => sum + Math.min(l.profit, 0), 0);
}

export function getCurrentSeasonLedgerPreview(team: NBATeam): AnnualLedger | null {
  if (!team.tycoon) return null;
  return team.tycoon.ledgerHistory[team.tycoon.ledgerHistory.length - 1] ?? null;
}
```

- [ ] **Step 2: Inline-Smoke in Existing Budget-Test (kein extra Script)**

Add to bottom of `scripts/test-tycoon-budget.ts`, AFTER the existing assertions:

```ts
// ----- Ledger snapshot integration test -----
import { snapshot } from '../src/services/tycoon/ledgerEngine';

const startCash = real.tycoon!.cashOnHand;
snapshot(real, realLedger);
assert(real.tycoon!.ledgerHistory.length === 1, 'ledgerHistory has 1 entry after snapshot');
assert(real.tycoon!.cashOnHand === startCash + realLedger.profit, 'cashOnHand += profit');
assert(real.tycoon!.ffpRollingDeficit === Math.min(0, realLedger.profit), 'FFP recomputed');

// Simulate three negative years for Burgos
for (let y = 0; y < 3; y++) {
  const l = { ...burgosLedger, year: 2025 + y, profit: -500_000, ffpDeficitContribution: -500_000 };
  snapshot(burgos, l);
}
assert(burgos.tycoon!.ffpRollingDeficit === -1_500_000, `FFP 3y deficit = -€1.5M (got ${burgos.tycoon!.ffpRollingDeficit})`);
assert(burgos.tycoon!.ledgerHistory.length === 3, 'history grew to 3');

console.log('✓ Ledger snapshot assertions passed');
```

- [ ] **Step 3: Run combined smoke**

Run: `npx tsx scripts/test-tycoon-budget.ts`
Expected: PASS mit beiden `✓`-Lines.

- [ ] **Step 4: Commit**

```bash
git add src/services/tycoon/ledgerEngine.ts scripts/test-tycoon-budget.ts
git commit -m "feat(tycoon): ledgerEngine snapshot + FFP rolling-deficit calc"
```

---

### Task 5: facilityEngine (MVP-Stub)

**Files:**
- Create: `src/services/tycoon/facilityEngine.ts`

- [ ] **Step 1: Implementiere Stub-Funktionen**

```ts
// src/services/tycoon/facilityEngine.ts
// MVP-Stub. Echte Sim-Hooks (Stadium → Attendance, TC → Progression, Academy → Youth)
// kommen in Slice T5 (`docs/superpowers/specs/2026-XX-XX-tycoon-t5-facilities.md`).

import type { NBATeam } from '../../types';
import { TIER_BASE } from './specs/spain';

export function getMatchdayCapacity(team: NBATeam): number {
  return team.tycoon?.facilities.stadium.capacity ?? 0;
}

export function computeFacilityOpsEUR(team: NBATeam): number {
  const t = team.tycoon;
  if (!t) return 0;
  const tb = TIER_BASE[t.tier];
  const levelSum = t.facilities.stadium.level + t.facilities.trainingCenter.level + t.facilities.academy.level;
  return levelSum * tb.facilityOpsPerLevel;
}

/** Year-End: schließt pending Upgrades ab, deren finishYear erreicht ist */
export function completeFinishedUpgrades(team: NBATeam, currentYear: number): void {
  const t = team.tycoon;
  if (!t) return;
  for (const key of ['stadium', 'trainingCenter', 'academy'] as const) {
    const f = t.facilities[key];
    if (f.upgradePending && f.upgradePending.finishYear <= currentYear) {
      f.level = f.upgradePending.targetLevel;
      if (key === 'stadium') {
        const tb = TIER_BASE[t.tier];
        t.facilities.stadium.capacity = tb.stadiumCapacity + (f.level - 1) * 2500;
      }
      delete f.upgradePending;
    }
  }
}
```

- [ ] **Step 2: tsc check**

Run: `npx tsc --noEmit`
Expected: keine neuen Errors in `src/services/tycoon/`.

- [ ] **Step 3: Commit**

```bash
git add src/services/tycoon/facilityEngine.ts
git commit -m "feat(tycoon): facilityEngine MVP stub (capacity + ops + finish-upgrades)"
```

---

### Task 6: eventChecker — In-Season-Events

**Files:**
- Create: `src/services/tycoon/eventChecker.ts`

- [ ] **Step 1: Implementiere mit konservativen Daily-Triggers**

```ts
// src/services/tycoon/eventChecker.ts
//
// Daily tick during euro-isolated saves. Fires sparse, non-spammy events
// based on recent results / cash state. Hooks an existing news/mail pipeline
// by pushing into state.tycoonEvents (consumed by news UI in a later slice;
// for MVP we just append; ToastNotifier or NewsFeed can read this same array).

import type { NBATeam, GameState } from '../../types';
import type { Sponsorship, SponsorshipSlot } from '../../types/tycoon';

export interface TycoonEvent {
  id: string;
  teamId: number;
  date: string; // ISO yyyy-mm-dd
  kind: 'sponsorMidTermBonus' | 'sponsorPoachingOffer' | 'sponsorWarning' | 'crisisMeeting' | 'bankAlarm';
  payload?: any;
  unread: boolean;
}

interface TickContext {
  state: GameState;
  gameDate: string;
}

export function tick(ctx: TickContext): void {
  const state = ctx.state as any;
  const events: TycoonEvent[] = (state.tycoonEvents = state.tycoonEvents ?? []);

  // Only check once per ISO-day; the daily tick rate is high so use a simple guard
  if (state._tycoonEventDayMark === ctx.gameDate) return;
  state._tycoonEventDayMark = ctx.gameDate;

  for (const team of state.teams as NBATeam[]) {
    if (!team.tycoon) continue;
    runChecks(team, ctx.gameDate, events);
  }
}

function pushEvent(events: TycoonEvent[], teamId: number, date: string, kind: TycoonEvent['kind'], payload?: any) {
  const id = `${kind}-${teamId}-${date}`;
  if (events.some(e => e.id === id)) return; // dedupe within a day
  events.push({ id, teamId, date, kind, payload, unread: true });
}

function runChecks(team: NBATeam, date: string, events: TycoonEvent[]): void {
  const t = team.tycoon!;
  // 1. cashOnHand prolonged negative
  if (t.cashOnHand < 0) {
    pushEvent(events, team.tid, date, 'bankAlarm', { cash: t.cashOnHand });
  }
  // 2. Long losing streak (read from team.stats.streak / .lastN if present)
  const ts: any = (team as any).stats;
  if (ts?.lastN?.lossStreak >= 5) {
    pushEvent(events, team.tid, date, 'sponsorWarning', { streak: ts.lastN.lossStreak });
    t.nextRenewalPenaltyFactor = 0.90;
  }
  // 3. Half-season + position 16+
  if (date.match(/-01-\d{2}$/) && (ts?.standingRank ?? 0) >= 16) {
    pushEvent(events, team.tid, date, 'crisisMeeting', { rank: ts.standingRank });
  }
  // 4. Endesa-Titel just declared → sponsorMidTermBonus (consumed flag on team)
  if ((team as any).justWonEndesa) {
    const slot = pickRandomNonExpiredSlot(t.sponsorships);
    if (slot) {
      pushEvent(events, team.tid, date, 'sponsorMidTermBonus', { slot });
    }
    (team as any).justWonEndesa = false;
  }
  // 5. EL Final Four reached → sponsorPoachingOffer for sleeve
  if ((team as any).justReachedEuroFinalFour && t.sponsorships.sleeve && t.sponsorships.sleeve.yearsRemaining >= 2) {
    pushEvent(events, team.tid, date, 'sponsorPoachingOffer', { slot: 'sleeve' });
    (team as any).justReachedEuroFinalFour = false;
  }
}

function pickRandomNonExpiredSlot(s: NBATeam['tycoon'] extends infer T ? any : never): SponsorshipSlot | null {
  const slots: SponsorshipSlot[] = (['kit', 'sleeve', 'stadium'] as SponsorshipSlot[]).filter((k) => s[k]);
  return slots.length ? slots[Math.floor(Math.random() * slots.length)] : null;
}

export function acceptMidTermBonus(team: NBATeam, slot: SponsorshipSlot): void {
  const s = team.tycoon?.sponsorships[slot];
  if (!s) return;
  s.valuePerYear = Math.round(s.valuePerYear * 1.20);
  s.yearsRemaining += 2;
}

export function acceptPoachingOffer(team: NBATeam, slot: SponsorshipSlot, newSponsor: string, newValue: number, newYears: number, signedYear: number): { penalty: number } {
  const t = team.tycoon;
  if (!t) return { penalty: 0 };
  const existing = t.sponsorships[slot];
  const penalty = existing ? Math.round(existing.valuePerYear * existing.yearsRemaining * 0.30) : 0;
  t.sponsorships[slot] = { sponsor: newSponsor, valuePerYear: newValue, yearsRemaining: newYears, signedYear };
  t.cashOnHand -= penalty;
  return { penalty };
}
```

- [ ] **Step 2: tsc check**

Run: `npx tsc --noEmit`
Expected: keine neuen Errors. Falls `GameState`-Import nicht klappt: nutze `any` Workaround und füge eine `// @TODO once GameState is exported` Notiz.

- [ ] **Step 3: Commit**

```bash
git add src/services/tycoon/eventChecker.ts
git commit -m "feat(tycoon): eventChecker for in-season sponsor/cash events"
```

---

### Task 7: migrate — LOAD_GAME-Seed pro Klub

**Files:**
- Create: `src/services/tycoon/migrate.ts`

- [ ] **Step 1: Implementiere migrate**

```ts
// src/services/tycoon/migrate.ts
import type { NBATeam } from '../../types';
import type { TycoonState } from '../../types/tycoon';
import { TIER_BASE, getTierForClub } from './specs/spain';
import { seedInitialSponsorships } from './sponsorshipEngine';

export function migrateTeamTycoon(team: NBATeam, currentYear: number): void {
  if (team.tycoon) return; // already migrated
  // Tier-Lookup: nutze Klub-Name oder Abbrev — was im SaveData liegt
  const tier = getTierForClub(team.name ?? '') ?? getTierForClub(team.region ?? '') ?? 'D';
  const tb = TIER_BASE[tier];

  team.tycoon = {
    tier,
    sponsorships: seedInitialSponsorships(tier, currentYear),
    facilities: {
      stadium: { level: 1, capacity: tb.stadiumCapacity },
      trainingCenter: { level: 1 },
      academy: { level: 1 },
    },
    ledgerHistory: [],
    cashOnHand: tb.startingCash,
    boardConfidence: 60,
    ffpRollingDeficit: 0,
  } as TycoonState;
}

export function migrateAllEuroTeams(state: { teams: NBATeam[]; leagueStats: { year: number; uiMode?: string | null } }): number {
  if (state.leagueStats.uiMode !== 'euro_isolated') return 0;
  let migrated = 0;
  for (const team of state.teams) {
    if (team.tycoon) continue;
    migrateTeamTycoon(team, state.leagueStats.year);
    migrated++;
  }
  return migrated;
}
```

- [ ] **Step 2: tsc check**

Run: `npx tsc --noEmit`
Expected: keine neuen Errors in `migrate.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/services/tycoon/migrate.ts
git commit -m "feat(tycoon): LOAD_GAME migration for Euro-Isolated saves"
```

---

## Phase C — UI Cards

### Task 8: AnnualLedgerCard

**Files:**
- Create: `src/components/tycoon/AnnualLedgerCard.tsx`

- [ ] **Step 1: Implementiere**

```tsx
// src/components/tycoon/AnnualLedgerCard.tsx
import React from 'react';
import type { AnnualLedger } from '../../types/tycoon';
import { formatCurrencyWithCode } from '../../utils/helpers';

interface Props {
  ledger: AnnualLedger;
  currency: string;
}

export const AnnualLedgerCard: React.FC<Props> = ({ ledger, currency }) => {
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  const row = (label: string, value: number, color = 'text-slate-300') => (
    <div key={label} className="flex justify-between py-1 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className={`font-bold tabular-nums ${color}`}>{fmt(value)}</span>
    </div>
  );
  const revenueTotal = ledger.revenue.matchday + ledger.revenue.sponsorship + ledger.revenue.prize + ledger.revenue.tv + ledger.revenue.transfer;
  const expensesTotal = ledger.expenses.wages + ledger.expenses.staff + ledger.expenses.facility + ledger.expenses.scouting + ledger.expenses.travel + ledger.expenses.financeCosts;
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="font-black uppercase tracking-widest mb-4 text-sm">Annual Ledger ({ledger.year})</h2>
      <p className="text-[10px] uppercase text-emerald-400 font-black mb-1">Revenue</p>
      {row('Matchday', ledger.revenue.matchday, 'text-emerald-300')}
      {row('Sponsorship', ledger.revenue.sponsorship, 'text-emerald-300')}
      {row('Prize Pool', ledger.revenue.prize, 'text-emerald-300')}
      {row('TV', ledger.revenue.tv, 'text-emerald-300')}
      {ledger.revenue.transfer > 0 && row('Transfers', ledger.revenue.transfer, 'text-emerald-300')}
      <div className="flex justify-between border-t border-slate-700 pt-1 mt-1 font-bold">
        <span className="text-slate-200">Total Revenue</span>
        <span className="text-emerald-300 tabular-nums">{fmt(revenueTotal)}</span>
      </div>
      <p className="text-[10px] uppercase text-rose-400 font-black mt-4 mb-1">Expenses</p>
      {row('Wages', -ledger.expenses.wages, 'text-rose-300')}
      {row('Staff', -ledger.expenses.staff, 'text-rose-300')}
      {row('Facility', -ledger.expenses.facility, 'text-rose-300')}
      {row('Travel', -ledger.expenses.travel, 'text-rose-300')}
      {row('Scouting', -ledger.expenses.scouting, 'text-rose-300')}
      {ledger.expenses.financeCosts > 0 && row('Finance Costs', -ledger.expenses.financeCosts, 'text-rose-300')}
      <div className="flex justify-between border-t border-slate-700 pt-1 mt-1 font-bold">
        <span className="text-slate-200">Total Expenses</span>
        <span className="text-rose-300 tabular-nums">{fmt(-expensesTotal)}</span>
      </div>
      <div className="flex justify-between border-t border-slate-600 pt-2 mt-2 text-base font-black">
        <span>Profit</span>
        <span className={ledger.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{fmt(ledger.profit)}</span>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: tsc check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/tycoon/AnnualLedgerCard.tsx
git commit -m "feat(tycoon): AnnualLedgerCard component"
```

---

### Task 9: SponsorshipCard + LedgerHistoryCard

**Files:**
- Create: `src/components/tycoon/SponsorshipCard.tsx`
- Create: `src/components/tycoon/LedgerHistoryCard.tsx`

- [ ] **Step 1: SponsorshipCard**

```tsx
// src/components/tycoon/SponsorshipCard.tsx
import React from 'react';
import { Handshake } from 'lucide-react';
import type { TycoonState, SponsorshipSlot } from '../../types/tycoon';
import { formatCurrencyWithCode } from '../../utils/helpers';

interface Props {
  tycoon: TycoonState;
  currency: string;
  onNegotiate: (slot: SponsorshipSlot) => void;
}

const SLOT_LABELS: Record<SponsorshipSlot, string> = {
  kit: 'Kit',
  sleeve: 'Sleeve',
  stadium: 'Stadium',
};

export const SponsorshipCard: React.FC<Props> = ({ tycoon, currency, onNegotiate }) => {
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="font-black uppercase tracking-widest mb-4 text-sm flex items-center gap-2">
        <Handshake size={14} className="text-amber-400" /> Sponsorship Deals
      </h2>
      <div className="space-y-3">
        {(['kit', 'sleeve', 'stadium'] as SponsorshipSlot[]).map((slot) => {
          const s = tycoon.sponsorships[slot];
          const expired = s === null;
          return (
            <div key={slot} className={`rounded-xl border p-3 ${expired ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-700 bg-slate-900/40'}`}>
              <div className="flex justify-between items-start mb-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{SLOT_LABELS[slot]}</span>
                <button
                  onClick={() => onNegotiate(slot)}
                  className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${expired ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >
                  {expired ? 'Renew Available →' : 'Negotiate'}
                </button>
              </div>
              {s ? (
                <>
                  <p className="text-sm font-bold text-white">{s.sponsor}</p>
                  <p className="text-xs text-slate-400">{fmt(s.valuePerYear)}/yr · <span className={s.yearsRemaining === 1 ? 'text-amber-300' : 'text-slate-400'}>{s.yearsRemaining}y left</span></p>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-amber-300">Default Fallback</p>
                  <p className="text-xs text-slate-500">No active deal — negotiate a new sponsor</p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: LedgerHistoryCard**

```tsx
// src/components/tycoon/LedgerHistoryCard.tsx
import React from 'react';
import { History, AlertTriangle } from 'lucide-react';
import type { TycoonState } from '../../types/tycoon';
import { formatCurrencyWithCode } from '../../utils/helpers';

interface Props {
  tycoon: TycoonState;
  currency: string;
}

export const LedgerHistoryCard: React.FC<Props> = ({ tycoon, currency }) => {
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  const rows = tycoon.ledgerHistory.slice(-5);
  const ffpWarn = tycoon.ffpRollingDeficit < -20_000_000;
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="font-black uppercase tracking-widest mb-4 text-sm flex items-center gap-2">
        <History size={14} className="text-blue-400" /> Ledger History
      </h2>
      <div className="flex justify-between items-baseline mb-3">
        <span className="text-[10px] uppercase text-slate-500 font-black">Cash on Hand</span>
        <span className={`text-lg font-black ${tycoon.cashOnHand >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
          {fmt(tycoon.cashOnHand)}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500 italic">No completed seasons yet — first year-end will seed history.</p>
      ) : (
        <div className="space-y-1">
          {rows.map((l) => (
            <div key={l.year} className="flex justify-between text-sm border-b border-slate-800 py-1">
              <span className="text-slate-400">{l.year}</span>
              <div className="flex gap-3 tabular-nums">
                <span className={l.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{fmt(l.profit)}</span>
                <span className="text-slate-500 text-xs">cash {fmt(l.cashOnHandEnd)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className={`mt-3 rounded-lg px-3 py-2 flex items-center gap-2 text-xs ${ffpWarn ? 'bg-amber-500/10 border border-amber-500/40 text-amber-200' : 'bg-slate-800/40 text-slate-400'}`}>
        {ffpWarn && <AlertTriangle size={12} className="text-amber-400" />}
        FFP 3-Year Deficit: <span className="font-bold tabular-nums">{fmt(tycoon.ffpRollingDeficit)}</span>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: tsc check + commit**

```bash
npx tsc --noEmit
git add src/components/tycoon/SponsorshipCard.tsx src/components/tycoon/LedgerHistoryCard.tsx
git commit -m "feat(tycoon): SponsorshipCard + LedgerHistoryCard components"
```

---

### Task 10: SponsorshipNegotiationModal

**Files:**
- Create: `src/components/tycoon/SponsorshipNegotiationModal.tsx`

- [ ] **Step 1: Implementiere**

```tsx
// src/components/tycoon/SponsorshipNegotiationModal.tsx
import React, { useMemo, useState } from 'react';
import { X, Check, XCircle } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { getMarketOffer, applyRenewal, applyDecline, SponsorshipOffer, SuccessHistory } from '../../services/tycoon/sponsorshipEngine';
import type { SponsorshipSlot } from '../../types/tycoon';
import { formatCurrencyWithCode } from '../../utils/helpers';

interface Props {
  open: boolean;
  onClose: () => void;
  initialSlot?: SponsorshipSlot;
}

const SLOTS: SponsorshipSlot[] = ['kit', 'sleeve', 'stadium'];

export const SponsorshipNegotiationModal: React.FC<Props> = ({ open, onClose, initialSlot }) => {
  const { state, dispatch } = useGame();
  const [activeSlot, setActiveSlot] = useState<SponsorshipSlot>(initialSlot ?? 'kit');
  const team = state.teams.find((t: any) => t.tid === state.userTeamId);
  const currency = state.leagueStats?.currency ?? 'EUR';
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  const tycoon = team?.tycoon;

  const history: SuccessHistory = useMemo(() => ({
    recentEndesaPositions: ((team as any)?.recentEndesaPositions ?? []).slice(-3),
    recentEuroleagueStages: ((team as any)?.recentEuroleagueStages ?? []).slice(-3),
  }), [team]);

  const offer: SponsorshipOffer | null = useMemo(() => {
    if (!tycoon) return null;
    return getMarketOffer(tycoon, activeSlot, history);
  }, [tycoon, activeSlot, history]);

  if (!open || !team || !tycoon || !offer) return null;

  const current = tycoon.sponsorships[activeSlot];

  const handleAccept = () => {
    applyRenewal(tycoon, activeSlot, offer, state.leagueStats.year);
    dispatch({ type: 'FORCE_RERENDER' as any }); // or whatever the project uses to commit team mutations
    onClose();
  };

  const handleDecline = () => {
    applyDecline(tycoon, activeSlot);
    dispatch({ type: 'FORCE_RERENDER' as any });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-black uppercase tracking-wider text-white">Sponsorship Negotiation</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-white" /></button>
        </div>
        <div className="flex gap-2 mb-6">
          {SLOTS.map((slot) => (
            <button
              key={slot}
              onClick={() => setActiveSlot(slot)}
              className={`flex-1 py-2 rounded-xl uppercase text-xs font-black tracking-widest ${
                activeSlot === slot ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {slot}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl border border-slate-700 p-4">
            <p className="text-[10px] uppercase font-black text-slate-500 tracking-widest mb-2">Current</p>
            {current ? (
              <>
                <p className="text-lg font-bold text-white">{current.sponsor}</p>
                <p className="text-sm text-slate-400">{fmt(current.valuePerYear)}/yr</p>
                <p className="text-xs text-slate-500 mt-1">{current.yearsRemaining}y remaining</p>
              </>
            ) : (
              <p className="text-amber-300 font-bold">No active deal</p>
            )}
          </div>
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
            <p className="text-[10px] uppercase font-black text-amber-400 tracking-widest mb-2">Market Offer</p>
            <p className="text-lg font-bold text-white">{offer.sponsor}</p>
            <p className="text-sm text-amber-300">{fmt(offer.valuePerYear)}/yr</p>
            <p className="text-xs text-slate-400 mt-1">{offer.years} year deal</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={handleAccept} className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase tracking-widest py-3 rounded-xl flex items-center justify-center gap-2">
            <Check size={16} /> Accept
          </button>
          <button onClick={handleDecline} className="flex-1 bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 font-black uppercase tracking-widest py-3 rounded-xl flex items-center justify-center gap-2">
            <XCircle size={16} /> Decline → Default
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Check ob `dispatch({ type: 'FORCE_RERENDER' })` existiert oder ein passender Action-Type genutzt werden muss**

Run: `grep -rn "FORCE_RERENDER\|MUTATE_TEAM\|UPDATE_TEAM_TYCOON" src/store/ src/types.ts | head -5`

Falls keine passende Action existiert, ergänze eine neue Action `UPDATE_TEAM_TYCOON` im Reducer:

```ts
// src/store/logic/actions/... oder im zentralen Reducer
case 'UPDATE_TEAM_TYCOON': {
  // mutation already happened in place; just force shallow team-array clone for React equality
  return { ...state, teams: [...state.teams] };
}
```

Pass das Modal entsprechend an: `dispatch({ type: 'UPDATE_TEAM_TYCOON' })`.

- [ ] **Step 3: tsc + commit**

```bash
npx tsc --noEmit
git add src/components/tycoon/SponsorshipNegotiationModal.tsx src/store
git commit -m "feat(tycoon): SponsorshipNegotiationModal + UPDATE_TEAM_TYCOON action"
```

---

## Phase D — Integration

### Task 11: TeamFinancesViewDetailed — Euro-Branch rewire

**Files:**
- Modify: `src/components/central/view/TeamFinancesViewDetailed.tsx` Z. 83–125

- [ ] **Step 1: Lese die aktuelle Euro-Branch**

Run: `grep -n "isEuroIsolatedMode" src/components/central/view/TeamFinancesViewDetailed.tsx`

Du solltest Z. 83 finden mit `if (isEuroIsolatedMode(state)) {`.

- [ ] **Step 2: Ersetze Z. 83–125 (Body des if-Blocks) mit echtem Ledger**

Neues Body (zwischen `if (isEuroIsolatedMode(state)) {` und dem `}`):

```tsx
    const currency = state.leagueStats?.currency ?? 'EUR';
    const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
    const tycoon = selectedTeam.tycoon;

    if (!tycoon) {
      return <div className="p-8 text-slate-400">No tycoon data yet — load a fresh Euro save or wait for migration.</div>;
    }

    // Live preview ledger for current season (year not yet rolled over)
    const lastFinish = (selectedTeam as any).lastEndesaFinish ?? 0;
    const lastEuroStage = (selectedTeam as any).lastEuroleagueStage ?? 'none';
    const liveLedger = computeAnnualBudget(selectedTeam, {
      year: currentYear,
      endesaFinishPosition: lastFinish || 9,
      euroleagueStage: lastEuroStage,
      euroleagueAwayGames: (selectedTeam as any).lastEuroAwayGames ?? 0,
      endesaPrizeEUR: 0,
      euroleaguePrizeEUR: 0,
    });

    return (
      <div className="h-full overflow-y-auto p-4 md:p-8 bg-slate-950 text-white">
        <div className="max-w-6xl mx-auto space-y-6">
          <button onClick={() => setCurrentView('Team Office')} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm">
            <ArrowLeft size={16} /> Back
          </button>
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-300">Euro Finance · Tier {tycoon.tier}</div>
            <h1 className="text-3xl font-black uppercase tracking-tight mt-2">{getTeamFullName(selectedTeam)}</h1>
            <div className="grid md:grid-cols-3 gap-4 mt-6">
              <div className="rounded-2xl bg-slate-950 border border-slate-800 p-4">
                <p className="text-xs text-slate-500 uppercase font-black">Annual Wage Bill</p>
                <p className="text-3xl font-black">{fmt(liveLedger.expenses.wages)}</p>
              </div>
              <div className="rounded-2xl bg-slate-950 border border-slate-800 p-4">
                <p className="text-xs text-slate-500 uppercase font-black">Budget Utilization</p>
                <p className="text-3xl font-black">{Math.round((liveLedger.expenses.wages / Math.max(liveLedger.revenue.matchday + liveLedger.revenue.sponsorship + liveLedger.revenue.tv, 1)) * 100)}%</p>
              </div>
              <div className="rounded-2xl bg-slate-950 border border-slate-800 p-4">
                <p className="text-xs text-slate-500 uppercase font-black">Projected Profit</p>
                <p className={liveLedger.profit >= 0 ? 'text-3xl font-black text-emerald-400' : 'text-3xl font-black text-rose-400'}>{fmt(liveLedger.profit)}</p>
              </div>
            </div>
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <AnnualLedgerCard ledger={liveLedger} currency={currency} />
            <div className="space-y-6">
              <SponsorshipCard tycoon={tycoon} currency={currency} onNegotiate={(slot) => setSponsorModal({ open: true, slot })} />
              <LedgerHistoryCard tycoon={tycoon} currency={currency} />
            </div>
          </div>
          <ContractTimeline teamId={teamId} currentYear={currentYear} />
        </div>
        <SponsorshipNegotiationModal open={sponsorModal.open} onClose={() => setSponsorModal({ open: false, slot: 'kit' })} initialSlot={sponsorModal.slot} />
      </div>
    );
```

Imports oben in der Datei ergänzen (auf den existierenden Import-Block oben dazupacken):

```tsx
import { AnnualLedgerCard } from '../../tycoon/AnnualLedgerCard';
import { SponsorshipCard } from '../../tycoon/SponsorshipCard';
import { LedgerHistoryCard } from '../../tycoon/LedgerHistoryCard';
import { SponsorshipNegotiationModal } from '../../tycoon/SponsorshipNegotiationModal';
import { computeAnnualBudget } from '../../../services/tycoon/budgetEngine';
import type { SponsorshipSlot } from '../../../types/tycoon';
```

Und im Component-Body (oben, neben den anderen useState-Calls):

```tsx
const [sponsorModal, setSponsorModal] = useState<{ open: boolean; slot: SponsorshipSlot }>({ open: false, slot: 'kit' });
```

- [ ] **Step 3: tsc check**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Browser-Smoke**

Run: `npm run dev`

Im Browser:
1. Lade einen Euro-Spain-Save (oder erstelle einen neu)
2. Navigiere zu Team Office → League Finances → Real Madrid (oder den User-Team-Klick)
3. Erwartet: Annual Ledger zeigt strukturierte Revenue/Expenses-Breakdown (nicht mehr `payroll × Faktor`), Sponsorship-Card zeigt 3 Slots mit echten Namen + Years, History-Card zeigt "No completed seasons yet"
4. Klick "Negotiate" auf einem Slot → Modal öffnet sich, zeigt Current vs Market Offer

- [ ] **Step 5: Commit**

```bash
git add src/components/central/view/TeamFinancesViewDetailed.tsx
git commit -m "feat(tycoon): wire TeamFinances Euro-branch to real tycoon engines"
```

---

### Task 12: seasonRollover — Year-End-Hook

**Files:**
- Modify: `src/services/seasonRollover.ts` (oder wo immer der Year-End-Code lebt)

- [ ] **Step 1: Finde den Year-End-Punkt**

Run: `grep -rn "seasonRollover\|onSeasonEnd\|YEAR_END\|advanceYear" src/services/ | head -10`

Identifiziere die Funktion, die am Ende einer Saison aufgerufen wird (nach Playoffs + EL Final Four resolution).

- [ ] **Step 2: Füge Hook ein**

Direkt nach der CompetitionResults-Resolution (wo Endesa-Tabelle final ist und EL-FF entschieden), neuer Block:

```ts
import { computeAnnualBudget } from './tycoon/budgetEngine';
import { snapshot } from './tycoon/ledgerEngine';
import { dekrementSponsorshipYears } from './tycoon/sponsorshipEngine';
import { completeFinishedUpgrades } from './tycoon/facilityEngine';
import { isEuroIsolatedMode } from '../utils/uiMode';

// ... bei Year-End:
if (isEuroIsolatedMode(state)) {
  for (const team of state.teams) {
    if (!team.tycoon) continue;
    const endesaFinish = getEndesaFinishForTeam(state, team.tid) ?? 9;
    const elStage = getEuroleagueStageForTeam(state, team.tid) ?? 'none';
    const elAwayGames = countEuroleagueAwayGames(state, team.tid);
    const endesaPrize = getEndesaPrizeForTeam(state, team.tid) ?? 0;
    const elPrize = getEuroleaguePrizeForTeam(state, team.tid) ?? 0;
    const ledger = computeAnnualBudget(team, {
      year: state.leagueStats.year,
      endesaFinishPosition: endesaFinish,
      euroleagueStage: elStage,
      euroleagueAwayGames: elAwayGames,
      endesaPrizeEUR: endesaPrize,
      euroleaguePrizeEUR: elPrize,
    });
    snapshot(team, ledger);
    dekrementSponsorshipYears(team.tycoon);
    completeFinishedUpgrades(team, state.leagueStats.year + 1);
    // Stash recent stages on team for next year's UI preview + sponsor offers
    (team as any).recentEndesaPositions = [...((team as any).recentEndesaPositions ?? []), endesaFinish].slice(-3);
    (team as any).recentEuroleagueStages = [...((team as any).recentEuroleagueStages ?? []), elStage].slice(-3);
    (team as any).lastEndesaFinish = endesaFinish;
    (team as any).lastEuroleagueStage = elStage;
    (team as any).lastEuroAwayGames = elAwayGames;
  }
}
```

Die Helpers `getEndesaFinishForTeam` etc. existieren ggf. schon im Competition-Resolver-Code aus `plans/euro-isolated-spain-mvp.md` Slice 8c. Falls nicht, schreibe sie als kleine Helper am gleichen Ort:

```ts
function getEndesaFinishForTeam(state: any, tid: number): number | null {
  const standings = state.competitions?.['spain-endesa']?.standings;
  if (!standings) return null;
  const idx = standings.findIndex((s: any) => s.tid === tid);
  return idx === -1 ? null : idx + 1;
}
function getEuroleagueStageForTeam(state: any, tid: number): 'final-four' | 'qf' | 'group' | 'none' {
  const elHist = state.competitions?.['euroleague']?.history ?? [];
  const last = elHist[elHist.length - 1];
  if (!last) return 'none';
  if (last.finalFourTeams?.includes(tid)) return 'final-four';
  if (last.qfTeams?.includes(tid)) return 'qf';
  if (last.groupTeams?.includes(tid)) return 'group';
  return 'none';
}
function countEuroleagueAwayGames(state: any, tid: number): number {
  return (state.schedule ?? []).filter((g: any) => g.played && g.competitionId === 'euroleague' && g.awayTeamId === tid).length;
}
function getEndesaPrizeForTeam(state: any, tid: number): number {
  return state.competitions?.['spain-endesa']?.prizePool?.[tid] ?? 0;
}
function getEuroleaguePrizeForTeam(state: any, tid: number): number {
  return state.competitions?.['euroleague']?.prizePool?.[tid] ?? 0;
}
```

Falls die exakten CompetitionSpec-Pfade nicht greifen, nutze als Stub-Fallback Werte aus `state.history` oder Hartkodierungen mit `// TODO wire to CompetitionSpec resolver from Slice 8c`. Wichtig: Default-Fallbacks dürfen nicht crashen.

- [ ] **Step 3: tsc check + Browser smoke**

Run: `npx tsc --noEmit`
Run: `npm run dev` → Simuliere eine ganze Saison durch (mit PlayButton "Through Endesa") → erwarte: nach dem Year-End ist `team.tycoon.ledgerHistory.length === 1` im DevTools-Console-Inspect.

DevTools-Snippet (aus CLAUDE.md adaptiert):
```js
(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('keyval-store'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const get = k => new Promise((res, rej) => { const r = db.transaction('keyval','readonly').objectStore('keyval').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const meta = await get('nba_commish_metadata');
  const newest = [...meta].sort((a,b) => b.dateSaved - a.dateSaved)[0];
  const raw = await get(newest.id);
  const ds = new DecompressionStream('gzip');
  const w = ds.writable.getWriter(); w.write(raw.data); w.close();
  const state = JSON.parse(await new Response(ds.readable).text());
  const real = state.teams.find(t => (t.name ?? '').includes('Real Madrid'));
  console.log('Real Tycoon:', real?.tycoon);
  console.log('Ledger entries:', real?.tycoon?.ledgerHistory?.length);
  window.__lastSaveState = state;
})();
```

- [ ] **Step 4: Commit**

```bash
git add src/services/seasonRollover.ts
git commit -m "feat(tycoon): year-end ledger snapshot + sponsor decrement in seasonRollover"
```

---

### Task 13: LOAD_GAME — Migration

**Files:**
- Modify: zentraler Reducer (`src/store/...` — finde via grep)

- [ ] **Step 1: Lokalisiere LOAD_GAME-Reducer**

Run: `grep -rn "case 'LOAD_GAME'\|LOAD_GAME:" src/store/ src/types.ts 2>/dev/null | head -5`

- [ ] **Step 2: Patch — migrate für Euro-Saves**

In der `LOAD_GAME`-Branch, direkt nach Setting des neuen State, vor return:

```ts
import { migrateAllEuroTeams } from '../services/tycoon/migrate';

// ... case 'LOAD_GAME': const newState = ...; ...
const migrated = migrateAllEuroTeams(newState);
if (migrated > 0) console.info(`[tycoon] migrated ${migrated} teams to tycoon state`);
return newState;
```

- [ ] **Step 3: tsc + Browser-Smoke**

Run: `npx tsc --noEmit`
Run: `npm run dev` → Lade einen alten Euro-Save aus IDB (vor Migration). Console-Output sollte `[tycoon] migrated 18 teams ...` zeigen. Inspect via DevTools-Snippet → `team.tycoon` ist auf allen Endesa-Klubs befüllt.

- [ ] **Step 4: Commit**

```bash
git add src/store
git commit -m "feat(tycoon): LOAD_GAME migration seeds team.tycoon for Euro-Isolated saves"
```

---

### Task 14: offseasonState — sponsorRenewals Row visibility

**Files:**
- Modify: `src/services/offseason/offseasonState.ts`

- [ ] **Step 1: Lokalisiere Z. 245–255 (`getVisibleOffseasonRows` Euro-Branch)**

Run: `grep -n "sponsorRenewals\|getVisibleOffseasonRows" src/services/offseason/offseasonState.ts`

- [ ] **Step 2: Mache `sponsorRenewals` conditional auf "hat das User-Team mindestens einen abgelaufenen Slot?"**

Aktuell wird `sponsorRenewals` immer in der Euro-Liste ausgegeben. Bessere UX: nur zeigen wenn auch ein Decision-Bedarf besteht.

```ts
import { hasExpiredSlot } from './tycoon/sponsorshipEngine'; // Pfad anpassen relativ zu offseasonState.ts

// in der Euro-branch von getVisibleOffseasonRows(state, leagueStats):
// ... ändere parameter, falls nötig
export function getVisibleOffseasonRows(
  leagueStats: { uiMode?: string | null; draftType?: string },
  userTeam?: NBATeam,
): OffseasonChecklistRow[] {
  if (leagueStats.uiMode === 'euro_isolated') {
    const rows: OffseasonChecklistRow[] = ['options', 'qualifyingOffers', 'myFAs', 'freeAgency'];
    if (userTeam?.tycoon && hasExpiredSlot(userTeam.tycoon)) rows.push('sponsorRenewals');
    rows.push('facilityUpgrades', 'preseasonFriendlies', 'trainingCamp');
    return rows;
  }
  return isNoDraftLeague(leagueStats) ? OFFSEASON_ROW_ORDER.filter(...) : OFFSEASON_ROW_ORDER;
}
```

Falls Call-Site die Signatur (`(leagueStats, userTeam)`) noch nicht so übergibt, finde alle Aufrufer und patche sie. Run: `grep -rn "getVisibleOffseasonRows" src/components/ src/services/`. Pass jeden Aufrufer den `userTeam` (oder optional `undefined` für Commissioner-Mode).

- [ ] **Step 3: tsc check + commit**

```bash
npx tsc --noEmit
git add src/services/offseason/offseasonState.ts src/components
git commit -m "feat(tycoon): sponsorRenewals row visible only when ≥1 slot expired"
```

---

### Task 15: getStepConfirmSpec + OffseasonAufgaben — Modal launch

**Files:**
- Modify: `src/components/offseason/OffseasonAufgaben.tsx` Z. 566 ff. (`getStepConfirmSpec`)

- [ ] **Step 1: Lese getStepConfirmSpec aktuelle Struktur**

Run: `sed -n '560,640p' src/components/offseason/OffseasonAufgaben.tsx`

Du suchst die `switch (row)`-Stelle in `getStepConfirmSpec`.

- [ ] **Step 2: Füge Cases für `sponsorRenewals` + `facilityUpgrades`**

Vor dem `default:`-Branch:

```tsx
case 'sponsorRenewals':
  return {
    title: 'Sponsorship Renewals',
    description: 'Review expired sponsorship slots and accept market offers or decline to default.',
    actionLabel: 'Open Negotiations',
    customAction: 'OPEN_SPONSORSHIP_MODAL',
  };
case 'facilityUpgrades':
  return {
    title: 'Facility Review',
    description: 'Facility upgrades unlock in slice T5. For now, review your current setup.',
    actionLabel: 'View Facilities',
    customAction: 'NAV_FACILITIES',
  };
```

In `handleEnter(row)` (oder wo `customAction` ausgewertet wird), branche entsprechend:

```tsx
if (spec.customAction === 'OPEN_SPONSORSHIP_MODAL') {
  setSponsorModalOpen(true);
  return;
}
if (spec.customAction === 'NAV_FACILITIES') {
  setCurrentView('Team Office'); // T5 wires this to a dedicated Facilities tab
  return;
}
```

Plus oben im File-State:
```tsx
const [sponsorModalOpen, setSponsorModalOpen] = useState(false);
// Modal rendern am Body-Ende:
<SponsorshipNegotiationModal open={sponsorModalOpen} onClose={() => setSponsorModalOpen(false)} />
```

Import-Block ergänzen:
```tsx
import { SponsorshipNegotiationModal } from '../tycoon/SponsorshipNegotiationModal';
```

- [ ] **Step 3: tsc + Browser-Smoke**

Run: `npx tsc --noEmit`
Browser: simuliere bis Year-End wo ein Sponsor `yearsRemaining === 0` erreicht → erwarte Sidebar-Row `sponsorRenewals` → Klick → Modal öffnet sich.

- [ ] **Step 4: Commit**

```bash
git add src/components/offseason/OffseasonAufgaben.tsx
git commit -m "feat(tycoon): sponsorRenewals offseason row opens negotiation modal"
```

---

### Task 16: simulationHandler — Daily tick

**Files:**
- Modify: `src/services/simulation/simulationHandler.ts`

- [ ] **Step 1: Lokalisiere Daily-Tick / dayAdvance**

Run: `grep -n "function.*tick\|onDayAdvance\|nextDay\|gameDate" src/services/simulation/simulationHandler.ts | head -5`

- [ ] **Step 2: Hook einsetzen**

Direkt nach dem schedule-Tick und news-update (irgendwo in der inner-Loop pro Tag):

```ts
import { tick as tycoonTick } from './tycoon/eventChecker';
import { isEuroIsolatedMode } from '../../utils/uiMode';

// in der Daily-Loop:
if (isEuroIsolatedMode(state)) {
  tycoonTick({ state, gameDate: state.leagueStats.gameDate });
}
```

- [ ] **Step 3: tsc + commit**

```bash
npx tsc --noEmit
git add src/services/simulation/simulationHandler.ts
git commit -m "feat(tycoon): daily tycoon eventChecker tick in euro mode"
```

---

### Task 17: FinancesWidget — Currency-Fix (AC-12)

**Files:**
- Modify: `src/components/sidebar/FinancesWidget.tsx`

- [ ] **Step 1: Patch beide formatCurrency calls**

Aktuell (`FinancesWidget.tsx:26` und `:45`):
```tsx
{formatCurrency(state.stats.leagueFunds)}
// ...
{formatCurrency(state.stats.personalWealth)}
```

Ersetze beides durch:
```tsx
{formatCurrencyWithCode(state.stats.leagueFunds, state.leagueStats?.currency ?? 'USD')}
// ...
{formatCurrencyWithCode(state.stats.personalWealth, state.leagueStats?.currency ?? 'USD')}
```

Imports oben anpassen:
```tsx
import { formatCurrencyWithCode } from '../../utils/helpers';
// formatCurrency entfernen wenn nirgends sonst gebraucht
```

- [ ] **Step 2: tsc check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Browser-Smoke**

Run: `npm run dev`
- Lade Euro-Save → Sidebar Left: "Personal €3.08M" (mit Euro-Zeichen), nicht "$3.08M"
- Lade NBA-Save (separater Save) → Sidebar Left: "Personal $3.08M" bleibt USD

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar/FinancesWidget.tsx
git commit -m "fix(tycoon): FinancesWidget renders in active currency (AC-12)"
```

---

## Phase E — Verification & End-to-End

### Task 18: End-to-end Walkthrough + Type-Check

- [ ] **Step 1: Vollständiger TypeScript-Lint**

Run: `npx tsc --noEmit`
Expected: keine NEUEN Errors. Vorhandene Errors aus `DraftSimulatorView.tsx`/`fictionalLeagueGenerator.ts`/`GameContext.tsx`/`initialization.ts` sind bekannt (aus Phase 2 Codex-Status). Keine neuen Errors in unseren Tycoon-Files.

- [ ] **Step 2: Smoke-Scripts**

Run: `npx tsx scripts/test-tycoon-budget.ts`
Run: `npx tsx scripts/test-tycoon-sponsor.ts`
Expected: beide `✓` Logs.

- [ ] **Step 3: Browser end-to-end Walkthrough**

Run: `npm run dev`

Test-Sequenz (im Browser mit einem Spain-Setup-Save):
1. ✅ AC-0: Save laden → DevTools-Snippet → alle 18 Endesa-Klubs haben `team.tycoon` befüllt
2. ✅ AC-1: Navigate to Real Madrid TeamFinances → Annual Ledger zeigt Revenue ~€50–60M, Wages, Profit
3. ✅ AC-2: Navigate to Burgos TeamFinances → Revenue ~€4–5M, knapper/negativer Profit
4. ✅ AC-3: Sponsorship-Card zeigt 3 Slots mit Sponsoren-Namen, valuePerYear, yearsRemaining
5. ✅ AC-5: simuliere Saisons durch bis ein Slot expired → Sidebar zeigt `Sponsor Renewals` Row → Klick öffnet Modal
6. ✅ AC-6: im Modal Accept → Slot ist erneuert (im UI sichtbar). Repeat mit Decline → Slot ist null, Card zeigt "Default Fallback"
7. ✅ AC-4: Nach 1 Saison Year-End → Ledger History Card zeigt 1 Zeile. Nach 3 Saisons → 3 Zeilen
8. ✅ AC-8/9: FFP-Banner in der Card zeigt 3-Year Deficit (für gewinnende Klubs grün, für Burgos ggf. gelb)
9. ✅ AC-12: Sidebar zeigt "Personal €X.XXM" mit Euro-Symbol
10. ✅ AC-10: Lade einen NBA-Save (separat) → TeamFinances NBA-Branch unverändert, kein `team.tycoon` auf NBA-Teams, FinancesWidget zeigt "$X.XXM"

- [ ] **Step 4: Falls AC fehlschlägt**

Falls einer der ACs versagt, debugge mit dem CLAUDE.md DevTools-Snippet (gunzip + inspect player/team state). Korrigiere, recommit pro Fix, dann re-test.

- [ ] **Step 5: Final Commit + PR-Ready**

```bash
git log --oneline | head -20
# Sollte 17 commits zeigen, alle mit "feat(tycoon)" oder "fix(tycoon)" Präfix
```

Optionaler Merge-Commit oder PR-Title:
> `feat(tycoon): Euro-Isolated Tycoon Layer MVP (T1+T2+T8)`

---

## Self-Review Notes

**Spec coverage check:**
- AC-0 (auto-migration) → Task 7 + Task 13 ✓
- AC-1/2 (Real Madrid + Burgos numbers) → Task 2 smoke + Task 11 UI ✓
- AC-3 (3 echte Slots) → Task 9 + Task 11 ✓
- AC-4 (Year-End persistiert Ledger) → Task 4 + Task 12 ✓
- AC-5 (Row erscheint wenn expired) → Task 14 + Task 15 ✓
- AC-6 (Accept/Decline schreibt State) → Task 3 + Task 10 ✓
- AC-7 (In-Season Endesa-Titel-Bonus) → Task 6 (eventChecker) — Note: Endesa-Titel-Flag (`justWonEndesa`) muss in Slice 8c/Competition-Resolver gesetzt werden. Falls dieser Hook fehlt, ist AC-7 deferred bis Competition-Resolver-Slice das Flag aktiv setzt. **Document in PR description as known follow-up.**
- AC-8 (cashOnHand persistiert) → Task 4 ✓
- AC-9 (FFP rolling deficit) → Task 4 + Task 9 (LedgerHistoryCard) ✓
- AC-10 (NBA unverändert) → alle Hook-Coats gated auf `isEuroIsolatedMode` ✓
- AC-11 (Migration) → Task 7 + Task 13 ✓
- AC-12 (FinancesWidget EUR) → Task 17 ✓

**Placeholder scan:** Alle Tasks haben echten Code; einzige `// TODO`-Hinweise sind explizite Follow-ups für späte Slices (T5/T17/T16/T7) und für den Competition-Resolver-Flag-Hook in AC-7 (justWonEndesa).

**Type consistency:**
- `computeAnnualBudget(team, ctx)` signature konsistent über Task 2/11/12 ✓
- `getMarketOffer(state, slot, history)` konsistent über Task 3/10 ✓
- `snapshot(team, ledger)` konsistent über Task 4/12 ✓
- `dekrementSponsorshipYears(state)` konsistent über Task 3/12 ✓
- `migrateAllEuroTeams(state)` konsistent über Task 7/13 ✓
- `SponsorshipOffer` Type konsistent (slot/sponsor/valuePerYear/years) ✓

**Known caveats:**
1. AC-7 (Endesa-Titel-In-Season-Event) hängt am Flag `team.justWonEndesa`, das Competition-Resolver (Slice 8c) setzen muss. Wenn das nicht greift, feuert das Event nicht. Empfehlung: separater 1-LOC PR im Competition-Resolver, der das Flag setzt — ist außerhalb dieser Tycoon-Slice.
2. `UPDATE_TEAM_TYCOON` Action ist in Task 10 vorgesehen. Falls zentraler Reducer das anders persistiert, anpassen.
3. Tier-Mapping in `SPAIN_CLUB_TIERS` nutzt englische/deutsche Klub-Namen — falls der Save echte spanische Strings hat (z. B. "Real Madrid Baloncesto"), unter Task 1 ggf. Alias-Map erweitern.
