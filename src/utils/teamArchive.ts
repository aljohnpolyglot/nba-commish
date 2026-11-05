import type { NBATeam } from '../types';

export type ArchivedNBATeam = NBATeam & {
  archivedTeam: true;
  archiveKey: string;
  archiveSourceTid: number;
  archivedThroughSeason?: number;
};

function normalizePart(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function getTeamArchiveKey(team: Pick<NBATeam, 'abbrev' | 'region' | 'name'>): string {
  return [
    normalizePart(team.abbrev),
    normalizePart(team.region),
    normalizePart(team.name),
  ].join('|');
}

function hashArchiveKey(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getTeamArchiveId(team: Pick<NBATeam, 'abbrev' | 'region' | 'name'>): number {
  return -100000 - (hashArchiveKey(getTeamArchiveKey(team)) % 900000);
}

function mergeSeasons(left: any[] = [], right: any[] = []): any[] {
  const bySeason = new Map<number, any>();
  for (const row of [...left, ...right]) {
    const season = Number(row?.season);
    if (!Number.isFinite(season)) continue;
    const existing = bySeason.get(season);
    bySeason.set(season, {
      ...(existing ?? {}),
      ...row,
      season,
      playoffRoundsWon: Math.max(
        Number(existing?.playoffRoundsWon ?? row?.playoffRoundsWon ?? 0),
        Number(row?.playoffRoundsWon ?? existing?.playoffRoundsWon ?? 0),
      ),
    });
  }
  return Array.from(bySeason.values()).sort((leftRow, rightRow) => Number(leftRow.season) - Number(rightRow.season));
}

function mergeRetiredJerseys(left: any[] = [], right: any[] = []): any[] {
  const byKey = new Map<string, any>();
  for (const row of [...left, ...right]) {
    const key = [
      row?.number ?? '',
      row?.playerId ?? row?.pid ?? '',
      row?.text ?? '',
      row?.seasonRetired ?? '',
    ].join('|');
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return Array.from(byKey.values());
}

function compactArchivedTeam(team: NBATeam, throughSeason?: number): ArchivedNBATeam {
  const archiveKey = getTeamArchiveKey(team);
  return {
    ...team,
    id: getTeamArchiveId(team),
    archivedTeam: true,
    archiveKey,
    archiveSourceTid: team.id,
    archivedThroughSeason: throughSeason,
    wins: 0,
    losses: 0,
    streak: undefined,
    seasons: mergeSeasons([], (team as any).seasons ?? []),
    retiredJerseyNumbers: mergeRetiredJerseys([], (team as any).retiredJerseyNumbers ?? []),
    tradeExceptions: undefined,
    deadMoney: undefined,
    cashUsedInTrades: undefined,
    trainingCalendar: undefined,
    tycoon: undefined,
  };
}

export function mergeTeamArchive(
  existingArchive: NBATeam[] | undefined,
  completedTeams: NBATeam[],
  completedSeason?: number,
): ArchivedNBATeam[] {
  const byKey = new Map<string, ArchivedNBATeam>();
  for (const team of existingArchive ?? []) {
    const archived = team as ArchivedNBATeam;
    const key = archived.archiveKey ?? getTeamArchiveKey(team);
    byKey.set(key, {
      ...archived,
      id: archived.id < -99999 ? archived.id : getTeamArchiveId(team),
      archivedTeam: true,
      archiveKey: key,
      archiveSourceTid: Number.isFinite(Number(archived.archiveSourceTid)) ? Number(archived.archiveSourceTid) : team.id,
      seasons: mergeSeasons([], (team as any).seasons ?? []),
      retiredJerseyNumbers: mergeRetiredJerseys([], (team as any).retiredJerseyNumbers ?? []),
    });
  }

  for (const team of completedTeams) {
    if (team.id < 0 || team.id >= 100) continue;
    const incoming = compactArchivedTeam(team, completedSeason);
    const existing = byKey.get(incoming.archiveKey);
    byKey.set(incoming.archiveKey, existing
      ? {
          ...existing,
          ...incoming,
          id: existing.id,
          seasons: mergeSeasons(existing.seasons ?? [], incoming.seasons ?? []),
          retiredJerseyNumbers: mergeRetiredJerseys(existing.retiredJerseyNumbers ?? [], incoming.retiredJerseyNumbers ?? []),
          archivedThroughSeason: Math.max(existing.archivedThroughSeason ?? 0, incoming.archivedThroughSeason ?? 0) || undefined,
        }
      : incoming);
  }

  return Array.from(byKey.values()).sort((left, right) => {
    const leftRegion = `${left.region ?? ''} ${left.name ?? ''}`.trim();
    const rightRegion = `${right.region ?? ''} ${right.name ?? ''}`.trim();
    return leftRegion.localeCompare(rightRegion);
  });
}

export function isArchivedTeam(team: unknown): team is ArchivedNBATeam {
  return !!team && typeof team === 'object' && (team as any).archivedTeam === true;
}

export function getArchivedTeamStatsTid(team: NBATeam): number {
  return isArchivedTeam(team) ? team.archiveSourceTid : team.id;
}

export function getArchivedTeamSeasonSet(team: NBATeam): Set<number> | null {
  if (!isArchivedTeam(team)) return null;
  const seasons = ((team as any).seasons ?? [])
    .map((season: any) => Number(season?.season))
    .filter((season: number) => Number.isFinite(season));
  return seasons.length > 0 ? new Set(seasons) : null;
}

export function restoreTeamSeasonRecords(
  teams: readonly NBATeam[],
  archive: readonly NBATeam[] | undefined,
  season: number,
): NBATeam[] {
  if (!archive?.length) return [...teams];
  return teams.map(team => {
    if (Number(team.wins ?? 0) + Number(team.losses ?? 0) > 0) return team;
    const archived = archive.find(candidate => {
      if (!isArchivedTeam(candidate) || candidate.archiveSourceTid !== team.id) return false;
      return ((candidate as any).seasons ?? []).some((row: any) => Number(row?.season) === season);
    });
    const row = ((archived as any)?.seasons ?? []).find((candidate: any) => Number(candidate?.season) === season);
    const wins = Number(row?.wins ?? row?.won);
    const losses = Number(row?.losses ?? row?.lost);
    if (!Number.isFinite(wins) || !Number.isFinite(losses) || wins + losses <= 0) return team;
    return { ...team, wins, losses };
  });
}
