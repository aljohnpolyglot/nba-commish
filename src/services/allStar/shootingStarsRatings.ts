import { computeAge } from '../../utils/helpers';
import type { NBAPlayer } from '../../types';

export type ShootingStarsRatingKey = 'tp' | 'fg' | 'ins' | 'spd';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const ratingFromRow = (row: any, key: ShootingStarsRatingKey): number => row?.[key] ?? 50;

const weightedScore = (row: any): number =>
  ratingFromRow(row, 'tp') * 0.45
  + ratingFromRow(row, 'fg') * 0.3
  + ratingFromRow(row, 'ins') * 0.15
  + ratingFromRow(row, 'spd') * 0.1;

const latestRating = (player: NBAPlayer) => {
  const ratings = Array.isArray(player.ratings) ? player.ratings : [];
  return ratings[ratings.length - 1] ?? null;
};

const peakRating = (player: NBAPlayer) => {
  const ratings = Array.isArray(player.ratings) ? player.ratings : [];
  if (ratings.length === 0) return null;
  return ratings.reduce((best, row) => (weightedScore(row) >= weightedScore(best) ? row : best), ratings[0]);
};

const currentStats = (player: NBAPlayer, season?: number) => {
  const rows = (player.stats ?? []).filter(stat => !stat.playoffs && (stat.gp ?? 0) > 0);
  if (rows.length === 0) return null;
  const matched = season != null ? rows.filter(stat => stat.season === season) : [];
  const source = matched.length > 0
    ? matched
    : rows.filter(stat => stat.season === Math.max(...rows.map(row => row.season ?? 0)));
  if (source.length === 0) return null;
  return source.reduce((acc, row) => ({
    gp: acc.gp + (row.gp ?? 0),
    fg: acc.fg + (row.fg ?? 0),
    fga: acc.fga + (row.fga ?? 0),
    tp: acc.tp + (row.tp ?? 0),
    tpa: acc.tpa + (row.tpa ?? 0),
  }), { gp: 0, fg: 0, fga: 0, tp: 0, tpa: 0 });
};

const ageMultiplier = (player: NBAPlayer, simSeason?: number, peakSeason?: number): number => {
  const currentSeason = simSeason ?? latestRating(player)?.season ?? peakSeason;
  if (currentSeason == null) return 1;
  const currentAge = computeAge(player, currentSeason);
  const peakAge = peakSeason != null ? computeAge(player, peakSeason) : currentAge;
  const ageGap = Math.max(0, currentAge - peakAge);
  return clamp(1 - ageGap * 0.004, 0.7, 1);
};

export const shootingStarsPeakSeason = (player: NBAPlayer, season?: number): number | null =>
  (peakRating(player)?.season ?? latestRating(player)?.season ?? season ?? null);

export const shootingStarsRatingOf = (player: NBAPlayer, key: ShootingStarsRatingKey): number => {
  const latest = latestRating(player);
  return ratingFromRow(latest, key);
};

export const shootingStarsLegendRatingOf = (player: NBAPlayer, key: ShootingStarsRatingKey, season?: number): number => {
  const peak = peakRating(player);
  const peakSeason = peak?.season ?? latestRating(player)?.season;
  const base = peak ? ratingFromRow(peak, key) : ratingFromRow(latestRating(player), key);
  return Number((base * ageMultiplier(player, season, peakSeason ?? undefined)).toFixed(2));
};

export const shootingStarsStatsForSeason = (player: NBAPlayer, season?: number) => {
  return currentStats(player, season);
};

export const shootingStarsLegendStatsForSeason = (player: NBAPlayer, season?: number) => {
  const peakSeason = shootingStarsPeakSeason(player, season) ?? undefined;
  return currentStats(player, peakSeason);
};

export const shootingStarsScore = (player: NBAPlayer) =>
  shootingStarsRatingOf(player, 'tp') * 0.45
  + shootingStarsRatingOf(player, 'fg') * 0.3
  + shootingStarsRatingOf(player, 'ins') * 0.15
  + shootingStarsRatingOf(player, 'spd') * 0.1;

export const shootingStarsLegendScore = (player: NBAPlayer, season?: number) =>
  shootingStarsLegendRatingOf(player, 'tp', season) * 0.45
  + shootingStarsLegendRatingOf(player, 'fg', season) * 0.3
  + shootingStarsLegendRatingOf(player, 'ins', season) * 0.15
  + shootingStarsLegendRatingOf(player, 'spd', season) * 0.1;
