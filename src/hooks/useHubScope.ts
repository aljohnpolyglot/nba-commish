import { useContext, useMemo } from 'react';
import { useGame } from '../store/GameContext';
import { CompetitionHubLeagueTabContext } from '../components/competition/hubContext';
import { getTeamsForLeagueTab } from '../utils/euroLeagueDefaults';
import { isEuroIsolatedMode } from '../utils/uiMode';

/**
 * Scope teams/players to the active competition context:
 * - Inside a CompetitionHubLayout: scoped to that hub's competition.
 * - Outside a hub but in Euro isolated mode: scoped to union of all Euro
 *   competitions (Endesa + Euroleague) so standalone Injuries/PlayerStats/etc.
 *   don't leak NBA data.
 * - Otherwise (NBA / commissioner mode): full NBA pools unchanged.
 */
export function useHubScope() {
  const { state } = useGame();
  const hubTab = useContext(CompetitionHubLeagueTabContext);
  const euroIsolated = isEuroIsolatedMode(state);

  const teams = useMemo(() => {
    if (hubTab) return getTeamsForLeagueTab(state as any, hubTab);
    if (euroIsolated) {
      const dom = getTeamsForLeagueTab(state as any, 'domestic');
      const con = getTeamsForLeagueTab(state as any, 'continental');
      const merged = new Map<number, typeof dom[number]>();
      for (const t of [...dom, ...con]) merged.set(t.id, t);
      return Array.from(merged.values());
    }
    return state.teams;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubTab, euroIsolated, state.teams, (state as any).nonNBATeams, (state as any).activeCompetitions]);

  const tids = useMemo(() => new Set(teams.map(t => t.id)), [teams]);

  const isScoped = hubTab !== null || euroIsolated;
  const players = useMemo(
    () => isScoped ? state.players.filter(p => tids.has(p.tid)) : state.players,
    [isScoped, state.players, tids],
  );

  return { hubTab, teams, tids, players, isScoped, euroIsolated };
}
