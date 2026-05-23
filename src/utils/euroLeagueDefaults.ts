import type { CompetitionSpec } from '../services/competition/types';
import type { NBATeam, NonNBATeam, Game } from '../types';
import { resolveAnyTeam } from './teamLookup';

interface MinimalState {
  activeCompetitions?: CompetitionSpec[];
  leagueStats?: { uiMode?: string | null };
  userTeamId?: number | null;
  gameMode?: string | null;
}

interface StateWithTeams extends MinimalState {
  teams: NBATeam[];
  nonNBATeams?: NonNBATeam[];
  schedule?: Game[];
  boxScores?: Array<{ competitionId?: string; gameId?: number; date?: string }>;
  clubAliasMap?: Record<number, number>;
}

// spec.id → player.status. Future templates (Greece A1, France LNB, Germany BBL, …)
// extend this map; views consume it via the getters below and need no edits.
const COMPETITION_ID_TO_PLAYER_STATUS: Record<string, string> = {
  endesa: 'Endesa',
  euroleague: 'Euroleague',
};

// UniversalPlayerSearcher uses a separate league-id taxonomy (lower-case, no spaces).
// Mirror it here so the searcher default stays datengetrieben.
const COMPETITION_ID_TO_SEARCHER_ID: Record<string, string> = {
  endesa: 'endesa',
  euroleague: 'euroleague',
};

export function getDomesticCompetition(state: MinimalState): CompetitionSpec | null {
  const list = state.activeCompetitions ?? [];
  return list.find(c => c.format === 'regular-league') ?? null;
}

export function getContinentalCompetition(state: MinimalState): CompetitionSpec | null {
  const list = state.activeCompetitions ?? [];
  return list.find(c => c.format === 'group-knockout') ?? null;
}

export function getDomesticPlayerStatus(state: MinimalState): string | null {
  const c = getDomesticCompetition(state);
  return c ? COMPETITION_ID_TO_PLAYER_STATUS[c.id] ?? null : null;
}

export function getContinentalPlayerStatus(state: MinimalState): string | null {
  const c = getContinentalCompetition(state);
  return c ? COMPETITION_ID_TO_PLAYER_STATUS[c.id] ?? null : null;
}

export function getActivePlayerStatuses(state: MinimalState): string[] {
  return [getDomesticPlayerStatus(state), getContinentalPlayerStatus(state)].filter((s): s is string => !!s);
}

export function getDefaultEuroLeagueSearcherIds(state: MinimalState): string[] {
  const ids: string[] = [];
  const dom = getDomesticCompetition(state);
  const con = getContinentalCompetition(state);
  if (dom && COMPETITION_ID_TO_SEARCHER_ID[dom.id]) ids.push(COMPETITION_ID_TO_SEARCHER_ID[dom.id]);
  if (con && COMPETITION_ID_TO_SEARCHER_ID[con.id]) ids.push(COMPETITION_ID_TO_SEARCHER_ID[con.id]);
  return ids;
}

// ─── Tabbed league split ───────────────────────────────────────────────────
//
// Phase 2 introduces a 3-tab UI pattern (Endesa | Euroleague | NBA) for stat
// views. The helpers below give callers a single source of truth so each view
// stays declarative.

export type LeagueTabId = 'domestic' | 'continental' | 'nba';

export interface LeagueTab {
  id: LeagueTabId;
  label: string;
  competitionId?: string;
  league?: NonNBATeam['league'];
}

export function getLeagueTabs(state: MinimalState): LeagueTab[] {
  const dom = getDomesticCompetition(state);
  const con = getContinentalCompetition(state);
  const tabs: LeagueTab[] = [];
  if (dom && COMPETITION_ID_TO_PLAYER_STATUS[dom.id]) {
    tabs.push({
      id: 'domestic',
      label: dom.shortName ?? dom.displayName ?? dom.id,
      competitionId: dom.id,
      league: COMPETITION_ID_TO_PLAYER_STATUS[dom.id] as NonNBATeam['league'],
    });
  }
  if (con && COMPETITION_ID_TO_PLAYER_STATUS[con.id]) {
    tabs.push({
      id: 'continental',
      label: con.shortName ?? con.displayName ?? con.id,
      competitionId: con.id,
      league: COMPETITION_ID_TO_PLAYER_STATUS[con.id] as NonNBATeam['league'],
    });
  }
  if (tabs.length > 0) tabs.push({ id: 'nba', label: 'NBA' });
  return tabs;
}

export function getDefaultLeagueTabId(state: MinimalState): LeagueTabId {
  const tabs = getLeagueTabs(state);
  return tabs[0]?.id ?? 'nba';
}

export function getTeamsForLeagueTab(state: StateWithTeams, tabId: LeagueTabId): NBATeam[] {
  if (tabId === 'nba') return state.teams;
  const tabs = getLeagueTabs(state);
  const tab = tabs.find(t => t.id === tabId);
  if (!tab || !tab.league) return [];
  // Include BOTH the raw nonNBATeam tid AND the aliased tid (if any). Real
  // Madrid lives in nonNBATeams as both league='Endesa' (tid 5xxx) and
  // league='Euroleague' (tid 1xxx), and the clubAliasMap bridges the two.
  // Returning both halves ensures players whose `tid` references either side
  // are included when the user picks the corresponding hub.
  const tids = (state.nonNBATeams ?? [])
    .filter(t => t.league === tab.league)
    .flatMap(t => {
      const aliased = state.clubAliasMap?.[t.tid];
      return aliased !== undefined ? [t.tid, aliased] : [t.tid];
    });
  const uniq = Array.from(new Set(tids));
  return uniq
    .map(tid => resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []))
    .filter((t): t is NBATeam => !!t);
}

export function filterScheduleByLeagueTab<G extends { competitionId?: string }>(
  state: StateWithTeams,
  tabId: LeagueTabId,
  schedule: G[],
): G[] {
  if (tabId === 'nba') return schedule.filter(g => !g.competitionId);
  const tab = getLeagueTabs(state).find(t => t.id === tabId);
  if (!tab?.competitionId) return [];
  return schedule.filter(g => g.competitionId === tab.competitionId);
}

// Returns true unless the user is a GM whose team isn't in the continental
// comp (e.g. Euroleague). Used by Schedule/Calendar/NavigationMenu to hide
// EL clutter for non-qualified GMs — commissioners and qualified GMs always
// see everything. If there's no continental comp, falls through to true.
export function userQualifiesForContinental(state: StateWithTeams): boolean {
  if (state.gameMode !== 'gm') return true;
  if (state.userTeamId == null) return true;
  const con = getContinentalCompetition(state);
  if (!con) return true;
  const conTeams = getTeamsForLeagueTab(state, 'continental');
  return conTeams.some(t => t.id === state.userTeamId);
}

export function isEuroVisibleScheduleGame(state: StateWithTeams, game: Game): boolean {
  if (game.competitionId) {
    const allowedIds = new Set([
      ...(state.activeCompetitions ?? []).map(c => c.id),
      'endesa',
      'euroleague',
      'copa-del-rey',
      'supercopa',
    ]);
    if (!allowedIds.has(game.competitionId)) return false;

    const con = getContinentalCompetition(state);
    if (con?.id === game.competitionId && !userQualifiesForContinental(state)) return false;
    return true;
  }

  if ((game as any).isPreseason && (game.homeTid >= 100 || game.awayTid >= 100)) return true;
  return game.homeTid >= 100 && game.awayTid >= 100;
}

export function filterBoxScoresByLeagueTab<B extends { competitionId?: string }>(
  state: StateWithTeams,
  tabId: LeagueTabId,
  boxScores: B[],
): B[] {
  if (tabId === 'nba') return boxScores.filter(b => !b.competitionId);
  const tab = getLeagueTabs(state).find(t => t.id === tabId);
  if (!tab?.competitionId) return [];
  return boxScores.filter(b => b.competitionId === tab.competitionId);
}
