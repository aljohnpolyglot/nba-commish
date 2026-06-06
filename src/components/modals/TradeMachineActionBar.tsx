import React from 'react';

export const TradeMachineActionBar: React.FC<{
  onConfirm: () => void;
  onClose: () => void;
  disabled: boolean;
  sameTeam: boolean;
}> = ({ onConfirm, onClose, disabled, sameTeam }) => (
  <div className="fixed inset-x-0 bottom-0 z-[230] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:inset-x-auto lg:left-1/2 lg:-translate-x-1/2 lg:bottom-6 lg:px-0 lg:pb-0">
    <div className="mx-auto flex gap-2 sm:gap-4 bg-[#161616] p-2 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-sm lg:max-w-none lg:w-auto">
      <button onClick={onConfirm} disabled={disabled} className="flex-1 lg:flex-none px-4 sm:px-8 py-2.5 sm:py-3 rounded-xl font-black text-xs uppercase bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-600/20">
        {sameTeam ? 'Same Team — Invalid' : 'Validate Deal'}
      </button>
      <button onClick={onClose} className="flex-1 lg:flex-none px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-black text-xs uppercase bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all">
        Close
      </button>
    </div>
  </div>
);
