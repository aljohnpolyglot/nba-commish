import type { NBAPlayer, NBATeam } from '../types';
import { normalizePlayerName } from '../data/realPlayerDataFetcher';
import { readJsonResponse } from './utils/jsonResponse';
import { sameCanonicalPlayerIdentity } from '../utils/playerIdentity';

export interface ExternalCareerArchiveSpec {
  path: string;
  prefix: string;
  competitionId: string;
  tidOffset: number;
}

interface ExternalCareerArchivePayload {
  players: any[];
  teams: any[];
}

export interface ExternalCareerArchiveBundle {
  players: NBAPlayer[];
  teams: NBATeam[];
}

const ARCHIVES: ExternalCareerArchiveSpec[] = [
  {
    path: '/data/external/nbl-australia/australian-nbl-2026-bbgm.json',
    prefix: 'nbl-history',
    competitionId: 'nblaustralia',
    tidOffset: 8000,
  },
  {
    path: '/data/external/gleague/gleague-2026-bbgm.json',
    prefix: 'gleague-history',
    competitionId: 'gleague',
    tidOffset: 6000,
  },
];

const archivePromises = new Map<string, Promise<ExternalCareerArchivePayload>>();

const archiveIdentityName = (name: unknown): string =>
  String(name ?? '').replace(/\s*\(Import\)\s*$/i, '').trim();

function loadArchive(spec: ExternalCareerArchiveSpec): Promise<ExternalCareerArchivePayload> {
  const existing = archivePromises.get(spec.path);
  if (existing) return existing;
  const promise = fetch(spec.path)
    .then(response => readJsonResponse<any>(response, `${spec.competitionId} player history`))
    .then(data => Array.isArray(data)
      ? { players: data, teams: [] }
      : { players: data?.players ?? [], teams: data?.teams ?? [] })
    .catch(() => ({ players: [], teams: [] }));
  archivePromises.set(spec.path, promise);
  return promise;
}

export function buildExternalCareerArchiveReferences(
  sourcePlayers: any[],
  candidates: readonly NBAPlayer[],
  spec: ExternalCareerArchiveSpec,
  maxSeason = Infinity,
  sourceTeams: any[] = [],
): NBAPlayer[] {
  const sourceTeamsByTid = new Map(sourceTeams.map(team => [Number(team.tid ?? team.id), team]));
  const candidatesByName = new Map<string, NBAPlayer[]>();
  for (const player of candidates) {
    const key = normalizePlayerName(archiveIdentityName(player.name));
    const rows = candidatesByName.get(key) ?? [];
    rows.push(player);
    candidatesByName.set(key, rows);
  }
  return sourcePlayers.flatMap(source => {
    const name = String(source?.name ?? [source?.firstName, source?.lastName].filter(Boolean).join(' ')).trim();
    const matches = candidatesByName.get(normalizePlayerName(name)) ?? [];
    const sourceIdentity = {
      internalId: String(source?.internalId ?? ''),
      name,
      born: source?.born,
      draft: source?.draft,
      srID: source?.srID,
      slug: source?.slug,
      gender: source?.gender,
      status: source?.status,
    } as NBAPlayer;
    if (!name || !matches.some(candidate => sameCanonicalPlayerIdentity(
      { ...candidate, name: archiveIdentityName(candidate.name) },
      sourceIdentity,
    ))) return [];
    const stats = (source.stats ?? []).filter((row: any) => Number(row.season ?? 0) <= maxSeason).map((row: any) => {
      const sourceTid = Number(row.tid ?? -1);
      const team = sourceTeamsByTid.get(sourceTid);
      const teamName = [team?.region, team?.name].filter(Boolean).join(' ').trim();
      return {
        ...row,
        tid: sourceTid >= 0 ? sourceTid + spec.tidOffset : sourceTid,
        competitionId: row.competitionId ?? spec.competitionId,
        abbrev: row.abbrev ?? team?.abbrev,
        teamAbbrev: row.teamAbbrev ?? team?.abbrev,
        teamName: row.teamName ?? (teamName || undefined),
      };
    });
    return [{
      internalId: `${spec.prefix}-${source.pid ?? normalizePlayerName(name).replace(/\s+/g, '-')}`,
      name,
      tid: -3,
      status: 'Retired',
      overallRating: 0,
      born: source.born,
      pos: source.pos,
      hgt: source.hgt,
      weight: source.weight,
      college: source.college,
      draft: Number(source.draft?.year ?? 0) <= maxSeason ? source.draft : undefined,
      imgURL: source.imgURL,
      ratings: [],
      stats,
      awards: source.awards ?? [],
      injury: { type: 'Healthy', gamesRemaining: 0 },
      _historySourceOnly: true,
    } as NBAPlayer];
  });
}

export function buildExternalCareerArchiveTeams(
  sourceTeams: any[],
  spec: ExternalCareerArchiveSpec,
): NBATeam[] {
  return sourceTeams.flatMap(team => {
    const sourceTid = Number(team.tid ?? team.id);
    if (!Number.isFinite(sourceTid) || sourceTid < 0) return [];
    const tid = sourceTid + spec.tidOffset;
    return [{
      ...team,
      id: tid,
      tid,
      league: spec.competitionId,
      disabled: true,
    } as NBATeam];
  });
}

export async function loadExternalCareerArchiveBundle(
  candidates: readonly NBAPlayer[],
  maxSeason = Infinity,
): Promise<ExternalCareerArchiveBundle> {
  const entries = await Promise.all(ARCHIVES.map(async spec => {
    const archive = await loadArchive(spec);
    return {
      players: buildExternalCareerArchiveReferences(
        archive.players,
        candidates,
        spec,
        maxSeason,
        archive.teams,
      ),
      teams: buildExternalCareerArchiveTeams(archive.teams, spec),
    };
  }));
  return {
    players: entries.flatMap(entry => entry.players),
    teams: entries.flatMap(entry => entry.teams),
  };
}

export async function loadExternalCareerArchiveReferences(candidates: readonly NBAPlayer[], maxSeason = Infinity): Promise<NBAPlayer[]> {
  return (await loadExternalCareerArchiveBundle(candidates, maxSeason)).players;
}
