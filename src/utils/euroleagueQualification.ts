import type { NBATeam, NonNBATeam } from '../types';

type TeamLike = Partial<NBATeam & NonNBATeam> & {
  id?: number;
  tid?: number;
  lastEndesaFinish?: number;
};

type EuroleagueSelectionSource = {
  nonNBATeams?: TeamLike[];
  clubAliasMap?: Record<number, number>;
  userTeamId?: number | null;
};

export type EuroleagueSelection = {
  tids: number[];
  licensedSpanishTids: number[];
  wildcardTid: number | null;
  wildcardFinish: number | null;
};

const LICENSED_SPANISH_ALIASES = [
  ['real madrid'],
  ['fc barcelona', 'barcelona'],
  ['baskonia', 'baskonia vitoria gasteiz'],
] as const;

const INITIAL_WILDCARD_ALIASES = ['valencia basket', 'valencia'];

function getTid(team: TeamLike | null | undefined): number | null {
  const tid = team?.tid ?? team?.id;
  return typeof tid === 'number' ? tid : null;
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function clubText(team: TeamLike): string {
  return normalizeName(`${team.region ?? ''} ${team.name ?? ''} ${team.abbrev ?? ''}`);
}

function matchesAnyAlias(team: TeamLike, aliases: readonly string[]): boolean {
  const text = clubText(team);
  return aliases.some(alias => text.includes(normalizeName(alias)));
}

export function isLicensedSpanishEuroleagueClub(team: TeamLike): boolean {
  return LICENSED_SPANISH_ALIASES.some(aliases => matchesAnyAlias(team, aliases));
}

export function isInitialSpanishEuroleagueWildcard(team: TeamLike): boolean {
  return matchesAnyAlias(team, INITIAL_WILDCARD_ALIASES);
}

function canonicalTid(team: TeamLike, source: EuroleagueSelectionSource): number | null {
  const tid = getTid(team);
  if (tid == null) return null;
  return source.clubAliasMap?.[tid] ?? tid;
}

function uniqueTids(tids: Array<number | null | undefined>): number[] {
  return [...new Set(tids.filter((tid): tid is number => typeof tid === 'number' && tid >= 100))];
}

function sortByWildcardPriority(a: TeamLike, b: TeamLike): number {
  const aFinish = a.lastEndesaFinish ?? Number.POSITIVE_INFINITY;
  const bFinish = b.lastEndesaFinish ?? Number.POSITIVE_INFINITY;
  if (aFinish !== bFinish) return aFinish - bFinish;

  const aInitial = isInitialSpanishEuroleagueWildcard(a) ? 0 : 1;
  const bInitial = isInitialSpanishEuroleagueWildcard(b) ? 0 : 1;
  if (aInitial !== bInitial) return aInitial - bInitial;

  const aGames = (a.wins ?? 0) + (a.losses ?? 0);
  const bGames = (b.wins ?? 0) + (b.losses ?? 0);
  if (aGames > 0 || bGames > 0) {
    const aPct = aGames > 0 ? (a.wins ?? 0) / aGames : -1;
    const bPct = bGames > 0 ? (b.wins ?? 0) / bGames : -1;
    if (aPct !== bPct) return bPct - aPct;
  }

  return (b.pop ?? 0) - (a.pop ?? 0);
}

function capWithProtectedTids(tids: number[], teamCount: number | undefined, protectedTids: Set<number>): number[] {
  if (!teamCount || tids.length <= teamCount) return tids;
  const protectedList = tids.filter(tid => protectedTids.has(tid));
  const fill = tids.filter(tid => !protectedTids.has(tid)).slice(0, Math.max(0, teamCount - protectedList.length));
  return uniqueTids([...fill, ...protectedList]).slice(0, teamCount);
}

export function selectEuroleagueParticipants(
  source: EuroleagueSelectionSource,
  teamCount?: number,
): EuroleagueSelection {
  const teams = source.nonNBATeams ?? [];
  const endesaTeams = teams.filter(team => team.league === 'Endesa');

  const licensedSpanishTids = uniqueTids(
    endesaTeams
      .filter(isLicensedSpanishEuroleagueClub)
      .map(team => canonicalTid(team, source)),
  );

  const wildcardTeam = [...endesaTeams]
    .filter(team => !isLicensedSpanishEuroleagueClub(team))
    .sort(sortByWildcardPriority)[0] ?? null;
  const wildcardTid = wildcardTeam ? canonicalTid(wildcardTeam, source) : null;

  const spanishParticipantTids = new Set(uniqueTids([...licensedSpanishTids, wildcardTid]));
  const euroleagueBaseTids = teams
    .filter(team => team.league === 'Euroleague')
    .filter(team => {
      const mappedTid = canonicalTid(team, source);
      return mappedTid == null || !spanishParticipantTids.has(mappedTid);
    })
    .filter(team => !isLicensedSpanishEuroleagueClub(team) && !isInitialSpanishEuroleagueWildcard(team))
    .map(team => canonicalTid(team, source));

  const ordered = uniqueTids([...euroleagueBaseTids, ...licensedSpanishTids, wildcardTid]);
  const protectedTids = new Set<number>([...licensedSpanishTids, ...(wildcardTid != null ? [wildcardTid] : [])]);
  if (source.userTeamId != null && ordered.includes(source.userTeamId)) protectedTids.add(source.userTeamId);

  return {
    tids: capWithProtectedTids(ordered, teamCount, protectedTids),
    licensedSpanishTids,
    wildcardTid,
    wildcardFinish: wildcardTeam?.lastEndesaFinish ?? null,
  };
}
