import type { ReactElement } from 'react';
import { getGameDateParts } from '../../../utils/dateUtils';
import type { NBAPlayer, NBATeam } from '../../../types';
import { OverlayShell, PlayerThumb } from './SigningModalOverlayShared';

interface OverLimitOverlayProps {
  action: 'showResponse' | 'sign';
  onCancel: () => void;
  onContinue: (action: 'showResponse' | 'sign') => void;
}

export function SigningModalOverLimitOverlay({
  action,
  onCancel,
  onContinue,
}: OverLimitOverlayProps): ReactElement {
  return (
    <OverlayShell borderClass="border-amber-500/40">
      <div className="p-8 w-full flex flex-col items-center">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-300 mb-2">Roster Limit</p>
        <h2 className="text-2xl font-black italic uppercase tracking-wider mb-4 text-white">15/15 Guaranteed</h2>
        <p className="text-white/80 italic mb-8 leading-relaxed text-sm">
          You're at 15/15 guaranteed. Signing this player will require an immediate waive. Continue?
        </p>
        <div className="flex flex-col gap-2 w-full">
          <button
            onClick={() => onContinue(action)}
            className="w-full py-4 bg-amber-500/20 border border-amber-500/50 hover:bg-amber-500/40 text-amber-300 font-black uppercase tracking-widest text-xs transition-colors rounded-sm"
          >
            Continue
          </button>
          <button
            onClick={onCancel}
            className="w-full py-3 bg-white/5 border border-white/10 hover:bg-white/10 text-white/70 font-black uppercase tracking-widest text-[10px] transition-colors rounded-sm"
          >
            Go Back
          </button>
        </div>
      </div>
    </OverlayShell>
  );
}

interface CapWarningOverlayProps {
  autoAccept: boolean;
  money: (value: number) => string;
  moneyPrecise: (value: number, decimals?: number) => string;
  onClose: () => void;
  onForce: () => void;
  onRetry: () => void;
  overBy: number;
  player: NBAPlayer;
  projectedPayroll: number;
  salary: number;
  team: NBATeam;
}

export function SigningModalCapWarningOverlay({
  autoAccept,
  money,
  moneyPrecise,
  onClose,
  onForce,
  onRetry,
  overBy,
  player,
  projectedPayroll,
  salary,
  team,
}: CapWarningOverlayProps): ReactElement {
  return (
    <OverlayShell borderClass="border-rose-500/40">
      <div className="w-full bg-gradient-to-b from-rose-600/20 to-transparent p-8">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-rose-300 mb-2">Cap Violation</p>
        <h2 className="text-2xl font-black italic uppercase tracking-wider text-rose-400">
          Not Possible Under Salary Cap
        </h2>
      </div>
      <div className="px-8 pb-8 w-full flex flex-col items-center">
        <p className="text-white/80 italic mb-4 leading-relaxed text-sm">
          Signing {player.name} at {moneyPrecise(salary, 2)} takes the {team.name} to {money(projectedPayroll)} — {money(overBy)} over the cap, with no MLE or Bird Rights to cover it.
        </p>
        <p className="text-[10px] text-white/40 mb-6 leading-relaxed">
          Options: drop the salary so an MLE fits, restructure around Bird Rights by re-signing a different player, or walk away.
        </p>
        <div className="flex flex-col gap-2 w-full">
          <button
            onClick={onRetry}
            className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs transition-colors rounded-sm"
          >
            Negotiate Again
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 bg-rose-600/20 border border-rose-500/50 hover:bg-rose-600/40 text-rose-300 font-black uppercase tracking-widest text-[10px] transition-colors rounded-sm"
          >
            End Deal
          </button>
          {autoAccept && (
            <button
              onClick={onForce}
              className="w-full py-3 bg-[#e21d37]/20 border border-[#e21d37]/50 hover:bg-[#e21d37]/40 text-[#e21d37] font-black uppercase tracking-widest text-[10px] transition-colors rounded-sm"
              title="Cap rules don't apply — you're the Commissioner."
            >
              You're the Commissioner — Force Signing
            </button>
          )}
        </div>
      </div>
    </OverlayShell>
  );
}

interface PendingCashOverlayProps {
  deficit: number;
  moneyPrecise: (value: number, decimals?: number) => string;
  onAcknowledge: () => void;
  onReconsider: () => void;
  player: NBAPlayer;
}

export function SigningModalPendingCashOverlay({
  deficit,
  moneyPrecise,
  onAcknowledge,
  onReconsider,
  player,
}: PendingCashOverlayProps): ReactElement {
  return (
    <OverlayShell borderClass="border-amber-500/40">
      <div className="w-full bg-gradient-to-b from-amber-600/20 to-transparent p-8">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-300 mb-2">Owner Notice</p>
        <h2 className="text-2xl font-black italic uppercase tracking-wider text-amber-300">
          Deal Runs Cash Negative
        </h2>
      </div>
      <div className="px-8 pb-8 w-full flex flex-col items-center">
        <p className="text-white/80 italic mb-3 leading-relaxed text-sm">
          Signing {player.name} projects year-end cash <span className="text-amber-300 font-black">{moneyPrecise(Math.abs(deficit), 2)}</span> below zero.
        </p>
        <p className="text-white/60 mb-6 leading-relaxed text-[12px]">
          European clubs can run a deficit; ownership will cover it if the sporting case is worth it. Confirm you want to proceed.
        </p>
        <div className="flex flex-col gap-2 w-full">
          <button
            onClick={onReconsider}
            className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs transition-colors rounded-sm"
          >
            Reconsider
          </button>
          <button
            onClick={onAcknowledge}
            className="w-full py-3 bg-amber-500/20 border border-amber-500/50 hover:bg-amber-500/40 text-amber-200 font-black uppercase tracking-widest text-[10px] transition-colors rounded-sm"
          >
            Acknowledge & Proceed
          </button>
        </div>
      </div>
    </OverlayShell>
  );
}

interface RosterFullOverlayProps {
  autoAccept: boolean;
  onClose: () => void;
  onForce: () => void;
  player: NBAPlayer;
  roster: {
    maxStandard: number;
    maxTwoWay: number;
    standardCount: number;
    twoWayCount: number;
  };
  stateDate?: string;
  team: NBATeam;
}

export function SigningModalRosterFullOverlay({
  autoAccept,
  onClose,
  onForce,
  player,
  roster,
  stateDate,
  team,
}: RosterFullOverlayProps): ReactElement {
  const { month: mo, day: dy } = stateDate ? getGameDateParts(stateDate) : getGameDateParts(new Date());
  const isCamp = (mo >= 7 && mo <= 9) || (mo === 10 && dy <= 21);
  const total = roster.standardCount + roster.twoWayCount;

  return (
    <OverlayShell borderClass="border-rose-500/30">
      <div className="w-full h-48 bg-[#050505] relative flex items-end justify-center pt-8 border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-20 pointer-events-none" />
        {team.logoUrl && <img src={team.logoUrl} className="h-32 object-contain z-10" alt={team.name} referrerPolicy="no-referrer" />}
      </div>
      <div className="p-8 w-full flex flex-col items-center relative z-20">
        <h2 className="text-2xl font-black italic uppercase tracking-wider mb-4 text-rose-400">Roster Full</h2>
        <p className="text-white/80 italic mb-2 leading-relaxed text-sm">
          {isCamp
            ? <>The {team.name} have {total}/{roster.maxStandard} players in their training-camp pool ({roster.standardCount} standard + {roster.twoWayCount} two-way) — every slot is filled.</>
            : <>The {team.name} have {roster.standardCount}/{roster.maxStandard} standard and {roster.twoWayCount}/{roster.maxTwoWay} two-way players — every slot is filled.</>}
        </p>
        <p className="text-white/60 text-xs mb-8">Waive a player first to clear a roster spot, then come back to sign {player.name}.</p>
        <div className="flex flex-col gap-2 w-full">
          <button
            onClick={onClose}
            className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs transition-colors rounded-sm"
          >
            Close — Go Waive Someone
          </button>
          {autoAccept && (
            <button
              onClick={onForce}
              className="w-full py-3 bg-[#e21d37]/20 border border-[#e21d37]/50 hover:bg-[#e21d37]/40 text-[#e21d37] font-black uppercase tracking-widest text-[10px] transition-colors rounded-sm"
              title="Roster caps don't apply — you're the Commissioner."
            >
              You're the Commissioner — Force Signing
            </button>
          )}
        </div>
      </div>
    </OverlayShell>
  );
}

interface PreflightOverlayProps {
  autoAccept: boolean;
  onAcknowledge: () => void;
  onForce: () => void;
  player: NBAPlayer;
  playerFace: unknown;
  portraitFallback?: string | null;
  preflightMessage: {
    body: string;
    title: string;
    tone?: 'neutral' | 'positive';
  };
  teamColors?: [string, string, string];
}

export function SigningModalPreflightOverlay({
  autoAccept,
  onAcknowledge,
  onForce,
  player,
  playerFace,
  portraitFallback,
  preflightMessage,
  teamColors,
}: PreflightOverlayProps): ReactElement {
  const toneColor = preflightMessage.tone === 'positive' ? 'text-emerald-400' : 'text-amber-300';

  return (
    <OverlayShell>
      <div className="w-full h-48 bg-[#050505] relative flex items-end justify-center pt-8 border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-20 pointer-events-none" />
        <PlayerThumb player={player} playerFace={playerFace} portraitFallback={portraitFallback} teamColors={teamColors} />
      </div>
      <div className="p-8 w-full flex flex-col items-center relative z-20">
        <h2 className={`text-2xl font-black italic uppercase tracking-wider mb-4 ${toneColor}`}>
          {preflightMessage.title}
        </h2>
        <p className="text-white/80 italic mb-8 leading-relaxed text-sm">
          {preflightMessage.body}
        </p>
        <div className="flex flex-col gap-2 w-full">
          <button
            onClick={onAcknowledge}
            className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs transition-colors rounded-sm"
          >
            Acknowledge
          </button>
          {autoAccept && (
            <button
              onClick={onForce}
              className="w-full py-3 bg-[#e21d37]/20 border border-[#e21d37]/50 hover:bg-[#e21d37]/40 text-[#e21d37] font-black uppercase tracking-widest text-[10px] transition-colors rounded-sm"
              title="The player's feelings don't matter — you're the Commissioner."
            >
              You're the Commissioner — Force Negotiation
            </button>
          )}
        </div>
      </div>
    </OverlayShell>
  );
}

