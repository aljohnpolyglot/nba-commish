import { computeAnnualBudget } from '../src/services/tycoon/budgetEngine';
import { TIER_BASE } from '../src/services/tycoon/specs/spain';
import type { NBATeam } from '../src/types';
import type { TycoonState, TycoonTier } from '../src/types/tycoon';

function makeTeam(name: string, tier: TycoonTier, payrollEUR: number, players: number): NBATeam {
  const tierBase = TIER_BASE[tier];
  const t: any = {
    id: 1,
    tid: 1,
    name,
    region: name.split(' ')[0],
    players: Array.from({ length: players }, () => ({
      tid: 1,
      // contract.amount in BBGM-thousands (1000 = $1M / €1M)
      contract: { amount: (payrollEUR / players) / 1000, exp: 2027 }
    })),
    tycoon: {
      tier,
      sponsorships: {
        kit:     { sponsor: 'Sponsor A', valuePerYear: Math.round(tierBase.sponsorshipFloor.kit * 5), yearsRemaining: 3, signedYear: 2025 },
        sleeve:  { sponsor: 'Sponsor B', valuePerYear: Math.round(tierBase.sponsorshipFloor.sleeve * 1.7), yearsRemaining: 2, signedYear: 2025 },
        stadium: { sponsor: 'Sponsor C', valuePerYear: Math.round(tierBase.sponsorshipFloor.stadium * 1.3), yearsRemaining: 6, signedYear: 2025 },
      },
      facilities: {
        stadium: { level: 1, capacity: tierBase.stadiumCapacity },
        trainingCenter: { level: 1 },
        academy: { level: 1 },
      },
      ledgerHistory: [],
      cashOnHand: tierBase.startingCash,
      boardConfidence: 60,
      ffpRollingDeficit: 0,
    } as TycoonState,
  };
  return t as NBATeam;
}

const assert = (cond: boolean, msg: string) => {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
};

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

console.log('Real Madrid 2026:', JSON.stringify(realLedger, null, 2));
console.log('Burgos 2026:', JSON.stringify(burgosLedger, null, 2));

assert(realLedger.revenue.matchday > 15_000_000 && realLedger.revenue.matchday < 35_000_000,
  `Real matchday revenue plausible (got ${realLedger.revenue.matchday})`);
assert(realLedger.revenue.sponsorship > 18_000_000, `Real sponsorship > €18M (got ${realLedger.revenue.sponsorship})`);
assert(realLedger.expenses.wages === 35_000_000, `Real wages = €35M (got ${realLedger.expenses.wages})`);
assert(realLedger.profit > 5_000_000, `Real profit positive (got ${realLedger.profit})`);

assert(burgosLedger.revenue.matchday < 5_000_000, `Burgos matchday < €5M (got ${burgosLedger.revenue.matchday})`);
assert(burgosLedger.profit < 4_000_000, `Burgos profit modest (got ${burgosLedger.profit})`);

assert(realLedger.profit > burgosLedger.profit + 5_000_000, 'Spread Real ≫ Burgos profit');

console.log('\n✓ All budget assertions passed');

// ----- Ledger snapshot integration test -----
import { snapshot } from '../src/services/tycoon/ledgerEngine';

const startCash = real.tycoon!.cashOnHand;
snapshot(real, realLedger);
assert(real.tycoon!.ledgerHistory.length === 1, 'ledgerHistory has 1 entry after snapshot');
assert(real.tycoon!.cashOnHand === startCash + realLedger.profit, 'cashOnHand += profit');
assert(real.tycoon!.ffpRollingDeficit === Math.min(0, realLedger.profit), 'FFP recomputed');

for (let y = 0; y < 3; y++) {
  snapshot(burgos, { ...burgosLedger, year: 2025 + y, profit: -500_000, ffpDeficitContribution: -500_000 });
}
assert(burgos.tycoon!.ffpRollingDeficit === -1_500_000, `FFP 3y deficit = -€1.5M (got ${burgos.tycoon!.ffpRollingDeficit})`);
assert(burgos.tycoon!.ledgerHistory.length === 3, 'history grew to 3');

console.log('✓ Ledger snapshot assertions passed');
