import type { GameState, NBAPlayer } from '../../types';
import { getScoutedDisplayOverall, getScoutedDisplayPotential } from '../../utils/scoutingFuzz';

export type TradeFinderRosterSortKey = 'ovr' | 'pot' | 'salary';
export type TradeFinderRosterSortDirection = 'asc' | 'desc';

export function sortTradeFinderRoster(
  players: NBAPlayer[],
  key: TradeFinderRosterSortKey,
  direction: TradeFinderRosterSortDirection,
  state: GameState,
  currentYear: number,
): NBAPlayer[] {
  const value = (player: NBAPlayer): number => {
    if (key === 'ovr') return getScoutedDisplayOverall(state, player, currentYear);
    if (key === 'pot') return getScoutedDisplayPotential(state, player, currentYear, currentYear);
    return Number(player.contract?.amount ?? 0);
  };
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...players].sort((left, right) =>
    ((value(left) - value(right)) * multiplier)
    || left.name.localeCompare(right.name),
  );
}
