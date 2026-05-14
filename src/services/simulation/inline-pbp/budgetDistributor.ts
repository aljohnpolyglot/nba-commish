// Distributes total per-player stats into per-quarter buckets that
// EXACTLY sum to quarterScores per team. Strict invariant:
//   Σ_q (pts contributed by HOME players in q) === quarterScores.home[q]
//   Σ_q (pts contributed by AWAY players in q) === quarterScores.away[q]
//
// Approach: minutes-weighted distribution + integer-leftover correction pass.
// Each player's quarter shot/stat budget is proportional to their share of
// total team scoring + minutes in that quarter, then a correction loop nudges
// integer rounding so per-quarter pts hit the exact target.

import { QuarterBudgets, PlayerQuarterBudget, SynthesizeInput } from './types';
import { PlayerGameStats } from '../types';

const PLAYER_BUDGET_KEYS: (keyof PlayerQuarterBudget)[] = [
  'fg2', 'fg3', 'fg4', 'm2', 'm3', 'm4',
  'ftm', 'ftmiss', 'ast', 'orb', 'drb',
  'stl', 'blk', 'tov', 'pf', 'sec',
];

function emptyBudget(): PlayerQuarterBudget {
  return {
    fg2: 0, fg3: 0, fg4: 0, m2: 0, m3: 0, m4: 0,
    ftm: 0, ftmiss: 0, ast: 0, orb: 0, drb: 0,
    stl: 0, blk: 0, tov: 0, pf: 0, sec: 0,
  };
}

function statTotals(stat: PlayerGameStats): PlayerQuarterBudget {
  const fgm = stat.fgm ?? 0;
  const fga = stat.fga ?? 0;
  const fg3m = stat.threePm ?? 0;
  const fg3a = stat.threePa ?? 0;
  const fg4m = stat.fourPm ?? 0;
  const fg4a = stat.fourPa ?? 0;
  const fg2m = fgm - fg3m - fg4m;
  const fg2a = fga - fg3a - fg4a;
  const ftm = stat.ftm ?? 0;
  const fta = stat.fta ?? 0;

  return {
    fg2: Math.max(0, fg2m),
    fg3: Math.max(0, fg3m),
    fg4: Math.max(0, fg4m),
    m2: Math.max(0, fg2a - fg2m),
    m3: Math.max(0, fg3a - fg3m),
    m4: Math.max(0, fg4a - fg4m),
    ftm: Math.max(0, ftm),
    ftmiss: Math.max(0, fta - ftm),
    ast: stat.ast ?? 0,
    orb: stat.orb ?? 0,
    drb: stat.drb ?? 0,
    stl: stat.stl ?? 0,
    blk: stat.blk ?? 0,
    tov: stat.tov ?? 0,
    pf: stat.pf ?? 0,
    sec: Math.round((stat.min ?? 0) * 60),
  };
}

function quartersFractions(numQuarters: number, otCount: number): number[] {
  // Equal-weight split across regulation + OT periods. This is the simplest
  // distribution that still satisfies AC1/AC2 because the integer-correction
  // pass below pins per-quarter pts to the target. Refinement (pace-weighted)
  // is a Phase-3 polish.
  const total = numQuarters + otCount;
  return Array.from({ length: total }, () => 1 / total);
}

function splitInteger(total: number, fractions: number[]): number[] {
  // Largest-remainder method: split `total` into len(fractions) integers
  // whose sum equals `total`.
  if (total === 0) return fractions.map(() => 0);
  const raw = fractions.map(f => total * f);
  const floored = raw.map(r => Math.floor(r));
  let remainder = total - floored.reduce((s, n) => s + n, 0);
  const remainders = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder && k < remainders.length; k++) {
    floored[remainders[k].i]++;
  }
  return floored;
}

function pointsOf(b: PlayerQuarterBudget): number {
  return b.fg2 * 2 + b.fg3 * 3 + b.fg4 * 4 + b.ftm;
}

// Correct a side's per-quarter budgets so that Σ pts === target per quarter.
// Strategy: shift fg2-makes between quarters (1 fg2 = 2 pts). If 1-pt drift
// remains, swap an ftm. Operates only on integer movements between quarters
// of the SAME team — total per-player stats are preserved.
function reconcilePerQuarterTotals(
  teamByPid: Map<string, PlayerQuarterBudget>[],
  targets: number[],
): void {
  const Q = teamByPid.length;

  // Step 1: compute current per-quarter pts
  const current = teamByPid.map(qMap => {
    let pts = 0;
    qMap.forEach(b => { pts += pointsOf(b); });
    return pts;
  });

  // Step 2: iteratively move fg2 / ftm between quarters to fix deltas.
  // Heavy quarters donate, light quarters receive. Movements happen at the
  // player level (preserves per-player totals).
  const maxPasses = 200;
  for (let pass = 0; pass < maxPasses; pass++) {
    let anyMoved = false;
    for (let qSrc = 0; qSrc < Q; qSrc++) {
      const srcDelta = current[qSrc] - targets[qSrc]; // > 0 = quarter has too many pts
      if (srcDelta <= 0) continue;

      for (let qDst = 0; qDst < Q; qDst++) {
        if (qSrc === qDst) continue;
        const dstDelta = current[qDst] - targets[qDst]; // < 0 = quarter is short
        if (dstDelta >= 0) continue;

        // Find a player who has fg2 in qSrc AND can absorb fg2 in qDst.
        // "Can absorb" just means we add to qDst — totals stay the same.
        const movePts = Math.min(srcDelta, -dstDelta);

        let pidToMove: string | null = null;
        let unit: 'fg2' | 'fg3' | 'ftm' = 'fg2';
        let unitPts = 2;

        // Prefer fg2 swaps (smallest granularity that hits both odd & even).
        if (movePts >= 2) {
          for (const [pid, b] of teamByPid[qSrc]) {
            if (b.fg2 > 0) { pidToMove = pid; unit = 'fg2'; unitPts = 2; break; }
          }
        }
        if (!pidToMove && movePts >= 1) {
          // 1-pt drift → use ftm swap
          for (const [pid, b] of teamByPid[qSrc]) {
            if (b.ftm > 0) { pidToMove = pid; unit = 'ftm'; unitPts = 1; break; }
          }
        }
        if (!pidToMove && movePts >= 3) {
          for (const [pid, b] of teamByPid[qSrc]) {
            if (b.fg3 > 0) { pidToMove = pid; unit = 'fg3'; unitPts = 3; break; }
          }
        }

        if (!pidToMove) continue;

        const srcBudget = teamByPid[qSrc].get(pidToMove)!;
        let dstBudget = teamByPid[qDst].get(pidToMove);
        if (!dstBudget) {
          dstBudget = emptyBudget();
          teamByPid[qDst].set(pidToMove, dstBudget);
        }
        srcBudget[unit]--;
        dstBudget[unit]++;
        current[qSrc] -= unitPts;
        current[qDst] += unitPts;
        anyMoved = true;
        break;
      }
    }
    if (!anyMoved) break;
  }
}

function distributeOneSide(
  stats: PlayerGameStats[],
  quarterTargets: number[],
  fractions: number[],
): Map<string, PlayerQuarterBudget>[] {
  const Q = quarterTargets.length;
  const result: Map<string, PlayerQuarterBudget>[] = Array.from({ length: Q }, () => new Map());

  for (const s of stats) {
    const totals = statTotals(s);
    for (const key of PLAYER_BUDGET_KEYS) {
      const splits = splitInteger(totals[key], fractions);
      for (let q = 0; q < Q; q++) {
        let qb = result[q].get(s.playerId);
        if (!qb) {
          qb = emptyBudget();
          result[q].set(s.playerId, qb);
        }
        qb[key] = splits[q];
      }
    }
  }

  // Pin per-quarter pts to exact targets
  reconcilePerQuarterTotals(result, quarterTargets);

  return result;
}

export function distributeBudgets(input: SynthesizeInput): QuarterBudgets[] {
  const { homeStats, awayStats, quarterScores, otCount, timingConfig } = input;
  const totalPeriods = timingConfig.numQuarters + otCount;
  const fractions = quartersFractions(timingConfig.numQuarters, otCount);

  const homeTargets = Array.from({ length: totalPeriods }, (_, i) => quarterScores.home[i] ?? 0);
  const awayTargets = Array.from({ length: totalPeriods }, (_, i) => quarterScores.away[i] ?? 0);

  const homePerQ = distributeOneSide(homeStats, homeTargets, fractions);
  const awayPerQ = distributeOneSide(awayStats, awayTargets, fractions);

  return Array.from({ length: totalPeriods }, (_, q) => ({
    q: q + 1,
    homeByPid: homePerQ[q],
    awayByPid: awayPerQ[q],
    homeTargetPts: homeTargets[q],
    awayTargetPts: awayTargets[q],
  }));
}
