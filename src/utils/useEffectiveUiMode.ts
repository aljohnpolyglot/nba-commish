import { useGame } from '../store/GameContext';

export type EffectiveUiMode = 'nba' | 'euro_isolated';

export const getEffectiveUiMode = (state: { portalTarget?: string | null; leagueStats?: { uiMode?: EffectiveUiMode } }): EffectiveUiMode =>
  state.portalTarget === 'nba' ? 'nba' : (state.leagueStats?.uiMode ?? 'nba');

export const useEffectiveUiMode = (): EffectiveUiMode => {
  const { state } = useGame();
  return getEffectiveUiMode(state as any);
};
