import type { LeagueStats, NBAPlayer } from '../../types';
import { getDisplayAge, getDisplayOverall, getDisplayPotential, type DisplayPotentialOptions } from '../../store/playerRatingStore';
import { daysBetweenGameDates } from '../../utils/dateUtils';
import { isPostSigningMoratoriumActive, isTradeEligible } from '../../utils/signingMoratorium';
import { getCurrentTeamRegularSeasonYears, isFranchiseLifer } from '../../utils/playerTenure';
import { hasExplicitPbaImportProvenance } from '../pba/importManager';
import { incrementSimulationPerfCounter } from '../simulation/simulationPerfDebug';
import type { TradeComputationMemo } from './tradeComputationMemo';

export type TeamMode = 'contend' | 'rebuild' | 'presti';

function memoEligibility(
  memo: TradeComputationMemo | undefined,
  key: string,
  calculate: () => boolean,
): boolean {
  if (!memo) {
    incrementSimulationPerfCounter('trade.eligibilityCalculations');
    return calculate();
  }
  if (memo.eligibility.has(key)) {
    incrementSimulationPerfCounter('trade.eligibilityCacheHits');
    return memo.eligibility.get(key)!;
  }
  incrementSimulationPerfCounter('trade.eligibilityCacheMisses');
  incrementSimulationPerfCounter('trade.eligibilityCalculations');
  const value = calculate();
  memo.eligibility.set(key, value);
  return value;
}

function memoRosterEligibility(
  memo: TradeComputationMemo | undefined,
  roster: NBAPlayer[],
  key: string,
  calculate: () => boolean,
): boolean {
  if (!memo) {
    incrementSimulationPerfCounter('trade.eligibilityCalculations');
    return calculate();
  }
  let rosterMemo = memo.rosterEligibility.get(roster);
  if (!rosterMemo) {
    rosterMemo = new Map();
    memo.rosterEligibility.set(roster, rosterMemo);
  }
  if (rosterMemo.has(key)) {
    incrementSimulationPerfCounter('trade.eligibilityCacheHits');
    return rosterMemo.get(key)!;
  }
  incrementSimulationPerfCounter('trade.eligibilityCacheMisses');
  incrementSimulationPerfCounter('trade.eligibilityCalculations');
  const value = calculate();
  rosterMemo.set(key, value);
  return value;
}

export function calcOvr2K(player: NBAPlayer): number {
  return getDisplayOverall(player);
}

export function isPbaTradeValuePlayer(player: NBAPlayer): boolean {
  const tid = Number(player.tid);
  const draftTuneVersion = (player as NBAPlayer & { pbaDraftTunedVersion?: unknown }).pbaDraftTunedVersion;
  return player.status === 'PBA'
    || String(draftTuneVersion ?? '').startsWith('pba-draft-')
    || (Number.isFinite(tid) && tid >= 2000 && tid < 3000);
}

export function calcPot2K(player: NBAPlayer, currentYear: number, options?: DisplayPotentialOptions): number {
  const effectiveOptions = isPbaTradeValuePlayer(player) ? { ...options, floorAtEstimated: false } : options;
  return getDisplayPotential(player, currentYear, undefined, effectiveOptions);
}

export function buildLeagueRelativeTradePercentiles(players: NBAPlayer[], currentYear: number): Map<string, number> {
  const ranked = players
    .filter(player => isPbaTradeValuePlayer(player) && !hasExplicitPbaImportProvenance(player))
    .map(player => ({
      id: player.internalId,
      score: calcOvr2K(player) * 0.7 + calcPot2K(player, currentYear) * 0.3,
    }))
    .sort((left, right) => left.score - right.score);
  const result = new Map<string, number>();
  if (ranked.length === 0) return result;
  if (ranked.length === 1) {
    result.set(ranked[0].id, 1);
    return result;
  }
  for (let start = 0; start < ranked.length;) {
    let end = start;
    while (end + 1 < ranked.length && Math.abs(ranked[end + 1].score - ranked[start].score) < 0.001) end++;
    const percentile = ((start + end) / 2) / (ranked.length - 1);
    for (let index = start; index <= end; index++) result.set(ranked[index].id, percentile);
    start = end + 1;
  }
  return result;
}

export function getLeagueRelativeTradeValueFloor(percentile: number): number {
  if (!Number.isFinite(percentile) || percentile < 0.5) return 0;
  const topHalfPosition = Math.min(1, Math.max(0, (percentile - 0.5) / 0.5));
  return Number((1 + 31 * topHalfPosition * topHalfPosition).toFixed(2));
}

export function isUntouchable(
  player: NBAPlayer,
  mode: TeamMode,
  currentYear: number,
  mvpRank?: Map<string, number>,
  memo?: TradeComputationMemo,
): boolean {
  return memoEligibility(memo, `untouchable|${player.internalId}|${mode}|${currentYear}`, () => {
    const ovr = calcOvr2K(player);
    const pot = calcPot2K(player, currentYear);
    const age = getDisplayAge(player, currentYear);

    if (isFranchiseLifer(player)) return true;

    const rank = mvpRank?.get(player.internalId);
    if (rank !== undefined) {
      if (rank <= 10) return true;
      if (mode === 'contend' && rank <= 30) return true;
    }

    if (mode === 'contend') return ovr >= 82;
    if (mode === 'rebuild' || mode === 'presti') return age < 25 && pot >= 85;
    return ovr >= 85 || (age < 24 && pot >= 88);
  });
}

export function isYoungContenderCore(
  player: NBAPlayer,
  teamRoster: NBAPlayer[],
  mode: TeamMode,
  currentYear: number,
  memo?: TradeComputationMemo,
): boolean {
  return memoRosterEligibility(memo, teamRoster, `young-core|${player.internalId}|${mode}|${currentYear}`, () => {
    if (mode !== 'contend') return false;
    const pot = calcPot2K(player, currentYear);
    if (pot < 90 || teamRoster.length === 0) return false;
    const sumAge = teamRoster.reduce((sum, rosterPlayer) => sum + getDisplayAge(rosterPlayer, currentYear), 0);
    return (sumAge / teamRoster.length) < 27;
  });
}

export function isContenderChampionshipCore(
  player: NBAPlayer,
  teamRoster: NBAPlayer[],
  mode: TeamMode,
  currentYear: number,
  mvpRank?: Map<string, number>,
  memo?: TradeComputationMemo,
): boolean {
  return memoRosterEligibility(memo, teamRoster, `championship-core|${player.internalId}|${mode}|${currentYear}`, () => {
    if (mode !== 'contend') return false;
    if (player.tid < 0) return false;

    const yearsWithTeam = getCurrentTeamRegularSeasonYears(player);
    if (yearsWithTeam < 5) return false;

    const ovr = calcOvr2K(player);
    const pot = calcPot2K(player, currentYear);
    if (ovr < 72 && pot < 78) return false;

    const sameTeamRoster = teamRoster
      .filter(rosterPlayer => rosterPlayer.tid === player.tid)
      .map(rosterPlayer => ({
        player: rosterPlayer,
        ovr: calcOvr2K(rosterPlayer),
        pot: calcPot2K(rosterPlayer, currentYear),
        years: getCurrentTeamRegularSeasonYears(rosterPlayer),
      }))
      .sort((a, b) => {
        const rankA = a.ovr * 2 + a.pot * 0.35 + Math.min(10, a.years) * 0.5;
        const rankB = b.ovr * 2 + b.pot * 0.35 + Math.min(10, b.years) * 0.5;
        return rankB - rankA;
      });

    const coreRank = sameTeamRoster.findIndex(entry => entry.player.internalId === player.internalId);
    const coreLimit = sameTeamRoster.length >= 12 ? 5 : 4;
    return coreRank >= 0 && coreRank < coreLimit;
  });
}

export function isWalkingExpiring(
  player: NBAPlayer,
  currentYear: number,
  isPostDeadlinePreFA: boolean,
  credibleResignExpiringIds?: Set<string>,
  memo?: TradeComputationMemo,
): boolean {
  return memoEligibility(memo, `walking|${player.internalId}|${currentYear}|${isPostDeadlinePreFA ? 1 : 0}`, () => {
    if (!isPostDeadlinePreFA) return false;
    const exp = player.contract?.exp ?? currentYear + 5;
    if (exp <= currentYear && credibleResignExpiringIds?.has(player.internalId)) return false;
    return exp <= currentYear;
  });
}

export function isRecentlySignedLocked(
  player: NBAPlayer,
  currentDate: string,
  leagueStats?: LeagueStats,
  memo?: TradeComputationMemo,
): boolean {
  return memoEligibility(memo, `recently-signed|${player.internalId}|${currentDate}`, () => {
    if (!isPostSigningMoratoriumActive(leagueStats) || !currentDate) return false;
    const eligible = (player as any).tradeEligibleDate as string | undefined;
    if (eligible) return !isTradeEligible(player, currentDate, leagueStats);
    const signedDate = (player as any).signedDate as string | undefined;
    if (!signedDate) return false;
    const days = daysBetweenGameDates(signedDate, currentDate);
    return Number.isFinite(days) && days >= 0 && days < 30;
  });
}

export function isOnTradingBlock(
  player: NBAPlayer,
  mode: TeamMode,
  currentYear: number,
  isPostDeadlinePreFA = false,
  mvpRank?: Map<string, number>,
  memo?: TradeComputationMemo,
): boolean {
  return memoEligibility(memo, `trading-block|${player.internalId}|${mode}|${currentYear}|${isPostDeadlinePreFA ? 1 : 0}`, () => {
    if (isUntouchable(player, mode, currentYear, mvpRank, memo)) return false;
    if (isWalkingExpiring(player, currentYear, isPostDeadlinePreFA, undefined, memo)) return false;
    const ovr = calcOvr2K(player);
    const age = getDisplayAge(player, currentYear);

    if (mode === 'contend') return ovr < 78 || ((player.contract?.exp ?? currentYear + 5) <= currentYear + 1);
    if (mode === 'rebuild' || mode === 'presti') return age >= 28 && ovr >= 75;
    return (player.contract?.amount ?? 0) > 15000 && ovr < 82;
  });
}

export interface TVContext {
  leaguePerAvg: number;
  isRegularSeason: boolean;
  mvpRank?: Map<string, number>;
  credibleResignExpiringIds?: Set<string>;
  leaguePlayerPercentile?: Map<string, number>;
  memo?: TradeComputationMemo;
}

export function computeLeaguePerAvg(players: NBAPlayer[], currentYear: number): number {
  let perTimesMin = 0;
  let totalMin = 0;
  for (const player of players) {
    if (player.tid < 0) continue;
    const stats = player.stats?.filter((stat: any) => stat.season === currentYear && !stat.playoffs && (stat.gp ?? 0) > 0) ?? [];
    if (stats.length === 0) continue;
    const gp = stats.reduce((sum: number, stat: any) => sum + (stat.gp ?? 0), 0);
    const minSum = stats.reduce((sum: number, stat: any) => sum + (stat.min ?? 0), 0);
    if (gp <= 10 || (gp > 0 && minSum / gp <= 12)) continue;
    perTimesMin += stats.reduce((sum: number, stat: any) => sum + (stat.per ?? 0) * (stat.min ?? 0), 0);
    totalMin += minSum;
  }
  return totalMin > 0 ? perTimesMin / totalMin : 15;
}
