import type { GameState, NBAPlayer } from '../../types';
import {
  computeContractOffer,
  contractToUSD,
  getCapThresholds,
  getContractLimits,
  getMLEAvailability,
  getTeamCapProfileFromState,
} from '../../utils/salaryUtils';
import type { MleType } from '../../utils/salaryUtils';
import { SettingsManager } from '../SettingsManager';
import { calcPot2K } from '../trade/tradeValueEngine';
import { getGMAttributes, clampSpendOffer } from '../staff/gmAttributes';
import { hasFamilyOnRoster } from '../../utils/familyTies';
import { resolveTeamStrategyProfile } from '../../utils/teamStrategy';
import {
  clampOfferForDate,
  defaultMaxRoster,
  getActiveFAMarketPlayerIds,
  getK2Ovr,
  getMinSalaryUSD,
  getRemainingGuaranteedUSD,
  isLoyalBlocked,
  isRecentWaiverByTeam,
  isRecentlySignedWithinGrace,
  playerAge,
  resolveUserTeamId,
} from './aiFreeAgencyHelpers';
import type { MleSwapResult } from './passTypes';

export function runAIMleUpgradeSwapsPass(
  state: GameState,
  simMonth: number,
  simDay: number,
): MleSwapResult[] {
  if (!SettingsManager.getSettings().allowAIFreeAgency) return [];

  const userTeamId = resolveUserTeamId(state);
  const thresholds = getCapThresholds(state.leagueStats as any);
  const currentYear = state.leagueStats.year;
  const maxStandard = state.leagueStats.maxStandardPlayersPerTeam ?? defaultMaxRoster(state.leagueStats);
  const minSalaryUSD = getMinSalaryUSD(state.leagueStats);
  const marketPendingIds = getActiveFAMarketPlayerIds(state);

  const freeAgents = state.players.filter(player =>
    player.status === 'Free Agent' &&
    !marketPendingIds.has(player.internalId) &&
    !((player as any).draft?.year >= currentYear) &&
    !player.hof
  );

  const results: MleSwapResult[] = [];
  const claimedFAIds = new Set<string>();

  for (const team of state.teams) {
    if (team.id === userTeamId) continue;

    const strategy = resolveTeamStrategyProfile({
      team,
      players: state.players,
      teams: state.teams,
      leagueStats: state.leagueStats,
      currentYear,
      gameMode: state.gameMode,
      userTeamId: (state as any).userTeamId,
    });
    if (!strategy.initiateBuyTrades) continue;

    const seed = (team.id * 7 + simMonth * 13) % 28;
    if (simDay !== seed + 1) continue;

    const profile = getTeamCapProfileFromState(state, team.id, thresholds);
    if (profile.capSpaceUSD > 2_000_000) continue;

    const mle = getMLEAvailability(team.id, profile.payrollUSD, 0, thresholds, state.leagueStats as any);
    if (!mle.type || mle.blocked || mle.available < minSalaryUSD) continue;

    const guaranteedRoster = state.players.filter(player =>
      player.tid === team.id && !(player as any).twoWay && !(player as any).nonGuaranteed && player.status === 'Active'
    );
    if (guaranteedRoster.length < maxStandard) continue;

    const sortScore = (player: NBAPlayer) =>
      (strategy.key === 'rebuilding' || strategy.key === 'development')
        ? calcPot2K(player, currentYear)
        : (player.overallRating ?? 0);

    const swapCandidates = guaranteedRoster.filter(player => {
      if (hasFamilyOnRoster(player, guaranteedRoster)) return false;
      if (isRecentlySignedWithinGrace(player, state.date)) return false;
      if ((player.overallRating ?? 0) >= 75) return false;
      const draftYear = (player as any).draft?.year;
      if (typeof draftYear === 'number' && currentYear - draftYear <= 2) return false;
      if ((player as any).birdRightsResignedThisYear === currentYear) return false;
      const remaining = getRemainingGuaranteedUSD(player, currentYear);
      const age = playerAge(player, currentYear);
      if (remaining > thresholds.salaryCap * 0.10 && !((player.overallRating ?? 0) < 60 && age >= 35)) return false;
      return true;
    });

    const weakest = [...swapCandidates].sort((left, right) => sortScore(left) - sortScore(right))[0];
    if (!weakest) continue;
    const weakestScore = sortScore(weakest);
    const gmSpending = getGMAttributes(state, team.id).spending;

    const candidate = freeAgents
      .filter(player => {
        if (claimedFAIds.has(player.internalId)) return false;
        if (isLoyalBlocked(player, team.id, currentYear)) return false;
        if (isRecentWaiverByTeam(player, team.id, state.date)) return false;
        const limits = getContractLimits(player, state.leagueStats as any);
        const rawOffer = computeContractOffer(player, state.leagueStats as any);
        const offer = clampOfferForDate(rawOffer, state.date, currentYear, state.leagueStats, getK2Ovr(player));
        const salary = clampSpendOffer(offer.salaryUSD, gmSpending, limits.maxSalaryUSD);
        return salary <= mle.available && sortScore(player) > weakestScore;
      })
      .sort((left, right) => sortScore(right) - sortScore(left))[0];

    if (!candidate) continue;
    claimedFAIds.add(candidate.internalId);

    const baseOfferRaw = computeContractOffer(candidate, state.leagueStats as any);
    const baseOffer = clampOfferForDate(baseOfferRaw, state.date, currentYear, state.leagueStats, getK2Ovr(candidate));
    const limits = getContractLimits(candidate, state.leagueStats as any);
    const salaryUSD = Math.min(mle.available, clampSpendOffer(baseOffer.salaryUSD, gmSpending, limits.maxSalaryUSD));

    results.push({
      sign: {
        playerId: candidate.internalId,
        teamId: team.id,
        playerName: candidate.name,
        teamName: team.name,
        salaryUSD,
        contractYears: baseOffer.years,
        contractExp: currentYear + baseOffer.years - 1,
        hasPlayerOption: baseOffer.hasPlayerOption,
        mleTypeUsed: mle.type as MleType,
        mleAmountUSD: salaryUSD,
      },
      waive: {
        playerId: weakest.internalId,
        teamId: team.id,
        playerName: weakest.name,
        teamName: team.name,
        reason: 'standardExcess',
      },
    });
  }

  return results;
}
