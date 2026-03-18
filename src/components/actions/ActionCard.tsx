import React from 'react';
import { motion } from 'motion/react';

interface ActionCardProps {
  title: string;
  description: string;
  cost: string;
  benefit: string;
  icon: any;
  color: string;
  onClick: () => void;
  disabled?: boolean;
}

export const ActionCard: React.FC<ActionCardProps> = ({ title, description, cost, benefit, icon: Icon, color, onClick, disabled }) => (
  <motion.button
    whileHover={!disabled ? { scale: 1.02, y: -2 } : {}}
    whileTap={!disabled ? { scale: 0.98 } : {}}
    onClick={onClick}
    disabled={disabled}
    className={`relative p-6 rounded-[2rem] border text-left transition-all duration-300 flex flex-col h-full ${
      disabled 
        ? 'bg-slate-900/20 border-slate-800/50 opacity-50 cursor-not-allowed grayscale' 
        : `bg-slate-900/40 border-slate-800 hover:bg-slate-800/60 hover:border-${color}-500/30 hover:border-opacity-50 hover:shadow-xl hover:shadow-${color}-500/10`
    }`}
  >
    <div className={`absolute top-0 right-0 w-32 h-32 bg-${color}-500/5 blur-[60px] rounded-full -mr-10 -mt-10 pointer-events-none`}></div>
    
    <div className="flex items-start justify-between mb-4 relative z-10">
      <div className={`p-3 rounded-2xl bg-${color}-500/10 text-${color}-400 border border-${color}-500/20`}>
        <Icon size={24} />
      </div>
      {disabled && (
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">
          Completed
        </span>
      )}
    </div>

    <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2 relative z-10">{title}</h3>
    <p className="text-sm text-slate-400 font-medium leading-relaxed mb-6 relative z-10 flex-1">{description}</p>

    <div className="space-y-2 mt-auto relative z-10">
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
        <span className="text-slate-500">Cost</span>
        <span className="text-rose-400">{cost}</span>
      </div>
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
        <span className="text-slate-500">Benefit</span>
        <span className="text-emerald-400">{benefit}</span>
      </div>
    </div>
  </motion.button>
);
