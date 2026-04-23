import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Scissors, UserPlus, X } from 'lucide-react';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { getDisplayOverall } from '../../utils/playerRatings';
import { contractToUSD, formatSalaryM } from '../../utils/salaryUtils';
import type { NBAPlayer } from '../../types';

interface RosterComplianceModalProps {
  isOpen: boolean;
  mode?: 'over' | 'under';
  excessPlayers?: NBAPlayer[];
  slotsNeeded?: number;
  minRoster?: number;
  isPreseasonEnd?: boolean;
  onAutoAction: () => void;
  onManual: () => void;
}

export const RosterComplianceModal: React.FC<RosterComplianceModalProps> = ({
  isOpen,
  mode = 'over',
  excessPlayers = [],
  slotsNeeded = 0,
  minRoster = 14,
  isPreseasonEnd = false,
  onAutoAction,
  onManual,
}) => {
  const isUnder = mode === 'under';
  const count = isUnder ? slotsNeeded : excessPlayers.length;
  const title = isUnder
    ? 'Roster Too Small'
    : (isPreseasonEnd ? 'Regular Season Starts Soon' : 'Roster Too Large');

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
            onClick={onManual}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-[#0f0f0f] border border-amber-500/30 rounded-[28px] w-full max-w-lg shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-amber-500/[0.04]">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-black text-white uppercase tracking-tight">{title}</h3>
              </div>
              <button onClick={onManual} className="text-slate-500 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-slate-300 mb-1">
                {isUnder
                  ? <>Roster is short <span className="font-black text-amber-300">{count}</span> {count === 1 ? 'player' : 'players'}.</>
                  : <>You have <span className="font-black text-amber-300">{count}</span> too many standard {count === 1 ? 'player' : 'players'}.</>}
              </p>
              <p className="text-xs text-slate-500 mb-4">
                {isUnder
                  ? `League minimum is ${minRoster} standard players. Sign free agents before simulating.`
                  : isPreseasonEnd
                    ? 'Cut down to 15 standard players before regular season tips off.'
                    : 'Waive players first, then simulate. Standard limit is 15.'}
              </p>

              {!isUnder && excessPlayers.length > 0 && (
                <div className="bg-black/30 border border-white/5 rounded-xl overflow-hidden mb-5">
                  <div className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 bg-white/[0.02] border-b border-white/5">
                    Lowest OVR — Suggested Cuts
                  </div>
                  <div className="flex flex-col divide-y divide-white/5 max-h-64 overflow-y-auto custom-scrollbar">
                    {excessPlayers.map(p => {
                      const ovr = getDisplayOverall(p);
                      const salary = contractToUSD(p.contract?.amount || 0);
                      const isNG = !!(p as any).nonGuaranteed;
                      return (
                        <div key={p.internalId} className="flex items-center gap-3 px-4 py-2">
                          <PlayerPortrait imgUrl={p.imgURL} face={(p as any).face} playerName={p.name} size={32} overallRating={p.overallRating} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-white truncate">{p.name}</div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                              <span>{p.pos}</span>
                              <span className="text-slate-600">·</span>
                              <span className="font-mono">{salary > 0 ? formatSalaryM(salary) : '—'}</span>
                              {isNG && (
                                <span className="text-[8px] font-black text-amber-300 bg-amber-500/15 px-1.5 rounded uppercase tracking-widest">NG</span>
                              )}
                            </div>
                          </div>
                          <span className={`text-sm font-black tabular-nums ${
                            ovr >= 80 ? 'text-emerald-400' : ovr >= 70 ? 'text-amber-300' : 'text-slate-400'
                          }`}>{ovr}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {isUnder && (
                <div className="bg-black/30 border border-amber-500/20 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
                  <UserPlus className="w-5 h-5 text-amber-400 shrink-0" />
                  <div className="text-xs text-slate-300">
                    Let the front office sign {count} min-salary {count === 1 ? 'free agent' : 'free agents'} automatically, or visit the Free Agent market to pick {count === 1 ? 'one' : 'them'} yourself.
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={onAutoAction}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-xl font-black uppercase tracking-widest text-xs transition-colors shadow-lg shadow-amber-500/20"
                >
                  {isUnder ? <UserPlus size={14} /> : <Scissors size={14} />}
                  {isUnder ? `Auto Sign (${count}) FAs` : `Auto Waive Lowest (${count})`}
                </button>
                <button
                  onClick={onManual}
                  className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-colors"
                >
                  Fix Manually
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
