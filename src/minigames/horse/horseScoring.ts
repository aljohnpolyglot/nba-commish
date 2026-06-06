import type { NBAPlayer } from '../../types';

export const ratingOf = (player: NBAPlayer, key: 'tp' | 'ft' | 'fg' | 'drb' | 'dnk') => {
  const latest = (Array.isArray(player.ratings) ? player.ratings[player.ratings.length - 1] : {}) as any;
  return latest?.[key] ?? 50;
};

export const horseScore = (player: NBAPlayer) =>
  ratingOf(player, 'tp') * 0.35 +
  ratingOf(player, 'ft') * 0.25 +
  ratingOf(player, 'fg') * 0.2 +
  ratingOf(player, 'drb') * 0.12 +
  ratingOf(player, 'dnk') * 0.08;
