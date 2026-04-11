/**
 * inflationUtils.ts — NBA Salary Cap Inflation
 *
 * Each season at rollover, a random cap inflation percentage is drawn from a
 * truncated Gaussian distribution. All salary thresholds scale together.
 *
 * Spec: multiseason_todo.md §4c
 */

/**
 * Box-Muller transform → truncated Gaussian sample.
 * Returns a value in [min, max] with the given mean and standard deviation.
 */
export function truncatedGaussian(min: number, max: number, mean: number, std: number): number {
  let sample: number;
  let attempts = 0;

  do {
    // Box-Muller → normal sample
    const u1 = Math.random();
    const u2 = Math.random();
    const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    sample = mean + std * normal;
    attempts++;
    if (attempts > 100) {
      // Safety: if we somehow can't sample in range, return mean clamped
      sample = Math.max(min, Math.min(max, mean));
      break;
    }
  } while (sample < min || sample > max);

  return sample;
}

export interface CapThresholds {
  salaryCap: number;
  luxuryPayroll: number;
  firstApron?: number;
  secondApron?: number;
  minContract?: number;
}

/**
 * Apply one year of cap inflation to all salary thresholds.
 *
 * @param current  Current threshold values (all in USD)
 * @param settings Inflation settings from leagueStats
 * @returns New scaled thresholds + the actual inflation % applied
 */
export function applyCapInflation(
  current: CapThresholds,
  settings: { inflationMin: number; inflationMax: number; inflationAverage: number; inflationStdDev: number },
): { thresholds: CapThresholds; pct: number } {
  const pct = truncatedGaussian(
    settings.inflationMin / 100,
    settings.inflationMax / 100,
    settings.inflationAverage / 100,
    settings.inflationStdDev / 100,
  );
  const mult = 1 + pct;

  return {
    pct: pct * 100,
    thresholds: {
      salaryCap:     Math.round(current.salaryCap     * mult),
      luxuryPayroll: Math.round(current.luxuryPayroll * mult),
      firstApron:    current.firstApron  != null ? Math.round(current.firstApron  * mult) : undefined,
      secondApron:   current.secondApron != null ? Math.round(current.secondApron * mult) : undefined,
      minContract:   current.minContract != null ? Math.round(current.minContract * mult) : undefined,
    },
  };
}
