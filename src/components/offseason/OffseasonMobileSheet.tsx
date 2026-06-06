import React, { useState } from 'react';
import { ListChecks, X } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { OffseasonAufgabenSidebar } from './OffseasonSidebar';

export const OffseasonAufgabenMobileSheet: React.FC = () => {
  const { state } = useGame();
  const [open, setOpen] = useState(false);
  if (!state.offseasonChecklist) return null;

  const checklist = state.offseasonChecklist;
  const remaining = (Object.values(checklist) as string[]).filter(s => s === 'pending' || s === 'in-progress').length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed bottom-4 right-4 z-[160] flex items-center gap-2 px-4 py-3 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-widest shadow-2xl transition-colors"
      >
        <ListChecks size={14} />
        Offseason · {remaining} left
      </button>
      {open && (
        <div className="lg:hidden fixed inset-0 z-[165] flex">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative ml-auto h-full w-[320px] max-w-[88vw] bg-slate-950 border-l border-slate-800 overflow-y-auto scrollbar-hide p-3">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              <X size={14} />
            </button>
            <OffseasonAufgabenSidebar />
          </div>
        </div>
      )}
    </>
  );
};
