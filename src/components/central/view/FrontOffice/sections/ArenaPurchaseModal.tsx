import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import {
  getArenaProjectCost,
  type ArenaCapacityProject,
  type ArenaFeatureSpec,
} from '../../../../../services/tycoon/facilityUpgradeEngine';

interface ArenaPurchaseModalProps {
  project: { kind: 'feature'; spec: ArenaFeatureSpec } | { kind: 'capacity'; spec: ArenaCapacityProject };
  owned: boolean;
  economyIndex: number;
  availableCash: number;
  currentCapacity: number;
  currentRating: number;
  completedRating: number;
  fmt: (value: number) => string;
  locked: boolean;
  onClose: () => void;
  onPurchase: () => void;
}

export const ArenaPurchaseModal: React.FC<ArenaPurchaseModalProps> = ({
  project,
  owned,
  economyIndex,
  availableCash,
  currentCapacity,
  currentRating,
  completedRating,
  fmt,
  locked,
  onClose,
  onPurchase,
}) => {
  const [step, setStep] = useState<'review' | 'success'>('review');
  const [submitting, setSubmitting] = useState(false);
  const [resultRatings, setResultRatings] = useState<{ before: number; after: number } | null>(null);
  const cost = getArenaProjectCost(project.spec.baseCostEUR, economyIndex);
  const canAfford = availableCash >= cost;
  const title = project.spec.label;
  const description = project.kind === 'feature'
    ? project.spec.description
    : `Permanent seating expansion adding ${project.spec.seatGain.toLocaleString()} seats.`;
  const effect = project.kind === 'feature'
    ? project.spec.effect
    : `Capacity: ${currentCapacity.toLocaleString()} → ${(currentCapacity + project.spec.seatGain).toLocaleString()}`;

  const confirmPurchase = () => {
    if (submitting) return;
    setSubmitting(true);
    setResultRatings({ before: currentRating, after: completedRating });
    onPurchase();
    setSubmitting(false);
    setStep('success');
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/85 sm:items-center sm:p-4" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-950 p-5 shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">
              {step === 'success' ? 'Project Complete' : project.kind === 'feature' ? 'Arena Feature' : 'Capacity Project'}
            </p>
            <h3 className="mt-1 text-2xl font-black text-white">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-800 hover:text-white"><X size={18} /></button>
        </div>

        {step === 'success' ? (
          <div className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5 text-center">
            <motion.div initial={{ scale: 0.4, rotate: -18 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 18 }} className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400 text-xl font-black text-slate-950">✓</motion.div>
            <div className="mt-3 text-lg font-black text-emerald-100">Upgrade installed</div>
            <p className="mt-2 text-sm text-emerald-200/75">{effect}</p>
            <div className="mt-3 rounded-xl border border-emerald-300/20 bg-slate-950/35 px-3 py-2 text-sm font-black text-white">
              Arena Rating: {resultRatings?.before ?? currentRating} → <span className="text-emerald-300">{resultRatings?.after ?? completedRating}</span>
            </div>
            <div className="mt-3 text-xs font-bold text-slate-300">{fmt(cost)} was posted to the club ledger.</div>
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm leading-6 text-slate-400">{description}</p>
            <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm font-bold text-amber-100">{effect}</div>
            {owned ? (
              <div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-center text-sm font-black text-emerald-200">Owned and permanently installed</div>
            ) : (
              <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex justify-between text-sm"><span className="text-slate-400">One-time price</span><span className="font-black text-amber-300">{fmt(cost)}</span></div>
                <div className="mt-2 flex justify-between text-sm"><span className="text-slate-400">Available Club Cash</span><span className="font-black text-white">{fmt(availableCash)}</span></div>
                <div className="mt-2 flex justify-between text-sm"><span className="text-slate-400">Cash after purchase</span><span className={`font-black ${canAfford ? 'text-emerald-300' : 'text-rose-300'}`}>{fmt(availableCash - cost)}</span></div>
                <div className="mt-2 flex justify-between text-sm"><span className="text-slate-400">Installation</span><span className="font-black text-white">Immediate</span></div>
                {locked && <div className="mt-3 text-xs font-bold text-amber-300">Arena projects are approved during Facilities Review.</div>}
                <button type="button" disabled={locked || !canAfford || submitting} onClick={confirmPurchase} className="mt-4 w-full rounded-xl bg-amber-400 py-3 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40">Purchase Upgrade</button>
              </div>
            )}
          </>
        )}
        <button type="button" onClick={onClose} className="mt-3 w-full rounded-xl bg-slate-800 py-3 text-sm font-black text-white hover:bg-slate-700">{step === 'success' ? 'Done' : 'Close'}</button>
      </div>
    </div>
  );
};
