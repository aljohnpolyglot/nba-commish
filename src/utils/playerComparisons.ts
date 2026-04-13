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

// Helper to get normalized attributes from a player
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
    ovr: p.overallRating || rating.ovr || 50,
    pot: rating.pot || 50
  };
}

function getVector(p: Record<string, number>): number[] {
  // Weight height extremely heavily (15x), and dribbling, defensive IQ, 
  // strength, and passing heavily (5x) to make them huge factors in the cosine similarity.
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

  const results: ComparisonResult[] = [];

  for (const p of allPlayers) {
    if (p.internalId === target.internalId) continue; // Skip self

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

      // Bonus for being very close in height
      if (attr === 'hgt' && absDiff <= 3) {
        totalBonus += (3 - absDiff) * 0.005; // e.g., 0 diff = +0.015, 1 diff = +0.010, 2 diff = +0.005
      }

      // Calculate penalty for huge deviations
      if (absDiff > 10) {
        // For every point over 10 difference, penalize the similarity score
        // Height, dribbling, defensive IQ, strength, and passing differences are penalized more heavily
        let penaltyMultiplier = 0.001;
        if (attr === 'hgt') penaltyMultiplier = 0.008; // 8x penalty for height
        else if (attr === 'drb' || attr === 'diq' || attr === 'stre' || attr === 'pss') penaltyMultiplier = 0.003;
        
        totalDifferencePenalty += (absDiff - 10) * penaltyMultiplier;
      }
    });

    // Apply the penalty and bonus, ensuring similarity stays between 0 and 1
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

  // Sort by similarity descending and take top 10
  return results.sort((a, b) => b.similarity - a.similarity).slice(0, 10);
}
