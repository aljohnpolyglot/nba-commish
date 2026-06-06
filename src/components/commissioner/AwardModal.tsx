import React, { useState } from 'react';
import { Plus, X, Trophy, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AwardModalProps {
  onClose: () => void;
  onAdd: (name: string, criteria: string) => void;
  isGenerating: boolean;
}

export const AwardModal: React.FC<AwardModalProps> = ({ onClose, onAdd, isGenerating }) => {
  const [name, setName] = useState('');
  const [criteria, setCriteria] = useState('');

  const handleSubmit = () => {
    if (criteria.trim()) {
      onAdd(name, criteria);
    }
  };

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
          className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-900/50 p-4 sm:p-6">
            <div className="flex items-center gap-3 text-amber-500">
                <Trophy size={24} />
                <h3 className="text-xl font-black uppercase tracking-tight">Create New Honor</h3>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>
          
          <div className="space-y-6 overflow-y-auto p-4 sm:p-6">
            <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Award Name (Optional)</label>
                <input 
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., MVP, Defensive Player of the Year..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-slate-200 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none placeholder:text-slate-700 transition-all"
                />
                <p className="text-[10px] text-slate-600 italic ml-1">If left blank, the AI will generate a fitting name (e.g., "The Michael Jordan Trophy")</p>
            </div>

            <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Award Criteria (Required)</label>
                <textarea 
                    value={criteria}
                    onChange={(e) => setCriteria(e.target.value)}
                    placeholder="e.g., Best player in the clutch, Most dominant defensive force..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-slate-200 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none placeholder:text-slate-700 transition-all h-32 resize-none"
                />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-800 bg-slate-900/50 p-4 sm:flex-row sm:justify-end sm:p-6">
              <button 
                  onClick={onClose}
                  className="w-full rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 transition-colors hover:bg-slate-800 hover:text-white sm:w-auto"
              >
                  Cancel
              </button>
              <button 
                  onClick={handleSubmit}
                  disabled={isGenerating || !criteria.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-6 py-2 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-amber-600/20 transition-all hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                  {isGenerating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Generating...
                      </>
                  ) : (
                      <>
                        <Plus size={16} />
                        Add Award
                      </>
                  )}
              </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
