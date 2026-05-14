/**
 * Pool resolution — given a poolId, return the set of valid tids.
 * 'all-active' = NBA team ids + every league the save participates in.
 */
import type { NBATeam } from '../../types';
import type { PoolId } from './types';

interface PoolContext {
  teams: NBATeam[];
  nonNBATeams: { tid: number; league?: string }[];
}

export function resolvePool(poolId: PoolId, ctx: PoolContext): Set<number> {
  const ids = new Set<number>();
  switch (poolId) {
    case 'nba':
      for (const t of ctx.teams) if (t.id >= 0 && t.id < 100) ids.add(t.id);
      break;
    case 'endesa':
      for (const t of ctx.nonNBATeams ?? []) if (t.tid >= 5000 && t.tid < 6000) ids.add(t.tid);
      for (const t of ctx.teams)            if (t.id  >= 5000 && t.id  < 6000) ids.add(t.id);
      break;
    case 'euroleague':
      for (const t of ctx.nonNBATeams ?? []) if (t.tid >= 1000 && t.tid < 2000) ids.add(t.tid);
      // Merged Endesa-tid clubs that ALSO play EL (Real Madrid, Barça)
      for (const t of ctx.teams) if (t.id >= 5000 && t.id < 6000) ids.add(t.id);
      break;
    case 'all-active':
      for (const t of ctx.teams) ids.add(t.id);
      for (const t of ctx.nonNBATeams ?? []) ids.add(t.tid);
      break;
  }
  return ids;
}

/** Standard reference for "full regular season" — depends on the pool. */
export function fullSeasonRefFor(poolId: PoolId): number {
  switch (poolId) {
    case 'nba': return 82;
    case 'endesa': return 34;
    case 'euroleague': return 38;
    case 'all-active': return 82;
  }
}
