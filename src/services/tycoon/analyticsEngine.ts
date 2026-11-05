import type { TycoonState } from '../../types/tycoon';

const ANALYTICS_ROLES = [
  'Chief Scout',
  'Regional Scout',
  'Regional Scout 2',
  'Regional Scout 3',
  'Regional Scout 4',
  'Head of Analytics',
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getAnalyticsDepartmentRating(
  tycoon: TycoonState,
  economyIndex = 1,
  budgetOverride?: number,
): number {
  const scale = Math.max(0.05, economyIndex);
  const minimum = Math.round(50_000 * scale);
  const maximum = Math.max(minimum, Math.round(2_500_000 * scale));
  const budget = Number(budgetOverride ?? tycoon.scoutingInvestment ?? 250_000 * scale);
  const budgetStrength = clamp((budget - minimum) / Math.max(1, maximum - minimum), 0, 1);
  const staffRatings = ANALYTICS_ROLES
    .map(role => tycoon.staffMembers?.find(member => member.role === role))
    .filter((member): member is NonNullable<typeof member> => Boolean(member))
    .map(member => Number(member.rating))
    .filter(Number.isFinite);
  const staffAverage = staffRatings.length > 0
    ? staffRatings.reduce((sum, rating) => sum + rating, 0) / staffRatings.length
    : 50;
  const budgetRating = 40 + budgetStrength * 55;
  return clamp(
    Math.round(budgetRating * 0.45 + staffAverage * 0.55)
      + (tycoon.analyticsPermanentSponsorRatingBonus ?? 0),
    1,
    99,
  );
}
