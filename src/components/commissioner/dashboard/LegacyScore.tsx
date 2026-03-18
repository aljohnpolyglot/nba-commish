import React from 'react';
import { ShieldCheck, Star } from 'lucide-react';

interface LegacyScoreProps {
  legacy: number;
}

export const LegacyScore: React.FC<LegacyScoreProps> = ({ legacy }) => {
  return (
    <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] backdrop-blur-sm flex flex-col">
      <div className="flex flex-col mb-8">
        <h3 className="text-lg font-bold text-white tracking-tight">Legacy Score</h3>
        <p className="text-xs text-slate-500 font-medium">Your long-term impact on the NBA</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center relative">
        <div className="w-48 h-48 rounded-full border-[12px] border-slate-800 flex items-center justify-center relative">
          <div 
            className="absolute inset-0 rounded-full border-[12px] border-rose-500 transition-all duration-1000 ease-out"
            style={{ clipPath: `polygon(50% 50%, -50% -50%, ${legacy > 50 ? '150% -50%' : '50% -50%'}, ${legacy > 75 ? '150% 150%' : legacy > 50 ? '150% 50%' : '50% 50%'}, ${legacy > 25 ? '-50% 150%' : '50% 150%'}, ${legacy > 0 ? '-50% 50%' : '50% 50%'})` }}
          ></div>
          <div className="flex flex-col items-center">
            <span className="text-5xl font-black text-white tracking-tighter">{legacy}</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Points</span>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 w-full">
          <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-800/50">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck size={14} className="text-rose-500" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Integrity</span>
            </div>
            <span className="text-sm font-bold text-slate-200">{legacy > 70 ? 'High' : legacy > 40 ? 'Compromised' : 'Corrupt'}</span>
          </div>
          <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-800/50">
            <div className="flex items-center gap-2 mb-1">
              <Star size={14} className="text-amber-500" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</span>
            </div>
            <span className="text-sm font-bold text-slate-200">{legacy > 80 ? 'Legendary' : legacy > 50 ? 'Stable' : 'Under Fire'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
