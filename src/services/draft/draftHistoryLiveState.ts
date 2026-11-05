import type { GameState } from '../../types';
import { buildDraftOrderFromState } from './draftOrder';

export function appendLiveDraftSelection<TPlayer>(
  drafted: Readonly<Record<number, TPlayer>>,
  slot: number,
  player: TPlayer,
): Record<number, TPlayer> {
  return { ...drafted, [slot]: player };
}

export function buildLiveDraftHistoryState(
  state: GameState,
  draftClass: ReadonlyArray<{ _slot?: number }>,
  viewDraftYear: number,
  leagueYear: number,
  pbaMode: boolean,
) {
  if (pbaMode || viewDraftYear !== leagueYear) return null;
  const draftOrder = state.activeDraftOrder?.length
    ? state.activeDraftOrder
    : buildDraftOrderFromState(state);
  const drafted = { ...(state.activeDraftPicks ?? {}) };
  for (const player of draftClass) {
    const slot = Number(player._slot);
    if (Number.isFinite(slot) && !drafted[slot]) drafted[slot] = player;
  }
  const passed = new Set<number>(
    Object.keys(state.activeDraftPassedPicks ?? {}).map(Number).filter(Number.isFinite),
  );
  const resolvedSlots = [...Object.keys(drafted).map(Number), ...passed].filter(Number.isFinite);
  return {
    drafted,
    draftOrder,
    passed,
    currentPick: resolvedSlots.length > 0 ? Math.max(...resolvedSlots) + 1 : 1,
  };
}
