import type { GameState, NBAPlayer } from '../../types';
import { isPbaRosterLocal } from './importManager';

const isPbaTeamTid = (tid: number): boolean => Number.isFinite(tid) && tid >= 2000 && tid < 3000;

export function preparePbaLocalFreeAgency(state: GameState): Partial<GameState> {
  if (state.leagueStats?.uiMode !== 'pba_isolated') return {};
  const leagueStats = state.leagueStats as any;
  const season = Number(leagueStats?.year ?? new Date().getFullYear());
  if (!Number.isFinite(season)) return {};
  if (Number(leagueStats?.pbaLocalFreeAgencyPreparedSeason) === season) return {};

  let released = 0;
  const players = state.players.map((player: NBAPlayer) => {
    const tid = Number(player.tid);
    const exp = Number(player.contract?.exp ?? Number.POSITIVE_INFINITY);
    if (!isPbaTeamTid(tid)) return player;
    if (player.status !== 'PBA') return player;
    if (!isPbaRosterLocal(player, leagueStats)) return player;
    if (!Number.isFinite(exp) || exp > season) return player;
    released += 1;
    return {
      ...player,
      tid: -1,
      status: 'Free Agent' as const,
      yearsWithTeam: 0,
      signedDate: undefined,
      tradeEligibleDate: undefined,
      twoWay: undefined,
      nonGuaranteed: false,
      pbaPreviousTid: tid,
    } as NBAPlayer;
  });

  return {
    ...(released > 0 ? { players } : {}),
    leagueStats: {
      ...state.leagueStats,
      pbaLocalFreeAgencyPreparedSeason: season,
    } as any,
  };
}
