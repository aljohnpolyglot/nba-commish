import { useContext, useMemo } from 'react';
import { useGame } from '../store/GameContext';
import { CompetitionHubLeagueTabContext } from '../components/competition/hubContext';
import { getTeamsForLeagueTab } from '../utils/euroLeagueDefaults';

/**
 * When rendered inside a CompetitionHubLayout, returns teams/players scoped
 * to that hub's competition. Otherwise returns full NBA pools unchanged.
 *
 * Drop into any analytics view that currently reads state.teams / state.players
 * and should show Euro-league data inside the hub.
 */
export function useHubScope() {
  const { state } = useGame();
  const hubTab = useContext(CompetitionHubLeagueTabContext);

  const teams = useMemo(
    () => hubTab ? getTeamsForLeagueTab(state as any, hubTab) : state.teams,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hubTab, state.teams, (state as any).nonNBATeams, (state as any).activeCompetitions],
  );

  const tids = useMemo(() => new Set(teams.map(t => t.id)), [teams]);

  const players = useMemo(
    () => hubTab ? state.players.filter(p => tids.has(p.tid)) : state.players,
    [hubTab, state.players, tids],
  );

  return { hubTab, teams, tids, players };
}
