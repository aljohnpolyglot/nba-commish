import { formatExternalSalary } from '../../../../constants';
import type { GameState, NBAPlayer as Player, NBATeam } from '../../../../types';
import { normalizeDate } from '../../../../utils/helpers';
import { routeUnsignedPlayers } from '../../../../services/externalSigningRouter';
import { getActiveUserBidMarketPlayerIds } from '../../../../services/freeAgencyBidding';
import { applyMidSeasonExtensionsPass, applySeasonEndExtensionsPass } from './extensionPasses';
import { applyDailyProgression, applySeasonalBreakouts } from '../../../../services/playerDevelopment/ProgressionEngine';
import { markLightningStrikes, resolveLightningStrikes } from '../../../../services/playerDevelopment/seasonalBreakouts';
import { markFatherTimeInjections, resolveFatherTimeInjections, applyMiddleClassBoosts } from '../../../../services/playerDevelopment/washedAlgorithm';
import { markBustLottery, resolveBustLottery } from '../../../../services/playerDevelopment/bustLottery';
import { markTrainingCampShuffle, resolveTrainingCampChanges } from '../../../../services/playerDevelopment/trainingCampShuffle';
import { applyRookieTrainingCampProgression } from '../../../../services/playerDevelopment/rookieTrainingCampProgression';
import { runDailyDeathPass } from '../../../../services/playerDevelopment/deathEngine';
import {
  autoResolveDueDeathMemorials,
  buildDeathMemorialInboxPatch,
} from '../../../../services/playerDevelopment/deathMemorial';
import { SettingsManager } from '../../../../services/SettingsManager';
import { getLeagueCalendarDates } from '../../../../services/leagueCalendar';
import { addGameDays, toISODateString } from '../../../../utils/dateUtils';
import {
  captureDevelopmentBaseline,
  resolveFatherTimeDevelopmentWindow,
  getDevelopmentPreparationAction,
} from '../../../../services/playerDevelopment/progressionTimeline';
import { resolvePool } from '../../../../services/awards/pool';
import type { UIMode } from '../../../../services/awards/types';
import { getSimulationSeed } from '../../../../services/saveIdentity';
import {
  resolveRetirementCareerIdentity,
  shouldApplyLoyalFreeAgentRetirement,
} from '../../../../services/retirement/retirementEventIdentity';
import { getTeamFullName } from '../../../../utils/teamNames';
import { resolveSeasonRolloverPlayerScope } from '../../../../services/logic/seasonRollover/leagueScope';
import { isPlayerInLeagueScope } from '../../../../utils/playerLeagueScope';
import { resolveAnyTeam } from '../../../../utils/teamLookup';
import { simDebug } from '../../../../utils/simDebug';
import { recordSimulationPerf } from '../../../../services/simulation/simulationPerfDebug';
import { applyExpiringPlayerOutreach } from '../../../../services/freeAgency/expiringPlayerOutreach';
import {
  reconcileTeamStaffDeaths,
  syncStaffDirectoryHeadCoaches,
} from '../../../../services/staff/activeStaffContracts';
import { processManagedTeamStaffHiringVacancies } from '../../../../services/staff/nbaRealStaffSeed';
import { applyKnownNaturalizationPass } from '../../../../services/identity/playerNaturalization';
import { applyTradeTargetOutreach } from '../../../../services/messages/tradeTargetOutreach';

type SeasonCalendarPassResult = {
  stateWithSim: GameState;
  simDateNorm: string;
  isPlayoffDay: boolean;
  extMonth: number;
};

export function applyExternalSigningRoutingPass(
  state: GameState,
  includeDerivedMedia = true,
  cadence?: { day: number; totalDays: number },
): GameState {
  const isolatedMode = state.leagueStats?.uiMode === 'euro_isolated' || state.leagueStats?.uiMode === 'pba_isolated';
  if (isolatedMode) return state;
  const { results, players } = routeUnsignedPlayers(state, {
    protectedPlayerIds: getActiveUserBidMarketPlayerIds(state),
    ...(cadence ? {
      routingDay: cadence.day,
      routingDays: cadence.totalDays,
      excludedDestinationLeagues: new Set(['PBA'] as const),
    } : {}),
  });
  if (results.length === 0) return state;
  const describe = (result: typeof results[number]) => {
    const isDomestic = result.league === 'G-League';
    const salary = result.salaryUSD ? `${formatExternalSalary(result.salaryUSD, result.league)}/yr` : '';
    return { isDomestic, salary };
  };
  return {
    ...state,
    players,
    news: includeDerivedMedia
      ? [
          ...results.slice(0, 5).map((result, index) => {
            const { isDomestic, salary } = describe(result);
            return {
              id: `ext-route-${result.playerId}-${Date.now()}-${index}`,
              headline: `${result.playerName} Signs ${isDomestic ? 'with' : 'Overseas with'} ${result.teamName}`,
              content: `Unable to land an NBA deal, ${result.playerName} has signed with ${result.teamName} in the ${result.league}${salary ? ` for ${salary}` : ''}.`,
              date: state.date,
              type: 'roster' as const,
              isNew: true,
              read: false,
            };
          }),
          ...(state.news ?? []),
        ].slice(0, 200)
      : state.news,
    history: [
      ...(state.history ?? []),
      ...results.map(result => {
        const { isDomestic, salary } = describe(result);
        return {
          text: `${result.playerName} signs ${isDomestic ? 'with' : 'overseas with'} ${result.teamName} (${result.league})${salary ? `: ${salary}` : ''}.`,
          date: state.date,
          type: 'Signing',
          league: result.league,
          playerIds: [result.playerId],
        };
      }),
    ],
  };
}

const perfNow = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

export function applySeasonCalendarPasses(
  stateWithSim: GameState,
  includeDerivedMedia = true,
): SeasonCalendarPassResult {
  const passStart = perfNow();
  stateWithSim = applyKnownNaturalizationPass(stateWithSim);
  const passDate = normalizeDate(stateWithSim.date);
  const recordStage = (
    stage: string,
    start: number,
    mutated: boolean,
    details: Record<string, unknown> = {},
  ) => recordSimulationPerf({
    engine: 'season-calendar-pass',
    stage,
    date: passDate,
    mutated,
    totalMs: perfNow() - start,
    ...details,
  });
  // Development, death, retirement, and training-camp passes belong to the
  // active league bucket. Multi-league saves keep external worlds in the same
  // player array, but advancing an NBA day must not age or rerate Euro/WNBA/PBA
  // players. Work on the canonical rollover scope and merge it back in place.
  const scopeStart = perfNow();
  const universePlayers = stateWithSim.players;
  const { playerScope, activeTeamIds } = resolveSeasonRolloverPlayerScope(stateWithSim);
  const scopedPlayers = universePlayers.filter(player => (
    activeTeamIds.has(Number(player.tid)) || isPlayerInLeagueScope(player, playerScope, activeTeamIds)
  ));
  const scopeMatchesUniverse = scopedPlayers.length === universePlayers.length;
  const scopedPlayerIds = scopeMatchesUniverse
    ? undefined
    : new Set(scopedPlayers.map(player => player.internalId));
  if (!scopeMatchesUniverse) stateWithSim = { ...stateWithSim, players: scopedPlayers };
  recordStage('scope-and-narrow', scopeStart, scopedPlayers.length !== universePlayers.length, {
    universePlayers: universePlayers.length,
    scopedPlayers: scopedPlayers.length,
    activeTeams: activeTeamIds.size,
  });
  const preparationDecisionStart = perfNow();
  const simulationSeed = getSimulationSeed(stateWithSim);
  const simDateNorm = normalizeDate(stateWithSim.date);
  const seasonYear = stateWithSim.leagueStats.year;
  const calendarDates = getLeagueCalendarDates(seasonYear, stateWithSim.leagueStats);
  const developmentStart = calendarDates.trainingCampStart
    ?? calendarDates.preseasonStart
    ?? calendarDates.regularSeasonStart;
  const developmentStartDate = toISODateString(developmentStart);
  const regularSeasonStartDate = toISODateString(calendarDates.regularSeasonStart);
  const developmentPreparationAction = getDevelopmentPreparationAction({
    currentDate: simDateNorm,
    developmentStartDate,
    regularSeasonStartDate,
    season: seasonYear,
    preparedSeason: stateWithSim.leagueStats.playerDevelopmentPreparedSeason,
    players: stateWithSim.players,
  });
  const shouldPrepareDevelopment = developmentPreparationAction === 'prepare';
  recordStage('development-preparation-decision', preparationDecisionStart, developmentPreparationAction !== 'none', {
    action: developmentPreparationAction,
  });
  const preparationStart = perfNow();
  const preparationPlayersBefore = stateWithSim.players;
  if (shouldPrepareDevelopment) {
    stateWithSim = {
      ...stateWithSim,
      players: captureDevelopmentBaseline(stateWithSim.players, simDateNorm),
    };
    const { players: playersWithEvents, events } = applySeasonalBreakouts(
      stateWithSim.players,
      stateWithSim.leagueStats.year,
      simulationSeed,
    );
    stateWithSim = { ...stateWithSim, players: playersWithEvents };
    void events;
  }

  if (shouldPrepareDevelopment) {
    simDebug('lifecycle', () => `[OSPLAN] simulationHandler.preCamp fire date=${stateWithSim.date}`, {
      event: 'pre-camp-pass',
      date: stateWithSim.date,
    });
    if (stateWithSim.seasonPreviewDismissed && (stateWithSim.seasonHistory ?? []).length > 0) {
      stateWithSim = { ...stateWithSim, seasonPreviewDismissed: false };
    }

    const retireYear = stateWithSim.leagueStats.year;
    const protectedFAMarketPlayerIds = getActiveUserBidMarketPlayerIds(stateWithSim);
    const loyalRetirees: Player[] = [];
    const loyalCareerIdentityByPlayerId = new Map<string, ReturnType<typeof resolveRetirementCareerIdentity>>();
    const loyalRetiredPlayers = stateWithSim.players.map(p => {
      if (p.tid >= 0) return p;
      if ((p as any).status !== 'Free Agent') return p;
      if (protectedFAMarketPlayerIds.has(p.internalId)) return p;
      if ((p as any).diedYear) return p;
      const traits: string[] = (p as any).moodTraits ?? [];
      if (!traits.includes('LOYAL')) return p;
      const age = p.born?.year ? retireYear - p.born.year : (p.age ?? 0);
      if (age < 30) return p;
      const yearsOfService = ((p as any).stats ?? [])
        .filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
      if (yearsOfService < 3) return p;
      if (!shouldApplyLoyalFreeAgentRetirement(
        p,
        stateWithSim.teams,
        stateWithSim.nonNBATeams ?? [],
        stateWithSim.leagueStats?.uiMode,
      )) return p;
      const careerIdentity = resolveRetirementCareerIdentity(p, stateWithSim.teams, stateWithSim.nonNBATeams ?? []);
      loyalCareerIdentityByPlayerId.set(p.internalId, careerIdentity);
      loyalRetirees.push(p);
      return {
        ...p,
        status: 'Retired' as const,
        tid: -1,
        retiredYear: retireYear,
        contract: undefined,
      } as any;
    });
    if (loyalRetirees.length > 0) {
      stateWithSim = { ...stateWithSim, players: loyalRetiredPlayers };
      const loyalRetireHistory = loyalRetirees.map(p => {
        const identity = loyalCareerIdentityByPlayerId.get(p.internalId)!;
        const careerTeam = [...stateWithSim.teams, ...(stateWithSim.nonNBATeams ?? [])]
          .find(team => Number((team as any).id ?? (team as any).tid) === identity.primaryCareerTeamId);
        const priorTeamName2 = getTeamFullName(careerTeam) || 'their former team';
        return {
          text: `${p.name} has retired rather than sign with another team — a career ${priorTeamName2}.`,
          date: stateWithSim.date,
          type: 'Retirement',
          playerIds: [p.internalId],
          eventType: 'retirement',
          personId: identity.personId,
          sourceIds: identity.sourceIds,
          league: identity.league,
          teamIds: identity.careerTeamIds,
          careerTeamId: identity.primaryCareerTeamId,
        };
      });
      const loyalRetireNews = includeDerivedMedia ? loyalRetirees.slice(0, 3).map((p, i) => {
        const identity = loyalCareerIdentityByPlayerId.get(p.internalId)!;
        const careerTeam = [...stateWithSim.teams, ...(stateWithSim.nonNBATeams ?? [])]
          .find(team => Number((team as any).id ?? (team as any).tid) === identity.primaryCareerTeamId);
        const priorTeamName3 = getTeamFullName(careerTeam) || 'their former team';
        return {
          id: `loyal-retire-${p.internalId}-${Date.now()}-${i}`,
          headline: `${p.name} Retires a ${priorTeamName3}`,
          content: `${p.name} has announced retirement rather than sign with another franchise. A loyal servant to the ${priorTeamName3}.`,
          date: stateWithSim.date,
          type: 'roster' as const,
          tid: identity.primaryCareerTeamId,
          playerIds: [p.internalId],
          isNew: true,
          read: false,
        };
      }) : [];
      stateWithSim = {
        ...stateWithSim,
        news: includeDerivedMedia
          ? [...loyalRetireNews, ...(stateWithSim.news ?? [])].slice(0, 200)
          : stateWithSim.news,
        history: [...(stateWithSim.history ?? []), ...loyalRetireHistory],
      };
    }

    stateWithSim = applyExternalSigningRoutingPass(stateWithSim, includeDerivedMedia);
  }

  recordStage('development-preparation', preparationStart, stateWithSim.players !== preparationPlayersBefore, {
    action: developmentPreparationAction,
  });

  const trainingCampDate = developmentStartDate;
  const developmentMarkersStart = perfNow();
  const markerPlayersBefore = stateWithSim.players;
  if (shouldPrepareDevelopment) {
    const currentYear = stateWithSim.leagueStats.year;
    const regularSeasonEnd = toISODateString(calendarDates.regularSeasonEnd);
    const fatherTimeWindow = resolveFatherTimeDevelopmentWindow(calendarDates);
    const { players: p1 } = markLightningStrikes(
      stateWithSim.players,
      currentYear,
      trainingCampDate,
      regularSeasonEnd,
      simulationSeed,
    );
    stateWithSim = { ...stateWithSim, players: p1 };

    const { players: p2 } = markFatherTimeInjections(
      stateWithSim.players,
      currentYear,
      trainingCampDate,
      fatherTimeWindow.endDate,
      simulationSeed,
      fatherTimeWindow.startDate,
    );
    stateWithSim = { ...stateWithSim, players: p2 };

    const { players: p3 } = applyMiddleClassBoosts(stateWithSim.players, currentYear, 0, simulationSeed);
    stateWithSim = { ...stateWithSim, players: p3 };

    const { players: pBust } = markBustLottery(
      stateWithSim.players,
      currentYear,
      trainingCampDate,
      regularSeasonEnd,
      simulationSeed,
    );
    stateWithSim = { ...stateWithSim, players: pBust };

    const campEnd = toISODateString(addGameDays(calendarDates.regularSeasonStart, -1));
    const uiMode = (stateWithSim.leagueStats.uiMode ?? 'nba') as UIMode;
    const activeTeamIds = resolvePool('all-active', {
      teams: stateWithSim.teams,
      nonNBATeams: stateWithSim.nonNBATeams,
      uiMode,
    });
    const { players: rookieCampPlayers } = applyRookieTrainingCampProgression(
      stateWithSim.players,
      currentYear,
      uiMode,
      activeTeamIds,
      simulationSeed,
    );
    stateWithSim = { ...stateWithSim, players: rookieCampPlayers };
    const { players: pCamp } = markTrainingCampShuffle(
      stateWithSim.players,
      currentYear,
      trainingCampDate,
      campEnd,
      simulationSeed,
    );
    stateWithSim = { ...stateWithSim, players: pCamp };
  }
  recordStage('development-markers', developmentMarkersStart, stateWithSim.players !== markerPlayersBefore);

  const preparationStampStart = perfNow();
  const leagueStatsBeforeStamp = stateWithSim.leagueStats;
  if (developmentPreparationAction !== 'none') {
    stateWithSim = {
      ...stateWithSim,
      leagueStats: {
        ...stateWithSim.leagueStats,
        playerDevelopmentPreparedSeason: seasonYear,
      },
    };
  }
  recordStage('development-preparation-stamp', preparationStampStart, stateWithSim.leagueStats !== leagueStatsBeforeStamp);

  const postAllStarStart = perfNow();
  const postAllStarPlayersBefore = stateWithSim.players;
  const postAllStarDate = calendarDates.allStarEnd
    ? toISODateString(addGameDays(calendarDates.allStarEnd, 1))
    : undefined;
  if (postAllStarDate && simDateNorm === postAllStarDate) {
    const { players: p4 } = applyMiddleClassBoosts(
      stateWithSim.players,
      stateWithSim.leagueStats.year,
      1,
      simulationSeed,
    );
    stateWithSim = { ...stateWithSim, players: p4 };
  }
  recordStage('post-all-star-boost', postAllStarStart, stateWithSim.players !== postAllStarPlayersBefore);

  const scheduledDevelopmentStart = perfNow();
  const scheduledPlayersBefore = stateWithSim.players;
  {
    const currentYear = stateWithSim.leagueStats.year;
    let hasLightning = false;
    let hasFatherTime = false;
    let hasBust = false;
    let hasCamp = false;
    for (const player of stateWithSim.players) {
      hasLightning ||= !!(player as any).pendingLightningBoost;
      hasFatherTime ||= !!(player as any).pendingFatherTime;
      hasBust ||= !!(player as any).pendingBustEvent;
      hasCamp ||= !!(player as any).pendingCampBoost;
      if (hasLightning && hasFatherTime && hasBust && hasCamp) break;
    }
    if (hasLightning) {
      const { players } = resolveLightningStrikes(stateWithSim.players, simDateNorm, currentYear);
      if (players !== stateWithSim.players) stateWithSim = { ...stateWithSim, players };
    }
    if (hasFatherTime) {
      const { players } = resolveFatherTimeInjections(stateWithSim.players, simDateNorm, currentYear);
      if (players !== stateWithSim.players) stateWithSim = { ...stateWithSim, players };
    }
    if (hasBust) {
      const { players } = resolveBustLottery(stateWithSim.players, simDateNorm, currentYear);
      if (players !== stateWithSim.players) stateWithSim = { ...stateWithSim, players };
    }
    if (hasCamp) {
      const { players } = resolveTrainingCampChanges(stateWithSim.players, simDateNorm, currentYear);
      if (players !== stateWithSim.players) stateWithSim = { ...stateWithSim, players };
    }
  }
  recordStage('scheduled-development-resolution', scheduledDevelopmentStart, stateWithSim.players !== scheduledPlayersBefore);

  const deathPassStart = perfNow();
  const deathStateBefore = stateWithSim;
  let deathCount = 0;
  {
    const deathPass = runDailyDeathPass(stateWithSim);
    deathCount = deathPass.deaths.length;
    if (deathPass.deaths.length > 0) {
      const staffDeaths = deathPass.deaths.filter(death => death.entityType === 'staff');
      let nextStaffFreeAgents = deathPass.staffFreeAgents;
      const staffReplacementHistory: Array<{ text: string; date: string; type: 'Personnel'; tid: number }> = [];
      const currentYear = stateWithSim.leagueStats.year;
      const userTeamId = stateWithSim.gameMode === 'gm' ? stateWithSim.userTeamId : undefined;
      const teamsAfterStaffDeaths = stateWithSim.teams.map(team => {
        const reconciled = reconcileTeamStaffDeaths(team, currentYear, staffDeaths, {
          activeRosterPlayers: stateWithSim.players,
        });
        if (!reconciled.changed) return team;
        const teamId = Number(team.id);
        if (reconciled.promoted) {
          staffReplacementHistory.push({
            text: `${getTeamFullName(team)} promoted ${reconciled.promoted.name} to Head Coach.`,
            date: stateWithSim.date,
            type: 'Personnel',
            tid: teamId,
          });
        }
        if (teamId === userTeamId) return reconciled.team as NBATeam;
        const filled = processManagedTeamStaffHiringVacancies(
          reconciled.team as NBATeam,
          currentYear,
          stateWithSim.date,
          nextStaffFreeAgents,
        );
        const consumed = new Set(filled.consumedFreeAgentIds);
        nextStaffFreeAgents = nextStaffFreeAgents.filter(member => !member.id || !consumed.has(member.id));
        staffReplacementHistory.push(...filled.historyEntries);
        return filled.teams[0] ?? reconciled.team as NBATeam;
      });
      const staffAfterDeaths = syncStaffDirectoryHeadCoaches(
        deathPass.staff,
        teamsAfterStaffDeaths,
        currentYear,
      );
      const deathNews = includeDerivedMedia ? deathPass.deaths.map((death, index) => {
        const fullSentence = death.cause.startsWith(death.name);
        const teamLead = death.teamName ? `${death.teamName} ` : '';
        const roleLead = death.roleLabel ? `${death.roleLabel} ` : '';
        const activeLead = death.wasActive
          ? death.entityType === 'staff'
            ? `${teamLead}${roleLead}`.trim()
            : `${teamLead}${roleLead}`.trim()
          : 'Former NBA ';
        return {
          id: `daily-death-${death.entityType}-${death.playerId ?? death.staffId ?? death.name}-${simDateNorm}-${index}`,
          headline: death.wasActive
            ? `${death.name} Passes Away at Age ${death.age}`
            : `${death.name} Dies at Age ${death.age}`,
          content: fullSentence
            ? death.cause
            : death.wasActive
              ? `${activeLead ? `${activeLead} ` : ''}${death.name} passed away at age ${death.age}. Cause of death: ${death.cause}.`
              : `${death.name} passed away at age ${death.age}. Cause of death: ${death.cause}.`,
          date: stateWithSim.date,
          type: death.wasActive ? 'player' as const : 'league' as const,
          isNew: true,
          read: false,
        };
      }) : [];
      const deathHistory = deathPass.deaths.map(death => ({
        text: death.cause.startsWith(death.name)
          ? death.cause
          : `${death.name} died at age ${death.age}. Cause of death: ${death.cause}.`,
        date: stateWithSim.date,
        type: 'Death',
        ...(death.playerId ? { playerIds: [death.playerId] } : {}),
      }));
      const memorialPatch = buildDeathMemorialInboxPatch(
        { ...stateWithSim, players: deathPass.players },
        deathPass.deaths,
        SettingsManager.getSettings().hofWSThreshold,
      );
      stateWithSim = {
        ...stateWithSim,
        players: deathPass.players,
        teams: teamsAfterStaffDeaths,
        staff: staffAfterDeaths ?? deathPass.staff,
        staffFreeAgents: nextStaffFreeAgents,
        news: includeDerivedMedia
          ? [...deathNews, ...(stateWithSim.news ?? [])].slice(0, 200)
          : stateWithSim.news,
        history: [...(stateWithSim.history ?? []), ...deathHistory, ...staffReplacementHistory],
        pendingDeathToasts: [
          ...(stateWithSim.pendingDeathToasts ?? []),
          ...deathPass.pendingDeathToasts,
        ],
        ...memorialPatch,
      };
    } else if (
      deathPass.players !== stateWithSim.players ||
      deathPass.staff !== stateWithSim.staff ||
      deathPass.staffFreeAgents !== (stateWithSim.staffFreeAgents ?? [])
    ) {
      stateWithSim = {
        ...stateWithSim,
        players: deathPass.players,
        staff: deathPass.staff,
        staffFreeAgents: deathPass.staffFreeAgents,
      };
    }
  }
  recordStage('death-pass', deathPassStart, stateWithSim !== deathStateBefore, { mutations: deathCount });

  const isPlayoffDay = !!(stateWithSim.playoffs && !stateWithSim.playoffs.bracketComplete);
  const dailyProgressionStart = perfNow();
  const dailyProgressionPlayersBefore = stateWithSim.players;
  stateWithSim = {
    ...stateWithSim,
    players: applyDailyProgression(
      stateWithSim.players,
      isPlayoffDay,
      stateWithSim.date,
      stateWithSim.leagueStats.year,
      [...activeTeamIds]
        .map(teamId => resolveAnyTeam(teamId, stateWithSim.teams, stateWithSim.nonNBATeams ?? []))
      .filter((team): team is NBATeam => team !== null),
    ),
  };
  recordStage('daily-progression', dailyProgressionStart, stateWithSim.players !== dailyProgressionPlayersBefore);

  const [, extMonth] = simDateNorm.split('-').map(Number);
  const midSeasonExtensionStart = perfNow();
  const stateBeforeMidSeasonExtensions = stateWithSim;
  stateWithSim = applyMidSeasonExtensionsPass(stateWithSim, isPlayoffDay, includeDerivedMedia);
  recordStage('mid-season-extensions', midSeasonExtensionStart, stateWithSim !== stateBeforeMidSeasonExtensions);
  const seasonEndExtensionStart = perfNow();
  const stateBeforeSeasonEndExtensions = stateWithSim;
  stateWithSim = applySeasonEndExtensionsPass(stateWithSim, isPlayoffDay);
  recordStage('season-end-extensions', seasonEndExtensionStart, stateWithSim !== stateBeforeSeasonEndExtensions);
  const expiringOutreachStart = perfNow();
  const stateBeforeExpiringOutreach = stateWithSim;
  stateWithSim = applyExpiringPlayerOutreach(stateWithSim);
  recordStage('expiring-player-outreach', expiringOutreachStart, stateWithSim !== stateBeforeExpiringOutreach);
  const deathMemorialStart = perfNow();
  const stateBeforeDeathMemorials = stateWithSim;
  stateWithSim = autoResolveDueDeathMemorials(stateWithSim);
  recordStage('death-memorials', deathMemorialStart, stateWithSim !== stateBeforeDeathMemorials);

  const remergeStart = perfNow();
  if (!scopeMatchesUniverse && scopedPlayerIds) {
    const updatedScopedPlayers = new Map(stateWithSim.players.map(player => [player.internalId, player]));
    const originalPlayerIds = new Set(universePlayers.map(player => player.internalId));
    stateWithSim = {
      ...stateWithSim,
      players: [
        ...universePlayers.map(player => (
          scopedPlayerIds.has(player.internalId) ? (updatedScopedPlayers.get(player.internalId) ?? player) : player
        )),
        ...stateWithSim.players.filter(player => !originalPlayerIds.has(player.internalId)),
      ],
    };
  }
  stateWithSim = applyTradeTargetOutreach(stateWithSim);
  recordStage('universe-remerge', remergeStart, !scopeMatchesUniverse, {
    universePlayers: universePlayers.length,
    scopedPlayers: scopedPlayers.length,
  });
  recordStage('total', passStart, stateWithSim.players !== universePlayers);

  return {
    stateWithSim,
    simDateNorm,
    isPlayoffDay,
    extMonth,
  };
}
