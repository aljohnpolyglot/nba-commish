import { MoodTrait } from './moodTypes';

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Returns drama probability [0.01, 0.95] for a player given their mood score and traits.
 * Logistic curve — 0.01 at +10, ~0.49 at −10.
 */
export function dramaProbability(mood: number, traits: MoodTrait[]): number {
  const base = 0.5 / (1 + Math.exp(0.6 * mood));
  const volatileMult = traits.includes('VOLATILE') ? 1.5 : 1;
  const dramaMult = traits.includes('DRAMA_MAGNET') ? 2 : 1;
  const ambassadorMult = traits.includes('AMBASSADOR') ? 0.5 : 1;
  return clamp(base * volatileMult * dramaMult * ambassadorMult, 0.01, 0.95);
}

/**
 * Given a mood score, returns the story type pool key to draw from.
 * Returns null when mood is positive enough to skip drama entirely.
 */
export function moodToStoryType(mood: number): 'appeal' | 'agitation' | 'discipline_fine' | 'discipline_suspend' {
  if (mood >= 0) return 'appeal';
  if (mood >= -3) return 'agitation';
  if (mood >= -6) return 'discipline_fine';
  return 'discipline_suspend';
}
