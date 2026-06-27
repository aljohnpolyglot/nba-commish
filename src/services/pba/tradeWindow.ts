import type { GameState, NBAPlayer, NBATeam } from '../../types';
import { getActiveLeagueTeams, isOnRoster, resolveAnyTeam } from '../../utils/teamLookup';
import { isPbaIsolatedMode } from '../../utils/uiMode';

function isPbaTeam(team: { id?: number; tid?: number; conference?: string; league?: string }): boolean {
  const tid = Number(team.id ?? team.tid ?? -1);
  const league = String(team.league ?? team.conference ?? '').toLowerCase();
  return (tid >= 2000 && tid < 3000) || league.includes('pba');
}

export function isPbaTradeWindowOpen(state: Pick<GameState, 'leagueStats'>): boolean {
  if (!isPbaIsolatedMode(state)) return false;
  const phase = (state.leagueStats as any)?.pbaConferencePhase;
  return phase !== 'playoffs' && phase !== 'complete';
}

export function getPbaTradeTeams(state: Pick<GameState, 'teams' | 'nonNBATeams' | 'userTeamId' | 'leagueStats'>): NBATeam[] {
  const scoped = getActiveLeagueTeams({
    teams: state.teams,
    nonNBATeams: state.nonNBATeams ?? [],
    userTeamId: state.userTeamId,
  }).filter(isPbaTeam);
  if (scoped.length > 0) return scoped;

  return (state.nonNBATeams ?? [])
    .filter(isPbaTeam)
    .map(team => resolveAnyTeam(team.tid, state.teams, state.nonNBATeams ?? []))
    .filter((team): team is NBATeam => team !== null);
}

export function getPbaTradePlayers(
  state: Pick<GameState, 'players' | 'teams' | 'nonNBATeams' | 'userTeamId' | 'leagueStats'>,
  teams = getPbaTradeTeams(state),
): NBAPlayer[] {
  const tids = new Set(teams.map(team => team.id));
  return state.players.filter(player => tids.has(Number(player.tid)) && isOnRoster(player));
}
