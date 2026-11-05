import type { NBAPlayer, NBATeam, NonNBATeam } from '../../types';

export type CareerLeagueIdentity = 'NBA' | 'WNBA' | 'PBA' | 'EURO' | 'EXTERNAL' | 'UNKNOWN';

export interface RetirementCareerIdentity {
  personId?: string;
  sourceIds?: Record<string, string | string[]>;
  league: CareerLeagueIdentity;
  careerTeamIds: number[];
  primaryCareerTeamId?: number;
}

function statLeague(stat: any, teamsById: Map<number, NBATeam | NonNBATeam>): CareerLeagueIdentity {
  const competition = String(stat?.competitionId ?? stat?.league ?? '').toLowerCase();
  const tid = Number(stat?.tid);
  const teamLeague = String((teamsById.get(tid) as any)?.league ?? '').toLowerCase();
  if (competition.includes('pba') || teamLeague === 'pba') return 'PBA';
  if (competition.includes('wnba') || teamLeague === 'wnba' || (tid >= 3000 && tid < 4000)) return 'WNBA';
  if (competition.includes('euro') || competition.includes('basket') || tid >= 1000) return 'EURO';
  if (tid >= 0 && tid < 100) return 'NBA';
  return 'EXTERNAL';
}

export function isCareerStatCompatibleWithMode(
  stat: any,
  uiMode: string | undefined,
  teamsById: Map<number, NBATeam | NonNBATeam>,
): boolean {
  const expectedLeague = uiMode === 'pba_isolated'
    ? 'PBA'
    : uiMode === 'wnba_isolated'
      ? 'WNBA'
      : uiMode === 'euro_isolated'
        ? 'EURO'
        : 'NBA';
  return statLeague(stat, teamsById) === expectedLeague;
}

function canonicalStatTeamId(
  stat: any,
  league: CareerLeagueIdentity,
  teamsById: Map<number, NBATeam | NonNBATeam>,
): number | undefined {
  const tid = Number(stat?.tid);
  if (!Number.isInteger(tid) || tid < 0) return undefined;
  if (teamsById.has(tid)) {
    if (league === 'NBA' && tid < 100) return tid;
    if (league !== 'NBA' && tid >= 1000) return tid;
  }
  if (league === 'PBA' && teamsById.has(tid + 2000)) return tid + 2000;
  if (league === 'WNBA' && teamsById.has(tid + 3000)) return tid + 3000;
  return league === 'NBA' && tid < 100 ? tid : undefined;
}

export function resolveRetirementCareerIdentity(
  player: NBAPlayer,
  teams: readonly NBATeam[],
  nonNBATeams: readonly NonNBATeam[],
): RetirementCareerIdentity {
  const teamsById = new Map<number, NBATeam | NonNBATeam>();
  for (const team of teams) teamsById.set(team.id, team);
  for (const team of nonNBATeams) teamsById.set(team.tid, team);
  const leagueTotals = new Map<CareerLeagueIdentity, number>();
  for (const stat of player.stats ?? []) {
    if ((stat as any).playoffs || Number((stat as any).gp ?? 0) <= 0) continue;
    const league = statLeague(stat, teamsById);
    leagueTotals.set(league, (leagueTotals.get(league) ?? 0) + Number((stat as any).gp ?? 0));
  }
  const sourceKeys = Object.keys((player as any).sourceIds ?? {}).map(key => key.toLowerCase());
  const sourceLeague: CareerLeagueIdentity = sourceKeys.some(key => key.includes('pba'))
    ? 'PBA'
    : sourceKeys.some(key => key.includes('wnba'))
      ? 'WNBA'
      : sourceKeys.some(key => key.includes('euro'))
        ? 'EURO'
        : 'UNKNOWN';
  const league = [...leagueTotals.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? sourceLeague;
  const teamTotals = new Map<number, { gp: number; lastSeason: number }>();
  for (const stat of player.stats ?? []) {
    if ((stat as any).playoffs || Number((stat as any).gp ?? 0) <= 0 || statLeague(stat, teamsById) !== league) continue;
    const teamId = canonicalStatTeamId(stat, league, teamsById);
    if (teamId == null) continue;
    const current = teamTotals.get(teamId) ?? { gp: 0, lastSeason: 0 };
    current.gp += Number((stat as any).gp ?? 0);
    current.lastSeason = Math.max(current.lastSeason, Number((stat as any).season ?? 0));
    teamTotals.set(teamId, current);
  }
  const careerTeamIds = [...teamTotals.entries()]
    .sort((left, right) => right[1].gp - left[1].gp || right[1].lastSeason - left[1].lastSeason)
    .map(([teamId]) => teamId);
  return {
    personId: (player as any).personId,
    sourceIds: (player as any).sourceIds,
    league,
    careerTeamIds,
    primaryCareerTeamId: careerTeamIds[0],
  };
}

export function shouldApplyLoyalFreeAgentRetirement(
  player: NBAPlayer,
  teams: readonly NBATeam[],
  nonNBATeams: readonly NonNBATeam[],
  uiMode: string | undefined,
): boolean {
  const expectedLeague = uiMode === 'pba_isolated'
    ? 'PBA'
    : uiMode === 'wnba_isolated'
      ? 'WNBA'
      : uiMode === 'euro_isolated'
        ? 'EURO'
        : 'NBA';
  const identity = resolveRetirementCareerIdentity(player, teams, nonNBATeams);
  return identity.league === expectedLeague && identity.primaryCareerTeamId != null;
}
