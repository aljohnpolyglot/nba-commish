/**
/**
 * playThroughInjuriesFactor
 *
 * Mirrors BBGM's approach: each "level" of playing through an injury reduces
 * performance by 2.5% (basketball). The value passed in represents the
 * severity of the injury being played through (e.g. gamesRemaining / typical
 * max games for that injury, bucketed into 0–4).
 *
 * Examples:
 *   0  → 1.00 (healthy / sitting out)
 *   1  → 0.975 (minor nag, barely affects play)
 *   2  → 0.950 (tweaked knee / tight hamstring)
 *   3  → 0.925 (visibly limited)
 *   4  → 0.900 (gutting it out, clearly hurt)
 */

const PERFORMANCE_FRACTION_DECREASE_PER_LEVEL = 0.025;

export function playThroughInjuriesFactor(playThroughInjuries: number): number {
  return 1 - PERFORMANCE_FRACTION_DECREASE_PER_LEVEL * playThroughInjuries;
}

/**
 * Given an injured player's gamesRemaining, bucket into a 0–4 severity level.
 * Players who are not injured (gamesRemaining === 0) get level 0.
 *
 * Buckets (loosely based on typical NBA recovery timelines):
 *   1–3  games  → level 1 (day-to-day nag)
 *   4–7  games  → level 2 (moderate)
 *   8–14 games  → level 3 (significant)
 *   15+  games  → level 4 (major — shouldn't normally be playing)
 */
export function injurySeverityLevel(gamesRemaining: number): number {
  if (gamesRemaining <= 0)  return 0;
  if (gamesRemaining <= 3)  return 1;
  if (gamesRemaining <= 7)  return 2;
  if (gamesRemaining <= 14) return 3;
  return 4;
}

/**
 * minutesRestrictionFactor
 *
 * Returns a multiplier applied to a player's expected minutes when they are
 * playing through an injury. Higher severity = harder minutes cap.
 *
 * Examples (applied to a typical 32-min starter):
 *   0  → 1.00  (healthy — no restriction)
 *   1  → 0.88  (~28 min — coach keeping them fresh, day-to-day)
 *   2  → 0.75  (~24 min — minutes restriction in place)
 *   3  → 0.60  (~19 min — limited role, being monitored closely)
 *   4  → 0.45  (~14 min — gutting it out, heavily restricted)
 */
export function minutesRestrictionFactor(severityLevel: number): number {
  const factors = [1.00, 0.88, 0.75, 0.60, 0.45];
  return factors[Math.max(0, Math.min(4, severityLevel))];
}
