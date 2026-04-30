import { NBATeam, NBAPlayer, TradeException, TransactionDto } from '../types';
import { getCapThresholds, contractToUSD } from './salaryUtils';

const TPE_TTL_DAYS = 365;

const addDaysISO = (iso: string, days: number): string => {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
};

/** Active = not yet expired AND amount > 0. */
export const getActiveTPEs = (team: NBATeam, currentDate: string): TradeException[] => {
  if (!team.tradeExceptions || team.tradeExceptions.length === 0) return [];
  const now = new Date(currentDate).getTime();
  return team.tradeExceptions.filter(t => t.amountUSD > 0 && new Date(t.expiresDate).getTime() > now);
};

export const getTotalActiveTPE = (team: NBATeam, currentDate: string): number =>
  getActiveTPEs(team, currentDate).reduce((s, t) => s + t.amountUSD, 0);

/** Largest active TPE on the team, in USD. TPEs cannot be combined, so only the
 *  single largest can absorb any given incoming contract. */
export const getLargestActiveTPE = (team: NBATeam, currentDate: string): TradeException | null => {
  const active = getActiveTPEs(team, currentDate);
  if (active.length === 0) return null;
  return active.reduce((max, t) => (t.amountUSD > max.amountUSD ? t : max), active[0]);
};

/** 2nd-apron gate: real CBA blocks teams above 2nd apron from using TPEs
 *  CREATED IN PRIOR seasons. Same-season TPEs are still usable. */
const isTpeUsableUnderApron = (
  tpe: TradeException,
  payrollUSD: number,
  leagueStats: {
    salaryCap: number;
    luxuryPayroll: number;
    firstApronPercentage?: number;
    secondApronPercentage?: number;
    luxuryTaxThresholdPercentage?: number;
    year?: number;
    apronsEnabled?: boolean;
    numberOfAprons?: number;
    restrictTPEProvenanceOver2ndApron?: boolean;
  },
): boolean => {
  if (leagueStats.apronsEnabled === false || leagueStats.restrictTPEProvenanceOver2ndApron === false) return true;
  if ((leagueStats.numberOfAprons ?? 2) < 2) return true;
  const thresholds = getCapThresholds(leagueStats);
  if (payrollUSD < thresholds.secondApron) return true;
  const currentYear = leagueStats.year ?? new Date().getFullYear();
  const vintage = tpe.vintage ?? tpe.sourceLeagueYear;
  const source = tpe.source ?? 'plain';
  return vintage >= currentYear && source === 'plain';
};

/** Can this team absorb `incomingSalaryUSD` using a single TPE?
 *  Returns the TPE that would cover it (largest fits best for big trades). */
export const findTPEForAbsorption = (
  team: NBATeam,
  incomingSalaryUSD: number,
  currentDate: string,
  payrollUSD: number,
  leagueStats: Parameters<typeof isTpeUsableUnderApron>[2],
): TradeException | null => {
  const active = getActiveTPEs(team, currentDate)
    .filter(t => isTpeUsableUnderApron(t, payrollUSD, leagueStats))
    .filter(t => t.amountUSD + 100_000 >= incomingSalaryUSD) // $100K NBA buffer
    .sort((a, b) => a.amountUSD - b.amountUSD); // smallest-fit first to preserve big TPEs
  return active[0] ?? null;
};

/** Remove a consumed TPE from a team. Returns updated team. */
export const consumeTPE = (team: NBATeam, tpeId: string): NBATeam => ({
  ...team,
  tradeExceptions: (team.tradeExceptions ?? []).filter(t => t.id !== tpeId),
});

/** Generate TPEs for both sides of a trade transaction. Only over-cap teams
 *  generate TPEs (under-cap teams just have cap room and don't need them).
 *  Each side gets one TPE per outgoing player — sized as the diff between
 *  what the team sent vs received, allocated to the largest outgoing player.
 *  Simplified vs real CBA but captures the spirit. */
export const generateTPEsFromTrade = (
  transaction: TransactionDto,
  teams: NBATeam[],
  players: NBAPlayer[],
  leagueStats: Parameters<typeof isTpeUsableUnderApron>[2],
  currentDate: string,
): NBATeam[] => {
  const teamIds = Object.keys(transaction.teams).map(Number);
  if (teamIds.length !== 2) return teams;
  const [tidA, tidB] = teamIds;
  const sentByA = transaction.teams[tidA].playersSent;
  const sentByB = transaction.teams[tidB].playersSent;
  const salaryAOut = sentByA.reduce((s, p) => s + contractToUSD(p.contract?.amount || 0), 0);
  const salaryBOut = sentByB.reduce((s, p) => s + contractToUSD(p.contract?.amount || 0), 0);
  const thresholds = getCapThresholds(leagueStats);
  const year = leagueStats.year ?? new Date().getFullYear();
  const expiresDate = addDaysISO(currentDate, TPE_TTL_DAYS);

  const tpeSource: TradeException['source'] = (transaction as any).isSignAndTrade
    ? 'sign-and-trade'
    : 'plain';

  const buildTPEsForTeam = (team: NBATeam, salaryOut: number, salaryIn: number, sentPlayers: NBAPlayer[]): TradeException[] => {
    if (salaryOut <= salaryIn) return [];
    const teamPayroll = players
      .filter(p => p.tid === team.id)
      .reduce((s, p) => s + contractToUSD(p.contract?.amount || 0), 0);
    if (teamPayroll < thresholds.salaryCap) return []; // under-cap teams don't get TPEs (they have cap space)
    const diff = salaryOut - salaryIn;
    // Allocate the diff across outgoing players, weighted by their salary.
    // One TPE per outgoing player, as the real CBA generates.
    const tpes: TradeException[] = [];
    for (const p of sentPlayers) {
      const pUSD = contractToUSD(p.contract?.amount || 0);
      if (pUSD <= 0) continue;
      const share = Math.round((pUSD / salaryOut) * diff);
      if (share <= 0) continue;
      tpes.push({
        id: `tpe-${team.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        amountUSD: share,
        createdDate: currentDate,
        expiresDate,
        sourcePlayerName: p.name,
        sourceLeagueYear: year,
        vintage: year,
        source: sentPlayers.length > 1 ? 'aggregation' : tpeSource,
      });
    }
    return tpes;
  };

  const teamA = teams.find(t => t.id === tidA);
  const teamB = teams.find(t => t.id === tidB);
  if (!teamA || !teamB) return teams;

  const newA = buildTPEsForTeam(teamA, salaryAOut, salaryBOut, sentByA);
  const newB = buildTPEsForTeam(teamB, salaryBOut, salaryAOut, sentByB);

  if (newA.length === 0 && newB.length === 0) return teams;

  return teams.map(t => {
    if (t.id === tidA && newA.length > 0) return { ...t, tradeExceptions: [...(t.tradeExceptions ?? []), ...newA] };
    if (t.id === tidB && newB.length > 0) return { ...t, tradeExceptions: [...(t.tradeExceptions ?? []), ...newB] };
    return t;
  });
};

/** Sweep: drop all expired TPEs across the league. Cheap to call on rollover. */
export const sweepExpiredTPEs = (teams: NBATeam[], currentDate: string): NBATeam[] => {
  const now = new Date(currentDate).getTime();
  return teams.map(t => {
    if (!t.tradeExceptions || t.tradeExceptions.length === 0) return t;
    const kept = t.tradeExceptions.filter(tpe => new Date(tpe.expiresDate).getTime() > now && tpe.amountUSD > 0);
    if (kept.length === t.tradeExceptions.length) return t;
    return { ...t, tradeExceptions: kept };
  });
};

/** TPE-aware salary match. If matching fails, see if either side has a TPE
 *  large enough to absorb the surplus the other side is sending.
 *  Salaries here are in BBGM thousands (matching isSalaryLegal's units). */
export const isSalaryLegalWithTPE = (
  salaryAK: number,
  salaryBK: number,
  tpeAUSD: number,
  tpeBUSD: number,
  enabled: boolean,
): { ok: boolean; absorbedBy?: 'A' | 'B' } => {
  // Standard 125% gate first
  if (salaryAK === 0 && salaryBK === 0) return { ok: true };
  if (salaryAK === 0 || salaryBK === 0) return { ok: true };
  const max = Math.max(salaryAK, salaryBK);
  const min = Math.min(salaryAK, salaryBK);
  if (max <= min * 1.25 + 100) return { ok: true };
  if (!enabled) return { ok: false };
  // Surplus = the receiving side getting too much
  if (salaryBK > salaryAK * 1.25 + 100) {
    // A is receiving B's bigger salary. A's TPE (USD) must cover the surplus
    const surplusUSD = (salaryBK - salaryAK) * 1000;
    if (tpeAUSD + 100_000 >= surplusUSD) return { ok: true, absorbedBy: 'A' };
  }
  if (salaryAK > salaryBK * 1.25 + 100) {
    const surplusUSD = (salaryAK - salaryBK) * 1000;
    if (tpeBUSD + 100_000 >= surplusUSD) return { ok: true, absorbedBy: 'B' };
  }
  return { ok: false };
};
