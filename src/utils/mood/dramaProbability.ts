import { MoodTrait } from './moodTypes';

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Composure (0–99) modulates how mood translates to drama. Neutral at 50.
 * Unflappable (99): 0.45× drama.  Hothead (0): 1.60× drama.  Missing → 1.0×.
 * Stacks multiplicatively with trait multipliers so a VOLATILE player with
 * composure 20 still blows up, and a DRAMA_MAGNET with composure 85 settles down.
 */
function composureMult(composure?: number): number {
  if (composure == null) return 1;
  const c = clamp(composure, 0, 99);
  // Linear: composure 50 → 1.0, 0 → 1.60, 99 → 0.45
  return clamp(1 + (50 - c) * 0.012, 0.45, 1.60);
}

/**
 * Returns drama probability [0.01, 0.95] for a player given their mood score,
 * traits, and optional composure rating. Logistic curve — 0.01 at +10, ~0.49 at −10.
 */
export function dramaProbability(mood: number, traits: MoodTrait[], composure?: number): number {
  const base = 0.5 / (1 + Math.exp(0.6 * mood));
  const volatileMult    = traits.includes('VOLATILE')     ? 1.5 : 1;
  const dramaMult       = traits.includes('DRAMA_MAGNET') ? 2   : 1;
  const ambassadorMult  = traits.includes('AMBASSADOR')   ? 0.5 : 1;
  return clamp(
    base * volatileMult * dramaMult * ambassadorMult * composureMult(composure),
    0.01,
    0.95,
  );
}

/**
 * Given a mood score (and optional composure), returns the story type pool key.
 * High composure softens escalation — they stay in "appeal" territory longer.
 * Low composure escalates faster — they hit discipline tiers sooner.
 */
export function moodToStoryType(
  mood: number,
  composure?: number,
): 'appeal' | 'agitation' | 'discipline_fine' | 'discipline_suspend' {
  // Composure shifts the mood boundary: 50 → no shift, 99 → +2 (more tolerant), 0 → −2 (quicker to snap)
  const shift = composure != null ? (composure - 50) * 0.04 : 0;
  const effective = mood + shift;
  if (effective >= 0) return 'appeal';
  if (effective >= -3) return 'agitation';
  if (effective >= -6) return 'discipline_fine';
  return 'discipline_suspend';
}
