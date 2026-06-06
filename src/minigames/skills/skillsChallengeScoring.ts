import type { NBAPlayer } from '../../types';

export const ratingOf = (player: NBAPlayer, key: 'spd' | 'tp' | 'pss' | 'drb' | 'fg' | 'ins') => {
  const latest = (Array.isArray(player.ratings) ? player.ratings[player.ratings.length - 1] : {}) as any;
  return latest?.[key] ?? 50;
};

export const skillsScore = (player: NBAPlayer) =>
  (ratingOf(player, 'spd') + ratingOf(player, 'drb') + ratingOf(player, 'pss') + ratingOf(player, 'tp')) / 4;
