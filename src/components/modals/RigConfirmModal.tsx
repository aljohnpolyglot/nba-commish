import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Zap, X } from 'lucide-react';

interface RigConfirmModalProps {
  isOpen: boolean;
  favoredTeamName: string;
  refName: string;
  refNumber: string;
  refPhoto?: string;
  onClose: () => void;
  onWatchLive: () => void;
  onJustSimulate: () => void;
}

export const RigConfirmModal: React.FC<RigConfirmModalProps> = ({
  isOpen,
  favoredTeamName,
  refName,
  refNumber,
  refPhoto,
  onClose,
  onWatchLive,
  onJustSimulate,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.92, y: 24 }}
            animate={{ scale: 1,    y: 0  }}
            exit={{ scale: 0.92, y: 24 }}
            className="bg-[#0d0d0d] border border-white/10 rounded-[28px] w-full max-w-md shadow-2xl overflow-hidden"
          >
            {/* Red header bar */}
            <div className="h-1.5 w-full bg-gradient-to-r from-rose-600 via-amber-500 to-rose-600" />

            <div className="p-8 space-y-6">
              {/* Referee confirmation */}
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-800 border border-amber-500/30 flex-shrink-0">
                  {refPhoto ? (
                    <img
                      src={refPhoto}
                      alt={refName}
                      className="w-full h-full object-cover object-top"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 font-black text-xl">
                      {refName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Assigned Referee</p>
                  <p className="text-base font-black text-white mt-0.5">{refName}</p>
                  <p className="text-[10px] text-slate-500 font-bold">Official #{refNumber}</p>
                </div>
              </div>

              {/* Summary */}
              <div className="text-center space-y-1">
                <p className="text-white font-black text-lg leading-tight">
                  Rigging active for
                </p>
                <p className="text-amber-400 font-black text-xl uppercase tracking-tight">
                  {favoredTeamName}
                </p>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-2">
              
                </p>
              </div>

              {/* Choices */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={onJustSimulate}
                  className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-white/5 hover:border-white/10 transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-700 group-hover:bg-slate-600 flex items-center justify-center transition-colors">
                    <Zap size={20} className="text-slate-300" />
                  </div>
                  <p className="text-xs font-black text-white uppercase tracking-widest">Just Simulate</p>
                  <p className="text-[9px] text-slate-500 font-bold text-center leading-tight">
                    Fast-forward, see the result
                  </p>
                </button>

                <button
                  onClick={onWatchLive}
                  className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 transition-all group shadow-xl shadow-indigo-500/20"
                >
                  <div className="w-10 h-10 rounded-xl bg-indigo-500 group-hover:bg-indigo-400 flex items-center justify-center transition-colors">
                    <Play size={20} className="text-white" />
                  </div>
                  <p className="text-xs font-black text-white uppercase tracking-widest">Watch Live</p>
                  <p className="text-[9px] text-indigo-200 font-bold text-center leading-tight">
                    Experience it in real time
                  </p>
                </button>
              </div>

              <button
                onClick={onClose}
                className="w-full py-2 text-[10px] font-bold text-slate-600 hover:text-slate-400 uppercase tracking-widest transition-colors"
              >
                Cancel Rig
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
