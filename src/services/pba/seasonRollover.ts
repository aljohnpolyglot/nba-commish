import type { GameState, NBAPlayer } from '../../types';
import { DEFAULT_CAP_INFLATION_AVERAGE } from '../../constants';
import { isFilipino, isRegisteredPbaRosterIdentity } from './importManager';
import { disablePbaSalaryCapFields } from './conferenceTransition';
import { getHistoricalPbaRuleOverrides } from './historicalCatalog';
import { getNextPbaSeasonKey } from './historyConfig';
import { getHistoricalPbaTeamIdentitySnapshot } from './historicalTypes';
import { processNBAStaffLifecycle } from '../staff/nbaRealStaffSeed';
import { getPbaHistoricalEconomyFactor } from './historicalEconomy';

type RolloverRunner = (state: GameState) => Partial<GameState>;

const teamIdOf = (team: any): number => Number(team?.tid ?? team?.id);

const isPbaCompetition = (value: unknown): boolean => String(value ?? '').startsWith('pba-');

const playerBelongsToPba = (player: NBAPlayer, pbaTids: Set<number>): boolean => {
  const tid = Number(player.tid);
  const previousTid = Number((player as any).pbaPreviousTid);
  const draftTid = Number((player as any).draft?.tid);
  const originalDraftTid = Number((player as any).draft?.originalTid);
  return pbaTids.has(tid)
    || pbaTids.has(previousTid)
    || pbaTids.has(draftTid)
    || pbaTids.has(originalDraftTid)
    || player.status === 'PBA'
    || (player as any).retiredFromLeague === 'PBA'
    || (player as any).hofLeague === 'PBA'
    || String((player as any).pbaDraftTunedVersion ?? '').startsWith('pba-draft-')
    || isRegisteredPbaRosterIdentity(player)
    || (player.stats ?? []).some(row => pbaTids.has(Number(row.tid)))
    || ((player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect') && isFilipino(player));
};

const mergePlayers = (
  existing: NBAPlayer[],
  rolled: NBAPlayer[],
  scopedIds: Set<string>,
): NBAPlayer[] => {
  const rolledById = new Map(rolled.map(player => [player.internalId, player]));
  const merged = existing.map(player => scopedIds.has(player.internalId)
    ? rolledById.get(player.internalId) ?? player
    : player,
  );
  const existingIds = new Set(existing.map(player => player.internalId));
  for (const player of rolled) {
    if (!existingIds.has(player.internalId)) merged.push(player);
  }
  return merged;
};

const mergeTeams = (existing: any[], rolled: any[], pbaTids: Set<number>): any[] => {
  const rolledByTid = new Map(rolled.map(team => [teamIdOf(team), team]));
  const merged = existing.map(team => pbaTids.has(teamIdOf(team))
    ? rolledByTid.get(teamIdOf(team)) ?? team
    : team,
  );
  const existingTids = new Set(existing.map(teamIdOf));
  for (const team of rolled) {
    if (!existingTids.has(teamIdOf(team))) merged.push(team);
  }
  return merged;
};

const mergeUnique = <T>(existing: T[], additions: T[], keyOf: (entry: T) => string): T[] => {
  const keys = new Set(existing.map(keyOf));
  const merged = [...existing];
  for (const entry of additions) {
    const key = keyOf(entry);
    if (!keys.has(key)) {
      keys.add(key);
      merged.push(entry);
    }
  }
  return merged;
};

export function applyPbaScopedSeasonRollover(
  state: GameState,
  runSharedRollover: RolloverRunner,
): Partial<GameState> {
  const pbaTeams = (state.nonNBATeams ?? []).filter(team => (team as any).league === 'PBA');
  const pbaTids = new Set(pbaTeams.map(teamIdOf));
  const scopedPlayers = state.players.filter(player => playerBelongsToPba(player, pbaTids));
  const scopedPlayerIds = new Set(scopedPlayers.map(player => player.internalId));
  const pbaStaffFreeAgents = (state.staffFreeAgents ?? []).filter(member => member.leagueId === 'pba');
  const normalizedPlayers = scopedPlayers.map(player =>
    pbaTids.has(Number(player.tid)) && player.status !== 'Retired'
      ? { ...player, status: 'PBA' as const }
      : player,
  );
  const pbaAllStarGameIds = new Set<number>([
    Number((state.allStar as any)?.allStarGameId),
    ...(((state.allStar as any)?.bracket?.games ?? []).map((game: any) => Number(game?.gid))),
  ].filter(Number.isFinite));
  const isPbaGame = (game: any): boolean =>
    isPbaCompetition(game?.competitionId) || pbaAllStarGameIds.has(Number(game?.gid ?? game?.gameId));
  const isPbaPick = (pick: any): boolean =>
    pbaTids.has(Number(pick?.tid)) || pbaTids.has(Number(pick?.originalTid));
  const isPbaAward = (award: any): boolean =>
    isPbaCompetition(award?.competitionId)
    || pbaTids.has(Number(award?.tid ?? award?.teamId))
    || scopedPlayerIds.has(String(award?.playerId ?? award?.pid ?? ''));

  const projectedState = {
    ...state,
    players: normalizedPlayers,
    teams: [],
    nonNBATeams: pbaTeams,
    draftPicks: (state.draftPicks ?? []).filter(isPbaPick),
    schedule: (state.schedule ?? []).filter(isPbaGame),
    boxScores: (state.boxScores ?? []).filter(isPbaGame),
    activeCompetitions: (state.activeCompetitions ?? []).filter(competition => isPbaCompetition(competition.id)),
    historicalAwards: (state.historicalAwards ?? []).filter(isPbaAward),
    news: [],
    history: [],
    bets: [],
    christmasGames: [],
    globalGames: [],
    teamArchive: [],
    staff: undefined,
    staffFreeAgents: pbaStaffFreeAgents,
    pendingGovernorsBoardMeeting: undefined,
    nbaCup: undefined,
    leagueStats: {
      ...state.leagueStats,
      inSeasonTournament: false,
      inflationEnabled: false,
    },
  } as GameState;

  const rolled = runSharedRollover(projectedState);
  const rolledPlayers = rolled.players ?? normalizedPlayers;
  const nextSeason = getNextPbaSeasonKey(state.leagueStats.year);
  const nextStaffEconomyIndex = getPbaHistoricalEconomyFactor(
    nextSeason,
    Number(state.leagueStats.inflationAverage ?? DEFAULT_CAP_INFLATION_AVERAGE) / 100,
  );
  const lifecyclePbaTeams = (rolled.nonNBATeams ?? pbaTeams).map(team => ({
    ...team,
    tycoon: {
      ...(team.tycoon ?? {}),
      currentEconomyIndex: nextStaffEconomyIndex,
    },
  }));
  const pbaStaffLifecycle = processNBAStaffLifecycle(
    lifecyclePbaTeams as any,
    nextSeason,
    state.date,
    state.gameMode === 'gm' ? state.userTeamId : null,
    rolled.staffFreeAgents ?? pbaStaffFreeAgents,
    'pba',
    { skipRetirement: true },
  );
  const consumedPbaStaffIds = new Set(pbaStaffLifecycle.consumedFreeAgentIds);
  const rolledPbaTeams = (pbaStaffLifecycle.teams as any[]).map(team => {
    const snapshot = getHistoricalPbaTeamIdentitySnapshot(state.historicalPba, teamIdOf(team), nextSeason);
    const nextTeam = snapshot ? {
      ...team,
      region: snapshot.region,
      name: snapshot.name,
      abbrev: snapshot.abbrev,
      imgURL: snapshot.imgURL ?? team.imgURL,
      colors: snapshot.colors ?? team.colors,
    } : team;
    return {
      ...nextTeam,
      tycoon: {
        ...(nextTeam.tycoon ?? {}),
        currentEconomyIndex: nextStaffEconomyIndex,
      },
    };
  });
  const backgroundSchedule = (state.schedule ?? []).filter(game => !isPbaGame(game));
  const backgroundBoxScores = (state.boxScores ?? []).filter(game => !isPbaGame(game));
  const backgroundPicks = (state.draftPicks ?? []).filter(pick => !isPbaPick(pick));
  const backgroundAwards = (state.historicalAwards ?? []).filter(award => !isPbaAward(award));
  const rolledAwards = rolled.historicalAwards ?? projectedState.historicalAwards ?? [];
  const nextLeagueStats = disablePbaSalaryCapFields({
    ...(rolled.leagueStats ?? state.leagueStats),
    ...getHistoricalPbaRuleOverrides(nextSeason),
    year: nextSeason,
    uiMode: 'pba_isolated',
    historicalEconomyScale: nextStaffEconomyIndex,
  });

  return {
    ...rolled,
    players: mergePlayers(state.players, rolledPlayers, scopedPlayerIds),
    teams: state.teams,
    teamArchive: state.teamArchive,
    nonNBATeams: mergeTeams(state.nonNBATeams ?? [], rolledPbaTeams, pbaTids),
    draftPicks: [...backgroundPicks, ...(rolled.draftPicks ?? projectedState.draftPicks ?? [])],
    schedule: [...backgroundSchedule, ...(rolled.schedule ?? [])],
    boxScores: [...backgroundBoxScores, ...(rolled.boxScores ?? projectedState.boxScores ?? [])],
    christmasGames: state.christmasGames,
    globalGames: state.globalGames,
    bets: state.bets,
    historicalAwards: [...backgroundAwards, ...rolledAwards],
    historicalPlayoffs: (state as any).historicalPlayoffs,
    competitionHistory: (state as any).competitionHistory,
    playoffs: state.playoffs,
    nbaCup: state.nbaCup,
    nbaCupHistory: state.nbaCupHistory,
    staff: state.staff,
    staffFreeAgents: [
      ...(state.staffFreeAgents ?? []).filter(member => member.leagueId !== 'pba'),
      ...mergeUnique(
        rolled.staffFreeAgents ?? pbaStaffFreeAgents,
        pbaStaffLifecycle.freeAgents,
        member => String((member as any)?.id ?? `${(member as any)?.name}|${(member as any)?.role}`),
      ).filter(member => !member.id || !consumedPbaStaffIds.has(member.id)),
    ],
    faBidding: state.faBidding,
    pendingRFAMatchResolutions: state.pendingRFAMatchResolutions,
    pendingGovernorsBoardMeeting: undefined,
    pendingEuroBankruptcy: state.pendingEuroBankruptcy,
    pendingEuroleagueWelcome: state.pendingEuroleagueWelcome,
    euroCompetitionTeamTids: state.euroCompetitionTeamTids,
    leagueStats: nextLeagueStats,
    news: [...(rolled.news ?? []), ...(state.news ?? [])].slice(0, 200),
    history: mergeUnique(
      state.history ?? [],
      [...(rolled.history ?? []), ...pbaStaffLifecycle.historyEntries],
      entry => `${String((entry as any)?.date ?? '')}|${String((entry as any)?.type ?? '')}|${String((entry as any)?.text ?? '')}`,
    ),
  };
}
