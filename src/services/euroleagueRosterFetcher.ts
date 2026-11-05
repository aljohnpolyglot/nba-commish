import type { NBAPlayer, NonNBATeam } from '../types';
import { EUROLEAGUE_2026_SOURCE, resolveEuroBasketballSourceSeason, type EuroBasketballSourceDescriptor } from '../data/euroBasketballSources';
import { estimatePotentialBbgm } from '../utils/playerRatings';
import { computeLeagueOvr, extractJerseyNumber, resolveImgURL, scaleRatings } from './externalRosterService.shared';
import { LEAGUE_MULTIPLIERS } from './logic/leagueOvr';
import { sanitizeEuroJerseyHistory } from './euro/jerseyHistory';
import { getEuroClubMarketPopulation } from './euro/teamMarketPopulation';
import { getTeamFullName } from '../utils/teamNames';
import { readJsonResponse } from './utils/jsonResponse';
import { getSourceCoverageThrough, inferSourceRetirement } from './retirement/sourceRetirement';
import { applyExternalPortraitCatalog, loadExternalPortraitCatalog } from './externalPortraitCatalog';
import { cleanChampionName, competitionSeasonEndYear, fetchCompetitionHistory, type CompetitionSeason } from '../data/euroleagueHistoryFetcher';
import { resolveTeamByHistoricalName } from '../utils/teamLookup';

type SourceTeam = {
  tid?: number;
  cid?: number;
  did?: number;
  region?: string;
  name?: string;
  abbrev?: string;
  pop?: number;
  stadiumCapacity?: number;
  imgURL?: string;
  imgURLSmall?: string;
  colors?: string[];
  disabled?: boolean;
  realgmTeamId?: number;
  seasons?: Array<NonNullable<NonNBATeam['seasons']>[number] & { imgURL?: string; imgURLSmall?: string }>;
  europeImport?: {
    franchiseId?: string;
    aliases?: string[];
    sourceRefs?: string[];
    historicalSeasonNameConvention?: 'season-start-year' | 'season-end-year';
    historicalSeasonNames?: Array<{ season: number; displayName: string }>;
  };
};

type SourcePlayer = {
  pid?: number;
  tid?: number;
  firstName?: string;
  lastName?: string;
  name?: string;
  url?: string;
  playerURL?: string;
  ratings?: Array<Record<string, unknown> & { season?: number }>;
  stats?: Array<Record<string, unknown> & { season?: number; tid?: number; playoffs?: boolean; gp?: number; jerseyNumber?: string | number; _rosterOnly?: boolean }>;
  awards?: Array<{ season: number; type: string; competitionId?: string; source?: string }>;
  transactions?: Array<Record<string, unknown> & { season?: number; tid?: number }>;
  imgURL?: string;
  pos?: string;
  hgt?: number;
  weight?: number;
  born?: { year: number; loc: string };
  nationality?: string;
  draft?: NBAPlayer['draft'];
  college?: string;
  contract?: NBAPlayer['contract'];
  injury?: NBAPlayer['injury'];
  jerseyNumber?: string | number;
  retiredYear?: number | null;
  retireddYer?: number | null;
  retirementYear?: number | null;
  europeImport?: {
    personId?: string;
    sourceRefs?: string[];
    aliases?: string[];
    nationality?: string;
    nationalitySource?: string;
    birthplace?: string;
    sourceDob?: string;
    sourceHeightCm?: number;
    birthYearDerivedForBBGM?: boolean;
    birthYearMethod?: string;
    ratingModel?: string;
    bioReview?: Record<string, unknown>;
  };
};

const buildSourcePlayerIds = (
  player: SourcePlayer,
  source: EuroBasketballSourceDescriptor,
): Record<string, string | string[]> => {
  const sourceIds: Record<string, string | string[]> = {};
  if (player.pid != null) sourceIds[source.id] = String(player.pid);
  const refs = [player.url, player.playerURL, ...(player.europeImport?.sourceRefs ?? [])].filter(Boolean) as string[];
  const realgmIds = refs.flatMap(ref => ref.match(/realgm\.com\/player\/[^/]+\/(?:summary|profile)\/(\d+)/i)?.[1] ?? []);
  if (realgmIds.length > 0) sourceIds.realgm = [...new Set(realgmIds)];
  return sourceIds;
};

function normalizeSourceTeamIdentity(team: Pick<SourceTeam, 'region' | 'name'>): { region?: string; name: string } {
  const region = String(team.region ?? '').trim();
  const name = String(team.name ?? '').trim();
  const placeholder = !name || /^(unknown|n\/a|na|team|club|-+)$/i.test(name);
  if (placeholder) return { region: undefined, name: region || 'EuroLeague Club' };
  if (region && region.localeCompare(name, undefined, { sensitivity: 'base' }) === 0) {
    return { region: undefined, name };
  }
  return { region: region || undefined, name };
}

function sourceTeamIdentityForSeason(team: SourceTeam, season: number): { region?: string; name: string } {
  const convention = team.europeImport?.historicalSeasonNameConvention ?? 'season-start-year';
  const nameSeason = convention === 'season-start-year' ? season - 1 : season;
  const historicalName = team.europeImport?.historicalSeasonNames
    ?.find(entry => Number(entry.season) === nameSeason)?.displayName?.trim();
  return historicalName
    ? { name: historicalName }
    : normalizeSourceTeamIdentity(team);
}

export type EuroleagueBbgmFile = {
  teams?: SourceTeam[];
  players?: SourcePlayer[];
};

export interface EuroSourceCompetitionHistoryRow {
  competitionId: string;
  season: number;
  championTid?: number;
  runnerUpTid?: number;
  championName?: string;
  runnerUpName?: string;
  championLogoUrl?: string;
  runnerUpLogoUrl?: string;
}

export interface EuroBasketballRoster {
  players: NBAPlayer[];
  teams: NonNBATeam[];
  competitionHistory: EuroSourceCompetitionHistoryRow[];
}

const rosterPromiseCache = new Map<string, Promise<EuroBasketballRoster>>();

const EUROCUP_MIDSEASON_ENTRANTS: Record<number, Set<string>> = {
  2014: new Set([
    'bc budivelnik',
    'brose baskets bamberg',
    'crvena zvezda belgrade',
    'lietuvos rytas',
    'mens sana 1871 siena',
    'nanterre 92',
    'strasbourg ig',
    'zastal zielona gora',
  ]),
};

function playerName(player: SourcePlayer): string {
  const explicit = String(player.name ?? '').trim();
  if (explicit) return explicit;
  return `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim();
}

function teamsForSeason(
  teams: SourceTeam[],
  players: SourcePlayer[],
  season: number,
  currentSeason: boolean,
  competitionId?: string,
): SourceTeam[] {
  if (currentSeason) return teams.filter(team => typeof team.tid === 'number' && team.disabled !== true);

  const rosterCounts = new Map<number, number>();
  for (const player of players) {
    const tids = new Set((player.stats ?? [])
      .filter(row => Number(row.season) === season && row.playoffs !== true && typeof row.tid === 'number' && row.tid >= 0)
      .map(row => row.tid as number));
    for (const tid of tids) rosterCounts.set(tid, (rosterCounts.get(tid) ?? 0) + 1);
  }
  const playableTids = new Set([...rosterCounts].filter(([, count]) => count >= 8).map(([tid]) => tid));
  let historical = teams.filter(team => typeof team.tid === 'number' && playableTids.has(team.tid));
  if (competitionId === 'eurocup') {
    const midseasonEntrants = EUROCUP_MIDSEASON_ENTRANTS[season];
    if (midseasonEntrants) {
      historical = historical.filter(team => !midseasonEntrants.has(`${team.region ?? ''} ${team.name ?? ''}`.trim().toLowerCase()));
      return historical;
    }
    const maxGamesByTid = new Map<number, number>();
    for (const player of players) {
      for (const row of player.stats ?? []) {
        if (Number(row.season) !== season || row.playoffs === true || typeof row.tid !== 'number') continue;
        maxGamesByTid.set(row.tid, Math.max(maxGamesByTid.get(row.tid) ?? 0, Number(row.gp ?? 0)));
      }
    }
    const frequencies = new Map<number, number>();
    for (const team of historical) {
      const games = maxGamesByTid.get(team.tid as number) ?? 0;
      frequencies.set(games, (frequencies.get(games) ?? 0) + 1);
    }
    const openingStageGames = [...frequencies].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;
    historical = historical.filter(team => (maxGamesByTid.get(team.tid as number) ?? 0) >= openingStageGames);
  }
  if (historical.length > 0) return historical;
  return teams.filter(team => typeof team.tid === 'number' && team.disabled !== true);
}

function rosterTidForSeason(player: SourcePlayer, season: number, currentSeason: boolean): number | null {
  if (currentSeason && typeof player.tid === 'number' && player.tid >= 0) return player.tid;
  const rows = (player.stats ?? [])
    .filter(row => Number(row.season) === season && row.playoffs !== true && typeof row.tid === 'number' && row.tid >= 0)
    .sort((a, b) => Number(b.gp ?? 0) - Number(a.gp ?? 0));
  return rows[0]?.tid ?? null;
}

function stabilizeLowVolumeThreePointRating(
  player: SourcePlayer,
  rating: Record<string, unknown> & { season?: number },
): Record<string, unknown> & { season?: number } {
  const season = Number(rating.season);
  const stat = (player.stats ?? []).find(row =>
    Number(row.season) === season &&
    row.playoffs !== true &&
    // Supplemental Turkish history must not recalibrate the canonical Proballers ratings.
    row.tblstatSource == null &&
    Number(row.gp ?? 0) > 0,
  ) as (Record<string, unknown> & { tpa?: number }) | undefined;
  const attempts = Number(stat?.tpa ?? 0);
  const maxRating =
    attempts <= 2 ? 55 :
    attempts < 10 ? 65 :
    attempts < 25 ? 78 :
    attempts < 50 ? 88 :
    99;
  const threePointRating = Number(rating.tp);
  if (!Number.isFinite(threePointRating) || threePointRating <= maxRating) return rating;
  return { ...rating, tp: maxRating };
}

function ratingsThroughSeason(player: SourcePlayer, season: number, source: EuroBasketballSourceDescriptor): any[] {
  const available = (player.ratings ?? [])
    .filter(row => Number(row.season ?? season) <= season)
    .map(row => stabilizeLowVolumeThreePointRating(player, row))
    .sort((a, b) => Number(a.season ?? 0) - Number(b.season ?? 0));
  if (available.length === 0) return [];

  const scaled = scaleRatings(available, LEAGUE_MULTIPLIERS[source.leagueStatus] ?? 1);
  return scaled.map((row, index) => {
    const raw = available[index];
    const ratingSeason = Number(raw.season ?? season);
    const ovr = computeLeagueOvr(raw, source.leagueStatus);
    const age = player.born?.year ? ratingSeason - player.born.year : 28;
    return {
      ...row,
      ovr,
      pot: Number(raw.pot ?? estimatePotentialBbgm(ovr, age)),
    };
  });
}

function historicalStats(
  player: SourcePlayer,
  season: number,
  source: EuroBasketballSourceDescriptor,
  teamsByTid: ReadonlyMap<number, SourceTeam>,
): any[] {
  return (player.stats ?? [])
    .filter(row => row._rosterOnly !== true && Number(row.season ?? 0) < season)
    .map(row => {
      const sourceTeam = typeof row.tid === 'number' ? teamsByTid.get(row.tid) : undefined;
      const identity = sourceTeam ? sourceTeamIdentityForSeason(sourceTeam, Number(row.season)) : undefined;
      return {
        ...row,
        tid: typeof row.tid === 'number' && row.tid >= 0 ? row.tid + source.teamTidOffset : row.tid,
        abbrev: row.abbrev ?? sourceTeam?.abbrev,
        teamAbbrev: row.teamAbbrev ?? row.abbrev ?? sourceTeam?.abbrev,
        teamName: sourceTeam ? getTeamFullName({ ...sourceTeam, ...identity } as any) : undefined,
        teamLogoUrl: sourceTeam?.imgURLSmall ?? sourceTeam?.imgURL,
        league: source.displayName,
        competitionId: source.competitionId,
      };
    });
}

function historicalTransactions(player: SourcePlayer, season: number, source: EuroBasketballSourceDescriptor): any[] | undefined {
  const rows = (player.transactions ?? [])
    .filter(row => Number(row.season ?? 0) <= season)
    .map(row => ({
      ...row,
      tid: typeof row.tid === 'number' && row.tid >= 0 ? row.tid + source.teamTidOffset : row.tid,
    }));
  return rows.length > 0 ? rows : undefined;
}

function buildSourceCompetitionHistory(
  teams: SourceTeam[],
  source: EuroBasketballSourceDescriptor,
  branchSeason: number,
  competitionArchive: CompetitionSeason[],
): EuroSourceCompetitionHistoryRow[] {
  if (source.competitionId === 'euroleague' || source.competitionId === 'eurocup') {
    // Team notes can describe domestic titles; continental winners require their own archive.
    return competitionArchive.flatMap(archive => {
      const season = competitionSeasonEndYear(archive);
      const championName = cleanChampionName(archive.Champions ?? archive.Season_champions);
      if (season == null || season < source.coverageStart || season >= branchSeason || !championName) return [];
      const candidates = teams.map(team => ({ ...team, ...sourceTeamIdentityForSeason(team, season) }));
      const resolveArchiveTeam = (name: string) => {
        const direct = resolveTeamByHistoricalName(candidates, name);
        if (direct) return direct;
        const matches = candidates.filter(team => resolveTeamByHistoricalName([{ name }], getTeamFullName(team)));
        return matches.length === 1 ? matches[0] : undefined;
      };
      const champion = resolveArchiveTeam(championName);
      const runnerUpName = cleanChampionName(archive.Runnersup);
      const runnerUp = resolveArchiveTeam(runnerUpName);
      return [{
        competitionId: source.competitionId,
        season,
        championName,
        championTid: champion?.tid == null ? undefined : champion.tid + source.teamTidOffset,
        championLogoUrl: champion?.imgURLSmall ?? champion?.imgURL,
        runnerUpName: runnerUpName || undefined,
        runnerUpTid: runnerUp?.tid == null ? undefined : runnerUp.tid + source.teamTidOffset,
        runnerUpLogoUrl: runnerUp?.imgURLSmall ?? runnerUp?.imgURL,
      }];
    }).sort((left, right) => left.season - right.season);
  }
  const rows = new Map<number, EuroSourceCompetitionHistoryRow>();
  for (const team of teams) {
    if (typeof team.tid !== 'number') continue;
    for (const teamSeason of team.seasons ?? []) {
      const season = Number(teamSeason.season);
      if (!Number.isFinite(season) || season < source.coverageStart || season >= branchSeason) continue;
      const note = String(teamSeason.note ?? '').trim().toLowerCase();
      const isRunnerUp = /runner[- ]?up|finalist/.test(note);
      const isChampion = !isRunnerUp && /champion|winner/.test(note);
      if (!isChampion && !isRunnerUp) continue;
      const entry = rows.get(season) ?? { competitionId: source.competitionId, season };
      const identity = sourceTeamIdentityForSeason(team, season);
      const name = getTeamFullName({ ...team, ...identity } as any);
      const logoUrl = teamSeason.imgURLSmall ?? teamSeason.imgURL ?? team.imgURLSmall ?? team.imgURL;
      if (isChampion) {
        entry.championTid = team.tid + source.teamTidOffset;
        entry.championName = name;
        entry.championLogoUrl = logoUrl;
      } else {
        entry.runnerUpTid = team.tid + source.teamTidOffset;
        entry.runnerUpName = name;
        entry.runnerUpLogoUrl = logoUrl;
      }
      rows.set(season, entry);
    }
  }
  return [...rows.values()]
    .filter(row => row.championTid != null)
    .sort((left, right) => left.season - right.season);
}

export function buildEuroBasketballRosterFromSource(
  data: EuroleagueBbgmFile,
  source: EuroBasketballSourceDescriptor,
  requestedSeason?: number,
  competitionArchive: CompetitionSeason[] = [],
): EuroBasketballRoster {
  const season = resolveEuroBasketballSourceSeason(source, requestedSeason);
  if (season === null) return { players: [], teams: [], competitionHistory: [] };
  const currentSeason = season === source.coverageThrough;
  const allSourceTeamsByTid = new Map(
    (data.teams ?? [])
      .filter(team => typeof team.tid === 'number')
      .map(team => [team.tid as number, team] as const),
  );
  const sourceTeams = teamsForSeason(data.teams ?? [], data.players ?? [], season, currentSeason, source.competitionId);
  const sourceTeamTids = new Set(sourceTeams.map(team => team.tid as number));
  const sourceCoverageThrough = getSourceCoverageThrough(data);

  const teams: NonNBATeam[] = sourceTeams.map(team => {
    const identity = sourceTeamIdentityForSeason(team, season);
    return {
      tid: (team.tid as number) + source.teamTidOffset,
      cid: team.cid,
      did: team.did,
      region: identity.region,
      name: identity.name,
      abbrev: team.abbrev,
      pop: getEuroClubMarketPopulation({ ...team, league: source.leagueStatus }) ?? 1,
      stadiumCapacity: team.stadiumCapacity,
      imgURL: team.imgURL ?? team.imgURLSmall,
      colors: team.colors,
      league: source.leagueStatus,
      realgmTeamId: team.realgmTeamId,
      seasons: team.seasons,
      historicalEuropeSource: team.europeImport ? {
        sourceVersion: source.sourceVersion ?? source.id,
        franchiseId: team.europeImport.franchiseId,
        aliases: team.europeImport.aliases,
        sourceRefs: team.europeImport.sourceRefs,
        selectedSeasonDisplayName: identity.name,
      } : undefined,
    };
  });

  const players: NBAPlayer[] = [];
  for (const sourcePlayer of data.players ?? []) {
    const sourceTid = rosterTidForSeason(sourcePlayer, season, currentSeason);
    const name = playerName(sourcePlayer);
    const latestCompletedSourceSeason = Math.max(
      0,
      ...(sourcePlayer.stats ?? [])
        .filter(row => row.playoffs !== true && Number(row.season) < season && Number(row.gp ?? 0) > 0)
        .map(row => Number(row.season)),
    );
    const sourceRetirement = inferSourceRetirement(sourcePlayer, {
      branchCutoffYear: season - 1,
      sourceCoverageThrough,
      confirmThroughSourceCoverage: true,
    });
    const sourceBirthYear = Number(sourcePlayer.born?.year ?? 0);
    const sourceRetirementAge = sourceRetirement && sourceBirthYear > 0
      ? sourceRetirement.retiredYear - sourceBirthYear
      : null;
    const credibleCareerRetirement = sourceRetirement != null
      && (sourceRetirementAge == null || sourceRetirementAge >= 33);
    const yearZeroRetiree = sourceTid == null
      && credibleCareerRetirement
      && sourceRetirement.retiredYear === season - 1;
    const historicalBackfillRetiree = source.sourceVersion?.startsWith('europe-historical-v1') === true
      && sourceTid == null
      && credibleCareerRetirement
      && latestCompletedSourceSeason > 0;
    const retiredForBranch = yearZeroRetiree || historicalBackfillRetiree;
    if (!name || (!retiredForBranch && (sourceTid == null || !sourceTeamTids.has(sourceTid)))) continue;

    const ratings = ratingsThroughSeason(
      sourcePlayer,
      retiredForBranch ? latestCompletedSourceSeason || sourceRetirement!.retiredYear : season,
      source,
    );
    const latestRating = ratings[ratings.length - 1];
    if (!latestRating) continue;

    const internalId = typeof sourcePlayer.pid === 'number'
      ? `${source.identityNamespace}-${sourcePlayer.pid}`
      : `${source.identityNamespace}-${name.replace(/\s+/g, '')}-${sourcePlayer.born?.year ?? 0}`;
    const activeSourceTeam = sourceTid == null ? undefined : allSourceTeamsByTid.get(sourceTid);
    const activeTeamIdentity = activeSourceTeam
      ? sourceTeamIdentityForSeason(activeSourceTeam, season)
      : undefined;
    const preDraftClub = Number(sourcePlayer.draft?.year ?? 0) >= season && activeSourceTeam
      ? {
          name: getTeamFullName({ ...activeSourceTeam, ...activeTeamIdentity } as any),
          tid: sourceTid! + source.teamTidOffset,
          logoUrl: activeSourceTeam.imgURLSmall ?? activeSourceTeam.imgURL,
          colors: activeSourceTeam.colors,
          competitionId: source.competitionId,
          season,
        }
      : undefined;
    players.push({
      internalId,
      personId: sourcePlayer.europeImport?.personId,
      sourceIds: buildSourcePlayerIds(sourcePlayer, source),
      tid: retiredForBranch ? -3 : sourceTid! + source.teamTidOffset,
      name,
      overallRating: latestRating.ovr,
      potential: latestRating.pot,
      ratings,
      stats: historicalStats(sourcePlayer, season, source, allSourceTeamsByTid),
      imgURL: resolveImgURL(sourcePlayer.imgURL),
      pos: sourcePlayer.pos ?? 'GF',
      hgt: sourcePlayer.hgt,
      weight: sourcePlayer.weight,
      born: sourcePlayer.born,
      nationality: sourcePlayer.nationality ?? sourcePlayer.europeImport?.nationality,
      draft: sourcePlayer.draft,
      college: sourcePlayer.college,
      contract: retiredForBranch ? undefined : currentSeason ? sourcePlayer.contract : undefined,
      injury: sourcePlayer.injury ?? { type: 'Healthy', gamesRemaining: 0 },
      status: retiredForBranch ? 'Retired' : source.leagueStatus as NBAPlayer['status'],
      preDraftClub,
      retiredYear: retiredForBranch ? latestCompletedSourceSeason || sourceRetirement?.retiredYear : undefined,
      sourceRetirement: retiredForBranch ? sourceRetirement ?? undefined : undefined,
      hof: false,
      jerseyNumber: extractJerseyNumber(sourcePlayer, season),
      historicalEuropeSource: sourcePlayer.europeImport ? {
        sourceVersion: source.sourceVersion ?? source.id,
        leagueId: source.leagueId,
        personId: sourcePlayer.europeImport.personId,
        sourceRefs: sourcePlayer.europeImport.sourceRefs,
        aliases: sourcePlayer.europeImport.aliases,
        nationalitySource: sourcePlayer.europeImport.nationalitySource,
        birthplace: sourcePlayer.europeImport.birthplace,
        sourceDob: sourcePlayer.europeImport.sourceDob,
        sourceHeightCm: sourcePlayer.europeImport.sourceHeightCm,
        birthYearDerivedForBBGM: sourcePlayer.europeImport.birthYearDerivedForBBGM,
        birthYearMethod: sourcePlayer.europeImport.birthYearMethod,
        ratingModel: sourcePlayer.europeImport.ratingModel,
        bioReview: sourcePlayer.europeImport.bioReview,
      } : undefined,
      awards: sourcePlayer.awards
        ?.filter(award => award.season < season)
        .map(award => ({
          ...award,
          competitionId: award.competitionId ?? source.competitionId,
          source: award.source ?? source.displayName,
          ...(source.countryCode ? { countryIso2: source.countryCode } : {}),
        })),
      transactions: historicalTransactions(sourcePlayer, season, source),
    });
  }

  return {
    players: sanitizeEuroJerseyHistory(players, data.players ?? [], source.competitionId).players,
    teams,
    competitionHistory: buildSourceCompetitionHistory(data.teams ?? [], source, season, competitionArchive),
  };
}

export function buildEuroleagueRosterFromSource(
  data: EuroleagueBbgmFile,
  requestedSeason?: number,
  competitionArchive: CompetitionSeason[] = [],
): EuroBasketballRoster {
  return buildEuroBasketballRosterFromSource(data, EUROLEAGUE_2026_SOURCE, requestedSeason, competitionArchive);
}

export async function loadEuroRosterCompetitionHistory(source: EuroBasketballSourceDescriptor): Promise<CompetitionSeason[]> {
  if (source.competitionId !== 'euroleague' && source.competitionId !== 'eurocup') return [];
  try {
    return await fetchCompetitionHistory(source.competitionId);
  } catch (error) {
    console.warn(`RosterService: ${source.displayName} history is unavailable; preserving the roster without inferred champions.`, error);
    return [];
  }
}

export async function fetchEuroBasketballRoster(
  source: EuroBasketballSourceDescriptor,
  requestedSeason?: number,
): Promise<EuroBasketballRoster> {
  const season = resolveEuroBasketballSourceSeason(source, requestedSeason);
  if (season === null) return { players: [], teams: [], competitionHistory: [] };
  const cacheKey = `${source.id}:${season}`;
  const cached = rosterPromiseCache.get(cacheKey);
  if (cached) return cached;

  const pending = (async () => {
    const portraitCatalogPromise = loadExternalPortraitCatalog(source.leagueStatus, season)
      .catch(() => new Map<string, string>());
    let roster: EuroBasketballRoster | null = null;
    const workerRequest = typeof Worker === 'undefined'
      ? null
      : (await import('./euroRosterWorker')).prepareEuroRosterInWorker(source, season);
    if (workerRequest) {
      try {
        roster = await workerRequest;
      } catch (error) {
        console.warn(`RosterService: Background preparation failed for ${source.displayName} ${season}; retrying on the main thread.`, error);
      }
    }
    if (!roster) {
      try {
        const response = await fetch(source.rosterUrl);
        const data = await readJsonResponse<EuroleagueBbgmFile>(response, `${source.displayName} ${season} roster`);
        const history = await loadEuroRosterCompetitionHistory(source);
        roster = buildEuroBasketballRosterFromSource(data, source, season, history);
      } catch (error) {
        rosterPromiseCache.delete(cacheKey);
        console.error(`RosterService: Failed to load local ${source.displayName} ${season} roster:`, error);
        return { players: [], teams: [], competitionHistory: [] };
      }
    }
    const portraitCatalog = await portraitCatalogPromise;
    return {
      ...roster,
      players: applyExternalPortraitCatalog(roster.players, source.leagueStatus, portraitCatalog, season),
    };
  })();
  rosterPromiseCache.set(cacheKey, pending);
  return pending;
}

export async function fetchEuroleagueRoster(requestedSeason?: number): Promise<EuroBasketballRoster> {
  const season = resolveEuroBasketballSourceSeason(EUROLEAGUE_2026_SOURCE, requestedSeason);
  if (season === null) return { players: [], teams: [], competitionHistory: [] };
  console.log(`RosterService: Loading local EuroLeague ${season} roster...`);
  const roster = await fetchEuroBasketballRoster(EUROLEAGUE_2026_SOURCE, season);
  console.log(`RosterService: Loaded ${roster.players.length} EuroLeague players and ${roster.teams.length} clubs for ${season}.`);
  return roster;
}
