import type { NBAPlayer } from '../../../types';
import { generateAbbrev, matchTeamByWikiName } from '../../../data/brefFetcher';
import { getHistoricalTeamSnapshot, getResolvedTeamLogoUrl } from '../../../utils/teamAssets';
import { getStatValue, type StatCategory } from '../../../utils/statUtils';
import { buildNativeHistoricalPlayerByName } from '../../../data/realPlayerDataFetcher';
import { resolveLeagueHistoryPortraitUrl } from './leagueHistoryShared';
import { getCalibratedPer } from '../../../utils/advancedStatCalibration';

export interface LeaderEntry {
  player: any;
  agg: any;
  value: number;
  team: any;
  sourceOnly?: boolean;
}

export interface HistoryAwardCard {
  name: string;
  team: string;
  imgURL?: string;
  face?: any;
  teamLogoUrl?: string;
  disableNameFallback?: boolean;
  statLine?: string;
  defensiveStatLine?: string;
  playerRef?: any;
  playerIdentityMatch?: HistoryPlayerMatchKind;
  count?: number;
}

export interface HistoryAwardGroup {
  name: string;
  players: HistoryAwardCard[];
}

export const formatHistoryStat = (value: number, decimals = 1) => value.toFixed(decimals);
const teamIdOf = (team: any) => Number(team?.id ?? team?.tid);
const normalizeAbbrev = (value: unknown) => String(value ?? '').trim().toUpperCase();

const resolveAwardTeam = (awardEntry: any, teams: any[]) => {
  const teamLabel = String(awardEntry?.team ?? '').trim();
  const namedTeam = teamLabel
    ? teams.find((team: any) => normalizeAbbrev(team?.abbrev) === normalizeAbbrev(teamLabel))
      ?? matchTeamByWikiName(teamLabel, teams as any[])
    : null;
  if (namedTeam) return namedTeam;
  const tid = Number(awardEntry?.tid);
  return Number.isFinite(tid)
    ? teams.find((team: any) => teamIdOf(team) === tid) ?? null
    : null;
};

const resolveStatTeam = (stat: any, teams: any[]) => {
  const abbrev = normalizeAbbrev(stat?.abbrev ?? stat?.teamAbbrev ?? stat?.tm ?? stat?.TM);
  if (abbrev) {
    const byAbbrev = teams.find((team: any) => normalizeAbbrev(team?.abbrev) === abbrev);
    if (byAbbrev) return byAbbrev;
  }
  const tid = Number(stat?.tid ?? -1);
  if (Number.isFinite(tid) && tid >= 0) {
    return teams.find((team: any) => teamIdOf(team) === tid) ?? null;
  }
  return null;
};

export const aggregateSeason = (player: any, season: number, teams: any[] = []) => {
  const rows = (player.stats ?? []).filter(
    (stat: any) => Number(stat.season) === Number(season)
      && !stat.playoffs
      && (teams.length > 0 ? Boolean(resolveStatTeam(stat, teams)) : (stat.tid ?? -1) >= 0),
  );
  if (!rows.length) return null;
  const totals = rows.reduce(
    (acc: any, stat: any) => ({
      gp: acc.gp + (stat.gp ?? 0),
      fg: acc.fg + (stat.fg ?? 0),
      fga: acc.fga + (stat.fga ?? 0),
      tp: acc.tp + (stat.tp ?? 0),
      tpa: acc.tpa + (stat.tpa ?? 0),
      ft: acc.ft + (stat.ft ?? 0),
      fta: acc.fta + (stat.fta ?? 0),
      orb: acc.orb + (stat.orb ?? 0),
      drb: acc.drb + (stat.drb ?? 0),
      trb: acc.trb + ((stat.trb || stat.reb || (stat.orb ?? 0) + (stat.drb ?? 0)) ?? 0),
      ast: acc.ast + (stat.ast ?? 0),
      stl: acc.stl + (stat.stl ?? 0),
      blk: acc.blk + (stat.blk ?? 0),
      tov: acc.tov + (stat.tov ?? 0),
      pf: acc.pf + (stat.pf ?? 0),
      pts: acc.pts + (stat.pts ?? 0),
      min: acc.min + (stat.min ?? 0),
      perWeighted: acc.perWeighted + getCalibratedPer(stat) * Math.max(Number(stat.min ?? 0), Number(stat.gp ?? 0), 1),
      perWeight: acc.perWeight + Math.max(Number(stat.min ?? 0), Number(stat.gp ?? 0), 1),
    }),
    { gp: 0, fg: 0, fga: 0, tp: 0, tpa: 0, ft: 0, fta: 0, orb: 0, drb: 0, trb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pts: 0, min: 0, perWeighted: 0, perWeight: 0 },
  );
  const primaryRow = rows.reduce((left: any, right: any) => (left.gp >= right.gp ? left : right));
  const primaryTeam = resolveStatTeam(primaryRow, teams);
  return {
    ...totals,
    per: totals.perWeight > 0 ? totals.perWeighted / totals.perWeight : 0,
    primaryTid: primaryTeam ? teamIdOf(primaryTeam) : primaryRow.tid,
  };
};

export const getLeaders = (
  players: any[],
  teams: any[],
  season: number,
  category: StatCategory,
  count: number,
  minGamesPlayed: number,
): LeaderEntry[] => {
  const leaders: LeaderEntry[] = [];
  for (const player of players) {
    const agg = aggregateSeason(player, season, teams);
    if (!agg || agg.gp < minGamesPlayed) continue;
    const value = getStatValue(agg, category);
    if (value <= 0) continue;
    const team = teams.find((candidate: any) => teamIdOf(candidate) === Number(agg.primaryTid));
    leaders.push({ player, agg, value, team });
  }
  return leaders.sort((left, right) => right.value - left.value).slice(0, count);
};

const stripAccents = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const normalizeHistoryPlayerName = (value: string) =>
  stripAccents(value)
    .toLowerCase()
    .replace(/[.'’`-]/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const PLAYER_NAME_ALIASES: Record<string, string[]> = {
  'lew alcindor': ['kareem abdul jabbar'],
  'kareem abdul jabbar': ['lew alcindor'],
  'lloyd free': ['world b free'],
  'world b free': ['lloyd free'],
  'ron artest': ['metta world peace'],
  'metta world peace': ['ron artest'],
};

const awardNameCandidates = (awardEntry: any): string[] => {
  const raw = [
    awardEntry?.name,
    awardEntry?.playerName,
    awardEntry?.player_name,
    awardEntry?.sourceName,
    awardEntry?.fullName,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const normalized = new Set<string>();
  raw.forEach((value) => {
    const key = normalizeHistoryPlayerName(value);
    if (!key) return;
    normalized.add(key);
    PLAYER_NAME_ALIASES[key]?.forEach((alias) => normalized.add(alias));
  });
  return [...normalized];
};

export type HistoryPlayerMatchKind = 'id' | 'source' | 'name';

export const findHistoryPlayerMatch = (
  players: any[],
  awardEntry: any,
): { player: any; kind: HistoryPlayerMatchKind } | undefined => {
  if (!awardEntry) return undefined;
  const idCandidates = [
    awardEntry.pid,
    awardEntry.playerId,
    awardEntry.internalId,
  ].filter((value) => value != null).map((value) => String(value));
  for (const id of idCandidates) {
    const byId = players.find((player: any) => String(player.internalId) === id || String((player as any).pid ?? '') === id);
    if (byId) return { player: byId, kind: 'id' };
  }
  const slugCandidates = [
    awardEntry.srID,
    awardEntry.slug,
    awardEntry.playerSlug,
  ].filter((value) => typeof value === 'string' && value.trim().length > 0);
  for (const slug of slugCandidates) {
    const bySlug = players.find((player: any) =>
      String(player.srID ?? '').toLowerCase() === String(slug).toLowerCase()
      || String(player.slug ?? '').toLowerCase() === String(slug).toLowerCase()
    );
    if (bySlug) return { player: bySlug, kind: 'source' };
  }
  const candidates = awardNameCandidates(awardEntry);
  const byName = players.find((player: any) => candidates.includes(normalizeHistoryPlayerName(player.name ?? '')));
  return byName ? { player: byName, kind: 'name' } : undefined;
};

export const findHistoryPlayer = (players: any[], awardEntry: any) => findHistoryPlayerMatch(players, awardEntry)?.player;

export const isHistoryPlayerStub = (player: any) => String(player?.internalId ?? '').startsWith('hist-');

export const buildHistoryPlayerStub = (name: string): NBAPlayer => buildNativeHistoricalPlayerByName(name) ?? ({
  internalId: `hist-${name.replace(/\s+/g, '-')}`,
  name,
  tid: -1,
  overallRating: 0,
  ratings: [],
  stats: [],
  imgURL: undefined,
  pos: 'G',
  status: 'Retired',
  hof: false,
  injury: { type: 'Healthy', gamesRemaining: 0 },
});

export const buildDetailAwardObject = (awardEntry: any, teams: any[], players: any[], season: number) => {
  if (!awardEntry) return null;
  const team = resolveAwardTeam(awardEntry, teams);
  const playerMatch = findHistoryPlayerMatch(players, awardEntry);
  const player = playerMatch?.player;
  const agg = player ? aggregateSeason(player, season, teams) : null;
  const snapshot = getHistoricalTeamSnapshot(team, season);
  const statLine = agg && agg.gp > 0
    ? `${formatHistoryStat(getStatValue(agg, 'PTS'))} / ${formatHistoryStat(getStatValue(agg, 'REB'))} / ${formatHistoryStat(getStatValue(agg, 'AST'))}`
    : '';
  const defensiveStatLine = agg && agg.gp > 0
    ? `${formatHistoryStat(getStatValue(agg, 'REB'))} / ${formatHistoryStat(getStatValue(agg, 'STL'))} / ${formatHistoryStat(getStatValue(agg, 'BLK'))}`
    : '';
  return {
    name: awardEntry.name,
    team: snapshot?.abbrev || team?.abbrev || awardEntry.team || 'FA',
    imgURL: awardEntry.imgURL ?? resolveLeagueHistoryPortraitUrl(player, awardEntry.name),
    face: (player as any)?.face ?? awardEntry.face ?? awardEntry.staff?.face,
    teamLogoUrl: snapshot?.logoUrl || getResolvedTeamLogoUrl(team, season),
    playerRef: player ?? null,
    playerIdentityMatch: playerMatch?.kind,
    statLine,
    defensiveStatLine,
  };
};

export const buildBrefAwardObject = (awardEntry: { name: string; team: string } | undefined, teams: any[], players: any[], season: number) => {
  if (!awardEntry?.name) return null;
  const player = players.find((candidate: any) => candidate.name?.toLowerCase() === awardEntry.name.toLowerCase());
  const team = matchTeamByWikiName(awardEntry.team, teams as any[]) as any;
  const agg = player ? aggregateSeason(player, season, teams) : null;
  const snapshot = getHistoricalTeamSnapshot(team, season);
  return {
    name: awardEntry.name,
    team: snapshot?.abbrev || team?.abbrev || (awardEntry.team ? generateAbbrev(awardEntry.team) : ''),
    imgURL: (awardEntry as any).imgURL ?? resolveLeagueHistoryPortraitUrl(player, awardEntry.name),
    face: (player as any)?.face ?? (awardEntry as any).face ?? (awardEntry as any).staff?.face,
    teamLogoUrl: snapshot?.logoUrl || getResolvedTeamLogoUrl(team, season),
    playerRef: player ?? null,
    playerIdentityMatch: player ? 'name' as const : undefined,
    statLine: agg && agg.gp > 0
      ? `${formatHistoryStat(getStatValue(agg, 'PTS'))} / ${formatHistoryStat(getStatValue(agg, 'REB'))} / ${formatHistoryStat(getStatValue(agg, 'AST'))}`
      : '',
    defensiveStatLine: agg && agg.gp > 0
      ? `${formatHistoryStat(getStatValue(agg, 'REB'))} / ${formatHistoryStat(getStatValue(agg, 'STL'))} / ${formatHistoryStat(getStatValue(agg, 'BLK'))}`
      : '',
  };
};

export const resolveHistoryAwardPlayers = (awardEntries: any[], teams: any[], players: any[], season?: number): HistoryAwardCard[] => {
  if (!awardEntries) return [];
  return awardEntries.map((awardEntry: any) => {
    const team = resolveAwardTeam(awardEntry, teams);
    const playerMatch = findHistoryPlayerMatch(players, awardEntry);
    const player = playerMatch?.player;
    const fallbackTeam = awardEntry.team
      ? { name: awardEntry.team, abbrev: generateAbbrev(awardEntry.team), league: 'PBA' }
      : null;
    const logoSource = team ?? fallbackTeam;
    const snapshot = getHistoricalTeamSnapshot(team, season);
    return {
      name: awardEntry.name,
      team: snapshot?.abbrev || team?.abbrev || fallbackTeam?.abbrev || 'FA',
      imgURL: resolveLeagueHistoryPortraitUrl(player, awardEntry.name),
      face: (player as any)?.face,
      teamLogoUrl: snapshot?.logoUrl || (logoSource ? getResolvedTeamLogoUrl(logoSource, season) : undefined),
      playerRef: player ?? null,
      playerIdentityMatch: playerMatch?.kind,
    };
  });
};

export const buildFlatHistoryTeams = (
  prefix: string,
  teamNames: string[],
  flatAwards: any[],
  teams: any[],
  players: any[],
  season?: number,
) => teamNames
  .map((teamName) => ({
    name: teamName,
    players: resolveHistoryAwardPlayers(
      flatAwards.filter((awardEntry: any) => awardEntry.type === `${prefix} ${teamName}`),
      teams,
      players,
      season,
    ),
  }))
  .filter((team) => team.players.length > 0);

export const applyBrefHistoryTeams = (
  section: HistoryAwardGroup[],
  brefData: any[] | undefined,
  players: any[],
  teams: any[],
  season?: number,
): HistoryAwardGroup[] => {
  if (section.some((team) => team.players.length)) return section;
  return (brefData ?? []).map((team) => ({
    name: team.teamName,
    players: team.players.map((playerEntry: any) => {
        const playerMatch = findHistoryPlayerMatch(players, playerEntry);
        const player = playerMatch?.player;
        const sourceTeam = String(playerEntry.team ?? '').trim();
        const agg = player ? aggregateSeason(player, Number(season), teams) : null;
        const matchedTeam = sourceTeam
          ? (matchTeamByWikiName(sourceTeam, teams as any[]) as any)
            ?? teams.find((candidate: any) => candidate.abbrev === sourceTeam || candidate.name?.endsWith(sourceTeam))
          : teams.find((candidate: any) => teamIdOf(candidate) === Number(agg?.primaryTid));
        const snapshot = getHistoricalTeamSnapshot(matchedTeam, season);
        return {
          name: playerEntry.name,
          team: snapshot?.abbrev || playerEntry.team,
          imgURL: resolveLeagueHistoryPortraitUrl(player, playerEntry.name),
          face: (player as any)?.face,
          teamLogoUrl: snapshot?.logoUrl || getResolvedTeamLogoUrl(matchedTeam, season),
          playerRef: player ?? null,
          playerIdentityMatch: playerMatch?.kind,
        };
      }),
  }));
};

export const buildBestRecords = (teams: any[], season: number, bref: any, allowLiveFallback = false) => {
  const byConference: Record<string, { team: any; ts: any }[]> = {};
  teams.forEach((team: any) => {
    const ts = team.seasons?.find((teamSeason: any) => Number(teamSeason.season) === Number(season));
    const rowWon = ts?.won ?? ts?.wins;
    const rowLost = ts?.lost ?? ts?.losses;
    const liveWon = team.wins;
    const liveLost = team.losses;
    const sourceRecord = bref?.teamRecords?.find((record: any) =>
      Boolean(matchTeamByWikiName(record.name, [team] as any[])),
    );
    const rowGames = Number(rowWon ?? 0) + Number(rowLost ?? 0);
    const shouldUseSource = rowGames === 0 && sourceRecord;
    const shouldUseLiveFallback =
      allowLiveFallback
      && !shouldUseSource
      && (
        (rowWon == null && rowLost == null && liveWon != null && liveLost != null)
        || (rowGames === 0 && (liveWon ?? 0) + (liveLost ?? 0) > 0)
      );
    const won = shouldUseSource ? sourceRecord.wins : shouldUseLiveFallback ? liveWon : rowWon;
    const lost = shouldUseSource ? sourceRecord.losses : shouldUseLiveFallback ? liveLost : rowLost;
    if (won === undefined || lost === undefined) return;
    const conference = team.conference ?? 'Unknown';
    if (!byConference[conference]) byConference[conference] = [];
    byConference[conference].push({ team, ts: { ...(ts ?? {}), won, lost } });
  });
  const bestRecords: { conference: string; team: any; ts: any }[] = [];
  for (const [conference, entries] of Object.entries(byConference)) {
    if (!entries.length) continue;
    const best = entries.sort((left, right) => right.ts.won - left.ts.won)[0];
    bestRecords.push({ conference, ...best });
  }
  if (bestRecords.length === 0 && bref?.bestRecords?.length) {
    bref.bestRecords.forEach((record: any) => {
      const team = matchTeamByWikiName(record.name, teams as any[]) as any;
      if (!team) return;
      bestRecords.push({
        conference: record.conference.replace('ern', ''),
        team,
        ts: { won: record.wins, lost: record.losses },
      });
    });
  }
  return bestRecords.sort((left, right) => left.conference.localeCompare(right.conference));
};

export const buildSemifinalsMvpEntries = (entries: any[], teams: any[], players: any[], season: number) => (
  entries.map((awardEntry: any) => {
    const team = resolveAwardTeam(awardEntry, teams);
    const playerMatch = findHistoryPlayerMatch(players, awardEntry);
    const player = playerMatch?.player;
    const agg = player ? aggregateSeason(player, season, teams) : null;
    const snapshot = getHistoricalTeamSnapshot(team, season);
    return {
      name: awardEntry.name,
      team: snapshot?.abbrev || team?.abbrev || '—',
      imgURL: resolveLeagueHistoryPortraitUrl(player, awardEntry.name),
      face: (player as any)?.face,
      teamLogoUrl: snapshot?.logoUrl || getResolvedTeamLogoUrl(team, season),
      playerRef: player ?? null,
      playerIdentityMatch: playerMatch?.kind,
      statLine: agg && agg.gp > 0
        ? `${formatHistoryStat(getStatValue(agg, 'PTS'))} pts, ${formatHistoryStat(getStatValue(agg, 'REB'))} trb, ${formatHistoryStat(getStatValue(agg, 'AST'))} ast`
        : '',
    };
  })
);

export const buildHistoricalAllStarRoster = (players: any[], teams: any[], season: number) => {
  const roster: { playerId: string; playerName: string; teamAbbrev: string; conference: string; isStarter?: boolean }[] = [];
  const seen = new Set<string>();
  for (const player of players) {
    const hit = player.awards?.find((award: any) => Number(award.season) === Number(season) && award.type === 'All-Star');
    if (!hit || seen.has(player.internalId)) continue;
    seen.add(player.internalId);
    const stats = player.stats?.filter((stat: any) => Number(stat.season) === Number(season) && !stat.playoffs && ((stat.tid ?? -1) >= 0 || resolveStatTeam(stat, teams))) ?? [];
    const primary = stats.length ? stats.reduce((left: any, right: any) => (left.gp >= right.gp ? left : right)) : null;
    const primaryTeam = primary ? resolveStatTeam(primary, teams) : null;
    const tid = primaryTeam ? teamIdOf(primaryTeam) : primary?.tid ?? player.tid;
    const team = teams.find((candidate: any) => teamIdOf(candidate) === Number(tid));
    const snapshot = getHistoricalTeamSnapshot(team, season);
    roster.push({
      playerId: player.internalId,
      playerName: player.name,
      teamAbbrev: snapshot?.abbrev || team?.abbrev || '—',
      conference: team?.conference ?? 'East',
      isStarter: (hit as any).isStarter ?? false,
    });
  }
  if (!roster.length) return null;
  return roster;
};
