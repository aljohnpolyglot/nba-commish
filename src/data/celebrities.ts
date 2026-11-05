import {
  fetchCelebrityDecadeEntries,
  fetchCelebrityDecadePool,
  type CelebrityDecadePoolEntry, type CelebrityDecadePoolSource,
} from './celebrityDecadePools';
import type { CelebrityRosterProfile } from '../types/offseason';
import type { NBAPlayer } from '../types';
import { isOnRoster } from '../utils/teamLookup';

const CELEBRITIES_GIST_URL = 
  'https://gist.githubusercontent.com/aljohnpolyglot/76b81ccb530160eb06d1e61949902c06/raw/4ae135d31e45d47cb8afb6e5f1b2a38ffb111241/celebrities_nba';
const HISTORICAL_CELEBRITIES_URL =
  'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/nbacelebgamehistory';
const CELEBRITY_IMAGE_FOLLOWUP_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/celeebrity-images-followup';

export interface RatedCelebrity extends CelebrityRosterProfile {}

const playerAsCelebrity = (player: NBAPlayer, type: string): RatedCelebrity => {
  const rating = player.ratings?.[player.ratings.length - 1] ?? {};
  const value = (key: string, fallback = 45) => Math.max(10, Math.min(95, Number(rating[key] ?? fallback)));
  return {
    name: player.name,
    type,
    imgUrl: player.imgURL,
    hgt: value('hgt', player.hgt ?? 50), stre: value('stre'), spd: value('spd'), jmp: value('jmp'), endu: value('endu'),
    ins: value('ins'), dnk: value('dnk'), ft: value('ft'), fg: value('fg'), tp: value('tp'),
    diq: value('diq'), oiq: value('oiq'), drb: value('drb'), pss: value('pss'), reb: value('reb'),
  };
};

export const addOccasionalBasketballGuests = (
  base: RatedCelebrity[], players: NBAPlayer[], year: number, fictional: boolean,
): RatedCelebrity[] => {
  const aliveAndAdult = (player: NBAPlayer) => !(player as any).diedYear && (player.born?.year ?? year - 18) <= year - 18;
  const guests: RatedCelebrity[] = [];
  if (!fictional && Math.random() < 0.35) {
    const wnba = players.filter(player => player.status === 'WNBA' && aliveAndAdult(player));
    if (wnba.length) guests.push(playerAsCelebrity(wnba[Math.floor(Math.random() * wnba.length)], 'WNBA player'));
  }
  if (Math.random() < 0.25) {
    const retired = players.filter(player =>
      aliveAndAdult(player)
      && (player.status === 'Retired' || (!!player.retiredYear && player.retiredYear <= year))
      && (fictional || player.gender !== 'female'),
    );
    if (retired.length) guests.push(playerAsCelebrity(retired[Math.floor(Math.random() * retired.length)], 'Basketball legend'));
  }
  const guestNames = new Set(guests.map(guest => normalizeNameKey(guest.name)));
  return [...base.filter(person => !guestNames.has(normalizeNameKey(person.name))).slice(0, Math.max(0, 20 - guests.length)), ...guests];
};

interface HistoricalCelebrityParticipant {
  name?: string;
  occupation?: string;
  decade?: string;
  imgUrl?: string;
  wikipediaUrl?: string;
  wikiUrl?: string;
  years_joined?: number[] | string | number;
  ratings?: Partial<Record<keyof Omit<RatedCelebrity, 'name' | 'type'>, number>>;
}

export interface CelebrityTeamExtraField {
  label: string;
  value: string;
}

export interface CelebrityTeamDetails {
  name: string;
  roster: string[];
  headCoach?: string;
  assistantCoaches?: string[];
  generalManager?: string;
  captains?: string[];
  extra?: CelebrityTeamExtraField[];
}

export interface CelebrityGameDetails {
  location?: string;
  halftimePerformance?: string;
}

interface HistoricalCelebrityTeam {
  team_name?: string;
  name?: string;
  head_coach?: string;
  assistant_coaches?: string[] | string;
  general_manager?: string;
  captain?: string;
  captains?: string[] | string;
  roster?: HistoricalCelebrityParticipant[];
  [key: string]: unknown;
}

export interface HistoricalCelebrityGame {
  year?: number;
  location?: string;
  halftime_performance?: string;
  teams?: HistoricalCelebrityTeam[];
  [key: string]: unknown;
}

export interface CelebrityGameRosterSelection {
  roster: string[];
  teamNames: string[];
  teamDetails?: CelebrityTeamDetails[];
  gameDetails?: CelebrityGameDetails;
}

export const filterActiveNbaPlayersFromCelebritySelection = (
  selection: CelebrityGameRosterSelection | null,
  players: NBAPlayer[],
): CelebrityGameRosterSelection | null => {
  if (!selection) return null;
  const activeNames = new Set(players
    .filter(player => player.tid >= 0 && player.tid < 100 && isOnRoster(player))
    .map(player => normalizeNameKey(player.name)));
  const eligibleName = (name: string) => !activeNames.has(normalizeNameKey(name));
  const teamDetails = selection.teamDetails?.map(team => ({
    ...team,
    roster: team.roster.filter(eligibleName),
  }));
  if (teamDetails?.some(team => team.roster.length === 0)) return null;
  return {
    ...selection,
    roster: selection.roster.filter(eligibleName),
    teamDetails,
  };
};

const DEFAULT_CELEBRITY_RATINGS: Omit<RatedCelebrity, 'name' | 'type'> = {
  hgt: 45,
  stre: 35,
  spd: 35,
  jmp: 35,
  endu: 40,
  ins: 30,
  dnk: 20,
  ft: 35,
  fg: 30,
  tp: 25,
  diq: 30,
  oiq: 30,
  drb: 25,
  pss: 30,
  reb: 25,
};

let cachedCelebrities: RatedCelebrity[] | null = null;
let cachedCelebritiesPromise: Promise<RatedCelebrity[]> | null = null;
let cachedBaseCelebrities: RatedCelebrity[] | null = null;
let cachedBaseCelebritiesPromise: Promise<RatedCelebrity[]> | null = null;
let cachedHistoricalCelebrityGames: HistoricalCelebrityGame[] | null = null;
let cachedHistoricalCelebrityGamesPromise: Promise<HistoricalCelebrityGame[]> | null = null;
let cachedCelebrityImages: Map<string, string> | null = null;
let cachedCelebrityImagesPromise: Promise<Map<string, string>> | null = null;

const toNumber = (value: unknown, fallback: number): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalizeYearsJoined = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return value.map(year => Number(year)).filter(Number.isFinite);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return [value];
  }
  if (typeof value === 'string') {
    return value
      .split(/[,\s]+/)
      .map(part => Number(part.trim()))
      .filter(Number.isFinite);
  }
  return [];
};

const participantMatchesYear = (
  participant: HistoricalCelebrityParticipant,
  year: number,
): boolean => {
  const years = normalizeYearsJoined(participant.years_joined);
  return years.length === 0 || years.includes(year);
};

const normalizeNameKey = (name: string): string => name.trim().toLowerCase();
export const normalizeCelebrityImageNameKey = (name: string): string => name.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]/gi, '').toLowerCase();

const fetchCelebrityImages = async (): Promise<Map<string, string>> => {
  if (cachedCelebrityImages) return cachedCelebrityImages;
  if (cachedCelebrityImagesPromise) return cachedCelebrityImagesPromise;
  cachedCelebrityImagesPromise = (async () => {
    try {
      const response = await fetch(CELEBRITY_IMAGE_FOLLOWUP_URL);
      if (!response.ok) throw new Error(`Celebrity image follow-up returned ${response.status}`);
      const payload: unknown = await response.json();
      const images = new Map<string, string>();
      if (Array.isArray(payload)) {
        for (const row of payload) {
          if (!row || typeof row !== 'object') continue;
          const entry = row as { name?: unknown; imageUrl?: unknown };
          if (typeof entry.name !== 'string' || typeof entry.imageUrl !== 'string' || !entry.imageUrl.trim()) continue;
          images.set(normalizeCelebrityImageNameKey(entry.name), entry.imageUrl.trim());
        }
      }
      cachedCelebrityImages = images;
    } catch (error) {
      console.warn('Failed to fetch celebrity image follow-up; continuing without remote images.', error);
      cachedCelebrityImages = new Map();
    }
    return cachedCelebrityImages ?? new Map<string, string>();
  })();
  return cachedCelebrityImagesPromise;
};

export const attachCelebrityImages = (
  celebrities: RatedCelebrity[],
  images: Map<string, string>,
): RatedCelebrity[] => celebrities.map(celebrity => celebrity.imgUrl
  ? celebrity
  : { ...celebrity, imgUrl: images.get(normalizeCelebrityImageNameKey(celebrity.name)) });
export const toRatedCelebrity = (
  participant: HistoricalCelebrityParticipant,
): RatedCelebrity | null => {
  const name = participant.name?.trim();
  if (!name) return null;

  const ratings = participant.ratings || {};
  return {
    name,
    type: participant.occupation?.trim() || 'celebrity',
    imgUrl: participant.imgUrl?.trim() || undefined,
    wikipediaUrl: participant.wikipediaUrl?.trim() || participant.wikiUrl?.trim() || undefined,
    sourceDecade: participant.decade?.trim() || undefined,
    hgt: toNumber(ratings.hgt, DEFAULT_CELEBRITY_RATINGS.hgt),
    stre: toNumber(ratings.stre, DEFAULT_CELEBRITY_RATINGS.stre),
    spd: toNumber(ratings.spd, DEFAULT_CELEBRITY_RATINGS.spd),
    jmp: toNumber(ratings.jmp, DEFAULT_CELEBRITY_RATINGS.jmp),
    endu: toNumber(ratings.endu, DEFAULT_CELEBRITY_RATINGS.endu),
    ins: toNumber(ratings.ins, DEFAULT_CELEBRITY_RATINGS.ins),
    dnk: toNumber(ratings.dnk, DEFAULT_CELEBRITY_RATINGS.dnk),
    ft: toNumber(ratings.ft, DEFAULT_CELEBRITY_RATINGS.ft),
    fg: toNumber(ratings.fg, DEFAULT_CELEBRITY_RATINGS.fg),
    tp: toNumber(ratings.tp, DEFAULT_CELEBRITY_RATINGS.tp),
    diq: toNumber(ratings.diq, DEFAULT_CELEBRITY_RATINGS.diq),
    oiq: toNumber(ratings.oiq, DEFAULT_CELEBRITY_RATINGS.oiq),
    drb: toNumber(ratings.drb, DEFAULT_CELEBRITY_RATINGS.drb),
    pss: toNumber(ratings.pss, DEFAULT_CELEBRITY_RATINGS.pss),
    reb: toNumber(ratings.reb, DEFAULT_CELEBRITY_RATINGS.reb),
  };
};

export const readHistoricalCelebrityGames = (data: unknown): HistoricalCelebrityGame[] => {
  if (Array.isArray(data)) return data as HistoricalCelebrityGame[];
  if (data && typeof data === 'object') {
    const maybeGames = (data as { all_star_celebrity_games?: unknown }).all_star_celebrity_games;
    if (Array.isArray(maybeGames)) return maybeGames as HistoricalCelebrityGame[];
  }
  return [];
};

const parseHistoricalCelebrityPayload = async (response: Response): Promise<unknown> => {
  const maybeText = typeof response.text === 'function'
    ? await response.text()
    : JSON.stringify(await response.json());
  try {
    return JSON.parse(maybeText);
  } catch {
    const repaired = maybeText.replace(
      /"([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(-?\d+(?:\.\d+)?)(?=[,}])/g,
      '"$1":$2',
    );
    return JSON.parse(repaired);
  }
};

const fetchBaseRatedCelebrities = async (): Promise<RatedCelebrity[]> => {
  if (cachedBaseCelebrities) return cachedBaseCelebrities;
  if (cachedBaseCelebritiesPromise) return cachedBaseCelebritiesPromise;
  cachedBaseCelebritiesPromise = (async () => {
    try {
      const response = await fetch(CELEBRITIES_GIST_URL);
      const data = await response.json();
      cachedBaseCelebrities = Array.isArray(data) ? data : [];
      return cachedBaseCelebrities;
    } catch (e) {
      console.warn('Failed to fetch celebrity ratings; using the local roster fallback.', e);
      cachedBaseCelebrities = [];
      return cachedBaseCelebrities;
    } finally {
      cachedBaseCelebritiesPromise = null;
    }
  })();
  return cachedBaseCelebritiesPromise;
};

export const fetchHistoricalCelebrityGames = async (): Promise<HistoricalCelebrityGame[]> => {
  if (cachedHistoricalCelebrityGames) return cachedHistoricalCelebrityGames;
  if (cachedHistoricalCelebrityGamesPromise) return cachedHistoricalCelebrityGamesPromise;

  cachedHistoricalCelebrityGamesPromise = (async () => {
    try {
      const response = await fetch(HISTORICAL_CELEBRITIES_URL);
      const data = await parseHistoricalCelebrityPayload(response);
      cachedHistoricalCelebrityGames = readHistoricalCelebrityGames(data);
      return cachedHistoricalCelebrityGames;
    } catch (e) {
      console.warn('Failed to fetch historical celebrity games; using the local roster fallback.', e);
      cachedHistoricalCelebrityGames = [];
      return [];
    } finally {
      cachedHistoricalCelebrityGamesPromise = null;
    }
  })();

  return cachedHistoricalCelebrityGamesPromise;
};

const getHistoricalRatedCelebrities = (
  games: HistoricalCelebrityGame[],
): RatedCelebrity[] => {
  const seen = new Set<string>();
  const rated: RatedCelebrity[] = [];
  for (const game of games) {
    for (const team of game.teams || []) {
      for (const participant of team.roster || []) {
        const celebrity = toRatedCelebrity(participant);
        if (!celebrity) continue;
        const key = normalizeNameKey(celebrity.name);
        if (seen.has(key)) continue;
        seen.add(key);
        rated.push(celebrity);
      }
    }
  }
  return rated;
};

export const getHistoricalRatedCelebritiesForYear = (
  games: HistoricalCelebrityGame[],
  year: number,
): RatedCelebrity[] => {
  const game = getGameForYear(games, year);
  return game ? getHistoricalRatedCelebrities([game]) : [];
};

export const getDecadeRatedCelebrities = (
  entries: CelebrityDecadePoolEntry[],
): RatedCelebrity[] =>
  entries
    .map(entry => toRatedCelebrity(entry))
    .filter((entry): entry is RatedCelebrity => entry !== null);

const mergeRatedCelebrities = (
  base: RatedCelebrity[],
  historical: RatedCelebrity[],
): RatedCelebrity[] => {
  const merged = new Map<string, RatedCelebrity>();
  for (const celebrity of base) {
    if (celebrity.name) merged.set(normalizeNameKey(celebrity.name), celebrity);
  }
  for (const celebrity of historical) {
    if (celebrity.name) merged.set(normalizeNameKey(celebrity.name), celebrity);
  }
  return [...merged.values()];
};

export const mergeRatedCelebritiesByPriority = (
  ...sources: RatedCelebrity[][]
): RatedCelebrity[] => {
  const merged = new Map<string, RatedCelebrity>();
  for (const source of sources) {
    for (const celebrity of source) {
      if (!celebrity.name) continue;
      const key = normalizeNameKey(celebrity.name);
      if (!merged.has(key)) merged.set(key, celebrity);
    }
  }
  return [...merged.values()];
};

export const fetchRatedCelebrities =
  async (): Promise<RatedCelebrity[]> => {
  if (cachedCelebrities) return cachedCelebrities;
  if (cachedCelebritiesPromise) return cachedCelebritiesPromise;

  cachedCelebritiesPromise = (async () => {
    try {
      const [baseCelebrities, historicalGames, decadeEntries, images] = await Promise.all([
        fetchBaseRatedCelebrities(),
        fetchHistoricalCelebrityGames(),
        fetchCelebrityDecadeEntries(),
        fetchCelebrityImages(),
      ]);
      cachedCelebrities = attachCelebrityImages(mergeRatedCelebrities(
        mergeRatedCelebrities(
          baseCelebrities,
          getDecadeRatedCelebrities(decadeEntries),
        ),
        getHistoricalRatedCelebrities(historicalGames),
      ), images);
      return cachedCelebrities;
    } finally {
      cachedCelebritiesPromise = null;
    }
  })();

  return cachedCelebritiesPromise;
};

export const fetchRatedCelebritiesForYear = async (
  year: number, poolSource: CelebrityDecadePoolSource = 'real',
): Promise<RatedCelebrity[]> => {
  if (poolSource === 'fictional') return getDecadeRatedCelebrities(await fetchCelebrityDecadePool(year, poolSource));

  const [baseCelebrities, historicalGames, decadeEntries, images] = await Promise.all([
    fetchBaseRatedCelebrities(),
    fetchHistoricalCelebrityGames(),
    fetchCelebrityDecadePool(year, poolSource),
    fetchCelebrityImages(),
  ]);
  const decadePool = getDecadeRatedCelebrities(decadeEntries);
  const historical = getHistoricalRatedCelebritiesForYear(historicalGames, year);
  if (year >= 2020) {
    return attachCelebrityImages(
      mergeRatedCelebritiesByPriority(historical, decadePool, baseCelebrities),
      images,
    );
  }
  if (decadePool.length === 0 && historical.length === 0) {
    return attachCelebrityImages(baseCelebrities, images);
  }
  return attachCelebrityImages(mergeRatedCelebritiesByPriority(historical, decadePool), images);
};

const getGameForYear = (
  games: HistoricalCelebrityGame[],
  year: number,
): HistoricalCelebrityGame | null =>
  games.find(game => Number(game.year) === year) || null;

const getStrings = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }
  return [];
};

const prettifyKey = (key: string): string =>
  key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());

const getRosterNames = (
  participants: HistoricalCelebrityParticipant[],
  used: Set<string>,
): string[] => {
  const names: string[] = [];
  const addName = (name?: string): void => {
    const trimmed = name?.trim();
    if (!trimmed) return;
    const key = normalizeNameKey(trimmed);
    if (used.has(key)) return;
    used.add(key);
    names.push(trimmed);
  };

  for (const participant of participants) addName(participant.name);
  return names;
};

const getHistoricalTeamDetails = (
  sourceTeam: HistoricalCelebrityTeam,
  year: number,
  used: Set<string>,
): CelebrityTeamDetails => {
  const exactYearRoster = (sourceTeam.roster || [])
    .filter(participant => participantMatchesYear(participant, year));
  const rosterSource = exactYearRoster.length > 0 ? exactYearRoster : sourceTeam.roster || [];
  const knownKeys = new Set([
    'team_name',
    'name',
    'head_coach',
    'assistant_coaches',
    'general_manager',
    'captain',
    'captains',
    'roster',
  ]);
  const extra = Object.entries(sourceTeam)
    .filter(([key, value]) => !knownKeys.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => ({
      label: prettifyKey(key),
      value: Array.isArray(value) ? value.join(', ') : String(value),
    }))
    .filter(field => field.value.trim());

  return {
    name: sourceTeam.team_name?.trim() || sourceTeam.name?.trim() || 'Celebrity Team',
    roster: getRosterNames(rosterSource, used),
    headCoach: sourceTeam.head_coach?.trim(),
    assistantCoaches: getStrings(sourceTeam.assistant_coaches),
    generalManager: sourceTeam.general_manager?.trim(),
    captains: [
      ...getStrings(sourceTeam.captains),
      ...getStrings(sourceTeam.captain),
    ],
    extra,
  };
};

export const fetchHistoricalCelebritySelection = async (
  year: number,
): Promise<CelebrityGameRosterSelection | null> => {
  const games = await fetchHistoricalCelebrityGames();
  const game = getGameForYear(games, year);
  const sourceTeams = game?.teams?.slice(0, 2) || [];
  if (sourceTeams.length < 2) return null;

  const used = new Set<string>();
  const teamDetails = sourceTeams.map(team => getHistoricalTeamDetails(team, year, used));
  if (teamDetails.some(team => team.roster.length === 0)) return null;

  return {
    roster: teamDetails.flatMap(team => team.roster),
    teamNames: teamDetails.map(team => team.name),
    teamDetails,
    gameDetails: {
      location: game?.location?.trim(),
      halftimePerformance: game?.halftime_performance?.trim(),
    },
  };
};

export const getRatedCelebrityNames = () => 
  cachedCelebrities ?? [];
