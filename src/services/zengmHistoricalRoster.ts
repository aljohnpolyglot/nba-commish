import { getHistoricalNbaRuleOverrides, getHistoricalNbaSalaryCap } from '../data/historicalNbaSeasons';
import { PRE_DRAFT_DRIVING_DUNK } from '../data/dunkData';
import { DRAFT_CLASS_HORIZON_YEARS } from '../constants';
import { STATIC_NBA_TEAMS, staticNbaTeamLogo } from '../data/staticNbaTeams';
import type { NBAGMStat, NBAPlayer, NBATeam } from '../types';
import { seasonLabelFromEndYear, seasonLabelToEndYear } from '../utils/historicalTimeline';
import { getBbgmTeamLogoUrl } from '../utils/teamAssets';
import { resolvePersistentPlayerImage } from '../utils/playerImage';
import { calculateOverallFromRating, calculateTeamStrength, estimatePotentialBbgm } from '../utils/playerRatings';
import { computeRookieSalaryUSD } from '../utils/rookieContractUtils';
import { mergeNormalizedPlayerAwards, normalizePlayerAwardRows } from '../utils/playerAwardNormalizer';
import { normalizeContractOptionKind, type ContractOptionKind } from '../utils/contractTypes';
import { normalizeHistoricalNbaTeamAbbrev } from '../utils/historicalNbaTeamAbbrev';
import { createCanonicalPlayerIdentityIndex } from '../utils/playerIdentity';
import { getTrainingCampRosterLimit } from '../utils/rosterLimits';
import type { RosterResult } from './rosterService';
import { normalizeBBGMStat } from './rosterServiceHelpers';
import { dataUrlCandidates } from './utils/dataProxy';
import { readJsonResponse } from './utils/jsonResponse';
import { fetchBRefSeasonData, getAllCachedSeasons, matchTeamByWikiName } from '../data/brefFetcher';
import {
  ensureFullRosterPlayerDataLoaded,
  getAllFullRosterPlayers,
  getFullRosterPlayerName,
  getFullRosterPlayerForIdentity,
  getFullRosterTeamByAbbrev,
} from '../data/realPlayerDataFetcher';
import {
  BUNDLED_REAL_PLAYER_DATA_URL,
  BUNDLED_REAL_PLAYER_STATS_URL,
  PINNED_REAL_PLAYER_DATA_FALLBACK_URL,
  PINNED_REAL_PLAYER_STATS_FALLBACK_URL,
} from '../data/historicalNbaRosterSources';
import { inferSourceRetirement } from './retirement/sourceRetirement';
import { getHistoricalDraftProspectSource } from './draft/historicalProspectEligibility';
import { discountHistoricalProspectRating } from './draft/historicalProspectRating';
import { getHistoricalProspectSourceClub } from '../data/historicalProspectClubSources';
import {
  ensureHistoricalNbaDeathDataLoaded,
  historicalDeathBeforeBranch,
  mergeHistoricalNbaDeathSources,
} from '../data/historicalNbaDeathData';
import {
  ensureRemovedHistoricalPlayersLoaded,
  mergeRemovedHistoricalDraftProspects,
  mergeRemovedSeasonalRatings,
} from './draft/removedHistoricalPlayers';

const ALEXNOOB_TEAM_DATA_URLS = [
  'https://cdn.jsdelivr.net/gh/alexnoob/BasketBall-GM-Rosters@master/team%20data.json',
];
const REAL_PLAYER_DATA_URLS = [
  BUNDLED_REAL_PLAYER_DATA_URL,
  'https://raw.githubusercontent.com/zengm-games/zengm/master/data/real-player-data.basketball.json',
  ...dataUrlCandidates([
    PINNED_REAL_PLAYER_DATA_FALLBACK_URL,
  ]),
];
const REAL_PLAYER_STATS_URLS = [
  BUNDLED_REAL_PLAYER_STATS_URL,
  'https://raw.githubusercontent.com/zengm-games/zengm/master/data/real-player-stats.basketball.json',
  ...dataUrlCandidates([
    PINNED_REAL_PLAYER_STATS_FALLBACK_URL,
  ]),
];
const FETCH_TIMEOUT_MS = 60_000;
const OPTIONAL_FETCH_TIMEOUT_MS = 8_000;
const FETCH_RETRY_DELAYS_MS = [0, 1_500] as const;
type ZenBio = {
  name?: string;
  pos?: string;
  height?: number;
  weight?: number;
  bornYear?: number;
  diedYear?: number;
  diedDate?: string;
  country?: string;
  college?: string;
  draftYear?: number;
  draftRound?: number;
  draftPick?: number;
  draftAbbrev?: string;
  awards?: unknown;
};

type ZenRating = {
  slug: string;
  season: number;
  hgt?: number;
  stre?: number;
  spd?: number;
  jmp?: number;
  endu?: number;
  ins?: number;
  dnk?: number;
  ft?: number;
  fg?: number;
  tp?: number;
  diq?: number;
  oiq?: number;
  drb?: number;
  pss?: number;
  reb?: number;
  pot?: number;
  fuzz?: number;
};

type ZenStat = {
  slug: string;
  season: number;
  abbrev?: string;
  playoffs?: boolean;
  gp?: number;
  gs?: number;
  min?: number;
  fg?: number;
  fga?: number;
  tp?: number;
  tpa?: number;
  ft?: number;
  fta?: number;
  orb?: number;
  drb?: number;
  trb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  tov?: number;
  pf?: number;
  pts?: number;
  per?: number;
  ws?: number;
  vorp?: number;
  jerseyNumber?: string | number;
};

type ZenSalary = {
  slug: string;
  start?: number;
  exp?: number;
  amounts?: number[];
  type?: unknown;
  types?: unknown;
  option?: unknown;
  options?: unknown;
  contractType?: unknown;
  contractTypes?: unknown;
  guarantee?: unknown;
  guarantees?: unknown;
};

type ZenTeamSeason = {
  won?: number;
  lost?: number;
  playoffRoundsWon?: number;
  abbrev?: string;
};

type ZenRealPlayerData = {
  bios?: Record<string, ZenBio>;
  awards?: Record<string, unknown>;
  ratings?: ZenRating[];
  salaries?: ZenSalary[];
  retiredJerseyNumbers?: Record<string, Array<{
    number?: string | number;
    season?: number;
    seasonRetired?: number;
    slug?: string;
    playerId?: string;
  }>>;
  teams?: ZenStat[];
  teamSeasons?: Record<string, Record<string, ZenTeamSeason>>;
};

type ZenRealPlayerStats = {
  stats?: ZenStat[];
};

type AlexTeamData = {
  imgURL?: string;
  imgURLSmall?: string;
  name?: string;
  region?: string;
  colors?: string[];
  seasons?: Record<string, Partial<AlexTeamData>>;
};

type SourceTeamSeason = {
  season?: number;
  won?: number;
  wins?: number;
  lost?: number;
  losses?: number;
  playoffRoundsWon?: number;
  abbrev?: string;
  region?: string;
  name?: string;
  colors?: string[];
  imgURL?: string;
  imgURLSmall?: string;
  logoUrl?: string;
};

type LoadedZenGmData = {
  data: ZenRealPlayerData;
  stats: ZenRealPlayerStats;
  teamData: Record<string, AlexTeamData>;
};

type HistoricalTeamMeta = {
  region: string;
  name: string;
  conference: 'East' | 'West';
  cid?: 0 | 1;
  did?: number;
  abbrev?: string;
  teamDataAbbrev?: string;
  staticAbbrev?: string;
  useStaticLogo?: boolean;
};

let zenGmDataPromise: Promise<LoadedZenGmData> | null = null;
let zenGmLoadedData: LoadedZenGmData | null = null;

const HISTORICAL_TEAM_META: Record<string, HistoricalTeamMeta> = {
  BRK: { region: 'Brooklyn', name: 'Nets', conference: 'East', staticAbbrev: 'BKN' },
  NJN: { region: 'New Jersey', name: 'Nets', conference: 'East', useStaticLogo: false },
  SEA: { region: 'Seattle', name: 'SuperSonics', conference: 'West', useStaticLogo: false },
  NOH: { region: 'New Orleans', name: 'Hornets', conference: 'West', useStaticLogo: false },
  NOK: { region: 'New Orleans/Oklahoma City', name: 'Hornets', conference: 'West', useStaticLogo: false },
  NOL: { region: 'New Orleans', name: 'Hornets', conference: 'West', useStaticLogo: false },
  CHH: { region: 'Charlotte', name: 'Hornets', conference: 'East', useStaticLogo: false },
  VAN: { region: 'Vancouver', name: 'Grizzlies', conference: 'West', useStaticLogo: false },
  WSB: { region: 'Washington', name: 'Bullets', conference: 'East', useStaticLogo: false },
  KCK: { region: 'Kansas City', name: 'Kings', conference: 'West', useStaticLogo: false },
  CIN: { region: 'Cincinnati', name: 'Royals', conference: 'West', useStaticLogo: false },
  ROC: { region: 'Rochester', name: 'Royals', conference: 'West', useStaticLogo: false },
  SDC: { region: 'San Diego', name: 'Clippers', conference: 'West', useStaticLogo: false },
  BUF: { region: 'Buffalo', name: 'Braves', conference: 'East', useStaticLogo: false },
  SYR: { region: 'Syracuse', name: 'Nationals', conference: 'East', useStaticLogo: false },
  PHW: { region: 'Philadelphia', name: 'Warriors', conference: 'East', useStaticLogo: false },
  SFW: { region: 'San Francisco', name: 'Warriors', conference: 'West', useStaticLogo: false },
  MPL: { region: 'Minneapolis', name: 'Lakers', conference: 'West', useStaticLogo: false },
  MNL: { region: 'Minneapolis', name: 'Lakers', conference: 'West', useStaticLogo: false },
  STL: { region: 'St. Louis', name: 'Hawks', conference: 'West', useStaticLogo: false },
  TRI: { region: 'Tri-Cities', name: 'Blackhawks', conference: 'West', useStaticLogo: false },
  MLH: { region: 'Milwaukee', name: 'Hawks', conference: 'West', useStaticLogo: false },
  KCO: { region: 'Kansas City-Omaha', name: 'Kings', conference: 'West', useStaticLogo: false },
  KC: { region: 'Kansas City', name: 'Kings', conference: 'West', useStaticLogo: false },
  NOJ: { region: 'New Orleans', name: 'Jazz', conference: 'West', useStaticLogo: false },
  SDR: { region: 'San Diego', name: 'Rockets', conference: 'West', useStaticLogo: false },
  BAL: { region: 'Baltimore', name: 'Bullets', conference: 'East', useStaticLogo: false },
  BLB: { region: 'Baltimore', name: 'Bullets', conference: 'East', useStaticLogo: false },
  CHS: { region: 'Chicago', name: 'Stags', conference: 'West', useStaticLogo: false },
  CLR: { region: 'Cleveland', name: 'Rebels', conference: 'West', useStaticLogo: false },
  DTF: { region: 'Detroit', name: 'Falcons', conference: 'West', useStaticLogo: false },
  FTW: { region: 'Fort Wayne', name: 'Pistons', conference: 'West', useStaticLogo: false },
  INJ: { region: 'Indianapolis', name: 'Jets', conference: 'West', useStaticLogo: false },
  INO: { region: 'Indianapolis', name: 'Olympians', conference: 'West', useStaticLogo: false },
  AND: { region: 'Anderson', name: 'Packers', conference: 'West', useStaticLogo: false },
  DNN: { region: 'Denver', name: 'Nuggets', conference: 'West', useStaticLogo: false },
  PIT: { region: 'Pittsburgh', name: 'Ironmen', conference: 'West', useStaticLogo: false },
  PRO: { region: 'Providence', name: 'Steamrollers', conference: 'East', useStaticLogo: false },
  SHE: { region: 'Sheboygan', name: 'Red Skins', conference: 'West', useStaticLogo: false },
  STB: { region: 'St. Louis', name: 'Bombers', conference: 'West', useStaticLogo: false },
  TRH: { region: 'Toronto', name: 'Huskies', conference: 'East', useStaticLogo: false },
  WAT: { region: 'Waterloo', name: 'Hawks', conference: 'West', useStaticLogo: false },
  WSC: { region: 'Washington', name: 'Capitols', conference: 'East', useStaticLogo: false },
  GS: { region: 'Golden State', name: 'Warriors', conference: 'West', staticAbbrev: 'GSW' },
  SA: { region: 'San Antonio', name: 'Spurs', conference: 'West', staticAbbrev: 'SAS' },
  NYC: { region: 'New York', name: 'Knicks', conference: 'East', staticAbbrev: 'NYK' },
  PHO: { region: 'Phoenix', name: 'Suns', conference: 'West', staticAbbrev: 'PHX' },
};

function withConferenceIds(meta: HistoricalTeamMeta): HistoricalTeamMeta {
  const cid = meta.cid ?? (meta.conference === 'East' ? 0 : 1);
  return {
    ...meta,
    cid,
    did: meta.did ?? cid,
  };
}


const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJsonUrl<T>(url: string): Promise<T> {
  let lastError: unknown = null;
  for (const delay of FETCH_RETRY_DELAYS_MS) {
    if (delay > 0) await sleep(delay);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      return await readJsonResponse<T>(res, `Historical NBA source ${url}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw lastError;
}

async function fetchJsonFromFirstAvailable<T>(urls: string[], label: string): Promise<T> {
  let lastError: unknown = null;
  for (const url of urls) {
    try {
      return await fetchJsonUrl<T>(url);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Failed to load ${label}: ${String(lastError)}`);
}

async function fetchOptionalJson<T>(urls: string[]): Promise<T | null> {
  const request = fetchJsonFromFirstAvailable<T>(urls, 'optional JSON').catch(() => null);
  return Promise.race([
    request,
    sleep(OPTIONAL_FETCH_TIMEOUT_MS).then(() => null),
  ]);
}

async function loadZenGmData(): Promise<LoadedZenGmData> {
  if (!zenGmDataPromise) {
    zenGmDataPromise = Promise.all([
      fetchJsonFromFirstAvailable<ZenRealPlayerData>([
        ...REAL_PLAYER_DATA_URLS,
      ], 'native real player data'),
      fetchJsonFromFirstAvailable<ZenRealPlayerStats>([
        ...REAL_PLAYER_STATS_URLS,
      ], 'native real player stats'),
      fetchOptionalJson<Record<string, AlexTeamData>>(ALEXNOOB_TEAM_DATA_URLS),
      ensureRemovedHistoricalPlayersLoaded(),
      ensureHistoricalNbaDeathDataLoaded(),
    ]).then(([data, stats, teamData]) => {
      const deathEnrichedBios = mergeHistoricalNbaDeathSources(data.bios ?? {});
      const hydratedBios = Object.fromEntries(
        Object.entries(deathEnrichedBios).map(([slug, bio]) => [
          slug,
          { ...bio, awards: bio.awards ?? data.awards?.[slug] },
        ]),
      );
      const mergedRatings = mergeRemovedSeasonalRatings(
        hydratedBios,
        data.ratings as Parameters<typeof mergeRemovedSeasonalRatings>[1],
      ) as ZenRating[];
      const loaded = {
        data: { ...data, bios: hydratedBios, ratings: mergedRatings },
        stats,
        teamData: teamData ?? {},
      };
      zenGmLoadedData = loaded;
      return loaded;
    }).catch(error => {
      zenGmDataPromise = null;
      throw error;
    });
  }

  return zenGmDataPromise;
}

export function normalizeNativeNbaTeamAbbrev(abbrev?: string | number | null): string | null {
  const normalized = String(abbrev ?? '').trim().toUpperCase().replace(/^_+/, '');
  if (!normalized || normalized === 'TOT' || /^-?\d+$/.test(normalized)) return null;
  return normalized;
}

const normalizeAbbrev = normalizeNativeNbaTeamAbbrev;

function getStaticTeam(abbrev: string) {
  const staticAbbrev = normalizeHistoricalNbaTeamAbbrev(abbrev) ?? abbrev;
  return STATIC_NBA_TEAMS.find((team) => team.abbrev === staticAbbrev) ?? null;
}

function resolveTeamMeta(abbrev: string, startYear: number): HistoricalTeamMeta {
  if (abbrev === 'CHI' && startYear < 1950) {
    return { ...HISTORICAL_TEAM_META.CHS, abbrev: 'CHS', teamDataAbbrev: 'CHS' };
  }
  if (abbrev === 'CLE' && startYear < 1947) {
    return { ...HISTORICAL_TEAM_META.CLR, abbrev: 'CLR', teamDataAbbrev: 'CLR' };
  }
  if (abbrev === 'DET' && startYear < 1947) {
    return { ...HISTORICAL_TEAM_META.DTF, abbrev: 'DTF', teamDataAbbrev: 'DTF' };
  }
  if (abbrev === 'STL' && startYear < 1950) {
    return { ...HISTORICAL_TEAM_META.STB, abbrev: 'STB', teamDataAbbrev: 'STB' };
  }
  if (abbrev === 'TOR' && startYear < 1947) {
    return { ...HISTORICAL_TEAM_META.TRH, abbrev: 'TRH', teamDataAbbrev: 'TRH' };
  }
  if ((abbrev === 'GSW' || abbrev === 'GS') && startYear < 1962) {
    return { ...HISTORICAL_TEAM_META.PHW, abbrev: 'PHW', teamDataAbbrev: 'PHW' };
  }
  if ((abbrev === 'GSW' || abbrev === 'GS') && startYear < 1971) {
    return { ...HISTORICAL_TEAM_META.SFW, abbrev: 'SFW', teamDataAbbrev: 'SFW' };
  }
  if (abbrev === 'LAL' && startYear < 1960) {
    return { ...HISTORICAL_TEAM_META.MNL, abbrev: 'MNL', teamDataAbbrev: 'MNL' };
  }
  if (abbrev === 'DET' && startYear < 1957) {
    return { ...HISTORICAL_TEAM_META.FTW, abbrev: 'FTW', teamDataAbbrev: 'FTW' };
  }
  if (abbrev === 'ATL' && startYear < 1951) {
    return { ...HISTORICAL_TEAM_META.TRI, abbrev: 'TRI', teamDataAbbrev: 'TRI' };
  }
  if (abbrev === 'ATL' && startYear < 1955) {
    return { ...HISTORICAL_TEAM_META.MLH, abbrev: 'MLH', teamDataAbbrev: 'MLH' };
  }
  if (abbrev === 'ATL' && startYear < 1968) {
    return { ...HISTORICAL_TEAM_META.STL, abbrev: 'STL', teamDataAbbrev: 'STL' };
  }
  if (abbrev === 'SAC' && startYear < 1957) {
    return { ...HISTORICAL_TEAM_META.ROC, abbrev: 'ROC', teamDataAbbrev: 'ROC' };
  }
  if (abbrev === 'SAC' && startYear < 1972) {
    return { ...HISTORICAL_TEAM_META.CIN, abbrev: 'CIN', teamDataAbbrev: 'CIN' };
  }
  if (abbrev === 'SAC' && startYear < 1975) {
    return { ...HISTORICAL_TEAM_META.KCO, abbrev: 'KCO', teamDataAbbrev: 'KCO' };
  }
  if (abbrev === 'SAC' && startYear < 1985) {
    return { ...HISTORICAL_TEAM_META.KCK, abbrev: 'KCK', teamDataAbbrev: 'KCK' };
  }
  if (abbrev === 'LAC' && startYear < 1978) {
    return { ...HISTORICAL_TEAM_META.BUF, abbrev: 'BUF', teamDataAbbrev: 'BUF' };
  }
  if (abbrev === 'LAC' && startYear < 1984) {
    return { ...HISTORICAL_TEAM_META.SDC, abbrev: 'SDC', teamDataAbbrev: 'SDC' };
  }
  if (abbrev === 'HOU' && startYear < 1971) {
    return { ...HISTORICAL_TEAM_META.SDR, abbrev: 'SDR', teamDataAbbrev: 'SDR' };
  }
  if (abbrev === 'UTA' && startYear < 1979) {
    return { ...HISTORICAL_TEAM_META.NOJ, abbrev: 'NOJ', teamDataAbbrev: 'NOJ' };
  }
  if (abbrev === 'MEM' && startYear < 2001) {
    return { ...HISTORICAL_TEAM_META.VAN, abbrev: 'VAN', teamDataAbbrev: 'VAN' };
  }
  if (abbrev === 'OKC' && startYear < 2008) {
    return { ...HISTORICAL_TEAM_META.SEA, abbrev: 'SEA', teamDataAbbrev: 'SEA' };
  }
  if (abbrev === 'PHI' && startYear < 1963) {
    return { ...HISTORICAL_TEAM_META.SYR, abbrev: 'SYR', teamDataAbbrev: 'SYR' };
  }
  if (abbrev === 'WAS' && startYear < 1963) {
    return { ...HISTORICAL_TEAM_META.BAL, abbrev: 'BAL', teamDataAbbrev: 'BAL' };
  }
  if (abbrev === 'WAS' && startYear < 1974) {
    return { ...HISTORICAL_TEAM_META.BAL, abbrev: 'BAL', teamDataAbbrev: 'BAL' };
  }
  if (abbrev === 'NOH' && startYear >= 2005 && startYear < 2007) {
    return { ...HISTORICAL_TEAM_META.NOK, abbrev: 'NOK', teamDataAbbrev: 'NOK' };
  }
  if ((abbrev === 'NOL' || abbrev === 'NOH') && startYear < 2002) {
    return { ...HISTORICAL_TEAM_META.CHH, abbrev: 'CHH', teamDataAbbrev: 'CHH' };
  }
  if ((abbrev === 'NOP' || abbrev === 'NOH' || abbrev === 'NOK' || abbrev === 'NOL') && startYear >= 2013) {
    return { region: 'New Orleans', name: 'Pelicans', conference: 'West', abbrev: 'NOP', teamDataAbbrev: 'NOP', staticAbbrev: 'NOP' };
  }
  if ((abbrev === 'NOP' || abbrev === 'NOH' || abbrev === 'NOL') && startYear < 2013) {
    return { ...HISTORICAL_TEAM_META.NOH, abbrev: 'NOH', teamDataAbbrev: 'NOH' };
  }
  if (abbrev === 'CHA' && startYear >= 1988 && startYear < 2002) {
    return { ...HISTORICAL_TEAM_META.CHH, abbrev: 'CHH', teamDataAbbrev: 'CHH' };
  }
  if (abbrev === 'BKN' && startYear < 2012) {
    return { region: 'New Jersey', name: 'Nets', conference: 'East', abbrev: 'NJN', teamDataAbbrev: 'NJN', useStaticLogo: false };
  }
  if ((abbrev === 'CHA' || abbrev === 'CHO') && startYear >= 2004 && startYear < 2014) {
    return { region: 'Charlotte', name: 'Bobcats', conference: 'East', useStaticLogo: false };
  }
  if (abbrev === 'CHO') {
    return { region: 'Charlotte', name: 'Hornets', conference: 'East', staticAbbrev: 'CHA' };
  }

  const historical = HISTORICAL_TEAM_META[abbrev];
  if (historical) return historical;

  const staticTeam = getStaticTeam(abbrev);
  if (staticTeam) {
    return withConferenceIds({
      region: staticTeam.region,
      name: staticTeam.name,
      conference: staticTeam.conference,
      cid: staticTeam.cid,
      did: staticTeam.did,
      staticAbbrev: staticTeam.abbrev,
    });
  }

  return withConferenceIds({
    region: abbrev,
    name: '',
    conference: 'East',
    useStaticLogo: false,
  });
}

function buildTeamSeasons(
  teamSeasons: Record<string, Record<string, ZenTeamSeason>> | undefined,
  abbrev: string,
  seasonEndYear: number,
  aliases: Array<string | undefined> = [],
): NBATeam['seasons'] {
  if (!teamSeasons) return [];
  const keys = Array.from(new Set([abbrev, ...aliases].filter((key): key is string => Boolean(key))));

  return Object.entries(teamSeasons)
    .map(([seasonKey, seasons]) => {
      const season = Number(seasonKey);
      if (!Number.isFinite(season) || season >= seasonEndYear) return null;
      const seasonData = keys
        .map(key => seasons[key] ?? seasons[`_${key}`])
        .find((entry): entry is ZenTeamSeason => Boolean(entry));
      if (!seasonData) return null;
      return {
        season,
        won: seasonData.won ?? 0,
        lost: seasonData.lost ?? 0,
        playoffRoundsWon: seasonData.playoffRoundsWon ?? -1,
      };
    })
    .filter((season): season is NonNullable<typeof season> => Boolean(season));
}

function getFullRosterTeamForKeys(keys: Array<string | undefined>): ReturnType<typeof getFullRosterTeamByAbbrev> {
  for (const key of keys) {
    const team = getFullRosterTeamByAbbrev(key);
    if (team) return team;
  }
  return null;
}

function buildSourceTeamSeasons(
  sourceTeam: ReturnType<typeof getFullRosterTeamByAbbrev>,
  seasonEndYear: number,
): NBATeam['seasons'] {
  const rows = Array.isArray(sourceTeam?.seasons) ? sourceTeam.seasons as SourceTeamSeason[] : [];
  return rows
    .map(row => {
      const season = Number(row?.season ?? 0);
      if (!Number.isFinite(season) || season <= 0 || season >= seasonEndYear) return null;
      const won = Number(row.won ?? row.wins ?? 0);
      const lost = Number(row.lost ?? row.losses ?? 0);
      const playoffRoundsWon = Number(row.playoffRoundsWon);
      return {
        season,
        won: Number.isFinite(won) ? won : 0,
        lost: Number.isFinite(lost) ? lost : 0,
        playoffRoundsWon: Number.isFinite(playoffRoundsWon) ? playoffRoundsWon : -1,
        abbrev: row.abbrev ?? sourceTeam?.abbrev,
        region: row.region ?? sourceTeam?.region,
        name: row.name ?? sourceTeam?.name,
        colors: row.colors ?? sourceTeam?.colors,
        imgURL: row.imgURL ?? row.logoUrl ?? sourceTeam?.imgURL,
        imgURLSmall: row.imgURLSmall ?? sourceTeam?.imgURLSmall,
      };
    })
    .filter((season): season is NonNullable<typeof season> => Boolean(season))
    .sort((left, right) => left.season - right.season);
}

function mergeTeamSeasonRows(sourceRows: NBATeam['seasons'] = [], nativeRows: NBATeam['seasons'] = []): NBATeam['seasons'] {
  const bySeason = new Map<number, NonNullable<NBATeam['seasons']>[number]>();
  for (const row of nativeRows ?? []) bySeason.set(Number(row.season), row);
  for (const source of sourceRows ?? []) {
    const season = Number(source.season);
    const native = bySeason.get(season);
    bySeason.set(season, {
      ...native,
      ...source,
      playoffRoundsWon: Number.isFinite(Number(source.playoffRoundsWon))
        ? source.playoffRoundsWon
        : native?.playoffRoundsWon ?? -1,
    });
  }
  return Array.from(bySeason.values()).sort((left, right) => left.season - right.season);
}

function buildSourceRetiredJerseys(
  sourceTeam: ReturnType<typeof getFullRosterTeamByAbbrev>,
  seasonEndYear: number,
  teamId: number,
  nativeRows: NonNullable<ZenRealPlayerData['retiredJerseyNumbers']>[string] = [],
  bios: Record<string, ZenBio> = {},
) {
  const rows = Array.isArray(sourceTeam?.retiredJerseyNumbers) ? sourceTeam.retiredJerseyNumbers : [];
  const nativeByNumber = new Map<string, typeof nativeRows>();
  for (const row of nativeRows) {
    const number = String(row?.number ?? '').trim();
    if (!number) continue;
    nativeByNumber.set(number, [...(nativeByNumber.get(number) ?? []), row]);
  }
  const byKey = new Map<string, any>();
  for (const row of rows) {
    const number = row?.number == null ? '' : String(row.number).trim();
    if (!number) continue;
    const nativeMatch = nativeByNumber.get(number)?.length === 1 ? nativeByNumber.get(number)?.[0] : undefined;
    const nativePlayerId = String(nativeMatch?.slug ?? nativeMatch?.playerId ?? '').trim();
    const text = String(row.text ?? row.name ?? row.playerName ?? bios[nativePlayerId]?.name ?? '').trim();
    const seasonRetired = Number(row.seasonRetired ?? row.yearRetired ?? row.retiredYear ?? row.season ?? 0);
    if (Number.isFinite(seasonRetired) && seasonRetired > seasonEndYear) continue;
    const key = `${number}|${String(row.playerId ?? nativePlayerId).toLowerCase()}|${text.toLowerCase()}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      number,
      text,
      pid: row.pid,
      playerId: row.playerId ?? (nativePlayerId || undefined),
      seasonRetired: Number.isFinite(seasonRetired) && seasonRetired > 0 ? seasonRetired : seasonEndYear,
      teamId,
      reason: row.reason ?? 'hof_legend',
      tier: row.tier ?? 'late_honor',
    });
  }
  for (const row of nativeRows) {
    const number = String(row?.number ?? '').trim();
    const playerId = String(row?.slug ?? row?.playerId ?? '').trim();
    const seasonRetired = Number(row?.seasonRetired ?? row?.season ?? 0);
    if (!number || !playerId || (Number.isFinite(seasonRetired) && seasonRetired > seasonEndYear)) continue;
    const alreadyPresent = [...byKey.values()].some(record =>
      String(record.number) === number && String(record.playerId ?? '') === playerId,
    );
    if (alreadyPresent) continue;
    byKey.set(`${number}|${playerId.toLowerCase()}`, {
      number,
      text: String(bios[playerId]?.name ?? '').trim(),
      playerId,
      seasonRetired: Number.isFinite(seasonRetired) && seasonRetired > 0 ? seasonRetired : seasonEndYear,
      teamId,
      reason: 'hof_legend',
      tier: 'late_honor',
    });
  }
  return Array.from(byKey.values());
}

function buildTeamIdentitySeasons(
  teamData: Record<string, AlexTeamData>,
  abbrev: string,
  aliases: Array<string | undefined> = [],
): NBATeam['identitySeasons'] {
  const keys = Array.from(new Set([abbrev, ...aliases].filter((key): key is string => Boolean(key))));
  const rowsBySeason = new Map<number, NonNullable<NBATeam['identitySeasons']>[number]>();
  for (const key of keys) {
    const base = teamData[key];
    if (!base?.seasons) continue;
    for (const [seasonKey, value] of Object.entries(base.seasons)) {
      const season = Number(seasonKey);
      if (!Number.isFinite(season) || rowsBySeason.has(season)) continue;
      rowsBySeason.set(season, {
        season,
        abbrev: (value as any).abbrev ?? key,
        region: value.region ?? base.region,
        name: value.name ?? base.name,
        colors: value.colors ?? base.colors,
        imgURL: value.imgURL ?? base.imgURL,
        imgURLSmall: value.imgURLSmall ?? base.imgURLSmall,
      });
    }
  }
  return Array.from(rowsBySeason.values()).sort((a, b) => a.season - b.season);
}

function getTeamDataMeta(
  teamData: Record<string, AlexTeamData>,
  abbrev: string,
  seasonEndYear: number,
  includeAliases = true,
): AlexTeamData | null {
  const candidates = Array.from(new Set([
    abbrev,
    includeAliases ? normalizeHistoricalNbaTeamAbbrev(abbrev) : undefined,
  ].filter(Boolean))) as string[];
  for (const candidate of candidates) {
    const base = teamData[candidate];
    if (!base) continue;
    const seasonOverride = Object.entries(base.seasons ?? {})
      .map(([season, value]) => ({ season: Number(season), value }))
      .filter(entry => Number.isFinite(entry.season) && entry.season <= seasonEndYear)
      .sort((a, b) => b.season - a.season)[0]?.value;
    return {
      ...base,
      ...(seasonOverride ?? {}),
      name: seasonOverride?.name ?? base.name,
      region: seasonOverride?.region ?? base.region,
      colors: seasonOverride?.colors ?? base.colors,
      imgURL: seasonOverride?.imgURL ?? base.imgURL,
      imgURLSmall: seasonOverride?.imgURLSmall ?? base.imgURLSmall,
    };
  }
  return null;
}

function normalizeTeamBrandKey(value?: string): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function buildTeams(
  activeAbbrevs: string[],
  teamSeasons: Record<string, Record<string, ZenTeamSeason>> | undefined,
  teamData: Record<string, AlexTeamData>,
  startYear: number,
  seasonEndYear: number,
  retiredJerseyNumbers: ZenRealPlayerData['retiredJerseyNumbers'] = {},
  bios: Record<string, ZenBio> = {},
): { teams: NBATeam[]; tidByAbbrev: Map<string, number>; teamNameMap: Map<string, NBATeam> } {
  const sortedAbbrevs = [...activeAbbrevs].sort((a, b) => a.localeCompare(b));
  const tidByAbbrev = new Map<string, number>();
  const teamNameMap = new Map<string, NBATeam>();

  const teams = sortedAbbrevs.map((abbrev, index) => {
    const resolvedMeta = withConferenceIds(resolveTeamMeta(abbrev, startYear));
    const teamDataMeta = getTeamDataMeta(
      teamData,
      resolvedMeta.teamDataAbbrev ?? abbrev,
      seasonEndYear,
      resolvedMeta.useStaticLogo !== false,
    );
    const teamDataMatchesIdentity =
      normalizeTeamBrandKey(teamDataMeta?.region) === normalizeTeamBrandKey(resolvedMeta.region) &&
      normalizeTeamBrandKey(teamDataMeta?.name) === normalizeTeamBrandKey(resolvedMeta.name);
    const brandData = teamDataMeta && (
      teamDataMatchesIdentity ||
      !resolvedMeta.name
    ) ? teamDataMeta : null;
    const meta = resolvedMeta;
    const teamIdentityKeys = [abbrev, meta.abbrev, meta.teamDataAbbrev, meta.staticAbbrev]
      .filter((key): key is string => Boolean(key));
    const fullRosterTeam = getFullRosterTeamForKeys(teamIdentityKeys);
    const nativeRetiredJerseyRows = teamIdentityKeys.flatMap(key => retiredJerseyNumbers?.[key] ?? []);
    const nativeSeasons = buildTeamSeasons(teamSeasons, abbrev, seasonEndYear, [meta.abbrev, meta.teamDataAbbrev, meta.staticAbbrev]);
    const sourceSeasons = buildSourceTeamSeasons(fullRosterTeam, seasonEndYear);
    const staticTeam = getStaticTeam(meta.staticAbbrev ?? abbrev);
    const bbgmLogoUrl = meta.useStaticLogo === false ? getBbgmTeamLogoUrl(meta.abbrev ?? abbrev) : undefined;
    const staticLogoUrl = meta.useStaticLogo === false ? undefined : staticTeam ? staticNbaTeamLogo(staticTeam) : undefined;
    const logoUrl = brandData?.imgURLSmall ?? brandData?.imgURL ?? bbgmLogoUrl ?? staticLogoUrl;
    const name = meta.name ? `${meta.region} ${meta.name}` : meta.region;

    tidByAbbrev.set(abbrev, index);
    for (const key of [meta.abbrev, meta.teamDataAbbrev, meta.staticAbbrev]) {
      if (key && !tidByAbbrev.has(key)) tidByAbbrev.set(key, index);
    }

    const team = {
      id: index,
      abbrev: meta.abbrev ?? abbrev,
      name: meta.name,
      region: meta.region,
      conference: meta.conference,
      cid: meta.cid ?? (meta.conference === 'East' ? 0 : 1),
      did: meta.did ?? (meta.conference === 'East' ? 0 : 1),
      wins: 0,
      losses: 0,
      logoUrl,
      colors: brandData?.colors ?? ['#1f2937', '#f8fafc', '#94a3b8'],
      retiredJerseyNumbers: buildSourceRetiredJerseys(fullRosterTeam, seasonEndYear, index, nativeRetiredJerseyRows, bios),
      seasons: mergeTeamSeasonRows(sourceSeasons, nativeSeasons),
      identitySeasons: buildTeamIdentitySeasons(teamData, abbrev, [meta.abbrev, meta.teamDataAbbrev, meta.staticAbbrev]),
      strength: 0,
    } satisfies NBATeam;

    teamNameMap.set(name.toLowerCase(), team);
    return team;
  });

  return { teams, tidByAbbrev, teamNameMap };
}

function pickCurrentStat(rows: ZenStat[]): ZenStat | null {
  return rows.find((row) => normalizeAbbrev(row.abbrev)) ?? null;
}

function groupBySlug<T extends { slug: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.slug) continue;
    const existing = grouped.get(row.slug) ?? [];
    existing.push(row);
    grouped.set(row.slug, existing);
  }
  return grouped;
}

function groupSalaryRowsByBioName(
  salariesBySlug: Map<string, ZenSalary[]>,
  bios: Record<string, ZenBio> | undefined,
): Map<string, ZenSalary[]> {
  const grouped = new Map<string, ZenSalary[]>();
  if (!bios) return grouped;
  for (const [slug, salaryRows] of salariesBySlug.entries()) {
    const nameKey = normalizePlayerName(bios[slug]?.name ?? slug);
    if (!nameKey || grouped.has(nameKey)) continue;
    grouped.set(nameKey, salaryRows);
  }
  return grouped;
}

export function getCachedHistoricalRealRating(slug: string | undefined, season: number): ZenRating | null {
  if (!slug || !zenGmLoadedData || !Number.isFinite(season)) return null;
  return (zenGmLoadedData.data.ratings ?? []).find(
    rating => rating.slug === slug && rating.season === season,
  ) ?? null;
}

function pickRating(ratings: ZenRating[] | undefined, seasonEndYear: number): ZenRating | null {
  if (!ratings?.length) return null;
  return [...ratings]
    .filter((rating) => rating.season <= seasonEndYear)
    .sort((a, b) => b.season - a.season)[0] ?? null;
}

type CurrentRosterContinuity = {
  activeRows: ZenStat[];
  continuitySlugs: Set<string>;
  freeAgentSlugs: Set<string>;
};

function resolveCurrentRosterContinuity(
  currentRows: ZenStat[],
  nativeTeamRows: ZenStat[],
  ratingsBySlug: Map<string, ZenRating[]>,
  bios: Record<string, ZenBio> | undefined,
  startYear: number,
  branchStart: number | string | Date,
  seasonEndYear: number,
  latestNativeTeamSeason: number,
): CurrentRosterContinuity {
  if (seasonEndYear !== latestNativeTeamSeason || !bios) {
    return { activeRows: currentRows, continuitySlugs: new Set(), freeAgentSlugs: new Set() };
  }

  const activeSlugs = new Set(currentRows.map(row => row.slug));
  const latestTeamRowBySlug = new Map<string, ZenStat>();
  for (const row of nativeTeamRows) {
    if (row.season > startYear || !normalizeAbbrev(row.abbrev)) continue;
    const previous = latestTeamRowBySlug.get(row.slug);
    if (!previous || previous.season < row.season) latestTeamRowBySlug.set(row.slug, row);
  }

  const candidates = [...latestTeamRowBySlug.entries()].flatMap(([slug, lastTeamRow]) => {
    if (activeSlugs.has(slug) || lastTeamRow.season < startYear - 1) return [];
    const bio = bios[slug];
    const bornYear = Number(bio?.bornYear ?? 0);
    if (!bornYear || seasonEndYear - bornYear >= 34 || historicalDeathBeforeBranch(bio, branchStart).diedYear) return [];
    const selectedRating = pickRating(ratingsBySlug.get(slug), seasonEndYear);
    if (!selectedRating || selectedRating.season < startYear) return [];
    return [{
      slug,
      lastTeamRow,
      overall: calculateOverallFromRating(ratingToPlayerRating(selectedRating)),
    }];
  });

  const activeCounts = new Map<string, number>();
  for (const row of currentRows) {
    const abbrev = normalizeAbbrev(row.abbrev);
    if (abbrev) activeCounts.set(abbrev, (activeCounts.get(abbrev) ?? 0) + 1);
  }
  const continuitySlugs = new Set<string>();
  const freeAgentSlugs = new Set<string>();
  const supplementalRows: ZenStat[] = [];
  const rosterLimit = getTrainingCampRosterLimit();

  candidates.sort((left, right) => right.overall - left.overall || left.slug.localeCompare(right.slug));
  for (const candidate of candidates) {
    const abbrev = normalizeAbbrev(candidate.lastTeamRow.abbrev);
    if (!abbrev) continue;
    const canContinueWithTeam = candidate.lastTeamRow.season === startYear
      && (activeCounts.get(abbrev) ?? 0) < rosterLimit;
    if (canContinueWithTeam) activeCounts.set(abbrev, (activeCounts.get(abbrev) ?? 0) + 1);
    else freeAgentSlugs.add(candidate.slug);
    continuitySlugs.add(candidate.slug);
    supplementalRows.push({
      ...candidate.lastTeamRow,
      season: seasonEndYear,
    });
  }

  return {
    activeRows: [...currentRows, ...supplementalRows],
    continuitySlugs,
    freeAgentSlugs,
  };
}

function pickDraftRating(ratings: ZenRating[] | undefined, draftYear: number): ZenRating | null {
  if (!ratings?.length) return null;
  const nearDraft = [...ratings]
    .filter((rating) => rating.season >= draftYear && rating.season <= draftYear + 1)
    .sort((a, b) => a.season - b.season)[0];
  if (nearDraft) return nearDraft;
  const preDraft = [...ratings]
    .filter((rating) => rating.season <= draftYear)
    .sort((a, b) => b.season - a.season)[0];
  if (preDraft) return preDraft;
  return [...ratings].sort((a, b) => a.season - b.season)[0] ?? null;
}

function firstRegularSeason(rows: ZenStat[] | undefined): number | null {
  if (!rows?.length) return null;
  const seasons = rows
    .filter((row) => !row.playoffs && normalizeAbbrev(row.abbrev))
    .map((row) => row.season)
    .filter((season): season is number => Number.isFinite(season))
    .sort((a, b) => a - b);
  return seasons[0] ?? null;
}

function resolveProspectClassYear(
  bio: ZenBio,
  rows: ZenStat[] | undefined,
  seasonEndYear: number,
  maxDraftYear: number,
): number | null {
  const explicitDraftYear = Number(bio.draftYear ?? 0);
  if (Number.isFinite(explicitDraftYear) && explicitDraftYear > 0) {
    return explicitDraftYear >= seasonEndYear && explicitDraftYear <= maxDraftYear
      ? explicitDraftYear
      : null;
  }

  const firstSeason = firstRegularSeason(rows);
  if (firstSeason !== null) {
    const inferredDraftYear = firstSeason - 1;
    if (inferredDraftYear >= seasonEndYear && inferredDraftYear <= maxDraftYear) {
      return inferredDraftYear;
    }
  }

  return null;
}

function ratingToPlayerRating(rating: ZenRating) {
  return {
    season: rating.season,
    hgt: rating.hgt ?? 50,
    stre: rating.stre ?? 50,
    spd: rating.spd ?? 50,
    jmp: rating.jmp ?? 50,
    endu: rating.endu ?? 50,
    ins: rating.ins ?? 50,
    dnk: rating.dnk ?? 50,
    ft: rating.ft ?? 50,
    fg: rating.fg ?? 50,
    tp: rating.tp ?? 50,
    diq: rating.diq ?? 50,
    oiq: rating.oiq ?? 50,
    drb: rating.drb ?? 50,
    pss: rating.pss ?? 50,
    reb: rating.reb ?? 50,
    pot: rating.pot,
    fuzz: rating.fuzz,
  };
}

function resolveHistoricalProspectPotential(overallRating: number, age: number, sourcePot?: number): number {
  void sourcePot;
  return estimatePotentialBbgm(overallRating, age);
}

function toNbaStat(row: ZenStat, tidByAbbrev: Map<string, number>): NBAGMStat | null {
  const abbrev = normalizeAbbrev(row.abbrev);
  if (!abbrev) return null;
  const tid = tidByAbbrev.get(abbrev);
  if (tid === undefined) return null;
  const pct = (made = 0, attempted = 0) => attempted > 0 ? (made / attempted) * 100 : 0;
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row as any)) {
    if (
      key.endsWith('Max')
      || ['ewa', 'ows', 'dws', 'ws', 'vorp', 'dd', 'td', 'qd', 'fiveBy5', 'pm', 'gmsc', 'gmSc'].includes(key)
    ) {
      extras[key] = value;
    }
  }

  return normalizeBBGMStat({
    ...extras,
    season: row.season,
    abbrev,
    tid,
    playoffs: Boolean(row.playoffs),
    gp: row.gp ?? 0,
    gs: row.gs ?? 0,
    min: row.min ?? 0,
    fg: row.fg ?? 0,
    fga: row.fga ?? 0,
    fgp: pct(row.fg, row.fga),
    tp: row.tp ?? 0,
    tpa: row.tpa ?? 0,
    tpp: pct(row.tp, row.tpa),
    ft: row.ft ?? 0,
    fta: row.fta ?? 0,
    ftp: pct(row.ft, row.fta),
    orb: row.orb ?? 0,
    drb: row.drb ?? 0,
    trb: row.trb ?? ((row.orb ?? 0) + (row.drb ?? 0)),
    ast: row.ast ?? 0,
    stl: row.stl ?? 0,
    blk: row.blk ?? 0,
    tov: row.tov ?? 0,
    pf: row.pf ?? 0,
    pts: row.pts ?? 0,
    per: row.per,
    ws: row.ws,
    vorp: row.vorp,
    jerseyNumber: row.jerseyNumber,
  }) as NBAGMStat;
}

function buildVisibleTransactionsFromStats(
  rows: ZenStat[] | undefined,
  tidByAbbrev: Map<string, number>,
  seasonEndYear: number,
): NBAPlayer['transactions'] {
  if (!rows?.length) return [];
  const teamRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !row.playoffs && (row.gp ?? 0) > 0 && row.season < seasonEndYear)
    .map(({ row, index }) => {
      const abbrev = normalizeAbbrev(row.abbrev);
      const tid = abbrev ? tidByAbbrev.get(abbrev) : undefined;
      return tid === undefined ? null : { season: row.season - 1, tid, phase: index };
    })
    .filter((row): row is { season: number; tid: number; phase: number } => Boolean(row))
    .sort((a, b) => a.season - b.season || a.phase - b.phase);

  const transactions: NonNullable<NBAPlayer['transactions']> = [];
  let lastTid: number | undefined;
  for (const row of teamRows) {
    if (lastTid === undefined) {
      lastTid = row.tid;
      continue;
    }
    if (row.tid === lastTid) continue;
    transactions.push({
      season: row.season,
      tid: row.tid,
      type: 'trade',
      phase: row.phase,
    });
    lastTid = row.tid;
  }

  return transactions;
}

function contractAmountForOverall(startYear: number, overall: number): number {
  const cap = getHistoricalNbaSalaryCap(startYear);
  const averageSalary = cap ? cap / 14 / 1000 : 500;
  const ratingFactor = 0.45 + Math.max(0, overall - 45) / 35;
  return Math.max(200, Math.round(averageSalary * ratingFactor));
}

function generatedContractYearsForOverall(overall: number): number {
  if (overall >= 68) return 4;
  if (overall >= 60) return 3;
  if (overall >= 52) return 2;
  return 1;
}

function buildGeneratedHistoricalContract(
  startYear: number,
  seasonEndYear: number,
  overall: number,
): Pick<NBAPlayer, 'contract'> & { contractYears: Array<{ season: string; guaranteed: number; option: string }> } {
  const amount = contractAmountForOverall(startYear, overall);
  const years = generatedContractYearsForOverall(overall);
  const salaryUSD = amount * 1_000;
  return {
    contract: { amount, exp: seasonEndYear + years - 1 },
    contractYears: Array.from({ length: years }, (_, index) => {
      const year = seasonEndYear + index;
      return {
        season: seasonLabelFromEndYear(year),
        guaranteed: Math.round(salaryUSD * Math.pow(1.05, index)),
        option: '',
      };
    }),
  };
}

type HistoricalRookieContract = {
  contract: NonNullable<NBAPlayer['contract']>;
  contractYears: Array<{ season: string; guaranteed: number; option: string }>;
};

function buildHistoricalRookieContract(
  startYear: number,
  draftRound: number,
  draftPick: number,
): HistoricalRookieContract {
  const leagueRules = getHistoricalNbaRuleOverrides(startYear);
  const roundSize = 30;
  const pickSlot = draftRound <= 1 ? draftPick : roundSize + draftPick;
  const salaryUSD = computeRookieSalaryUSD(Math.max(1, pickSlot), leagueRules, roundSize);
  const guaranteedYears = draftRound <= 1
    ? Math.max(1, Number(leagueRules.rookieContractLength ?? 2))
    : 2;
  const optionYears = draftRound <= 1 && leagueRules.rookieTeamOptionsEnabled !== false
    ? Math.max(0, Number(leagueRules.rookieTeamOptionYears ?? 2))
    : 0;
  const totalYears = guaranteedYears + optionYears;
  const contractYears = Array.from({ length: totalYears }, (_, index) => {
    const seasonStartYear = startYear + index;
    return {
      season: `${seasonStartYear}-${String(seasonStartYear + 1).slice(-2)}`,
      guaranteed: Math.round(salaryUSD * Math.pow(1.05, index)),
      option: index >= guaranteedYears ? 'Team' : '',
    };
  });

  return {
    contract: {
      amount: Math.round(salaryUSD / 1_000),
      exp: startYear + totalYears,
      rookie: true,
      ...(optionYears > 0 ? { hasTeamOption: true, teamOptionExp: startYear + guaranteedYears + 1 } : {}),
      ...(draftRound <= 1 && leagueRules.rookieRestrictedFreeAgentEligibility ? { restrictedFA: true } : {}),
    } as NBAPlayer['contract'],
    contractYears,
  };
}

export function buildHistoricalRookieContractFallback(
  draft: Pick<NonNullable<NBAPlayer['draft']>, 'year' | 'round' | 'pick'> | undefined,
  seasonEndYear: number,
  existing: Pick<NBAPlayer, 'contract' | 'contractYears'> = {},
): HistoricalRookieContract | null {
  const draftYear = Number(draft?.year ?? 0);
  const draftRound = Number(draft?.round ?? 0);
  const draftPick = Number(draft?.pick ?? 0);
  if (
    !Number.isFinite(draftYear)
    || draftYear <= 0
    || !Number.isFinite(draftRound)
    || draftRound <= 0
    || !Number.isFinite(draftPick)
    || draftPick <= 0
  ) {
    return null;
  }

  const fallback = buildHistoricalRookieContract(draftYear, draftRound, draftPick);
  if (seasonEndYear < draftYear + 1 || seasonEndYear > fallback.contract.exp) return null;

  const existingYearsBySeason = new Map(
    (existing.contractYears ?? []).map(row => [row.season, row]),
  );
  const contractYears = fallback.contractYears.map(row => {
    const existingRow = existingYearsBySeason.get(row.season);
    const existingGuaranteed = Number(existingRow?.guaranteed ?? 0);
    return {
      ...row,
      ...(existingRow ?? {}),
      guaranteed: Number.isFinite(existingGuaranteed) && existingGuaranteed > 0
        ? existingGuaranteed
        : row.guaranteed,
      option: row.option,
    };
  });
  const existingAmount = Number(existing.contract?.amount ?? 0);
  const contract: NonNullable<NBAPlayer['contract']> = {
    ...(existing.contract ?? {}),
    ...fallback.contract,
    amount: Number.isFinite(existingAmount) && existingAmount > 0
      ? existingAmount
      : fallback.contract.amount,
  };
  if (!fallback.contract.hasTeamOption) {
    delete contract.hasTeamOption;
    delete contract.teamOptionExp;
  }
  if (!fallback.contract.restrictedFA) {
    delete contract.restrictedFA;
    delete contract.isRestrictedFA;
  }

  return { contract, contractYears };
}

function salaryFieldValues(source: unknown, index: number, endYear: number): unknown[] {
  if (Array.isArray(source)) return [source[index]];
  if (source && typeof source === 'object') {
    const record = source as Record<string, unknown>;
    const seasonLabel = seasonLabelFromEndYear(endYear);
    return [record[String(index)], record[String(endYear)], record[seasonLabel]];
  }
  return [source];
}

function salaryOptionKind(salary: ZenSalary, index: number, endYear: number): ContractOptionKind {
  const fields: Array<keyof ZenSalary> = [
    'options',
    'option',
    'types',
    'type',
    'contractTypes',
    'contractType',
    'guarantees',
    'guarantee',
  ];
  for (const field of fields) {
    for (const value of salaryFieldValues(salary[field], index, endYear)) {
      if ((field === 'guarantees' || field === 'guarantee') && value === false) return 'nonGuaranteed';
      const kind = normalizeContractOptionKind(value);
      if (kind !== 'none') return kind;
    }
  }
  return 'none';
}

type InferredRookieScaleWindow = {
  firstOptionEndYear: number;
  lastRookieEndYear: number;
};

function getInferredRookieScaleWindow(
  bio: ZenBio | undefined,
  salary: ZenSalary | undefined,
): InferredRookieScaleWindow | null {
  const draftYear = Number(bio?.draftYear ?? 0);
  const draftRound = Number(bio?.draftRound ?? 0);
  if (!Number.isFinite(draftYear) || draftYear <= 0 || !Number.isFinite(draftRound) || draftRound !== 1) return null;

  const leagueRules = getHistoricalNbaRuleOverrides(draftYear);
  if (leagueRules.rookieScaleType === 'none' || leagueRules.rookieTeamOptionsEnabled === false) return null;

  const guaranteedYears = Math.max(1, Number(leagueRules.rookieContractLength ?? 2));
  const optionYears = Math.max(0, Number(leagueRules.rookieTeamOptionYears ?? 2));
  if (optionYears <= 0) return null;

  const firstSeasonEndYear = draftYear + 1;
  const firstOptionEndYear = draftYear + guaranteedYears + 1;
  const lastRookieEndYear = draftYear + guaranteedYears + optionYears;
  const start = Number(salary?.start ?? 0);
  const exp = Number(salary?.exp ?? 0);
  if (!Number.isFinite(start) || !Number.isFinite(exp) || start <= 0 || exp <= 0) return null;
  if (start < draftYear || start > firstSeasonEndYear) return null;
  if (exp < firstOptionEndYear || exp > lastRookieEndYear) return null;

  return { firstOptionEndYear, lastRookieEndYear };
}

function salaryOptionKindWithRookieInference(
  salary: ZenSalary,
  index: number,
  endYear: number,
  bio?: ZenBio,
): ContractOptionKind {
  const explicit = salaryOptionKind(salary, index, endYear);
  if (explicit !== 'none') return explicit;
  const rookieWindow = getInferredRookieScaleWindow(bio, salary);
  if (!rookieWindow) return 'none';
  return endYear >= rookieWindow.firstOptionEndYear && endYear <= rookieWindow.lastRookieEndYear ? 'team' : 'none';
}

function contractYearOptionLabel(kind: ContractOptionKind): string {
  if (kind === 'player') return 'Player';
  if (kind === 'team') return 'Team';
  if (kind === 'twoWay') return 'Two-Way';
  if (kind === 'nonGuaranteed') return 'Non-Guaranteed';
  return '';
}

export function buildHistoricalSalaryRows(
  salaries: ZenSalary[] | undefined,
  seasonEndYear: number,
  bio?: ZenBio,
  teamRows: Array<{ season: number; tid: number; teamAbbrev?: string }> = [],
): NonNullable<NBAPlayer['salaries']> | undefined {
  if (!salaries?.length) return undefined;
  const teamBySeason = new Map(teamRows.map(row => [row.season, row]));
  const rows: NonNullable<NBAPlayer['salaries']> = [];
  for (const salary of salaries) {
    const start = Number(salary.start ?? 0);
    if (!Number.isFinite(start) || start <= 0 || start > seasonEndYear) continue;
    const amounts = Array.isArray(salary.amounts) ? salary.amounts : [];
    amounts.forEach((amount, index) => {
      const season = start + index;
      const amountUSD = Number(amount);
      if (!Number.isFinite(season) || season > seasonEndYear || !Number.isFinite(amountUSD) || amountUSD <= 0) return;
      const team = teamBySeason.get(season);
      rows.push({
        season,
        amount: Math.round(amountUSD / 1_000),
        option: contractYearOptionLabel(salaryOptionKindWithRookieInference(salary, index, season, bio)) || undefined,
        ...(team ? { tid: team.tid, teamAbbrev: team.teamAbbrev } : {}),
      });
    });
  }
  if (rows.length === 0) return undefined;
  rows.sort((a, b) => a.season - b.season);
  const bySeason = new Map<number, NonNullable<NBAPlayer['salaries']>[number]>();
  for (const row of rows) {
    const existing = bySeason.get(row.season);
    if (!existing || row.amount >= existing.amount) bySeason.set(row.season, row);
  }
  return [...bySeason.values()].sort((a, b) => a.season - b.season);
}

export function buildHistoricalContract(
  salaries: ZenSalary[] | undefined,
  seasonEndYear: number,
  bio?: ZenBio,
  overall = 50,
): Pick<NBAPlayer, 'contract'> & { contractYears?: Array<{ season: string; guaranteed: number; option: string }>; twoWay?: boolean; nonGuaranteed?: boolean } | null {
  if (!salaries?.length) return null;
  const salary = [...salaries]
    .filter(entry => {
      const start = Number(entry.start ?? 0);
      const exp = Number(entry.exp ?? 0);
      return start > 0 && exp >= start && start <= seasonEndYear && seasonEndYear <= exp;
    })
    .sort((a, b) => Number(b.start ?? 0) - Number(a.start ?? 0))[0];
  if (!salary) return null;

  const start = Number(salary.start ?? seasonEndYear);
  const exp = Number(salary.exp ?? seasonEndYear);
  const amounts = Array.isArray(salary.amounts) ? salary.amounts : [];
  const amountIndex = Math.max(0, Math.min(amounts.length - 1, seasonEndYear - start));
  const currentAmount = Number(amounts[amountIndex] ?? amounts[amounts.length - 1] ?? 0);
  if (!Number.isFinite(currentAmount) || currentAmount <= 0) return null;
  const currentOptionKind = salaryOptionKindWithRookieInference(salary, amountIndex, seasonEndYear, bio);
  const rookieWindow = getInferredRookieScaleWindow(bio, salary);
  const isInferredRookieContract = Boolean(rookieWindow && seasonEndYear <= rookieWindow.lastRookieEndYear);
  const contractEndYear = isInferredRookieContract
    ? Math.min(exp, rookieWindow!.lastRookieEndYear)
    : seasonEndYear + generatedContractYearsForOverall(overall) - 1;
  const contractYears = Array.from({ length: contractEndYear - seasonEndYear + 1 }, (_, index) => {
    const endYear = seasonEndYear + index;
    const sourceIndex = endYear - start;
    const sourceAmount = Number(amounts[sourceIndex]);
    return {
      season: seasonLabelFromEndYear(endYear),
      guaranteed: Math.round(
        isInferredRookieContract && Number.isFinite(sourceAmount) && sourceAmount > 0
          ? sourceAmount
          : currentAmount * Math.pow(1.05, index),
      ),
      option: isInferredRookieContract
        ? contractYearOptionLabel(salaryOptionKindWithRookieInference(salary, sourceIndex, endYear, bio))
        : index === 0 ? contractYearOptionLabel(currentOptionKind) : '',
    };
  });
  const rookieRules = isInferredRookieContract
    ? getHistoricalNbaRuleOverrides(Number(bio?.draftYear ?? seasonEndYear))
    : null;
  const optionEntries = contractYears
    .map(row => ({ row, endYear: seasonLabelToEndYear(row.season), kind: normalizeContractOptionKind(row.option) }))
    .filter(entry => entry.endYear !== undefined);
  const playerOptionExp = optionEntries.find(entry => entry.kind === 'player')?.endYear;
  const teamOptionExp = optionEntries.find(entry => entry.kind === 'team')?.endYear;

  return {
    contract: {
      amount: Math.round(currentAmount / 1_000),
      exp: contractEndYear,
      ...(isInferredRookieContract ? { rookie: true } : {}),
      ...(rookieRules?.rookieRestrictedFreeAgentEligibility ? { restrictedFA: true } : {}),
      ...(currentOptionKind === 'twoWay' ? { type: 'TWO_WAY' } : {}),
      ...(playerOptionExp ? { hasPlayerOption: true, playerOptionExp } : {}),
      ...(teamOptionExp ? { hasTeamOption: true, teamOptionExp } : {}),
    } as NBAPlayer['contract'],
    contractYears,
    ...(currentOptionKind === 'twoWay' ? { twoWay: true } : {}),
    ...(currentOptionKind === 'nonGuaranteed' ? { nonGuaranteed: true } : {}),
  };
}

export function repairHistoricalCareerContractLeak<T extends NBAPlayer>(
  player: T,
  nbaStartYear: number,
  currentYear: number,
): T {
  if (player.contract?.rookie || !String(player.internalId).startsWith('zengm-')) return player;
  const branchSeason = nbaStartYear + 1;
  if (currentYear > branchSeason + 2) return player;
  const years = Array.isArray(player.contractYears) ? player.contractYears : [];
  const endYears = years.map(row => seasonLabelToEndYear(row.season)).filter((year): year is number => year !== undefined);
  if (years.length <= 6 || !endYears.includes(branchSeason) || Math.max(...endYears) <= branchSeason + 5) return player;
  const base = years.find(row => seasonLabelToEndYear(row.season) === branchSeason);
  if (!base || !Number.isFinite(base.guaranteed) || base.guaranteed <= 0) return player;

  const naturalEnd = branchSeason + generatedContractYearsForOverall(Number(player.overallRating ?? 50)) - 1;
  const contractEnd = Math.max(currentYear, naturalEnd);
  const contractYears = Array.from({ length: contractEnd - branchSeason + 1 }, (_, index) => ({
    season: seasonLabelFromEndYear(branchSeason + index),
    guaranteed: Math.round(base.guaranteed * Math.pow(1.05, index)),
    option: '',
  }));
  const current = contractYears.find(row => seasonLabelToEndYear(row.season) === currentYear) ?? contractYears.at(-1)!;
  const contract = { ...player.contract, amount: Math.round(current.guaranteed / 1_000), exp: contractEnd };
  delete contract.hasPlayerOption;
  delete contract.playerOptionExp;
  delete contract.hasTeamOption;
  delete contract.teamOptionExp;
  return {
    ...player,
    contract,
    contractYears,
    salaries: player.salaries?.filter(row => Number(row.season) <= branchSeason),
  };
}

function buildPlayers(
  activeStatsBySlug: Map<string, ZenStat[]>,
  allStatsBySlug: Map<string, ZenStat[]>,
  ratingsBySlug: Map<string, ZenRating[]>,
  salariesBySlug: Map<string, ZenSalary[]>,
  bios: Record<string, ZenBio> | undefined,
  tidByAbbrev: Map<string, number>,
  startYear: number,
  branchStart: number | string | Date,
  seasonEndYear: number,
): NBAPlayer[] {
  const players: NBAPlayer[] = [];

  for (const [slug, currentRows] of activeStatsBySlug.entries()) {
    const currentStat = pickCurrentStat(currentRows);
    const currentAbbrev = normalizeAbbrev(currentStat?.abbrev);
    if (!currentStat || !currentAbbrev) continue;

    const tid = tidByAbbrev.get(currentAbbrev);
    if (tid === undefined) continue;

    const fullRosterPlayer = getFullRosterPlayerForIdentity({ srID: slug, slug, name: bios?.[slug]?.name });
    const bio = bios?.[slug] ?? {};
    if (historicalDeathBeforeBranch(bio, branchStart).diedYear) continue;
    const selectedRating = pickRating(ratingsBySlug.get(slug), seasonEndYear);
    if (!selectedRating) continue;

    const ratings = (ratingsBySlug.get(slug) ?? [])
      .filter((rating) => rating.season <= seasonEndYear)
      .sort((a, b) => a.season - b.season)
      .map(ratingToPlayerRating);
    const currentRating = ratingToPlayerRating(selectedRating);
    const overallRating = calculateOverallFromRating(currentRating);
    const bornYear = bio.bornYear ?? fullRosterPlayer?.born?.year;
    const currentAge = bornYear ? Math.max(18, seasonEndYear - bornYear) : 24;
    const historicalContract = buildHistoricalContract(salariesBySlug.get(slug), seasonEndYear, bio, overallRating);
    const rookieContractFallback = historicalContract
      ? null
      : buildHistoricalRookieContractFallback({
          year: bio.draftYear ?? fullRosterPlayer?.draft?.year ?? 0,
          round: bio.draftRound ?? fullRosterPlayer?.draft?.round ?? 0,
          pick: bio.draftPick ?? fullRosterPlayer?.draft?.pick ?? 0,
        }, seasonEndYear);
    const salaryTeamRows = (allStatsBySlug.get(slug) ?? []).flatMap(row => {
      if (row.playoffs) return [];
      const teamAbbrev = normalizeAbbrev(row.abbrev);
      const rowTid = teamAbbrev ? tidByAbbrev.get(teamAbbrev) : undefined;
      return rowTid === undefined ? [] : [{ season: row.season, tid: rowTid, teamAbbrev }];
    });
    const sourceSalaryRows = buildHistoricalSalaryRows(
      salariesBySlug.get(slug),
      seasonEndYear,
      bio,
      salaryTeamRows,
    );
    const playerContract = historicalContract
      ?? rookieContractFallback
      ?? buildGeneratedHistoricalContract(startYear, seasonEndYear, overallRating);
    const pastStats = (allStatsBySlug.get(slug) ?? [])
      .filter((row) => row.season < seasonEndYear)
      .map((row) => toNbaStat(row, tidByAbbrev))
      .filter((stat): stat is NBAGMStat => Boolean(stat));
    const visibleTransactions = buildVisibleTransactionsFromStats(allStatsBySlug.get(slug), tidByAbbrev, seasonEndYear);
    const draftTid = normalizeAbbrev(bio.draftAbbrev);
    const potential = resolveHistoricalProspectPotential(overallRating, currentAge, selectedRating.pot);
    const sourceAwards = mergeNormalizedPlayerAwards(
      normalizePlayerAwardRows(bio.awards, seasonEndYear),
      normalizePlayerAwardRows(fullRosterPlayer?.awards, seasonEndYear),
    );

    players.push({
      internalId: `zengm-${slug}`,
      name: bio.name ?? fullRosterPlayer?.name ?? slug,
      pos: bio.pos ?? fullRosterPlayer?.pos ?? 'G',
      age: currentAge,
      hgt: bio.height ?? fullRosterPlayer?.hgt ?? 78,
      weight: bio.weight ?? fullRosterPlayer?.weight ?? 210,
      college: bio.college ?? fullRosterPlayer?.college,
      born: { year: bornYear ?? seasonEndYear - 24, loc: bio.country ?? fullRosterPlayer?.born?.loc ?? '' },
      draft: {
        year: bio.draftYear ?? fullRosterPlayer?.draft?.year ?? seasonEndYear - 1,
        round: bio.draftRound ?? fullRosterPlayer?.draft?.round ?? 1,
        pick: bio.draftPick ?? fullRosterPlayer?.draft?.pick ?? 1,
        tid: draftTid ? tidByAbbrev.get(draftTid) ?? -1 : -1,
      },
      ratings,
      stats: pastStats,
      tid,
      jerseyNumber: currentStat.jerseyNumber !== undefined ? String(currentStat.jerseyNumber) : undefined,
      contract: playerContract.contract,
      contractYears: playerContract.contractYears,
      ...(sourceSalaryRows ? { salaries: sourceSalaryRows } : {}),
      ...((playerContract as any).twoWay ? { twoWay: true } : {}),
      ...((playerContract as any).nonGuaranteed ? { nonGuaranteed: true } : {}),
      injury: { type: 'Healthy', gamesRemaining: 0 },
      status: 'Active',
      overallRating,
      potential,
      awards: sourceAwards,
      transactions: visibleTransactions,
      imgURL: resolvePersistentPlayerImage({
        imgURL: fullRosterPlayer?.imgURL,
        srID: slug,
        slug,
        name: bio.name ?? fullRosterPlayer?.name ?? slug,
        status: 'Active',
      }),
      srID: slug,
      slug,
    } as NBAPlayer);
  }

  return players.sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
}

function buildRecentSourceRetirees(
  allStatsBySlug: Map<string, ZenStat[]>,
  ratingsBySlug: Map<string, ZenRating[]>,
  bios: Record<string, ZenBio> | undefined,
  tidByAbbrev: Map<string, number>,
  startYear: number,
  branchStart: number | string | Date,
  sourceCoverageThrough: number,
): NBAPlayer[] {
  const retirees: NBAPlayer[] = [];

  for (const [slug, rows] of allStatsBySlug.entries()) {
    const bio = bios?.[slug] ?? {};
    const regularRows = rows.filter(row => !row.playoffs && normalizeAbbrev(row.abbrev));
    const preBranchDeath = historicalDeathBeforeBranch(bio, branchStart);
    const sourceRetirement = inferSourceRetirement(
      {
        bornYear: bio.bornYear,
        stats: regularRows,
      },
      {
        branchCutoffYear: startYear,
        sourceCoverageThrough,
        kind: 'player',
        confirmThroughSourceCoverage: true,
      },
    );
    const diedDuringStartYearBeforeBranch = preBranchDeath.diedYear === startYear;
    if (sourceRetirement?.retiredYear !== startYear && !diedDuringStartYearBeforeBranch) continue;

    const fullRosterPlayer = getFullRosterPlayerForIdentity({ srID: slug, slug, name: bio.name });
    const selectedRating = pickRating(ratingsBySlug.get(slug), startYear) ?? {
      slug,
      season: startYear,
    };
    const ratings = (ratingsBySlug.get(slug) ?? [])
      .filter(rating => rating.season <= startYear)
      .sort((a, b) => a.season - b.season)
      .map(ratingToPlayerRating);
    const currentRating = ratingToPlayerRating(selectedRating);
    if (ratings.length === 0) ratings.push(currentRating);
    const overallRating = calculateOverallFromRating(currentRating);
    const bornYear = bio.bornYear ?? fullRosterPlayer?.born?.year;
    const lastRegularRow = [...regularRows]
      .filter(row => row.season <= startYear)
      .sort((a, b) => b.season - a.season || (b.gp ?? 0) - (a.gp ?? 0))[0];
    const draftAbbrev = normalizeAbbrev(bio.draftAbbrev);
    const sourceAwards = mergeNormalizedPlayerAwards(
      normalizePlayerAwardRows(bio.awards, startYear + 1),
      normalizePlayerAwardRows(fullRosterPlayer?.awards, startYear + 1),
    );

    retirees.push({
      internalId: `zengm-retired-${startYear}-${slug}`,
      name: bio.name ?? fullRosterPlayer?.name ?? slug,
      pos: bio.pos ?? fullRosterPlayer?.pos ?? 'G',
      age: bornYear ? Math.max(18, startYear - bornYear) : 38,
      hgt: bio.height ?? fullRosterPlayer?.hgt ?? 78,
      weight: bio.weight ?? fullRosterPlayer?.weight ?? 210,
      college: bio.college ?? fullRosterPlayer?.college,
      born: { year: bornYear ?? startYear - 38, loc: bio.country ?? fullRosterPlayer?.born?.loc ?? '' },
      draft: {
        year: bio.draftYear ?? fullRosterPlayer?.draft?.year ?? startYear - 12,
        round: bio.draftRound ?? fullRosterPlayer?.draft?.round ?? 1,
        pick: bio.draftPick ?? fullRosterPlayer?.draft?.pick ?? 1,
        tid: draftAbbrev ? tidByAbbrev.get(draftAbbrev) ?? -1 : -1,
      },
      ratings,
      stats: rows
        .filter(row => row.season <= startYear)
        .map(row => toNbaStat(row, tidByAbbrev))
        .filter((stat): stat is NBAGMStat => Boolean(stat)),
      tid: -3,
      jerseyNumber: lastRegularRow?.jerseyNumber !== undefined
        ? String(lastRegularRow.jerseyNumber)
        : undefined,
      injury: { type: 'Healthy', gamesRemaining: 0 },
      status: 'Retired',
      overallRating,
      potential: overallRating,
      awards: sourceAwards,
      transactions: buildVisibleTransactionsFromStats(rows, tidByAbbrev, startYear + 1),
      imgURL: resolvePersistentPlayerImage({
        imgURL: fullRosterPlayer?.imgURL,
        srID: slug,
        slug,
        name: bio.name ?? fullRosterPlayer?.name ?? slug,
        status: 'Retired',
      }),
      retiredYear: preBranchDeath.diedYear ?? startYear,
      ...preBranchDeath,
      sourceRetirement,
      hof: Boolean(fullRosterPlayer?.hof),
      srID: slug,
      slug,
    } as NBAPlayer);
  }

  return retirees.sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
}

function buildDraftProspects(
  bios: Record<string, ZenBio> | undefined,
  ratingsBySlug: Map<string, ZenRating[]>,
  allStatsBySlug: Map<string, ZenStat[]>,
  activeSlugs: Set<string>,
  seasonEndYear: number,
): NBAPlayer[] {
  if (!bios) return [];
  const minDraftYear = seasonEndYear;
  const maxDraftYear = seasonEndYear + DRAFT_CLASS_HORIZON_YEARS - 1;
  const prospects: NBAPlayer[] = [];

  for (const [slug, bio] of Object.entries(bios)) {
    if (activeSlugs.has(slug)) continue;
    const draftYear = resolveProspectClassYear(bio, allStatsBySlug.get(slug), minDraftYear, maxDraftYear);
    if (!draftYear) continue;
    const historicalDraftProspectSource = getHistoricalDraftProspectSource(bio);
    if (!historicalDraftProspectSource) continue;

    const selectedRating = pickDraftRating(ratingsBySlug.get(slug), draftYear);
    if (!selectedRating) continue;
    const fullRosterPlayer = getFullRosterPlayerForIdentity({ srID: slug, slug, name: bio.name });

    const sourceRating = ratingToPlayerRating(selectedRating);
    const baseRating = selectedRating.season > draftYear + 1
      ? discountHistoricalProspectRating(sourceRating, draftYear)
      : sourceRating;
    const currentAge = bio.bornYear
      ? Math.max(16, seasonEndYear - bio.bornYear)
      : Math.max(17, 21 - (draftYear - seasonEndYear));
    const overallRating = calculateOverallFromRating(baseRating);
    const potential = resolveHistoricalProspectPotential(overallRating, currentAge, selectedRating.pot);

    prospects.push({
      internalId: `zengm-draft-${draftYear}-${slug}`,
      preDraftClub: getHistoricalProspectSourceClub(`zengm-draft-${draftYear}-${slug}`, bio.bornYear, seasonEndYear - 1),
      name: bio.name ?? slug,
      pos: bio.pos ?? 'G',
      age: currentAge,
      hgt: bio.height ?? 78,
      weight: bio.weight ?? 210,
      college: bio.college,
      born: { year: bio.bornYear ?? seasonEndYear - currentAge, loc: bio.country ?? '' },
      draft: {
        year: draftYear,
        eligibleYear: draftYear,
        declaredYear: draftYear,
        leagueId: 'nba',
        round: 0,
        pick: 0,
        tid: -1,
        originalTid: -1,
      },
      ratings: [{ ...baseRating, pot: potential }],
      stats: [],
      tid: -2,
      contract: { amount: 0, exp: draftYear },
      injury: { type: 'Healthy', gamesRemaining: 0 },
      status: 'Draft Prospect',
      historicalDraftProspectSource,
      overallRating,
      potential,
      awards: [],
      transactions: [],
      imgURL: resolvePersistentPlayerImage({
        imgURL: fullRosterPlayer?.imgURL,
        srID: slug,
        slug,
        name: bio.name ?? slug,
        status: 'Draft Prospect',
      }),
      srID: slug,
      slug,
    } as NBAPlayer);
  }

  return prospects.sort((a, b) =>
    (a.draft?.year ?? 0) - (b.draft?.year ?? 0) ||
    (b.overallRating ?? 0) - (a.overallRating ?? 0)
  );
}

function communityDraftProspectKey(player: Pick<NBAPlayer, 'name' | 'draft' | 'srID' | 'slug'>): string {
  const draftYear = Number(player.draft?.year ?? 0);
  const identity = String(player.srID ?? player.slug ?? normalizePlayerName(player.name)).trim().toLowerCase();
  return `${draftYear}|${identity}`;
}

function communityDraftProspectNameKey(player: Pick<NBAPlayer, 'name' | 'draft'>): string {
  return `${Number(player.draft?.year ?? 0)}|${normalizePlayerName(player.name)}`;
}

function buildCommunityDraftProspects(seasonEndYear: number): NBAPlayer[] {
  const maxDraftYear = seasonEndYear + DRAFT_CLASS_HORIZON_YEARS - 1;
  const prospects: NBAPlayer[] = [];

  for (const source of getAllFullRosterPlayers()) {
    const draftYear = Number(source?.draft?.year ?? 0);
    if (Number(source?.tid) !== -2 || draftYear < seasonEndYear || draftYear > maxDraftYear) continue;
    const name = getFullRosterPlayerName(source);
    const sourceRating = Array.isArray(source?.ratings) ? source.ratings.at(-1) : null;
    if (!name || !sourceRating) continue;

    const slug = String(source?.srID ?? source?.slug ?? '').trim();
    const rating = ratingToPlayerRating({
      ...sourceRating,
      slug: slug || normalizePlayerName(name).replace(/\s+/g, '-'),
      season: draftYear,
    });
    const bornYear = Number(source?.born?.year ?? 0);
    const currentAge = bornYear > 0
      ? Math.max(14, seasonEndYear - bornYear)
      : Math.max(16, 21 - (draftYear - seasonEndYear));
    const overallRating = calculateOverallFromRating(rating);
    const potential = resolveHistoricalProspectPotential(overallRating, currentAge, sourceRating?.pot);
    const identity = slug || normalizePlayerName(name).replace(/\s+/g, '-');
    const preDraftDunk = PRE_DRAFT_DRIVING_DUNK[name];

    prospects.push({
      internalId: `community-draft-${draftYear}-${identity}`,
      name,
      pos: source?.pos ?? 'G',
      age: currentAge,
      hgt: source?.hgt ?? source?.height ?? 78,
      weight: source?.weight ?? 210,
      college: source?.college,
      born: { year: bornYear > 0 ? bornYear : seasonEndYear - currentAge, loc: source?.born?.loc ?? '' },
      draft: {
        year: draftYear,
        eligibleYear: draftYear,
        declaredYear: draftYear,
        leagueId: 'nba',
        round: 0,
        pick: 0,
        tid: -1,
        originalTid: -1,
      },
      ratings: [{ ...rating, pot: potential }],
      stats: [],
      tid: -2,
      contract: { amount: 0, exp: draftYear },
      injury: { type: 'Healthy', gamesRemaining: 0 },
      status: 'Draft Prospect',
      historicalDraftProspectSource: 'community-roster',
      overallRating,
      potential,
      drivingDunk: preDraftDunk?.draftYear === draftYear ? preDraftDunk.rating : undefined,
      awards: [],
      transactions: [],
      imgURL: source?.imgURL,
      srID: slug || identity,
      slug: slug || identity,
    } as NBAPlayer);
  }

  return prospects.sort((left, right) =>
    Number(left.draft?.year ?? 0) - Number(right.draft?.year ?? 0)
    || (right.overallRating ?? 0) - (left.overallRating ?? 0)
  );
}

export function mergeDraftProspectSources(
  nativeProspects: NBAPlayer[],
  communityProspects: NBAPlayer[],
): NBAPlayer[] {
  if (communityProspects.length === 0) return nativeProspects;
  const sourceCounts = new Map<number, number>();
  const sourceIdentityKeys = new Set<string>();
  const sourceNameKeys = new Set<string>();
  for (const player of communityProspects) {
    const year = Number(player.draft?.year ?? 0);
    sourceCounts.set(year, (sourceCounts.get(year) ?? 0) + 1);
    sourceIdentityKeys.add(communityDraftProspectKey(player));
    sourceNameKeys.add(communityDraftProspectNameKey(player));
  }
  const completeSourceYears = new Set(
    [...sourceCounts.entries()].filter(([, count]) => count >= 60).map(([year]) => year),
  );
  const communityIdentityIndex = createCanonicalPlayerIdentityIndex(communityProspects);
  const retainedNative = nativeProspects.filter(player => {
    const year = Number(player.draft?.year ?? 0);
    if (completeSourceYears.has(year)) return false;
    if (communityIdentityIndex.has(player)) return false;
    return !sourceIdentityKeys.has(communityDraftProspectKey(player))
      && !sourceNameKeys.has(communityDraftProspectNameKey(player));
  });
  return [...retainedNative, ...communityProspects].sort((left, right) =>
    Number(left.draft?.year ?? 0) - Number(right.draft?.year ?? 0)
    || (right.overallRating ?? 0) - (left.overallRating ?? 0)
  );
}

export function mergeCommunityDraftProspects(nativeProspects: NBAPlayer[], seasonEndYear: number): NBAPlayer[] {
  return mergeDraftProspectSources(nativeProspects, buildCommunityDraftProspects(seasonEndYear));
}

function buildIncomingDraftedPlayers(
  bios: Record<string, ZenBio> | undefined,
  ratingsBySlug: Map<string, ZenRating[]>,
  existingPlayers: NBAPlayer[],
  activeSlugs: Set<string>,
  tidByAbbrev: Map<string, number>,
  startYear: number,
  seasonEndYear: number,
): NBAPlayer[] {
  if (!bios) return [];

  const draftedPlayers: NBAPlayer[] = [];
  const existingPortraitByKey = new Map<string, string>();
  const existingPlayerByIdentityKey = new Map<string, NBAPlayer>();
  const existingPlayerByNameKey = new Map<string, NBAPlayer>();
  for (const player of existingPlayers) {
    const identityKey = playerIdentityKey(player);
    if (identityKey && !existingPlayerByIdentityKey.has(identityKey)) {
      existingPlayerByIdentityKey.set(identityKey, player);
    }
    const nameKey = playerDraftClassNameKey(player);
    if (nameKey && !existingPlayerByNameKey.has(nameKey)) {
      existingPlayerByNameKey.set(nameKey, player);
    }
    if (!player.imgURL) continue;
    if (identityKey && !existingPortraitByKey.has(identityKey)) {
      existingPortraitByKey.set(identityKey, player.imgURL);
    }
    if (nameKey && !existingPortraitByKey.has(nameKey)) {
      existingPortraitByKey.set(nameKey, player.imgURL);
    }
  }

  for (const [slug, bio] of Object.entries(bios)) {
    if (activeSlugs.has(slug)) continue;
    if (Number(bio.draftYear ?? 0) !== startYear) continue;

    const draftAbbrev = normalizeAbbrev(bio.draftAbbrev);
    const tid = draftAbbrev ? tidByAbbrev.get(draftAbbrev) : undefined;
    if (tid === undefined) continue;

    const selectedRating =
      pickRating(ratingsBySlug.get(slug), seasonEndYear) ??
      pickDraftRating(ratingsBySlug.get(slug), startYear);
    if (!selectedRating) continue;

    const currentRating = ratingToPlayerRating(selectedRating);
    const overallRating = calculateOverallFromRating(currentRating);
    const draftYear = bio.draftYear ?? startYear;
    const draftRound = bio.draftRound ?? 1;
    const draftPick = bio.draftPick ?? 1;
    const slugKey = `${startYear}|${slug}`;
    const nameKey = `${startYear}|${normalizePlayerName(bio.name ?? slug)}`;
    const existingMatch = existingPlayerByIdentityKey.get(slugKey) ?? existingPlayerByNameKey.get(nameKey);
    const reusedPortrait = existingPortraitByKey.get(slugKey) ?? existingPortraitByKey.get(nameKey);
    const fullRosterPlayer = getFullRosterPlayerForIdentity({ srID: slug, slug, name: bio.name });
    const contract = buildHistoricalRookieContract(startYear, draftRound, draftPick);
    const carriedRatings = existingMatch?.ratings?.length ? existingMatch.ratings : [currentRating];
    const latestCarriedRating = carriedRatings[carriedRatings.length - 1] ?? currentRating;
    const carriedOverall = existingMatch?.overallRating ?? calculateOverallFromRating(latestCarriedRating);
    const currentAge = bio.bornYear ? Math.max(18, seasonEndYear - bio.bornYear) : (existingMatch?.age ?? 19);
    const carriedPotential = resolveHistoricalProspectPotential(
      carriedOverall,
      currentAge,
      existingMatch?.potential
      ?? latestCarriedRating.pot
      ?? selectedRating.pot
      ?? Math.max(carriedOverall, overallRating + 3),
    );

    draftedPlayers.push({
      ...(existingMatch ?? {}),
      internalId: existingMatch?.internalId ?? `zengm-postdraft-${slug}`,
      name: existingMatch?.name ?? bio.name ?? slug,
      pos: existingMatch?.pos ?? bio.pos ?? 'G',
      age: currentAge,
      hgt: existingMatch?.hgt ?? bio.height ?? 78,
      weight: existingMatch?.weight ?? bio.weight ?? 210,
      college: existingMatch?.college ?? bio.college,
      born: existingMatch?.born ?? { year: bio.bornYear ?? seasonEndYear - 19, loc: bio.country ?? '' },
      draft: {
        year: draftYear,
        round: draftRound,
        pick: draftPick,
        tid,
        originalTid: tid,
      },
      ratings: carriedRatings,
      stats: existingMatch?.stats ?? [],
      tid,
      contract: contract.contract,
      contractYears: contract.contractYears,
      injury: { type: 'Healthy', gamesRemaining: 0 },
      status: 'Active',
      overallRating: carriedOverall,
      potential: Math.max(carriedOverall, carriedPotential),
      awards: mergeNormalizedPlayerAwards(existingMatch?.awards, normalizePlayerAwardRows(bio.awards, seasonEndYear)),
      transactions: existingMatch?.transactions ?? [],
      imgURL: resolvePersistentPlayerImage({
        imgURL: fullRosterPlayer?.imgURL ?? existingMatch?.imgURL ?? reusedPortrait,
        srID: slug,
        slug,
        name: existingMatch?.name ?? bio.name ?? slug,
        status: 'Active',
      }),
      srID: slug,
      slug,
    } as NBAPlayer);
  }

  return draftedPlayers.sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
}

function availableYearsFromStats(stats: ZenStat[]): number[] {
  return Array.from(new Set(stats.map((stat) => stat.season - 1).filter((year) => Number.isFinite(year))))
    .sort((a, b) => a - b);
}

function normalizePlayerName(name?: string): string {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,'’]/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function addAwardOnce(awards: Array<{ season: number; type: string }> | undefined, award: { season: number; type: string }): Array<{ season: number; type: string }> {
  const next = [...(awards ?? [])];
  if (!next.some(existing => existing.season === award.season && existing.type === award.type)) {
    next.push(award);
  }
  return next;
}

export async function backfillHistoricalNbaCareerAwards(players: NBAPlayer[], teams: NBATeam[], seasonEndYear: number): Promise<NBAPlayer[]> {
  if (seasonEndYear <= 1947) return players;
  try {
    await fetchBRefSeasonData(seasonEndYear - 1);
  } catch (error) {
    console.warn('[ZenGM Historical] Failed to load pre-branch award history:', error);
    return players;
  }

  const awardsByName = new Map<string, Array<{ season: number; type: string }>>();
  const championTidBySeason = new Map<number, number>();
  const addPlayerAward = (name: string | undefined, season: number, type: string) => {
    const key = normalizePlayerName(name);
    if (!key) return;
    const list = awardsByName.get(key) ?? [];
    list.push({ season, type });
    awardsByName.set(key, list);
  };

  for (const season of getAllCachedSeasons().values()) {
    if (season.year >= seasonEndYear) continue;
    addPlayerAward(season.mvp?.name, season.year, 'Most Valuable Player');
    addPlayerAward(season.dpoy?.name, season.year, 'Defensive Player of the Year');
    addPlayerAward(season.smoy?.name, season.year, 'Sixth Man of the Year');
    addPlayerAward(season.mip?.name, season.year, 'Most Improved Player');
    addPlayerAward(season.roy?.name, season.year, 'Rookie of the Year');
    addPlayerAward(season.finalsMvp?.name, season.year, 'Finals MVP');
    for (const award of season.otherAwards ?? []) {
      if (/\b(coach|executive)\b/i.test(award.awardName)) continue;
      for (const recipient of award.recipients) {
        addPlayerAward(recipient.name, season.year, award.awardName);
      }
    }
    for (const team of season.allNBA ?? []) {
      for (const player of team.players) addPlayerAward(player.name, season.year, `All-NBA ${team.teamName}`);
    }
    for (const team of season.allDefensive ?? []) {
      for (const player of team.players) addPlayerAward(player.name, season.year, `All-Defensive ${team.teamName}`);
    }
    for (const team of season.allRookie ?? []) {
      for (const player of team.players) addPlayerAward(player.name, season.year, `All-Rookie ${team.teamName}`);
    }
    for (const player of season.allStars ?? []) {
      addPlayerAward(player.name, season.year, 'All-Star');
    }
    const champion = season.champion?.name ? matchTeamByWikiName(season.champion.name, teams) : undefined;
    if (champion) championTidBySeason.set(season.year, champion.id);
  }

  return players.map(player => {
    let awards = player.awards ?? [];
    for (const award of awardsByName.get(normalizePlayerName(player.name)) ?? []) {
      awards = addAwardOnce(awards, award);
    }
    for (const stat of player.stats ?? []) {
      const season = Number((stat as any).season ?? 0);
      if (!(stat as any).playoffs || (stat.gp ?? 0) <= 0) continue;
      if (championTidBySeason.get(season) !== stat.tid) continue;
      awards = addAwardOnce(awards, { season, type: 'Champion' });
    }
    return awards === player.awards ? player : { ...player, awards };
  });
}

function playerIdentityKey(player: Pick<NBAPlayer, 'name' | 'draft' | 'srID' | 'slug'>): string | null {
  const draftYear = Number(player.draft?.year ?? 0);
  if (!Number.isFinite(draftYear) || draftYear <= 0) return null;
  const id = player.slug || player.srID || normalizePlayerName(player.name);
  return id ? `${draftYear}|${id}` : null;
}

function playerDraftClassNameKey(player: Pick<NBAPlayer, 'name' | 'draft'>): string | null {
  const draftYear = Number(player.draft?.year ?? 0);
  if (!Number.isFinite(draftYear) || draftYear <= 0) return null;
  const normalizedName = normalizePlayerName(player.name);
  return normalizedName ? `${draftYear}|${normalizedName}` : null;
}

export async function buildZengmHistoricalYearZeroRetirees(
  startYear: number,
  teams: NBATeam[],
  existingPlayers: NBAPlayer[] = [],
): Promise<NBAPlayer[]> {
  const { data, stats } = await loadZenGmData();
  const statRows = stats.stats ?? [];
  const sourceCoverageThrough = statRows.reduce(
    (latest, row) => Math.max(latest, Number(row.season) || 0),
    startYear,
  );
  const tidByAbbrev = new Map(
    teams
      .map(team => [normalizeAbbrev(team.abbrev), team.id] as const)
      .filter((entry): entry is [string, number] => Boolean(entry[0])),
  );
  const existingKeys = new Set(existingPlayers.flatMap(player => [
    String(player.slug ?? player.srID ?? '').trim().toLowerCase(),
    normalizePlayerName(player.name),
  ]).filter(Boolean));
  return buildRecentSourceRetirees(
    groupBySlug(statRows),
    groupBySlug(data.ratings ?? []),
    data.bios,
    tidByAbbrev,
    startYear,
    startYear,
    sourceCoverageThrough,
  ).filter(player => !existingKeys.has(String(player.slug ?? player.srID ?? '').trim().toLowerCase())
    && !existingKeys.has(normalizePlayerName(player.name)));
}

export async function buildZengmHistoricalDraftProspects(
  startYear: number,
  existingPlayers: NBAPlayer[] = [],
): Promise<NBAPlayer[]> {
  const seasonEndYear = startYear + 1;
  const { data, stats } = await loadZenGmData();
  const ratingsBySlug = groupBySlug(data.ratings ?? []);
  const allStatsBySlug = groupBySlug(stats.stats ?? []);
  const activeSlugs = new Set(
    existingPlayers
      .map(player => player.slug || player.srID)
      .filter((slug): slug is string => Boolean(slug)),
  );
  const existingIdentityIndex = createCanonicalPlayerIdentityIndex(existingPlayers);

  await ensureFullRosterPlayerDataLoaded().catch(() => undefined);
  const baseProspects = mergeCommunityDraftProspects(
    buildDraftProspects(data.bios, ratingsBySlug, allStatsBySlug, activeSlugs, seasonEndYear),
    seasonEndYear,
  );

  const prospects = mergeRemovedHistoricalDraftProspects(
    baseProspects,
    existingPlayers,
    seasonEndYear,
    DRAFT_CLASS_HORIZON_YEARS,
  );
  return prospects
    .filter(prospect => !existingIdentityIndex.has(prospect));
}

export function buildCachedZengmHistoricalDraftProspects(
  startYear: number,
  existingPlayers: NBAPlayer[] = [],
): NBAPlayer[] {
  if (!zenGmLoadedData) return [];
  const seasonEndYear = startYear + 1;
  const ratingsBySlug = groupBySlug(zenGmLoadedData.data.ratings ?? []);
  const allStatsBySlug = groupBySlug(zenGmLoadedData.stats.stats ?? []);
  const activeSlugs = new Set(
    existingPlayers
      .map(player => player.slug || player.srID)
      .filter((slug): slug is string => Boolean(slug)),
  );
  const existingIdentityIndex = createCanonicalPlayerIdentityIndex(existingPlayers);

  const baseProspects = mergeCommunityDraftProspects(
    buildDraftProspects(zenGmLoadedData.data.bios, ratingsBySlug, allStatsBySlug, activeSlugs, seasonEndYear),
    seasonEndYear,
  );

  const prospects = mergeRemovedHistoricalDraftProspects(
    baseProspects,
    existingPlayers,
    seasonEndYear,
    DRAFT_CLASS_HORIZON_YEARS,
  );
  return prospects
    .filter(prospect => !existingIdentityIndex.has(prospect));
}

export async function buildZengmIncomingDraftedPlayers(
  startYear: number,
  teams: NBATeam[],
  existingPlayers: NBAPlayer[] = [],
): Promise<NBAPlayer[]> {
  const seasonEndYear = startYear + 1;
  const { data } = await loadZenGmData();
  const ratingsBySlug = groupBySlug(data.ratings ?? []);
  const activeSlugs = new Set(
    existingPlayers
      .map(player => player.slug || player.srID)
      .filter((slug): slug is string => Boolean(slug)),
  );
  const tidByAbbrev = new Map(
    teams.map(team => [normalizeAbbrev(team.abbrev), team.id] as const).filter((entry): entry is [string, number] => Boolean(entry[0])),
  );

  return buildIncomingDraftedPlayers(
    data.bios,
    ratingsBySlug,
    existingPlayers,
    activeSlugs,
    tidByAbbrev,
    startYear,
    seasonEndYear,
  );
}

export async function applyZengmHistoricalContracts(
  players: NBAPlayer[],
  startYear: number,
): Promise<NBAPlayer[]> {
  const seasonEndYear = startYear + 1;
  const { data } = await loadZenGmData();
  const salariesBySlug = groupBySlug(data.salaries ?? []);
  const salariesByName = groupSalaryRowsByBioName(salariesBySlug, data.bios);
  const biosByName = new Map<string, ZenBio>();
  for (const bio of Object.values(data.bios ?? {})) {
    const key = normalizePlayerName(bio.name);
    if (key && !biosByName.has(key)) biosByName.set(key, bio);
  }

  return players.map(player => {
    if (player.tid < 0 || player.status === 'Retired') return player;
    const slug = player.slug || player.srID;
    const playerBio = (slug ? data.bios?.[slug] : undefined)
      ?? biosByName.get(normalizePlayerName(player.name));
    const playerSalaries = (slug ? salariesBySlug.get(slug) : undefined)
      ?? salariesByName.get(normalizePlayerName(player.name));
    const salaryTeamRows = (player.stats ?? []).flatMap(stat => {
      if (stat.playoffs || stat.tid < 0) return [];
      const raw = stat as NBAGMStat & { abbrev?: string; teamAbbrev?: string };
      const teamAbbrev = normalizeAbbrev(raw.abbrev ?? raw.teamAbbrev);
      return [{ season: stat.season, tid: stat.tid, teamAbbrev }];
    });
    if (player.tid >= 0 && !salaryTeamRows.some(row => row.season === seasonEndYear)) {
      salaryTeamRows.push({ season: seasonEndYear, tid: player.tid, teamAbbrev: undefined });
    }
    const sourceSalaryRows = buildHistoricalSalaryRows(
      playerSalaries,
      seasonEndYear,
      playerBio,
      salaryTeamRows,
    );
    const historicalContract = buildHistoricalContract(playerSalaries, seasonEndYear, playerBio, Number(player.overallRating ?? 50));
    if (!historicalContract) {
      const rookieContractFallback = buildHistoricalRookieContractFallback({
        year: playerBio?.draftYear ?? player.draft?.year ?? 0,
        round: playerBio?.draftRound ?? player.draft?.round ?? 0,
        pick: playerBio?.draftPick ?? player.draft?.pick ?? 0,
      }, seasonEndYear, player);
      if (rookieContractFallback) {
        return {
          ...player,
          contract: rookieContractFallback.contract,
          contractYears: rookieContractFallback.contractYears,
          ...(sourceSalaryRows ? { salaries: sourceSalaryRows } : {}),
        } as NBAPlayer;
      }
      if (Number(player.contract?.amount ?? 0) > 0 && Number(player.contract?.exp ?? 0) >= seasonEndYear) {
        return sourceSalaryRows ? { ...player, salaries: sourceSalaryRows } as NBAPlayer : player;
      }
      const generatedContract = buildGeneratedHistoricalContract(startYear, seasonEndYear, player.overallRating ?? 55);
      return {
        ...player,
        contract: generatedContract.contract,
        contractYears: generatedContract.contractYears,
        ...(sourceSalaryRows ? { salaries: sourceSalaryRows } : {}),
      } as NBAPlayer;
    }
    return {
      ...player,
      contract: historicalContract.contract,
      ...(historicalContract.contractYears ? { contractYears: historicalContract.contractYears } : {}),
      ...(sourceSalaryRows ? { salaries: sourceSalaryRows } : {}),
      ...(historicalContract.twoWay ? { twoWay: true } : { twoWay: undefined }),
      ...(historicalContract.nonGuaranteed ? { nonGuaranteed: true } : { nonGuaranteed: false }),
    } as NBAPlayer;
  });
}

export async function buildZengmHistoricalRosterResult(
  startYear: number,
  branchStart: number | string | Date = startYear,
): Promise<RosterResult> {
  const seasonEndYear = startYear + 1;
  const { data, stats, teamData } = await loadZenGmData();
  await ensureFullRosterPlayerDataLoaded().catch(() => undefined);
  const statRows = stats.stats ?? [];
  const nativeTeamRows = data.teams ?? [];
  const latestNativeTeamSeason = nativeTeamRows.reduce(
    (latest, row) => Math.max(latest, Number(row.season) || 0),
    0,
  );
  const currentSeasonTeamRows = nativeTeamRows.filter(
    row => row.season === seasonEndYear && normalizeAbbrev(row.abbrev),
  );
  const currentSeasonStatRows = statRows.filter(
    row => row.season === seasonEndYear && !row.playoffs && normalizeAbbrev(row.abbrev),
  );
  const currentSeasonRows = seasonEndYear === latestNativeTeamSeason && currentSeasonTeamRows.length > 0
    ? currentSeasonTeamRows
    : currentSeasonStatRows.length > 0
      ? currentSeasonStatRows
      : currentSeasonTeamRows;
  const fallbackSeason = currentSeasonRows.length === 0
    ? [...new Set(
        statRows
          .filter((row) => !row.playoffs && normalizeAbbrev(row.abbrev) && row.season < seasonEndYear)
          .map((row) => row.season)
          .filter((season): season is number => Number.isFinite(season)),
      )].sort((a, b) => b - a)[0]
    : undefined;
  const baseRosterSeasonRows = currentSeasonRows.length > 0
    ? currentSeasonRows
    : statRows.filter((row) => row.season === fallbackSeason && !row.playoffs && normalizeAbbrev(row.abbrev));
  const ratingsBySlug = groupBySlug(data.ratings ?? []);
  const rosterContinuity = resolveCurrentRosterContinuity(
    baseRosterSeasonRows,
    nativeTeamRows,
    ratingsBySlug,
    data.bios,
    startYear,
    branchStart,
    seasonEndYear,
    latestNativeTeamSeason,
  );
  const rosterSeasonRows = rosterContinuity.activeRows;
  const activeAbbrevs = Array.from(new Set(rosterSeasonRows.map((row) => normalizeAbbrev(row.abbrev)).filter(Boolean))) as string[];

  if (!activeAbbrevs.length) {
    return {
      players: [],
      teams: [],
      draftPicks: [],
      teamNameMap: new Map(),
      availableYears: availableYearsFromStats([...statRows, ...nativeTeamRows]),
      supported: false,
    };
  }

  const { teams, tidByAbbrev, teamNameMap } = buildTeams(
    activeAbbrevs,
    data.teamSeasons,
    teamData,
    startYear,
    seasonEndYear,
    data.retiredJerseyNumbers,
    data.bios,
  );
  const salariesBySlug = groupBySlug(data.salaries ?? []);
  const activeStatsBySlug = groupBySlug(rosterSeasonRows);
  const allStatsBySlug = groupBySlug(statRows);
  const players = buildPlayers(
    activeStatsBySlug,
    allStatsBySlug,
    ratingsBySlug,
    salariesBySlug,
    data.bios,
    tidByAbbrev,
    startYear,
    branchStart,
    seasonEndYear,
  ).map(player => {
    const slug = String(player.slug ?? player.srID ?? '');
    if (!rosterContinuity.continuitySlugs.has(slug)) return player;
    const continuityPlayer = {
      ...player,
      internalId: `zengm-continuity-${slug}`,
    };
    return rosterContinuity.freeAgentSlugs.has(slug)
      ? {
          ...continuityPlayer,
          tid: -1,
          status: 'Free Agent' as const,
          jerseyNumber: undefined,
        }
      : continuityPlayer;
  });
  const sourceCoverageThrough = statRows.reduce(
    (latest, row) => Math.max(latest, Number(row.season) || 0),
    startYear,
  );
  const recentSourceRetirees = buildRecentSourceRetirees(
    allStatsBySlug,
    ratingsBySlug,
    data.bios,
    tidByAbbrev,
    startYear,
    branchStart,
    sourceCoverageThrough,
  );
  const incomingDraftedPlayers = currentSeasonRows.length === 0
    ? buildIncomingDraftedPlayers(
        data.bios,
        ratingsBySlug,
        players,
        new Set(players.map(player => player.slug || player.srID).filter((slug): slug is string => Boolean(slug))),
        tidByAbbrev,
        startYear,
        seasonEndYear,
      )
    : [];
  const playersWithIncomingDraftClass = [...players, ...incomingDraftedPlayers, ...recentSourceRetirees];
  const playersWithCareerAwards = await backfillHistoricalNbaCareerAwards(playersWithIncomingDraftClass, teams, seasonEndYear);
  const draftProspects = await buildZengmHistoricalDraftProspects(startYear, playersWithCareerAwards);

  for (const team of teams) {
    team.strength = calculateTeamStrength(team.id, playersWithCareerAwards);
  }

  return {
    players: [...playersWithCareerAwards, ...draftProspects],
    teams,
    draftPicks: [],
    teamNameMap,
      availableYears: availableYearsFromStats([...statRows, ...nativeTeamRows]),
    supported: true,
  };
}
