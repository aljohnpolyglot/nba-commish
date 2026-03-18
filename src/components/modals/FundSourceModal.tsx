import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Landmark } from 'lucide-react';

interface FundSourceModalProps {
  onClose: () => void;
  onSelect: (source: 'personal' | 'league') => void;
}

export const FundSourceModal: React.FC<FundSourceModalProps> = ({ onClose, onSelect }) => {
  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
      >
        <motion.div 
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        >
          <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <h3 className="text-xl font-black uppercase tracking-tight text-white">Select Fund Source</h3>
            <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <button 
              onClick={() => onSelect('personal')}
              className="w-full flex items-center gap-4 p-4 bg-slate-950 border border-slate-800 rounded-xl hover:border-emerald-500/50 transition-all group"
            >
              <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-500">
                <User size={24} />
              </div>
              <div className="text-left">
                <div className="font-bold text-white">Personal Wealth</div>
                <div className="text-xs text-slate-500">Use your own savings</div>
              </div>
            </button>
            <button 
              onClick={() => onSelect('league')}
              className="w-full flex items-center gap-4 p-4 bg-slate-950 border border-slate-800 rounded-xl hover:border-indigo-500/50 transition-all group"
            >
              <div className="p-3 bg-indigo-500/10 rounded-lg text-indigo-500">
                <Landmark size={24} />
              </div>
              <div className="text-left">
                <div className="font-bold text-white">League Funds</div>
                <div className="text-xs text-slate-500">Use official league treasury</div>
              </div>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
