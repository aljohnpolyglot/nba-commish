import { useContext, useMemo } from 'react';
import { useGame } from '../store/GameContext';
import { CompetitionHubLeagueTabContext } from '../components/competition/hubContext';
import { getTeamsForLeagueTab } from '../utils/euroLeagueDefaults';
import { isEuroIsolatedMode, isPbaIsolatedMode } from '../utils/uiMode';
import { getResolvedTeamLogoUrl } from '../utils/teamAssets';

/**
 * Scope teams/players to the active competition context:
 * - Inside a CompetitionHubLayout: scoped to that hub's competition.
 * - PBA isolated mode: scoped to PBA teams.
 * - Euro isolated mode: scoped to union of all Euro competitions.
 * - Otherwise (NBA / commissioner mode): full NBA pools unchanged.
 */
export function useHubScope() {
  const { state } = useGame();
  const hubTab = useContext(CompetitionHubLeagueTabContext);
  const euroIsolated = isEuroIsolatedMode(state);
  const pbaIsolated = isPbaIsolatedMode(state);

  const teams = useMemo(() => {
    if (hubTab) return getTeamsForLeagueTab(state as any, hubTab);
    if (pbaIsolated) {
      return ((state as any).nonNBATeams ?? [])
        .filter((t: any) => t.league === 'PBA')
        .map((t: any) => ({
          ...t,
          id: t.tid ?? t.id,
          logoUrl: getResolvedTeamLogoUrl(t),
          wins: Number(t.wins ?? t.won ?? 0),
          losses: Number(t.losses ?? t.lost ?? 0),
          strength: Number(t.strength ?? 50),
          conference: 'PBA',
        }));
    }
    if (euroIsolated) {
      const dom = getTeamsForLeagueTab(state as any, 'domestic');
      const con = getTeamsForLeagueTab(state as any, 'continental');
      const merged = new Map<number, typeof dom[number]>();
      for (const t of [...dom, ...con]) merged.set(t.id, t);
      return Array.from(merged.values());
    }
    return state.teams;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubTab, euroIsolated, pbaIsolated, state.teams, (state as any).nonNBATeams, (state as any).activeCompetitions]);

  const tids = useMemo(() => new Set(teams.map(t => t.id)), [teams]);

  const isScoped = hubTab !== null || euroIsolated || pbaIsolated;
  const pbaBoxScorePlayerIds = useMemo(() => {
    if (!pbaIsolated) return new Set<string>();
    const ids = new Set<string>();
    for (const box of (state.boxScores ?? []) as any[]) {
      if (!String(box?.competitionId ?? '').startsWith('pba-')) continue;
      for (const line of [...(box.homeStats ?? []), ...(box.awayStats ?? [])]) {
        if (line?.playerId) ids.add(line.playerId);
      }
    }
    return ids;
  }, [pbaIsolated, state.boxScores]);

  const players = useMemo(
    () => isScoped
      ? state.players.filter(p => tids.has(p.tid) || (pbaIsolated && pbaBoxScorePlayerIds.has(p.internalId)))
      : state.players,
    [isScoped, pbaBoxScorePlayerIds, pbaIsolated, state.players, tids],
  );

  return { hubTab, teams, tids, players, isScoped, euroIsolated, pbaIsolated };
}
