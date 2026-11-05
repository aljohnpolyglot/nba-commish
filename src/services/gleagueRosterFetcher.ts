import type { NBAPlayer, NonNBATeam } from '../types';
import { estimatePotentialBbgm } from '../utils/playerRatings';
import {
  computeLeagueOvr,
  extractJerseyNumber,
  resolveImgURL,
  scaleRatings,
} from './externalRosterService.shared';
import { LEAGUE_MULTIPLIERS } from './logic/leagueOvr';
import { buildRatingsHistory } from './playerDevelopment/reverseProgression';
import { readJsonResponse } from './utils/jsonResponse';
import { getTeamFullName } from '../utils/teamNames';
import {
  assignPreSourceGLeagueTeams,
  buildPreSourceGLeagueTeams,
} from './gleagueHistoricalIdentity';
import { applyExternalPortraitCatalog, loadExternalPortraitCatalog } from './externalPortraitCatalog';
import { getRealGmBiographyContinuityRecord } from '../data/realGmBiographyContinuity';
import { hydrateRealGmBiography } from './playerUniverse/realGmBiographyContinuity';
import { sanitizeRankDerivedJerseyHistory } from './sourceJerseyHistory';

const HISTORY_PATH = '/data/external/gleague/gleague-2026-bbgm.json';
const CURRENT_ROSTER_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/gleagueratings';
const BIO_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/gleaguebio';
const TEAM_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/gleagueteams';
const DEFAULT_TID_OFFSET = 6000;
const FIRST_G_LEAGUE_SOURCE_SEASON = 2002;

const normalizeName = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');

const playerName = (player: any): string =>
  player.name ?? `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim();

async function optionalJson<T>(response: Response | null, label: string, fallback: T): Promise<T> {
  if (!response?.ok) return fallback;
  try {
    return await readJsonResponse<T>(response, label);
  } catch (error) {
    console.warn(`${label} unavailable:`, error);
    return fallback;
  }
}

function ratingsForSeason(player: any, season: number): any[] {
  const available = [...(player.ratings ?? [])]
    .filter((rating: any) => Number(rating.season) <= season)
    .sort((left: any, right: any) => Number(left.season) - Number(right.season));
  if (available.length > 0) return available;

  const first = [...(player.ratings ?? [])]
    .sort((left: any, right: any) => Number(left.season) - Number(right.season))[0];
  const firstSeason = Number(first?.season);
  const bornYear = Number(player.born?.year);
  if (!first || !Number.isFinite(firstSeason) || !Number.isFinite(bornYear) || season >= firstSeason) return [];
  return buildRatingsHistory(
    first,
    firstSeason - bornYear,
    firstSeason,
    firstSeason - season,
    `gleague-${player.pid ?? normalizeName(playerName(player))}`,
  ).filter(rating => Number(rating.season) <= season);
}

function isEligibleUnassignedPlayer(player: any, season: number): boolean {
  const bornYear = Number(player.born?.year);
  const draftYear = Number(player.draft?.year);
  const age = season - bornYear;
  if (!Number.isFinite(bornYear) || !Number.isFinite(draftYear)) return false;
  if (age < 19 || age > 35 || draftYear > season) return false;
  const retiredYear = Number(player.retiredYear);
  return !Number.isFinite(retiredYear) || retiredYear >= season;
}

export async function fetchHistoricalGLeagueRoster(
  requestedSeason?: number,
  tidOffset: number = DEFAULT_TID_OFFSET,
): Promise<{ players: NBAPlayer[]; teams: NonNBATeam[] }> {
  const [historyResponse, currentResponse, bioResponse, teamResponse, portraitCatalog] = await Promise.all([
    fetch(HISTORY_PATH).catch(() => null),
    fetch(CURRENT_ROSTER_URL).catch(() => null),
    fetch(BIO_URL).catch(() => null),
    fetch(TEAM_URL).catch(() => null),
    loadExternalPortraitCatalog('G-League', requestedSeason).catch(() => new Map()),
  ]);
  if (!historyResponse?.ok && !currentResponse?.ok) return { players: [], teams: [] };

  const history = await optionalJson<any>(historyResponse, 'Bundled G League history', null);
  const current = await optionalJson<any>(currentResponse, 'Current G League roster', { players: [], teams: [] });
  const bioRows = await optionalJson<any[]>(bioResponse, 'G League biography source', []);
  const teamData = await optionalJson<any>(teamResponse, 'G League team source', {});
  const data = history?.players?.length ? history : current;
  if (requestedSeason != null && requestedSeason < FIRST_G_LEAGUE_SOURCE_SEASON) {
    return { players: [], teams: [] };
  }
  const rawSourcePlayers = Array.isArray(data) ? data : data.players ?? [];
  const sourcePlayers = sanitizeRankDerivedJerseyHistory(
    rawSourcePlayers as NBAPlayer[],
    rawSourcePlayers,
    'gleague',
    new Set(['gleague']),
  ).players as any[];
  const sourceTeams = Array.isArray(data.teams) ? data.teams : [];
  const currentPlayers = Array.isArray(current) ? current : current.players ?? [];
  const currentTeams = Array.isArray(current.teams) ? current.teams : [];
  const coverageSeasons = sourcePlayers.flatMap((player: any) =>
    (player.ratings ?? []).map((rating: any) => Number(rating.season)).filter(Number.isFinite),
  );
  const coverageThrough = coverageSeasons.length
    ? Math.max(...coverageSeasons)
    : requestedSeason ?? new Date().getFullYear();
  const season = Math.max(
    FIRST_G_LEAGUE_SOURCE_SEASON,
    Math.min(requestedSeason ?? coverageThrough, coverageThrough),
  );
  const currentSeason = season >= coverageThrough;

  const currentPlayerByName = new Map<string, any>();
  currentPlayers.forEach((player: any) => {
    const name = playerName(player);
    if (name) currentPlayerByName.set(normalizeName(name), player);
  });
  const bioByName = new Map<string, any>();
  bioRows.forEach((bio: any) => {
    if (bio.name) bioByName.set(normalizeName(bio.name), bio);
  });
  const currentTeamByName = new Map<string, any>();
  currentTeams.forEach((team: any) => {
    const name = `${team.region ?? ''} ${team.name ?? ''}`.trim();
    if (name) currentTeamByName.set(normalizeName(name), team);
  });

  const affiliates = new Map<string, string>();
  [
    ...(teamData.nba_g_league_teams?.eastern_conference ?? []),
    ...(teamData.nba_g_league_teams?.western_conference ?? []),
  ].forEach((team: any) => {
    if (team.team && team.nba_affiliate) affiliates.set(normalizeName(team.team), team.nba_affiliate);
  });

  const sourceTidToCanonicalTid = new Map<number, number>();
  const sourceTeamByTid = new Map<number, any>(
    sourceTeams.map((team: any) => [Number(team.tid), team]),
  );
  let nextTid = Math.max(-1, ...currentTeams.map((team: any) => Number(team.tid) || 0)) + 1;
  sourceTeams.forEach((team: any) => {
    const fullName = `${team.region ?? ''} ${team.name ?? ''}`.trim();
    const currentTeam = currentTeamByName.get(normalizeName(fullName));
    sourceTidToCanonicalTid.set(Number(team.tid), Number(currentTeam?.tid ?? nextTid++));
  });

  const activeSourceTids = new Set<number>();
  sourceTeams.forEach((team: any) => {
    if ((team.seasons ?? []).some((row: any) => Number(row.season) === season)) {
      activeSourceTids.add(Number(team.tid));
    }
  });
  sourcePlayers.forEach((player: any) => {
    (player.stats ?? [])
      .filter((row: any) =>
        Number(row.season) === season &&
        row.playoffs !== true &&
        Number(row.tid) >= 0,
      )
      .forEach((row: any) => activeSourceTids.add(Number(row.tid)));
  });
  if (currentSeason && activeSourceTids.size === 0) {
    sourcePlayers.forEach((player: any) => {
      if (Number(player.tid) >= 0) activeSourceTids.add(Number(player.tid));
    });
  }

  const nativeTeams = sourceTeams
    .filter((team: any) => activeSourceTids.has(Number(team.tid)))
    .map((team: any): NonNBATeam => {
      const fullName = `${team.region ?? ''} ${team.name ?? ''}`.trim();
      const nameKey = normalizeName(fullName);
      const currentTeam = currentTeamByName.get(nameKey);
      const seasonIdentity = (team.seasons ?? []).find((row: any) => Number(row.season) === season);
      return {
        tid: (sourceTidToCanonicalTid.get(Number(team.tid)) ?? Number(team.tid)) + tidOffset,
        cid: team.cid,
        did: team.did,
        region: team.region,
        name: team.name ?? '',
        abbrev: team.abbrev,
        pop: team.pop || 1,
        stadiumCapacity: team.stadiumCapacity,
        imgURL: currentTeam?.imgURL || seasonIdentity?.imgURLSmall || seasonIdentity?.imgURL || team.imgURL,
        colors: team.colors,
        league: 'G-League',
        realgmTeamId: team.realgmTeamId,
        seasons: (team.seasons ?? []).filter((row: any) => Number(row.season) < season),
        nbaAffiliate: affiliates.get(nameKey),
      };
    });
  const preSourceTeams = nativeTeams.length === 0
    ? buildPreSourceGLeagueTeams(season, tidOffset)
    : [];
  const teams = nativeTeams.length > 0 ? nativeTeams : preSourceTeams;

  const players: NBAPlayer[] = [];
  sourcePlayers.forEach((sourcePlayer: any) => {
    const name = playerName(sourcePlayer);
    if (!name) return;
    const currentStat = (sourcePlayer.stats ?? [])
      .filter((row: any) =>
        Number(row.season) === season &&
        row.playoffs !== true &&
        Number(row.tid) >= 0,
      )
      .sort((left: any, right: any) => Number(right.gp ?? 0) - Number(left.gp ?? 0))[0];
    const sourceTid = currentSeason && Number(sourcePlayer.tid) >= 0
      ? Number(sourcePlayer.tid)
      : Number(currentStat?.tid);
    const assigned = Number.isFinite(sourceTid) && activeSourceTids.has(sourceTid);
    if (!assigned && !isEligibleUnassignedPlayer(sourcePlayer, season)) return;
    const ratingsRaw = ratingsForSeason(sourcePlayer, season);
    if (!ratingsRaw.length) return;
    const latestRaw = ratingsRaw[ratingsRaw.length - 1];
    const overallRating = computeLeagueOvr(latestRaw, 'G-League');
    const scaledRatings = scaleRatings(ratingsRaw, LEAGUE_MULTIPLIERS['G-League'])
      .map((rating, index) => ({
        ...rating,
        ovr: computeLeagueOvr(ratingsRaw[index], 'G-League'),
      }));
    const latestScaled = scaledRatings[scaledRatings.length - 1];
    if (latestScaled) {
      const hasSourceRating = (sourcePlayer.ratings ?? [])
        .some((rating: any) => Number(rating.season) <= season);
      latestScaled.pot = Number((hasSourceRating ? latestRaw.pot : undefined) ?? estimatePotentialBbgm(
        overallRating,
        season - Number(sourcePlayer.born?.year ?? season - 25),
      ));
    }
    const nameKey = normalizeName(name);
    const currentPlayer = currentPlayerByName.get(nameKey);
    const bio = bioByName.get(nameKey);
    const basePlayer: NBAPlayer = {
      internalId: `gleague-realgm-${sourcePlayer.pid ?? `${nameKey}-${sourcePlayer.born?.year ?? 0}`}`,
      personId: sourcePlayer.pid != null ? `person:realgm:${sourcePlayer.pid}` : undefined,
      sourceIds: sourcePlayer.pid != null ? { realgm: String(sourcePlayer.pid) } : undefined,
      tid: assigned
        ? (sourceTidToCanonicalTid.get(sourceTid) ?? sourceTid) + tidOffset
        : -1,
      name,
      overallRating,
      ratings: scaledRatings,
      stats: (sourcePlayer.stats ?? [])
        .filter((row: any) => Number(row.season) < season)
        .map((row: any) => {
          const sourceTeam = sourceTeamByTid.get(Number(row.tid));
          return {
            ...row,
            tid: Number(row.tid) >= 0
              ? (sourceTidToCanonicalTid.get(Number(row.tid)) ?? Number(row.tid)) + tidOffset
              : row.tid,
            abbrev: row.abbrev ?? sourceTeam?.abbrev,
            teamAbbrev: row.teamAbbrev ?? row.abbrev ?? sourceTeam?.abbrev,
            teamName: sourceTeam ? getTeamFullName(sourceTeam) : undefined,
            teamLogoUrl: sourceTeam?.imgURLSmall ?? sourceTeam?.imgURL,
            league: 'G League',
            competitionId: row.competitionId ?? 'gleague',
          };
        }),
      imgURL: resolveImgURL(currentPlayer?.imgURL, bio?.image) ?? resolveImgURL(sourcePlayer.imgURL),
      pos: sourcePlayer.pos || 'GF',
      hgt: sourcePlayer.hgt > 100 ? Math.round(sourcePlayer.hgt / 2.54) : sourcePlayer.hgt,
      weight: sourcePlayer.weight,
      born: sourcePlayer.born,
      nationality: sourcePlayer.born?.loc,
      draft: sourcePlayer.draft,
      college: sourcePlayer.college,
      contract: currentSeason && assigned ? sourcePlayer.contract : undefined,
      awards: (sourcePlayer.awards ?? [])
        .filter((award: any) => Number(award.season) < season)
        .map((award: any) => ({
          ...award,
          competitionId: award.competitionId ?? 'gleague',
          source: award.source ?? 'G League',
          countryIso2: 'US',
        })),
      injury: currentSeason ? sourcePlayer.injury || { type: 'Healthy', gamesRemaining: 0 } : { type: 'Healthy', gamesRemaining: 0 },
      status: 'G-League',
      hof: false,
      jerseyNumber: extractJerseyNumber(sourcePlayer, season),
    };
    players.push(hydrateRealGmBiography(
      basePlayer,
      getRealGmBiographyContinuityRecord(sourcePlayer.pid),
    ));
  });

  const assignedPlayers = preSourceTeams.length > 0
      ? assignPreSourceGLeagueTeams(players, preSourceTeams)
      : players;

  return {
    players: applyExternalPortraitCatalog(assignedPlayers, 'G-League', portraitCatalog, season),
    teams,
  };
}
