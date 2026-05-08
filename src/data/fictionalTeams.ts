// Fictional League — 30 teams. Replaces real NBA teams when leagueType === 'fictional'.
// All names/colors are originals (not copied from any external source).
// User is brainstorming this list; safe to edit names/colors/cities here.
//
// Schema is compatible with NBATeam (src/types.ts). Logos resolve to
// /logos/<abbrev>.png at runtime — drop PNGs into public/logos/ once generated.
//
// Conference + division layout mirrors NBA structure (3 divisions × 5 teams per conf)
// so playoff seeding, schedule generation, and division logic work unchanged.
//
//   East / cid=0
//     Atlantic   (did=0): #1–5
//     Central    (did=1): #6–10
//     Southeast  (did=2): #11–15
//   West / cid=1
//     Northwest  (did=3): #16–20
//     Pacific    (did=4): #21–25
//     Southwest  (did=5): #26–30

export interface FictionalTeamDef {
  tid: number;
  region: string;
  name: string;
  abbrev: string;
  colors: [string, string, string]; // [primary, secondary, accent]
  pop: number;                      // market size in millions (drives revenue/desirability)
  conference: 'East' | 'West';
  cid: 0 | 1;
  did: 0 | 1 | 2 | 3 | 4 | 5;
}

export const FICTIONAL_TEAMS: FictionalTeamDef[] = [
  // ─── EAST · Atlantic (did=0) ────────────────────────────────────────────
  { tid: 0,  region: 'Boston',       name: 'Brahmins',      abbrev: 'BOS', colors: ['#0C2340', '#C8102E', '#FFFFFF'], pop: 4.9, conference: 'East', cid: 0, did: 0 },
  { tid: 1,  region: 'Brooklyn',     name: 'Bridges',       abbrev: 'BKN', colors: ['#000000', '#A6ACAF', '#FFFFFF'], pop: 8.6, conference: 'East', cid: 0, did: 0 },
  { tid: 2,  region: 'New York',     name: 'Empire',        abbrev: 'NYC', colors: ['#003DA5', '#F58025', '#FFFFFF'], pop: 8.6, conference: 'East', cid: 0, did: 0 },
  { tid: 3,  region: 'Philadelphia', name: 'Cheesesteaks',  abbrev: 'PHI', colors: ['#FFD100', '#C8102E', '#000000'], pop: 1.6, conference: 'East', cid: 0, did: 0 },
  { tid: 4,  region: 'Toronto',      name: 'Maple',         abbrev: 'TOR', colors: ['#C8102E', '#FFFFFF', '#000000'], pop: 6.2, conference: 'East', cid: 0, did: 0 },

  // ─── EAST · Central (did=1) ─────────────────────────────────────────────
  { tid: 5,  region: 'Chicago',      name: 'Stockyards',    abbrev: 'CHI', colors: ['#8B0000', '#000000', '#C5B358'], pop: 2.7, conference: 'East', cid: 0, did: 1 },
  { tid: 6,  region: 'Cleveland',    name: 'Lakeshores',    abbrev: 'CLE', colors: ['#0E4D92', '#FFD100', '#FFFFFF'], pop: 0.4, conference: 'East', cid: 0, did: 1 },
  { tid: 7,  region: 'Detroit',      name: 'Steel',         abbrev: 'DET', colors: ['#5C5C5C', '#003DA5', '#FFFFFF'], pop: 0.6, conference: 'East', cid: 0, did: 1 },
  { tid: 8,  region: 'Indiana',      name: 'Speedway',      abbrev: 'IND', colors: ['#FFC72C', '#002D62', '#FFFFFF'], pop: 0.9, conference: 'East', cid: 0, did: 1 },
  { tid: 9,  region: 'Milwaukee',    name: 'Brewmasters',   abbrev: 'MIL', colors: ['#00471B', '#EEE1C6', '#000000'], pop: 0.6, conference: 'East', cid: 0, did: 1 },

  // ─── EAST · Southeast (did=2) ───────────────────────────────────────────
  { tid: 10, region: 'Atlanta',      name: 'Phoenix',       abbrev: 'ATL', colors: ['#C8102E', '#FDB927', '#000000'], pop: 0.5, conference: 'East', cid: 0, did: 2 },
  { tid: 11, region: 'Charlotte',    name: 'Carolinas',     abbrev: 'CHA', colors: ['#005DAA', '#00B5E2', '#FFFFFF'], pop: 0.9, conference: 'East', cid: 0, did: 2 },
  { tid: 12, region: 'Miami',        name: 'Riptide',       abbrev: 'MIA', colors: ['#0077C8', '#FF6900', '#FFFFFF'], pop: 0.5, conference: 'East', cid: 0, did: 2 },
  { tid: 13, region: 'Orlando',      name: 'Mystery',       abbrev: 'ORL', colors: ['#0077C8', '#000000', '#FFFFFF'], pop: 0.3, conference: 'East', cid: 0, did: 2 },
  { tid: 14, region: 'Washington',   name: 'Diplomats',     abbrev: 'WAS', colors: ['#002868', '#BF0A30', '#FFFFFF'], pop: 0.7, conference: 'East', cid: 0, did: 2 },

  // ─── WEST · Northwest (did=3) ───────────────────────────────────────────
  { tid: 15, region: 'Denver',       name: 'Mile-High',     abbrev: 'DEN', colors: ['#7E1E81', '#F0B323', '#FFFFFF'], pop: 0.7, conference: 'West', cid: 1, did: 3 },
  { tid: 16, region: 'Minnesota',    name: 'Frostbites',    abbrev: 'MIN', colors: ['#236192', '#9EA2A2', '#FFFFFF'], pop: 0.4, conference: 'West', cid: 1, did: 3 },
  { tid: 17, region: 'Oklahoma City',name: 'Storms',        abbrev: 'OKC', colors: ['#FF6F00', '#1D428A', '#FFFFFF'], pop: 0.7, conference: 'West', cid: 1, did: 3 },
  { tid: 18, region: 'Portland',     name: 'Pioneers',      abbrev: 'POR', colors: ['#046A38', '#84714F', '#FFFFFF'], pop: 0.7, conference: 'West', cid: 1, did: 3 },
  { tid: 19, region: 'Utah',         name: 'Mormons',       abbrev: 'UTA', colors: ['#7C9F4E', '#F5B112', '#FFFFFF'], pop: 1.2, conference: 'West', cid: 1, did: 3 },

  // ─── WEST · Pacific (did=4) ─────────────────────────────────────────────
  { tid: 20, region: 'San Francisco', name: 'Golden Gates', abbrev: 'SFG', colors: ['#C0362C', '#FFC72C', '#1D428A'], pop: 7.7, conference: 'West', cid: 1, did: 4 },
  { tid: 21, region: 'Los Angeles',  name: 'Hollywood',     abbrev: 'LAH', colors: ['#552583', '#FDB927', '#000000'], pop: 13.2,conference: 'West', cid: 1, did: 4 },
  { tid: 22, region: 'Los Angeles',  name: 'Stars',         abbrev: 'LAS', colors: ['#1D428A', '#C8102E', '#FFFFFF'], pop: 13.2,conference: 'West', cid: 1, did: 4 },
  { tid: 23, region: 'Phoenix',      name: 'Inferno',       abbrev: 'PHX', colors: ['#E03A3E', '#F58025', '#000000'], pop: 4.7, conference: 'West', cid: 1, did: 4 },
  { tid: 24, region: 'Sacramento',   name: 'Royals',        abbrev: 'SAC', colors: ['#5F259F', '#C4CED4', '#000000'], pop: 2.4, conference: 'West', cid: 1, did: 4 },

  // ─── WEST · Southwest (did=5) ───────────────────────────────────────────
  { tid: 25, region: 'Dallas',       name: 'Outlaws',       abbrev: 'DAL', colors: ['#222222', '#C5B358', '#FFFFFF'], pop: 7.6, conference: 'West', cid: 1, did: 5 },
  { tid: 26, region: 'Houston',      name: 'Wildcats',      abbrev: 'HOU', colors: ['#CE1141', '#000000', '#FFFFFF'], pop: 7.1, conference: 'West', cid: 1, did: 5 },
  { tid: 27, region: 'Memphis',      name: 'Riverkings',    abbrev: 'MEM', colors: ['#5D76A9', '#F5B112', '#FFFFFF'], pop: 1.3, conference: 'West', cid: 1, did: 5 },
  { tid: 28, region: 'New Orleans',  name: 'Bayou',         abbrev: 'NOR', colors: ['#0C2340', '#85714D', '#FFFFFF'], pop: 1.3, conference: 'West', cid: 1, did: 5 },
  { tid: 29, region: 'San Antonio',  name: 'Conquistadors', abbrev: 'SAS', colors: ['#000000', '#C4CED4', '#FFFFFF'], pop: 2.6, conference: 'West', cid: 1, did: 5 },
];

/** Resolve logo path. PNG drop-in at /logos/<abbrev_lowercase>.png. */
export const fictionalLogoUrl = (abbrev: string): string =>
  `/logos/${abbrev.toLowerCase()}.png`;
