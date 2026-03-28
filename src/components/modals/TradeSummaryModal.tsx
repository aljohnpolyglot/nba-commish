import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowLeftRight, DollarSign, CheckCircle2, AlertCircle } from 'lucide-react';
import { NBAPlayer, DraftPick, NBATeam } from '../../types';
import { useGame } from '../../store/GameContext';

interface TradeSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmTrade: () => void;
  onForceTrade: () => void;
  tradeDetails: {
    teamA: NBATeam;
    teamB: NBATeam;
    teamAPlayers: NBAPlayer[];
    teamBPlayers: NBAPlayer[];
    teamAPicks: DraftPick[];
    teamBPicks: DraftPick[];
    teamASentSalary: number;
    teamBSentSalary: number;
  };
  salaryMismatchInfo: { message: string; team: 'A' | 'B' } | null;
}

const formatContract = (amount: number) => {
  return `$${(amount / 1000).toFixed(1)}M`;
};

export const TradeSummaryModal: React.FC<TradeSummaryModalProps> = ({
  isOpen,
  onClose,
  onConfirmTrade,
  onForceTrade,
  tradeDetails,
  salaryMismatchInfo,
}) => {
  if (!isOpen) return null;

  const { state } = useGame();
  const { teamA, teamB, teamAPlayers, teamBPlayers, teamAPicks, teamBPicks, teamASentSalary, teamBSentSalary } = tradeDetails;

  const getPickDescription = (pick: DraftPick) => {
    const originalTeam = state.teams.find(t => t.id === pick.originalTid);
    return `${pick.season} ${pick.round === 1 ? '1st' : '2nd'} Rd (via ${originalTeam?.abbrev || '?'})`;
  };

  const tradeIsValid = !salaryMismatchInfo;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-4 font-sans"
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          className="bg-[#1e1e1e] border border-slate-700 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="p-4 border-b border-slate-700/50 bg-[#161616] flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">Trade Summary</h3>
            <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-md text-slate-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Trade Status Banner */}
          <div className={`px-4 py-3 border-b ${
            tradeIsValid 
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
              : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
          }`}>
            <div className="flex items-center gap-3">
              {tradeIsValid ? (
                <CheckCircle2 size={18} />
              ) : (
                <AlertCircle size={18} />
              )}
              <div>
                <div className="text-sm font-bold">
                  {tradeIsValid ? 'Trade Valid' : 'Salary Mismatch'}
                </div>
                {salaryMismatchInfo?.message && (
                  <div className="text-xs mt-0.5">
                    {salaryMismatchInfo.message}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Trade Details */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            {/* Team A Outgoing / Team B Incoming */}
            <div className="bg-[#161616] p-4 rounded-md border border-slate-700/50">
              <div className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <ArrowLeftRight size={16} className="text-slate-400" />
                <span>{teamA.abbrev} sends to {teamB.abbrev}</span>
              </div>
              <div className="space-y-1 text-sm">
                {teamAPlayers.length > 0 && (
                  <div>
                    <span className="text-slate-400">Players: </span>
                    <span className="text-white">{teamAPlayers.map(p => p.name).join(', ')}</span>
                  </div>
                )}
                {teamAPicks.length > 0 && (
                  <div>
                    <span className="text-slate-400">Picks: </span>
                    <span className="text-white">{teamAPicks.map(getPickDescription).join(', ')}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 text-slate-400 text-xs">
                  <DollarSign size={12} />
                  <span>Salary: <strong className="text-white">{formatContract(teamASentSalary)}</strong></span>
                </div>
              </div>
            </div>

            {/* Team B Outgoing / Team A Incoming */}
            <div className="bg-[#161616] p-4 rounded-md border border-slate-700/50">
              <div className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <ArrowLeftRight size={16} className="text-slate-400" />
                <span>{teamB.abbrev} sends to {teamA.abbrev}</span>
              </div>
              <div className="space-y-1 text-sm">
                {teamBPlayers.length > 0 && (
                  <div>
                    <span className="text-slate-400">Players: </span>
                    <span className="text-white">{teamBPlayers.map(p => p.name).join(', ')}</span>
                  </div>
                )}
                {teamBPicks.length > 0 && (
                  <div>
                    <span className="text-slate-400">Picks: </span>
                    <span className="text-white">{teamBPicks.map(getPickDescription).join(', ')}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 text-slate-400 text-xs">
                  <DollarSign size={12} />
                  <span>Salary: <strong className="text-white">{formatContract(teamBSentSalary)}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="p-4 border-t border-slate-700/50 bg-[#161616] flex justify-end gap-3">
            <button onClick={onClose} className="px-5 py-2 rounded-md font-bold text-xs uppercase bg-slate-700 hover:bg-slate-600 text-white transition-colors">
              Go Back
            </button>
            {tradeIsValid ? (
              <button onClick={onConfirmTrade} className="px-5 py-2 rounded-md font-bold text-xs uppercase bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
                Confirm Trade
              </button>
            ) : (
              <button onClick={onForceTrade} className="px-5 py-2 rounded-md font-bold text-xs uppercase bg-rose-600 hover:bg-rose-500 text-white transition-colors">
                Force Trade
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
