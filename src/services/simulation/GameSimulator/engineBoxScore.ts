import { StatGenerator } from '../StatGenerator';
import type { NBAPlayer as Player } from '../../../types';
import type { DefensiveRatingProfile } from '../StatGenerator/advancedstats';
import { R } from '../StatGenerator/helpers';
import { GameRuleConfig, PlayerGameStats } from '../types';
import { ADVANCED_STAT_FORMULA_VERSION } from '../../../utils/advancedStatCalibration';
import { applyPMToStats, generateSyntheticPM } from './syntheticPM';

export function reconcileTeamPointsToScore(
  stats: PlayerGameStats[],
  target: number,
  rules?: Pick<GameRuleConfig, 'fieldGoalValue' | 'dunkValue' | 'freeThrowsEnabled' | 'teamFoulPenaltyMode'>,
): void {
  if (rules?.teamFoulPenaltyMode !== 'award_goal') {
    for (const player of stats) player.pts = getPlayerShootingPoints(player, rules);
  }
  let delta = target - stats.reduce((sum, player) => sum + (player.pts || 0), 0);
  if (delta === 0) return;

  const teamFga = stats.reduce((sum, player) => sum + (player.fga || 0), 0);
  const teamFgm = stats.reduce((sum, player) => sum + (player.fgm || 0), 0);
  const teamFta0 = stats.reduce((sum, player) => sum + (player.fta || 0), 0);
  const teamFgPct = teamFga > 0 ? teamFgm / teamFga : 1;
  const teamFtaFga0 = teamFga > 0 ? teamFta0 / teamFga : 0;
  const freeThrowsEnabled = rules?.freeThrowsEnabled ?? true;
  const fieldGoalValue = rules?.fieldGoalValue ?? 2;
  const ftPumpAllowed = freeThrowsEnabled && teamFgPct >= 0.44 && teamFtaFga0 < 0.45;
  const teamFtaCeil = Math.max(0, Math.round(teamFga * 0.45));

  const sorted = delta < 0
    ? [...stats].sort((a, b) => a.pts - b.pts)
    : [...stats].sort((a, b) => b.pts - a.pts);

  let teamFtaRunning = teamFta0;
  for (const player of sorted) {
    if (delta === 0) break;
    if (delta > 0) {
      if (!ftPumpAllowed) continue;
      const headroom = Math.max(0, teamFtaCeil - teamFtaRunning);
      if (headroom <= 0) break;
      const add = Math.min(delta, 4, headroom);
      if (add <= 0) continue;
      player.ftm += add;
      player.fta = Math.max(player.fta, player.ftm);
      player.pts += add;
      delta -= add;
      teamFtaRunning += add;
    } else {
      const remove = Math.min(-delta, Math.min(4, Math.max(0, player.ftm)));
      if (remove > 0) {
        player.ftm -= remove;
        player.pts -= remove;
        delta += remove;
      }
    }
  }

  if (delta === 0) return;

  const pass2 = delta < 0
    ? [...stats].sort((a, b) => a.pts - b.pts)
    : [...stats].sort((a, b) => b.pts - a.pts);
  for (const player of pass2) {
    if (delta === 0) break;
    const twoPm = Math.max(0, player.fgm - (player.threePm ?? 0) - (player.fourPm ?? 0));
    if (delta > 0) {
      if (delta < fieldGoalValue && freeThrowsEnabled) {
        player.ftm += 1;
        player.fta = Math.max(player.fta, player.ftm);
        player.pts += 1;
        delta = 0;
        break;
      }
      player.fgm += 1;
      player.fga = Math.max(player.fga, player.fgm);
      player.pts += fieldGoalValue;
      delta -= fieldGoalValue;
    } else if (twoPm > 0 && delta <= -fieldGoalValue) {
      player.fgm -= 1;
      player.pts -= fieldGoalValue;
      delta += fieldGoalValue;
    } else if (delta === -1 && player.ftm > 0) {
      player.ftm -= 1;
      player.pts -= 1;
      delta += 1;
    }
  }

  const fallback = [...stats].sort((a, b) => b.pts - a.pts);
  while (delta !== 0 && fallback.length > 0) {
    if (delta > 0) {
      const player = fallback[0];
      if (fieldGoalValue === 1) {
        player.fgm += 1;
        player.fga = Math.max(player.fga, player.fgm);
        player.pts += 1;
        delta -= 1;
      } else if (freeThrowsEnabled) {
        player.ftm += 1;
        player.fta = Math.max(player.fta, player.ftm);
        player.pts += 1;
        delta -= 1;
      } else {
        throw new Error(`Unable to reconcile player points to team score: ${target} (${delta} remaining)`);
      }
      continue;
    }

    const freeThrowScorer = freeThrowsEnabled ? fallback.find(player => player.ftm > 0) : undefined;
    if (freeThrowScorer) {
      freeThrowScorer.ftm -= 1;
      freeThrowScorer.pts -= 1;
      delta += 1;
      continue;
    }

    const fourPointScorer = fallback.find(player => (player.fourPm ?? 0) > 0);
    if (fourPointScorer) {
      fourPointScorer.fourPm = (fourPointScorer.fourPm ?? 0) - 1;
      fourPointScorer.fourPa = Math.max(fourPointScorer.fourPm, (fourPointScorer.fourPa ?? 0) - 1);
      fourPointScorer.threePm += 1;
      fourPointScorer.threePa = Math.max(fourPointScorer.threePa + 1, fourPointScorer.threePm);
      fourPointScorer.pts -= 1;
      delta += 1;
      continue;
    }

    const threePointScorer = fallback.find(player => player.threePm > 0);
    if (threePointScorer) {
      threePointScorer.threePm -= 1;
      threePointScorer.pts -= 1;
      delta += 1;
      continue;
    }

    const twoPointScorer = fallback.find(player => (
      player.fgm - (player.threePm ?? 0) - (player.fourPm ?? 0)
    ) > 0);
    if (!twoPointScorer) break;
    twoPointScorer.fgm -= 1;
    if (fieldGoalValue === 1) {
      twoPointScorer.pts -= 1;
      delta += 1;
    } else if (freeThrowsEnabled) {
      twoPointScorer.ftm += 1;
      twoPointScorer.fta = Math.max(twoPointScorer.fta, twoPointScorer.ftm);
      twoPointScorer.pts -= 1;
      delta += 1;
    } else {
      twoPointScorer.fgm += 1;
      break;
    }
  }

  if (delta !== 0) {
    throw new Error(`Unable to reconcile player points to team score: ${target} (${delta} remaining)`);
  }
}

export function getPlayerShootingPoints(
  player: PlayerGameStats,
  rules?: Pick<GameRuleConfig, 'fieldGoalValue' | 'dunkValue' | 'freeThrowsEnabled'>,
): number {
  const fieldGoalValue = rules?.fieldGoalValue ?? 2;
  const threePm = Math.max(0, player.threePm ?? 0);
  const fourPm = Math.max(0, player.fourPm ?? 0);
  const ordinaryMakes = Math.max(0, (player.fgm ?? 0) - threePm - fourPm);
  const dunks = Math.min(ordinaryMakes, Math.max(0, player.dunks ?? 0));
  return ordinaryMakes * fieldGoalValue
    + threePm * 3
    + fourPm * 4
    + (rules?.freeThrowsEnabled === false ? 0 : Math.max(0, player.ftm ?? 0))
    + dunks * ((rules?.dunkValue ?? 2) - fieldGoalValue);
}

function assignAdvancedStats(
  stats: PlayerGameStats[],
  advanced: ReturnType<typeof StatGenerator.generateAdvancedStats>
): void {
  stats.forEach((player, index) => {
    Object.assign(player, {
      _advancedStatVersion: ADVANCED_STAT_FORMULA_VERSION,
      tsPct: advanced[index].tsPct,
      efgPct: advanced[index].efgPct,
      per: advanced[index].per,
      ortg: advanced[index].ortg,
      drtg: advanced[index].drtg,
      usgPct: advanced[index].usgPct,
      bpm: advanced[index].bpm,
      obpm: advanced[index].obpm,
      dbpm: advanced[index].dbpm,
      ws: advanced[index].ws,
      ows: advanced[index].ows,
      dws: advanced[index].dws,
      vorp: advanced[index].vorp,
      ewa: advanced[index].ewa,
      gameScore: advanced[index].gameScore,
      orbPct: advanced[index].orbPct,
      drbPct: advanced[index].drbPct,
      trbPct: advanced[index].trbPct,
      astPct: advanced[index].astPct,
      stlPct: advanced[index].stlPct,
      blkPct: advanced[index].blkPct,
      tovPct: advanced[index].tovPct,
      deflections: advanced[index].deflections,
      chargesDrawn: advanced[index].chargesDrawn,
    });
  });
}

export function getNormalizedFieldGoalAttempts(player: PlayerGameStats, multiplier: number) {
  const threePa = Math.max(player.threePm, Math.round(player.threePa * multiplier));
  const fourPm = player.fourPm ?? 0;
  const fourPa = Math.max(fourPm, Math.round((player.fourPa ?? 0) * multiplier));
  const ordinaryMakes = Math.max(0, player.fgm - player.threePm - fourPm);
  return {
    fga: Math.max(ordinaryMakes + threePa + fourPa, Math.round(player.fga * multiplier)),
    threePa,
    fourPa,
    ...(player.fgaAtRim == null ? {} : { fgaAtRim: Math.max(player.fgAtRim ?? 0, Math.round(player.fgaAtRim * multiplier)) }),
    ...(player.fgaLowPost == null ? {} : { fgaLowPost: Math.max(player.fgLowPost ?? 0, Math.round(player.fgaLowPost * multiplier)) }),
    ...(player.fgaMidRange == null ? {} : { fgaMidRange: Math.max(player.fgMidRange ?? 0, Math.round(player.fgaMidRange * multiplier)) }),
  };
}

function normalizeReportedFieldGoalAttempts(stats: PlayerGameStats[], multiplier: number): void {
  if (multiplier === 1) return;
  for (const player of stats) {
    const normalized = getNormalizedFieldGoalAttempts(player, multiplier);
    player.fga = normalized.fga;
    player.threePa = normalized.threePa;
    if (player.fourPa != null || normalized.fourPa > 0) player.fourPa = normalized.fourPa;
    if (normalized.fgaAtRim != null) player.fgaAtRim = normalized.fgaAtRim;
    if (normalized.fgaLowPost != null) player.fgaLowPost = normalized.fgaLowPost;
    if (normalized.fgaMidRange != null) player.fgaMidRange = normalized.fgaMidRange;
  }
}

export function refreshGameResultAdvancedStats(
  homeStats: PlayerGameStats[],
  awayStats: PlayerGameStats[],
  homePlayers: Player[] = [],
  awayPlayers: Player[] = [],
  season: number = new Date().getFullYear(),
): void {
  const buildDefenseMap = (players: Player[]): Map<string, DefensiveRatingProfile> => new Map(
    players.map(player => [player.internalId, { diq: R(player, 'diq', season), hgt: R(player, 'hgt', season) }]),
  );
  const homeAdv = StatGenerator.generateAdvancedStats(
    homeStats,
    awayStats,
    homeStats.map(player => player.pm ?? 0),
    undefined,
    buildDefenseMap(homePlayers),
  );
  const awayAdv = StatGenerator.generateAdvancedStats(
    awayStats,
    homeStats,
    awayStats.map(player => player.pm ?? 0),
    undefined,
    buildDefenseMap(awayPlayers),
  );
  assignAdvancedStats(homeStats, homeAdv);
  assignAdvancedStats(awayStats, awayAdv);
}

export function finalizeBoxScore(
  homeStats: PlayerGameStats[],
  awayStats: PlayerGameStats[],
  finalHomeScore: number,
  finalAwayScore: number,
  homePlayers: Player[] = [],
  awayPlayers: Player[] = [],
  season: number = new Date().getFullYear(),
  rules?: Pick<GameRuleConfig, 'fieldGoalValue' | 'dunkValue' | 'freeThrowsEnabled' | 'teamFoulPenaltyMode'>,
  homeFgaNormalization = 1,
  awayFgaNormalization = 1,
): { homeStatsFinal: PlayerGameStats[]; awayStatsFinal: PlayerGameStats[] } {
  reconcileTeamPointsToScore(homeStats, finalHomeScore, rules);
  reconcileTeamPointsToScore(awayStats, finalAwayScore, rules);
  normalizeReportedFieldGoalAttempts(homeStats, homeFgaNormalization);
  normalizeReportedFieldGoalAttempts(awayStats, awayFgaNormalization);

  const { homePM, awayPM } = generateSyntheticPM(
    homeStats,
    awayStats,
    finalHomeScore,
    finalAwayScore,
    Math.abs(finalHomeScore - finalAwayScore) > 20
  );
  const homeStatsFinal = applyPMToStats(homeStats, homePM).filter(Boolean);
  const awayStatsFinal = applyPMToStats(awayStats, awayPM).filter(Boolean);

  refreshGameResultAdvancedStats(
    homeStatsFinal,
    awayStatsFinal,
    homePlayers,
    awayPlayers,
    season,
  );

  return { homeStatsFinal, awayStatsFinal };
}
