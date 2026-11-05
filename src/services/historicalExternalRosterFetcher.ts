import { NBAPlayer, NonNBATeam } from '../types';
import { estimatePotentialBbgm } from '../utils/playerRatings';
import {
  computeLeagueOvr,
  extractJerseyNumber,
  resolveImgURL,
  scaleRatings,
} from './externalRosterService.shared';
import { LEAGUE_MULTIPLIERS } from './logic/leagueOvr';
import { readJsonResponse } from './utils/jsonResponse';
import { getTeamFullName } from '../utils/teamNames';
import { resolveWnbaPlayerPortrait } from '../utils/playerImage';
import { getSourceCoverageThrough, inferSourceRetirement } from './retirement/sourceRetirement';
import {
  applyExternalPortraitCatalog,
  loadExternalPortraitCatalog,
} from './externalPortraitCatalog';

type HistoricalExternalLeague = 'B-League' | 'China CBA' | 'NBL Australia' | 'WNBA';

interface HistoricalExternalPlayerArchiveConfig {
  league: HistoricalExternalLeague;
  internalIdPrefix: string;
}

export type HistoricalExternalPlayerIdentity = NBAPlayer & { _historySourceOnly: true };

interface HistoricalExternalRosterConfig {
  league: HistoricalExternalLeague;
  tidOffset: number;
  internalIdPrefix: string;
  competitionId: string;
  historyPath: string;
  historyLabel: string;
  currentRosterUrl: string;
  currentRosterLabel: string;
  bioUrl: string;
  countryIso2: string;
  teamAliases?: Record<string, string>;
  latestPotentialCap?: number;
}

const normalizeSourceName = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');

const getPlayerName = (item: any): string => item.name
  ?? `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim();

export function buildHistoricalExternalPlayerArchive(
  data: any,
  config: HistoricalExternalPlayerArchiveConfig,
): HistoricalExternalPlayerIdentity[] {
  const sourcePlayers = Array.isArray(data) ? data : data?.players ?? [];
  return sourcePlayers.flatMap((item: any) => {
    const name = getPlayerName(item);
    const sourceRatings = [...(item.ratings ?? [])].sort(
      (left: any, right: any) => Number(left.season ?? 0) - Number(right.season ?? 0),
    );
    if (!name || sourceRatings.length === 0) return [];
    const latestRatings = sourceRatings[sourceRatings.length - 1];
    return [{
      internalId: `${config.internalIdPrefix}-history-${item.pid ?? normalizeSourceName(name)}`,
      tid: -3,
      name,
      overallRating: computeLeagueOvr(latestRatings, config.league),
      ratings: scaleRatings(sourceRatings, LEAGUE_MULTIPLIERS[config.league]),
      stats: item.stats ?? [],
      imgURL: config.league === 'WNBA'
        ? resolveWnbaPlayerPortrait(item.imgURL)
        : resolveImgURL(item.imgURL),
      face: item.face,
      pos: item.pos || 'GF',
      hgt: item.hgt > 100 ? Math.round(item.hgt / 2.54) : item.hgt,
      weight: item.weight,
      born: item.born,
      nationality: item.born?.loc,
      draft: item.draft,
      college: item.college,
      awards: item.awards ?? [],
      injury: { type: 'Healthy', gamesRemaining: 0 },
      status: 'Retired',
      retiredYear: item.retiredYear,
      hof: item.hof === true,
      jerseyNumber: extractJerseyNumber(item),
      _historySourceOnly: true,
    } as HistoricalExternalPlayerIdentity];
  });
}

export async function fetchHistoricalExternalPlayerArchive(
  historyPath: string,
  config: HistoricalExternalPlayerArchiveConfig,
): Promise<HistoricalExternalPlayerIdentity[]> {
  const response = await fetch(historyPath);
  if (!response.ok) return [];
  return buildHistoricalExternalPlayerArchive(
    await readJsonResponse<any>(response, `${config.league} historical player archive`),
    config,
  );
}

async function readOptionalJson<T>(response: Response | null, label: string, fallback: T): Promise<T> {
  if (!response?.ok) return fallback;
  try {
    return await readJsonResponse<T>(response, label);
  } catch (error) {
    console.warn(`${label} unavailable:`, error);
    return fallback;
  }
}

export async function fetchBundledHistoricalExternalRoster(
  config: HistoricalExternalRosterConfig,
  requestedSeason?: number,
): Promise<{ players: NBAPlayer[]; teams: NonNBATeam[] }> {
  const [historyResponse, currentResponse, bioResponse, portraitCatalog] = await Promise.all([
    fetch(config.historyPath).catch(() => null),
    fetch(config.currentRosterUrl).catch(() => null),
    fetch(config.bioUrl).catch(() => null),
    loadExternalPortraitCatalog(config.league, requestedSeason).catch(() => new Map()),
  ]);

  if (!historyResponse?.ok && !currentResponse?.ok) {
    console.error(`Failed to fetch ${config.league} roster`);
    return { players: [], teams: [] };
  }

  const currentData = currentResponse?.ok
    ? await readJsonResponse<any>(currentResponse, config.currentRosterLabel)
    : { players: [], teams: [] };
  const historicalData = await readOptionalJson<any | null>(
    historyResponse,
    config.historyLabel,
    null,
  );
  const data = historicalData?.players?.length ? historicalData : currentData;
  const sourcePlayers = Array.isArray(data) ? data : data.players ?? [];
  const sourceTeams = Array.isArray(data.teams) ? data.teams : [];
  const sourceCoverageThrough = getSourceCoverageThrough({
    players: sourcePlayers,
    teams: sourceTeams,
  });
  const sourceSeasons = [
    ...sourcePlayers.flatMap((player: any) =>
      (player.ratings ?? []).map((rating: any) => Number(rating.season)),
    ),
    ...sourceTeams.flatMap((team: any) =>
      (team.seasons ?? []).map((teamSeason: any) => Number(teamSeason.season)),
    ),
  ].filter(Number.isFinite);
  const coverageStart = sourceSeasons.length ? Math.min(...sourceSeasons) : null;
  const coverageThrough = sourceSeasons.length ? Math.max(...sourceSeasons) : null;
  if (requestedSeason != null && coverageStart != null && requestedSeason < coverageStart) {
    return { players: [], teams: [] };
  }
  const season = requestedSeason == null
    ? coverageThrough ?? new Date().getFullYear()
    : Math.min(requestedSeason, coverageThrough ?? requestedSeason);
  const currentSeason = coverageThrough == null || season >= coverageThrough;
  const currentPlayers = Array.isArray(currentData)
    ? currentData
    : currentData.players ?? [];
  const currentTeams = Array.isArray(currentData.teams) ? currentData.teams : [];
  const bioData = await readOptionalJson<any>(bioResponse, `${config.league} biography source`, []);
  const bioRows = Array.isArray(bioData) ? bioData : bioData.players ?? [];

  const currentPlayerByName = new Map<string, any>();
  currentPlayers.forEach((player: any) => {
    const name = getPlayerName(player);
    if (name) currentPlayerByName.set(normalizeSourceName(name), player);
  });

  const bioByName = new Map<string, any>();
  bioRows.forEach((bio: any) => {
    if (bio.name) bioByName.set(normalizeSourceName(bio.name), bio);
  });

  const currentTeamByName = new Map<string, any>();
  currentTeams.forEach((team: any) => {
    const name = `${team.region ?? ''} ${team.name ?? ''}`.trim();
    if (name) currentTeamByName.set(normalizeSourceName(name), team);
  });

  const sourceTidToCanonicalTid = new Map<number, number>();
  const sourceTeamByTid = new Map<number, any>(
    sourceTeams.map((team: any) => [Number(team.tid), team]),
  );
  let nextTeamTid = Math.max(-1, ...currentTeams.map((team: any) => Number(team.tid) || 0)) + 1;

  sourceTeams.forEach((team: any) => {
    const sourceName = `${team.region ?? ''} ${team.name ?? ''}`.trim();
    const normalizedName = normalizeSourceName(sourceName);
    const currentName = config.teamAliases?.[normalizedName] ?? normalizedName;
    const currentTeam = currentTeamByName.get(currentName);
    const canonicalSourceTid = currentTeam?.tid ?? nextTeamTid++;
    sourceTidToCanonicalTid.set(Number(team.tid), canonicalSourceTid);
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

  const teams: NonNBATeam[] = sourceTeams
    .filter((team: any) => activeSourceTids.has(Number(team.tid)))
    .map((team: any) => {
      const sourceName = `${team.region ?? ''} ${team.name ?? ''}`.trim();
      const normalizedName = normalizeSourceName(sourceName);
      const currentName = config.teamAliases?.[normalizedName] ?? normalizedName;
      const currentTeam = currentTeamByName.get(currentName);
      const canonicalSourceTid = sourceTidToCanonicalTid.get(Number(team.tid)) ?? Number(team.tid);
      const seasonIdentity = (team.seasons ?? []).find((row: any) => Number(row.season) === season);
      return {
        tid: canonicalSourceTid + config.tidOffset,
        cid: team.cid,
        did: team.did,
        region: team.region,
        name: team.name ?? '',
        abbrev: team.abbrev,
        pop: team.pop || 1,
        stadiumCapacity: team.stadiumCapacity,
        imgURL: currentTeam?.imgURL || seasonIdentity?.imgURLSmall || seasonIdentity?.imgURL || team.imgURL,
        colors: team.colors,
        league: config.league,
        realgmTeamId: team.realgmTeamId,
        seasons: (team.seasons ?? []).filter((row: any) => Number(row.season) < season),
      };
    });

  const players: NBAPlayer[] = [];
  sourcePlayers.forEach((item: any) => {
    const playerName = getPlayerName(item);
    const sourceRetirement = inferSourceRetirement(item, {
      branchCutoffYear: season - 1,
      sourceCoverageThrough,
      confirmThroughSourceCoverage: true,
    });
    const yearZeroRetiree = sourceRetirement?.retiredYear === season - 1;
    const ratings = [...(item.ratings ?? [])]
      .filter((rating: any) => Number(rating.season ?? season) <= (
        yearZeroRetiree ? sourceRetirement.retiredYear : season
      ))
      .sort(
        (left: any, right: any) => Number(left.season ?? 0) - Number(right.season ?? 0),
      );
    if (!playerName || !ratings.length) return;

    const nameKey = normalizeSourceName(playerName);
    const currentPlayer = currentPlayerByName.get(nameKey);
    const bio = bioByName.get(nameKey);
    const latestRatings = ratings[ratings.length - 1];
    const overallRating = computeLeagueOvr(latestRatings, config.league);
    const scaledRatings = scaleRatings(ratings, LEAGUE_MULTIPLIERS[config.league]);
    if (config.latestPotentialCap != null && scaledRatings.length) {
      const latestScaledRatings = scaledRatings[scaledRatings.length - 1];
      const ratingSeason = Number(latestRatings.season) || new Date().getFullYear();
      const age = ratingSeason - (item.born?.year ?? ratingSeason - 31);
      latestScaledRatings.pot = Math.min(
        config.latestPotentialCap,
        estimatePotentialBbgm(overallRating, age),
      );
    }

    const currentStat = (item.stats ?? [])
      .filter((row: any) =>
        Number(row.season) === season &&
        row.playoffs !== true &&
        Number(row.tid) >= 0,
      )
      .sort((left: any, right: any) => Number(right.gp ?? 0) - Number(left.gp ?? 0))[0];
    const explicitTid = Number(item.tid);
    const currentFreeAgent = currentSeason && explicitTid === -1;
    const sourceTid = currentSeason && (explicitTid >= 0 || currentFreeAgent)
      ? explicitTid
      : Number(currentStat?.tid);
    const active = Number.isFinite(sourceTid) && activeSourceTids.has(sourceTid);
    if (!active && !currentFreeAgent && !yearZeroRetiree) return;
    const tid = yearZeroRetiree
      ? -3
      : currentFreeAgent
        ? -1
      : (sourceTidToCanonicalTid.get(sourceTid) ?? sourceTid) + config.tidOffset;
    const stats = (item.stats ?? [])
      .filter((row: any) => Number(row.season ?? 0) < season)
      .map((row: any) => {
        const sourceTeam = sourceTeamByTid.get(Number(row.tid));
        return {
          ...row,
          tid: Number(row.tid) >= 0
            ? (sourceTidToCanonicalTid.get(Number(row.tid)) ?? Number(row.tid)) + config.tidOffset
            : row.tid,
          abbrev: row.abbrev ?? sourceTeam?.abbrev,
          teamAbbrev: row.teamAbbrev ?? row.abbrev ?? sourceTeam?.abbrev,
          teamName: sourceTeam ? getTeamFullName(sourceTeam) : undefined,
          teamLogoUrl: sourceTeam?.imgURLSmall ?? sourceTeam?.imgURL,
          league: config.league,
          competitionId: row.competitionId ?? config.competitionId,
        };
      });

    players.push({
      internalId: `${config.internalIdPrefix}-realgm-${item.pid ?? `${sourceTid}-${nameKey}-${item.born?.year || '0'}`}`,
      tid,
      name: playerName,
      overallRating,
      ratings: scaledRatings,
      stats,
      imgURL: config.league === 'WNBA'
        ? resolveWnbaPlayerPortrait(item.imgURL, resolveImgURL(currentPlayer?.imgURL))
        : resolveImgURL(currentPlayer?.imgURL, bio?.image) ?? resolveImgURL(item.imgURL),
      pos: item.pos || 'GF',
      hgt: item.hgt > 100 ? Math.round(item.hgt / 2.54) : item.hgt,
      weight: item.weight,
      born: item.born,
      nationality: item.born?.loc,
      draft: item.draft,
      college: item.college,
      contract: yearZeroRetiree || currentFreeAgent ? undefined : currentSeason ? item.contract : undefined,
      awards: (item.awards ?? [])
        .filter((award: any) => Number(award.season) < season)
        .map((award: any) => ({
          ...award,
          competitionId: award.competitionId ?? config.competitionId,
          source: award.source ?? config.league,
          countryIso2: config.countryIso2,
        })),
      injury: yearZeroRetiree
        ? { type: 'Healthy', gamesRemaining: 0 }
        : currentSeason ? item.injury || { type: 'Healthy', gamesRemaining: 0 } : { type: 'Healthy', gamesRemaining: 0 },
      status: yearZeroRetiree ? 'Retired' : config.league,
      retiredYear: yearZeroRetiree ? sourceRetirement.retiredYear : undefined,
      sourceRetirement: yearZeroRetiree ? sourceRetirement : undefined,
      hof: false,
      jerseyNumber: extractJerseyNumber(item),
    });
  });

  return {
    players: applyExternalPortraitCatalog(players, config.league, portraitCatalog, season),
    teams,
  };
}
