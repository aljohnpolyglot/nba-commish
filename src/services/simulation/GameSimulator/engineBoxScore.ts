import { StatGenerator } from '../StatGenerator';
import { PlayerGameStats } from '../types';
import { applyPMToStats, generateSyntheticPM } from './syntheticPM';

function reconcileTeamPointsToScore(stats: PlayerGameStats[], target: number): void {
  let delta = target - stats.reduce((sum, player) => sum + (player.pts || 0), 0);
  if (delta === 0) return;

  const teamFga = stats.reduce((sum, player) => sum + (player.fga || 0), 0);
  const teamFgm = stats.reduce((sum, player) => sum + (player.fgm || 0), 0);
  const teamFta0 = stats.reduce((sum, player) => sum + (player.fta || 0), 0);
  const teamFgPct = teamFga > 0 ? teamFgm / teamFga : 1;
  const teamFtaFga0 = teamFga > 0 ? teamFta0 / teamFga : 0;
  const ftPumpAllowed = teamFgPct >= 0.44 && teamFtaFga0 < 0.45;
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
      player.fgm += 1;
      player.fga = Math.max(player.fga, player.fgm);
      player.pts += 2;
      delta -= 2;
    } else if (twoPm > 0 && delta <= -2) {
      player.fgm -= 1;
      player.pts -= 2;
      delta += 2;
    } else if (delta === -1 && player.ftm > 0) {
      player.ftm -= 1;
      player.pts -= 1;
      delta += 1;
    }
  }
}

function assignAdvancedStats(
  stats: PlayerGameStats[],
  advanced: ReturnType<typeof StatGenerator.generateAdvancedStats>
): void {
  stats.forEach((player, index) => {
    Object.assign(player, {
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
      orbPct: advanced[index].orbPct,
      drbPct: advanced[index].drbPct,
      trbPct: advanced[index].trbPct,
      astPct: advanced[index].astPct,
      stlPct: advanced[index].stlPct,
      blkPct: advanced[index].blkPct,
      tovPct: advanced[index].tovPct,
    });
  });
}

export function finalizeBoxScore(
  homeStats: PlayerGameStats[],
  awayStats: PlayerGameStats[],
  finalHomeScore: number,
  finalAwayScore: number
): { homeStatsFinal: PlayerGameStats[]; awayStatsFinal: PlayerGameStats[] } {
  reconcileTeamPointsToScore(homeStats, finalHomeScore);
  reconcileTeamPointsToScore(awayStats, finalAwayScore);

  const { homePM, awayPM } = generateSyntheticPM(
    homeStats,
    awayStats,
    finalHomeScore,
    finalAwayScore,
    Math.abs(finalHomeScore - finalAwayScore) > 20
  );
  const homeStatsFinal = applyPMToStats(homeStats, homePM).filter(Boolean);
  const awayStatsFinal = applyPMToStats(awayStats, awayPM).filter(Boolean);

  const homeAdv = StatGenerator.generateAdvancedStats(homeStatsFinal, awayStatsFinal, homePM.map(player => player.pm));
  const awayAdv = StatGenerator.generateAdvancedStats(awayStatsFinal, homeStatsFinal, awayPM.map(player => player.pm));

  assignAdvancedStats(homeStatsFinal, homeAdv);
  assignAdvancedStats(awayStatsFinal, awayAdv);

  return { homeStatsFinal, awayStatsFinal };
}
