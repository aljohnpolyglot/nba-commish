import type { DraftPick, GameState, NBAPlayer, NBATeam, NonNBATeam } from '../../../types';
import { isPlayerInLeagueScope, type PlayerLeagueScope } from '../../../utils/playerLeagueScope';
import { isEuroIsolatedMode, isPbaIsolatedMode, isWnbaIsolatedMode } from '../../../utils/uiMode';
import { getActiveNativeTeamIds } from '../../backgroundUniverse/backgroundSeasonGenerator';

type StaffFreeAgent = NonNullable<GameState['staffFreeAgents']>[number];
type ScheduledGame = NonNullable<GameState['schedule']>[number];
type BoxScore = NonNullable<GameState['boxScores']>[number];
type Bet = NonNullable<GameState['bets']>[number];
type FAMarket = NonNullable<NonNullable<GameState['faBidding']>['markets']>[number];
type RFAMatch = NonNullable<GameState['pendingRFAMatchResolutions']>[number];
type ChristmasGame = NonNullable<GameState['christmasGames']>[number];
type GlobalGame = NonNullable<GameState['globalGames']>[number];

export interface SeasonRolloverLeagueScope {
  state: GameState;
  playerScope: PlayerLeagueScope;
  activeTeamIds: Set<number>;
  mergePlayers: (rolled: NBAPlayer[]) => NBAPlayer[];
  mergeTeams: (rolled: NBATeam[]) => NBATeam[];
  mergeNonNBATeams: (rolled: NonNBATeam[]) => NonNBATeam[];
  mergeDraftPicks: (rolled: DraftPick[]) => DraftPick[];
  mergeStaffFreeAgents: (rolled: StaffFreeAgent[]) => StaffFreeAgent[];
  mergeSchedule: (rolled: ScheduledGame[]) => ScheduledGame[];
  mergeBoxScores: (rolled: BoxScore[]) => BoxScore[];
  mergeBets: (rolled: Bet[]) => Bet[];
  mergeFAMarkets: (rolled: FAMarket[]) => FAMarket[];
  mergeRFAMatches: (rolled: RFAMatch[]) => RFAMatch[];
  mergeChristmasGames: (rolled: ChristmasGame[]) => ChristmasGame[];
  mergeGlobalGames: (rolled: GlobalGame[]) => GlobalGame[];
}

function resolvePlayerScope(state: GameState): PlayerLeagueScope {
  if (isPbaIsolatedMode(state)) return 'pba';
  if (isEuroIsolatedMode(state)) return 'euro';
  if (isWnbaIsolatedMode(state)) return 'wnba';
  return state.leagueType === 'fictional' ? 'fictional' : 'nba';
}

export function resolveSeasonRolloverPlayerScope(state: GameState): {
  playerScope: PlayerLeagueScope;
  activeTeamIds: Set<number>;
} {
  const playerScope = resolvePlayerScope(state);
  const nativeTeamIds = getActiveNativeTeamIds(state);
  const teams = state.teams ?? [];
  const activeTeams = playerScope === 'pba' || playerScope === 'euro'
    ? teams.filter(team => nativeTeamIds.has(team.id))
    : teams;
  const activeNonNBATeams = playerScope === 'pba' || playerScope === 'euro'
    ? (state.nonNBATeams ?? []).filter(team => nativeTeamIds.has(team.tid))
    : [];
  return {
    playerScope,
    activeTeamIds: new Set<number>([
      ...activeTeams.map(team => team.id),
      ...activeNonNBATeams.map(team => team.tid),
    ]),
  };
}

function teamId(team: NBATeam | NonNBATeam): number {
  return Number('tid' in team ? team.tid : team.id);
}

function mergeScopedRows<T>(
  original: T[],
  rolled: T[],
  scopedKeys: ReadonlySet<string | number>,
  keyOf: (row: T) => string | number,
): T[] {
  const rolledByKey = new Map(rolled.map(row => [keyOf(row), row]));
  const merged: T[] = [];
  for (const row of original) {
    const key = keyOf(row);
    if (!scopedKeys.has(key)) merged.push(row);
    else if (rolledByKey.has(key)) merged.push(rolledByKey.get(key)!);
  }
  const originalKeys = new Set(original.map(keyOf));
  for (const row of rolled) if (!originalKeys.has(keyOf(row))) merged.push(row);
  return merged;
}

function isStaffFreeAgentInScope(member: StaffFreeAgent, scope: PlayerLeagueScope): boolean {
  const leagueId = String(member.leagueId ?? '').toLowerCase();
  if (scope === 'pba') return leagueId === 'pba';
  if (scope === 'euro') return leagueId.includes('euro') || leagueId === 'endesa';
  if (scope === 'wnba') return !leagueId || leagueId === 'wnba' || leagueId === 'nba';
  if (scope === 'fictional') return !leagueId || leagueId === 'fictional';
  return !leagueId || leagueId === 'nba';
}

function staffKey(member: StaffFreeAgent): string {
  return String(member.id ?? `${member.name}|${member.role ?? member.position ?? member.jobTitle ?? ''}`);
}

function isActiveScheduledGame(game: ScheduledGame, teamIds: ReadonlySet<number>): boolean {
  return teamIds.has(Number(game.homeTid))
    || teamIds.has(Number(game.awayTid))
    || !!(game.isAllStar || game.isRisingStars || game.isCelebrityGame || game.isExhibition);
}

function isActiveBoxScore(game: BoxScore, teamIds: ReadonlySet<number>, activeGameIds: ReadonlySet<number>): boolean {
  return activeGameIds.has(Number(game.gameId))
    || teamIds.has(Number(game.homeTeamId))
    || teamIds.has(Number(game.awayTeamId))
    || !!(game.isAllStar || game.isRisingStars || game.isCelebrityGame);
}

function matchupKey(game: { homeTid: number; awayTid: number; date?: string }): string {
  return `${game.homeTid}|${game.awayTid}|${game.date ?? ''}`;
}

export function projectSeasonRolloverLeagueState(state: GameState): SeasonRolloverLeagueScope {
  const { playerScope, activeTeamIds } = resolveSeasonRolloverPlayerScope(state);
  const nativeTeamIds = activeTeamIds;
  const activeTeams = playerScope === 'pba' || playerScope === 'euro'
    ? state.teams.filter(team => nativeTeamIds.has(team.id))
    : state.teams;
  const activeNonNBATeams = playerScope === 'pba' || playerScope === 'euro'
    ? (state.nonNBATeams ?? []).filter(team => nativeTeamIds.has(team.tid))
    : [];
  const activePlayers = state.players.filter(player => isPlayerInLeagueScope(player, playerScope, activeTeamIds));
  const activePlayerIds = new Set(activePlayers.map(player => player.internalId));
  const activeTeamKeys = new Set(activeTeams.map(team => team.id));
  const activeNonNBATeamKeys = new Set(activeNonNBATeams.map(team => team.tid));
  const activeDraftPicks = (state.draftPicks ?? []).filter(pick => activeTeamIds.has(Number(pick.originalTid)));
  const activeDraftPickIds = new Set(activeDraftPicks.map(pick => pick.dpid));
  const activeStaffFreeAgents = (state.staffFreeAgents ?? []).filter(member => isStaffFreeAgentInScope(member, playerScope));
  const activeStaffKeys = new Set(activeStaffFreeAgents.map(staffKey));
  const activeSchedule = (state.schedule ?? []).filter(game => isActiveScheduledGame(game, activeTeamIds));
  const activeGameIds = new Set(activeSchedule.map(game => Number(game.gid)));
  const activeBoxScores = (state.boxScores ?? []).filter(game => isActiveBoxScore(game, activeTeamIds, activeGameIds));
  const activeBoxScoreIds = new Set(activeBoxScores.map(game => Number(game.gameId)));
  const activeBets = (state.bets ?? []).filter(bet => bet.legs.length === 0 || bet.legs.some(leg => (
    (leg.gameId != null && activeGameIds.has(Number(leg.gameId)))
    || (leg.playerId != null && activePlayerIds.has(String(leg.playerId)))
  )));
  const activeBetIds = new Set(activeBets.map(bet => bet.id));
  const activeFAMarkets = (state.faBidding?.markets ?? []).filter(market => activePlayerIds.has(market.playerId));
  const activeFAMarketIds = new Set(activeFAMarkets.map(market => market.playerId));
  const activePlayerNames = new Set(activePlayers.map(player => player.name));
  const activeRFAMatches = (state.pendingRFAMatchResolutions ?? []).filter(match => activePlayerNames.has(match.playerName));
  const activeRFAMatchKeys = new Set(activeRFAMatches.map(match => `${match.playerName}|${match.signingTeamName}`));
  const activeChristmasGames = (state.christmasGames ?? []).filter(game => (
    activeTeamIds.has(game.homeTid) || activeTeamIds.has(game.awayTid)
  ));
  const activeChristmasKeys = new Set(activeChristmasGames.map(matchupKey));
  const activeGlobalGames = (state.globalGames ?? []).filter(game => (
    activeTeamIds.has(game.homeTid) || activeTeamIds.has(game.awayTid)
  ));
  const activeGlobalKeys = new Set(activeGlobalGames.map(matchupKey));

  return {
    state: {
      ...state,
      players: activePlayers,
      teams: activeTeams,
      nonNBATeams: activeNonNBATeams,
      draftPicks: activeDraftPicks,
      staffFreeAgents: activeStaffFreeAgents,
      schedule: activeSchedule,
      boxScores: activeBoxScores,
      bets: activeBets,
      christmasGames: activeChristmasGames,
      globalGames: activeGlobalGames,
      faBidding: { markets: activeFAMarkets },
      pendingRFAMatchResolutions: activeRFAMatches,
    },
    playerScope,
    activeTeamIds,
    mergePlayers: rolled => mergeScopedRows(state.players, rolled, activePlayerIds, player => player.internalId),
    mergeTeams: rolled => mergeScopedRows(state.teams, rolled, activeTeamKeys, team => team.id),
    mergeNonNBATeams: rolled => mergeScopedRows(state.nonNBATeams ?? [], rolled, activeNonNBATeamKeys, team => team.tid),
    mergeDraftPicks: rolled => mergeScopedRows(state.draftPicks ?? [], rolled, activeDraftPickIds, pick => pick.dpid),
    mergeStaffFreeAgents: rolled => mergeScopedRows(state.staffFreeAgents ?? [], rolled, activeStaffKeys, staffKey),
    mergeSchedule: rolled => mergeScopedRows(state.schedule ?? [], rolled, activeGameIds, game => Number(game.gid)),
    mergeBoxScores: rolled => mergeScopedRows(state.boxScores ?? [], rolled, activeBoxScoreIds, game => Number(game.gameId)),
    mergeBets: rolled => mergeScopedRows(state.bets ?? [], rolled, activeBetIds, bet => bet.id),
    mergeFAMarkets: rolled => mergeScopedRows(state.faBidding?.markets ?? [], rolled, activeFAMarketIds, market => market.playerId),
    mergeRFAMatches: rolled => mergeScopedRows(
      state.pendingRFAMatchResolutions ?? [],
      rolled,
      activeRFAMatchKeys,
      match => `${match.playerName}|${match.signingTeamName}`,
    ),
    mergeChristmasGames: rolled => mergeScopedRows(
      state.christmasGames ?? [], rolled, activeChristmasKeys, game => matchupKey(game),
    ),
    mergeGlobalGames: rolled => mergeScopedRows(
      state.globalGames ?? [], rolled, activeGlobalKeys, game => matchupKey(game),
    ),
  };
}
