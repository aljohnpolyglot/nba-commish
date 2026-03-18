export type { ThreePointContestant } from '../../../../services/allStar/ThreePointContestant';
export { } from '../../../../services/allStar/ThreePointContestant';

import { ThreePointContestant } from '../../../../services/allStar/ThreePointContestant';

/**
 * Map a game NBAPlayer to ThreePointContestant for the live contest display.
 * The nbaSlug is derived from the player name and used to fetch real shot-zone data
 * from the Cloudflare Worker. Falls back to badge-based logic if the fetch fails.
 */
export function mapPlayerToContestant(player: any, teamAbbrev: string): ThreePointContestant {
  const nbaSlug = (player.nbaSlug as string | undefined) ||
    player.name.toLowerCase().replace(/['.]/g, '').replace(/\s+/g, '-');

  const imgURL = player.imgURL ||
    (player.nbaId ? `https://cdn.nba.com/headshots/nba/latest/1040x760/${player.nbaId}.png` : '');

  return {
    id: player.internalId ?? player.playerId ?? player.id,
    name: player.name,
    team: teamAbbrev,
    pos: player.pos ?? 'G',
    nbaSlug,
    imgURL,
    ratings: {
      tp:  player.ratings?.tp  ?? 75,
      fg:  player.ratings?.fg  ?? 70,
      spd: player.ratings?.spd ?? 65,
    },
    badges: player.badges ?? {},
    age: player.age ?? 25,
    awards: player.awards,
  };
}

// Hardcoded fallback contestants used when the component is rendered outside
// the game context (e.g. standalone sandbox mode).
export const CONTESTANTS: ThreePointContestant[] = [
  {
    id: 'cam_spencer', name: 'Cam Spencer', team: 'MEM', pos: 'G',
    nbaSlug: 'cam-spencer',
    imgURL: 'https://cdn.nba.com/headshots/nba/latest/1040x760/1642285.png',
    ratings: { tp: 82, fg: 75, spd: 72 },
    badges: { 'Catch and Shoot': 'Gold', 'Corner Specialist': 'Silver', 'Deadeye': 'Bronze' },
    age: 24,
  },
  {
    id: 'duncan_robinson', name: 'Duncan Robinson', team: 'DET', pos: 'F',
    nbaSlug: 'duncan-robinson',
    imgURL: 'https://cdn.nba.com/headshots/nba/latest/1040x760/1629130.png',
    ratings: { tp: 88, fg: 78, spd: 65 },
    badges: { 'Catch and Shoot': 'HOF', 'Corner Specialist': 'Gold', 'Deadeye': 'Silver', 'Set Shot Specialist': 'Gold' },
    age: 30,
  },
  {
    id: 'anfernee_simons', name: 'Anfernee Simons', team: 'CHI', pos: 'G',
    nbaSlug: 'anfernee-simons',
    imgURL: 'https://cdn.nba.com/headshots/nba/latest/1040x760/1629014.png',
    ratings: { tp: 85, fg: 80, spd: 80 },
    badges: { 'Limitless Range': 'Silver', 'Shifty Shooter': 'Gold', 'Deadeye': 'Bronze' },
    age: 25,
  },
  {
    id: 'buddy_hield', name: 'Buddy Hield', team: 'ATL', pos: 'G',
    nbaSlug: 'buddy-hield',
    imgURL: 'https://cdn.nba.com/headshots/nba/latest/1040x760/1627741.png',
    ratings: { tp: 90, fg: 82, spd: 70 },
    badges: { 'Catch and Shoot': 'HOF', 'Deadeye': 'Gold', 'Corner Specialist': 'Silver', 'Set Shot Specialist': 'Silver' },
    age: 32,
    awards: [{ season: 2024, type: 'Three-Point Contest Winner' }],
  },
];
