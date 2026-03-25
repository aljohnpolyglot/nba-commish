import React from 'react';
import { Ticket } from 'lucide-react';

export const DraftLotteryView: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="p-4 bg-indigo-500/10 rounded-2xl mb-6">
        <Ticket className="w-12 h-12 text-indigo-400" />
      </div>
      <h2 className="text-3xl font-black text-white uppercase tracking-tight mb-2">Draft Lottery</h2>
      <p className="text-slate-500 font-medium max-w-sm">
        Coming soon. The lottery machine is being calibrated. Check back for a future update.
      </p>
    </div>
  );
};
