import type { Dispatch, SetStateAction } from 'react';
import { useEffect } from 'react';
import type { GameState } from '../../types';
import { advanceHistoricalPbaSeason } from '../../services/pba/historicalLifecycle';
import { loadHistoricalPbaSource } from '../../services/pba/historicalLoader';
import { advancePbaNbaImportReservoir } from '../../services/pba/nbaImportReservoir';
import { advanceNbaExternalPbaMarket } from '../../services/pba/nbaExternalMarketLifecycle';
import { PBA_HISTORICAL_CATALOG } from '../../services/pba/historicalCatalog';
import { getRosterData } from '../../services/rosterService';
import {
  hydrateHistoricalPbaSourceHistory,
  PBA_SOURCE_HISTORY_HYDRATION_VERSION,
} from '../../services/pba/historicalHistoryHydration';

type SetGameState = Dispatch<SetStateAction<GameState>>;

export function useHistoricalPbaLifecycle(state: GameState, setState: SetGameState): void {
  useEffect(() => {
    if (!state.isDataLoaded || !state.historicalPba || state.moddedLeagueBase !== 'philippines') return;
    const alreadyMaterialized = state.historicalPba.materializedSeasons.includes(state.leagueStats.year);
    const historyHydrated = Number(state.historicalPba.sourceHistoryHydrationVersion ?? 0)
      >= PBA_SOURCE_HISTORY_HYDRATION_VERSION;
    if (alreadyMaterialized && historyHydrated) return;
    let cancelled = false;
    loadHistoricalPbaSource()
      .then(source => {
        if (cancelled) return;
        setState(current => hydrateHistoricalPbaSourceHistory(
          current.historicalPba?.materializedSeasons.includes(current.leagueStats.year)
            ? current
            : advanceHistoricalPbaSeason(current, source),
          source,
        ));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    setState,
    state.historicalPba?.materializedSeasons.length,
    state.historicalPba?.sourceHistoryHydrationVersion,
    state.historicalPba?.sourceVersion,
    state.isDataLoaded,
    state.leagueStats.year,
    state.moddedLeagueBase,
  ]);

  useEffect(() => {
    if (!state.isDataLoaded || !state.historicalPba || state.moddedLeagueBase !== 'philippines') return;
    if ((state.historicalPba.materializedNbaMarketSeasons ?? []).includes(state.leagueStats.year)) return;
    let cancelled = false;
    getRosterData(state.leagueStats.year - 1, 'Opening Week')
      .then(reference => {
        if (!cancelled) setState(current => advancePbaNbaImportReservoir(current, reference));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    setState,
    state.historicalPba?.materializedNbaMarketSeasons?.length,
    state.historicalPba?.sourceVersion,
    state.isDataLoaded,
    state.leagueStats.year,
    state.moddedLeagueBase,
  ]);

  useEffect(() => {
    if (!state.isDataLoaded || state.leagueType !== 'modded' || state.moddedLeagueBase !== 'nba') return;
    const tracker = state.nbaExternalPbaMarket;
    if (
      tracker?.sourceVersion === PBA_HISTORICAL_CATALOG.sourceVersion
      && tracker.materializedSeasons.includes(state.leagueStats.year)
    ) return;
    let cancelled = false;
    loadHistoricalPbaSource()
      .then(source => {
        if (!cancelled) setState(current => advanceNbaExternalPbaMarket(current, source));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    setState,
    state.isDataLoaded,
    state.leagueStats.year,
    state.leagueType,
    state.moddedLeagueBase,
    state.nbaExternalPbaMarket?.materializedSeasons.length,
    state.nbaExternalPbaMarket?.sourceVersion,
  ]);
}
