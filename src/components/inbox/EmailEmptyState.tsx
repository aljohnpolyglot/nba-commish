import React from 'react';
import { Mail } from 'lucide-react';

export const EmailEmptyState: React.FC = () => {
  return (
    <div className="flex-1 flex items-center justify-center flex-col gap-8 opacity-40">
      <div className="w-32 h-32 rounded-full bg-slate-900 flex items-center justify-center border-4 border-slate-800">
        <Mail size={48} className="text-slate-600" />
      </div>
      <div className="text-center">
        <p className="text-2xl font-black text-slate-500 uppercase tracking-tighter">Secure Terminal</p>
        <p className="text-slate-600 font-bold uppercase tracking-widest text-xs mt-2">Awaiting Communication Selection</p>
      </div>
    </div>
  );
};
