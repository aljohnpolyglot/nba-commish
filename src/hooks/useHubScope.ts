import { useContext, useMemo } from 'react';
import { useGame } from '../store/GameContext';
import { CompetitionHubLeagueTabContext } from '../components/competition/hubContext';
import { selectCompetitionTeamTids } from '../services/competition/competitionScheduler';
import { resolveAnyTeam } from '../utils/teamLookup';
import { isEuroIsolatedMode, isPbaIsolatedMode, isWnbaIsolatedMode } from '../utils/uiMode';
import { getResolvedTeamLogoUrl } from '../utils/teamAssets';
import { isExternalLeaguePlayer } from '../utils/playerLeagueScope';

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
  const wnbaIsolated = isWnbaIsolatedMode(state);
  const fictional = state.leagueType === 'fictional';

  const teams = useMemo(() => {
    if (hubTab) {
      const spec = state.activeCompetitions?.find(competition => competition.id === hubTab);
      if (!spec) return [];
      return selectCompetitionTeamTids(spec, state as any)
        .map(tid => resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []))
        .filter((team): team is NonNullable<typeof team> => team !== null);
    }
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
    if (wnbaIsolated) {
      return ((state as any).nonNBATeams ?? [])
        .filter((team: any) => team.league === 'WNBA' || (Number(team.tid) >= 3000 && Number(team.tid) < 4000))
        .map((team: any) => resolveAnyTeam(Number(team.tid ?? team.id), state.teams, state.nonNBATeams ?? []))
        .filter((team): team is NonNullable<typeof team> => team !== null);
    }
    if (euroIsolated) {
      const competitionTeams = (state.activeCompetitions ?? []).flatMap(spec => (
        selectCompetitionTeamTids(spec, state as any)
          .map(tid => resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []))
          .filter((team): team is NonNullable<typeof team> => team !== null)
      ));
      const merged = new Map<number, typeof competitionTeams[number]>();
      for (const t of competitionTeams) merged.set(t.id, t);
      return Array.from(merged.values());
    }
    return state.teams;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubTab, euroIsolated, pbaIsolated, wnbaIsolated, state.teams, (state as any).nonNBATeams, (state as any).activeCompetitions]);

  const tids = useMemo(() => new Set(teams.map(t => t.id)), [teams]);

  const isScoped = hubTab !== null || euroIsolated || pbaIsolated || wnbaIsolated;
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

  const players = useMemo(() => {
    const leaguePlayers = fictional
      ? state.players.filter(player => !isExternalLeaguePlayer(player))
      : state.players;
    return isScoped
      ? leaguePlayers.filter(player =>
          tids.has(player.tid)
          || (pbaIsolated && pbaBoxScorePlayerIds.has(player.internalId))
          || (pbaIsolated && (player.stats ?? []).some(stat => (
            stat.tid >= 2000
            && stat.tid < 3000
            && (
              String(stat.competitionId ?? '').toLowerCase() === 'pba'
              || String(stat.competitionId ?? '').toLowerCase().startsWith('pba-')
            )
          )))
          || (wnbaIsolated && (
            player.status === 'WNBA'
            || player.gender === 'female'
            || String(player.internalId ?? '').toLowerCase().startsWith('wnba-')
            || (player.stats ?? []).some(stat => (
              String(stat.competitionId ?? '').toLowerCase() === 'wnba'
              || (Number(stat.tid) >= 3000 && Number(stat.tid) < 4000)
            ))
          ))
        )
      : leaguePlayers;
  }, [fictional, isScoped, pbaBoxScorePlayerIds, pbaIsolated, state.players, tids, wnbaIsolated]);

  return { hubTab, teams, tids, players, isScoped, euroIsolated, pbaIsolated, wnbaIsolated };
}
