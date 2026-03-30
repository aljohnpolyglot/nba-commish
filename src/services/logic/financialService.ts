import { Payslip, GameState } from '../../types';
import { getGamePhase } from '../../utils/helpers';

export function generatePaychecks(
    lastPayDateStr: string,
    currentDateStr: string,
    annualSalary: number
): { newPayslips: Payslip[], newLastPayDate: string, totalNetPay: number } {
    const lastPayDate = new Date(lastPayDateStr);
    const currentDate = new Date(currentDateStr);
    
    let newPayslips: Payslip[] = [];
    let totalNetPay = 0;
    let currentPayDate = new Date(lastPayDate);
    
    // Find the next payday after lastPayDate
    const getNextPayday = (date: Date) => {
        const d = new Date(date);
        if (d.getDate() < 15) {
            d.setDate(15);
        } else {
            d.setMonth(d.getMonth() + 1);
            d.setDate(1);
        }
        return d;
    };

    let nextPayday = getNextPayday(currentPayDate);

    while (nextPayday <= currentDate) {
        // Calculate days paid
        const daysPaid = Math.round((nextPayday.getTime() - currentPayDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // Annual salary / 365 * daysPaid
        const grossPay = (annualSalary / 365) * daysPaid;
        
        // Tax rates
        const federalTaxRate = 0.37;
        const stateTaxRate = 0.109;
        const cityTaxRate = 0.03876;
        
        const federalTax = grossPay * federalTaxRate;
        const stateTax = grossPay * stateTaxRate;
        const cityTax = grossPay * cityTaxRate;
        const netPay = grossPay - federalTax - stateTax - cityTax;

        const payslip: Payslip = {
            id: `payslip-${nextPayday.getTime()}`,
            date: nextPayday.toISOString(),
            payPeriod: `${currentPayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${nextPayday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
            grossPay,
            federalTax,
            stateTax,
            cityTax,
            netPay,
            daysPaid
        };
        
        newPayslips.push(payslip);
        totalNetPay += netPay;
        
        currentPayDate = new Date(nextPayday);
        nextPayday = getNextPayday(currentPayDate);
    }

    return {
        newPayslips,
        newLastPayDate: currentPayDate.toISOString(),
        totalNetPay
    };
}

// Phase → daily revenue multiplier.
// Weights are relative to a "1.0" regular-season day.
// Total weighted season days ≈ 365 so aggregate revenue is preserved.
const PHASE_REVENUE_WEIGHTS: Record<string, number> = {
  'Preseason':              0.25,
  'Opening Week':           1.40,
  'Regular Season (Early)': 0.80,
  'Regular Season (Mid)':   0.90,
  'All-Star Break':         1.30,
  'Trade Deadline':         0.90,
  'Regular Season (Late)':  1.00,
  'Play-In Tournament':     1.40,
  'Playoffs (Round 1)':     1.60,
  'Playoffs (Round 2)':     2.00,
  'Conference Finals':      2.50,
  'NBA Finals':             3.50,
  'NBA Draft':              1.20,
  'Off-Season':             0.15,
};

/** Daily league-funds tick in Millions, phase-weighted so the annual total is preserved. */
export function calculateDailyLeagueFunds(state: GameState): number {
  const annualRevMillions = state.leagueStats.mediaRights?.totalRev
    ? state.leagueStats.mediaRights.totalRev * 1000  // e.g. 15.7B → 15700M
    : state.leagueStats.revenue || 6900;             // base fallback

  // Weighted average multiplier across the approximate season calendar
  // (precomputed so we don't re-sum every tick):
  //   Preseason 21d×0.25 + OpeningWeek 7d×1.4 + RegEarly 61d×0.8 + RegMid 45d×0.9
  //   + AllStar 6d×1.3 + TradeD 1d×0.9 + RegLate 50d×1.0 + PlayIn 4d×1.4
  //   + R1 16d×1.6 + R2 14d×2.0 + CF 10d×2.5 + Finals 14d×3.5
  //   + Draft 2d×1.2 + OffSeason 54d×0.15 = 365d, totalWeight ≈ 366.4 → avgMult ≈ 1.004
  const AVG_WEIGHT = 366.4 / 365;
  const baseDailyRev = annualRevMillions / 365;

  const phase: string = getGamePhase(state.date);
  const multiplier = PHASE_REVENUE_WEIGHTS[phase] ?? 1.0;

  return (baseDailyRev * multiplier) / AVG_WEIGHT;
}
