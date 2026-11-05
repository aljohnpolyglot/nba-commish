import type { NBAPlayer, NonNBATeam } from '../types';
import { getPinnedHistoricalGLeagueLogo } from './gleagueHistoricalLogos';

type HistoricalGLeagueTeam = {
  key: string;
  sourceTid: number;
  region: string;
  name: string;
  abbrev: string;
  colors: [string, string, string];
};

const TEAMS: Record<string, HistoricalGLeagueTeam> = {
  asheville: { key: 'asheville', sourceTid: 800, region: 'Asheville', name: 'Altitude', abbrev: 'ASH', colors: ['#1f4e79', '#f2b134', '#ffffff'] },
  charleston: { key: 'charleston', sourceTid: 808, region: 'Charleston', name: 'Lowgators', abbrev: 'CHA', colors: ['#234f3c', '#d7b56d', '#ffffff'] },
  columbus: { key: 'columbus', sourceTid: 801, region: 'Columbus', name: 'Riverdragons', abbrev: 'COL', colors: ['#6b1e2d', '#d6a14d', '#ffffff'] },
  fayetteville: { key: 'fayetteville', sourceTid: 802, region: 'Fayetteville', name: 'Patriots', abbrev: 'FAY', colors: ['#17365d', '#b52834', '#ffffff'] },
  greenville: { key: 'greenville', sourceTid: 803, region: 'Greenville', name: 'Groove', abbrev: 'GRE', colors: ['#4a246d', '#e0ad45', '#ffffff'] },
  huntsville: { key: 'huntsville', sourceTid: 804, region: 'Huntsville', name: 'Flight', abbrev: 'HUN', colors: ['#173f73', '#c9a44f', '#ffffff'] },
  mobile: { key: 'mobile', sourceTid: 805, region: 'Mobile', name: 'Revelers', abbrev: 'MOB', colors: ['#5e1c62', '#d2a542', '#ffffff'] },
  northCharleston: { key: 'northCharleston', sourceTid: 806, region: 'North Charleston', name: 'Lowgators', abbrev: 'NCL', colors: ['#234f3c', '#d7b56d', '#ffffff'] },
  roanoke: { key: 'roanoke', sourceTid: 807, region: 'Roanoke', name: 'Dazzle', abbrev: 'ROA', colors: ['#1f4a73', '#d1a239', '#ffffff'] },
  florida: { key: 'florida', sourceTid: 809, region: 'Florida', name: 'Flame', abbrev: 'FLA', colors: ['#a52720', '#e07b26', '#ffffff'] },
  albuquerque: { key: 'albuquerque', sourceTid: 810, region: 'Albuquerque', name: 'Thunderbirds', abbrev: 'ALB', colors: ['#762a83', '#d19a34', '#ffffff'] },
  arkansas: { key: 'arkansas', sourceTid: 811, region: 'Arkansas', name: 'RimRockers', abbrev: 'ARK', colors: ['#b12b2f', '#1f3b63', '#ffffff'] },
  austin: { key: 'austin', sourceTid: 812, region: 'Austin', name: 'Toros', abbrev: 'AUS', colors: ['#1c1c1c', '#b8b8b8', '#ffffff'] },
  fortWorth: { key: 'fortWorth', sourceTid: 813, region: 'Fort Worth', name: 'Flyers', abbrev: 'FTW', colors: ['#204d78', '#bc3037', '#ffffff'] },
  tulsa: { key: 'tulsa', sourceTid: 814, region: 'Tulsa', name: '66ers', abbrev: 'TUL', colors: ['#1a4275', '#c43b38', '#ffffff'] },
  anaheim: { key: 'anaheim', sourceTid: 815, region: 'Anaheim', name: 'Arsenal', abbrev: 'ANA', colors: ['#8f2638', '#283f66', '#ffffff'] },
  bakersfield: { key: 'bakersfield', sourceTid: 816, region: 'Bakersfield', name: 'Jam', abbrev: 'BAK', colors: ['#7e2a8a', '#de8b31', '#ffffff'] },
  colorado: { key: 'colorado', sourceTid: 817, region: 'Colorado', name: '14ers', abbrev: 'COL', colors: ['#1e4976', '#d8a143', '#ffffff'] },
  dakota: { key: 'dakota', sourceTid: 818, region: 'Dakota', name: 'Wizards', abbrev: 'DAK', colors: ['#4d2b72', '#c99d43', '#ffffff'] },
  idaho: { key: 'idaho', sourceTid: 819, region: 'Idaho', name: 'Stampede', abbrev: 'IDA', colors: ['#285887', '#b8292f', '#ffffff'] },
  losAngeles: { key: 'losAngeles', sourceTid: 820, region: 'Los Angeles', name: 'D-Fenders', abbrev: 'LAD', colors: ['#542583', '#fdb927', '#ffffff'] },
  siouxFalls: { key: 'siouxFalls', sourceTid: 821, region: 'Sioux Falls', name: 'Skyforce', abbrev: 'SFX', colors: ['#203f6d', '#d64836', '#ffffff'] },
};

const TEAM_KEYS_BY_SEASON: Record<number, string[]> = {
  2002: ['asheville', 'columbus', 'fayetteville', 'greenville', 'huntsville', 'mobile', 'northCharleston', 'roanoke'],
  2003: ['asheville', 'columbus', 'fayetteville', 'greenville', 'huntsville', 'mobile', 'northCharleston', 'roanoke'],
  2004: ['asheville', 'charleston', 'columbus', 'fayetteville', 'huntsville', 'roanoke'],
  2005: ['asheville', 'columbus', 'fayetteville', 'florida', 'huntsville', 'roanoke'],
  2006: ['albuquerque', 'arkansas', 'austin', 'fayetteville', 'florida', 'fortWorth', 'roanoke', 'tulsa'],
  2007: ['albuquerque', 'anaheim', 'arkansas', 'austin', 'bakersfield', 'colorado', 'dakota', 'fortWorth', 'idaho', 'losAngeles', 'siouxFalls', 'tulsa'],
};

export function buildPreSourceGLeagueTeams(season: number, tidOffset: number): NonNBATeam[] {
  return (TEAM_KEYS_BY_SEASON[season] ?? []).map(key => {
    const team = TEAMS[key];
    const imgURL = getPinnedHistoricalGLeagueLogo(key, season);
    return {
      tid: team.sourceTid + tidOffset,
      region: team.region,
      name: team.name,
      abbrev: team.abbrev,
      pop: 1,
      stadiumCapacity: 8_000,
      colors: [...team.colors],
      imgURL,
      league: 'G-League',
      identitySeasons: [{
        season,
        region: team.region,
        name: team.name,
        abbrev: team.abbrev,
        imgURL,
        colors: [...team.colors],
      }],
      seasons: [],
    };
  });
}

export function assignPreSourceGLeagueTeams(
  players: readonly NBAPlayer[],
  teams: readonly NonNBATeam[],
  maxRoster = 15,
): NBAPlayer[] {
  if (teams.length === 0) return [...players];
  const counts = new Map(teams.map(team => [team.tid, players.filter(player => player.tid === team.tid).length]));
  const assignments = new Map<string, number>();
  const candidates = players
    .filter(player => player.tid < 0 && player.status === 'G-League')
    .sort((left, right) =>
      Number(right.overallRating ?? 0) - Number(left.overallRating ?? 0)
      || Number(right.potential ?? 0) - Number(left.potential ?? 0)
      || left.name.localeCompare(right.name),
    );

  for (const player of candidates) {
    const team = [...teams]
      .filter(candidate => (counts.get(candidate.tid) ?? 0) < maxRoster)
      .sort((left, right) =>
        (counts.get(left.tid) ?? 0) - (counts.get(right.tid) ?? 0)
        || left.tid - right.tid,
      )[0];
    if (!team) break;
    assignments.set(player.internalId, team.tid);
    counts.set(team.tid, (counts.get(team.tid) ?? 0) + 1);
  }

  return players.map(player => {
    const tid = assignments.get(player.internalId);
    return tid == null ? player : { ...player, tid };
  });
}
