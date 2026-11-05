import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Gavel } from 'lucide-react';
import type { AspireInvestigationInboxAction } from '../../types';

export function AspireInvestigationInboxPanel({
  action,
  commissioner,
  onResolve,
}: {
  action: AspireInvestigationInboxAction;
  commissioner: boolean;
  onResolve?: (pickCount: number) => void;
}) {
  const [pickCount, setPickCount] = useState(action.recommendedPickCount);
  useEffect(() => setPickCount(action.recommendedPickCount), [action.caseId, action.recommendedPickCount]);
  const resolved = action.status === 'resolved';
  return (
    <div className="border border-rose-500/30 bg-rose-500/[0.05] p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <Gavel className="mt-1 shrink-0 text-rose-300" size={22} />
        <div>
          <h3 className="text-lg font-black text-white">Contract Circumvention Case</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">{action.teamName} used an undisclosed {action.sponsor} agreement worth ${action.amountUSD.toLocaleString()} in the signing of {action.playerName}.</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-center">
        <div className="bg-slate-950/70 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Risk</p><p className="mt-1 text-xl font-black text-rose-300">{action.risk}%</p></div>
        <div className="bg-slate-950/70 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">First-round picks</p><p className="mt-1 text-xl font-black text-white">{resolved ? action.resolution?.pickCount ?? 0 : pickCount}</p></div>
      </div>
      {!resolved && commissioner && (
        <div className="mt-5">
          <div className="flex items-center justify-between border border-slate-700 bg-slate-950 px-3 py-2">
            <button aria-label="Forfeit fewer picks" onClick={() => setPickCount(value => Math.max(0, value - 1))} className="p-2 text-slate-400 hover:text-white"><ChevronLeft size={18} /></button>
            <span className="text-sm font-black text-white">Forfeit {pickCount} pick{pickCount === 1 ? '' : 's'}</span>
            <button aria-label="Forfeit more picks" onClick={() => setPickCount(value => Math.min(5, value + 1))} className="p-2 text-slate-400 hover:text-white"><ChevronRight size={18} /></button>
          </div>
          <button onClick={() => onResolve?.(pickCount)} className="mt-3 w-full bg-rose-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-rose-500">Issue Pick Forfeiture</button>
        </div>
      )}
      {resolved && <p className="mt-4 text-xs font-bold text-slate-400">Case closed. {action.resolution?.pickCount ?? 0} future first-round pick{action.resolution?.pickCount === 1 ? '' : 's'} forfeited.</p>}
    </div>
  );
}
