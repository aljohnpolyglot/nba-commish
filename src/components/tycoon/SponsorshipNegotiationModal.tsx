import React, { useMemo, useState, useEffect } from 'react';
import { X, Check, XCircle } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import {
  getMarketOffer,
  applyRenewal,
  applyDecline,
  SponsorshipOffer,
  SuccessHistory,
} from '../../services/tycoon/sponsorshipEngine';
import type { SponsorshipSlot } from '../../types/tycoon';
import { formatCurrencyWithCode } from '../../utils/helpers';

interface Props {
  open: boolean;
  onClose: () => void;
  initialSlot?: SponsorshipSlot;
}

const SLOTS: SponsorshipSlot[] = ['kit', 'sleeve', 'stadium'];

export const SponsorshipNegotiationModal: React.FC<Props> = ({ open, onClose, initialSlot }) => {
  const { state, applyTycoonMutation } = useGame() as any;
  const [activeSlot, setActiveSlot] = useState<SponsorshipSlot>(initialSlot ?? 'kit');

  useEffect(() => {
    if (initialSlot) setActiveSlot(initialSlot);
  }, [initialSlot, open]);

  const userTeamId = state.userTeamId;
  const team = state.teams.find((t: any) => (t.id ?? t.tid) === userTeamId);
  const currency = state.leagueStats?.currency ?? 'EUR';
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  const tycoon = team?.tycoon;

  const history: SuccessHistory = useMemo(() => ({
    recentEndesaPositions: (team?.recentEndesaPositions ?? []).slice(-3),
    recentEuroleagueStages: (team?.recentEuroleagueStages ?? []).slice(-3),
  }), [team]);

  // Re-roll the offer when activeSlot or tycoon changes (so user sees a stable offer per slot per session)
  const [offerCache, setOfferCache] = useState<Record<SponsorshipSlot, SponsorshipOffer | null>>({ kit: null, sleeve: null, stadium: null });

  useEffect(() => {
    if (!open || !tycoon) return;
    if (offerCache[activeSlot]) return;
    setOfferCache(prev => ({ ...prev, [activeSlot]: getMarketOffer(tycoon, activeSlot, history) }));
  }, [activeSlot, open, tycoon, history, offerCache]);

  if (!open || !team || !tycoon) return null;
  const offer = offerCache[activeSlot];
  if (!offer) return null;

  const current = tycoon.sponsorships[activeSlot];

  const handleAccept = () => {
    applyTycoonMutation(userTeamId, (t: any) => applyRenewal(t.tycoon, activeSlot, offer, state.leagueStats.year));
    setOfferCache(prev => ({ ...prev, [activeSlot]: null }));
    onClose();
  };

  const handleDecline = () => {
    applyTycoonMutation(userTeamId, (t: any) => applyDecline(t.tycoon, activeSlot));
    setOfferCache(prev => ({ ...prev, [activeSlot]: null }));
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-black uppercase tracking-wider text-white">Sponsorship Negotiation</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-white" /></button>
        </div>
        <div className="flex gap-2 mb-6">
          {SLOTS.map((slot) => (
            <button
              key={slot}
              onClick={() => setActiveSlot(slot)}
              className={`flex-1 py-2 rounded-xl uppercase text-xs font-black tracking-widest ${
                activeSlot === slot ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {slot}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl border border-slate-700 p-4">
            <p className="text-[10px] uppercase font-black text-slate-500 tracking-widest mb-2">Current</p>
            {current ? (
              <>
                <p className="text-lg font-bold text-white">{current.sponsor}</p>
                <p className="text-sm text-slate-400">{fmt(current.valuePerYear)}/yr</p>
                <p className="text-xs text-slate-500 mt-1">{current.yearsRemaining}y remaining</p>
              </>
            ) : (
              <p className="text-amber-300 font-bold">No active deal</p>
            )}
          </div>
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
            <p className="text-[10px] uppercase font-black text-amber-400 tracking-widest mb-2">Market Offer</p>
            <p className="text-lg font-bold text-white">{offer.sponsor}</p>
            <p className="text-sm text-amber-300">{fmt(offer.valuePerYear)}/yr</p>
            <p className="text-xs text-slate-400 mt-1">{offer.years} year deal</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={handleAccept} className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase tracking-widest py-3 rounded-xl flex items-center justify-center gap-2">
            <Check size={16} /> Accept
          </button>
          <button onClick={handleDecline} className="flex-1 bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 font-black uppercase tracking-widest py-3 rounded-xl flex items-center justify-center gap-2">
            <XCircle size={16} /> Decline → Default
          </button>
        </div>
      </div>
    </div>
  );
};
