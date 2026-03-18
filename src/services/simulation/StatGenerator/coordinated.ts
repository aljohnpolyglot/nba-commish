import { NBAPlayer as Player, NBATeam as Team } from '../../../types';
import { PlayerGameStats } from '../types';
import { R, distributePie } from './helpers';
import { getVariance } from '../utils';

export function generateCoordinatedStats(
  teamStats: PlayerGameStats[],
  team: Team,
  players: Player[],
  availableRebounds: number,
  availableSteals: number,
  availableBlocks: number,
  oppFTA: number = 18,
  season: number = 2025
): PlayerGameStats[] {
  const stats    = teamStats.map(s => ({ ...s }));
  const rotation = stats.map(s =>
    players.find(p => p.internalId === s.playerId)
  ).filter((p): p is Player => p !== undefined);
  if (rotation.length === 0) return stats;

  const rHelper = (p: Player, k: string) => R(p, k, season);

  const ownMisses = stats.reduce((s, p) => s + Math.max(0, p.fga - p.fgm), 0);

  // ── Defensive Rebounds
  distributePie(
    Math.round(availableRebounds),
    (p) => rHelper(p, 'reb') * 2.0 + rHelper(p, 'hgt') * 1.0,
    'drb', 2.8, rotation, stats
  );

  // ── Offensive Rebounds
  distributePie(
    Math.round(ownMisses * 0.25),
    (p) => rHelper(p, 'reb') * 2.0 + rHelper(p, 'hgt') * 1.0 + rHelper(p, 'jmp') * 0.5,
    'orb', 2.4, rotation, stats
  );

  // ── Steals
  distributePie(
    Math.round(availableSteals),
    (p) => rHelper(p, 'diq') * 2.0 + rHelper(p, 'spd') * 1.0,
    'stl', 4.5, rotation, stats
  );

  // ── Blocks
  distributePie(
    Math.round(availableBlocks),
    (p) => rHelper(p, 'hgt') * 3.0 + rHelper(p, 'jmp') * 1.5 + rHelper(p, 'diq') * 0.5,
    'blk', 5.0, rotation, stats
  );

  // ── Assists
  const totalFgm = stats.reduce((s, p) => s + p.fgm, 0);
  const ELITE_PASSERS = ['Luka', 'Jokic', 'Trae', 'Haliburton'];
  distributePie(
    Math.round(totalFgm * 0.75),
    (p) => {
      const isElite = ELITE_PASSERS.some(n => p.name.includes(n));
      const mult    = isElite ? 1.12 : (rHelper(p, 'pss') > 60 || rHelper(p, 'oiq') > 75) ? 1.08 : 1.0;
      return (rHelper(p, 'drb') * 0.4 + rHelper(p, 'pss') * 1.0 + rHelper(p, 'oiq') * 0.5) * mult;
    },
    'ast', 3.6, rotation, stats
  );

  // ── PF — Coordinated with Opponent FTA
  const pfPool = Math.round(oppFTA * 1.40);
  const pfFactors = rotation.map(p =>
    Math.pow(
      Math.max(0.1,
        rHelper(p, 'hgt')         * 1.2 +
        (100 - rHelper(p, 'spd')) * 0.9 +
        (100 - rHelper(p, 'diq')) * 0.9 +
        rHelper(p, 'stre')        * 0.4
      ),
      2.4
    )
  );
  const pfSum = pfFactors.reduce((a, b) => a + b, 0) || 1;
  stats.forEach((s, i) => {
    const share = pfFactors[i] / pfSum;
    s.pf = Math.min(6, Math.max(0, Math.round(
      pfPool * share * getVariance(1.0, 0.12)
    )));
  });

  // ── Cleanup & GameScore
  stats.forEach(s => {
    s.reb = s.orb + s.drb;
    s.gameScore = s.pts * 1.0
      + s.fgm  * 0.4
      - s.fga  * 0.7
      - (s.fta - s.ftm) * 0.4
      + s.orb  * 0.7
      + s.drb  * 0.3
      + s.stl  * 1.0
      + s.ast  * 0.7
      + s.blk  * 0.7
      - s.pf   * 0.4
      - s.tov  * 1.0;
  });

  return stats;
}
