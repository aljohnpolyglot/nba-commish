import { NBAPlayer } from '../types';

export interface ComparisonResult {
  target: NBAPlayer;
  comparison: NBAPlayer;
  similarity: number;
  scalingFactor: number;
  differences: Record<string, number>;
  scaledAttributes: Record<string, number>;
}

export const COMPARISON_ATTRIBUTES = [
  'hgt', 'stre', 'spd', 'jmp', 'endu', 'ins', 'dnk', 'ft', 'fg', 'tp', 'oiq', 'diq', 'drb', 'pss', 'reb'
] as const;

// 0=PG … 4=C. Used to penalise cross-position comps (guard ≠ big).
const POS_BUCKET: Record<string, number> = {
  PG: 0, SG: 1, G: 1, GF: 2, SF: 2, F: 2, PF: 3, FC: 3, C: 4,
};
function posBucket(pos: string | undefined): number {
  return POS_BUCKET[(pos ?? '').toUpperCase()] ?? 2;
}

function getPlayerAttributes(p: NBAPlayer): Record<string, number> {
  const rating = p.ratings?.[p.ratings.length - 1] || {};
  return {
    hgt: rating.hgt || 50,
    stre: rating.stre || 50,
    spd: rating.spd || 50,
    jmp: rating.jmp || 50,
    endu: rating.endu || 50,
    ins: rating.ins || 50,
    dnk: rating.dnk || 50,
    ft: rating.ft || 50,
    fg: rating.fg || 50,
    tp: rating.tp || 50,
    oiq: rating.oiq || 50,
    diq: rating.diq || 50,
    drb: rating.drb || 50,
    pss: rating.pss || 50,
    reb: rating.reb || 50,
    ovr: rating.ovr || 50,
    pot: rating.pot || 50
  };
}

function getVector(p: Record<string, number>): number[] {
  return COMPARISON_ATTRIBUTES.map(attr => {
    const val = p[attr] || 0;
    if (attr === 'hgt') return val * 15;
    if (attr === 'drb' || attr === 'diq' || attr === 'stre' || attr === 'pss') return val * 5;
    return val;
  });
}

function cosineSimilarity(v1: number[], v2: number[]): number {
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    norm1 += v1[i] * v1[i];
    norm2 += v2[i] * v2[i];
  }
  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

function projectPlayer(p: Record<string, number>): Record<string, number> {
  const ratio = p.pot > p.ovr ? p.pot / Math.max(p.ovr, 1) : 1;
  const projected: Record<string, number> = {};
  COMPARISON_ATTRIBUTES.forEach(attr => {
    if (attr === 'hgt') {
      projected[attr] = p[attr];
    } else {
      projected[attr] = Math.min(100, p[attr] * ratio);
    }
  });
  return projected;
}

/**
 * @param projectComparisons - if false, compare NBA players at their CURRENT ratings
 *   (not projected to potential). Use false for draft scouting: "who will this prospect
 *   play like at their peak?" vs a current NBA star already AT their peak.
 */
export function findTopComparisons(
  target: NBAPlayer,
  allPlayers: NBAPlayer[],
  projectComparisons = true,
): ComparisonResult[] {
  const targetAttrs = getPlayerAttributes(target);
  const projectedTarget = projectPlayer(targetAttrs);
  const pVec = getVector(projectedTarget);
  const targetBucket = posBucket(target.pos);

  const results: ComparisonResult[] = [];

  for (const p of allPlayers) {
    if (p.internalId === target.internalId) continue;

    const compAttrs = getPlayerAttributes(p);
    const resolvedComp = projectComparisons ? projectPlayer(compAttrs) : compAttrs;
    const eVec = getVector(resolvedComp);
    let sim = cosineSimilarity(pVec, eVec);

    const differences: Record<string, number> = {};
    let totalDifferencePenalty = 0;
    let totalBonus = 0;

    COMPARISON_ATTRIBUTES.forEach(attr => {
      const diff = projectedTarget[attr] - resolvedComp[attr];
      differences[attr] = diff;
      const absDiff = Math.abs(diff);

      if (attr === 'hgt' && absDiff <= 3) {
        totalBonus += (3 - absDiff) * 0.005;
      }

      if (absDiff > 10) {
        let penaltyMultiplier = 0.001;
        if (attr === 'hgt') penaltyMultiplier = 0.008;
        else if (attr === 'drb' || attr === 'diq' || attr === 'stre' || attr === 'pss') penaltyMultiplier = 0.003;
        totalDifferencePenalty += (absDiff - 10) * penaltyMultiplier;
      }
    });

    // OVR-level proximity: cosine similarity is scale-invariant, so without this an
    // 85-OVR star matches an 80-POT prospect just because attribute *ratios* look similar.
    const targetPeak = Math.max(targetAttrs.ovr, targetAttrs.pot);
    const compPeak = projectComparisons ? Math.max(compAttrs.ovr, compAttrs.pot) : compAttrs.ovr;
    const ovrGap = compPeak - targetPeak;
    if (ovrGap > 5) {
      totalDifferencePenalty += (ovrGap - 5) * 0.02;
    } else if (ovrGap < -10) {
      totalDifferencePenalty += (Math.abs(ovrGap) - 10) * 0.01;
    }

    // Position distance: guards ≠ bigs. A balanced PF like Siakam shouldn't dominate
    // comps for SGs just because cosine similarity ignores positional context.
    const posDist = Math.abs(posBucket(p.pos) - targetBucket);
    if (posDist === 2) totalDifferencePenalty += 0.12;
    else if (posDist === 3) totalDifferencePenalty += 0.20;
    else if (posDist >= 4) totalDifferencePenalty += 0.28;

    sim = Math.min(1, Math.max(0, sim - totalDifferencePenalty + totalBonus));

    results.push({
      target,
      comparison: p,
      similarity: sim,
      scalingFactor: targetAttrs.pot > targetAttrs.ovr ? targetAttrs.pot / Math.max(targetAttrs.ovr, 1) : 1,
      differences,
      scaledAttributes: projectedTarget
    });
  }

  return results.sort((a, b) => b.similarity - a.similarity).slice(0, 10);
}
