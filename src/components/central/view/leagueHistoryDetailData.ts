import type { NBAPlayer } from '../../../types';
import { generateAbbrev, matchTeamByWikiName } from '../../../data/brefFetcher';
import { getResolvedTeamLogoUrl } from '../../../utils/teamAssets';
import { getStatValue, type StatCategory } from '../../../utils/statUtils';
import { resolveLeagueHistoryPortraitUrl } from './leagueHistoryShared';

export interface LeaderEntry {
  player: any;
  agg: any;
  value: number;
  team: any;
}

export interface HistoryAwardCard {
  name: string;
  team: string;
  imgURL?: string;
  face?: any;
  teamLogoUrl?: string;
  statLine?: string;
  playerRef?: any;
  count?: number;
}

export interface HistoryAwardGroup {
  name: string;
  players: HistoryAwardCard[];
}

export const formatHistoryStat = (value: number, decimals = 1) => value.toFixed(decimals);
const teamIdOf = (team: any) => Number(team?.id ?? team?.tid);

export const aggregateSeason = (player: any, season: number) => {
  const rows = (player.stats ?? []).filter(
    (stat: any) => Number(stat.season) === Number(season) && !stat.playoffs && (stat.tid ?? -1) >= 0,
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
      per: acc.per > 0 ? acc.per : (stat.per ?? 0),
    }),
    { gp: 0, fg: 0, fga: 0, tp: 0, tpa: 0, ft: 0, fta: 0, orb: 0, drb: 0, trb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pts: 0, min: 0, per: 0 },
  );
  const primaryRow = rows.reduce((left: any, right: any) => (left.gp >= right.gp ? left : right));
  return { ...totals, primaryTid: primaryRow.tid };
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
    const agg = aggregateSeason(player, season);
    if (!agg || agg.gp < minGamesPlayed) continue;
    const value = getStatValue(agg, category);
    if (value <= 0) continue;
    const team = teams.find((candidate: any) => teamIdOf(candidate) === Number(agg.primaryTid));
    leaders.push({ player, agg, value, team });
  }
  return leaders.sort((left, right) => right.value - left.value).slice(0, count);
};

const stripAccents = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '');

export const findHistoryPlayer = (players: any[], awardEntry: any) => {
  if (!awardEntry) return undefined;
  if (awardEntry.pid && typeof awardEntry.pid === 'string') {
    const byId = players.find((player: any) => String(player.internalId) === awardEntry.pid);
    if (byId) return byId;
  }
  const nameLower = awardEntry.name?.toLowerCase?.() ?? '';
  const stripped = stripAccents(nameLower);
  return players.find((player: any) => player.name === awardEntry.name)
    ?? players.find((player: any) => player.name?.toLowerCase() === nameLower)
    ?? players.find((player: any) => stripAccents(player.name?.toLowerCase() ?? '') === stripped);
};

export const buildHistoryPlayerStub = (name: string): NBAPlayer => ({
  internalId: `hist-${name.replace(/\s+/g, '-')}`,
  name,
  tid: -1,
  overallRating: 0,
  ratings: [],
  stats: [],
  imgURL: undefined,
  pos: 'G',
  status: undefined,
  hof: false,
  injury: { type: 'Healthy', gamesRemaining: 0 },
});

export const buildDetailAwardObject = (awardEntry: any, teams: any[], players: any[], season: number) => {
  if (!awardEntry) return null;
  const team = awardEntry.tid != null
    ? teams.find((candidate: any) => teamIdOf(candidate) === Number(awardEntry.tid))
    : teams.find((candidate: any) => {
        const fullName = `${candidate?.region ?? ''} ${candidate?.name ?? ''}`.trim();
        return fullName.toLowerCase() === String(awardEntry.team ?? '').toLowerCase()
          || String(candidate?.name ?? '').toLowerCase() === String(awardEntry.team ?? '').toLowerCase();
      });
  const player = findHistoryPlayer(players, awardEntry);
  const agg = player ? aggregateSeason(player, season) : null;
  const statLine = agg && agg.gp > 0
    ? `${formatHistoryStat(getStatValue(agg, 'PTS'))} / ${formatHistoryStat(getStatValue(agg, 'REB'))} / ${formatHistoryStat(getStatValue(agg, 'AST'))}`
    : '';
  return {
    name: awardEntry.name,
    team: team?.abbrev ?? awardEntry.team ?? 'FA',
    imgURL: resolveLeagueHistoryPortraitUrl(player, awardEntry.name),
    face: (player as any)?.face,
    teamLogoUrl: team?.logoUrl,
    statLine,
  };
};

export const buildBrefAwardObject = (awardEntry: { name: string; team: string } | undefined, teams: any[], players: any[], season: number) => {
  if (!awardEntry?.name) return null;
  const player = players.find((candidate: any) => candidate.name?.toLowerCase() === awardEntry.name.toLowerCase());
  const team = matchTeamByWikiName(awardEntry.team, teams as any[]) as any;
  const agg = player ? aggregateSeason(player, season) : null;
  return {
    name: awardEntry.name,
    team: team?.abbrev ?? (awardEntry.team ? generateAbbrev(awardEntry.team) : ''),
    imgURL: resolveLeagueHistoryPortraitUrl(player, awardEntry.name),
    face: (player as any)?.face,
    teamLogoUrl: team?.logoUrl,
    statLine: agg && agg.gp > 0
      ? `${formatHistoryStat(getStatValue(agg, 'PTS'))} / ${formatHistoryStat(getStatValue(agg, 'REB'))} / ${formatHistoryStat(getStatValue(agg, 'AST'))}`
      : '',
  };
};

export const resolveHistoryAwardPlayers = (awardEntries: any[], teams: any[], players: any[]): HistoryAwardCard[] => {
  if (!awardEntries) return [];
  return awardEntries.map((awardEntry: any) => {
    const team = awardEntry.tid != null
      ? teams.find((candidate: any) => teamIdOf(candidate) === Number(awardEntry.tid))
      : (matchTeamByWikiName(awardEntry.team, teams as any[]) as any) ?? null;
    const player = findHistoryPlayer(players, awardEntry);
    const fallbackTeam = awardEntry.team
      ? { name: awardEntry.team, abbrev: generateAbbrev(awardEntry.team), league: 'PBA' }
      : null;
    const logoSource = team ?? fallbackTeam;
    return {
      name: awardEntry.name,
      team: team?.abbrev ?? fallbackTeam?.abbrev ?? 'FA',
      imgURL: resolveLeagueHistoryPortraitUrl(player, awardEntry.name),
      face: (player as any)?.face,
      teamLogoUrl: logoSource ? getResolvedTeamLogoUrl(logoSource) : undefined,
      playerRef: player ?? null,
    };
  });
};

export const buildFlatHistoryTeams = (
  prefix: string,
  teamNames: string[],
  flatAwards: any[],
  teams: any[],
  players: any[],
) => teamNames
  .map((teamName) => ({
    name: teamName,
    players: resolveHistoryAwardPlayers(
      flatAwards.filter((awardEntry: any) => awardEntry.type === `${prefix} ${teamName}`),
      teams,
      players,
    ),
  }))
  .filter((team) => team.players.length > 0);

export const applyBrefHistoryTeams = (
  section: HistoryAwardGroup[],
  brefData: any[] | undefined,
  players: any[],
  teams: any[],
): HistoryAwardGroup[] => {
  if (section.some((team) => team.players.length)) return section;
  return (brefData ?? []).map((team) => ({
    name: team.teamName,
    players: team.players.map((playerEntry: any) => {
      const player = players.find((candidate: any) => candidate.name === playerEntry.name);
      const matchedTeam = teams.find((candidate: any) => candidate.abbrev === playerEntry.team || candidate.name?.endsWith(playerEntry.team));
      return {
        name: playerEntry.name,
        team: playerEntry.team,
        imgURL: resolveLeagueHistoryPortraitUrl(player, playerEntry.name),
        face: (player as any)?.face,
        teamLogoUrl: matchedTeam?.logoUrl,
      };
    }),
  }));
};

export const buildBestRecords = (teams: any[], season: number, bref: any) => {
  const byConference: Record<string, { team: any; ts: any }[]> = {};
  teams.forEach((team: any) => {
    const ts = team.seasons?.find((teamSeason: any) => Number(teamSeason.season) === Number(season));
    const rowWon = ts?.won ?? ts?.wins;
    const rowLost = ts?.lost ?? ts?.losses;
    const liveWon = team.wins;
    const liveLost = team.losses;
    const shouldUseLiveFallback =
      (rowWon == null && rowLost == null && liveWon != null && liveLost != null)
      || ((rowWon ?? 0) + (rowLost ?? 0) === 0 && (liveWon ?? 0) + (liveLost ?? 0) > 0);
    const won = shouldUseLiveFallback ? liveWon : rowWon;
    const lost = shouldUseLiveFallback ? liveLost : rowLost;
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
    const team = teams.find((candidate: any) => teamIdOf(candidate) === Number(awardEntry.tid));
    const player = findHistoryPlayer(players, awardEntry);
    const agg = player ? aggregateSeason(player, season) : null;
    return {
      name: awardEntry.name,
      team: team?.abbrev ?? '—',
      imgURL: resolveLeagueHistoryPortraitUrl(player, awardEntry.name),
      face: (player as any)?.face,
      teamLogoUrl: team?.logoUrl,
      playerRef: player ?? null,
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
    const stats = player.stats?.filter((stat: any) => Number(stat.season) === Number(season) && !stat.playoffs && (stat.tid ?? -1) >= 0) ?? [];
    const tid = stats.length ? stats.reduce((left: any, right: any) => (left.gp >= right.gp ? left : right)).tid : player.tid;
    const team = teams.find((candidate: any) => teamIdOf(candidate) === Number(tid));
    roster.push({
      playerId: player.internalId,
      playerName: player.name,
      teamAbbrev: team?.abbrev ?? '—',
      conference: team?.conference ?? 'East',
      isStarter: (hit as any).isStarter ?? false,
    });
  }
  return roster.length ? roster : null;
};
