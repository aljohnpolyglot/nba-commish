// Fictional League — 30 teams. Replaces real NBA teams when leagueType === 'fictional'.
// Data mirrors ZenGM/BBGM's canonical fictional team set (Apache 2.0):
// abbrev/region/name/colors/pop come from zengm-games/zengm so logos resolve directly
// AND market-size math (attendance, revenue, FA bidding) gets realistic spread.
//
// Conference + division layout keeps NBA structure (3 divisions × 5 teams per conf).
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

// BBGM's canonical metro populations (millions). Source: ZenGM teamInfos.ts.
// All 30 of our abbrevs exist in BBGM, so this is the authoritative pop source.
const BBGM_POP: Record<string, number> = {
  ATL: 5.3, BOS: 7.3, BKN: 21.5, CHA: 1.5, CHI: 9.1, CLE: 1.7, DAL: 6.6,
  DEN: 2.7, DET: 4.0, HOU: 6.2, IND: 1.6, LA: 15.6, LAE: 15.6, MEM: 1.3,
  MIA: 6.1, MIL: 1.5, MIN: 2.8, NOL: 1.1, NYC: 21.5, OKC: 1.4, ORL: 2.2,
  PHI: 5.5, PHO: 4.3, POR: 2.0, SA: 2.0, SAC: 1.8, SF: 6.5, TOR: 6.6,
  UTA: 2.3, WAS: 6.2,
};

// NBA-sister fallback (real NBA metro populations, millions). Used when an
// abbrev exists in our roster but BBGM's teamInfos doesn't cover it. Maps each
// historical NBA city to its real metro pop.
const NBA_SISTER_POP: Record<string, number> = {
  ATL: 6.1, BOS: 4.9, BKN: 19.7, BRK: 19.7, CHA: 2.6, CHI: 9.5, CLE: 2.1,
  DAL: 7.7, DEN: 2.9, DET: 4.4, GSW: 4.7, HOU: 7.1, IND: 2.1, LAC: 13.2,
  LAL: 13.2, MEM: 1.3, MIA: 6.3, MIL: 1.6, MIN: 3.7, NOP: 1.3, NYK: 19.7,
  OKC: 1.4, ORL: 2.7, PHI: 6.2, PHX: 4.9, POR: 2.5, SAC: 2.4, SAS: 2.6,
  TOR: 6.4, UTA: 1.3, WAS: 6.4,
};

/** BBGM-first lookup with NBA-sister fallback. Default 2.0 for unknown abbrevs. */
export const getPopulation = (abbrev: string): number =>
  BBGM_POP[abbrev] ?? NBA_SISTER_POP[abbrev] ?? 2.0;

export const FICTIONAL_TEAMS: FictionalTeamDef[] = [
  // ─── EAST · Atlantic (did=0) ────────────────────────────────────────────
  { tid: 0,  region: 'Boston',        name: 'Massacre',      abbrev: 'BOS', colors: ['#ffffff', '#e70000', '#003188'], pop: getPopulation('BOS'), conference: 'East', cid: 0, did: 0 },
  { tid: 1,  region: 'Brooklyn',      name: 'Bagels',        abbrev: 'BKN', colors: ['#034757', '#67c7e9', '#b78254'], pop: getPopulation('BKN'), conference: 'East', cid: 0, did: 0 },
  { tid: 2,  region: 'New York',      name: 'Bankers',       abbrev: 'NYC', colors: ['#1e73ba', '#ff8500', '#ffffff'], pop: getPopulation('NYC'), conference: 'East', cid: 0, did: 0 },
  { tid: 3,  region: 'Philadelphia',  name: 'Cheesesteaks',  abbrev: 'PHI', colors: ['#46bae6', '#ffdb33', '#d9771f'], pop: getPopulation('PHI'), conference: 'East', cid: 0, did: 0 },
  { tid: 4,  region: 'Toronto',       name: 'Raccoons',      abbrev: 'TOR', colors: ['#841222', '#ffffff', '#000000'], pop: getPopulation('TOR'), conference: 'East', cid: 0, did: 0 },

  // ─── EAST · Central (did=1) ─────────────────────────────────────────────
  { tid: 5,  region: 'Chicago',       name: 'Gangsters',     abbrev: 'CHI', colors: ['#33607a', '#271919', '#a9daf6'], pop: getPopulation('CHI'), conference: 'East', cid: 0, did: 1 },
  { tid: 6,  region: 'Cleveland',     name: 'Curses',        abbrev: 'CLE', colors: ['#211e1e', '#f8e3cc', '#3f1c59'], pop: getPopulation('CLE'), conference: 'East', cid: 0, did: 1 },
  { tid: 7,  region: 'Detroit',       name: 'Muscle',        abbrev: 'DET', colors: ['#007681', '#d6d6d6', '#ffa400'], pop: getPopulation('DET'), conference: 'East', cid: 0, did: 1 },
  { tid: 8,  region: 'Indianapolis',  name: 'Crossroads',    abbrev: 'IND', colors: ['#e79f02', '#00246d', '#ffffff'], pop: getPopulation('IND'), conference: 'East', cid: 0, did: 1 },
  { tid: 9,  region: 'Milwaukee',     name: 'Cheesemakers',  abbrev: 'MIL', colors: ['#003600', '#fdc05f', '#007800'], pop: getPopulation('MIL'), conference: 'East', cid: 0, did: 1 },

  // ─── EAST · Southeast (did=2) ───────────────────────────────────────────
  { tid: 10, region: 'Atlanta',       name: 'Gold Club',     abbrev: 'ATL', colors: ['#291091', '#ae7c00', '#00d1df'], pop: getPopulation('ATL'), conference: 'East', cid: 0, did: 2 },
  { tid: 11, region: 'Charlotte',     name: 'Queens',        abbrev: 'CHA', colors: ['#009e87', '#541f3e', '#ffffff'], pop: getPopulation('CHA'), conference: 'East', cid: 0, did: 2 },
  { tid: 12, region: 'Miami',         name: 'Cyclones',      abbrev: 'MIA', colors: ['#4ac1c0', '#d8519d', '#f15949'], pop: getPopulation('MIA'), conference: 'East', cid: 0, did: 2 },
  { tid: 13, region: 'Orlando',       name: 'Juice',         abbrev: 'ORL', colors: ['#dc5000', '#ffffff', '#0b7648'], pop: getPopulation('ORL'), conference: 'East', cid: 0, did: 2 },
  { tid: 14, region: 'Washington',    name: 'Monuments',     abbrev: 'WAS', colors: ['#213063', '#c5ae6e', '#ffffff'], pop: getPopulation('WAS'), conference: 'East', cid: 0, did: 2 },

  // ─── WEST · Northwest (did=3) ───────────────────────────────────────────
  { tid: 15, region: 'Denver',        name: 'High',          abbrev: 'DEN', colors: ['#2b8643', '#163a1c', '#a1d297'], pop: getPopulation('DEN'), conference: 'West', cid: 1, did: 3 },
  { tid: 16, region: 'Minneapolis',   name: 'Blizzard',      abbrev: 'MIN', colors: ['#8accdc', '#3d2971', '#ed9a22'], pop: getPopulation('MIN'), conference: 'West', cid: 1, did: 3 },
  { tid: 17, region: 'Oklahoma City', name: '66ers',         abbrev: 'OKC', colors: ['#610000', '#bbb29e', '#e4dfcf'], pop: getPopulation('OKC'), conference: 'West', cid: 1, did: 3 },
  { tid: 18, region: 'Portland',      name: 'Roses',         abbrev: 'POR', colors: ['#e41d34', '#1e1e1e', '#e7a9cc'], pop: getPopulation('POR'), conference: 'West', cid: 1, did: 3 },
  { tid: 19, region: 'Utah',          name: 'Missionaries',  abbrev: 'UTA', colors: ['#7c7c7c', '#000000', '#aea57a'], pop: getPopulation('UTA'), conference: 'West', cid: 1, did: 3 },

  // ─── WEST · Pacific (did=4) ─────────────────────────────────────────────
  { tid: 20, region: 'San Francisco', name: 'Unicorns',      abbrev: 'SF',  colors: ['#676ee7', '#48edfe', '#fe696e'], pop: getPopulation('SF'),  conference: 'West', cid: 1, did: 4 },
  { tid: 21, region: 'Los Angeles',   name: 'Lowriders',     abbrev: 'LA',  colors: ['#00008b', '#ffaf28', '#ff24ee'], pop: getPopulation('LA'),  conference: 'West', cid: 1, did: 4 },
  { tid: 22, region: 'Los Angeles',   name: 'Earthquakes',   abbrev: 'LAE', colors: ['#aeaeae', '#ea4b0f', '#dedddd'], pop: getPopulation('LAE'), conference: 'West', cid: 1, did: 4 },
  { tid: 23, region: 'Phoenix',       name: 'Vultures',      abbrev: 'PHO', colors: ['#d17d2a', '#231f20', '#c09867'], pop: getPopulation('PHO'), conference: 'West', cid: 1, did: 4 },
  { tid: 24, region: 'Sacramento',    name: 'Gold Rush',     abbrev: 'SAC', colors: ['#735823', '#e4c649', '#f8e19f'], pop: getPopulation('SAC'), conference: 'West', cid: 1, did: 4 },

  // ─── WEST · Southwest (did=5) ───────────────────────────────────────────
  { tid: 25, region: 'Dallas',        name: 'Snipers',       abbrev: 'DAL', colors: ['#000000', '#e08200', '#436431'], pop: getPopulation('DAL'), conference: 'West', cid: 1, did: 5 },
  { tid: 26, region: 'Houston',       name: 'Apollos',       abbrev: 'HOU', colors: ['#4c91c2', '#c4c4c3', '#ffffff'], pop: getPopulation('HOU'), conference: 'West', cid: 1, did: 5 },
  { tid: 27, region: 'Memphis',       name: 'Blues',         abbrev: 'MEM', colors: ['#000000', '#ff6c49', '#00aedc'], pop: getPopulation('MEM'), conference: 'West', cid: 1, did: 5 },
  { tid: 28, region: 'New Orleans',   name: 'Bayou',         abbrev: 'NOL', colors: ['#195869', '#4edd61', '#0e3e33'], pop: getPopulation('NOL'), conference: 'West', cid: 1, did: 5 },
  { tid: 29, region: 'San Antonio',   name: 'Churros',       abbrev: 'SA',  colors: ['#4a2b14', '#30d9ff', '#704723'], pop: getPopulation('SA'),  conference: 'West', cid: 1, did: 5 },
];

/** Resolves to BBGM's open-source logo CDN (Apache 2.0). Abbrevs match BBGM canon.
 *  `logos-primary` is the standard full-color logo set (LAE, etc) — what BBGM
 *  actually displays. `logos-secondary` is alternate/wordmark variants. */
export const fictionalLogoUrl = (abbrev: string): string =>
  `https://play.basketball-gm.com/img/logos-primary/${abbrev}.svg`;
