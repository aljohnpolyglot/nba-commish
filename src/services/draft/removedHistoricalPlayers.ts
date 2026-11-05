import type { NBAPlayer } from '../../types';
import { BUNDLED_REMOVED_PLAYERS_URL } from '../../data/historicalNbaRosterSources';
import { normalizeHistoricalEndesaPlayerName } from '../historicalEndesa/identity';
import { estimatePotentialBbgm, calculateOverallFromRating } from '../../utils/playerRatings';
import { resolvePersistentPlayerImage } from '../../utils/playerImage';
import { readJsonResponse } from '../utils/jsonResponse';
import { discountHistoricalProspectRating } from './historicalProspectRating';
import { getHistoricalProspectSourceClub } from '../../data/historicalProspectClubSources';

type RemovedRating = Record<string, number | string | undefined> & { season?: number };

type RemovedPlayer = {
  name?: string;
  firstName?: string;
  lastName?: string;
  srID?: string;
  pos?: string;
  hgt?: number;
  weight?: number;
  born?: { year?: number; loc?: string };
  college?: string;
  imgURL?: string;
  ratings?: RemovedRating[];
  draft?: { year?: number; round?: number; pick?: number; tid?: number; originalTid?: number };
};

type RemovedPlayersFile = { players?: RemovedPlayer[] };

type NativeBio = {
  name?: string;
  bornYear?: number;
  draftYear?: number;
};

type NativeRating = RemovedRating & { slug: string; season: number };

let removedPlayersPromise: Promise<RemovedPlayer[]> | null = null;
let removedPlayersCache: RemovedPlayer[] | null = null;

const sourceName = (player: RemovedPlayer): string =>
  String(player.name ?? `${player.firstName ?? ''} ${player.lastName ?? ''}`).replace(/\s+/g, ' ').trim();

const validYear = (value: unknown): number | null => {
  const year = Number(value);
  return Number.isFinite(year) && year > 0 ? year : null;
};

const birthYearsMatch = (left?: number, right?: number): boolean => {
  const a = validYear(left);
  const b = validYear(right);
  return a === null || b === null || Math.abs(a - b) <= 1;
};

const draftYearsMatch = (left?: number, right?: number): boolean => {
  const a = validYear(left);
  const b = validYear(right);
  return a === null || b === null || a === b;
};

const identityMetadataMatches = (
  sourceBirthYear?: number,
  otherBirthYear?: number,
  sourceDraftYear?: number,
  otherDraftYear?: number,
): boolean => {
  const sourceBirth = validYear(sourceBirthYear);
  const otherBirth = validYear(otherBirthYear);
  return sourceBirth !== null && otherBirth !== null
    ? birthYearsMatch(sourceBirth, otherBirth)
    : draftYearsMatch(sourceDraftYear, otherDraftYear);
};

const sourceMatchesPlayer = (source: RemovedPlayer, player: NBAPlayer): boolean =>
  normalizeHistoricalEndesaPlayerName(sourceName(source)) === normalizeHistoricalEndesaPlayerName(player.name)
  && identityMetadataMatches(
    source.born?.year,
    player.born?.year,
    source.draft?.year,
    player.draft?.year,
  );

const sourceMatchesBio = (source: RemovedPlayer, bio: NativeBio): boolean =>
  normalizeHistoricalEndesaPlayerName(sourceName(source)) === normalizeHistoricalEndesaPlayerName(String(bio.name ?? ''))
  && identityMetadataMatches(source.born?.year, bio.bornYear, source.draft?.year, bio.draftYear);

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const positionGroup = (pos?: string): 'guard' | 'wing' | 'big' => {
  const value = String(pos ?? '').toUpperCase();
  if (value.includes('C') || value === 'PF') return 'big';
  if (value.includes('PG') || value.includes('SG') || value === 'G') return 'guard';
  return 'wing';
};

const sanitizeRating = (rating: RemovedRating, season: number) => ({
  season,
  hgt: Number(rating.hgt ?? 50),
  stre: Number(rating.stre ?? 45),
  spd: Number(rating.spd ?? 45),
  jmp: Number(rating.jmp ?? 45),
  endu: Number(rating.endu ?? 45),
  ins: Number(rating.ins ?? 40),
  dnk: Number(rating.dnk ?? 40),
  ft: Number(rating.ft ?? 45),
  fg: Number(rating.fg ?? 45),
  tp: Number(rating.tp ?? 35),
  diq: Number(rating.diq ?? 40),
  oiq: Number(rating.oiq ?? 40),
  drb: Number(rating.drb ?? 40),
  pss: Number(rating.pss ?? 40),
  reb: Number(rating.reb ?? 40),
  fuzz: Number(rating.fuzz ?? 0),
});

const draftTimeRating = (player: RemovedPlayer, draftYear: number) => {
  const dated = (player.ratings ?? [])
    .map(rating => ({ rating, season: validYear(rating.season) }))
    .filter((row): row is { rating: RemovedRating; season: number } => row.season !== null)
    .filter(row => row.season <= draftYear + 1)
    .sort((left, right) => left.season - right.season);
  const nearDraft = dated.find(row => row.season >= draftYear) ?? dated[dated.length - 1];
  return nearDraft ? sanitizeRating(nearDraft.rating, nearDraft.season) : null;
};

const peerRating = (source: RemovedPlayer, draftYear: number, prospects: NBAPlayer[]) => {
  const sameClass = prospects.filter(player =>
    Number(player.draft?.year) === draftYear
    && player.ratings?.length > 0,
  );
  const samePosition = sameClass.filter(player => positionGroup(player.pos) === positionGroup(source.pos));
  const pool = samePosition.length > 0 ? samePosition : sameClass;
  if (pool.length === 0) return sanitizeRating({}, draftYear);
  const peer = pool[hashString(`${sourceName(source)}|${draftYear}`) % pool.length];
  const rating = peer.ratings[peer.ratings.length - 1] ?? {};
  return sanitizeRating(rating, draftYear);
};

const buildProspect = (
  source: RemovedPlayer,
  seasonEndYear: number,
  nativeProspects: NBAPlayer[],
): NBAPlayer | null => {
  const name = sourceName(source);
  const draftYear = validYear(source.draft?.year);
  if (!name || draftYear === null) return null;
  const bornYear = validYear(source.born?.year) ?? draftYear - 20;
  const age = Math.max(16, seasonEndYear - bornYear);
  const datedRating = draftTimeRating(source, draftYear);
  const fallbackRating = source.ratings?.[0];
  const baseRating = datedRating ?? discountHistoricalProspectRating(
    fallbackRating ? sanitizeRating(fallbackRating, draftYear) : peerRating(source, draftYear, nativeProspects),
    draftYear,
  );
  const overallRating = calculateOverallFromRating(baseRating);
  const potential = Math.max(overallRating, estimatePotentialBbgm(overallRating, age));
  const identity = normalizeHistoricalEndesaPlayerName(name).replace(/\s+/g, '-');

  return {
    internalId: `removed-draft-${draftYear}-${identity}`,
    preDraftClub: getHistoricalProspectSourceClub(`removed-draft-${draftYear}-${identity}`, bornYear, seasonEndYear - 1),
    tid: -2,
    name,
    pos: source.pos ?? 'G',
    age,
    hgt: source.hgt ?? 78,
    weight: source.weight ?? 210,
    born: { year: bornYear, loc: source.born?.loc ?? '' },
    college: source.college,
    draft: { year: draftYear, eligibleYear: draftYear, declaredYear: draftYear, leagueId: 'nba', round: 0, pick: 0, tid: -1, originalTid: -1 },
    ratings: [{ ...baseRating, pot: potential }],
    stats: [],
    contract: { amount: 0, exp: draftYear },
    injury: { type: 'Healthy', gamesRemaining: 0 },
    status: 'Draft Prospect',
    historicalDraftProspectSource: 'removed-player',
    overallRating,
    potential,
    awards: [],
    transactions: [],
    imgURL: resolvePersistentPlayerImage({
      imgURL: source.imgURL,
      srID: source.srID,
      name,
      status: 'Draft Prospect',
    }),
    srID: source.srID,
  } as NBAPlayer;
};

export async function ensureRemovedHistoricalPlayersLoaded(): Promise<RemovedPlayer[]> {
  if (removedPlayersCache) return removedPlayersCache;
  if (!removedPlayersPromise) {
    removedPlayersPromise = fetch(BUNDLED_REMOVED_PLAYERS_URL)
      .then(response => readJsonResponse<RemovedPlayersFile>(response, 'Removed historical NBA players'))
      .then(data => {
        removedPlayersCache = data.players ?? [];
        return removedPlayersCache;
      })
      .finally(() => {
        removedPlayersPromise = null;
      });
  }
  return removedPlayersPromise;
}

export function mergeRemovedSeasonalRatings(
  bios: Record<string, NativeBio> | undefined,
  ratings: NativeRating[] = [],
): NativeRating[] {
  if (!removedPlayersCache || !bios) return ratings;
  const biosByName = new Map<string, Array<{ slug: string; bio: NativeBio }>>();
  for (const [slug, bio] of Object.entries(bios)) {
    const key = normalizeHistoricalEndesaPlayerName(String(bio.name ?? ''));
    biosByName.set(key, [...(biosByName.get(key) ?? []), { slug, bio }]);
  }
  const existing = new Set(ratings.map(rating => `${rating.slug}|${rating.season}`));
  const additions: NativeRating[] = [];
  for (const source of removedPlayersCache) {
    const candidates = biosByName.get(normalizeHistoricalEndesaPlayerName(sourceName(source))) ?? [];
    const matches = candidates.filter(candidate => sourceMatchesBio(source, candidate.bio));
    if (matches.length !== 1) continue;
    for (const rating of source.ratings ?? []) {
      const season = validYear(rating.season);
      if (season === null) continue;
      const key = `${matches[0].slug}|${season}`;
      if (existing.has(key)) continue;
      existing.add(key);
      additions.push({ ...sanitizeRating(rating, season), slug: matches[0].slug });
    }
  }
  return additions.length > 0 ? [...ratings, ...additions] : ratings;
}

export function mergeRemovedHistoricalDraftProspects(
  nativeProspects: NBAPlayer[],
  existingPlayers: NBAPlayer[],
  seasonEndYear: number,
  horizonYears: number,
): NBAPlayer[] {
  if (!removedPlayersCache) return nativeProspects;
  const maxDraftYear = seasonEndYear + horizonYears - 1;
  const merged = nativeProspects.filter(prospect => {
    const source = removedPlayersCache?.find(candidate => sourceMatchesPlayer(candidate, prospect));
    const sourceDraftYear = validYear(source?.draft?.year);
    return sourceDraftYear === null || sourceDraftYear === Number(prospect.draft?.year ?? 0);
  });
  for (const source of removedPlayersCache) {
    const draftYear = validYear(source.draft?.year);
    if (draftYear === null || draftYear < seasonEndYear || draftYear > maxDraftYear) continue;
    if (merged.some(player => sourceMatchesPlayer(source, player))) continue;
    if (existingPlayers.some(player => sourceMatchesPlayer(source, player))) continue;
    const prospect = buildProspect(source, seasonEndYear, merged);
    if (prospect) merged.push(prospect);
  }
  return merged.sort((left, right) =>
    Number(left.draft?.year ?? 0) - Number(right.draft?.year ?? 0)
    || Number(right.overallRating ?? 0) - Number(left.overallRating ?? 0),
  );
}
