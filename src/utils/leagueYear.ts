/**
 * leagueYear — single source for `state.leagueStats.year ?? <fallback>` pattern.
 *
 * `?? 2026` was hardcoded in 12+ sites (autoResolvers, DraftSimulatorView,
 * DraftPickGenerator, OffseasonAufgaben). Once Saison 2027 lands the literal
 * `2026` is silently wrong (cliff bug). The real-world current year is the
 * next-best fallback if leagueStats is somehow nullish.
 *
 * In a live game `state.leagueStats.year` is always set (initialization writes
 * it), so the fallback is mostly dead code — but normalising the pattern keeps
 * the year-bug surface to one helper instead of N inline literals.
 */

export function getLsYear(state: { leagueStats?: { year?: number } | null }): number {
  return state.leagueStats?.year ?? new Date().getFullYear();
}
