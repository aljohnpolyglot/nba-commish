import { NBATeam } from '../types';

export interface TeamAttendanceProfile {
  teamId: number;
  arenaCapacity: number;
  fillRate: number;       // 0-1
  avgAttendance: number;  // per game, hard-capped at 25 000
  homeGames: number;
  avgTicketPrice: number; // USD
  seasonRevenue: number;  // USD (gate revenue estimate)
}

/** Best-known arena capacities for real NBA franchises.
 *  Falls back to a pop-based estimate for custom/expansion teams. */
const CAPACITY_MAP: Record<string, number> = {
  Bulls: 20917, Celtics: 19156, Knicks: 19812, Lakers: 20789,
  Warriors: 18064, Mavericks: 19200, Heat: 19600, Raptors: 19800,
  Nets: 17732, Clippers: 18000, '76ers': 20478, Bucks: 17341,
  Cavaliers: 19432, Pacers: 17923, Pistons: 20491, Wizards: 20356,
  Hornets: 19026, Hawks: 18118, Magic: 18846, Thunder: 18203,
  Nuggets: 19520, Jazz: 18306, Suns: 18422, 'Trail Blazers': 19393,
  Kings: 17583, Timberwolves: 18978, Rockets: 18055, Spurs: 18418,
  Pelicans: 17791, Grizzlies: 17794,
};

export const ARENA_HARD_CAP = 25_000;

export const getArenaCapacity = (team: NBATeam): number => {
  for (const [kw, cap] of Object.entries(CAPACITY_MAP)) {
    if (team.name.includes(kw)) return cap;
  }
  // Custom/expansion teams: scale with metro population
  const popM = (team.pop || 3_000_000) / 1_000_000;
  return Math.min(Math.round(17_500 + popM * 350), ARENA_HARD_CAP);
};

/**
 * Estimate per-game attendance and gate revenue for a team.
 *
 * Formula:
 *  fillRate = 0.57  (base)
 *           + winPct * 0.28  (winning teams draw more)
 *           + marketBonus    (larger metros up to +0.15)
 *  Attendance = min(capacity * fillRate, 25 000)
 *  Revenue    = attendance * homeGames * avgTicketPrice
 */
export const estimateAttendance = (team: NBATeam): TeamAttendanceProfile => {
  const capacity = getArenaCapacity(team);
  const gp = team.wins + team.losses || 1;
  const winPct = team.wins / gp;
  const homeGames = Math.round(gp / 2);

  const popM = (team.pop || 3_000_000) / 1_000_000;
  const marketBonus = Math.min(popM / 55, 0.15);
  const fillRate = Math.min(0.57 + winPct * 0.28 + marketBonus, 1.0);
  const avgAttendance = Math.min(Math.round(capacity * fillRate), ARENA_HARD_CAP);

  // Ticket price: bigger market + winning team = higher prices
  const avgTicketPrice = Math.round(85 + popM * 4 + winPct * 50);
  const seasonRevenue = avgAttendance * homeGames * avgTicketPrice;

  return {
    teamId: team.id,
    arenaCapacity: capacity,
    fillRate,
    avgAttendance,
    homeGames,
    avgTicketPrice,
    seasonRevenue,
  };
};

export const formatAttendance = (n: number): string =>
  n.toLocaleString('en-US');

export const formatRevM = (usd: number): string =>
  `$${(usd / 1_000_000).toFixed(1)}M`;
