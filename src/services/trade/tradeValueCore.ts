import type { LeagueStats, NBAPlayer } from '../../types';
import { getDisplayAge, getDisplayOverall, getDisplayPotential } from '../../store/playerRatingStore';
import { daysBetweenGameDates } from '../../utils/dateUtils';
import { isPostSigningMoratoriumActive, isTradeEligible } from '../../utils/signingMoratorium';
import { isFranchiseLifer } from '../../utils/playerTenure';

export type TeamMode = 'contend' | 'rebuild' | 'presti';

export function calcOvr2K(player: NBAPlayer): number {
  return getDisplayOverall(player);
}

export function calcPot2K(player: NBAPlayer, currentYear: number): number {
  return getDisplayPotential(player, currentYear);
}

export function isUntouchable(
  player: NBAPlayer,
  mode: TeamMode,
  currentYear: number,
  mvpRank?: Map<string, number>,
): boolean {
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
}

export function isYoungContenderCore(
  player: NBAPlayer,
  teamRoster: NBAPlayer[],
  mode: TeamMode,
  currentYear: number,
): boolean {
  if (mode !== 'contend') return false;
  const pot = calcPot2K(player, currentYear);
  if (pot < 90 || teamRoster.length === 0) return false;
  const sumAge = teamRoster.reduce((sum, rosterPlayer) => sum + getDisplayAge(rosterPlayer, currentYear), 0);
  return (sumAge / teamRoster.length) < 27;
}

export function isWalkingExpiring(
  player: NBAPlayer,
  currentYear: number,
  isPostDeadlinePreFA: boolean,
): boolean {
  if (!isPostDeadlinePreFA) return false;
  const exp = player.contract?.exp ?? currentYear + 5;
  return exp <= currentYear;
}

export function isRecentlySignedLocked(
  player: NBAPlayer,
  currentDate: string,
  leagueStats?: LeagueStats,
): boolean {
  if (!isPostSigningMoratoriumActive(leagueStats) || !currentDate) return false;
  const eligible = (player as any).tradeEligibleDate as string | undefined;
  if (eligible) return !isTradeEligible(player, currentDate, leagueStats);
  const signedDate = (player as any).signedDate as string | undefined;
  if (!signedDate) return false;
  const days = daysBetweenGameDates(signedDate, currentDate);
  return Number.isFinite(days) && days >= 0 && days < 30;
}

export function isOnTradingBlock(
  player: NBAPlayer,
  mode: TeamMode,
  currentYear: number,
  isPostDeadlinePreFA = false,
  mvpRank?: Map<string, number>,
): boolean {
  if (isUntouchable(player, mode, currentYear, mvpRank)) return false;
  if (isWalkingExpiring(player, currentYear, isPostDeadlinePreFA)) return false;
  const ovr = calcOvr2K(player);
  const age = getDisplayAge(player, currentYear);

  if (mode === 'contend') return ovr < 78 || ((player.contract?.exp ?? currentYear + 5) <= currentYear + 1);
  if (mode === 'rebuild' || mode === 'presti') return age >= 28 && ovr >= 75;
  return (player.contract?.amount ?? 0) > 15000 && ovr < 82;
}

export interface TVContext {
  leaguePerAvg: number;
  isRegularSeason: boolean;
  mvpRank?: Map<string, number>;
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
