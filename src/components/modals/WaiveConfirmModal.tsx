import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';
import { NBAPlayer, NBATeam, GameState } from '../../types';
import { buildStretchedSchedule, seasonLabelToYear } from '../../utils/salaryUtils';

interface Props {
  player: NBAPlayer;
  team: NBATeam | undefined;
  state: GameState;
  onClose: () => void;
  onConfirm: (opts: { stretch: boolean }) => void;
}

const fmtM = (usd: number) => `$${(usd / 1_000_000).toFixed(1)}M`;

export const WaiveConfirmModal: React.FC<Props> = ({ player, team, state, onClose, onConfirm }) => {
  const [stretch, setStretch] = useState(false);

  const ls = state.leagueStats as any;
  const deadMoneyEnabled = ls.deadMoneyEnabled ?? true;
  const stretchEnabled = ls.stretchProvisionEnabled ?? true;
  const stretchMult = ls.stretchProvisionMultiplier ?? 2;
  const ngDeadlineMonth = ls.ngGuaranteeDeadlineMonth ?? 1;
  const ngDeadlineDay = ls.ngGuaranteeDeadlineDay ?? 10;
  const seasonYear: number = ls.year ?? new Date().getUTCFullYear();
  const today = state.date ? new Date(state.date) : new Date();
  const ngDeadline = new Date(seasonYear, ngDeadlineMonth - 1, ngDeadlineDay);

  const wasNG = !!(player as any).nonGuaranteed;
  const wasTwoWay = !!(player as any).twoWay;
  const ngFreeRelease = wasNG && today < ngDeadline;

  const remaining = useMemo(() => {
    if (!deadMoneyEnabled || wasTwoWay || ngFreeRelease) return [];
    const cy: Array<{ season: string; guaranteed: number; option?: string }> =
      Array.isArray((player as any).contractYears) ? (player as any).contractYears : [];
    const future = cy
      .filter(y => seasonLabelToYear(y.season) >= seasonYear && y.option !== 'team' && y.option !== 'player')
      .map(y => ({ season: y.season, amountUSD: y.guaranteed }));
    if (future.length === 0 && (player as any).contract?.amount) {
      const exp = (player as any).contract.exp ?? seasonYear;
      const amt = ((player as any).contract.amount || 0) * 1_000;
      const out: Array<{ season: string; amountUSD: number }> = [];
      for (let yr = seasonYear; yr <= exp; yr++) {
        out.push({ season: `${yr - 1}-${String(yr).slice(-2)}`, amountUSD: amt });
      }
      return out;
    }
    return future;
  }, [player, seasonYear, deadMoneyEnabled, wasTwoWay, ngFreeRelease]);

  const previewSchedule = useMemo(() => {
    if (!stretch || !stretchEnabled) return remaining;
    return buildStretchedSchedule(remaining, stretchMult);
  }, [remaining, stretch, stretchEnabled, stretchMult]);

  const totalDead = remaining.reduce((s, y) => s + y.amountUSD, 0);
  const thisSeasonHit = previewSchedule.find(y => seasonLabelToYear(y.season) === seasonYear)?.amountUSD ?? 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-lg bg-[#0a0a0a] border border-rose-500/30 rounded-sm shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-rose-900/40 to-transparent border-b border-white/5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <h3 className="text-sm font-black uppercase tracking-widest text-white">Waive {player.name}?</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={16} /></button>
        </div>

        <div className="p-6 space-y-5">
          <div className="text-xs text-slate-400">
            {team?.name ?? 'Team'} · {player.pos} · {wasNG ? 'NON-GUARANTEED' : wasTwoWay ? 'TWO-WAY' : 'GUARANTEED'}
            {' '}· exp {(player as any).contract?.exp ?? '?'}
          </div>

          {ngFreeRelease && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-sm p-4">
              <p className="text-emerald-300 text-sm font-bold">Free Release</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Contract is non-guaranteed and we're before the {ngDeadlineMonth}/{ngDeadlineDay} guarantee deadline. No dead money.
              </p>
            </div>
          )}

          {wasTwoWay && (
            <div className="bg-violet-500/10 border border-violet-500/30 rounded-sm p-4">
              <p className="text-violet-300 text-sm font-bold">Two-Way Release</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Two-way contracts pay only for days on roster. No dead money.
              </p>
            </div>
          )}

          {!ngFreeRelease && !wasTwoWay && remaining.length > 0 && (
            <>
              <div className="bg-rose-500/5 border border-rose-500/20 rounded-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-rose-300">
                    Dead Money Schedule
                  </p>
                  <p className="text-xs font-bold text-rose-200">{fmtM(totalDead)} total</p>
                </div>
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {previewSchedule.map(y => (
                    <div key={y.season} className="flex justify-between text-xs">
                      <span className="text-slate-400">{y.season}</span>
                      <span className="font-mono font-bold text-rose-200">{fmtM(y.amountUSD)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {stretchEnabled && remaining.length > 0 && (
                <label className="flex items-start gap-3 cursor-pointer p-3 bg-amber-500/5 border border-amber-500/20 rounded-sm hover:bg-amber-500/10">
                  <input
                    type="checkbox"
                    checked={stretch}
                    onChange={e => setStretch(e.target.checked)}
                    className="mt-0.5 accent-amber-400"
                  />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-amber-300">
                      Stretch over {remaining.length * stretchMult + 1} seasons
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Lowers annual cap hit (~{fmtM(totalDead / (remaining.length * stretchMult + 1))}/yr) but extends obligation.
                    </p>
                  </div>
                </label>
              )}

              <div className="text-[11px] text-slate-500 italic">
                Cap hit this season: <span className="text-rose-300 font-bold">{fmtM(thisSeasonHit)}</span>
                {' '}· counts against payroll, MLE, apron.
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t border-white/5 bg-black/40">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-[11px] font-black uppercase tracking-widest rounded-sm">
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ stretch: stretch && stretchEnabled })}
            className="flex-1 py-2.5 bg-rose-600/30 border border-rose-500/50 hover:bg-rose-600/50 text-rose-200 text-[11px] font-black uppercase tracking-widest rounded-sm">
            {ngFreeRelease || wasTwoWay ? 'Release' : `Waive — ${fmtM(thisSeasonHit)} dead`}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
