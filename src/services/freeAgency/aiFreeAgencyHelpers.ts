import type { GameState, NBAPlayer, NBATeam } from '../../types';
import { INITIAL_LEAGUE_STATS } from '../../constants';
import {
  computeContractOffer,
  contractToUSD,
  getCapThresholds,
  getContractLimits,
  getMLEAvailability,
  getTeamCapProfileFromState,
  getTeamDeadMoneyForSeason,
  seasonLabelToYear,
} from '../../utils/salaryUtils';
import type { MleType } from '../../utils/salaryUtils';
import { convertTo2KRating } from '../../utils/helpers';
import { getDisplayAge, getDisplayOverall } from '../../store/playerRatingStore';
import { daysBetweenGameDates, getGameDateParts } from '../../utils/dateUtils';
import { calcPot2K } from '../trade/tradeValueEngine';
import { clampSpendOffer, getGMAttributes } from '../staff/gmAttributes';
import type { TeamStrategyProfile } from '../../utils/teamStrategy';

const RECENT_SIGNING_GRACE_DAYS = 60;
const MIN_SALARY_FALLBACK_M = 1.273;

export function withNbaBackgroundEconomy(state: GameState): GameState {
  if ((state.leagueStats as any)?.uiMode !== 'pba_isolated') return state;
  return {
    ...state,
    leagueStats: {
      ...state.leagueStats,
      uiMode: 'nba',
      currency: 'USD',
      salaryCap: INITIAL_LEAGUE_STATS.salaryCap,
      luxuryPayroll: INITIAL_LEAGUE_STATS.luxuryPayroll,
      luxuryTaxThresholdPercentage: INITIAL_LEAGUE_STATS.luxuryTaxThresholdPercentage,
      minimumPayrollPercentage: INITIAL_LEAGUE_STATS.minimumPayrollPercentage,
      apronsEnabled: INITIAL_LEAGUE_STATS.apronsEnabled,
      numberOfAprons: INITIAL_LEAGUE_STATS.numberOfAprons,
      firstApronPercentage: INITIAL_LEAGUE_STATS.firstApronPercentage,
      secondApronPercentage: INITIAL_LEAGUE_STATS.secondApronPercentage,
      salaryCapEnabled: INITIAL_LEAGUE_STATS.salaryCapEnabled,
      salaryCapType: INITIAL_LEAGUE_STATS.salaryCapType,
      minContractType: INITIAL_LEAGUE_STATS.minContractType,
      minContractStaticAmount: INITIAL_LEAGUE_STATS.minContractStaticAmount,
      maxContractType: INITIAL_LEAGUE_STATS.maxContractType,
      maxContractStaticPercentage: INITIAL_LEAGUE_STATS.maxContractStaticPercentage,
      minContractLength: INITIAL_LEAGUE_STATS.minContractLength,
      maxContractLengthStandard: INITIAL_LEAGUE_STATS.maxContractLengthStandard,
      maxContractLengthBird: INITIAL_LEAGUE_STATS.maxContractLengthBird,
      rookieExtEnabled: (INITIAL_LEAGUE_STATS as any).rookieExtEnabled,
      rookieExtPct: (INITIAL_LEAGUE_STATS as any).rookieExtPct,
      rookieExtRosePct: (INITIAL_LEAGUE_STATS as any).rookieExtRosePct,
      supermaxEnabled: INITIAL_LEAGUE_STATS.supermaxEnabled,
      supermaxPercentage: INITIAL_LEAGUE_STATS.supermaxPercentage,
      maxPlayersPerTeam: INITIAL_LEAGUE_STATS.maxPlayersPerTeam,
      maxStandardPlayersPerTeam: INITIAL_LEAGUE_STATS.maxStandardPlayersPerTeam,
      maxTwoWayPlayersPerTeam: INITIAL_LEAGUE_STATS.maxTwoWayPlayersPerTeam,
      maxTrainingCampRoster: INITIAL_LEAGUE_STATS.maxTrainingCampRoster,
      twoWayContractsEnabled: INITIAL_LEAGUE_STATS.twoWayContractsEnabled,
      nonGuaranteedContractsEnabled: INITIAL_LEAGUE_STATS.nonGuaranteedContractsEnabled,
      mleEnabled: (INITIAL_LEAGUE_STATS as any).mleEnabled,
      roomMlePercentage: (INITIAL_LEAGUE_STATS as any).roomMlePercentage,
      nonTaxpayerMlePercentage: (INITIAL_LEAGUE_STATS as any).nonTaxpayerMlePercentage,
      taxpayerMlePercentage: (INITIAL_LEAGUE_STATS as any).taxpayerMlePercentage,
      mleUsage: (state.leagueStats as any).backgroundNbaMleUsage ?? (state.leagueStats as any).mleUsage ?? {},
    } as GameState['leagueStats'],
  };
}

interface DateClampedOffer {
  salaryUSD: number;
  years: number;
  hasPlayerOption: boolean;
}

interface ScoreFreeAgentFitArgs {
  player: NBAPlayer;
  team: NBATeam;
  state: GameState;
  strategy: TeamStrategyProfile;
  offer: { salaryUSD: number; years: number; hasPlayerOption: boolean };
  effectiveCapSpace: number;
  effectivePayroll?: number;
  thresholds?: { firstApron: number; secondApron: number; salaryCap: number };
  mood: number;
}

export function defaultMaxRoster(leagueStats: { uiMode?: string | null } | undefined): number {
  if (leagueStats?.uiMode === 'pba_isolated') return 18;
  return leagueStats?.uiMode === 'euro_isolated' ? 12 : 15;
}

export function getActiveFAMarketPlayerIds(state: GameState): Set<string> {
  return new Set(
    (state.faBidding?.markets ?? [])
      .filter(m => !m.resolved)
      .map(m => m.playerId),
  );
}

export function getMinSalaryUSD(leagueStats: any): number {
  return ((leagueStats?.minContractStaticAmount as number | undefined) ?? MIN_SALARY_FALLBACK_M) * 1_000_000;
}

export function clampOfferForDate(
  offer: { salaryUSD: number; years: number; hasPlayerOption: boolean },
  stateDate: string | undefined,
  currentYear: number,
  leagueStats: any,
  playerK2?: number,
): DateClampedOffer {
  if (!stateDate) return offer;
  const { month: m, day } = getGameDateParts(stateDate);
  const isOffseason = (m >= 7 && m <= 9) || (m === 10 && day <= 21);
  if (isOffseason) return offer;

  const isAfterJan1 = m >= 1 && m <= 6;
  const isStar = (playerK2 ?? 0) >= 80;
  const yearsCap = isStar && !isAfterJan1 ? 2 : 1;
  const finalYears = Math.min(offer.years, yearsCap);

  let decay = 1.0;
  if (m === 2 || m === 3 || m === 4 || m === 5 || m === 6) decay = 0.20;
  else if (m === 1) decay = 0.35;
  else if (m === 11 || m === 12 || (m === 10 && day >= 22)) decay = 0.55;

  const minSalaryUSD = getMinSalaryUSD(leagueStats);
  const finalSalary = Math.max(minSalaryUSD, Math.round(offer.salaryUSD * decay));

  return { salaryUSD: finalSalary, years: finalYears, hasPlayerOption: offer.hasPlayerOption };
}

export function getLoyalPriorTid(player: NBAPlayer): number {
  const txns: Array<{ season: number; tid: number }> = (player as any).transactions ?? [];
  if (txns.length > 0) {
    const nbaT = [...txns]
      .sort((a, b) => b.season - a.season)
      .find(t => t.tid >= 0 && t.tid <= 29);
    if (nbaT) return nbaT.tid;
  }
  const stats: Array<{ season?: number; tid?: number; gp?: number; playoffs?: boolean }> = (player as any).stats ?? [];
  const nbaStats = stats
    .filter(s => !s.playoffs && (s.gp ?? 0) > 0 && (s.tid ?? -1) >= 0 && (s.tid ?? -1) <= 29)
    .sort((a, b) => (b.season ?? 0) - (a.season ?? 0));
  return nbaStats.length > 0 ? (nbaStats[0].tid ?? -1) : -1;
}

export function isRecentWaiverByTeam(player: NBAPlayer, teamId: number, currentDate: string | undefined): boolean {
  const waivedBy = (player as any).recentlyWaivedBy;
  const waivedDate = (player as any).recentlyWaivedDate;
  if (waivedBy !== teamId || !waivedDate || !currentDate) return false;
  const days = daysBetweenGameDates(waivedDate, currentDate);
  return days >= 0 && days < 90;
}

export function isLoyalBlocked(player: NBAPlayer, teamId: number, currentYear: number): boolean {
  const traits: string[] = (player as any).moodTraits ?? [];
  if (!traits.includes('LOYAL')) return false;
  if ((player as any).status === 'Retired') return false;
  if ((player as any).diedYear) return false;

  const age = getDisplayAge(player, currentYear);
  if (age < 30) return false;

  const yearsOfService = ((player as any).stats ?? [])
    .filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
  if (yearsOfService < 3) return false;

  const priorTid = getLoyalPriorTid(player);
  if (priorTid < 0) return false;

  return teamId !== priorTid;
}

export function isPlayerRFA(player: NBAPlayer): boolean {
  const contract = (player as any).contract;
  if (contract?.isRestrictedFA || contract?.restrictedFA) return true;
  return !!(contract?.rookie && (player as any).draft?.round === 1);
}

export function rollPriorTeamMatch(player: NBAPlayer, currentYear: number): boolean {
  const rating = player.ratings?.[player.ratings.length - 1];
  const k2 = convertTo2KRating(player.overallRating ?? rating?.ovr ?? 50, rating?.hgt ?? 50, rating?.tp ?? 50);
  const matchPct = k2 >= 85 ? 0.85 : k2 >= 80 ? 0.70 : 0.55;
  let h = 0;
  const seed = `rfa_match_round_${player.internalId}_${currentYear}`;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  const roll = ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
  return roll < matchPct;
}

export function playerMoodForTeam(player: NBAPlayer, team: NBATeam, state: GameState): number {
  let mood = 1.0;

  const wins = (team as any).wins ?? 0;
  const losses = (team as any).losses ?? 0;
  const winPct = (wins + losses) > 0 ? wins / (wins + losses) : 0.5;

  if (winPct >= 0.6) mood += 0.3;
  else if (winPct < 0.35) mood -= 0.3;

  const teamPlayers = state.players.filter(p => p.tid === team.id);
  const posCount = teamPlayers.filter(p =>
    (p.pos ?? '').includes(player.pos ?? '') && (p.overallRating ?? 0) >= (player.overallRating ?? 0)
  ).length;

  if (posCount === 0) mood += 0.3;
  else if (posCount >= 3) mood -= 0.2;

  const pop = (team as any).pop ?? 0;
  if (pop > 5) mood += 0.2;

  return Math.max(0, Math.min(2, mood));
}

export function getK2Ovr(player: NBAPlayer): number {
  return getDisplayOverall(player);
}

export function isTwoWayOriginEligible(player: NBAPlayer): boolean {
  const country = String((player as any).born?.country ?? (player as any).born?.loc ?? '').trim().toLowerCase();
  if (['united states', 'usa', 'u.s.a.', 'us', 'canada'].includes(country)) return true;
  if ((player as any).draft?.lottery === true) return true;
  const hasNbaStats = ((player as any).stats ?? []).some((s: any) =>
    typeof s.tid === 'number' && s.tid >= 0 && s.tid <= 29 && (s.gp ?? 0) > 0
  );
  if (hasNbaStats) return true;
  return getK2Ovr(player) >= 75;
}

export function playerAge(player: NBAPlayer, currentYear: number): number {
  return getDisplayAge(player, currentYear);
}

export function sharesPosition(a?: string, b?: string): boolean {
  const left = (a ?? '').toUpperCase();
  const right = (b ?? '').toUpperCase();
  if (!left || !right) return false;
  if (left === right) return true;
  return left.split('').some(ch => right.includes(ch));
}

function positionNeedScore(teamPlayers: NBAPlayer[], candidate: NBAPlayer): number {
  const strongerAtPos = teamPlayers.filter(player =>
    sharesPosition(player.pos, candidate.pos) &&
    (player.overallRating ?? 0) >= (candidate.overallRating ?? 0)
  ).length;
  if (strongerAtPos === 0) return 2.5;
  if (strongerAtPos === 1) return 1.5;
  if (strongerAtPos === 2) return 0.5;
  if (strongerAtPos === 3) return -0.5;
  return -1.5;
}

function scoreFreeAgentFit(args: ScoreFreeAgentFitArgs): number {
  const { player, team, state, strategy, offer, effectiveCapSpace, effectivePayroll, thresholds, mood } = args;
  const currentYear = state.leagueStats.year;
  const teamPlayers = state.players.filter(p => p.tid === team.id);
  const k2 = getK2Ovr(player);
  const pot = calcPot2K(player, currentYear);
  const age = playerAge(player, currentYear);
  const need = positionNeedScore(teamPlayers, player);
  const agePenalty = Math.max(0, age - strategy.preferredFreeAgentMaxAge) * 3.5 * strategy.agePenaltyWeight;
  const yearsOver = Math.max(0, offer.years - strategy.preferredContractYears);
  const lengthPenalty = Math.pow(yearsOver, 1.6) * 7 * strategy.capFlexWeight;
  const overCapPenalty = effectiveCapSpace > 0
    ? Math.max(0, offer.salaryUSD - effectiveCapSpace) / 1_000_000 * 1.75 * strategy.capFlexWeight
    : 0;

  let apronPenalty = 0;
  if (thresholds && effectivePayroll !== undefined && offer.years > 1) {
    const projectedNextYrPayroll = effectivePayroll + offer.salaryUSD;
    const overhang1st = Math.max(0, projectedNextYrPayroll - thresholds.firstApron);
    const overhang2nd = Math.max(0, projectedNextYrPayroll - thresholds.secondApron);
    apronPenalty = (overhang1st / 1_000_000) * 1.2 * strategy.capFlexWeight
      + (overhang2nd / 1_000_000) * 2.0 * strategy.capFlexWeight;
  }

  let deadMoneyPenalty = 0;
  if (thresholds && offer.years > 1) {
    const teamRecord = state.teams.find(t => t.id === team.id);
    const deadThisYr = getTeamDeadMoneyForSeason(teamRecord, currentYear);
    const deadPctOfCap = deadThisYr / thresholds.salaryCap;
    if (deadPctOfCap > 0.05 && k2 < 80) {
      deadMoneyPenalty = (deadPctOfCap - 0.05) * 200 * strategy.capFlexWeight;
    }
  }

  const youthBonus = age <= 25 ? 6 * strategy.futureTalentWeight : 0;
  const veteranBonus = age >= 29 ? 4 * strategy.currentTalentWeight : 0;

  return (
    k2 * strategy.currentTalentWeight +
    pot * strategy.futureTalentWeight * 0.7 +
    need * 8 * strategy.fitWeight +
    mood * 18 * strategy.freeAgentAggression +
    youthBonus +
    veteranBonus -
    agePenalty -
    lengthPenalty -
    overCapPenalty -
    apronPenalty -
    deadMoneyPenalty
  );
}

export function getBestFit(
  team: NBATeam,
  freeAgents: NBAPlayer[],
  state: GameState,
  strategy: TeamStrategyProfile,
  localMleUsed: Map<number, { type: MleType; usedUSD: number }>,
  roundSpentUSD = 0,
): NBAPlayer | null {
  const thresholds = getCapThresholds(state.leagueStats as any);
  const profile = getTeamCapProfileFromState(state, team.id, thresholds);
  const effectiveCapSpace = Math.max(0, profile.capSpaceUSD - roundSpentUSD);
  const effectivePayroll = profile.payrollUSD + roundSpentUSD;

  const gmSpending = getGMAttributes(state, team.id).spending;
  const deadThisYr = getTeamDeadMoneyForSeason(team, state.leagueStats.year);
  const deadHeavy = (deadThisYr / (thresholds.salaryCap || 140_000_000)) > 0.08;

  return freeAgents
    .filter(player => {
      const baseOffer = computeContractOffer(player, state.leagueStats as any);
      const limits = getContractLimits(player, state.leagueStats as any);
      const offer = { ...baseOffer, salaryUSD: clampSpendOffer(baseOffer.salaryUSD, gmSpending, limits.maxSalaryUSD) };

      const localEntry = localMleUsed.get(team.id);
      const effectiveLeagueStats = localEntry
        ? {
            ...state.leagueStats,
            mleUsage: {
              ...(state.leagueStats as any).mleUsage,
              [team.id]: localEntry,
            },
          }
        : state.leagueStats;

      const mleAvail = getMLEAvailability(
        team.id,
        effectivePayroll,
        offer.salaryUSD,
        thresholds,
        effectiveLeagueStats as any,
      );

      const canAffordViaCap = offer.salaryUSD <= effectiveCapSpace + 2_000_000;
      const canAffordViaMle = !mleAvail.blocked && offer.salaryUSD <= mleAvail.available;
      if (!canAffordViaCap && !canAffordViaMle) return false;
      const age = playerAge(player, state.leagueStats.year);
      const k2 = getK2Ovr(player);
      if (k2 < 75 && offer.years > 1) return false;
      if (deadHeavy && k2 < 80 && offer.years > 1) return false;
      if (strategy.key === 'cap_clearing' && offer.years > 1) return false;
      if ((strategy.key === 'rebuilding' || strategy.key === 'development') && k2 < 80 && offer.years > 1) return false;
      if (!strategy.initiateBuyTrades && age >= 31 && offer.years > strategy.preferredContractYears) return false;
      if (strategy.initiateBuyTrades && k2 < 72 && offer.years > 1) return false;
      if (playerMoodForTeam(player, team, state) < 0.85) return false;
      if (isLoyalBlocked(player, team.id, state.leagueStats.year)) return false;
      if (isRecentWaiverByTeam(player, team.id, state.date)) return false;
      return true;
    })
    .sort((left, right) => {
      const leftOffer = clampOfferForDate(
        computeContractOffer(left, state.leagueStats as any),
        state.date,
        state.leagueStats.year,
        state.leagueStats,
        getK2Ovr(left),
      );
      const rightOffer = clampOfferForDate(
        computeContractOffer(right, state.leagueStats as any),
        state.date,
        state.leagueStats.year,
        state.leagueStats,
        getK2Ovr(right),
      );
      const leftScore = scoreFreeAgentFit({
        player: left,
        team,
        state,
        strategy,
        offer: leftOffer,
        effectiveCapSpace,
        effectivePayroll,
        thresholds,
        mood: playerMoodForTeam(left, team, state),
      });
      const rightScore = scoreFreeAgentFit({
        player: right,
        team,
        state,
        strategy,
        offer: rightOffer,
        effectiveCapSpace,
        effectivePayroll,
        thresholds,
        mood: playerMoodForTeam(right, team, state),
      });
      return rightScore - leftScore || (right.overallRating ?? 0) - (left.overallRating ?? 0);
    })[0] ?? null;
}

export function getRemainingYearsGuaranteed(player: NBAPlayer, currentYear: number): number {
  const contractYears = (player as any).contractYears as Array<{ season: string; option?: string }> | undefined;
  if (Array.isArray(contractYears) && contractYears.length > 0) {
    return contractYears.filter(year => {
      const option = String(year.option ?? '').toLowerCase();
      return seasonLabelToYear(year.season) >= currentYear && option !== 'team' && option !== 'player';
    }).length;
  }
  const exp = (player as any).contract?.exp ?? currentYear;
  return Math.max(0, exp - currentYear + 1);
}

export function getRemainingGuaranteedUSD(player: NBAPlayer, currentYear: number): number {
  const contractYears = (player as any).contractYears as Array<{ season: string; guaranteed: number; option?: string }> | undefined;
  if (Array.isArray(contractYears) && contractYears.length > 0) {
    return contractYears
      .filter(year => {
        const option = String(year.option ?? '').toLowerCase();
        return seasonLabelToYear(year.season) >= currentYear && option !== 'team' && option !== 'player';
      })
      .reduce((sum, year) => sum + (year.guaranteed || 0), 0);
  }
  const exp = (player as any).contract?.exp ?? currentYear;
  const amountUSD = contractToUSD((player as any).contract?.amount || 0);
  const years = Math.max(0, exp - currentYear + 1);
  return amountUSD * years;
}

export function resolveUserTeamId(state: GameState, fallback: number = -999): number {
  if (state.gameMode === 'gm') {
    return (state as any).userTeamId ?? fallback;
  }
  return -999;
}

export function pickContractLabel(limits: {
  isSupermaxEligible?: boolean;
  isRookieExtEligible?: boolean;
  rookieRoseQualified?: boolean;
}): string | undefined {
  if (limits.isSupermaxEligible) return 'Supermax';
  if (limits.isRookieExtEligible && limits.rookieRoseQualified) return 'Rose Rule';
  if (limits.isRookieExtEligible) return 'Rookie Ext';
  return undefined;
}

export function isRecentlySignedWithinGrace(player: NBAPlayer, currentDate: string | undefined): boolean {
  const signed = (player as any).signedDate;
  if (!signed || !currentDate) return false;
  const days = daysBetweenGameDates(signed, currentDate);
  return days >= 0 && days < RECENT_SIGNING_GRACE_DAYS;
}

export function birdRightsSeed(playerId: string, year: number): number {
  let h = 0;
  const seed = `bird_rights_${playerId}_${year}`;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

export function getPriorNbaTid(player: NBAPlayer): number {
  const txns: Array<{ season: number; tid: number }> = (player as any).transactions ?? [];
  if (txns.length > 0) {
    const transaction = [...txns].sort((a, b) => b.season - a.season).find(x => x.tid >= 0 && x.tid <= 29);
    if (transaction) return transaction.tid;
  }
  const stats: Array<{ season?: number; tid?: number; gp?: number; playoffs?: boolean }> = (player as any).stats ?? [];
  const season = stats
    .filter(x => !x.playoffs && (x.gp ?? 0) > 0 && (x.tid ?? -1) >= 0 && (x.tid ?? -1) <= 29)
    .sort((a, b) => (b.season ?? 0) - (a.season ?? 0))[0];
  return season ? (season.tid ?? -1) : -1;
}
