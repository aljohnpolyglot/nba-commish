import React from 'react';
import { createPortal } from 'react-dom';
import { GraduationCap, X } from 'lucide-react';
import { YouthPromotionPanel } from '../central/view/FrontOffice/sections/AcademySection';

type OffseasonConfirmSpec = {
  eyebrow: string;
  title: string;
  body: string;
  confirmLabel: string;
};

type YouthPromotionPlayer = {
  id: string | number;
  name: string;
  pos: string;
  age: number;
  ovr: number;
  pot: number;
  face?: any;
  imgURL?: string;
};

type RookieRow = {
  internalId: string;
  name: string;
  round?: number;
  pick?: number;
};

type FriendlyRow = {
  key: string;
  dateLabel: string;
  matchup: string;
};

export const OffseasonStepConfirmModal: React.FC<{
  spec: OffseasonConfirmSpec | null;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ spec, onCancel, onConfirm }) => {
  if (!spec) return null;
  return createPortal(
    <div className="fixed inset-0 z-[121] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-lg rounded-2xl border border-amber-500/30 bg-slate-950 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 bg-amber-500/[0.06]">
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-300 mb-2">{spec.eyebrow}</p>
          <h2 className="text-xl font-black uppercase tracking-tight text-white">{spec.title}</h2>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-300 leading-relaxed">
            {spec.body}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 rounded-xl bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs py-3 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-widest text-xs py-3 transition-colors"
            >
              {spec.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export const OffseasonAutoResolveConfirmModal: React.FC<{
  open: boolean;
  isPba: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ open, isPba, onCancel, onConfirm }) => {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[121] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-lg rounded-2xl border border-amber-500/30 bg-slate-950 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 bg-amber-500/[0.06]">
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-300 mb-2">
            {isPba ? 'Conference Break' : 'Summer Checklist'}
          </p>
          <h2 className="text-xl font-black uppercase tracking-tight text-white">
            {isPba ? 'Skip Remaining Tasks' : 'Sim to Preseason'}
          </h2>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-300 leading-relaxed">
            {isPba
              ? 'This skips remaining tasks and advances to the next conference.'
              : 'This advances the remaining offseason phases in order and lands in preseason with the new season ready to start.'}
          </p>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2 text-sm text-slate-400">
            {isPba ? (
              <>
                <p>• remaining tasks are auto-completed</p>
                <p>• games begin immediately in the next conference</p>
              </>
            ) : (
              <>
                <p>• free agency, training camp, and late offseason cleanup continue automatically</p>
                <p>• in GM mode, AI keeps hands off your user-team roster decisions</p>
                <p>• roster compliance still has to be satisfied before the season can proceed</p>
              </>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 rounded-xl bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs py-3 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-widest text-xs py-3 transition-colors"
            >
              {isPba ? 'Skip All' : 'Sim to Preseason'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export const RookieContractsDisclaimerModal: React.FC<{
  open: boolean;
  rookies: RookieRow[];
  onDismiss: () => void;
}> = ({ open, rookies, onDismiss }) => {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onDismiss} />
      <div className="relative w-full max-w-md rounded-2xl border border-amber-500/30 bg-slate-950 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 bg-amber-500/[0.06]">
          <h2 className="text-lg font-black uppercase tracking-tight text-white">Rookie Contracts Signed</h2>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-300 leading-relaxed">
            Per the NBA CBA, your <span className="font-black text-amber-300">first-round picks</span> are signed automatically to the standard rookie scale — guaranteed contracts, 2 years + 2 team option years. There's no decline option.
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">
            Your <span className="font-black text-amber-300">second-round picks</span> are signed to non-guaranteed deals by default. They count against the roster but you can waive them before the <span className="font-black text-amber-300">January 10 NG guarantee deadline</span> for a free release — no dead money.
          </p>
          {rookies.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] divide-y divide-white/10 max-h-40 overflow-y-auto">
              {rookies.map(p => {
                const isR1 = p.round === 1;
                return (
                  <div key={p.internalId} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white truncate">{p.name}</div>
                      <div className="text-[10px] text-slate-500">
                        R{p.round} #{p.pick} · {isR1 ? 'Guaranteed (rookie scale)' : 'Non-guaranteed'}
                      </div>
                    </div>
                    <span className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded ${isR1 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}`}>
                      {isR1 ? 'GUARANTEED' : 'NG'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <button
            onClick={onDismiss}
            className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-widest text-xs py-3 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export const YouthPromotionModal: React.FC<{
  open: boolean;
  teamName: string;
  youthPlayers: YouthPromotionPlayer[];
  seniorRosterSize: number;
  onClose: () => void;
  onPromote: (ids: Array<string | number>) => void;
}> = ({ open, teamName, youthPlayers, seniorRosterSize, onClose, onPromote }) => {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto scrollbar-hide bg-slate-900 rounded-2xl border border-slate-700 p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <GraduationCap size={22} className="text-emerald-400" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-emerald-300">Offseason · Youth Promotion</p>
              <h2 className="text-lg font-black text-white uppercase tracking-tight mt-1">{teamName} Promotion Window</h2>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>
        <YouthPromotionPanel
          youthPlayers={youthPlayers as any}
          slotsAvailable={Math.max(0, 15 - seniorRosterSize)}
          seniorRosterSize={seniorRosterSize}
          maxRosterSize={15}
          onPromote={onPromote as any}
        />
      </div>
    </div>,
    document.body,
  );
};

export const PreseasonFriendliesModal: React.FC<{
  open: boolean;
  games: FriendlyRow[];
  onClose: () => void;
  onDone: () => void;
}> = ({ open, games, onClose, onDone }) => {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl border border-sky-500/30 bg-slate-950 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 bg-sky-500/[0.06] flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-sky-300">Summer Checklist</p>
            <h2 className="mt-1 text-xl font-black uppercase tracking-tight text-white">Preseason Tune-Ups</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {games.length > 0 ? (
            <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 overflow-hidden">
              {games.map(game => (
                <div key={game.key} className="grid grid-cols-[110px_1fr] gap-3 px-4 py-3 bg-slate-900/60">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{game.dateLabel}</div>
                  <div className="text-sm font-bold text-slate-100">{game.matchup}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-400">
              No preseason friendlies are scheduled for your club yet. This review is clear for now.
            </div>
          )}
          <button
            onClick={onDone}
            className="w-full rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-black uppercase tracking-widest text-xs py-3 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
