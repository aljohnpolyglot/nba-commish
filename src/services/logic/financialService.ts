import { Payslip, GameState } from '../../types';
import { getGamePhase, getLeagueCurrencyCode } from '../../utils/helpers';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';
import { getTeamCountry } from '../../utils/teamCountry';
import { getTeamStateIncomeTaxProfile } from '../gmCareer/stateIncomeTax';

export interface PaycheckContext {
    employer?: string;
    jurisdiction?: string;
    currency?: string;
    paySchedule?: 'monthly' | 'semi-monthly';
    active?: boolean;
    federalTaxRate?: number;
    stateTaxRate?: number;
    cityTaxRate?: number;
}

export function getPaycheckContext(state: GameState): PaycheckContext {
    const userTeam = state.userTeamId != null
        ? resolveAnyTeam(state.userTeamId, state.teams, state.nonNBATeams ?? [])
        : null;
    const euroCareer = state.leagueStats?.uiMode === 'euro_isolated';
    const fictional = state.leagueType === 'fictional';
    const competition = state.activeCompetitions?.find(entry => entry.id === state.euroPrimaryCompetitionId);
    const gmEmployment = state.gmCareer?.employment;
    const stateTax = state.gameMode === 'gm'
        ? getTeamStateIncomeTaxProfile(userTeam, gmEmployment?.annualSalary ?? state.salary)
        : undefined;
    const employer = state.gameMode === 'gm' && userTeam
        ? getTeamFullName(userTeam)
        : euroCareer
            ? competition?.displayName ?? 'European Basketball'
            : fictional
                ? state.leagueStats.leagueName ?? 'Association'
                : 'National Basketball Association';
    return {
        employer,
        jurisdiction: state.gameMode === 'gm'
            ? stateTax?.stateName ?? (euroCareer ? getTeamCountry(userTeam, state) || 'Club jurisdiction' : fictional ? 'Team jurisdiction' : 'Tax jurisdiction unavailable')
            : euroCareer
                ? getTeamCountry(userTeam, state) || 'Club jurisdiction'
                : fictional ? 'League Headquarters' : 'NY / NYC',
        currency: gmEmployment?.currency ?? getLeagueCurrencyCode(state.leagueStats),
        paySchedule: state.gameMode === 'gm' ? 'monthly' : 'semi-monthly',
        active: state.gameMode !== 'gm' || !gmEmployment || gmEmployment.status === 'active',
        federalTaxRate: state.gameMode === 'gm' ? 0.37 : undefined,
        stateTaxRate: state.gameMode === 'gm' ? stateTax?.effectiveRate ?? 0 : undefined,
        cityTaxRate: state.gameMode === 'gm' ? 0 : undefined,
    };
}

export function generatePaychecks(
    lastPayDateStr: string,
    currentDateStr: string,
    annualSalary: number,
    context: PaycheckContext = {},
): { newPayslips: Payslip[], newLastPayDate: string, totalNetPay: number } {
    const currentDate = new Date(currentDateStr);
    const savedPayDate = new Date(lastPayDateStr);
    if (context.active === false) {
        return { newPayslips: [], newLastPayDate: currentDate.toISOString(), totalNetPay: 0 };
    }
    const monthly = context.paySchedule === 'monthly';
    const previousScheduledPayday = (date: Date) => {
        const d = new Date(date);
        if (monthly) {
            if (d.getUTCDate() > 1) d.setUTCDate(1);
            else {
                d.setUTCMonth(d.getUTCMonth() - 1);
                d.setUTCDate(1);
            }
            return d;
        }
        const day = d.getUTCDate();
        if (day > 15) d.setUTCDate(15);
        else if (day > 1) d.setUTCDate(1);
        else {
            d.setUTCMonth(d.getUTCMonth() - 1);
            d.setUTCDate(15);
        }
        return d;
    };
    const lastPayDate = !Number.isFinite(savedPayDate.getTime()) || savedPayDate > currentDate
        ? previousScheduledPayday(currentDate)
        : savedPayDate;
    
    let newPayslips: Payslip[] = [];
    let totalNetPay = 0;
    let currentPayDate = new Date(lastPayDate);
    
    // Find the next payday after lastPayDate
    const getNextPayday = (date: Date) => {
        const d = new Date(date);
        if (monthly) {
            d.setUTCMonth(d.getUTCMonth() + 1);
            d.setUTCDate(1);
            return d;
        }
        if (d.getUTCDate() < 15) {
            d.setUTCDate(15);
        } else {
            d.setUTCMonth(d.getUTCMonth() + 1);
            d.setUTCDate(1);
        }
        return d;
    };

    let nextPayday = getNextPayday(currentPayDate);

    while (nextPayday <= currentDate) {
        // Calculate days paid
        const daysPaid = Math.round((nextPayday.getTime() - currentPayDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // Annual salary / 365 * daysPaid
        const grossPay = monthly ? annualSalary / 12 : (annualSalary / 365) * daysPaid;
        
        // Tax rates
        const federalTaxRate = context.federalTaxRate ?? 0.37;
        const stateTaxRate = context.stateTaxRate ?? 0.109;
        const cityTaxRate = context.cityTaxRate ?? 0.03876;
        
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
            daysPaid,
            employer: context.employer,
            jurisdiction: context.jurisdiction,
            currency: context.currency,
            paySchedule: context.paySchedule ?? 'semi-monthly',
            federalTaxRate,
            stateTaxRate,
            cityTaxRate,
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

export function calculateAnnualLeagueOperatingSurplus(state: GameState): number {
  const annualRevMillions = state.leagueStats.mediaRights?.totalRev
    ? state.leagueStats.mediaRights.totalRev * 1000  // e.g. 15.7B → 15700M
    : state.leagueStats.revenue || 6900;             // base fallback
  const surplusRate = Math.max(0, Math.min(1, state.leagueStats.leagueOperatingSurplusRate ?? 0.0735));
  return annualRevMillions * surplusRate;
}

/** Daily league-funds tick in Millions, using net operating surplus rather than gross revenue. */
export function calculateDailyLeagueFunds(state: GameState): number {
  // Weighted average multiplier across the approximate season calendar
  // (precomputed so we don't re-sum every tick):
  //   Preseason 21d×0.25 + OpeningWeek 7d×1.4 + RegEarly 61d×0.8 + RegMid 45d×0.9
  //   + AllStar 6d×1.3 + TradeD 1d×0.9 + RegLate 50d×1.0 + PlayIn 4d×1.4
  //   + R1 16d×1.6 + R2 14d×2.0 + CF 10d×2.5 + Finals 14d×3.5
  //   + Draft 2d×1.2 + OffSeason 54d×0.15 = 365d, totalWeight ≈ 366.4 → avgMult ≈ 1.004
  const AVG_WEIGHT = 366.4 / 365;
  const baseDailySurplus = calculateAnnualLeagueOperatingSurplus(state) / 365;

  const phase: string = getGamePhase(state.date, state.leagueStats);
  const multiplier = PHASE_REVENUE_WEIGHTS[phase] ?? 1.0;

  return (baseDailySurplus * multiplier) / AVG_WEIGHT;
}
