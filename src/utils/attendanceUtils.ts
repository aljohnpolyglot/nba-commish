import type { GameState, NBATeam } from '../types';
import { getFranchiseMatchdayProjection } from '../services/franchises/franchiseMatchday';
import { getLeagueAttendanceTarget } from '../services/franchises/franchiseMath';
import { matchesScheduleSeason } from '../services/competition/competitionSeasonState';

export interface TeamAttendanceProfile {
  teamId: number;
  arenaCapacity: number;
  fillRate: number;       // 0-1.025
  avgAttendance: number;  // per game, hard-capped at 25 000
  homeGames: number;
  avgTicketPrice: number; // USD
  seasonRevenue: number;  // USD (gate revenue estimate)
  source: 'actual' | 'projection' | 'estimate';
  playedHomeGames: number;
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
  const savedCapacity = Number(team.stadiumCapacity);
  if (Number.isFinite(savedCapacity) && savedCapacity >= 5_000) {
    return Math.min(Math.round(savedCapacity), ARENA_HARD_CAP);
  }
  for (const [kw, cap] of Object.entries(CAPACITY_MAP)) {
    if (team.name.includes(kw)) return cap;
  }
  // Custom/expansion teams: scale with metro population. `pop` is in MILLIONS
  // per BBGM convention (e.g. NYC ≈ 8.6, Memphis ≈ 1.3) — broader codebase
  // (mood/freeAgencyBidding/externalRoster) all use millions.
  const popM = team.pop ?? 3.0;
  // Spread: 1M-pop city → ~17,800; 13M city → ~24,000 (tightly capped at 25k).
  return Math.min(Math.round(17_500 + popM * 500), ARENA_HARD_CAP);
};

const ATTENDANCE_ERA_BASELINES = [
  { year: 1950, fill: 0.62 },
  { year: 1970, fill: 0.72 },
  { year: 1990, fill: 0.84 },
  { year: 2010, fill: 0.9 },
  { year: 2020, fill: 0.94 },
  { year: 2026, fill: 0.962 },
] as const;

const getAttendanceEraBaseline = (seasonYear?: number): number => {
  const year = Number(seasonYear ?? 2026);
  if (!Number.isFinite(year) || year >= ATTENDANCE_ERA_BASELINES.at(-1)!.year) return ATTENDANCE_ERA_BASELINES.at(-1)!.fill;
  if (year <= ATTENDANCE_ERA_BASELINES[0].year) return ATTENDANCE_ERA_BASELINES[0].fill;
  for (let index = 1; index < ATTENDANCE_ERA_BASELINES.length; index += 1) {
    const previous = ATTENDANCE_ERA_BASELINES[index - 1];
    const next = ATTENDANCE_ERA_BASELINES[index];
    if (year > next.year) continue;
    const progress = (year - previous.year) / (next.year - previous.year);
    return previous.fill + (next.fill - previous.fill) * progress;
  }
  return ATTENDANCE_ERA_BASELINES.at(-1)!.fill;
};

const TICKET_PRICE_ERA_MULTIPLIERS = [
  { year: 1950, mult: 0.06 },
  { year: 1960, mult: 0.08 },
  { year: 1970, mult: 0.12 },
  { year: 1980, mult: 0.18 },
  { year: 1990, mult: 0.35 },
  { year: 2000, mult: 0.55 },
  { year: 2010, mult: 0.75 },
  { year: 2020, mult: 0.95 },
  { year: 2026, mult: 1.0 },
] as const;

export const getTicketPriceEraMultiplier = (seasonYear?: number): number => {
  const year = Number(seasonYear ?? 2026);
  if (!Number.isFinite(year)) return 1;
  if (year <= TICKET_PRICE_ERA_MULTIPLIERS[0].year) return TICKET_PRICE_ERA_MULTIPLIERS[0].mult;
  for (let i = 1; i < TICKET_PRICE_ERA_MULTIPLIERS.length; i++) {
    const prev = TICKET_PRICE_ERA_MULTIPLIERS[i - 1];
    const next = TICKET_PRICE_ERA_MULTIPLIERS[i];
    if (year <= next.year) {
      const t = (year - prev.year) / (next.year - prev.year);
      return prev.mult + (next.mult - prev.mult) * t;
    }
  }
  return 1;
};

/**
 * Estimate per-game attendance and gate revenue for a team.
 *
 * Formula:
 *  fillRate = era baseline + performance swing + market stability
 *  Attendance = min(capacity * fillRate, 25 000)
 *  Revenue    = attendance * homeGames * avgTicketPrice
 */
export const estimateAttendance = (team: NBATeam, seasonYear?: number, uiMode?: string): TeamAttendanceProfile => {
  const capacity = getArenaCapacity(team);
  const gp = team.wins + team.losses || 1;
  const winPct = team.wins / gp;
  const homeGames = Math.round(gp / 2);

  const popM = team.pop ?? 3.0;
  const marketBonus = Math.min(popM / 400, 0.03);
  const performanceSwing = (winPct - 0.5) * 0.35;
  const leagueTarget = getLeagueAttendanceTarget(Number(seasonYear ?? 2026), uiMode);
  const baselineFill = leagueTarget == null ? getAttendanceEraBaseline(seasonYear) : leagueTarget / capacity;
  const fillRate = Math.max(0.08, Math.min(1.025, baselineFill + performanceSwing + marketBonus));
  const avgAttendance = Math.min(Math.round(capacity * fillRate), ARENA_HARD_CAP);

  // Ticket price: bigger market + winning team = higher prices.
  // NYC/LA ≈ $135, Memphis ≈ $90, scales linearly with pop.
  const modernTicketPrice = 85 + popM * 5 + winPct * 50;
  const avgTicketPrice = Math.max(1, Math.round(modernTicketPrice * getTicketPriceEraMultiplier(seasonYear)));
  const seasonRevenue = avgAttendance * homeGames * avgTicketPrice;

  return {
    teamId: team.id,
    arenaCapacity: capacity,
    fillRate,
    avgAttendance,
    homeGames,
    avgTicketPrice,
    seasonRevenue,
    source: 'estimate',
    playedHomeGames: 0,
  };
};

export const resolveAttendanceProfile = (state: GameState, team: NBATeam): TeamAttendanceProfile => {
  const franchise = team.franchiseOperations;
  if (!franchise) return estimateAttendance(team, state.leagueStats.year, state.leagueStats.uiMode);
  const projection = getFranchiseMatchdayProjection(state, team, franchise);
  const playedHomeGames = (state.schedule ?? []).filter(game =>
    game.homeTid === team.id
    && game.played
    && Number.isFinite(game.attendance)
    && matchesScheduleSeason(game, state.leagueStats.year)
    && !game.isPreseason
    && !game.isAllStar
    && !game.isExhibition
    && !game.isPlayoff
    && !game.isPlayIn
    && !game.excludeFromRecord,
  );
  const projectedAttendance = Math.max(0, projection.attendance);
  const avgAttendance = playedHomeGames.length > 0
    ? Math.round(playedHomeGames.reduce((sum, game) => sum + Number(game.attendance), 0) / playedHomeGames.length)
    : projectedAttendance;
  const avgTicketPrice = projectedAttendance > 0
    ? Math.round(projection.revenuePerGame / projectedAttendance)
    : 0;
  return {
    teamId: team.id,
    arenaCapacity: projection.capacity,
    fillRate: projection.capacity > 0 ? Math.min(1.025, avgAttendance / projection.capacity) : 0,
    avgAttendance,
    homeGames: projection.homeGames,
    avgTicketPrice,
    seasonRevenue: avgAttendance * projection.homeGames * avgTicketPrice,
    source: playedHomeGames.length > 0 ? 'actual' : 'projection',
    playedHomeGames: playedHomeGames.length,
  };
};

export const formatAttendance = (n: number): string =>
  n.toLocaleString('en-US');

export const formatRevM = (usd: number): string =>
  `$${(usd / 1_000_000).toFixed(1)}M`;
