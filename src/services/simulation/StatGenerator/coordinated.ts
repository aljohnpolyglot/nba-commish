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
  season: number = 2025,
  otCount: number = 0
): PlayerGameStats[] {
  const stats    = teamStats.map(s => ({ ...s }));
  const rotation = stats.map(s =>
    players.find(p => p.internalId === s.playerId)
  ).filter((p): p is Player => p !== undefined);
  if (rotation.length === 0) return stats;

  const rHelper = (p: Player, k: string) => R(p, k, season);

  const ownMisses = stats.reduce((s, p) => s + Math.max(0, p.fga - p.fgm), 0);

  // Minutes scale — sqrt dampens the effect so it survives the exponentiation in distributePie.
  // sqrt(0.5) = 0.707 → after ^2.8 exponent → 0.35x weight (half-minute player gets ~35% of boards)
  const avgMin = stats.reduce((s, p) => s + p.min, 0) / (stats.length || 1) || 24;
  const minFrac = (p: Player) =>
    Math.sqrt((stats.find(s => s.playerId === p.internalId)?.min ?? avgMin) / avgMin);

  // ── Defensive Rebounds (variance 0.22 for realistic game-to-game swings)
  distributePie(
    Math.round(availableRebounds),
    (p) => (rHelper(p, 'reb') * 2.0 + rHelper(p, 'hgt') * 1.0) * minFrac(p),
    'drb', 2.8, rotation, stats, 0.22
  );

  // ── Offensive Rebounds
  distributePie(
    Math.round(ownMisses * 0.25),
    (p) => (rHelper(p, 'reb') * 2.0 + rHelper(p, 'hgt') * 1.0 + rHelper(p, 'jmp') * 0.5) * minFrac(p),
    'orb', 2.4, rotation, stats, 0.22
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

  // ── Assists — minFrac scales by minutes so bench players don't steal assists from stars
  const totalFgm = stats.reduce((s, p) => s + p.fgm, 0);
  distributePie(
    Math.round(totalFgm * 0.56),  // 0.75 was too high — NBA avg is ~24 AST/game
    (p) => (rHelper(p, 'drb') * 0.4 + rHelper(p, 'pss') * 1.0 + rHelper(p, 'oiq') * 0.5) * minFrac(p),
    'ast', 6.5, rotation, stats
  );
  // Soft-cap assists above 14 — only clips truly absurd nights, Jokic 15-16 ast games untouched
  stats.forEach(s => {
    if (s.ast > 14) {
      s.ast = Math.round(14 + (s.ast - 14) * 0.55);
    }
  });

  // ── PF — Coordinated with Opponent FTA
  // Real NBA avg: ~20 team PF/game. oppFTA * 0.85 keeps us in that range.
  const pfPool = Math.round(oppFTA * 0.85);  // was 1.40 — way too many fouls
  const pfFactors = rotation.map(p =>
    Math.pow(
      Math.max(0.1,
        rHelper(p, 'hgt')         * 1.2 +
        (100 - rHelper(p, 'spd')) * 0.9 +
        (100 - rHelper(p, 'diq')) * 0.9 +
        rHelper(p, 'stre')        * 0.4
      ),
      1.5   // was 2.4 — lower exponent prevents hyper-concentration on bigs
    )
  );
  const pfSum = pfFactors.reduce((a, b) => a + b, 0) || 1;
  stats.forEach((s, i) => {
    const share = pfFactors[i] / pfSum;
    s.pf = Math.min(6, Math.max(0, Math.round(
      pfPool * share * getVariance(1.0, 0.10)  // tightened variance slightly
    )));
  });

  // ── Minute redistribution — foul-plagued players lose time, redistributed proportionally
  const totalTarget = 240 + otCount * 25;
  let stolenMins = 0;
  stats.forEach(s => {
    if (s.pf >= 6 && s.min > 28) {
      const reduced = Math.round(s.min * 0.75);
      stolenMins += s.min - reduced;
      s.min = reduced;
    } else if (s.pf >= 5 && s.min > 32) {
      const reduced = Math.round(s.min * 0.88);
      stolenMins += s.min - reduced;
      s.min = reduced;
    }
  });
  if (stolenMins > 0) {
    const totalMins = stats.reduce((sum, s) => sum + s.min, 0);
    stats.forEach(s => {
      s.min += Math.round(stolenMins * (s.min / totalMins));
    });
    // Fix rounding drift — clamp to exact target (240 reg, 265/290/315 for OT)
    const diff = totalTarget - stats.reduce((sum, s) => sum + s.min, 0);
    if (diff !== 0) {
      const top = stats.reduce((a, b) => a.min > b.min ? a : b);
      top.min += diff;
    }
  }

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
