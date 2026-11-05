import React, { useState } from 'react';
import { AlertCircle, ArrowRight, Building2, MapPin, Users, X } from 'lucide-react';
import type { FranchiseArenaState } from '../../types';

type Props = {
  currentArena: FranchiseArenaState;
  proposal: NonNullable<FranchiseArenaState['pendingNewArena']>;
  onClose: () => void;
  onAccept: (facilityName: string) => void;
};

export const NewArenaReviewModal: React.FC<Props> = ({
  currentArena,
  proposal,
  onClose,
  onAccept,
}) => {
  const [facilityName, setFacilityName] = useState(proposal.proposedName);
  const finalName = facilityName.trim() || proposal.proposedName;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-3 backdrop-blur-md">
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-[#070d18] shadow-2xl">
        <div className="relative min-h-44 shrink-0 overflow-hidden bg-gradient-to-br from-purple-950 via-slate-900 to-slate-950">
          {currentArena.imageUrl && <img src={currentArena.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />}
          <div className="absolute inset-0 bg-gradient-to-t from-[#070d18] via-[#070d18]/40 to-transparent" />
          <button onClick={onClose} className="absolute right-4 top-4 rounded-xl border border-white/10 bg-black/40 p-2 text-slate-300" aria-label="Close arena review"><X size={19} /></button>
          <div className="absolute bottom-5 left-5 right-5 flex items-center gap-3">
            <div className="rounded-2xl border border-purple-300/30 bg-purple-400/15 p-3 text-purple-200"><Building2 size={28} /></div>
            <div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-purple-300">Ownership Announcement</p><h2 className="mt-1 text-2xl font-black text-white">New Arena Secured</h2></div>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
          <p className="text-sm leading-6 text-slate-300">Ownership has finalized the club’s new home. Confirm the permanent facility name before the previous arena moves into franchise history.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><div className="flex items-center gap-2 text-purple-300"><Users size={15} /><p className="text-[9px] font-black uppercase tracking-widest">Capacity</p></div><p className="mt-2 text-xl font-black text-white">{proposal.capacity.toLocaleString()}</p></div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><div className="flex items-center gap-2 text-purple-300"><MapPin size={15} /><p className="text-[9px] font-black uppercase tracking-widest">Location</p></div><p className="mt-2 text-sm font-black text-white">{proposal.location}</p></div>
          </div>
          <label className="block rounded-2xl border border-slate-800 bg-[#081120] p-4">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Permanent Facility Name</span>
            <input value={facilityName} onChange={event => setFacilityName(event.target.value)} className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base font-black text-white outline-none focus:border-purple-400/60" />
            <span className="mt-2 block text-xs text-slate-500">A naming-rights agreement can replace this public facility name after the move is approved.</span>
          </label>
          <div className="flex gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100"><AlertCircle size={17} className="mt-0.5 shrink-0 text-amber-300" /><span>The arena opens without a renewed title partner. Arena naming-rights offers become the next franchise partnership decision.</span></div>
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-800 bg-[#060c16] p-4 sm:flex-row sm:justify-end">
          <button onClick={onClose} className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-xs font-black text-slate-300">Later</button>
          <button onClick={() => onAccept(finalName)} className="flex items-center justify-center gap-2 rounded-xl bg-purple-300 px-5 py-3 text-xs font-black text-slate-950">Approve Move <ArrowRight size={15} /></button>
        </footer>
      </div>
    </div>
  );
};
