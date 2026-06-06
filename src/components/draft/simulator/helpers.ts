// Shared helpers für DraftSimulatorView + Sub-Komponenten.
// Extracted aus DraftSimulatorView.tsx 2026-05-10.

import { computeRookieSalaryUSD } from '../../../utils/rookieContractUtils';
import { getLsYear } from '../../../utils/leagueYear';

export const MAX_DRAFT_POOL_SIZE = 100;

export const POSITIONS = ['ALL', 'PG', 'SG', 'SF', 'PF', 'C'];

/** Parse "2015 Round 2, Pick 5, Philadelphia Sixers" → { year, round, pick, team } */
export function parseBioDraftStr(s: string | undefined): { year: number; round: number; pick: number; team: string } | null {
  if (!s || s === 'Undrafted' || s === 'N/A' || s === '-') return null;
  const m = s.match(/(\d{4})\s+Round\s+(\d+)[,\s]+Pick\s+(\d+)[,\s]+(.+)/i);
  if (!m) return null;
  return { year: parseInt(m[1]), round: parseInt(m[2]), pick: parseInt(m[3]), team: m[4].trim() };
}

export const BIO_LEAGUE_MAP: Record<string, string> = {
  Euroleague: 'Euroleague',
  'B-League': 'B-League',
  'G-League': 'G-League',
  Endesa: 'Endesa',
  'China CBA': 'China CBA',
  'NBL Australia': 'NBL Australia',
};

export const getOrdinalSuffix = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};

/** Pure function: build tid/status/draft/contract fields for one drafted player.
 *  Used by both immediate per-pick commits and finalizeDraft. */
export function computeDraftPickFields(pickSlot: number, team: any, ls: any) {
  if (!team) return null;
  const teamId = Number(team.id ?? team.tid);
  if (!Number.isFinite(teamId)) return null;
  const season: number = getLsYear({ leagueStats: ls } as any);
  const pbaMode = ls?.uiMode === 'pba_isolated';
  const roundSize = pbaMode ? (Number((team as any)._roundSize) || 12) : 30;
  const round = pbaMode ? ((team as any)._round ?? ((team as any)._r2 ? 2 : 1)) : (pickSlot <= 30 ? 1 : 2);
  const pickInRound = pickSlot - ((round - 1) * roundSize);
  const guaranteedYrs: number = (ls as any).rookieContractLength ?? 2;
  const teamOptEnabled: boolean = (ls as any).rookieTeamOptionsEnabled ?? true;
  const teamOptYears: number = (ls as any).rookieTeamOptionYears ?? 2;
  const restrictedFA: boolean = (ls as any).rookieRestrictedFreeAgentEligibility ?? true;

  const salaryAmtUSD = computeRookieSalaryUSD(pickSlot, ls, roundSize);

  const baseYrs = round === 1 ? guaranteedYrs : 2;
  const optionYrs = (round === 1 && teamOptEnabled) ? teamOptYears : 0;

  const r2NonGuaranteed = round >= 2 && ((ls as any)?.r2ContractsNonGuaranteed ?? true);

  // Seed per-season salary rows so PlayerBioContractTab can render every rookie
  // year including the base years that precede the current season. Without this,
  // `contractYears` is empty → Path B rendering loops from currentYear forward,
  // silently dropping prior rookie seasons. 5% annual escalator mirrors
  // annualRaise() in PlayerBioContractTab / ContractTimeline.
  const totalYrs = baseYrs + optionYrs;
  const contractYears = Array.from({ length: totalYrs }, (_, i) => {
    const yr = season + i;
    return {
      season: `${yr}-${String(yr + 1).slice(-2)}`,
      guaranteed: Math.round(salaryAmtUSD * Math.pow(1.05, i)),
      option: i >= baseYrs ? 'Team' : '',
    };
  });

  return {
    tid: teamId,
    status: pbaMode ? 'PBA' as const : 'Active' as const,
    ...(r2NonGuaranteed && { nonGuaranteed: true }),
    draft: { round, pick: pickInRound, year: season, tid: teamId, originalTid: (team as any)._originalTid ?? teamId },
    contract: {
      amount: Math.round(salaryAmtUSD / 1_000),
      exp: season + baseYrs + optionYrs,
      ...(optionYrs > 0 && { hasTeamOption: true, teamOptionExp: season + baseYrs + 1 }),
      ...(round === 1 && restrictedFA && { restrictedFA: true }),
      rookie: true,
    },
    contractYears,
  };
}
