import type { GameState, LeagueStats, NBAPlayer } from '../../types';
import { isPlayerInLeagueScope } from '../../utils/playerLeagueScope';
import { resolveSeasonRolloverPlayerScope } from '../logic/seasonRollover/leagueScope';

export type DraftTaskKind = 'draftLottery' | 'draftOrderReview' | 'draft' | 'rookieContracts';

export function isDraftEnabled(stats: Pick<LeagueStats, 'enableDraft' | 'draftType'>): boolean {
  return stats.enableDraft !== false && stats.draftType !== 'none' && stats.draftType !== 'no_draft';
}

export function getDraftTaskApplicability(stats: Pick<LeagueStats, 'enableDraft' | 'draftType' | 'draftLotteryEnabled'>): Record<DraftTaskKind, boolean> {
  const enabled = isDraftEnabled(stats);
  return {
    draftLottery: enabled && stats.draftLotteryEnabled !== false && stats.draftType !== 'inverse_standings',
    draftOrderReview: enabled,
    draft: enabled,
    rookieContracts: enabled,
  };
}

/** No-draft class entry writer: revealed prospects enter the normal market exactly once. */
export function enterFreeAgencyForDraftDisabledClass(state: GameState, season: number): GameState {
  if (isDraftEnabled(state.leagueStats)) return state;
  const { playerScope, activeTeamIds } = resolveSeasonRolloverPlayerScope(state);
  let changed = false;
  const players = state.players.map((player: NBAPlayer) => {
    const draftYear = Number((player as NBAPlayer & { draftYear?: number }).draftYear ?? player.draft?.year);
    if (
      draftYear !== season
      || player.tid >= 0
      || player.status === 'Free Agent'
      || !isPlayerInLeagueScope(player, playerScope, activeTeamIds)
    ) return player;
    changed = true;
    return {
      ...player,
      tid: -1,
      status: 'Free Agent' as const,
      draft: undefined,
    };
  });
  return changed ? { ...state, players } : state;
}
