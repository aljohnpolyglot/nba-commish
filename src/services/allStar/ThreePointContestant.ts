/**
 * ThreePointContestant type used by the live 3PT contest display engine.
 * Distinct from the game's NBAPlayer — includes nbaSlug for zone data API calls.
 */
export interface ThreePointContestant {
  id: string;
  name: string;
  team: string;
  pos: string;
  nbaSlug: string;
  imgURL: string;
  ratings: { tp: number; fg: number; spd: number };
  badges: {
    'Catch and Shoot'?: 'HOF' | 'Gold' | 'Silver' | 'Bronze';
    'Corner Specialist'?: 'HOF' | 'Gold' | 'Silver' | 'Bronze';
    'Deadeye'?: 'HOF' | 'Gold' | 'Silver' | 'Bronze';
    'Set Shot Specialist'?: 'HOF' | 'Gold' | 'Silver' | 'Bronze';
    'Shifty Shooter'?: 'HOF' | 'Gold' | 'Silver' | 'Bronze';
    'Limitless Range'?: 'HOF' | 'Gold' | 'Silver' | 'Bronze';
  };
  age: number;
  awards?: { season: number; type: string }[];
}
