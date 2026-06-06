import type { NBAPlayer } from '../../types';
import { shootingStarsRatingOf as ratingOf, shootingStarsScore } from '../../services/allStar/shootingStarsRatings';

export const shootingRatingOf = (player: NBAPlayer, key: 'tp' | 'fg' | 'ins' | 'spd') => ratingOf(player, key);

export { shootingStarsScore };
