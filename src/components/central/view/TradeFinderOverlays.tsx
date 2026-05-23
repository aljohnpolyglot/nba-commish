import React from 'react';
import { motion } from 'motion/react';
import type { NBATeam } from '../../../types';
import type { TradeItem } from './TradeFinderTypes';

export const TradeFinderOwnerWarningModal: React.FC<{
  open: boolean;
  selectedTeam?: NBATeam;
  ownerWarningLifer: string | null;
  ownerWarningMode: 'reverse' | 'own';
  onClose: () => void;
  onIgnore: () => void;
}> = ({ open, selectedTeam, ownerWarningLifer, ownerWarningMode, onClose, onIgnore }) =>
  open && selectedTeam ? (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="relative w-full max-w-md bg-[#0a0a0a] border border-amber-500/30 shadow-2xl rounded flex flex-col items-center text-center overflow-hidden">
        <div className="w-full h-48 bg-[#050505] relative flex items-end justify-center pt-8 border-b border-white/5">
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-20 pointer-events-none" />
          {selectedTeam.logoUrl ? <img src={selectedTeam.logoUrl} className="h-32 object-contain z-10" alt={selectedTeam.name} referrerPolicy="no-referrer" /> : <div className="h-24 w-24 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-sm font-black text-amber-300 z-10">{selectedTeam.abbrev}</div>}
        </div>
        <div className="p-8 w-full flex flex-col items-center relative z-20">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-300 mb-2">Owner's Message</p>
          <h2 className="text-2xl font-black italic uppercase tracking-wider mb-4 text-amber-400">Do not touch {ownerWarningLifer}</h2>
          <p className="text-white/80 italic mb-2 leading-relaxed text-sm">{ownerWarningMode === 'own' ? `"${ownerWarningLifer} built this franchise. He retires here, period. Don't even bring me an offer or I will fire you."` : `"${ownerWarningLifer} built this franchise. He retires here, period. Don't even bring me an offer."`}</p>
          <p className="text-white/50 text-xs mb-8">— {selectedTeam.region} {selectedTeam.name} Ownership</p>
          <div className="flex flex-col gap-2 w-full">
            <button onClick={onClose} className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs transition-colors rounded-sm">Acknowledge — Respect the Legacy</button>
            <button onClick={onIgnore} className="w-full py-3 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-amber-300 font-black uppercase tracking-widest text-[10px] transition-colors rounded-sm">{ownerWarningMode === 'own' ? 'Ignore — Risk Getting Fired' : 'Ignore Message — Shop Anyway'}</button>
          </div>
        </div>
      </motion.div>
    </div>
  ) : null;

export const TradeFinderRejectionModal: React.FC<{
  open: boolean;
  selectedTeam?: NBATeam;
  basket: TradeItem[];
  onClose: () => void;
}> = ({ open, selectedTeam, basket, onClose }) =>
  open && selectedTeam ? (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="relative w-full max-w-md bg-[#0a0a0a] border border-rose-500/30 shadow-2xl rounded flex flex-col items-center text-center overflow-hidden">
        <div className="w-full h-48 bg-[#050505] relative flex items-end justify-center pt-8 border-b border-white/5">
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-20 pointer-events-none" />
          {selectedTeam.logoUrl ? <img src={selectedTeam.logoUrl} className="h-32 object-contain z-10" alt={selectedTeam.name} referrerPolicy="no-referrer" /> : <div className="h-24 w-24 rounded-full bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-sm font-black text-rose-300 z-10">{selectedTeam.abbrev}</div>}
        </div>
        <div className="p-8 w-full flex flex-col items-center relative z-20">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-rose-300 mb-2">{selectedTeam.region} {selectedTeam.name} Front Office</p>
          <h2 className="text-2xl font-black italic uppercase tracking-wider mb-4 text-rose-400">No Deal</h2>
          <p className="text-white/80 italic mb-2 leading-relaxed text-sm">{(() => { const names = basket.filter(i => i.type === 'player').map(i => i.label).slice(0, 2).join(' and '); return names ? `We're not moving ${names} for anything your roster can put together right now.` : `We're not moving our assets for what your team can offer.`; })()}</p>
          <p className="text-white/60 text-xs mb-8">Rework your basket, add future picks, or come back later when the market shifts.</p>
          <button onClick={onClose} className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs transition-colors rounded-sm">Acknowledge</button>
        </div>
      </motion.div>
    </div>
  ) : null;
