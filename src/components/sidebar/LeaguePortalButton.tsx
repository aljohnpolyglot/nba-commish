import React from 'react';
import { useGame } from '../../store/GameContext';

export const LeaguePortalButton: React.FC = () => {
  const { state, dispatchAction } = useGame();
  if (state.leagueStats?.uiMode !== 'euro_isolated') return null;
  const inPortal = state.portalTarget === 'nba';
  return (
    <button
      onClick={() => dispatchAction({ type: 'UPDATE_STATE', payload: { portalTarget: inPortal ? null : 'nba' } } as any)}
      className="mx-3 mb-3 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-left text-xs font-black uppercase tracking-widest text-slate-200 hover:border-amber-400"
    >
      {inPortal ? 'Back to Liga ACB' : 'Open NBA Portal'}
    </button>
  );
};
