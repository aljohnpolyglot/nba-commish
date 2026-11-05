import type { GameState, NBATeam } from '../../types';
import { getPopulation } from '../../data/fictionalTeams';
import {
  isHistoricalNbaWhatIfTimeline,
  timelineInputFromState,
} from '../../utils/historicalTimeline';

export const finiteFranchiseValue = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
};

export const franchiseSeed = (value: string) => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
};

export const getFranchiseMarketFactor = (team: NBATeam) => {
  const population = finiteFranchiseValue(team.pop, getPopulation(String(team.abbrev ?? '')));
  return Math.max(0.7, Math.min(1.55, 0.72 + population / 12));
};

export const getFranchisePerformanceFactor = (team: NBATeam) => {
  const games = Math.max(
    1,
    finiteFranchiseValue(team.wins) + finiteFranchiseValue(team.losses),
  );
  const winRate = finiteFranchiseValue(team.wins) / games;
  return Math.max(0.72, Math.min(1.35, 0.75 + winRate));
};

// APBR historical totals; LA Times/ESPN season reports; NBA 2023-24 official release.
const NBA_ATTENDANCE_PER_GAME = [
  [1951, 3_576],
  [1960, 5_008],
  [1966, 6_019],
  [1990, 15_690],
  [2000, 16_870],
  [2009, 17_520],
  [2012, 17_274],
  [2024, 18_324],
] as const;

// Sports Business Journal historical table and WNBA/NBA Communications 2024 release.
const WNBA_ATTENDANCE_PER_GAME = [
  [1997, 9_662],
  [2004, 8_593],
  [2019, 6_535],
  [2024, 9_807],
] as const;

// EuroLeague season averages (competition table; 2024-25 official league release).
const EUROLEAGUE_ATTENDANCE_PER_GAME = [
  [2009, 6_721],
  [2010, 6_355],
  [2011, 7_478],
  [2012, 7_333],
  [2014, 8_130],
  [2015, 8_184],
  [2016, 7_332],
  [2017, 8_472],
  [2018, 8_780],
  [2019, 8_282],
  [2020, 8_588],
  [2024, 10_383],
  [2025, 10_589],
] as const;

// PBA published league/conference averages; sparse years deliberately stay sparse.
const PBA_ATTENDANCE_PER_GAME = [
  [1996, 7_700],
  [2006, 6_647],
  [2008, 5_400],
  [2009, 7_035],
  [2011, 7_600],
] as const;

const interpolateAttendance = (year: number, points: readonly (readonly [number, number])[]) => {
  if (year <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index += 1) {
    const [nextYear, nextValue] = points[index];
    if (year > nextYear) continue;
    const [previousYear, previousValue] = points[index - 1];
    const progress = (year - previousYear) / (nextYear - previousYear);
    return previousValue + (nextValue - previousValue) * progress;
  }
  return points.at(-1)![1];
};

/** League-average attendance target from the active competition's sourced era curve. */
export const getLeagueAttendanceTarget = (year: number, uiMode?: string): number | undefined => {
  if (uiMode === 'wnba_isolated') return interpolateAttendance(year, WNBA_ATTENDANCE_PER_GAME);
  if (uiMode === 'euro_isolated' && year >= 2009) return interpolateAttendance(year, EUROLEAGUE_ATTENDANCE_PER_GAME);
  if (uiMode === 'pba_isolated' && year >= 1996) return interpolateAttendance(year, PBA_ATTENDANCE_PER_GAME);
  if (uiMode === 'nba' || uiMode === 'fictional' || !uiMode) {
    return interpolateAttendance(year, NBA_ATTENDANCE_PER_GAME);
  }
  return undefined;
};

export const getFranchiseSourceSeason = (
  state: GameState,
  requestedSeason = state.leagueStats.year,
) => {
  const historicalBranch = isHistoricalNbaWhatIfTimeline(timelineInputFromState(state));
  const branchSeason = Number(state.nbaStartYear ?? state.leagueStats.historicalEraStartYear);
  const economyBaseSeason = Number(state.franchiseEconomyBaseSeason);
  const cutoff = historicalBranch && Number.isFinite(branchSeason)
    ? branchSeason
    : Number.isFinite(economyBaseSeason)
      ? economyBaseSeason
      : requestedSeason;
  return Math.min(requestedSeason, cutoff);
};
