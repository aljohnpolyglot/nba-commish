import type { GameResult } from './types';
import { StatGenerator } from './StatGenerator';
import { getPlayerShootingPoints, reconcileTeamPointsToScore } from './GameSimulator/engineBoxScore';
import { annotateFourthQuarterPoints } from './fourthQuarterStats';

const points = (stats: GameResult['homeStats']): number =>
  (stats ?? []).reduce((sum, stat) => sum + Number(stat.pts ?? 0), 0);

export function normalizeGameResultScoreIntegrity<T extends GameResult>(result: T): T {
  const shootingPoints = (stats: GameResult['homeStats']) => (stats ?? []).reduce(
    (sum, stat) => sum + getPlayerShootingPoints(stat, result.gameRules),
    0,
  );
  const shootingTotalsApply = result.gameRules?.teamFoulPenaltyMode !== 'award_goal';
  if (
    points(result.homeStats) === result.homeScore
    && points(result.awayStats) === result.awayScore
    && (!shootingTotalsApply || (
      shootingPoints(result.homeStats) === result.homeScore
      && shootingPoints(result.awayStats) === result.awayScore
    ))
  ) return result;
  const homeStats = (result.homeStats ?? []).map(stat => ({ ...stat }));
  const awayStats = (result.awayStats ?? []).map(stat => ({ ...stat }));
  reconcileTeamPointsToScore(homeStats, result.homeScore, result.gameRules);
  reconcileTeamPointsToScore(awayStats, result.awayScore, result.gameRules);

  const homeAdvanced = StatGenerator.generateAdvancedStats(homeStats, awayStats, homeStats.map(stat => stat.pm ?? 0));
  const awayAdvanced = StatGenerator.generateAdvancedStats(awayStats, homeStats, awayStats.map(stat => stat.pm ?? 0));
  homeStats.forEach((stat, index) => Object.assign(stat, homeAdvanced[index]));
  awayStats.forEach((stat, index) => Object.assign(stat, awayAdvanced[index]));

  const quarterScores = {
    home: [...(result.quarterScores?.home ?? [])],
    away: [...(result.quarterScores?.away ?? [])],
  };
  const otCount = Math.max(0, Number(result.otCount ?? 0));
  const numQuarters = Math.max(1, Math.min(quarterScores.home.length, quarterScores.away.length) - otCount);
  annotateFourthQuarterPoints(homeStats, awayStats, quarterScores, otCount, {
    numQuarters,
    quarterLengthSeconds: 720,
    overtimeLengthSeconds: 300,
  });

  return { ...result, homeStats, awayStats, quarterScores };
}

const finiteNonNegative = (value: unknown): boolean => Number.isFinite(Number(value)) && Number(value) >= 0;

export function validateGameResultContract(
  result: GameResult,
  options: { allowTies?: boolean; isPostseason?: boolean } = {},
): void {
  const fail = (detail: string): never => {
    throw new Error(`Simulation result score contract failed: ${detail}`);
  };
  if (!Array.isArray(result.homeStats) || !Array.isArray(result.awayStats)) fail('player lines are missing');
  if (result.homeStats.length === 0 || result.awayStats.length === 0) fail('empty player lines in a normal game');
  if (!finiteNonNegative(result.homeScore) || !finiteNonNegative(result.awayScore)) fail('team scores must be finite and nonnegative');
  if (points(result.homeStats) !== result.homeScore) fail(`home player points ${points(result.homeStats)} do not equal ${result.homeScore}`);
  if (points(result.awayStats) !== result.awayScore) fail(`away player points ${points(result.awayStats)} do not equal ${result.awayScore}`);
  if (result.gameRules?.teamFoulPenaltyMode !== 'award_goal') {
    const homeShootingPoints = result.homeStats.reduce((sum, line) => sum + getPlayerShootingPoints(line, result.gameRules), 0);
    const awayShootingPoints = result.awayStats.reduce((sum, line) => sum + getPlayerShootingPoints(line, result.gameRules), 0);
    if (homeShootingPoints !== result.homeScore) fail(`home shooting totals produce ${homeShootingPoints}, not ${result.homeScore}`);
    if (awayShootingPoints !== result.awayScore) fail(`away shooting totals produce ${awayShootingPoints}, not ${result.awayScore}`);
  }

  const numericFields = ['min', 'pts', 'reb', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'fgm', 'fga', 'threePm', 'threePa', 'ftm', 'fta', 'pf'] as const;
  for (const line of [...result.homeStats, ...result.awayStats]) {
    for (const field of numericFields) {
      if (!finiteNonNegative(line[field])) fail(`${line.playerId || line.name} has invalid ${field}`);
    }
    if (line.fgm > line.fga || line.threePm > line.threePa || line.ftm > line.fta) {
      fail(`${line.playerId || line.name} has impossible shooting totals`);
    }
  }

  const homeIds = new Set(result.homeStats.map(line => String(line.playerId)));
  const overlappingIds = [...new Set(result.awayStats
    .map(line => String(line.playerId))
    .filter(playerId => homeIds.has(playerId)))];
  if (overlappingIds.length > 0) {
    fail(`a player appears for both teams; game=${result.gameId} home=${result.homeTeamId} away=${result.awayTeamId} overlap=${overlappingIds.join(',')}`);
  }
  if (result.quarterScores) {
    const homePeriods = result.quarterScores.home ?? [];
    const awayPeriods = result.quarterScores.away ?? [];
    if (homePeriods.length === 0 || homePeriods.length !== awayPeriods.length) fail('period arrays are missing or mismatched');
    if (homePeriods.some(value => !finiteNonNegative(value)) || awayPeriods.some(value => !finiteNonNegative(value))) {
      fail('period points must be finite and nonnegative');
    }
    if (homePeriods.reduce((sum, value) => sum + value, 0) !== result.homeScore) fail('home period points do not equal team score');
    if (awayPeriods.reduce((sum, value) => sum + value, 0) !== result.awayScore) fail('away period points do not equal team score');
    const overtimePeriods = Math.max(0, homePeriods.length - 4);
    if (Boolean(result.isOT) !== (overtimePeriods > 0) || Number(result.otCount ?? 0) !== overtimePeriods) {
      fail('overtime metadata does not match period totals');
    }
  }
  if (result.homeScore === result.awayScore) {
    if (!options.allowTies || options.isPostseason) fail('a completed game cannot remain tied under the active rules');
    if (result.winnerId !== -1 || result.isDraw !== true) fail('a draw must carry winnerId=-1 and isDraw=true');
    return;
  }
  const expectedWinner = result.homeScore > result.awayScore ? result.homeTeamId : result.awayTeamId;
  if (Number(result.winnerId) !== Number(expectedWinner)) fail('winner does not match the final score');
}
