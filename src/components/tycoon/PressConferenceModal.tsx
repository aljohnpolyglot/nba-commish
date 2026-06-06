import React from 'react';
import { Mic2, X } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { isEuroIsolatedMode } from '../../utils/uiMode';

export const PressConferenceModal: React.FC = () => {
  const { state, applyTycoonMutation } = useGame() as any;
  if (!isEuroIsolatedMode(state) || state.gameMode !== 'gm') return null;
  const team = resolveAnyTeam(state.userTeamId, state.teams, state.nonNBATeams ?? []) as any;
  const press = team?.tycoon?.pendingPressConference;
  if (!press) return null;

  const respond = (optionId?: string) => {
    const option = press.options.find((o: any) => o.id === optionId);
    applyTycoonMutation(state.userTeamId, (t: any) => {
      if (!t.tycoon) return;
      if (option) {
        t.tycoon.boardConfidence = Math.max(0, Math.min(100, Math.round((t.tycoon.boardConfidence ?? 60) + option.boardDelta)));
        t.tycoon.playerDramaLog = [
          ...(t.tycoon.playerDramaLog ?? []),
          {
            id: press.id,
            date: state.date,
            playerId: press.playerId,
            playerName: press.playerName,
            response: option.id,
            boardDelta: option.boardDelta,
            moraleDelta: option.moraleDelta,
          },
        ].slice(-20);
      }
      delete t.tycoon.pendingPressConference;
    });
  };

  return (
    <div className="fixed inset-0 z-[145] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-violet-400/30 bg-slate-950 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl border border-violet-400/40 bg-violet-400/10 flex items-center justify-center text-violet-200">
              <Mic2 size={22} />
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-violet-300">Press Conference</div>
              <div className="text-sm text-slate-400">{press.playerName}</div>
            </div>
          </div>
          <button onClick={() => respond()} className="w-10 h-10 rounded-xl border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto p-4 sm:p-6">
          <h3 className="text-2xl font-black tracking-tight">{press.headline}</h3>
          <p className="mt-3 text-sm leading-6 text-slate-300">{press.prompt}</p>
          <div className="mt-6 space-y-3">
            {press.options.map((option: any) => (
              <button
                key={option.id}
                onClick={() => respond(option.id)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900/80 p-4 text-left hover:border-violet-400/50"
              >
                <div className="font-black text-white">{option.label}</div>
                <div className="mt-1 text-xs text-slate-400">
                  Board {option.boardDelta >= 0 ? '+' : ''}{option.boardDelta} · Player morale {option.moraleDelta >= 0 ? '+' : ''}{option.moraleDelta}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
