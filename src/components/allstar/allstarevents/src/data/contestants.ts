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

// SANDBOX: contestants hardcoded
// TRANSPLANT: ThreePointContestSim.selectContestants(state.players)
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
    id: 'taurean_prince', name: 'Taurean Prince', team: 'MIL', pos: 'F',
    nbaSlug: 'taurean-prince',
    imgURL: 'https://cdn.nba.com/headshots/nba/latest/1040x760/1627752.png',
    ratings: { tp: 80, fg: 74, spd: 68 },
    badges: { 'Corner Specialist': 'Gold', 'Catch and Shoot': 'Silver' },
    age: 30,
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
    id: 'naz_reid', name: 'Naz Reid', team: 'MIN', pos: 'C',
    nbaSlug: 'naz-reid',
    imgURL: 'https://cdn.nba.com/headshots/nba/latest/1040x760/1629675.png',
    ratings: { tp: 76, fg: 72, spd: 60 },
    badges: { 'Deadeye': 'Silver', 'Set Shot Specialist': 'Bronze' },
    age: 25,
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
    id: 'immanuel_quickley', name: 'Immanuel Quickley', team: 'TOR', pos: 'G',
    nbaSlug: 'immanuel-quickley',
    imgURL: 'https://cdn.nba.com/headshots/nba/latest/1040x760/1630193.png',
    ratings: { tp: 79, fg: 74, spd: 78 },
    badges: { 'Shifty Shooter': 'Silver', 'Catch and Shoot': 'Bronze' },
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
  {
    id: 'michael_porter_jr', name: 'Michael Porter Jr.', team: 'BKN', pos: 'F',
    nbaSlug: 'michael-porter-jr',
    imgURL: 'https://cdn.nba.com/headshots/nba/latest/1040x760/1629008.png',
    ratings: { tp: 78, fg: 76, spd: 68 },
    badges: { 'Deadeye': 'Silver', 'Catch and Shoot': 'Bronze' },
    age: 26,
  },
];
