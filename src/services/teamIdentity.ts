import type { GameState, NBATeam, NonNBATeam } from '../types';

type UniverseTeam = NBATeam | NonNBATeam;

const segment = (value: unknown): string => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const teamId = (team: UniverseTeam): number => 'tid' in team ? team.tid : team.id;

export function getPrimaryLeagueIdentityNamespace(
  state: Pick<GameState, 'leagueType' | 'moddedLeagueBase' | 'leagueStats'>,
): string {
  if (state.leagueType === 'fictional') return 'fictional';
  const uiMode = segment(state.leagueStats?.uiMode);
  if (uiMode.includes('wnba')) return 'wnba';
  if (uiMode.includes('pba')) return 'pba';
  if (uiMode.includes('euro')) return 'euro';
  return segment(state.moddedLeagueBase) || 'nba';
}

export function resolveCanonicalFranchiseId(team: UniverseTeam, leagueNamespace: string): string {
  const historicalFranchiseId = 'historicalEuropeSource' in team
    ? team.historicalEuropeSource?.franchiseId
    : undefined;
  const existing = segment(team.franchiseId ?? historicalFranchiseId);
  if (existing.startsWith('franchise-')) return existing.replace(/^franchise-/, 'franchise:').replace(/-/g, ':');
  return `franchise:${segment(leagueNamespace) || 'league'}:${existing || teamId(team)}`;
}

export function resolveCanonicalTeamIdentityId(team: UniverseTeam, leagueNamespace: string): string {
  const existing = String(team.teamIdentityId ?? '').trim();
  if (existing) return existing;
  return `team:${segment(leagueNamespace) || 'league'}:${teamId(team)}`;
}

export function withCanonicalTeamIdentity<T extends UniverseTeam>(team: T, leagueNamespace: string): T {
  return {
    ...team,
    franchiseId: resolveCanonicalFranchiseId(team, leagueNamespace),
    teamIdentityId: resolveCanonicalTeamIdentityId(team, leagueNamespace),
  };
}

export function withCanonicalExpansionTeamIdentity<T extends UniverseTeam>(
  team: T,
  leagueNamespace: string,
  launchSeason: number,
): T {
  const identified = withCanonicalTeamIdentity(team, leagueNamespace);
  if (!Number.isFinite(launchSeason) || launchSeason <= 0) return identified;
  const logoUrl = 'logoUrl' in identified
    ? identified.logoUrl
    : 'imgURL' in identified
      ? identified.imgURL
      : undefined;
  const identityRow = {
    season: launchSeason,
    abbrev: identified.abbrev,
    region: identified.region,
    name: identified.name,
    logoUrl,
    colors: identified.colors,
  };
  const rows = [...(identified.identitySeasons ?? [])];
  const existingIndex = rows.findIndex(row => Number(row.season) === launchSeason);
  if (existingIndex >= 0) {
    rows[existingIndex] = { ...identityRow, ...rows[existingIndex] };
  } else {
    rows.push(identityRow);
  }
  rows.sort((left, right) => Number(left.season) - Number(right.season));
  return { ...identified, identitySeasons: rows } as T;
}

export function canonicalizeTeamIdentitiesForState<T extends Pick<GameState, 'leagueType' | 'moddedLeagueBase' | 'leagueStats' | 'teams' | 'nonNBATeams'>>(
  state: T,
): Pick<T, 'teams' | 'nonNBATeams'> {
  const primaryNamespace = getPrimaryLeagueIdentityNamespace(state);
  return {
    teams: state.teams.map(team => withCanonicalTeamIdentity(team, primaryNamespace)),
    nonNBATeams: state.nonNBATeams.map(team => withCanonicalTeamIdentity(team, segment(team.league) || 'external')),
  };
}
