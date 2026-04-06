import { useMemo } from 'react';

/**
 * League display-scale multipliers — mirror the sim multipliers in
 * StatGenerator/helpers.ts getScaledRating().
 *
 * B-League is stored at 0.85× already (scaled during fetch), so we apply
 * the sim multiplier (0.68×) on top for a total effective 0.578×.
 * Euroleague and PBA are stored at raw BBGM, so we apply their full multiplier.
 */
export const LEAGUE_DISPLAY_MULTIPLIERS: Record<string, number> = {
  Euroleague: 0.733,
  PBA:        0.62,
  'B-League': 0.68,
};

const SKIP_KEYS = new Set(['hgt', 'season', 'ovr', 'pot', 'fuzz', 'injuryIndex', 'skills', 'jerseyNumber']);

/**
 * Pure function — scales all numeric BBGM attributes for display based on the
 * player's league. Non-numeric, height, and metadata keys are passed through unchanged.
 *
 * @param status  player.status (e.g. 'PBA', 'B-League', 'Active', 'Euroleague')
 * @param ratings Raw BBGM ratings object from player.ratings[n]
 */
export function applyLeagueDisplayScale(
  status: string | undefined,
  ratings: Record<string, any>,
): Record<string, any> {
  const mult = LEAGUE_DISPLAY_MULTIPLIERS[status ?? ''];
  if (!mult) return ratings;

  const out: Record<string, any> = {};
  for (const [key, val] of Object.entries(ratings)) {
    if (SKIP_KEYS.has(key) || typeof val !== 'number') {
      out[key] = val;
    } else {
      out[key] = Math.max(1, Math.round(val * mult));
    }
  }
  return out;
}

/**
 * React hook — memoised wrapper around applyLeagueDisplayScale.
 *
 * Usage:
 *   const scaledRatings = useLeagueScaledRatings(player.status, rawRatings);
 *   const k2 = calculateK2(scaledRatings, { pos, heightIn, ... });
 *
 * For NBA / Free-Agent / WNBA players the input is returned as-is (no extra
 * object allocation), so there's no perf cost for the common case.
 */
export function useLeagueScaledRatings(
  status: string | undefined,
  rawRatings: Record<string, any>,
): Record<string, any> {
  return useMemo(
    () => applyLeagueDisplayScale(status, rawRatings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, JSON.stringify(rawRatings)],
  );
}
