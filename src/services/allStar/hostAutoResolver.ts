/**
 * All-Star host auto-resolver — in GM mode (and anywhere else we want hands-off
 * scheduling) this fills in missing host assignments for the current + next 4
 * seasons so the UI never shows "TBD" slots. Preserves any commissioner picks
 * already in place. Deterministic: seeds from league year so the same save
 * produces the same future hosts.
 */

import type { LeagueStats, NBATeam } from '../../types';
import { getArenaForTeam } from '../../utils/arenaData';

type Host = NonNullable<LeagueStats['allStarHosts']>[number];

/** Simple Mulberry32 PRNG — deterministic per seed. */
function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ensure leagueStats.allStarHosts has entries for [currentYear .. currentYear+horizon].
 * Returns the new array (unchanged reference if no gaps). Teams already used as
 * hosts in recent seasons get a cooldown to spread the rotation around the league.
 */
export function autoResolveAllStarHosts(
  leagueStats: LeagueStats,
  teams: NBATeam[],
  opts: { horizon?: number } = {},
): Host[] {
  const horizon = opts.horizon ?? 4; // current + 4 future
  const currentYear = leagueStats.year ?? new Date().getFullYear();
  const existing = [...(leagueStats.allStarHosts ?? [])];
  const byYear = new Map<number, Host>();
  existing.forEach(h => byYear.set(h.year, h));

  // Cooldown: teams hosted in the last 10 seasons can't host again
  const recentlyUsed = new Set<number>();
  for (let y = currentYear - 10; y < currentYear; y++) {
    const h = byYear.get(y);
    h?.teamIds?.forEach(id => recentlyUsed.add(id));
  }

  const rng = mulberry32(currentYear);
  const pool = teams.filter(t => t && t.id >= 0).map(t => t.id);

  let mutated = false;
  for (let y = currentYear; y <= currentYear + horizon; y++) {
    if (byYear.has(y) && (byYear.get(y)!.city?.trim() || byYear.get(y)!.teamIds.length > 0)) continue;

    // Pick a team not used recently (or from whole pool if cooldown exhausts it)
    const available = pool.filter(id => !recentlyUsed.has(id));
    const choiceSet = available.length > 0 ? available : pool;
    if (choiceSet.length === 0) continue;

    const tid = choiceSet[Math.floor(rng() * choiceSet.length)];
    const team = teams.find(t => t.id === tid);
    if (!team) continue;

    recentlyUsed.add(tid);
    const arena = getArenaForTeam(team.name);
    byYear.set(y, {
      year: y,
      city: arena?.arena_location || (team as any).region || team.name,
      arena: arena?.arena_name ?? '',
      teamIds: [tid],
    });
    mutated = true;
  }

  if (!mutated) return existing;
  return Array.from(byYear.values()).sort((a, b) => a.year - b.year);
}
