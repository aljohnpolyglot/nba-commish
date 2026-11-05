import { useEffect } from 'react';
import type React from 'react';
import type { GameState } from '../../types';
import {
  isFranchiseExperienceAvailable,
  syncFranchiseState,
} from '../../services/franchises/franchiseState';
import { isArenaDataLoaded, loadArenas } from '../../utils/arenaData';

export function useFranchiseLifecycle(
  state: GameState,
  setState: React.Dispatch<React.SetStateAction<GameState>>,
) {
  useEffect(() => {
    if (!state.isDataLoaded) return;
    if (!isFranchiseExperienceAvailable(state)) return;
    setState(previous => syncFranchiseState(previous));
    if (state.leagueType === 'fictional' || isArenaDataLoaded()) return;
    let cancelled = false;
    void loadArenas().then(() => {
      if (!cancelled) setState(previous => syncFranchiseState(previous));
    });
    return () => { cancelled = true; };
  }, [
    setState,
    state.gameMode,
    state.isDataLoaded,
    state.leagueStats.jerseyPatchProgramEnabled,
    state.leagueStats.uiMode,
    state.leagueStats.year,
    state.leagueType,
    !!state.offseasonChecklist,
    state.saveId,
    state.userTeamId,
  ]);
}
