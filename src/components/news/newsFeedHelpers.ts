import type { NBATeam, NonNBATeam } from '../../types';
import type { NewsItem } from './types';

export function isNewsAboutTeam(article: Pick<NewsItem, 'teamIds' | 'homeTeamId' | 'awayTeamId'>, teamId: number): boolean {
  return article.teamIds?.includes(teamId) === true || article.homeTeamId === teamId || article.awayTeamId === teamId;
}

export function readJsonStorage<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function nonNbaTeamForNews(team: NonNBATeam): NBATeam {
  const wins = Number((team as any).wins ?? (team as any).won ?? (team as any).w ?? (team as any).record?.wins ?? (team as any).record?.w ?? 0);
  const losses = Number((team as any).losses ?? (team as any).lost ?? (team as any).l ?? (team as any).record?.losses ?? (team as any).record?.l ?? 0);
  return {
    id: team.tid,
    name: team.name,
    abbrev: team.abbrev || team.name.slice(0, 3).toUpperCase(),
    region: team.region,
    conference: (team as any).conference ?? team.league,
    cid: team.cid,
    did: team.did,
    wins,
    losses,
    strength: Number((team as any).strength ?? 0),
    logoUrl: (team as any).logoUrl ?? team.imgURL,
  } as NBATeam;
}

export function buildEraTeams(state: any): NBATeam[] {
  const uiMode = state.leagueStats?.uiMode;
  if (uiMode === 'pba_isolated') {
    return (state.nonNBATeams ?? [])
      .filter((team: NonNBATeam) => team.league === 'PBA')
      .map(nonNbaTeamForNews);
  }
  if (uiMode === 'euro_isolated') {
    const userTeam = (state.nonNBATeams ?? []).find((team: NonNBATeam) => team.tid === state.userTeamId);
    const targetLeague = userTeam?.league ?? 'Endesa';
    return (state.nonNBATeams ?? [])
      .filter((team: NonNBATeam) => team.league === targetLeague)
      .map(nonNbaTeamForNews);
  }
  if (uiMode === 'wnba_isolated') {
    const externalTeams = (state.nonNBATeams ?? [])
      .filter((team: NonNBATeam) => team.league === 'WNBA')
      .map(nonNbaTeamForNews);
    return externalTeams.length > 0 ? externalTeams : state.teams ?? [];
  }
  return state.teams ?? [];
}
