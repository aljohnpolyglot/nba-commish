import { create } from 'zustand';
import type { NBAPlayer } from '../types';
import { computeAge, convertTo2KRating } from '../utils/helpers';
import { calculateK2, type K2Data } from '../services/simulation/convert2kAttributes';
import { applyLeagueDisplayScale } from '../hooks/useLeagueScaledRatings';
import { applyDurabilityToK2, getRealDurability } from '../utils/durabilityUtils';
import { getPlayerRealK2, loadRatings } from '../data/NBA2kRatings';
import { LEAGUE_MULTIPLIERS } from '../services/logic/leagueOvr';
import {
  applyK2DetailOffsets,
  getK2DetailSignature,
  hasK2DetailOffsets,
  K2_CORE_RATING_KEYS,
} from '../services/simulation/k2DetailRatings';

const DEFAULT_RATINGS: Record<string, number> = {
  hgt: 50, stre: 50, spd: 50, jmp: 50, endu: 50,
  ins: 50, dnk: 50, ft: 50, fg: 50, tp: 50,
  oiq: 50, diq: 50, drb: 50, pss: 50, reb: 50,
};

const RATING_KEYS = ['hgt', 'stre', 'spd', 'jmp', 'endu', 'ins', 'dnk', 'ft', 'fg', 'tp', 'oiq', 'diq', 'drb', 'pss', 'reb', 'ovr', 'pot', 'season'];
const WNBA_CURRENT_ROSTER_DISPLAY_BONUS = 5;

export interface PlayerRatingBundle {
  currentRatings: Record<string, number>;
  scaledRatings: Record<string, any>;
  rawK2: K2Data;
  k2: K2Data;
  baseK2: K2Data;
  displayK2: K2Data;
  real2KSubs: Record<string, (number | null)[]> | null;
  overall2k: number;
  potential2k: number;
  k2Overall: number;
  age: number;
  durability: number;
}

interface PlayerRatingStore {
  version: number;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  invalidate: () => void;
  ensureLoaded: () => Promise<void>;
}

let loadPromise: Promise<void> | null = null;
const bundleCache = new Map<string, PlayerRatingBundle>();

export const usePlayerRatingStore = create<PlayerRatingStore>((set, get) => ({
  version: 0,
  status: 'idle',
  error: null,
  invalidate: () => {
    bundleCache.clear();
    set(state => ({ version: state.version + 1 }));
  },
  ensureLoaded: async () => {
    if (get().status === 'ready') return;
    if (!loadPromise) {
      set({ status: 'loading', error: null });
      loadPromise = loadRatings()
        .then(() => set(state => ({ status: 'ready', error: null, version: state.version + 1 })))
        .catch(error => {
          loadPromise = null;
          set({ status: 'error', error: error instanceof Error ? error.message : String(error) });
        });
    }
    await loadPromise;
  },
}));

export function ensurePlayerRatingData(): Promise<void> {
  return usePlayerRatingStore.getState().ensureLoaded();
}

export function invalidatePlayerRatingCache(): void {
  usePlayerRatingStore.getState().invalidate();
}

export function pickPlayerRating(player: any, season?: number): any {
  const ratings = player?.ratings;
  if (!Array.isArray(ratings) || ratings.length === 0) return null;
  if (season != null) {
    const found = ratings.find((r: any) => r?.season === season);
    if (found) return found;
  }
  return ratings[ratings.length - 1];
}

export function getDisplayAge(player: any, currentYear: number): number {
  return computeAge(player, currentYear);
}

function hasExternalLeagueDisplayScale(player: any): boolean {
  return Object.prototype.hasOwnProperty.call(LEAGUE_MULTIPLIERS, String(player?.status ?? ''));
}

function resolveDisplayBbgmOvr(player: any, rating: any, season?: number): number {
  const playerOvr = Number(player?.overallRating);
  const canonicalSeasonOvr = Number(rating?.ovr);
  if (rating?.pbaCanonicalLeagueRating === true && Number.isFinite(canonicalSeasonOvr) && canonicalSeasonOvr > 0) {
    return canonicalSeasonOvr;
  }
  if (hasExternalLeagueDisplayScale(player) && Number.isFinite(playerOvr) && playerOvr > 0) {
    return playerOvr;
  }
  const seasonOvr = season != null && Number.isFinite(Number(rating?.ovr)) ? Number(rating.ovr) : undefined;
  return seasonOvr ?? player?.overallRating ?? rating?.ovr ?? 60;
}

export type DisplayRatingOptions = { wnbaCurrentRoster?: boolean };

function applyCurrentWnbaDisplayScale(player: any, rating: number, options?: DisplayRatingOptions): number {
  const activeRosterPlayer = Number(player?.tid) >= 0 && player?.status === 'Active';
  const usesWnbaScale = player?.displayRatingProfile === 'wnba-current-roster' || options?.wnbaCurrentRoster === true;
  return activeRosterPlayer && usesWnbaScale
    ? Math.min(99, rating + WNBA_CURRENT_ROSTER_DISPLAY_BONUS)
    : rating;
}

export function getDisplayOverall(player: any, season?: number, options?: DisplayRatingOptions): number {
  const rating = pickPlayerRating(player, season);
  const hgt = rating?.hgt ?? 50;
  const tp = rating?.tp ?? 50;
  const bbgmOvr = resolveDisplayBbgmOvr(player, rating, season);
  return applyCurrentWnbaDisplayScale(player, convertTo2KRating(bbgmOvr, hgt, tp), options);
}

export function estimatePotentialBbgm(ovrBbgm: number, age: number, minimum = 40): number {
  if (age >= 27) return ovrBbgm;
  const regression = Math.round(72.31428908571982 + (-2.33062761 * age) + (0.83308748 * ovrBbgm));
  return Math.min(99, Math.max(minimum, Math.max(ovrBbgm, regression)));
}

export type DisplayPotentialOptions = DisplayRatingOptions & { floorAtEstimated?: boolean };

function hasRealPlayerIdentity(player: any): boolean {
  return typeof player?.srID === 'string' || typeof player?.slug === 'string';
}

export function resolvePotentialBbgm(
  ovrBbgm: number,
  age: number,
  storedPot?: number,
  options?: DisplayPotentialOptions,
): number {
  const estimatedPot = estimatePotentialBbgm(ovrBbgm, age);
  const storedOrEstimated = Number.isFinite(storedPot) && Number(storedPot) > 0 ? Number(storedPot) : estimatedPot;
  if (options?.floorAtEstimated === false) return Math.max(40, Math.min(99, storedOrEstimated));
  if (age >= 27) return Math.max(40, Math.min(99, Math.min(storedOrEstimated, ovrBbgm)));
  return Math.max(40, Math.min(99, Math.max(ovrBbgm, storedOrEstimated, estimatedPot)));
}

export function resolveDisplayPotentialBbgm(
  player: any,
  currentYear: number,
  season?: number,
  options?: DisplayPotentialOptions,
): number {
  const rating = pickPlayerRating(player, season);
  const age = getDisplayAge(player, currentYear);
  const bbgmOvr = resolveDisplayBbgmOvr(player, rating, season);
  if (rating?.pbaCanonicalLeagueRating === true) {
    const canonicalPot = Number(rating?.pot ?? player?.potential ?? bbgmOvr);
    if (age >= 27) return bbgmOvr;
    return Math.max(bbgmOvr, Math.min(99, Number.isFinite(canonicalPot) ? canonicalPot : bbgmOvr));
  }
  const rawStoredPot = hasRealPlayerIdentity(player) ? undefined : Number(rating?.pot ?? player?.potential);
  const storedPot = Number.isFinite(rawStoredPot) ? rawStoredPot : undefined;
  return resolvePotentialBbgm(bbgmOvr, age, storedPot, options);
}

export function getDisplayPotential(
  player: any,
  currentYear: number,
  season?: number,
  options?: DisplayPotentialOptions,
): number {
  const rating = pickPlayerRating(player, season);
  const hgt = rating?.hgt ?? 50;
  const tp = rating?.tp ?? 50;
  return applyCurrentWnbaDisplayScale(
    player,
    convertTo2KRating(resolveDisplayPotentialBbgm(player, currentYear, season, options), hgt, tp),
    options,
  );
}

export function isGeneratedDraftFill(player: any): boolean {
  const id = String(player?.internalId ?? '');
  return id.startsWith('gen-') || id.startsWith('ext-gen-');
}

export function getProspectDisplayPotential(
  player: any,
  currentYear: number,
  season?: number,
  options?: { pbaMode?: boolean; floorGeneratedProspects?: boolean },
): number {
  void player;
  void options?.floorGeneratedProspects;
  const floorAtEstimated = !options?.pbaMode;
  return getDisplayPotential(player, currentYear, season, { floorAtEstimated });
}

export function calculateOverallFromRating(rating: any): number {
  if (!rating) return 50;
  const { hgt, stre, spd, jmp, endu, ins, dnk, ft, fg, tp, oiq, diq, drb, pss, reb } = { ...DEFAULT_RATINGS, ...rating };
  const scoringStats = [ins, dnk, ft, fg, tp].sort((a, b) => b - a);
  const topScoring = (scoringStats[0] + scoringStats[1] + scoringStats[2]) / 3;
  const avgScoring = (ins + dnk + ft + fg + tp) / 5;
  const scoring = topScoring * 0.7 + avgScoring * 0.3;
  const physicals = (hgt * 1.5 + stre + spd * 1.2 + jmp + endu * 1.3) / 6;
  const playmaking = (drb * 0.9 + pss * 0.9 + oiq * 1.2) / 3;
  const defense = (diq * 1.2 + reb * 0.9 + hgt * 0.9) / 3;
  let rawOvr = scoring * 0.35 + playmaking * 0.25 + defense * 0.2 + physicals * 0.2;
  if (rawOvr > 80) rawOvr = 80 + (rawOvr - 80) * 1.2;
  else if (rawOvr < 60) rawOvr *= 0.95;
  return Math.max(25, Math.min(99, Math.round(rawOvr)));
}

function ratingSignature(rating: any): string {
  if (!rating) return 'none';
  return `${RATING_KEYS.map(key => `${key}:${rating[key] ?? ''}`).join('|')}|k2:${getK2DetailSignature(rating.k2DetailOffsets)}`;
}

function cacheKey(
  player: NBAPlayer,
  currentYear: number,
  season?: number,
  ratingsOverride?: Record<string, any>,
  blendReal2K = true,
  durabilityOverride?: number,
): string {
  const rating = ratingsOverride ?? pickPlayerRating(player, season) ?? {};
  const first = player.ratings?.[0] ?? {};
  return [
    player.internalId,
    player.name,
    currentYear,
    season ?? 'latest',
    player.status ?? '',
    player.displayRatingProfile ?? '',
    player.overallRating ?? '',
    player.potential ?? '',
    player.age ?? '',
    player.born?.year ?? '',
    player.hgt ?? '',
    player.weight ?? '',
    player.pos ?? '',
    durabilityOverride ?? player.durability ?? '',
    player.injury?.gamesRemaining ?? '',
    player.stats?.length ?? 0,
    blendReal2K ? 'blend' : 'raw',
    ratingSignature(rating),
    ratingSignature(first),
  ].join('::');
}

function getBbgmRatings(player: NBAPlayer, season?: number, ratingsOverride?: Record<string, any>): Record<string, number> {
  const rating = ratingsOverride ?? pickPlayerRating(player, season) ?? {};
  return Object.fromEntries(
    K2_CORE_RATING_KEYS.map(key => [key, Number.isFinite(Number(rating[key])) ? Number(rating[key]) : DEFAULT_RATINGS[key]]),
  );
}

function computeK2ForRatings(player: NBAPlayer, ratings: Record<string, any>, age: number, durability: number): K2Data {
  const scaled = applyLeagueDisplayScale(player.status, ratings);
  const raw = calculateK2(scaled as any, {
    pos: player.pos,
    heightIn: player.hgt,
    weightLbs: player.weight,
    age,
  });
  return applyDurabilityToK2(raw, durability);
}

function blendK2WithRealBaseline(k2: K2Data, baseK2: K2Data, real2KSubs: Record<string, (number | null)[]> | null, durability: number): K2Data {
  if (!real2KSubs) return k2;
  const blended: any = {};
  for (const catKey of Object.keys(k2) as (keyof K2Data)[]) {
    const computedSubs = k2[catKey].sub;
    const baseSubs = baseK2[catKey].sub;
    const realSubs = real2KSubs[catKey] ?? [];
    const blendedSubs = computedSubs.map((computed, index) => {
      const real = realSubs[index];
      if (real == null) return computed;
      const base = baseSubs[index] ?? computed;
      return Math.round(Math.max(25, Math.min(99, real + (computed - base))));
    });
    blended[catKey] = {
      sub: blendedSubs,
      ovr: Math.round(blendedSubs.reduce((sum: number, value: number) => sum + value, 0) / blendedSubs.length),
    };
  }
  return applyDurabilityToK2(blended as K2Data, durability);
}

export function resolvePlayerRatingBundle(
  player: NBAPlayer,
  currentYear: number,
  season?: number,
  options?: {
    ratingsOverride?: Record<string, any>;
    k2DetailOffsetsOverride?: unknown;
    durabilityOverride?: number;
    blendReal2K?: boolean;
  },
): PlayerRatingBundle {
  const blendReal2K = options?.blendReal2K ?? true;
  const selectedRating = options?.ratingsOverride ?? pickPlayerRating(player, season) ?? {};
  const detailOffsets = options?.k2DetailOffsetsOverride ?? selectedRating.k2DetailOffsets;
  const key = cacheKey(
    player,
    currentYear,
    season,
    { ...selectedRating, k2DetailOffsets: detailOffsets },
    blendReal2K,
    options?.durabilityOverride,
  );
  const cached = bundleCache.get(key);
  if (cached) return cached;

  const currentRatings = getBbgmRatings(player, season, options?.ratingsOverride);
  const scaledRatings = applyLeagueDisplayScale(player.status, currentRatings);
  const age = getDisplayAge(player, currentYear);
  const durability = options?.durabilityOverride ?? getRealDurability(player) ?? 75;
  const rawK2 = calculateK2(scaledRatings as any, {
    pos: player.pos,
    heightIn: player.hgt,
    weightLbs: player.weight,
    age,
  });
  const k2 = applyK2DetailOffsets(applyDurabilityToK2(rawK2, durability), detailOffsets);
  const baseRatings = { ...DEFAULT_RATINGS, ...(player.ratings?.[0] ?? currentRatings) };
  const baseK2 = computeK2ForRatings(player, baseRatings, age, durability);
  const real2KSubs = blendReal2K ? getPlayerRealK2(player.name) : null;
  const displayK2 = hasK2DetailOffsets(detailOffsets)
    ? k2
    : blendK2WithRealBaseline(k2, baseK2, real2KSubs, durability);
  const overall2k = getDisplayOverall(player, season);
  const potential2k = getDisplayPotential(player, currentYear, season);
  const cats = Object.values(displayK2) as { ovr: number; sub: number[] }[];
  const k2Overall = Math.round(cats.reduce((sum, cat) => sum + cat.ovr, 0) / cats.length);

  const bundle = {
    currentRatings,
    scaledRatings,
    rawK2,
    k2,
    baseK2,
    displayK2,
    real2KSubs,
    overall2k,
    potential2k,
    k2Overall,
    age,
    durability,
  };
  bundleCache.set(key, bundle);
  return bundle;
}
