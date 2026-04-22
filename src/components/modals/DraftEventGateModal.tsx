import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Star, Trophy, X, Bot, Eye } from 'lucide-react';

interface DraftEventGateModalProps {
  isOpen: boolean;
  eventType: 'lottery' | 'draft';
  canNavigate: boolean;
  onAutoSim: () => void;
  onWatch: () => void;
  onDismiss: () => void;
}

export const DraftEventGateModal: React.FC<DraftEventGateModalProps> = ({
  isOpen,
  eventType,
  canNavigate,
  onAutoSim,
  onWatch,
  onDismiss,
}) => {
  const isLottery = eventType === 'lottery';

  const accent = isLottery ? 'indigo' : 'amber';
  const Icon = isLottery ? Trophy : Star;
  const title = isLottery ? 'Draft Lottery Tonight' : 'NBA Draft Tonight';
  const subtitle = isLottery
    ? 'Your team has a lottery pick. Do you want to watch the lottery draw, or let your front office handle it?'
    : 'The NBA Draft is tonight. Do you want to run your draft room, or let your front office handle all picks automatically?';

  const accentBorder  = isLottery ? 'border-indigo-500/30' : 'border-amber-500/30';
  const accentBg      = isLottery ? 'bg-indigo-500/[0.04]' : 'bg-amber-500/[0.04]';
  const accentIcon    = isLottery ? 'text-indigo-400' : 'text-amber-400';
  const accentBtn     = isLottery
    ? 'bg-indigo-500 hover:bg-indigo-400 shadow-indigo-500/20'
    : 'bg-amber-500 hover:bg-amber-400 shadow-amber-500/20';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
            onClick={onDismiss}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={`relative bg-[#0f0f0f] border ${accentBorder} rounded-[28px] w-full max-w-md shadow-2xl overflow-hidden`}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-6 py-4 border-b border-white/10 ${accentBg}`}>
              <div className="flex items-center gap-3">
                <Icon className={`w-5 h-5 ${accentIcon}`} />
                <h3 className="text-lg font-black text-white uppercase tracking-tight">{title}</h3>
              </div>
              <button onClick={onDismiss} className="text-slate-500 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6">
              <p className="text-sm text-slate-300 mb-6">{subtitle}</p>

              <div className="flex flex-col gap-2">
                {/* Auto sim */}
                <button
                  onClick={onAutoSim}
                  className={`flex items-center justify-center gap-2 px-4 py-3 ${accentBtn} text-black rounded-xl font-black uppercase tracking-widest text-xs transition-colors shadow-lg`}
                >
                  <Bot size={14} />
                  Let Assistant GM Handle It
                </button>

                {/* Watch / navigate */}
                {canNavigate ? (
                  <button
                    onClick={onWatch}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-white/8 hover:bg-white/12 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-colors border border-white/10"
                  >
                    <Eye size={14} />
                    {isLottery ? 'Watch the Lottery Draw' : 'Run My Draft Room'}
                  </button>
                ) : (
                  <button
                    onClick={onDismiss}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-colors"
                  >
                    I'll Handle It
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
