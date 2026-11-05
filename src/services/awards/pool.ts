/**
 * Pool resolution — given a poolId, return the set of valid tids.
 * 'all-active' = NBA team ids + every league the save participates in.
 */
import type { NBATeam } from '../../types';
import type { PoolId, UIMode } from './types';

interface PoolContext {
  teams: NBATeam[];
  nonNBATeams: { tid: number; league?: string }[];
  uiMode?: UIMode;
}

const teamId = (team: NBATeam | { tid: number }) => Number('id' in team ? team.id : team.tid);

const belongsToActiveMode = (team: NBATeam | { tid: number; league?: string }, uiMode: UIMode) => {
  const tid = teamId(team);
  const league = String((team as any).league ?? '').toLowerCase();
  if (uiMode === 'wnba_isolated') return (tid >= 3000 && tid < 4000) || league.includes('wnba');
  if (uiMode === 'pba_isolated') return (tid >= 2000 && tid < 3000) || league.includes('pba');
  if (uiMode === 'euro_isolated') {
    return (tid >= 1000 && tid < 2000)
      || (tid >= 5000 && tid < 6000)
      || league.includes('euro')
      || league.includes('endesa')
      || league.includes('acb');
  }
  return tid >= 0 && tid < 100;
};

const addActiveModeTeams = (ids: Set<number>, ctx: PoolContext) => {
  const uiMode = ctx.uiMode ?? 'nba';
  for (const team of ctx.teams) if (belongsToActiveMode(team, uiMode)) ids.add(team.id);
  for (const team of ctx.nonNBATeams ?? []) if (belongsToActiveMode(team, uiMode)) ids.add(team.tid);
  if (uiMode === 'wnba_isolated' && ids.size === 0) {
    for (const team of ctx.teams) ids.add(team.id);
  }
};

export function resolvePool(poolId: PoolId, ctx: PoolContext): Set<number> {
  const ids = new Set<number>();
  switch (poolId) {
    case 'nba':
      if (ctx.uiMode && !['nba', 'fictional'].includes(ctx.uiMode)) addActiveModeTeams(ids, ctx);
      else for (const t of ctx.teams) if (t.id >= 0 && t.id < 100) ids.add(t.id);
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
      if (ctx.uiMode) addActiveModeTeams(ids, ctx);
      else {
        for (const t of ctx.teams) ids.add(t.id);
        for (const t of ctx.nonNBATeams ?? []) ids.add(t.tid);
      }
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
