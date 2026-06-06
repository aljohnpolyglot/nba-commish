import type { NBATeam, NonNBATeam } from '../types';
import { getTeamForGame } from './helpers';
import { getResolvedTeamLogoUrl } from './teamAssets';

/**
 * Resolve any tid to an NBATeam-shaped object — handles all three scopes:
 *
 * - tid 0–99   → real NBA team from `teams[]`
 * - tid ≥ 100  → non-NBA team from `nonNBATeams[]` (Euroleague, Endesa, …),
 *                 wrapped in an NBATeam-shape stub so consumers don't branch
 * - tid < 0    → exhibition / All-Star mock teams (delegates to getTeamForGame)
 *
 * Use this helper anywhere the user team or opponent could come from any of
 * the above pools (Team Office in GM mode, Coaching Hub, Schedule, FA flows).
 * A direct `state.teams.find(t => t.id === tid)` will silently return undefined
 * for `tid ≥ 100` — that's the bug this helper exists to prevent.
 */
export function resolveAnyTeam(
  tid: number,
  teams: NBATeam[] = [],
  nonNBATeams: NonNBATeam[] = [],
): NBATeam | null {
  if (tid >= 100) {
    const nonNBA = nonNBATeams.find(t => t.tid === tid);
    if (nonNBA) {
      return {
        id: tid,
        name: nonNBA.name,
        abbrev: nonNBA.abbrev || nonNBA.name.substring(0, 3).toUpperCase(),
        logoUrl: getResolvedTeamLogoUrl(nonNBA),
        wins: 0, losses: 0, city: '', state: '', pop: nonNBA.pop ?? 0, region: nonNBA.region ?? '',
        conference: nonNBA.league, division: '',
        primaryColor: nonNBA.colors?.[0] ?? '', secondaryColor: nonNBA.colors?.[1] ?? '',
        arena: '', capacity: nonNBA.stadiumCapacity ?? 0, championships: 0, playoffAppearances: 0,
        history: [], seasons: (nonNBA as any).seasons ?? [], retiredNumbers: [], retiredJerseyNumbers: (nonNBA as any).retiredJerseyNumbers ?? [], rivals: [],
        fanBase: 0, marketSize: 0, prestige: 0, facilities: 0, budget: 0,
        expenses: { scouting: 0, coaching: 0, health: 0, facilities: 0 },
        tycoon: (nonNBA as any).tycoon,
        colors: (nonNBA as any).colors,
      } as unknown as NBATeam;
    }
    return null;
  }
  return getTeamForGame(tid, teams);
}

/**
 * Quick boolean: is this tid a non-NBA international league team?
 * Convenience for places that only need to branch (e.g. "skip cap check
 * for non-NBA teams").
 */
export function isNonNBATid(tid: number): boolean {
  return tid >= 100;
}

/** Player.status values that mark an active roster slot for any league.
 *  NBA uses 'Active'; international leagues use the league name ('Endesa',
 *  'Euroleague', …). FA/Retired/Prospect have their own statuses or no
 *  status at all (legacy NBA data). */
const ROSTER_LEAGUE_STATUSES = new Set([
  'Active',
  'Euroleague', 'Endesa', 'PBA', 'WNBA',
  'B-League', 'G-League', 'China CBA', 'NBL Australia',
]);

/**
 * The team list that should appear in pickers / standings / browse views,
 * given the active user team.
 *
 * - Commissioner mode (no user team): returns NBA teams.
 * - GM mode, NBA user: returns NBA teams.
 * - GM mode, non-NBA user (e.g. Spain → Real Madrid Endesa): returns all
 * - Euro-isolated mode may keep NBA teams in `state.teams` for background
 *   simulation. In that mode, Euro UI must source active clubs from
 *   `nonNBATeams`; this helper returns the user's domestic/continental pool
 *   as NBATeam-shape stubs so old iteration patterns keep working.
 *
 * This is the single helper a GM-mode "browse all teams" picker should
 * call. Standings, Power Rankings, Team Office home grid, schedule team
 * filter — all benefit. Cap/economy/trade calculations should NOT use it
 * (those need real NBATeam objects with full economy fields).
 */
export function getActiveLeagueTeams(state: {
  teams: NBATeam[];
  nonNBATeams?: NonNBATeam[];
  userTeamId?: number | null;
}): NBATeam[] {
  const uid = state.userTeamId;
  if (uid == null || uid < 100) return state.teams;
  const userTeam = (state.nonNBATeams ?? []).find(t => t.tid === uid);
  if (!userTeam) return state.teams;
  const sameLeague = (state.nonNBATeams ?? []).filter(t => t.league === userTeam.league);
  const wrapped = sameLeague
    .map(t => resolveAnyTeam(t.tid, state.teams, state.nonNBATeams ?? []))
    .filter((t): t is NBATeam => t !== null);
  return wrapped;
}

/**
 * Is this player on a team's active roster?
 *
 * Replaces the dozens of `p.status === 'Active'` checks scattered across
 * Team Office and Coaching views — those silently exclude every non-NBA
 * league player even when their tid matches the team being viewed.
 *
 * Returns true when:
 *  - status is 'Active' (NBA roster), or
 *  - status is one of the international league tags (player is rostered
 *    on a Euroleague/Endesa/etc. club), or
 *  - status is missing entirely (legacy NBA data with `undefined` status —
 *    keep the previous tolerance so we don't regress existing saves).
 */
export function isOnRoster(player: { status?: string }): boolean {
  if (!player.status) return true;
  return ROSTER_LEAGUE_STATUSES.has(player.status);
}
