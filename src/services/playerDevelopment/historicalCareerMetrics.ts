import type { NBAGMStat, NBAPlayer } from '../../types';
import { calcEWA, calcGameScore } from '../simulation/StatGenerator/advancedstatsHelpers';

export const HISTORICAL_CAREER_METRICS_VERSION = 1;

const finiteNumber = (value: unknown): number | undefined => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const estimateWinSharesFromBoxScore = (stat: NBAGMStat): number | undefined => {
  const min = finiteNumber(stat.min);
  if (!min || min <= 0 || Number(stat.gp ?? 0) <= 0) return undefined;
  const required = [stat.pts, stat.fg, stat.fga, stat.ft, stat.fta, stat.orb, stat.drb, stat.ast, stat.stl, stat.blk, stat.tov, stat.pf];
  if (required.some(value => finiteNumber(value) === undefined)) return undefined;
  const gameScore = calcGameScore({
    playerId: '',
    name: '',
    min,
    pts: Number(stat.pts),
    reb: Number(stat.trb ?? Number(stat.orb) + Number(stat.drb)),
    orb: Number(stat.orb),
    drb: Number(stat.drb),
    ast: Number(stat.ast),
    stl: Number(stat.stl),
    blk: Number(stat.blk),
    tov: Number(stat.tov),
    fgm: Number(stat.fg),
    fga: Number(stat.fga),
    threePm: Number(stat.tp),
    threePa: Number(stat.tpa),
    ftm: Number(stat.ft),
    fta: Number(stat.fta),
    pf: Number(stat.pf),
    gs: Number(stat.gs ?? 0),
    gameScore: 0,
    pm: 0,
  });
  const estimatedPer = Math.max(0, Math.min(45, 8 + (gameScore / min) * 30));
  const estimate = calcEWA(estimatedPer, min);
  return estimate > 0 ? estimate : undefined;
};

export function resolveHistoricalStatWinShares(stat: NBAGMStat): number | undefined {
  const ws = finiteNumber(stat.ws);
  const ows = finiteNumber(stat.ows);
  const dws = finiteNumber(stat.dws);
  if (ws !== undefined && (ws !== 0 || ows !== undefined || dws !== undefined || stat._advancedStatVersion !== undefined)) return ws;
  if (ows !== undefined || dws !== undefined) return (ows ?? 0) + (dws ?? 0);

  const ewa = finiteNumber(stat.ewa);
  if (ewa !== undefined && ewa !== 0) return ewa;

  const per = finiteNumber(stat.per);
  const min = finiteNumber(stat.min);
  if (per !== undefined && min !== undefined && min > 0) {
    const estimate = calcEWA(per, min);
    if (estimate > 0) return estimate;
  }

  return estimateWinSharesFromBoxScore(stat) ?? ws;
}

export function hydrateHistoricalCareerMetrics(players: NBAPlayer[], exclusiveSeasonCutoff: number): NBAPlayer[] {
  if (!Number.isFinite(exclusiveSeasonCutoff)) return players;
  return players.map(player => {
    let changed = false;
    const stats = (player.stats ?? []).map(stat => {
      if (
        stat.playoffs === true
        || Number(stat.season) >= exclusiveSeasonCutoff
        || Number(stat.gp ?? 0) <= 0
        || Number(stat.min ?? 0) <= 0
      ) return stat;
      const resolved = resolveHistoricalStatWinShares(stat);
      if (resolved === undefined || (stat.ws === resolved && stat._historicalCareerMetricsVersion === HISTORICAL_CAREER_METRICS_VERSION)) return stat;
      if (Number.isFinite(Number(stat.ws)) && Number(stat.ws) !== 0) return stat;
      changed = true;
      return {
        ...stat,
        ws: resolved,
        ws48: (resolved * 48) / Number(stat.min),
        _historicalCareerMetricsVersion: HISTORICAL_CAREER_METRICS_VERSION,
      };
    });
    return changed ? { ...player, stats } : player;
  });
}
