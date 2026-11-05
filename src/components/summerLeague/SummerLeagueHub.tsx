import { useEffect, useState } from 'react';
import type { NBAPlayer } from '../../types';
import type { SummerLeagueHistoryEntry } from '../../services/summerLeague/types';
import { loadSummerLeagueHistory } from '../../services/summerLeague/history';
import { useGame } from '../../store/GameContext';
import { PlayerBioView } from '../central/view/PlayerBioView';
import SummerLeagueApp from './App';
import { saveSummerLeagueRosterReviewDraft } from '../../services/summerLeague/roster';

export function SummerLeagueHub() {
  const { state, dispatchAction, navigateToPlayer } = useGame();
  const [history, setHistory] = useState<SummerLeagueHistoryEntry[]>([]);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [player, setPlayer] = useState<NBAPlayer | null>(null);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    loadSummerLeagueHistory(state)
      .then(entries => {
        if (active) setHistory(entries);
      })
      .catch(error => {
        if (active) setLoadError(error instanceof Error ? error : new Error('Summer League history could not be loaded.'));
      });
    return () => {
      active = false;
    };
  }, [
    state.leagueStats.historicalEraStartYear,
    state.leagueStats.year,
    state.leagueType,
    state.nbaGmStartMode,
    state.nbaStartYear,
    state.summerLeagueHistory,
    state.summerLeagueTournament?.id,
    state.summerLeagueTournament?.status,
    state.summerLeagueTournament?.reviewed,
    state.summerLeagueTournament?.boxScores.length,
  ]);

  if (loadError) throw loadError;

  if (player) {
    return <PlayerBioView player={player} onBack={() => setPlayer(null)} />;
  }

  return (
    <SummerLeagueApp
      entries={history}
      players={state.players}
      currentTournament={state.summerLeagueTournament}
      isCommissionerMode={state.gameMode !== 'gm'}
      onReviewDraftChange={draft => {
        const tournament = state.summerLeagueTournament;
        if (!tournament) return;
        const next = saveSummerLeagueRosterReviewDraft(tournament, draft);
        if (next === tournament) return;
        void dispatchAction({ type: 'UPDATE_STATE', payload: { summerLeagueTournament: next } } as any);
      }}
      onFinalizeRoster={playerIds => {
        void dispatchAction({
          type: 'SUMMER_LEAGUE_SET_ROSTER',
          payload: { playerIds, finalizeAndSim: true },
        });
      }}
      onSimulate={() => {
        void dispatchAction({ type: 'SUMMER_LEAGUE_SIMULATE' });
      }}
      onComplete={() => {
        void dispatchAction({
          type: 'OFFSEASON_COMPLETE_PHASE',
          payload: { row: 'summerLeague' },
        });
      }}
      onPlayerSelect={selectedPlayer => {
        const savedPlayer = state.players.find(candidate => candidate.internalId === selectedPlayer.internalId);
        if (savedPlayer) navigateToPlayer(savedPlayer);
        else setPlayer(selectedPlayer);
      }}
    />
  );
}
