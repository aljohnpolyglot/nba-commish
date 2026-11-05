import type { GameState, NBAPlayer } from '../../types';
import {
  computeContractOffer,
  contractToUSD,
  effectiveRecord,
  getCapThresholds,
} from '../../utils/salaryUtils';
import { getStandardRosterLimit, getTrainingCampRosterLimit, getTwoWayRosterLimit } from '../../utils/rosterLimits';
import { isNonGuaranteedContract, isTwoWayContract } from '../../utils/contractTypes';
import { calcOvr2K, calcPot2K } from '../trade/tradeValueEngine';
import { hasFamilyOnRoster } from '../../utils/familyTies';
import {
  getMinSalaryUSD,
  getRemainingGuaranteedUSD,
  getRemainingYearsGuaranteed,
  isRecentlySignedWithinGrace,
  playerAge,
} from './aiFreeAgencyHelpers';
import type { PromotionResult, WaiverResult } from './passTypes';
import { getLeagueCalendarDates, isLeagueTrainingCampWindow } from '../leagueCalendar';
import { toISODateString } from '../../utils/dateUtils';
import { normalizeDate } from '../../utils/helpers';
import { simDebug } from '../../utils/simDebug';
import { isFranchiseCareerLoyaltyActive } from '../../utils/franchiseCareerLoyalty';
import { getOffseasonState } from '../offseason/offseasonState';

export function autoTrimOversizedRostersPass(
  state: GameState,
  month?: number,
  day?: number,
): WaiverResult[] {
  const userTeamId = (state.gameMode === 'gm') ? ((state as any).userTeamId ?? state.teams[0]?.id) : -999;
  const maxStandard = getStandardRosterLimit(state.leagueStats as any);
  const maxTrainingCamp = getTrainingCampRosterLimit(state.leagueStats as any);
  const maxTwoWay = getTwoWayRosterLimit(state.leagueStats);
  const twoWayRosterActive = maxTwoWay > 0;
  const nonGuaranteedActive = state.leagueStats?.nonGuaranteedContractsEnabled !== false;
  const salaryCapUSD = Number(state.leagueStats.salaryCap) > 0
    ? Number(state.leagueStats.salaryCap)
    : Number((state.leagueStats as any).historicalContractScaleCap ?? 140_000_000);
  const protectGuaranteedOvr = 78;
  const protectGuaranteedRemainingPct = 0.10;
  const maxBuyoutPctOfCap = 0.10;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const isOpeningDayDeadline = normalizeDate(state.date) === toISODateString(
    getLeagueCalendarDates(currentYear, state.leagueStats).regularSeasonStart,
  );
  const isRecentlySigned = (player: NBAPlayer): boolean => isRecentlySignedWithinGrace(player, state.date);
  const hasActiveInjury = (player: NBAPlayer): boolean => Number((player as any).injury?.gamesRemaining ?? 0) > 0;
  const isActiveTwoWay = (player: NBAPlayer): boolean => twoWayRosterActive && isTwoWayContract(player, state.leagueStats);
  const isActiveNonGuaranteed = (player: NBAPlayer): boolean => nonGuaranteedActive && isNonGuaranteedContract(player, state.leagueStats);
  const hasRegularSeasonAppearance = (player: NBAPlayer): boolean =>
    (player.stats ?? []).some((entry: any) => entry.season === currentYear && !entry.playoffs && (entry.gp ?? 0) > 0);
  const playerOverall = (player: NBAPlayer): number => calcOvr2K(player);
  const playerValue = (player: NBAPlayer, sortByPot: boolean): number =>
    sortByPot
      ? Math.max(playerOverall(player), calcPot2K(player, currentYear))
      : playerOverall(player);
  const cutPriority = (player: NBAPlayer, sortByPot: boolean): number => {
    const guaranteed = isActiveNonGuaranteed(player)
      ? 0
      : getRemainingGuaranteedUSD(player, currentYear);
    const guaranteeProtection = Math.min(25, (guaranteed / salaryCapUSD) * 100);
    return playerValue(player, sortByPot) + guaranteeProtection;
  };
  const buildCoreIds = (pool: NBAPlayer[]): Set<string> => new Set(
    [...pool]
      .sort((left, right) => playerValue(right, false) - playerValue(left, false))
      .slice(0, Math.min(5, pool.length))
      .map(player => player.internalId),
  );

  const buildForcedTrimPool = (
    pool: NBAPlayer[],
    selectedIds: Set<string>,
    sortFn: (a: NBAPlayer, b: NBAPlayer) => number,
    includeAppearanceGuard: boolean,
    coreIds: Set<string>,
    ): NBAPlayer[] => {
    const isAbsoluteProtected = (player: NBAPlayer) => {
      if (isFranchiseCareerLoyaltyActive(player)) return true;
      if (coreIds.has(player.internalId)) return true;
      if (hasFamilyOnRoster(player, pool, currentYear)) return true;
      if (hasActiveInjury(player) && !isActiveNonGuaranteed(player) && !isActiveTwoWay(player)) return true;
      if (includeAppearanceGuard && hasRegularSeasonAppearance(player)) return true;
      if ((player as any).birdRightsResignedThisYear === currentYear) return true;
      if (isRecentlySigned(player) && !isActiveNonGuaranteed(player)) return true;
      if (playerOverall(player) >= 80) return true;
      return getRemainingGuaranteedUSD(player, currentYear) > salaryCapUSD * maxBuyoutPctOfCap;
    };
    const isProtectedTier1 = (player: NBAPlayer) => {
      if (isAbsoluteProtected(player)) return true;
      const draftYear = (player as any).draft?.year;
      if (typeof draftYear === 'number' && currentYear - draftYear <= 2) return true;
      return false;
    };
    const isProtectedTier2 = (player: NBAPlayer) => {
      return isAbsoluteProtected(player);
    };
    const tier1 = pool.filter(player => !selectedIds.has(player.internalId) && !isProtectedTier1(player)).sort(sortFn);
    const tier2 = pool.filter(player => !selectedIds.has(player.internalId) && !isProtectedTier2(player)).sort(sortFn);
    const tier3 = pool
      .filter(player => !selectedIds.has(player.internalId) && !isAbsoluteProtected(player))
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

  const offseasonPhase = state.date
    ? getOffseasonState(state.date, state.leagueStats, state.schedule).phase
    : 'inSeason';
  const isPreseasonPeriod = !isOpeningDayDeadline && (
    isLeagueTrainingCampWindow(state.date, state.leagueStats)
    || offseasonPhase !== 'inSeason'
  );
  const effectiveLimit = isPreseasonPeriod ? maxTrainingCamp : maxStandard;
  const results: WaiverResult[] = [];

  for (const team of state.teams) {
    if (team.id === userTeamId && !isOpeningDayDeadline) continue;

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
        const sortFn = (left: NBAPlayer, right: NBAPlayer) =>
          cutPriority(left, sortByPot) - cutPriority(right, sortByPot);
        const coreIds = buildCoreIds(allPlayers);

      const canCut = (player: NBAPlayer) => {
        if (isFranchiseCareerLoyaltyActive(player)) return false;
        if (hasFamilyOnRoster(player, allPlayers, currentYear)) return false;
        if (coreIds.has(player.internalId)) return false;
        if (hasActiveInjury(player) && !isActiveNonGuaranteed(player) && !isActiveTwoWay(player)) return false;
        if (isRecentlySigned(player) && !isActiveNonGuaranteed(player) && !isActiveTwoWay(player)) return false;
        if (isActiveNonGuaranteed(player) || isActiveTwoWay(player)) return true;
          const draftYear = (player as any).draft?.year;
          if (typeof draftYear === 'number' && currentYear - draftYear <= 2) return false;
          const ovrForCheck = playerOverall(player);
          if ((player as any).birdRightsResignedThisYear === currentYear) return false;
          const yearsLeft = getRemainingYearsGuaranteed(player, currentYear);
          const age = playerAge(player, currentYear);
          const remaining = getRemainingGuaranteedUSD(player, currentYear);
          if (ovrForCheck >= 80 && !(age >= 35 && yearsLeft <= 1)) return false;
          if (remaining > salaryCapUSD * maxBuyoutPctOfCap && !(ovrForCheck < 72 && age >= 35)) return false;
          const isCheapEnoughForBuyout = remaining < salaryCapUSD * 0.05;
          const isBuyoutCandidate = yearsLeft <= 1 && (age >= 32 || isRebuilding) && isCheapEnoughForBuyout;
          if (isBuyoutCandidate) return true;
          if (yearsLeft >= 2 && remaining >= salaryCapUSD * protectGuaranteedRemainingPct) return false;
          if (ovrForCheck < protectGuaranteedOvr) return true;
          return remaining < salaryCapUSD * protectGuaranteedRemainingPct;
        };

        const nonGuaranteedPlayers = allPlayers.filter(player => canCut(player) && isActiveNonGuaranteed(player)).sort(sortFn);
        const gLeaguePlayers = allPlayers.filter(player => canCut(player) && !isActiveNonGuaranteed(player) && !!(player as any).gLeagueAssigned).sort(sortFn);
        const twoWayPlayers = allPlayers
          .filter(player => canCut(player) && !isActiveNonGuaranteed(player) && !(player as any).gLeagueAssigned && isActiveTwoWay(player))
          .sort((left, right) => (left.overallRating ?? 0) - (right.overallRating ?? 0));
        const standardPlayers = allPlayers
          .filter(player => canCut(player) && !isActiveNonGuaranteed(player) && !(player as any).gLeagueAssigned && !isActiveTwoWay(player))
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
            wasNonGuaranteed: isActiveNonGuaranteed(player),
            ...(forced ? { forced: true } : {}),
          });
        };

        for (let index = 0; index < excess && index < trimPool.length; index++) {
          pushWaiver(trimPool[index]);
        }
        if (teamWaivers.length < excess) {
          const forcedPool = buildForcedTrimPool(allPlayers, selectedIds, sortFn, false, coreIds);
          for (let index = 0; teamWaivers.length < excess && index < forcedPool.length; index++) {
            pushWaiver(forcedPool[index], true);
          }
        }
        if (teamWaivers.length > 0) {
          const forcedCount = teamWaivers.filter(entry => entry.forced).length;
          simDebug('roster-trim', () => (
            `[RosterTrim-TC] Month=${month}, team=${team.name}, total=${allPlayers.length}, limit=${effectiveLimit}, trimmed=${teamWaivers.length}${forcedCount ? ` forced=${forcedCount}` : ''}: ${teamWaivers.map(entry => entry.playerName).join(', ')}`
          ), { teamId: team.id, trimmed: teamWaivers.length, forced: forcedCount });
        }
        results.push(...teamWaivers);
      }
      continue;
    }

    const roster = state.players.filter(player => player.tid === team.id && !isActiveTwoWay(player));

    if (roster.length > effectiveLimit) {
      const excess = roster.length - effectiveLimit;
      const avgAge = roster.length > 0
        ? roster.reduce((sum, player) => sum + playerAge(player, currentYear), 0) / roster.length
        : 27;
      const sortByPot = isRebuilding || (isContender && avgAge < 27);
      const sortFn = (left: NBAPlayer, right: NBAPlayer) =>
        cutPriority(left, sortByPot) - cutPriority(right, sortByPot);
      const coreIds = buildCoreIds(roster);

      const canCut = (player: NBAPlayer) => {
        if (isFranchiseCareerLoyaltyActive(player)) return false;
        if (hasFamilyOnRoster(player, roster, currentYear)) return false;
        if (coreIds.has(player.internalId)) return false;
        if (hasActiveInjury(player) && !isActiveNonGuaranteed(player) && !isActiveTwoWay(player)) return false;
        if (isRecentlySigned(player) && !isActiveNonGuaranteed(player)) return false;
        if (hasRegularSeasonAppearance(player)) return false;
        if (isActiveNonGuaranteed(player)) return true;
        const draftYear = (player as any).draft?.year;
        if (typeof draftYear === 'number' && currentYear - draftYear <= 2) return false;
        const ovrForCheck = playerOverall(player);
        if ((player as any).birdRightsResignedThisYear === currentYear) return false;
        const yearsLeft = getRemainingYearsGuaranteed(player, currentYear);
        const age = playerAge(player, currentYear);
        const remaining = getRemainingGuaranteedUSD(player, currentYear);
        if (ovrForCheck >= 80 && !(age >= 35 && yearsLeft <= 1)) return false;
        if (remaining > salaryCapUSD * maxBuyoutPctOfCap && !(ovrForCheck < 72 && age >= 35)) return false;
        const isCheapEnoughForBuyout = remaining < salaryCapUSD * 0.05;
        const isBuyoutCandidate = yearsLeft <= 1 && (age >= 32 || isRebuilding) && isCheapEnoughForBuyout;
        if (isBuyoutCandidate) return true;
        if (yearsLeft >= 2 && remaining >= salaryCapUSD * protectGuaranteedRemainingPct) return false;
        if (ovrForCheck < protectGuaranteedOvr) return true;
        return remaining < salaryCapUSD * protectGuaranteedRemainingPct;
      };

      const nonGuaranteedRoster = roster.filter(player => canCut(player) && isActiveNonGuaranteed(player)).sort(sortFn);
      const gLeaguePlayers = roster.filter(player => canCut(player) && !isActiveNonGuaranteed(player) && !!(player as any).gLeagueAssigned).sort(sortFn);
      const standardPool = roster.filter(player => canCut(player) && !isActiveNonGuaranteed(player) && !(player as any).gLeagueAssigned).sort(sortFn);
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
          wasNonGuaranteed: isActiveNonGuaranteed(player),
          ...(forced ? { forced: true } : {}),
        });
      };

      for (let index = 0; index < excess && index < trimPool.length; index++) {
        pushWaiver(trimPool[index]);
      }
      if (teamWaivers.length < excess) {
        const forcedPool = buildForcedTrimPool(roster, selectedIds, sortFn, true, coreIds);
        for (let index = 0; teamWaivers.length < excess && index < forcedPool.length; index++) {
          pushWaiver(forcedPool[index], true);
        }
      }
      if (teamWaivers.length < excess && isOpeningDayDeadline) {
        const deadlinePool = roster
          .filter(player => !selectedIds.has(player.internalId))
          .filter(player => !isFranchiseCareerLoyaltyActive(player))
          .filter(player => !hasFamilyOnRoster(player, roster, currentYear))
          .sort(sortFn);
        for (let index = 0; teamWaivers.length < excess && index < deadlinePool.length; index++) {
          pushWaiver(deadlinePool[index], true);
        }
      }
      if (teamWaivers.length > 0) {
        const forcedCount = teamWaivers.filter(entry => entry.forced).length;
        simDebug('roster-trim', () => (
          `[RosterTrim] Month=${month}, team=${team.name}, roster=${roster.length} (gl=${gLeaguePlayers.length}), limit=${effectiveLimit}, sortBy=${sortByPot ? 'POT' : 'OVR'}, trimmed=${teamWaivers.length}${forcedCount ? ` forced=${forcedCount}` : ''}: ${teamWaivers.map(entry => entry.playerName).join(', ')}`
        ), { teamId: team.id, trimmed: teamWaivers.length, forced: forcedCount });
      }
      results.push(...teamWaivers);
    }

    const twoWayRoster = twoWayRosterActive ? state.players.filter(player => player.tid === team.id && isActiveTwoWay(player)) : [];
    if (twoWayRoster.length > maxTwoWay) {
      const excessTwoWay = twoWayRoster.length - maxTwoWay;
      const fullRosterForFamilyCheck = state.players.filter(player => player.tid === team.id);
      const sortedTwoWay = [...twoWayRoster]
        .filter(player => !isFranchiseCareerLoyaltyActive(player))
        .filter(player => !hasFamilyOnRoster(player, fullRosterForFamilyCheck, currentYear))
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
        simDebug('roster-trim', () => (
          `[RosterTrim-2W] Month=${month}, team=${team.name}, twoWay=${twoWayRoster.length}, cap=${maxTwoWay}, trimmed=${teamTwoWayWaivers.length}: ${teamTwoWayWaivers.map(entry => entry.playerName).join(', ')}`
        ), { teamId: team.id, trimmed: teamTwoWayWaivers.length });
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
  const maxStandard = getStandardRosterLimit(state.leagueStats as any);
  const maxTwoWay = getTwoWayRosterLimit(state.leagueStats);
  if (maxTwoWay <= 0) return [];
  const isActiveTwoWay = (player: NBAPlayer): boolean => isTwoWayContract(player, state.leagueStats);
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const isPreseasonPeriod = isLeagueTrainingCampWindow(state.date, state.leagueStats);
  if (isPreseasonPeriod) return [];

  const thresholds = getCapThresholds(state.leagueStats);
  const results: PromotionResult[] = [];

  for (const team of state.teams) {
    if (team.id === userTeamId) continue;

    const teamPlayers = state.players.filter(player => player.tid === team.id);
    const standardPlayers = teamPlayers.filter(player => !isActiveTwoWay(player) && !(player as any).gLeagueAssigned);
    const twoWayPlayers = teamPlayers.filter(player => isActiveTwoWay(player));

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
    simDebug('roster-trim', () => (
      `[TwoWayPromotion] Month=${month}, promoted ${results.length} players: ${Object.entries(byTeam).map(([teamName, names]) => `${teamName}(${names.join(', ')})`).join('; ')}`
    ), { promoted: results.length });
  }

  return results;
}
