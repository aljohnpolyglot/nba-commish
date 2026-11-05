import React from 'react';
import { createPortal } from 'react-dom';
import { GraduationCap, X } from 'lucide-react';
import { YouthPromotionPanel } from '../central/view/FrontOffice/sections/AcademySection';
import type { LeagueStats } from '../../types';
import type { OffseasonConfirmSpec } from './offseasonStepSpecs';
import { getLeagueCalendarDates } from '../../services/leagueCalendar';
import { formatGameDateShort } from '../../utils/dateUtils';

type OffseasonBriefingSpec = {
  eyebrow: string;
  title: string;
  body: string;
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
  imgURL?: string;
  round?: number;
  pick?: number;
  eurostashClub?: string;
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
  onSecondary?: () => void;
}> = ({ spec, onCancel, onConfirm, onSecondary }) => {
  const titleId = React.useId();
  if (!spec) return null;
  return createPortal(
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onCancel} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-amber-500/30 bg-slate-950 shadow-2xl">
        <div className="px-5 py-4 border-b border-white/10 bg-amber-500/[0.06]">
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-300 mb-2">{spec.eyebrow}</p>
          <h2 id={titleId} className="text-xl font-black uppercase tracking-tight text-white">{spec.title}</h2>
        </div>
        <div className="p-5 space-y-4">
          <p className="whitespace-pre-line text-sm text-slate-300 leading-relaxed">
            {spec.body}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onCancel}
              className="flex-1 rounded-xl bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs py-3 transition-colors"
            >
              Cancel
            </button>
            {spec.secondaryLabel && onSecondary && (
              <button
                onClick={onSecondary}
                className="flex-1 rounded-xl border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 text-sky-200 font-black uppercase tracking-widest text-xs py-3 transition-colors"
              >
                {spec.secondaryLabel}
              </button>
            )}
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
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-amber-500/30 bg-slate-950 shadow-2xl">
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
          <div className="flex flex-col sm:flex-row gap-3">
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

export const OffseasonBriefingModal: React.FC<{
  spec: OffseasonBriefingSpec | null;
  onConfirm: () => void;
  onDismissForever: () => void;
}> = ({ spec, onConfirm, onDismissForever }) => {
  if (!spec) return null;
  return createPortal(
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onConfirm} />
      <div className="relative w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-amber-500/30 bg-slate-950 shadow-2xl">
        <div className="px-5 py-4 border-b border-white/10 bg-amber-500/[0.06]">
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-300 mb-2">{spec.eyebrow}</p>
          <h2 className="text-xl font-black uppercase tracking-tight text-white">{spec.title}</h2>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
            {spec.body}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onDismissForever}
              className="flex-1 rounded-xl bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs py-3 transition-colors"
            >
              Don&apos;t Show Again
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-widest text-xs py-3 transition-colors"
            >
              OK
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
  isPba?: boolean;
  leagueStats?: LeagueStats;
  onDismiss: () => void;
  onSelectRookie?: (playerId: string) => void;
}> = ({ open, rookies, isPba = false, leagueStats, onDismiss, onSelectRookie }) => {
  if (!open) return null;
  const signedRookies = rookies.filter(p => Number(p.round) > 0 && Number(p.pick) > 0);
  const guaranteeDate = leagueStats
    ? getLeagueCalendarDates(leagueStats.year, leagueStats).nonGuaranteedGuaranteeDate
    : undefined;
  const guaranteeLabel = guaranteeDate ? formatGameDateShort(guaranteeDate) : null;
  const secondRoundNonGuaranteed = (leagueStats as any)?.r2ContractsNonGuaranteed !== false;
  return createPortal(
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onDismiss} />
      <div className="relative w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-amber-500/30 bg-slate-950 shadow-2xl">
        <div className="px-5 py-4 border-b border-white/10 bg-amber-500/[0.06]">
          <h2 className="text-lg font-black uppercase tracking-tight text-white">Rookie Contracts Signed</h2>
        </div>
        <div className="p-5 space-y-4">
          {isPba ? (
            <>
              <p className="text-sm text-slate-300 leading-relaxed">
                Your <span className="font-black text-amber-300">PBA draft picks</span> have been signed to local rookie contracts.
              </p>
              <p className="text-sm text-slate-300 leading-relaxed">
                These deals follow PBA roster rules without an NBA rookie-scale or automatic guarantee deadline.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-300 leading-relaxed">
                Your <span className="font-black text-amber-300">first-round picks</span> have been signed automatically under this league's rookie-contract rules.
              </p>
              <p className="text-sm text-slate-300 leading-relaxed">
                {secondRoundNonGuaranteed
                  ? guaranteeLabel
                    ? <>Your <span className="font-black text-amber-300">second-round picks</span> are non-guaranteed. They can be waived before <span className="font-black text-amber-300">{guaranteeLabel}</span> without guaranteed dead money.</>
                    : <>Your <span className="font-black text-amber-300">second-round picks</span> are non-guaranteed, and this league has no automatic guarantee deadline.</>
                  : <>Your <span className="font-black text-amber-300">second-round picks</span> follow the saved rookie-contract settings.</>}
              </p>
            </>
          )}
          {!isPba && signedRookies.some(player => player.eurostashClub) && (
            <p className="rounded-xl border border-sky-400/20 bg-sky-400/[0.06] p-3 text-sm leading-relaxed text-sky-50/90">
              <span className="font-black text-sky-300">International option:</span> Open an eligible rookie below, then choose <span className="font-black text-white">Eurostash</span> in Player Actions to return him to his European club. He leaves your roster and payroll while you retain his NBA draft rights.
            </p>
          )}
          {signedRookies.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] divide-y divide-white/10 max-h-40 overflow-y-auto">
              {signedRookies.map(p => {
                const isR1 = p.round === 1;
                const tag = isPba ? 'PBA rookie deal' : (isR1 ? 'Guaranteed (rookie scale)' : 'Non-guaranteed');
                return (
                  <button type="button" key={p.internalId} onClick={() => onSelectRookie?.(p.internalId)} className="w-full px-3 py-2 flex items-center justify-between gap-3 text-sm text-left hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400">
                    {p.imgURL ? (
                      <img src={p.imgURL} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-9 w-9 shrink-0 rounded-full border border-white/10 bg-slate-800 object-cover object-top" />
                    ) : (
                      <div className="h-9 w-9 shrink-0 rounded-full border border-white/10 bg-slate-800 flex items-center justify-center text-xs font-black text-slate-300">
                        {p.name.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white truncate">{p.name}</div>
                      <div className="text-[10px] text-slate-500">
                        R{p.round} #{p.pick} · {tag}
                      </div>
                      {p.eurostashClub && <div className="mt-0.5 text-[9px] font-black uppercase tracking-wider text-sky-300">Eurostash eligible · {p.eurostashClub}</div>}
                    </div>
                    <span className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded ${isPba ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : isR1 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}`}>
                      {isPba ? 'PBA' : isR1 ? 'GUARANTEED' : 'NG'}
                    </span>
                  </button>
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
  maxRosterSize: number;
  onClose: () => void;
  onPromote: (ids: Array<string | number>) => void;
}> = ({ open, teamName, youthPlayers, seniorRosterSize, maxRosterSize, onClose, onPromote }) => {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[calc(100vh-2rem)] overflow-y-auto scrollbar-hide bg-slate-900 rounded-2xl border border-slate-700 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-5">
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
          slotsAvailable={Math.max(0, maxRosterSize - seniorRosterSize)}
          seniorRosterSize={seniorRosterSize}
          maxRosterSize={maxRosterSize}
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
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-sky-500/30 bg-slate-950 shadow-2xl">
        <div className="px-5 py-4 border-b border-white/10 bg-sky-500/[0.06] flex items-start justify-between gap-3">
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
                <div key={game.key} className="grid grid-cols-1 sm:grid-cols-[110px_1fr] gap-2 sm:gap-3 px-4 py-3 bg-slate-900/60">
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
