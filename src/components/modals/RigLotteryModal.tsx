import React, { useMemo, useState } from 'react';
import { Dna, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { useGame } from '../../store/GameContext';
import { LOTTERY_PRESETS, DEFAULT_DRAFT_TYPE, computeTopKOdds } from '../../lib/lotteryPresets';

interface RigLotteryModalProps {
  onClose: () => void;
  onConfirm: (riggedTid: number) => void;
}

export const RigLotteryModal: React.FC<RigLotteryModalProps> = ({ onClose, onConfirm }) => {
  const { state } = useGame();
  const [selectedTid, setSelectedTid] = useState<number | null>(null);

  const activePreset = LOTTERY_PRESETS[state.leagueStats?.draftType ?? DEFAULT_DRAFT_TYPE] ?? LOTTERY_PRESETS[DEFAULT_DRAFT_TYPE];

  const teams = useMemo(() => {
    const poolSize = Math.min(14, activePreset.chances.length);
    return [...state.teams]
      .filter(t => t.id > 0)
      .sort((a, b) => {
        const wa = a.wins / Math.max(1, a.wins + a.losses);
        const wb = b.wins / Math.max(1, b.wins + b.losses);
        return wa - wb;
      })
      .slice(0, poolSize)
      .map((t, i) => {
        const chance = activePreset.chances[i] ?? 0;
        const odds1st = parseFloat(((chance / activePreset.total) * 100).toFixed(1));
        const oddsTopN = parseFloat((computeTopKOdds(activePreset.chances, i, activePreset.numToPick) * 100).toFixed(1));
        return {
          tid: t.id,
          seed: i + 1,
          name: t.name,
          city: (t as any).region ?? t.name,
          logoUrl: (t as any).logoUrl ?? '',
          abbrev: (t as any).abbrev ?? '',
          record: `${t.wins}-${t.losses}`,
          odds1st,
          oddsTopN,
        };
      });
  }, [state.teams, activePreset]);

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="bg-slate-900 border border-slate-800 rounded-[2rem] max-w-lg w-full shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-8 pb-4">
          <div className="flex items-center gap-4 mb-1">
            <div className="w-12 h-12 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400">
              <Dna size={22} />
            </div>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-widest">Fix the Lottery</h3>
              <p className="text-slate-400 text-xs">{activePreset.label} · Select who gets pick #1</p>
            </div>
          </div>
        </div>

        {/* Team list */}
        <div className="overflow-y-auto custom-scrollbar px-4 pb-4 flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                <th className="text-left px-3 pb-2">#</th>
                <th className="text-left px-3 pb-2">Team</th>
                <th className="px-3 pb-2">Record</th>
                <th className="px-3 pb-2">1st%</th>
                <th className="px-3 pb-2">Top {activePreset.numToPick}%</th>
                <th className="px-3 pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {teams.map(t => {
                const isSelected = selectedTid === t.tid;
                return (
                  <tr
                    key={t.tid}
                    onClick={() => setSelectedTid(t.tid)}
                    className={`cursor-pointer rounded-xl transition-all ${
                      isSelected ? 'bg-violet-600/20' : 'hover:bg-slate-800/60'
                    }`}
                  >
                    <td className="px-3 py-2 text-[10px] font-black text-slate-500 w-6">{t.seed}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {t.logoUrl ? (
                          <img src={t.logoUrl} alt="" className="w-6 h-6 object-contain" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[8px] font-black text-slate-400">
                            {t.abbrev.slice(0, 3)}
                          </div>
                        )}
                        <span className={`font-bold ${isSelected ? 'text-violet-300' : 'text-white'}`}>{t.city}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-slate-400 text-xs">{t.record}</td>
                    <td className="px-3 py-2 text-center font-mono text-slate-400 text-xs">{t.odds1st}%</td>
                    <td className="px-3 py-2 text-center font-mono text-slate-400 text-xs">{t.oddsTopN}%</td>
                    <td className="px-3 py-2 text-center">
                      <div className={`w-4 h-4 rounded-full border-2 mx-auto transition-all ${
                        isSelected
                          ? 'border-violet-500 bg-violet-500'
                          : 'border-slate-600'
                      }`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 border-t border-slate-800 space-y-3">
          <div className="flex items-start gap-2 text-[10px] text-amber-400/70 font-medium">
            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
            <span>Result is permanent — the watch view will show it as final. No animation replay possible.</span>
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-6 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 font-bold uppercase tracking-wider text-xs"
            >
              Cancel
            </button>
            <button
              disabled={selectedTid === null}
              onClick={() => selectedTid !== null && onConfirm(selectedTid)}
              className="px-6 py-3 rounded-xl bg-violet-600 text-white hover:bg-violet-500 font-bold uppercase tracking-wider text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Rig Lottery
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
