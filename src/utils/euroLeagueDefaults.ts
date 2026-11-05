import type { CompetitionSpec } from '../services/competition/types';
import type { NBATeam, NonNBATeam, Game } from '../types';
import { selectEuroleagueParticipants } from './euroleagueQualification';
import { resolveAnyTeam } from './teamLookup';
import { EURO_BASKETBALL_SOURCE_ARCHIVES, EUROLEAGUE_2026_SOURCE } from '../data/euroBasketballSources';
import { selectCompetitionTeamTids } from '../services/competition/competitionScheduler';

interface MinimalState {
  activeCompetitions?: CompetitionSpec[];
  leagueStats?: { uiMode?: string | null; historicalEndesaEnabled?: boolean; year?: number };
  userTeamId?: number | null;
  gameMode?: string | null;
  euroPrimaryCompetitionId?: string;
}

export interface StateWithTeams extends MinimalState {
  teams: NBATeam[];
  nonNBATeams?: NonNBATeam[];
  schedule?: Game[];
  boxScores?: Array<{ competitionId?: string; gameId?: number; date?: string }>;
  clubAliasMap?: Record<number, number>;
  euroleagueSeededTids?: number[];
  euroleagueSeedSeason?: number;
  euroCompetitionTeamTids?: Record<string, number[]>;
}

const PAN_EUROPEAN_COMPETITION_IDS = new Set(['euroleague', 'eurocup']);

function competitionMembership(state: StateWithTeams, competition: CompetitionSpec): Set<number> {
  const explicit = state.euroCompetitionTeamTids?.[competition.id];
  const tids = explicit?.length
    ? explicit
    : selectCompetitionTeamTids(competition, state);
  const expanded = tids.flatMap(tid => {
    const alias = state.clubAliasMap?.[tid];
    const reverseAliases = Object.entries(state.clubAliasMap ?? {})
      .filter(([, target]) => Number(target) === tid)
      .map(([source]) => Number(source));
    return [tid, alias, ...reverseAliases].filter((value): value is number => value !== undefined && Number.isFinite(value));
  });
  return new Set(expanded);
}

export function getRelevantEuroCompetitions(state: StateWithTeams): CompetitionSpec[] {
  const competitions = state.activeCompetitions ?? [];
  const primaryId = state.euroPrimaryCompetitionId ?? 'endesa';
  const primary = competitions.find(competition => competition.id === primaryId);
  const domesticMembership = primary ? competitionMembership(state, primary) : new Set<number>();
  return competitions.filter(competition => {
    if (competition.id === primaryId || competition.domesticParentId === primaryId) return true;
    if (!PAN_EUROPEAN_COMPETITION_IDS.has(competition.id)) return false;
    if (domesticMembership.size === 0) return false;
    const participants = competitionMembership(state, competition);
    return [...participants].some(tid => domesticMembership.has(tid));
  });
}

// spec.id → player.status. Future templates (Greece A1, France LNB, Germany BBL, …)
// extend this map; views consume it via the getters below and need no edits.
const COMPETITION_ID_TO_PLAYER_STATUS: Record<string, string> = Object.fromEntries([
  [EUROLEAGUE_2026_SOURCE.competitionId, EUROLEAGUE_2026_SOURCE.leagueStatus],
  ...EURO_BASKETBALL_SOURCE_ARCHIVES.map(source => [source.competitionId, source.leagueStatus]),
  ['endesa', 'Endesa'],
]);

// UniversalPlayerSearcher uses a separate league-id taxonomy (lower-case, no spaces).
// Mirror it here so the searcher default stays datengetrieben.
const COMPETITION_ID_TO_SEARCHER_ID: Record<string, string> = Object.fromEntries(
  Object.keys(COMPETITION_ID_TO_PLAYER_STATUS).map(id => [id, id]),
);

export function getDomesticCompetition(state: MinimalState): CompetitionSpec | null {
  const list = state.activeCompetitions ?? [];
  return list.find(c => c.id === state.euroPrimaryCompetitionId)
    ?? list.find(c => c.format === 'regular-league' && c.backgroundOnly !== true)
    ?? null;
}

export function getContinentalCompetition(state: MinimalState): CompetitionSpec | null {
  const list = state.activeCompetitions ?? [];
  return list.find(c => c.id === 'euroleague')
    ?? list.find(c => c.id === 'eurocup')
    ?? list.find(c => c.format === 'group-knockout')
    ?? null;
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
  if (tabs.length > 0 && state.leagueStats?.historicalEndesaEnabled !== true) tabs.push({ id: 'nba', label: 'NBA' });
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
  const explicitTids = tab.competitionId ? state.euroCompetitionTeamTids?.[tab.competitionId] : undefined;
  const tids = explicitTids?.length
    ? explicitTids.flatMap(tid => [tid, state.clubAliasMap?.[tid]].filter((value): value is number => value !== undefined))
    : tab.id === 'continental' && tab.competitionId === 'euroleague'
      ? selectEuroleagueParticipants(state, getContinentalCompetition(state)?.teamCount).tids
      : (state.nonNBATeams ?? [])
      .filter(t => t.league === tab.league && (tab.league !== 'Endesa' || (t as any).endesaRelegated !== true))
      .flatMap(t => {
        const aliased = state.clubAliasMap?.[t.tid];
        return aliased !== undefined ? [t.tid, aliased] : [t.tid];
      });
  if (tab.id === 'continental') {
    if (tab.competitionId !== 'euroleague') tids.push(...Object.values(state.clubAliasMap ?? {}));
  }
  const uniq = Array.from(new Set(tids));
  return uniq
    .map(tid => resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []))
    .filter((t): t is NBATeam => !!t);
}

export function getCompetitionPlayerStatus(competitionId: string): string | null {
  return COMPETITION_ID_TO_PLAYER_STATUS[competitionId] ?? null;
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

export function userParticipatesInCompetition(state: StateWithTeams, competitionId: string): boolean {
  if (state.gameMode !== 'gm' || state.userTeamId == null) return true;
  if (competitionId === state.euroPrimaryCompetitionId) return true;
  const scheduled = (state.schedule ?? []).filter(game => game.competitionId === competitionId);
  if (scheduled.length > 0) {
    return scheduled.some(game => game.homeTid === state.userTeamId || game.awayTid === state.userTeamId);
  }
  const spec = (state.activeCompetitions ?? []).find(competition => competition.id === competitionId);
  if (spec?.format === 'knockout' && spec.qualificationRule === 'domestic-standings') {
    return selectCompetitionTeamTids(spec, state).includes(state.userTeamId);
  }
  const explicit = state.euroCompetitionTeamTids?.[competitionId];
  if (explicit?.length) return explicit.includes(state.userTeamId);
  return (state.schedule ?? []).some(game => (
    game.competitionId === competitionId
    && (game.homeTid === state.userTeamId || game.awayTid === state.userTeamId)
  ));
}

export function getManagedEuroCompetitions(state: StateWithTeams): CompetitionSpec[] {
  return (state.activeCompetitions ?? []).filter(competition =>
    userParticipatesInCompetition(state, competition.id),
  );
}

export function getEuroHistoryCompetitions(state: StateWithTeams): CompetitionSpec[] {
  const primaryId = state.euroPrimaryCompetitionId ?? 'endesa';
  return getRelevantEuroCompetitions(state)
    .sort((left, right) => {
      const rank = (competition: CompetitionSpec) => (
        competition.id === primaryId ? 0
          : competition.domesticParentId === primaryId ? 1
            : competition.id === 'euroleague' ? 2
              : competition.id === 'eurocup' ? 3
                : competition.domesticParentId ? 5
                  : 4
      );
      return rank(left) - rank(right)
        || left.seasonStart.month - right.seasonStart.month
        || left.seasonStart.day - right.seasonStart.day;
    });
}

export function isEuroVisibleScheduleGame(state: StateWithTeams, game: Game): boolean {
  if (game.competitionId) {
    const allowedIds = new Set((state.activeCompetitions ?? []).map(c => c.id));
    if (!allowedIds.has(game.competitionId)) return false;
    return userParticipatesInCompetition(state, game.competitionId);
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
