// Bridge: re-export K2 functions from main app
export { calculateK2, K2_CATS } from '../../../../../../services/simulation/convert2kAttributes';
export type { K2Data } from '../../../../../../services/simulation/convert2kAttributes';
export { convertTo2KRating } from '../../../../../../utils/helpers';
export { getSystemProficiency } from '../../../../../../utils/coachSliders';

// calculateOverallFromRating lives in playerRatings but isn't exported — inline it
export function calculateOverallFromRating(rating: any): number {
  if (!rating) return 50;
  const { hgt, stre, spd, jmp, endu, ins, dnk, ft, fg, tp, oiq, diq, drb, pss, reb } = rating;
  const scoringStats = [ins, dnk, ft, fg, tp].sort((a: number, b: number) => b - a);
  const topScoring = (scoringStats[0] + scoringStats[1] + scoringStats[2]) / 3;
  const avgScoring = (ins + dnk + ft + fg + tp) / 5;
  const scoring = topScoring * 0.7 + avgScoring * 0.3;
  const physicals = (hgt * 1.5 + stre + spd * 1.2 + jmp + endu * 1.3) / 6;
  const playmaking = (drb * 0.9 + pss * 0.9 + oiq * 1.2) / 3;
  const defense = (diq * 1.2 + reb * 0.9 + hgt * 0.9) / 3;
  let rawOvr = scoring * 0.35 + playmaking * 0.25 + defense * 0.2 + physicals * 0.2;
  if (rawOvr > 80) rawOvr = 80 + (rawOvr - 80) * 1.4;
  else if (rawOvr < 60) rawOvr = rawOvr * 0.95;
  return Math.max(40, Math.min(99, Math.round(rawOvr)));
}
