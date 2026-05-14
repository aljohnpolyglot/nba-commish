import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { getTeamFullName } from '../../utils/teamNames';
import type { NBATeam } from '../../types';

const fmtEUR = (value: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);

const tierRank: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4 };

export const EuroBankruptcyModal: React.FC = () => {
  const { state, dispatchAction, setCurrentView } = useGame();
  const pending = state.pendingEuroBankruptcy;
  const [selectedTid, setSelectedTid] = useState<number | null>(null);

  const candidates = useMemo(() => {
    if (!pending) return [];
    return (state.teams as NBATeam[])
      .filter(team => team.tycoon && team.id !== pending.teamId)
      .sort((a, b) => {
        const tierDelta = (tierRank[a.tycoon?.tier ?? 'D'] ?? 9) - (tierRank[b.tycoon?.tier ?? 'D'] ?? 9);
        if (tierDelta !== 0) return tierDelta;
        return (b.tycoon?.cashOnHand ?? 0) - (a.tycoon?.cashOnHand ?? 0);
      });
  }, [pending, state.teams]);

  if (!pending) return null;

  const selected = candidates.find(team => team.id === selectedTid) ?? candidates[0];

  const confirm = () => {
    if (!selected) return;
    dispatchAction({
      type: 'UPDATE_STATE',
      payload: {
        userTeamId: selected.id,
        pendingEuroBankruptcy: undefined,
      },
    } as any);
    setCurrentView('Front Office');
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-5xl rounded-2xl border border-rose-500/40 bg-slate-950 shadow-2xl shadow-rose-950/40 overflow-hidden">
        <div className="p-6 border-b border-slate-800 bg-rose-950/20 flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-400/30 flex items-center justify-center text-rose-200">
            <ShieldAlert size={26} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-widest text-rose-300">Game Over: Bankruptcy</div>
            <h2 className="text-2xl font-black text-white mt-1">{pending.teamName} is insolvent</h2>
            <p className="text-sm text-slate-300 mt-2 max-w-3xl">
              The club closes the year with {fmtEUR(pending.cashOnHand)} cash. The league continues, but your current project ends here.
              Pick a new Euro club to continue your GM career.
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-0">
          <div className="p-5 max-h-[62vh] overflow-y-auto">
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {candidates.map(team => {
                const active = (selected?.id ?? selectedTid) === team.id;
                const tycoon = team.tycoon!;
                return (
                  <button
                    key={team.id}
                    onClick={() => setSelectedTid(team.id)}
                    className={`text-left rounded-2xl border p-4 transition-colors ${
                      active
                        ? 'border-amber-400 bg-amber-400/10'
                        : 'border-slate-800 bg-slate-900/70 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {team.logoUrl && <img src={team.logoUrl} alt="" className="w-10 h-10 object-contain" />}
                      <div className="min-w-0">
                        <div className="font-black text-white truncate">{getTeamFullName(team)}</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tier {tycoon.tier}</div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl bg-slate-950/70 p-2">
                        <div className="text-slate-500 font-bold uppercase text-[9px]">Cash</div>
                        <div className={tycoon.cashOnHand >= 0 ? 'text-emerald-300 font-black' : 'text-rose-300 font-black'}>
                          {fmtEUR(tycoon.cashOnHand)}
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-950/70 p-2">
                        <div className="text-slate-500 font-bold uppercase text-[9px]">Prestige</div>
                        <div className="text-amber-200 font-black">{Math.round((tycoon.cityPrestige ?? 0.5) * 100)}%</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="border-t lg:border-t-0 lg:border-l border-slate-800 p-5 bg-slate-900/50">
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
              <div className="flex items-center gap-2 text-amber-200 font-black uppercase tracking-widest text-xs">
                <AlertTriangle size={16} /> New Assignment
              </div>
              <p className="text-sm text-slate-200 mt-3">
                Your old club stays in the league under AI control. Sponsorships, roster state, and competition history are preserved.
              </p>
            </div>
            {selected && (
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="text-xs font-black uppercase tracking-widest text-slate-500">Selected</div>
                <div className="text-lg font-black text-white mt-1">{getTeamFullName(selected)}</div>
                <div className="text-sm text-slate-400 mt-2">Cash: {fmtEUR(selected.tycoon?.cashOnHand ?? 0)}</div>
              </div>
            )}
            <button
              onClick={confirm}
              disabled={!selected}
              className="mt-5 w-full h-12 rounded-xl bg-amber-400 text-slate-950 font-black uppercase tracking-widest hover:bg-amber-300 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              Take Over Club <ArrowRight size={18} />
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
};
