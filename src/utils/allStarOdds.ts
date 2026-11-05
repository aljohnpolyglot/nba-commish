import { NBAPlayer } from '../types';
import { calcComposite } from '../services/allStar/allStarDunkContestHelpers';

/**
 * Calculates a composite dunk score for odds calculation.
 * Aligns with AllStarDunkContestSim.calcComposite formula.
 */
export function getDunkScore(player: NBAPlayer) {
  const latestRating = player.ratings?.[player.ratings.length - 1] ?? {};
  const jmp = latestRating.jmp ?? 70;
  const spd = latestRating.spd ?? 70;
  const dnk = latestRating.dnk ?? 70;
  return (dnk * 0.55) + (jmp * 0.35) + (spd * 0.10);
}

/**
 * Calculates a 3-point score based on season statistics.
 */
export function getThreeScore(player: NBAPlayer, currentSeason: number) {
  const stat = player.stats?.find(s => s.season === currentSeason && !s.playoffs);
  const pct = stat && stat.tpa > 0 ? stat.tp / stat.tpa : 0.35;
  return pct * 100;
}

/**
 * Converts a score to betting odds string (single-player absolute, fallback only).
 */
export function scoreToOdds(score: number) {
  if (score > 90) return '+150';
  if (score > 85) return '+250';
  if (score > 80) return '+400';
  if (score > 75) return '+600';
  return '+800';
}

/**
 * Dunk score for odds: prefers DRIVING_DUNK lookup (real dunking ability),
 * falls back to dnk/jmp/spd composite for players not in the lookup.
 */
const getDunkOddsScore = (player: NBAPlayer): number => calcComposite(player as any);

/**
 * Calculates relative dunk contest odds for one player vs the full contestant field.
 * Uses DRIVING_DUNK lookup to differentiate true dunkers from layup artists,
 * with dnk/jmp/spd composite as fallback.
 */
export function calcDunkOdds(contestants: NBAPlayer[], player: NBAPlayer): string {
  const scores = contestants.map(c => getDunkOddsScore(c));
  const myScore = getDunkOddsScore(player);
  const total = scores.reduce((a, b) => a + b, 0);
  const impliedProb = total > 0 ? myScore / total : 1 / contestants.length;

  if (impliedProb >= 0.5) {
    const odds = Math.round(-(impliedProb / (1 - impliedProb)) * 100);
    return odds > 0 ? `+${odds}` : String(odds);
  } else {
    return `+${Math.round(((1 - impliedProb) / impliedProb) * 100)}`;
  }
}

/**
 * Calculates 3-point contest odds based on relative TP ratings of all contestants.
 */
export function calcThreePointOdds(contestants: NBAPlayer[], player: NBAPlayer): string {
  const getTPRating = (p: NBAPlayer) => {
    const latest = p.ratings?.[p.ratings.length - 1];
    return latest?.tp ?? 50;
  };

  const scores = contestants.map(c => getTPRating(c));
  const myScore = getTPRating(player);
  const total = scores.reduce((a, b) => a + b, 0);
  const impliedProb = total > 0 ? myScore / total : 1 / contestants.length;

  if (impliedProb >= 0.5) {
    const odds = Math.round(-(impliedProb / (1 - impliedProb)) * 100);
    return odds > 0 ? `+${odds}` : String(odds);
  } else {
    return `+${Math.round(((1 - impliedProb) / impliedProb) * 100)}`;
  }
}

export function calcSkillsOdds(contestants: NBAPlayer[], player: NBAPlayer): string {
  const score = (candidate: NBAPlayer) => {
    const latest = candidate.ratings?.[candidate.ratings.length - 1] as any;
    return ['spd', 'drb', 'pss', 'tp'].reduce((sum, key) => sum + Number(latest?.[key] ?? 50), 0) / 4;
  };
  const scores = contestants.map(score);
  const myScore = score(player);
  const total = scores.reduce((sum, value) => sum + value, 0);
  const impliedProb = total > 0 ? myScore / total : 1 / Math.max(1, contestants.length);
  if (impliedProb >= 0.5) {
    const odds = Math.round(-(impliedProb / Math.max(0.01, 1 - impliedProb)) * 100);
    return odds > 0 ? `+${odds}` : String(odds);
  }
  return `+${Math.round(((1 - impliedProb) / Math.max(0.01, impliedProb)) * 100)}`;
}
