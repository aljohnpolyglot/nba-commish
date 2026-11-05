import { getHistoricalTeamSnapshot } from '../../utils/teamAssets';
import { normalizeHistoricalNbaTeamAbbrev } from '../../utils/historicalNbaTeamAbbrev';
import { isWnbaIdentityScope } from './wnbaLogoHistory';

export type BasketballCompetitionScope = 'nba' | 'wnba' | 'pba' | 'gleague' | 'external';

type TeamIdentityLike = {
  id?: number;
  tid?: number;
  abbrev?: string;
  league?: string;
  conference?: string;
  status?: string;
  uiMode?: string;
  competitionId?: string;
  identitySeasons?: unknown[];
  seasons?: unknown[];
};

const normalized = (value: unknown): string => String(value ?? '').trim().toLowerCase();
const compact = (value: unknown): string => normalized(value).replace(/[^a-z0-9]+/g, '');
const teamId = (team: TeamIdentityLike): number => Number(team.id ?? team.tid ?? -1);

export function getBasketballCompetitionScope(
  competitionId: unknown,
  defaultLeagueTag?: unknown,
  tid?: number,
): BasketballCompetitionScope {
  const competition = compact(competitionId);
  const fallback = compact(defaultLeagueTag);
  if (competition.includes('wnba') || fallback === 'wnba') return 'wnba';
  if (competition.includes('gleague') || fallback === 'glg' || fallback === 'gleague') return 'gleague';
  if (competition === 'pba' || competition.startsWith('pba') || fallback === 'pba') return 'pba';
  if (
    competition.includes('euro')
    || competition.includes('endesa')
    || competition.includes('copa')
    || competition.includes('supercopa')
    || competition.includes('bleague')
    || competition.includes('chinacba')
    || competition.includes('nblaustralia')
  ) return 'external';
  if (Number.isFinite(tid)) {
    if (tid! >= 3000 && tid! < 4000) return 'wnba';
    if ((tid! >= 16000 && tid! < 17000) || (tid! >= 6000 && tid! < 7000)) return 'gleague';
    if (tid! >= 2000 && tid! < 3000) return 'pba';
    if (tid! >= 1000) return 'external';
  }
  return 'nba';
}

export function teamMatchesBasketballCompetitionScope(
  team: TeamIdentityLike,
  scope: BasketballCompetitionScope,
): boolean {
  const id = teamId(team);
  const league = compact(team.league ?? team.conference ?? team.status ?? team.uiMode ?? team.competitionId);
  if (scope === 'wnba') return isWnbaIdentityScope({ ...team, tid: id });
  if (scope === 'gleague') {
    return league.includes('gleague') || (id >= 16000 && id < 17000) || (id >= 6000 && id < 7000);
  }
  if (scope === 'pba') return league.includes('pba') || (id >= 2000 && id < 3000);
  if (scope === 'external') return id >= 100 || (!!league && !['nba', 'wnba', 'east', 'west'].includes(league));
  return id >= 0 && id < 100 && !isWnbaIdentityScope({ ...team, tid: id });
}

const teamAbbrevAtSeason = (team: TeamIdentityLike, season: number): string => String(
  getHistoricalTeamSnapshot(team, season)?.abbrev ?? team.abbrev ?? '',
).trim().toUpperCase();

const abbrevMatches = (
  candidate: string,
  requested: string,
  scope: BasketballCompetitionScope,
): boolean => {
  if (!candidate || !requested) return false;
  if (scope !== 'nba') return candidate === requested;
  return normalizeHistoricalNbaTeamAbbrev(candidate) === normalizeHistoricalNbaTeamAbbrev(requested);
};

export function resolveHistoricalCompetitionTeam<T extends TeamIdentityLike>(args: {
  teams: T[];
  tid: number;
  season: number;
  teamAbbrev?: unknown;
  competitionId?: unknown;
  defaultLeagueTag?: unknown;
}): T | undefined {
  const scope = getBasketballCompetitionScope(args.competitionId, args.defaultLeagueTag, args.tid);
  const scopedTeams = args.teams.filter(team => teamMatchesBasketballCompetitionScope(team, scope));
  const requestedAbbrev = String(args.teamAbbrev ?? '').trim().toUpperCase();
  if (requestedAbbrev) {
    const abbrevMatch = scopedTeams.find(team => abbrevMatches(
      teamAbbrevAtSeason(team, args.season),
      requestedAbbrev,
      scope,
    ));
    if (abbrevMatch) return abbrevMatch;
  }
  const direct = scopedTeams.find(team => teamId(team) === args.tid);
  if (direct) return direct;
  if (scope === 'wnba' && args.tid >= 0 && args.tid < 100) {
    const offset = scopedTeams.find(team => teamId(team) === args.tid + 3000);
    if (offset) return offset;
  }
  if (scope !== 'nba' || args.competitionId) return undefined;
  return args.teams.find(team => teamId(team) === args.tid);
}
