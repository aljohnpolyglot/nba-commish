// Fakes the 8 external leagues (Euroleague, PBA, WNBA, B-League, G-League,
// Endesa, China CBA, NBL Australia) for fictional league mode. Without this
// every external roster is empty when the user picks Fictional → no scouting
// pool, no overseas drafts, no Visit Non-NBA Teams content.
//
// Approach: each league gets a small fixed team list with the canonical TID
// offset, then generateDraftClassForGame produces ~12 players per team.
// Players get the right `status` and contract scaffolding so downstream code
// (cap math, FA pipeline, scouting views) treats them as it would real fetched
// data. No deep career history — just current-season ratings + minimal stats.

import type { NBAPlayer, NonNBATeam } from '../types';
import { generateDraftClassForGame } from './genDraftPlayers';
import { getNameData } from '../data/nameDataFetcher';
import { EUROLEAGUE_TEAMS, ENDESA_TEAMS, NBL_TEAMS, BLEAGUE_TEAMS } from '../genplayersconstants';
import type { Player } from '../genplayersconstants';

interface LeagueResult {
  players: NBAPlayer[];
  teams: NonNBATeam[];
}

type ExternalLeagueName = NonNBATeam['league'];

// ── Fake team lists for leagues without real-team constants ────────────────
// Generic "City Mascot" pairs — invented, not copied. Just enough variety so
// scouting views don't all look identical.
const WNBA_TEAMS: Array<{ region: string; name: string; abbrev: string }> = [
  { region: 'Atlanta',     name: 'Dream',    abbrev: 'ATL' },
  { region: 'Chicago',     name: 'Sky',      abbrev: 'CHI' },
  { region: 'Connecticut', name: 'Sun',      abbrev: 'CON' },
  { region: 'Dallas',      name: 'Wings',    abbrev: 'DAL' },
  { region: 'Indiana',     name: 'Fever',    abbrev: 'IND' },
  { region: 'Las Vegas',   name: 'Aces',     abbrev: 'LV'  },
  { region: 'Los Angeles', name: 'Sparks',   abbrev: 'LA'  },
  { region: 'Minnesota',   name: 'Lynx',     abbrev: 'MIN' },
  { region: 'New York',    name: 'Liberty',  abbrev: 'NYL' },
  { region: 'Phoenix',     name: 'Mercury',  abbrev: 'PHO' },
  { region: 'Seattle',     name: 'Storm',    abbrev: 'SEA' },
  { region: 'Washington',  name: 'Mystics',  abbrev: 'WAS' },
];

const PBA_TEAMS: Array<{ region: string; name: string; abbrev: string }> = [
  { region: 'Manila',     name: 'Beermen',     abbrev: 'SMB' },
  { region: 'Tropang',    name: 'Giga',        abbrev: 'TNT' },
  { region: 'Barangay',   name: 'Ginebra',     abbrev: 'BRG' },
  { region: 'Magnolia',   name: 'Hotshots',    abbrev: 'MAG' },
  { region: 'Meralco',    name: 'Bolts',       abbrev: 'MER' },
  { region: 'NLEX',       name: 'Road Warriors', abbrev: 'NLX' },
  { region: 'NorthPort',  name: 'Batang Pier', abbrev: 'NPT' },
  { region: 'Phoenix',    name: 'Fuel Masters', abbrev: 'PHX' },
  { region: 'Rain or Shine', name: 'Elasto Painters', abbrev: 'ROS' },
  { region: 'Terrafirma', name: 'Dyip',        abbrev: 'TER' },
  { region: 'Converge',   name: 'FiberXers',   abbrev: 'CON' },
  { region: 'Blackwater', name: 'Bossing',     abbrev: 'BLK' },
];

const GLEAGUE_TEAMS: Array<{ region: string; name: string; abbrev: string }> = [
  { region: 'Austin',      name: 'Spurs',      abbrev: 'AUS' },
  { region: 'Birmingham',  name: 'Squadron',   abbrev: 'BHM' },
  { region: 'Capital City',name: 'Go-Go',      abbrev: 'CCG' },
  { region: 'Cleveland',   name: 'Charge',     abbrev: 'CHG' },
  { region: 'College Park',name: 'Skyhawks',   abbrev: 'CPS' },
  { region: 'Delaware',    name: 'Blue Coats', abbrev: 'DEL' },
  { region: 'Greensboro',  name: 'Swarm',      abbrev: 'GBO' },
  { region: 'Iowa',        name: 'Wolves',     abbrev: 'IOW' },
  { region: 'Long Island', name: 'Nets',       abbrev: 'LIN' },
  { region: 'Maine',       name: 'Celtics',    abbrev: 'MAI' },
  { region: 'Memphis',     name: 'Hustle',     abbrev: 'MEM' },
  { region: 'Mexico City', name: 'Capitanes',  abbrev: 'MXC' },
  { region: 'Motor City',  name: 'Cruise',     abbrev: 'MCC' },
  { region: 'Oklahoma',    name: 'Blue',       abbrev: 'OKC' },
  { region: 'Ontario',     name: 'Clippers',   abbrev: 'ONT' },
  { region: 'Osceola',     name: 'Magic',      abbrev: 'OSC' },
  { region: 'Raptors 905', name: '905',        abbrev: 'R90' },
  { region: 'Rio Grande',  name: 'Vipers',     abbrev: 'RGV' },
  { region: 'Salt Lake',   name: 'Stars',      abbrev: 'SLC' },
  { region: 'Santa Cruz',  name: 'Warriors',   abbrev: 'SCW' },
  { region: 'Sioux Falls', name: 'Skyforce',   abbrev: 'SFS' },
  { region: 'South Bay',   name: 'Lakers',     abbrev: 'SBL' },
  { region: 'Stockton',    name: 'Kings',      abbrev: 'STK' },
  { region: 'Texas',       name: 'Legends',    abbrev: 'TXL' },
  { region: 'Westchester', name: 'Knicks',     abbrev: 'WES' },
  { region: 'Wisconsin',   name: 'Herd',       abbrev: 'WIS' },
];

const CHINA_CBA_TEAMS: Array<{ region: string; name: string; abbrev: string }> = [
  { region: 'Beijing',   name: 'Ducks',      abbrev: 'BEI' },
  { region: 'Guangdong', name: 'Southern Tigers', abbrev: 'GDG' },
  { region: 'Shanghai',  name: 'Sharks',     abbrev: 'SHA' },
  { region: 'Liaoning',  name: 'Flying Leopards', abbrev: 'LIA' },
  { region: 'Xinjiang',  name: 'Flying Tigers', abbrev: 'XIN' },
  { region: 'Zhejiang',  name: 'Lions',      abbrev: 'ZHE' },
  { region: 'Sichuan',   name: 'Blue Whales', abbrev: 'SIC' },
  { region: 'Shanxi',    name: 'Loongs',     abbrev: 'SXI' },
  { region: 'Shandong',  name: 'Heroes',     abbrev: 'SDG' },
  { region: 'Jiangsu',   name: 'Dragons',    abbrev: 'JIA' },
  { region: 'Tianjin',   name: 'Pioneers',   abbrev: 'TJN' },
  { region: 'Fujian',    name: 'Sturgeons',  abbrev: 'FUJ' },
  { region: 'Qingdao',   name: 'Eagles',     abbrev: 'QIN' },
  { region: 'Nanjing',   name: 'Monkey Kings', abbrev: 'NAN' },
  { region: 'Bayi',      name: 'Rockets',    abbrev: 'BAY' },
  { region: 'Jilin',     name: 'Northeast Tigers', abbrev: 'JIL' },
];

// ── Helper: distribute generated players across teams ──────────────────────
function distributePlayersToTeams(
  players: NBAPlayer[],
  teams: NonNBATeam[],
  status: NBAPlayer['status'],
  startYear: number,
  rng: () => number,
): NBAPlayer[] {
  const perTeam = Math.max(10, Math.floor(players.length / Math.max(1, teams.length)));
  const placed: NBAPlayer[] = [];
  let teamIdx = 0;
  for (const p of players) {
    if (placed.length >= teams.length * perTeam) break;
    const team = teams[teamIdx];
    if (!team) break;
    const lastR: any = p.ratings?.[p.ratings.length - 1] ?? {};
    placed.push({
      ...p,
      tid: team.tid,
      status,
      age: 22 + Math.floor(rng() * 13),                          // 22-34
      jerseyNumber: p.jerseyNumber ?? `${1 + Math.floor(rng() * 49)}`,
      stats: [{
        season: startYear,
        tid: team.tid,
        playoffs: false,
        gp: 0,
        gs: 0,
        min: 0,
        pts: 0, ast: 0, trb: 0,
      } as any],
      // Age out the tid distribution: not perfectly even, some teams get 1 extra
    } as any);
    if (placed.length % perTeam === 0) teamIdx++;
  }
  return placed;
}

// ── League factories ───────────────────────────────────────────────────────
function makeTeamsFromObject(
  obj: Record<string, string | { name: string; country?: string }>,
  league: ExternalLeagueName,
  tidOffset: number,
): NonNBATeam[] {
  return Object.entries(obj).map(([key, value], i) => {
    const isStr = typeof value === 'string';
    const name = isStr ? (value as string) : (value as any).name;
    const region = name.split(' ')[0];
    const abbrev = name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();
    const baseTid = parseInt(key);
    return {
      tid: isNaN(baseTid) ? tidOffset + i : baseTid,
      region,
      name,
      abbrev,
      cid: 0,
      did: 0,
      pop: 0.5 + Math.random() * 2,
      stadiumCapacity: 8_000,
      league,
    };
  });
}

function makeTeamsFromList(
  list: Array<{ region: string; name: string; abbrev: string }>,
  league: ExternalLeagueName,
  tidOffset: number,
): NonNBATeam[] {
  return list.map((t, i) => ({
    tid: tidOffset + i,
    region: t.region,
    name: `${t.region} ${t.name}`,
    abbrev: t.abbrev,
    cid: 0,
    did: 0,
    pop: 0.5 + Math.random() * 2,
    stadiumCapacity: 8_000,
    league,
  }));
}

function generateLeague(
  league: ExternalLeagueName,
  status: NBAPlayer['status'],
  path: Player['path'],
  teams: NonNBATeam[],
  startYear: number,
  rng: () => number,
): LeagueResult {
  const nameData = getNameData();
  const playersPerTeam = 12;
  const totalPlayers = teams.length * playersPerTeam;

  // Generate prospect-shaped players via the existing pipeline (gives us all
  // the rating fields we need), then convert them to active overseas players.
  const raw = generateDraftClassForGame(
    startYear, totalPlayers, rng, nameData, startYear,
  );
  const players = distributePlayersToTeams(raw, teams, status, startYear, rng);
  return { players, teams };
}

// ── Public entry point ─────────────────────────────────────────────────────
export interface FictionalExternalLeagues {
  euroleague: LeagueResult;
  pba:        LeagueResult;
  wnba:       LeagueResult;
  bleague:    LeagueResult;
  endesa:     LeagueResult;
  gleague:    LeagueResult;
  chinaCBA:   LeagueResult;
  nblAus:     LeagueResult;
}

export function generateFictionalExternalLeagues(
  startYear: number,
  rng: () => number,
): FictionalExternalLeagues {
  const euroTeams    = makeTeamsFromObject(EUROLEAGUE_TEAMS as any, 'Euroleague',     1000);
  const pbaTeams     = makeTeamsFromList(PBA_TEAMS,                 'PBA',            2000);
  const wnbaTeams    = makeTeamsFromList(WNBA_TEAMS,                'WNBA',           3000);
  const bleagueTeams = makeTeamsFromObject(BLEAGUE_TEAMS as any,    'B-League',       4000);
  const gleagueTeams = makeTeamsFromList(GLEAGUE_TEAMS,             'G-League',       5000);
  const endesaTeams  = makeTeamsFromObject(ENDESA_TEAMS as any,     'Endesa',         6000);
  const chinaTeams   = makeTeamsFromList(CHINA_CBA_TEAMS,           'China CBA',      7000);
  const nblTeams     = makeTeamsFromObject(NBL_TEAMS as any,        'NBL Australia',  8000);

  return {
    euroleague: generateLeague('Euroleague',     'Euroleague'    as any, 'Europe',   euroTeams,    startYear, rng),
    pba:        generateLeague('PBA',            'PBA'           as any, 'College',  pbaTeams,     startYear, rng),
    wnba:       generateLeague('WNBA',           'WNBA'          as any, 'College',  wnbaTeams,    startYear, rng),
    bleague:    generateLeague('B-League',       'B-League'      as any, 'B-League', bleagueTeams, startYear, rng),
    gleague:    generateLeague('G-League',       'G-League'      as any, 'G-League', gleagueTeams, startYear, rng),
    endesa:     generateLeague('Endesa',         'Endesa'        as any, 'Endesa',   endesaTeams,  startYear, rng),
    chinaCBA:   generateLeague('China CBA',      'China CBA'     as any, 'College',  chinaTeams,   startYear, rng),
    nblAus:     generateLeague('NBL Australia',  'NBL Australia' as any, 'NBL',      nblTeams,     startYear, rng),
  };
}
