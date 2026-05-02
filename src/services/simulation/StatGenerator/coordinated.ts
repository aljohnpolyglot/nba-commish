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
  otCount: number = 0,
  team2KDef?: { steal: number; passPerception: number; block: number; interiorDef: number },
  opp2KDef?: { passPerception: number },
  orbRateMult: number = 1.0,
  quarterLength: number = 12,
  overtimeDuration: number = 5,
  numQuarters: number = 4
): PlayerGameStats[] {
  const stats    = teamStats.map(s => ({ ...s }));
  const rotation = stats.map(s =>
    players.find(p => p.internalId === s.playerId)
  ).filter((p): p is Player => p !== undefined);
  if (rotation.length === 0) return stats;

  const rHelper = (p: Player, k: string) => R(p, k, season);
  const getNight = (p: Player) => stats.find(s => s.playerId === p.internalId);

  // ── 2K Team Aura: scales pool sizes, not individual distribution weights ──
  // Centered at 70: elite defense grows pools, bad defense shrinks them.
  // BBGM ratings still decide who on the team gets each steal/block/assist.
  const stlAura  = team2KDef ? (team2KDef.steal + team2KDef.passPerception - 140) * 0.005 : 0;
  const blkAura  = team2KDef ? (team2KDef.block + team2KDef.interiorDef    - 140) * 0.005 : 0;
  const passAura = opp2KDef  ? (opp2KDef.passPerception - 70)              * 0.008 : 0;

  const finalSteals = Math.round(availableSteals * (1.0 + stlAura));
  const finalBlocks = Math.round(availableBlocks * (1.0 + blkAura));
  const assistRatio = Math.max(0.47, 0.67 - passAura);

  const ownMisses = stats.reduce((s, p) => s + Math.max(0, p.fga - p.fgm), 0);

  // Minutes scale — sqrt dampens the effect so it survives the exponentiation in distributePie.
  // sqrt(0.5) = 0.707 → after ^2.8 exponent → 0.35x weight (half-minute player gets ~35% of boards)
  const avgMin = stats.reduce((s, p) => s + p.min, 0) / (stats.length || 1) || 24;
  const minFrac = (p: Player) =>
    Math.sqrt((stats.find(s => s.playerId === p.internalId)?.min ?? avgMin) / avgMin);
  const lineFor = (p: Player) => stats.find(s => s.playerId === p.internalId);

  const reboundSkill = (p: Player, type: 'orb' | 'drb') => {
    const reb = rHelper(p, 'reb');
    const hgt = rHelper(p, 'hgt');
    const stre = rHelper(p, 'stre');
    if (type === 'orb') {
      return (reb * 1.4 + hgt * 0.8 + stre * 0.5 + rHelper(p, 'jmp') * 0.4 + rHelper(p, 'oiq') * 0.2) / 3.3;
    }
    return (reb * 1.5 + hgt * 1.1 + stre * 0.4 + rHelper(p, 'diq') * 0.3) / 3.3;
  };

  // Elite rebounders can have quiet nights, but their box-out / positioning skill should
  // not vanish just because they are a 9th/10th man. Keep the hustle downside gentler.
  const reboundNightMult = (p: Player, type: 'orb' | 'drb') => {
    const mult = type === 'orb' ? (lineFor(p)?._nightOrbMult ?? 1) : (lineFor(p)?._nightDrbMult ?? 1);
    return reboundSkill(p, type) >= 72 ? Math.max(0.80, mult) : mult;
  };

  const applyReboundSpecialistFloor = (statKey: 'orb' | 'drb') => {
    const floors = new Map<string, number>();
    rotation.forEach(p => {
      const s = lineFor(p);
      const min = s?.min ?? 0;
      const skill = reboundSkill(p, statKey);
      if (min < 10 || skill < 72) {
        floors.set(p.internalId, 0);
        return;
      }
      const skillFactor = Math.max(0, Math.min(1.35, (skill - 60) / 28));
      const rawFloor = statKey === 'drb'
        ? (min / 36) * (2.2 + skillFactor * 3.8)
        : (min / 36) * (1.0 + skillFactor * 2.1);
      floors.set(p.internalId, Math.max(0, Math.min(statKey === 'drb' ? 7 : 4, Math.round(rawFloor))));
    });

    const targets = rotation
      .map(p => ({ p, s: lineFor(p), floor: floors.get(p.internalId) ?? 0, skill: reboundSkill(p, statKey) }))
      .filter(x => x.s && x.floor > (x.s[statKey] || 0))
      .sort((a, b) => b.skill - a.skill);

    for (const target of targets) {
      let need = target.floor - (target.s![statKey] || 0);
      while (need > 0) {
        const donor = stats
          .filter(s => s.playerId !== target.p.internalId && (s[statKey] || 0) > (floors.get(s.playerId) ?? 0))
          .sort((a, b) => ((b[statKey] || 0) - (floors.get(b.playerId) ?? 0)) - ((a[statKey] || 0) - (floors.get(a.playerId) ?? 0)))[0];
        if (!donor) break;
        donor[statKey] -= 1;
        target.s![statKey] += 1;
        need--;
      }
    }
  };

  // ── Defensive Rebounds (variance 0.22 for realistic game-to-game swings)
  distributePie(
    Math.round(availableRebounds),
    (p) => (rHelper(p, 'reb') * 2.0 + rHelper(p, 'hgt') * 2.0 + rHelper(p, 'oiq') * 0.5 + rHelper(p, 'diq') * 0.5) * minFrac(p) * reboundNightMult(p, 'drb'),
    'drb', 2.2, rotation, stats, 0.22
  );

  // ── Offensive Rebounds
  // orbRateMult (from Coaching → Crash Offensive Glass) scales the 20%
  // baseline ORB rate. High crash = more guys on the glass, bigger ORB pool.
  distributePie(
    Math.round(ownMisses * 0.20 * orbRateMult),
    (p) => (rHelper(p, 'reb') * 2.0 + rHelper(p, 'hgt') * 1.0 + rHelper(p, 'jmp') * 0.5) * minFrac(p) * reboundNightMult(p, 'orb'),
    'orb', 2.0, rotation, stats, 0.22
  );

  applyReboundSpecialistFloor('drb');
  applyReboundSpecialistFloor('orb');

  // ── Steals (pool sized by 2K aura; BBGM ratings decide who gets them)
  distributePie(
    finalSteals,
    (p) => (rHelper(p, 'diq') * 2.0 + rHelper(p, 'spd') * 1.0) * (getNight(p)?._nightStlMult ?? 1),
    'stl', 3.4, rotation, stats
  );

  // ── Blocks (pool sized by 2K aura; BBGM ratings decide who gets them)
  distributePie(
    finalBlocks,
    (p) => (rHelper(p, 'hgt') * 2.5 + rHelper(p, 'jmp') * 1.5 + rHelper(p, 'diq') * 0.5) * (getNight(p)?._nightBlkMult ?? 1),
    'blk', 4.0, rotation, stats
  );

  // ── Assists (pool shrinks vs elite pass-disruptors, grows vs bad ones)
  const totalFgm = stats.reduce((s, p) => s + p.fgm, 0);
  distributePie(
    Math.round(totalFgm * assistRatio),
    (p) => {
      const drb = rHelper(p, 'drb');
      const pss = rHelper(p, 'pss');
      const oiq = rHelper(p, 'oiq');
      return Math.pow(
        Math.max(0.1, drb * 0.4 + pss * 2.0 + oiq * 0.4),
        3.8
      ) * minFrac(p) * (getNight(p)?._nightAssistMult ?? 1);
    },
    'ast', 1.0,
    rotation, stats
  );

  // Soft-cap assists above 11
  stats.forEach(s => {
    if (s.ast > 11) {
      s.ast = Math.round(11 + (s.ast - 11) * 0.45);
    }
  });

  // Zero out bench floor — low-minute non-playmakers realistically get 0 assists
  stats.forEach(s => {
    const player = rotation.find(p => p.internalId === s.playerId);
    if (!player) return;
    const pss = rHelper(player, 'pss');
    const oiq = rHelper(player, 'oiq');
    const isElitePlaymaker = pss >= 75 && oiq >= 65;
    if (s.min < 8) {
      s.ast = 0;
    } else if (s.min < 15 && !isElitePlaymaker && s.ast === 1 && Math.random() > 0.5) {
      s.ast = 0;
    }
  });


  // ── PF — Coordinated with Opponent FTA
  // Macro: Changed multiplier from 0.85 to 1.05. This adds the missing ~3 team fouls.
  // NaN guard: opponent FTA is summed upstream from per-player ftas; if any leg of that
  // chain produced NaN/Infinity the team Fouls field rendered as "NaN". Fall back to
  // league-avg 18 instead of letting the NaN propagate through pfPool → share → s.pf.
  const safeOppFTA = Number.isFinite(oppFTA) ? Math.max(0, oppFTA) : 18;
  const pfPool = Math.round(safeOppFTA * 0.96);
  const pfFactors = rotation.map(p =>
    Math.pow(
      Math.max(0.1,
        rHelper(p, 'hgt')         * 1.2 + // Bigs foul more in the paint
        (100 - rHelper(p, 'spd')) * 0.8 + // Slow defenders get beat and hack
        (100 - rHelper(p, 'diq')) * 1.2 + // Low Def IQ defenders don't know where to stand
        rHelper(p, 'stre')        * 0.4
      ),
      2.2 // Concentrates fouls on weak defenders/bigs to hit ~3.7 leader mark
    )
  );
  const pfSum = pfFactors.reduce((a, b) => a + b, 0) || 1;
  stats.forEach((s, i) => {
    const share = pfFactors[i] / pfSum;
    const raw = Math.round(pfPool * share * getVariance(1.0, 0.12));
    s.pf = Math.min(6, Math.max(0, Number.isFinite(raw) ? raw : 0));
  });

  // ── Minute redistribution — foul-plagued players lose time, redistributed proportionally
  // 5 players × configured regulation periods × QL minutes.
  // OT periods add the configured OT duration for each player-minute slot.
  const regulationMinutes = quarterLength * numQuarters * 5;
  const totalTarget = regulationMinutes + otCount * overtimeDuration * 5;
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
    // Fix rounding drift — clamp to exact configured target.
    const diff = totalTarget - stats.reduce((sum, s) => sum + s.min, 0);
    if (diff !== 0) {
      const top = stats.reduce((a, b) => a.min > b.min ? a : b);
      top.min += diff;
    }
  }

  // ── Hard cap: no player can exceed total game length + sync sec field
  const maxMins = quarterLength * numQuarters + otCount * overtimeDuration;
  stats.forEach(s => {
    s.min = Math.min(maxMins, Math.max(0, s.min));
    s.sec = Math.floor((s.min % 1) * 60);
  });

  // ── Final minutes enforcer — hard cap above may clip players to maxMins, drifting total ──
  // Walk eligible players (highest first), give each as much of the remainder as their cap allows.
  // Single-shot dump caused 191:03 lines when target was inflated for 3-min All-Star quarters.
  let cappedDiff = totalTarget - stats.reduce((sum, s) => sum + s.min, 0);
  if (Math.abs(cappedDiff) >= 0.5) {
    const eligible = stats.filter(s => s.min < maxMins).sort((a, b) => b.min - a.min);
    for (const s of eligible) {
      if (Math.abs(cappedDiff) < 0.5) break;
      const room = cappedDiff > 0 ? maxMins - s.min : -s.min;
      const give = cappedDiff > 0 ? Math.min(cappedDiff, room) : Math.max(cappedDiff, room);
      s.min += give;
      cappedDiff -= give;
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
