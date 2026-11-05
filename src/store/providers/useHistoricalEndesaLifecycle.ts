import type { Dispatch, SetStateAction } from 'react';
import { useEffect } from 'react';
import type { GameState } from '../../types';
import { advanceHistoricalEndesaSeason } from '../../services/historicalEndesa/lifecycle';
import { loadHistoricalEndesaSource } from '../../services/historicalEndesa/loader';

type SetGameState = Dispatch<SetStateAction<GameState>>;

export function useHistoricalEndesaLifecycle(state: GameState, setState: SetGameState): void {
  useEffect(() => {
    if (!state.isDataLoaded || !state.historicalEndesa || state.moddedLeagueBase !== 'europe' || state.europeMarket !== 'spain') return;
    let cancelled = false;
    loadHistoricalEndesaSource()
      .then(source => {
        if (!cancelled) setState(prev => advanceHistoricalEndesaSeason(prev, source));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    setState,
    state.europeMarket,
    state.historicalEndesa?.materializedSeasons?.length,
    state.historicalEndesa?.sourceVersion,
    state.isDataLoaded,
    state.leagueStats.year,
    state.moddedLeagueBase,
  ]);
}
