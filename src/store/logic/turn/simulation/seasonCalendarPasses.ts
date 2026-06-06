import { formatExternalSalary } from '../../../../constants';
import type { GameState, NBAPlayer as Player } from '../../../../types';
import { normalizeDate } from '../../../../utils/helpers';
import { routeUnsignedPlayers } from '../../../../services/externalSigningRouter';
import type { ExternalRoutingResult } from '../../../../services/externalSigningRouter';
import { getActiveUserBidMarketPlayerIds } from '../../../../services/freeAgencyBidding';
import { applyMidSeasonExtensionsPass, applySeasonEndExtensionsPass } from './extensionPasses';
import { applyDailyProgression, applySeasonalBreakouts } from '../../../../services/playerDevelopment/ProgressionEngine';
import { markLightningStrikes, resolveLightningStrikes } from '../../../../services/playerDevelopment/seasonalBreakouts';
import { markFatherTimeInjections, resolveFatherTimeInjections, applyMiddleClassBoosts } from '../../../../services/playerDevelopment/washedAlgorithm';
import { markBustLottery, resolveBustLottery } from '../../../../services/playerDevelopment/bustLottery';
import { markTrainingCampShuffle, resolveTrainingCampChanges } from '../../../../services/playerDevelopment/trainingCampShuffle';
import { runDailyDeathPass } from '../../../../services/playerDevelopment/deathEngine';

type SeasonCalendarPassResult = {
  stateWithSim: GameState;
  simDateNorm: string;
  isPlayoffDay: boolean;
  extMonth: number;
};

export function applySeasonCalendarPasses(stateWithSim: GameState): SeasonCalendarPassResult {
  const simDateNorm = normalizeDate(stateWithSim.date);
  const seasonStartDate = `${stateWithSim.leagueStats.year - 1}-10-01`;
  if (simDateNorm === seasonStartDate) {
    const { players: playersWithEvents, events } = applySeasonalBreakouts(
      stateWithSim.players,
      stateWithSim.leagueStats.year,
      stateWithSim.saveId ?? 'default',
    );
    stateWithSim = { ...stateWithSim, players: playersWithEvents };
    void events;
  }

  const prePreseasonDate = `${stateWithSim.leagueStats.year - 1}-10-01`;
  if (simDateNorm === prePreseasonDate) {
    console.log(`[OSPLAN] simulationHandler.preCampOct1 fire date=${stateWithSim.date}`);
    if (stateWithSim.seasonPreviewDismissed && (stateWithSim.seasonHistory ?? []).length > 0) {
      stateWithSim = { ...stateWithSim, seasonPreviewDismissed: false };
    }

    const retireYear = stateWithSim.leagueStats.year;
    const protectedFAMarketPlayerIds = getActiveUserBidMarketPlayerIds(stateWithSim);
    const loyalRetirees: Player[] = [];
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
      const txns: Array<{ season: number; tid: number }> = (p as any).transactions ?? [];
      const priorTidFromTxn = txns.length > 0
        ? [...txns].sort((a, b) => b.season - a.season).find(t => t.tid >= 0 && t.tid <= 29)?.tid ?? -1
        : -1;
      const statsTid = ((p as any).stats ?? [])
        .filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0 && (s.tid ?? -1) >= 0 && (s.tid ?? -1) <= 29)
        .sort((a: any, b: any) => (b.season ?? 0) - (a.season ?? 0))[0]?.tid ?? -1;
      const priorTid = priorTidFromTxn >= 0 ? priorTidFromTxn : statsTid;
      if (priorTid < 0) return p;
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
        const txns2: Array<{ season: number; tid: number }> = (p as any).transactions ?? [];
        const priorTid2 = txns2.length > 0
          ? [...txns2].sort((a, b) => b.season - a.season).find(t => t.tid >= 0 && t.tid <= 29)?.tid ?? -1
          : ((p as any).stats ?? [])
            .filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0 && (s.tid ?? -1) >= 0 && (s.tid ?? -1) <= 29)
            .sort((a: any, b: any) => (b.season ?? 0) - (a.season ?? 0))[0]?.tid ?? -1;
        const priorTeamName2 = stateWithSim.teams.find(t => t.id === priorTid2)?.name ?? 'their former team';
        return {
          text: `${p.name} has retired rather than sign with another team — a career ${priorTeamName2}.`,
          date: stateWithSim.date,
          type: 'Retirement',
          playerIds: [p.internalId],
        };
      });
      const loyalRetireNews = loyalRetirees.slice(0, 3).map((p, i) => {
        const txns3: Array<{ season: number; tid: number }> = (p as any).transactions ?? [];
        const priorTid3 = txns3.length > 0
          ? [...txns3].sort((a, b) => b.season - a.season).find(t => t.tid >= 0 && t.tid <= 29)?.tid ?? -1
          : ((p as any).stats ?? [])
            .filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0 && (s.tid ?? -1) >= 0 && (s.tid ?? -1) <= 29)
            .sort((a: any, b: any) => (b.season ?? 0) - (a.season ?? 0))[0]?.tid ?? -1;
        const priorTeamName3 = stateWithSim.teams.find(t => t.id === priorTid3)?.name ?? 'their former team';
        return {
          id: `loyal-retire-${p.internalId}-${Date.now()}-${i}`,
          headline: `${p.name} Retires a ${priorTeamName3}`,
          content: `${p.name} has announced retirement rather than sign with another franchise. A loyal servant to the ${priorTeamName3}.`,
          date: stateWithSim.date,
          type: 'roster' as const,
          isNew: true,
          read: false,
        };
      });
      stateWithSim = {
        ...stateWithSim,
        news: [...loyalRetireNews, ...(stateWithSim.news ?? [])].slice(0, 200),
        history: [...(stateWithSim.history ?? []), ...loyalRetireHistory],
      };
    }

    const protectedRoutingPlayerIds = getActiveUserBidMarketPlayerIds(stateWithSim);
    const { results: routedResults, players: routedPlayers } = routeUnsignedPlayers(stateWithSim, {
      protectedPlayerIds: protectedRoutingPlayerIds,
      excludedDestinationLeagues: (stateWithSim.leagueStats as any)?.uiMode === 'pba_isolated'
        ? new Set<ExternalRoutingResult['league']>(['PBA'])
        : undefined,
    });
    if (routedResults.length > 0) {
      stateWithSim = { ...stateWithSim, players: routedPlayers };
      const routingNews = routedResults.slice(0, 5).map((r, i) => {
        const isDomestic = r.league === 'G-League';
        const salaryStr = r.salaryUSD ? formatExternalSalary(r.salaryUSD, r.league) + '/yr' : '';
        return {
          id: `ext-route-${r.playerId}-${Date.now()}-${i}`,
          headline: `${r.playerName} Signs ${isDomestic ? 'with' : 'Overseas with'} ${r.teamName}`,
          content: `Unable to land an NBA deal, ${r.playerName} has signed with ${r.teamName} in the ${r.league}${salaryStr ? ' for ' + salaryStr : ''}.`,
          date: stateWithSim.date,
          type: 'roster' as const,
          isNew: true,
          read: false,
        };
      });
      const routingHistory = routedResults.map(r => {
        const isDomestic = r.league === 'G-League';
        const salaryStr = r.salaryUSD ? formatExternalSalary(r.salaryUSD, r.league) + '/yr' : '';
        return {
          text: `${r.playerName} signs ${isDomestic ? 'with' : 'overseas with'} ${r.teamName} (${r.league})${salaryStr ? ': ' + salaryStr : ''}.`,
          date: stateWithSim.date,
          type: 'Signing',
          league: r.league,
          playerIds: [r.playerId],
        };
      });
      stateWithSim = {
        ...stateWithSim,
        news: [...routingNews, ...(stateWithSim.news ?? [])].slice(0, 200),
        history: [...(stateWithSim.history ?? []), ...routingHistory],
      };
    }
  }

  const trainingCampDate = `${stateWithSim.leagueStats.year - 1}-10-01`;
  if (simDateNorm === trainingCampDate) {
    const currentYear = stateWithSim.leagueStats.year;
    const { players: p1 } = markLightningStrikes(
      stateWithSim.players,
      currentYear,
      trainingCampDate,
      `${currentYear}-04-01`,
      stateWithSim.saveId ?? 'default',
    );
    stateWithSim = { ...stateWithSim, players: p1 };

    const ftWindowStart = `${currentYear}-03-15`;
    const ftWindowEnd = `${currentYear}-05-01`;
    const { players: p2 } = markFatherTimeInjections(
      stateWithSim.players,
      currentYear,
      trainingCampDate,
      ftWindowEnd,
      stateWithSim.saveId ?? 'default',
      ftWindowStart,
    );
    stateWithSim = { ...stateWithSim, players: p2 };

    const { players: p3 } = applyMiddleClassBoosts(stateWithSim.players, currentYear, 0, stateWithSim.saveId ?? 'default');
    stateWithSim = { ...stateWithSim, players: p3 };

    const { players: pBust } = markBustLottery(
      stateWithSim.players,
      currentYear,
      trainingCampDate,
      `${currentYear}-04-01`,
      stateWithSim.saveId ?? 'default',
    );
    stateWithSim = { ...stateWithSim, players: pBust };

    const campEnd = `${currentYear - 1}-10-23`;
    const { players: pCamp } = markTrainingCampShuffle(
      stateWithSim.players,
      currentYear,
      trainingCampDate,
      campEnd,
      stateWithSim.saveId ?? 'default',
    );
    stateWithSim = { ...stateWithSim, players: pCamp };
  }

  const postAsbDate = `${stateWithSim.leagueStats.year}-02-17`;
  if (simDateNorm === postAsbDate) {
    const { players: p4 } = applyMiddleClassBoosts(
      stateWithSim.players,
      stateWithSim.leagueStats.year,
      1,
      stateWithSim.saveId ?? 'default',
    );
    stateWithSim = { ...stateWithSim, players: p4 };
  }

  {
    const currentYear = stateWithSim.leagueStats.year;
    const { players: p5 } = resolveLightningStrikes(stateWithSim.players, simDateNorm, currentYear);
    stateWithSim = { ...stateWithSim, players: p5 };

    const { players: p6 } = resolveFatherTimeInjections(stateWithSim.players, simDateNorm, currentYear);
    stateWithSim = { ...stateWithSim, players: p6 };

    const { players: p7 } = resolveBustLottery(stateWithSim.players, simDateNorm, currentYear);
    stateWithSim = { ...stateWithSim, players: p7 };

    const { players: pCampResolve } = resolveTrainingCampChanges(stateWithSim.players, simDateNorm, currentYear);
    stateWithSim = { ...stateWithSim, players: pCampResolve };
  }

  {
    const deathPass = runDailyDeathPass(stateWithSim);
    if (deathPass.deaths.length > 0) {
      const deathNews = deathPass.deaths.map((death, index) => {
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
      });
      const deathHistory = deathPass.deaths.map(death => ({
        text: death.cause.startsWith(death.name)
          ? death.cause
          : `${death.name} died at age ${death.age}. Cause of death: ${death.cause}.`,
        date: stateWithSim.date,
        type: 'Death',
        ...(death.playerId ? { playerIds: [death.playerId] } : {}),
      }));
      stateWithSim = {
        ...stateWithSim,
        players: deathPass.players,
        staff: deathPass.staff,
        staffFreeAgents: deathPass.staffFreeAgents,
        news: [...deathNews, ...(stateWithSim.news ?? [])].slice(0, 200),
        history: [...(stateWithSim.history ?? []), ...deathHistory],
        pendingDeathToasts: [
          ...(stateWithSim.pendingDeathToasts ?? []),
          ...deathPass.pendingDeathToasts,
        ],
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

  const isPlayoffDay = !!(stateWithSim.playoffs && !stateWithSim.playoffs.bracketComplete);
  stateWithSim = {
    ...stateWithSim,
    players: applyDailyProgression(
      stateWithSim.players,
      isPlayoffDay,
      stateWithSim.date,
      stateWithSim.leagueStats.year,
      stateWithSim.teams,
    ),
  };

  const [, extMonth] = simDateNorm.split('-').map(Number);
  stateWithSim = applyMidSeasonExtensionsPass(stateWithSim, isPlayoffDay, extMonth);
  stateWithSim = applySeasonEndExtensionsPass(stateWithSim, isPlayoffDay, extMonth);

  return {
    stateWithSim,
    simDateNorm,
    isPlayoffDay,
    extMonth,
  };
}
