import type { GameState, NBAPlayer } from '../../types';
import {
  computeContractOffer,
  contractToUSD,
  effectiveRecord,
  getCapThresholds,
} from '../../utils/salaryUtils';
import { calcPot2K } from '../trade/tradeValueEngine';
import { hasFamilyOnRoster } from '../../utils/familyTies';
import {
  defaultMaxRoster,
  getMinSalaryUSD,
  getRemainingGuaranteedUSD,
  getRemainingYearsGuaranteed,
  isRecentlySignedWithinGrace,
  playerAge,
} from './aiFreeAgencyHelpers';
import type { PromotionResult, WaiverResult } from './passTypes';

export function autoTrimOversizedRostersPass(
  state: GameState,
  month?: number,
  day?: number,
): WaiverResult[] {
  const userTeamId = (state.gameMode === 'gm') ? ((state as any).userTeamId ?? state.teams[0]?.id) : -999;
  const maxStandard = state.leagueStats.maxStandardPlayersPerTeam ?? defaultMaxRoster(state.leagueStats);
  const maxTrainingCamp = state.leagueStats.maxTrainingCampRoster ?? 21;
  const maxTwoWay = state.leagueStats.maxTwoWayPlayersPerTeam ?? 3;
  const salaryCapUSD = state.leagueStats.salaryCap ?? 140_000_000;
  const protectGuaranteedOvr = 70;
  const protectGuaranteedRemainingPct = 0.10;
  const maxBuyoutPctOfCap = 0.10;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const isRecentlySigned = (player: NBAPlayer): boolean => isRecentlySignedWithinGrace(player, state.date);
  const hasRegularSeasonAppearance = (player: NBAPlayer): boolean =>
    (player.stats ?? []).some((entry: any) => entry.season === currentYear && !entry.playoffs && (entry.gp ?? 0) > 0);

  const buildForcedTrimPool = (
    pool: NBAPlayer[],
    selectedIds: Set<string>,
    sortFn: (a: NBAPlayer, b: NBAPlayer) => number,
    includeAppearanceGuard: boolean,
  ): NBAPlayer[] => {
    const isProtectedTier1 = (player: NBAPlayer) => {
      if (includeAppearanceGuard && hasRegularSeasonAppearance(player)) return true;
      if ((player as any).birdRightsResignedThisYear === currentYear) return true;
      if (isRecentlySigned(player) && !(player as any).nonGuaranteed) return true;
      const draftYear = (player as any).draft?.year;
      if (typeof draftYear === 'number' && currentYear - draftYear <= 2) return true;
      return false;
    };
    const isProtectedTier2 = (player: NBAPlayer) => {
      if (includeAppearanceGuard && hasRegularSeasonAppearance(player)) return true;
      if ((player as any).birdRightsResignedThisYear === currentYear) return true;
      if (isRecentlySigned(player) && !(player as any).nonGuaranteed) return true;
      return false;
    };
    const tier1 = pool.filter(player => !selectedIds.has(player.internalId) && !isProtectedTier1(player)).sort(sortFn);
    const tier2 = pool.filter(player => !selectedIds.has(player.internalId) && !isProtectedTier2(player)).sort(sortFn);
    const tier3 = pool
      .filter(player => !selectedIds.has(player.internalId) && !(isRecentlySigned(player) && !(player as any).nonGuaranteed))
      .sort(sortFn);
    const combined: NBAPlayer[] = [...tier1];
    const seen = new Set(combined.map(player => player.internalId));
    for (const player of tier2) {
      if (!seen.has(player.internalId)) {
        combined.push(player);
        seen.add(player.internalId);
      }
    }
    for (const player of tier3) {
      if (!seen.has(player.internalId)) {
        combined.push(player);
        seen.add(player.internalId);
      }
    }
    return combined;
  };

  const isPreseasonPeriod = month !== undefined && (
    (month >= 7 && month <= 9) ||
    (month === 10 && (day === undefined || day <= 21))
  );
  const effectiveLimit = isPreseasonPeriod ? maxTrainingCamp : maxStandard;
  const results: WaiverResult[] = [];

  for (const team of state.teams) {
    if (team.id === userTeamId) continue;

    const { wins: effectiveWins, losses: effectiveLosses } = effectiveRecord(team, currentYear);
    const gamesPlayed = effectiveWins + effectiveLosses;
    const winPct = gamesPlayed > 0 ? effectiveWins / gamesPlayed : 0.5;
    const isRebuilding = gamesPlayed > 0 && winPct < 0.42;
    const isContender = gamesPlayed > 0 && winPct >= 0.55;

    if (isPreseasonPeriod) {
      const allPlayers = state.players.filter(player => player.tid === team.id);
      if (allPlayers.length > effectiveLimit) {
        const excess = allPlayers.length - effectiveLimit;
        const avgAge = allPlayers.length > 0
          ? allPlayers.reduce((sum, player) => sum + playerAge(player, currentYear), 0) / allPlayers.length
          : 27;
        const sortByPot = isRebuilding || (isContender && avgAge < 27);
        const sortFn = (left: NBAPlayer, right: NBAPlayer) => {
          const baseLeft = sortByPot ? calcPot2K(left, currentYear) : (left.overallRating ?? 0);
          const baseRight = sortByPot ? calcPot2K(right, currentYear) : (right.overallRating ?? 0);
          const salaryPenaltyLeft = (contractToUSD((left as any).contract?.amount || 0) / salaryCapUSD) * 30;
          const salaryPenaltyRight = (contractToUSD((right as any).contract?.amount || 0) / salaryCapUSD) * 30;
          return (baseLeft - salaryPenaltyLeft) - (baseRight - salaryPenaltyRight);
        };

        const canCut = (player: NBAPlayer) => {
          if (hasFamilyOnRoster(player, allPlayers)) return false;
          if (isRecentlySigned(player) && !(player as any).nonGuaranteed && !(player as any).twoWay) return false;
          if ((player as any).nonGuaranteed || (player as any).twoWay) return true;
          const draftYear = (player as any).draft?.year;
          if (typeof draftYear === 'number' && currentYear - draftYear <= 2) return false;
          const preCampOvr = (player as any).preCampOverallRating as number | undefined;
          const ovrForCheck = typeof preCampOvr === 'number'
            ? Math.max(preCampOvr, player.overallRating ?? 0)
            : (player.overallRating ?? 0);
          if ((player as any).birdRightsResignedThisYear === currentYear) return false;
          const yearsLeft = getRemainingYearsGuaranteed(player, currentYear);
          const age = playerAge(player, currentYear);
          const remaining = getRemainingGuaranteedUSD(player, currentYear);
          if (ovrForCheck >= 75 && !(age >= 35 && yearsLeft <= 1)) return false;
          if (remaining > salaryCapUSD * maxBuyoutPctOfCap && !(ovrForCheck < 60 && age >= 35)) return false;
          const isCheapEnoughForBuyout = remaining < salaryCapUSD * 0.05;
          const isBuyoutCandidate = yearsLeft <= 1 && (age >= 32 || isRebuilding) && isCheapEnoughForBuyout;
          if (isBuyoutCandidate) return true;
          if (yearsLeft >= 2 && remaining >= salaryCapUSD * protectGuaranteedRemainingPct) return false;
          if (ovrForCheck < protectGuaranteedOvr) return true;
          return remaining < salaryCapUSD * protectGuaranteedRemainingPct;
        };

        const nonGuaranteedPlayers = allPlayers.filter(player => canCut(player) && !!(player as any).nonGuaranteed).sort(sortFn);
        const gLeaguePlayers = allPlayers.filter(player => canCut(player) && !(player as any).nonGuaranteed && !!(player as any).gLeagueAssigned).sort(sortFn);
        const twoWayPlayers = allPlayers
          .filter(player => canCut(player) && !(player as any).nonGuaranteed && !(player as any).gLeagueAssigned && !!(player as any).twoWay)
          .sort((left, right) => (left.overallRating ?? 0) - (right.overallRating ?? 0));
        const standardPlayers = allPlayers
          .filter(player => canCut(player) && !(player as any).nonGuaranteed && !(player as any).gLeagueAssigned && !(player as any).twoWay)
          .sort(sortFn);
        const trimPool = [...nonGuaranteedPlayers, ...gLeaguePlayers, ...twoWayPlayers, ...standardPlayers];
        const teamWaivers: WaiverResult[] = [];
        const selectedIds = new Set<string>();
        const pushWaiver = (player: NBAPlayer, forced = false) => {
          selectedIds.add(player.internalId);
          teamWaivers.push({
            playerId: player.internalId,
            teamId: team.id,
            playerName: player.name,
            teamName: team.name,
            reason: 'trainingCampExcess',
            wasNonGuaranteed: !!(player as any).nonGuaranteed,
            ...(forced ? { forced: true } : {}),
          });
        };

        for (let index = 0; index < excess && index < trimPool.length; index++) {
          pushWaiver(trimPool[index]);
        }
        if (teamWaivers.length < excess) {
          const forcedPool = buildForcedTrimPool(allPlayers, selectedIds, sortFn, false);
          for (let index = 0; teamWaivers.length < excess && index < forcedPool.length; index++) {
            pushWaiver(forcedPool[index], true);
          }
        }
        if (teamWaivers.length > 0) {
          const forcedCount = teamWaivers.filter(entry => entry.forced).length;
          console.log(`[RosterTrim-TC] Month=${month}, team=${team.name}, total=${allPlayers.length}, limit=${effectiveLimit}, trimmed=${teamWaivers.length}${forcedCount ? ` forced=${forcedCount}` : ''}: ${teamWaivers.map(entry => entry.playerName).join(', ')}`);
        }
        results.push(...teamWaivers);
      }
      continue;
    }

    const roster = state.players.filter(player => player.tid === team.id && !(player as any).twoWay);

    if (roster.length > effectiveLimit) {
      const excess = roster.length - effectiveLimit;
      const avgAge = roster.length > 0
        ? roster.reduce((sum, player) => sum + playerAge(player, currentYear), 0) / roster.length
        : 27;
      const sortByPot = isRebuilding || (isContender && avgAge < 27);
      const sortFn = (left: NBAPlayer, right: NBAPlayer) => {
        const baseLeft = sortByPot ? calcPot2K(left, currentYear) : (left.overallRating ?? 0);
        const baseRight = sortByPot ? calcPot2K(right, currentYear) : (right.overallRating ?? 0);
        const salaryPenaltyLeft = (contractToUSD((left as any).contract?.amount || 0) / salaryCapUSD) * 30;
        const salaryPenaltyRight = (contractToUSD((right as any).contract?.amount || 0) / salaryCapUSD) * 30;
        return (baseLeft - salaryPenaltyLeft) - (baseRight - salaryPenaltyRight);
      };

      const canCut = (player: NBAPlayer) => {
        if (hasFamilyOnRoster(player, roster)) return false;
        if (isRecentlySigned(player) && !(player as any).nonGuaranteed) return false;
        if (hasRegularSeasonAppearance(player)) return false;
        if ((player as any).nonGuaranteed) return true;
        const draftYear = (player as any).draft?.year;
        if (typeof draftYear === 'number' && currentYear - draftYear <= 2) return false;
        const preCampOvr = (player as any).preCampOverallRating as number | undefined;
        const ovrForCheck = typeof preCampOvr === 'number'
          ? Math.max(preCampOvr, player.overallRating ?? 0)
          : (player.overallRating ?? 0);
        if ((player as any).birdRightsResignedThisYear === currentYear) return false;
        const yearsLeft = getRemainingYearsGuaranteed(player, currentYear);
        const age = playerAge(player, currentYear);
        const remaining = getRemainingGuaranteedUSD(player, currentYear);
        if (ovrForCheck >= 75 && !(age >= 35 && yearsLeft <= 1)) return false;
        if (remaining > salaryCapUSD * maxBuyoutPctOfCap && !(ovrForCheck < 60 && age >= 35)) return false;
        const isCheapEnoughForBuyout = remaining < salaryCapUSD * 0.05;
        const isBuyoutCandidate = yearsLeft <= 1 && (age >= 32 || isRebuilding) && isCheapEnoughForBuyout;
        if (isBuyoutCandidate) return true;
        if (yearsLeft >= 2 && remaining >= salaryCapUSD * protectGuaranteedRemainingPct) return false;
        if (ovrForCheck < protectGuaranteedOvr) return true;
        return remaining < salaryCapUSD * protectGuaranteedRemainingPct;
      };

      const nonGuaranteedRoster = roster.filter(player => canCut(player) && !!(player as any).nonGuaranteed).sort(sortFn);
      const gLeaguePlayers = roster.filter(player => canCut(player) && !(player as any).nonGuaranteed && !!(player as any).gLeagueAssigned).sort(sortFn);
      const standardPool = roster.filter(player => canCut(player) && !(player as any).nonGuaranteed && !(player as any).gLeagueAssigned).sort(sortFn);
      const trimPool = [...nonGuaranteedRoster, ...gLeaguePlayers, ...standardPool];
      const teamWaivers: WaiverResult[] = [];
      const selectedIds = new Set<string>();
      const pushWaiver = (player: NBAPlayer, forced = false) => {
        selectedIds.add(player.internalId);
        teamWaivers.push({
          playerId: player.internalId,
          teamId: team.id,
          playerName: player.name,
          teamName: team.name,
          reason: 'standardExcess',
          wasNonGuaranteed: !!(player as any).nonGuaranteed,
          ...(forced ? { forced: true } : {}),
        });
      };

      for (let index = 0; index < excess && index < trimPool.length; index++) {
        pushWaiver(trimPool[index]);
      }
      if (teamWaivers.length < excess) {
        const forcedPool = buildForcedTrimPool(roster, selectedIds, sortFn, true);
        for (let index = 0; teamWaivers.length < excess && index < forcedPool.length; index++) {
          pushWaiver(forcedPool[index], true);
        }
      }
      if (teamWaivers.length > 0) {
        const forcedCount = teamWaivers.filter(entry => entry.forced).length;
        console.log(`[RosterTrim] Month=${month}, team=${team.name}, roster=${roster.length} (gl=${gLeaguePlayers.length}), limit=${effectiveLimit}, sortBy=${sortByPot ? 'POT' : 'OVR'}, trimmed=${teamWaivers.length}${forcedCount ? ` forced=${forcedCount}` : ''}: ${teamWaivers.map(entry => entry.playerName).join(', ')}`);
      }
      results.push(...teamWaivers);
    }

    const twoWayRoster = state.players.filter(player => player.tid === team.id && !!(player as any).twoWay);
    if (twoWayRoster.length > maxTwoWay) {
      const excessTwoWay = twoWayRoster.length - maxTwoWay;
      const fullRosterForFamilyCheck = state.players.filter(player => player.tid === team.id);
      const sortedTwoWay = [...twoWayRoster]
        .filter(player => !hasFamilyOnRoster(player, fullRosterForFamilyCheck))
        .sort((left, right) => (left.overallRating ?? 0) - (right.overallRating ?? 0));
      const teamTwoWayWaivers: WaiverResult[] = [];
      for (let index = 0; index < excessTwoWay && index < sortedTwoWay.length; index++) {
        const player = sortedTwoWay[index];
        teamTwoWayWaivers.push({
          playerId: player.internalId,
          teamId: team.id,
          playerName: player.name,
          teamName: team.name,
          reason: 'twoWayExcess',
        });
      }
      if (teamTwoWayWaivers.length > 0) {
        console.log(`[RosterTrim-2W] Month=${month}, team=${team.name}, twoWay=${twoWayRoster.length}, cap=${maxTwoWay}, trimmed=${teamTwoWayWaivers.length}: ${teamTwoWayWaivers.map(entry => entry.playerName).join(', ')}`);
      }
      results.push(...teamTwoWayWaivers);
    }
  }

  return results;
}

export function autoPromoteTwoWayExcessPass(
  state: GameState,
  month?: number,
): PromotionResult[] {
  const userTeamId = (state.gameMode === 'gm') ? ((state as any).userTeamId ?? state.teams[0]?.id) : -999;
  const maxStandard = state.leagueStats.maxStandardPlayersPerTeam ?? defaultMaxRoster(state.leagueStats);
  const maxTwoWay = (state.leagueStats as any).twoWayContractsEnabled === false
    ? 0
    : (state.leagueStats.maxTwoWayPlayersPerTeam ?? 3);
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const isPreseasonPeriod = month !== undefined && month >= 7 && month <= 9;
  if (isPreseasonPeriod) return [];

  const thresholds = getCapThresholds(state.leagueStats);
  const results: PromotionResult[] = [];

  for (const team of state.teams) {
    if (team.id === userTeamId) continue;

    const teamPlayers = state.players.filter(player => player.tid === team.id);
    const standardPlayers = teamPlayers.filter(player => !(player as any).twoWay && !(player as any).gLeagueAssigned);
    const twoWayPlayers = teamPlayers.filter(player => !!(player as any).twoWay);

    if (standardPlayers.length >= maxStandard || twoWayPlayers.length <= maxTwoWay) continue;

    const slotsOpen = maxStandard - standardPlayers.length;
    const excessTwoWay = twoWayPlayers.length - maxTwoWay;
    let toPromote = Math.min(slotsOpen, excessTwoWay);
    if (toPromote <= 0) continue;

    const payrollUSD = teamPlayers.reduce((sum, player) => sum + contractToUSD((player.contract?.amount as number) || 0), 0);
    const candidates = [...twoWayPlayers].sort((left, right) => (right.overallRating ?? 0) - (left.overallRating ?? 0));
    let projectedPayroll = payrollUSD;

    for (const player of candidates) {
      if (toPromote <= 0) break;

      const offer = computeContractOffer(player, state.leagueStats, [], 0);
      const minSalaryUSD = getMinSalaryUSD(state.leagueStats);
      const promotionCapUSD = minSalaryUSD * 2;
      const newSalaryUSD = Math.min(offer.salaryUSD, promotionCapUSD);
      const currentSalaryUSD = contractToUSD((player.contract?.amount as number) || 0);
      const netIncrease = Math.max(0, newSalaryUSD - currentSalaryUSD);

      if (projectedPayroll + netIncrease > thresholds.secondApron) break;

      results.push({
        playerId: player.internalId,
        teamId: team.id,
        playerName: player.name,
        teamName: team.name,
        newSalaryUSD,
        contractExp: currentYear,
      });
      projectedPayroll += netIncrease;
      toPromote--;
    }
  }

  if (results.length > 0) {
    const byTeam: Record<string, string[]> = {};
    for (const result of results) {
      if (!byTeam[result.teamName]) byTeam[result.teamName] = [];
      byTeam[result.teamName].push(result.playerName);
    }
    console.log(`[TwoWayPromotion] Month=${month}, promoted ${results.length} players: ${Object.entries(byTeam).map(([teamName, names]) => `${teamName}(${names.join(', ')})`).join('; ')}`);
  }

  return results;
}
