import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, XCircle, TrendingDown, Bandage, AlertTriangle, Zap, Star, Heart, Trophy, Award, FileSignature } from 'lucide-react';
import { useGame } from '../../store/GameContext';

// ── Toast item types ────────────────────────────────────────────────────────
type ToastItem =
  | { type: 'fa-accepted'; playerName: string; annualM: number; years: number }
  | { type: 'fa-rejected'; playerName: string; winnerTeamName: string; rejectionReason?: string }
  | { type: 'fa-bid-submitted'; playerName: string; teamName: string; annualM: number; years: number; resolvesInDays: number }
  | { type: 'eliminated'; teamName: string }
  | { type: 'injury'; playerName: string; injuryType: string; gamesRemaining: number; pos?: string; teamName?: string }
  | { type: 'recovery'; playerName: string; teamName: string; pos: string }
  | { type: 'feat-own'; playerName: string; teamName: string; oppName: string; homeScore: number; awayScore: number; isHome: boolean; won: boolean; pts: number; reb: number; ast: number }
  | { type: 'feat-league'; playerName: string; teamName: string; oppName: string; homeScore: number; awayScore: number; isHome: boolean; won: boolean; pts: number; reb: number; ast: number }
  | { type: 'award'; playerName: string; teamName: string; teamAbbrev: string; awardLabel: string }
  | { type: 'playoffs'; teamName: string; body: string }
  | { type: 'option'; playerName: string; teamName: string; pos: string; decision: 'player-in' | 'player-out' | 'team-exercised' | 'team-declined'; amountM?: number }
  | { type: 'rotation-budget'; delta: number }
  // ── RFA matching offer-sheet ───────────────────────────────────────────
  // 'rfa-offer-received' shown to the user when their RFA has a winning offer
  // sheet from another team — has Match/Decline action buttons + 12s duration.
  | { type: 'rfa-offer-received'; playerId: string; playerName: string; signingTeamName: string; annualM: number; years: number; expiresInDays: number }
  | { type: 'rfa-matched'; playerName: string; priorTeamName: string; signingTeamName: string }
  | { type: 'rfa-not-matched'; playerName: string; signingTeamName: string }
  | { type: 'gameplan-copied' };

// ── Imperative push API (usable outside React tree) ─────────────────────────
let _enqueue: ((item: ToastItem) => void) | null = null;
export function pushToast(item: ToastItem) { _enqueue?.(item); }

const TOAST_DURATION: Record<ToastItem['type'], number> = {
  'fa-accepted': 5000,
  'fa-rejected': 5000,
  'fa-bid-submitted': 4500,
  'eliminated': 7000,
  'injury': 6000,
  'recovery': 5000,
  'feat-own': 6000,
  'feat-league': 6000,
  'award': 7000,
  'playoffs': 7000,
  'option': 6000,
  'rotation-budget': 5000,
  // RFA decision toast persists 12s — user needs time to choose Match/Decline
  'rfa-offer-received': 12000,
  'rfa-matched': 6000,
  'rfa-not-matched': 6000,
  'gameplan-copied': 3500,
};

// ── Color theme per toast type (accent = border/icon/label tint) ────────────
type Accent = { bg: string; border: string; label: string; icon: string };
const ACCENT: Record<ToastItem['type'], Accent> = {
  'fa-accepted':  { bg: 'bg-emerald-950/90', border: 'border-emerald-500/50', label: 'text-emerald-300', icon: 'text-emerald-400' },
  'fa-rejected':  { bg: 'bg-rose-950/90',    border: 'border-rose-500/50',    label: 'text-rose-300',    icon: 'text-rose-400'    },
  'fa-bid-submitted': { bg: 'bg-indigo-950/90', border: 'border-indigo-500/50', label: 'text-indigo-300', icon: 'text-indigo-400' },
  'eliminated':   { bg: 'bg-zinc-950/90',    border: 'border-zinc-500/50',    label: 'text-zinc-300',    icon: 'text-zinc-400'    },
  'injury':       { bg: 'bg-rose-950/90',    border: 'border-rose-500/50',    label: 'text-rose-300',    icon: 'text-rose-400'    },
  'recovery':     { bg: 'bg-emerald-950/90', border: 'border-emerald-500/50', label: 'text-emerald-300', icon: 'text-emerald-400' },
  'feat-own':     { bg: 'bg-indigo-950/90',  border: 'border-indigo-500/50',  label: 'text-indigo-300',  icon: 'text-indigo-400'  },
  'feat-league':  { bg: 'bg-amber-950/90',   border: 'border-amber-500/50',   label: 'text-amber-300',   icon: 'text-amber-400'   },
  'award':        { bg: 'bg-[#3a2a05]/90',   border: 'border-[#FDB927]/50',   label: 'text-[#FDB927]',   icon: 'text-[#FDB927]'   },
  'playoffs':        { bg: 'bg-violet-950/90',  border: 'border-violet-500/50',  label: 'text-violet-300',  icon: 'text-violet-400'  },
  'option':          { bg: 'bg-sky-950/90',     border: 'border-sky-500/50',     label: 'text-sky-300',     icon: 'text-sky-400'     },
  'rotation-budget': { bg: 'bg-amber-950/90',   border: 'border-amber-500/50',   label: 'text-amber-300',   icon: 'text-amber-400'   },
  'rfa-offer-received': { bg: 'bg-fuchsia-950/95', border: 'border-fuchsia-500/60', label: 'text-fuchsia-300', icon: 'text-fuchsia-400' },
  'rfa-matched':     { bg: 'bg-emerald-950/90', border: 'border-emerald-500/50', label: 'text-emerald-300', icon: 'text-emerald-400' },
  'rfa-not-matched': { bg: 'bg-rose-950/90',    border: 'border-rose-500/50',    label: 'text-rose-300',    icon: 'text-rose-400'    },
  'gameplan-copied': { bg: 'bg-sky-950/90',     border: 'border-sky-500/50',     label: 'text-sky-300',     icon: 'text-sky-400'     },
};

export const ToastNotifier: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const [visible, setVisible] = useState<ToastItem | null>(null);

  // Register the imperative push API so callers outside the React tree can enqueue toasts.
  useEffect(() => {
    _enqueue = item => setQueue(q => [...q, item]);
    return () => { _enqueue = null; };
  }, []);

  // Drain pendingFAToasts
  useEffect(() => {
    const pending = state.pendingFAToasts;
    if (!pending || pending.length === 0) return;
    const items: ToastItem[] = pending.map(p =>
      p.accepted
        ? { type: 'fa-accepted', playerName: p.playerName, annualM: p.annualM, years: p.years }
        : { type: 'fa-rejected', playerName: p.playerName, winnerTeamName: p.winnerTeamName ?? '', rejectionReason: p.rejectionReason }
    );
    setQueue(q => [...q, ...items]);
    dispatchAction({ type: 'UPDATE_STATE' as any, payload: { pendingFAToasts: [] } });
  }, [state.pendingFAToasts]);

  // pendingRFAOfferSheets is now handled by RFAOfferSheetModal (mounted in App.tsx).
  // The modal owns the queue and dispatches MATCH_RFA_OFFER / DECLINE_RFA_OFFER per row.

  // Drain pendingRFAMatchResolutions — outcome toasts (matched / not-matched).
  useEffect(() => {
    const pending = (state as any).pendingRFAMatchResolutions as Array<{ playerName: string; priorTeamName: string; signingTeamName: string; matched: boolean }> | undefined;
    if (!pending || pending.length === 0) return;
    const items: ToastItem[] = pending.map(p =>
      p.matched
        ? { type: 'rfa-matched', playerName: p.playerName, priorTeamName: p.priorTeamName, signingTeamName: p.signingTeamName }
        : { type: 'rfa-not-matched', playerName: p.playerName, signingTeamName: p.signingTeamName },
    );
    setQueue(q => [...q, ...items]);
    dispatchAction({ type: 'UPDATE_STATE' as any, payload: { pendingRFAMatchResolutions: [] } });
  }, [(state as any).pendingRFAMatchResolutions]);

  // Drain pendingElimToast
  useEffect(() => {
    if (!state.pendingElimToast) return;
    const teamName = state.userTeamId !== undefined
      ? (state.teams.find(t => t.id === state.userTeamId)?.name ?? 'Your team')
      : 'Your team';
    setQueue(q => [...q, { type: 'eliminated', teamName }]);
    dispatchAction({ type: 'UPDATE_STATE' as any, payload: { pendingElimToast: false } });
  }, [state.pendingElimToast]);

  // Drain pendingInjuryToasts
  useEffect(() => {
    const pending = state.pendingInjuryToasts;
    if (!pending || pending.length === 0) return;
    const items: ToastItem[] = pending.map(p => ({
      type: 'injury',
      playerName: p.playerName,
      injuryType: p.injuryType,
      gamesRemaining: p.gamesRemaining,
      pos: (p as any).pos,
      teamName: (p as any).teamName,
    }));
    setQueue(q => [...q, ...items]);
    dispatchAction({ type: 'UPDATE_STATE' as any, payload: { pendingInjuryToasts: [] } });
  }, [state.pendingInjuryToasts]);

  // Drain pendingRecoveryToasts
  useEffect(() => {
    const pending = (state as any).pendingRecoveryToasts as { playerName: string; teamName: string; pos: string }[] | undefined;
    if (!pending || pending.length === 0) return;
    const items: ToastItem[] = pending.map(p => ({
      type: 'recovery', playerName: p.playerName, teamName: p.teamName, pos: p.pos,
    }));
    setQueue(q => [...q, ...items]);
    dispatchAction({ type: 'UPDATE_STATE' as any, payload: { pendingRecoveryToasts: [] } });
  }, [(state as any).pendingRecoveryToasts]);

  // Drain pendingFeatToasts
  useEffect(() => {
    const pending = (state as any).pendingFeatToasts as { playerName: string; teamName: string; oppName: string; homeScore: number; awayScore: number; isHome: boolean; won: boolean; pts: number; reb: number; ast: number; isOwnTeam: boolean }[] | undefined;
    if (!pending || pending.length === 0) return;
    const items: ToastItem[] = pending.map(p => ({
      type: p.isOwnTeam ? 'feat-own' : 'feat-league',
      playerName: p.playerName, teamName: p.teamName, oppName: p.oppName,
      homeScore: p.homeScore, awayScore: p.awayScore, isHome: p.isHome, won: p.won,
      pts: p.pts, reb: p.reb, ast: p.ast,
    }));
    setQueue(q => [...q, ...items]);
    dispatchAction({ type: 'UPDATE_STATE' as any, payload: { pendingFeatToasts: [] } });
  }, [(state as any).pendingFeatToasts]);

  // Drain pendingAwardToasts (render path ready — dispatch from award-assignment code when wired)
  useEffect(() => {
    const pending = (state as any).pendingAwardToasts as { playerName: string; teamName: string; teamAbbrev: string; awardLabel: string }[] | undefined;
    if (!pending || pending.length === 0) return;
    const items: ToastItem[] = pending.map(p => ({
      type: 'award', playerName: p.playerName, teamName: p.teamName, teamAbbrev: p.teamAbbrev, awardLabel: p.awardLabel,
    }));
    setQueue(q => [...q, ...items]);
    dispatchAction({ type: 'UPDATE_STATE' as any, payload: { pendingAwardToasts: [] } });
  }, [(state as any).pendingAwardToasts]);

  // Drain pendingPlayoffsToasts (render path ready — dispatch from playoff advance code when wired)
  useEffect(() => {
    const pending = (state as any).pendingPlayoffsToasts as { teamName: string; body: string }[] | undefined;
    if (!pending || pending.length === 0) return;
    const items: ToastItem[] = pending.map(p => ({ type: 'playoffs', teamName: p.teamName, body: p.body }));
    setQueue(q => [...q, ...items]);
    dispatchAction({ type: 'UPDATE_STATE' as any, payload: { pendingPlayoffsToasts: [] } });
  }, [(state as any).pendingPlayoffsToasts]);

  // Drain pendingOptionToasts (GM-mode player/team option decisions at season rollover)
  useEffect(() => {
    const pending = (state as any).pendingOptionToasts as { playerName: string; teamName: string; pos: string; decision: 'player-in' | 'player-out' | 'team-exercised' | 'team-declined'; amountM?: number }[] | undefined;
    if (!pending || pending.length === 0) return;
    const items: ToastItem[] = pending.map(p => ({
      type: 'option', playerName: p.playerName, teamName: p.teamName, pos: p.pos, decision: p.decision, amountM: p.amountM,
    }));
    setQueue(q => [...q, ...items]);
    dispatchAction({ type: 'UPDATE_STATE' as any, payload: { pendingOptionToasts: [] } });
  }, [(state as any).pendingOptionToasts]);

  // Dequeue one at a time
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissCurrent = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setVisible(null);
  }, []);

  const clearAll = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setVisible(null);
    setQueue([]);
  }, []);

  useEffect(() => {
    if (visible || queue.length === 0) return;
    const [next, ...rest] = queue;
    setVisible(next);
    setQueue(rest);
    timerRef.current = setTimeout(() => setVisible(null), TOAST_DURATION[next.type]);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [visible, queue]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={`${visible.type}-${JSON.stringify(visible)}`}
          initial={{ opacity: 0, y: -28, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-1.5"
        >
          <div className="cursor-pointer" onClick={dismissCurrent}>
            <ToastContent item={visible} />
          </div>
          {queue.length > 0 && (
            <button
              onClick={clearAll}
              className="text-xs text-slate-400 hover:text-white bg-slate-900/80 border border-slate-700/60 px-3 py-1 rounded-full backdrop-blur-md transition-colors"
            >
              clear all ({queue.length} more)
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function injuryDuration(gamesRemaining: number): string {
  if (gamesRemaining <= 3) return 'Day-to-Day';
  if (gamesRemaining >= 82) return 'Season-Ending';
  if (gamesRemaining >= 15) return `~${Math.round(gamesRemaining / 3)} weeks`;
  return `~${gamesRemaining} games`;
}

function statLine(pts: number, reb: number, ast: number): string {
  // Compose a human-sounding stat line — drop categories below 10 when a bigger story exists.
  const parts: string[] = [`${pts} points`];
  if (reb >= 10) parts.push(`${reb} rebounds`);
  if (ast >= 10) parts.push(`${ast} assists`);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts[0]}, ${parts[1]} and ${parts[2]}`;
}

// ── Card shell (used by all toast types) ────────────────────────────────────
const Card: React.FC<{
  type: ToastItem['type'];
  icon: React.ElementType;
  header: string;
  label: string;
  children: React.ReactNode;
}> = ({ type, icon: Icon, header, label, children }) => {
  const a = ACCENT[type];
  return (
    <div className={`min-w-[320px] max-w-[440px] rounded-xl border shadow-2xl backdrop-blur-md ${a.bg} ${a.border} overflow-hidden`}>
      <div className={`flex items-center gap-2 px-4 py-1.5 border-b ${a.border} bg-black/30`}>
        <Icon className={`w-3.5 h-3.5 ${a.icon} shrink-0`} />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80">{header}</span>
        <span className={`ml-auto text-[9px] font-bold uppercase tracking-widest ${a.label}`}>{label}</span>
      </div>
      <div className="px-4 py-2.5 text-[13px] leading-snug text-white/90 font-medium">
        {children}
      </div>
    </div>
  );
};

// ── Per-type render ─────────────────────────────────────────────────────────
const ToastContent: React.FC<{ item: ToastItem }> = ({ item }) => {
  if (item.type === 'fa-accepted') {
    return (
      <Card type={item.type} icon={CheckCircle} header={item.playerName} label="Signed">
        Accepted your offer — <span className="text-[#FDB927] font-bold">${item.annualM}M / {item.years}yr</span>.
      </Card>
    );
  }

  if (item.type === 'fa-rejected') {
    return (
      <Card type={item.type} icon={XCircle} header={item.playerName} label="Rejected">
        {item.rejectionReason
          ? <>{item.playerName} <span className="text-white font-bold">{item.rejectionReason}</span>.</>
          : <>Chose <span className="text-white font-bold">{item.winnerTeamName}</span> over your offer.</>}
      </Card>
    );
  }

  if (item.type === 'fa-bid-submitted') {
    return (
      <Card type={item.type} icon={FileSignature} header={item.playerName} label="Offer Submitted">
        <span className="text-white font-bold">{item.teamName}</span> offered <span className="text-[#FDB927] font-bold">${item.annualM}M / {item.years}yr</span> — decision in ~{item.resolvesInDays} {item.resolvesInDays === 1 ? 'day' : 'days'}.
      </Card>
    );
  }

  if (item.type === 'eliminated') {
    return (
      <Card type={item.type} icon={TrendingDown} header={item.teamName} label="Eliminated">
        Eliminated from playoff contention.
      </Card>
    );
  }

  if (item.type === 'injury') {
    const isMajor = item.gamesRemaining >= 15;
    const Icon = isMajor ? AlertTriangle : Bandage;
    const posPrefix = item.pos ? `${item.pos} ` : '';
    return (
      <Card type={item.type} icon={Icon} header={item.teamName ?? 'Injury'} label="Injury">
        <span className="text-white font-bold">{posPrefix}{item.playerName}</span> was injured!
        {' '}({item.injuryType}, out for {injuryDuration(item.gamesRemaining)})
      </Card>
    );
  }

  if (item.type === 'recovery') {
    const posPrefix = item.pos ? `${item.pos} ` : '';
    return (
      <Card type={item.type} icon={Heart} header={item.teamName} label="Recovery">
        <span className="text-white font-bold">{posPrefix}{item.playerName}</span> has recovered from their injury.
      </Card>
    );
  }

  if (item.type === 'feat-own' || item.type === 'feat-league') {
    const scoreStr = item.isHome
      ? `${item.homeScore}-${item.awayScore}`
      : `${item.awayScore}-${item.homeScore}`;
    const outcome = item.won ? `${scoreStr} win over the ${item.oppName}` : `${scoreStr} loss to the ${item.oppName}`;
    return (
      <Card type={item.type} icon={item.type === 'feat-own' ? Zap : Star} header={item.teamName} label="Player Feat">
        <span className="text-white font-bold">{item.playerName}</span> had {statLine(item.pts, item.reb, item.ast)} in a {outcome}.
      </Card>
    );
  }

  if (item.type === 'award') {
    return (
      <Card type={item.type} icon={Award} header={item.teamName} label="Award">
        <span className="text-white font-bold">{item.playerName}</span> ({item.teamAbbrev}) won the <span className="text-[#FDB927] font-bold">{item.awardLabel}</span>.
      </Card>
    );
  }

  if (item.type === 'option') {
    const posPrefix = item.pos ? `${item.pos} ` : '';
    const name = <span className="text-white font-bold">{posPrefix}{item.playerName}</span>;
    let body: React.ReactNode;
    switch (item.decision) {
      case 'player-in':
        body = <>{name} accepted his player option{item.amountM ? <> — <span className="text-[#FDB927] font-bold">${item.amountM}M</span></> : null}.</>;
        break;
      case 'player-out':
        body = <>{name} declined his player option and will hit free agency.</>;
        break;
      case 'team-exercised':
        body = <>{item.teamName} exercised their team option on {name}.</>;
        break;
      case 'team-declined':
        body = <>{item.teamName} declined their team option on {name} — restricted free agent.</>;
        break;
    }
    return (
      <Card type={item.type} icon={FileSignature} header={item.teamName} label="Contract Option">
        {body}
      </Card>
    );
  }

  if (item.type === 'rotation-budget') {
    const over = item.delta < 0;
    return (
      <Card type={item.type} icon={AlertTriangle} header="Rotation Budget" label={over ? 'Over' : 'Under'}>
        {over
          ? <>Rotation over budget by <b>{Math.abs(item.delta)} min</b> — sim will scale back minutes to fit quarters.</>
          : <>Rotation under budget by <b>{item.delta} min</b> — starters will get thin minutes next game.</>}
      </Card>
    );
  }

  if (item.type === 'rfa-offer-received') {
    return <RFAOfferToast item={item} />;
  }

  if (item.type === 'rfa-matched') {
    return (
      <Card type={item.type} icon={CheckCircle} header={item.playerName} label="Matched">
        <span className="text-emerald-300 font-bold">{item.priorTeamName}</span> matched your offer sheet — {item.playerName} stays put.
      </Card>
    );
  }

  if (item.type === 'rfa-not-matched') {
    return (
      <Card type={item.type} icon={CheckCircle} header={item.playerName} label="Signed">
        Offer sheet not matched — {item.playerName} signs with the <span className="text-rose-300 font-bold">{item.signingTeamName}</span>.
      </Card>
    );
  }

  if (item.type === 'gameplan-copied') {
    return (
      <Card type={item.type} icon={CheckCircle} header="Ideal Rotation" label="Updated">
        Gameplan copied — order and minutes saved to <span className="text-sky-300 font-bold">Ideal Rotation</span>.
      </Card>
    );
  }

  // playoffs
  return (
    <Card type={item.type} icon={Trophy} header={item.teamName} label="Playoffs">
      {item.body}
    </Card>
  );
};

// ── RFA offer-sheet decision toast (interactive) ───────────────────────────
// Standalone subcomponent because it needs useGame() for dispatch — Card is purely visual.
const RFAOfferToast: React.FC<{ item: Extract<ToastItem, { type: 'rfa-offer-received' }> }> = ({ item }) => {
  const { dispatchAction } = useGame();
  const a = ACCENT['rfa-offer-received'];
  const [decided, setDecided] = useState(false);
  const handle = (decision: 'match' | 'decline') => {
    if (decided) return;
    setDecided(true);
    dispatchAction({
      type: decision === 'match' ? 'MATCH_RFA_OFFER' : 'DECLINE_RFA_OFFER',
      payload: { playerId: item.playerId },
    } as any);
  };
  return (
    <div className={`min-w-[340px] max-w-[460px] rounded-xl border shadow-2xl backdrop-blur-md ${a.bg} ${a.border} overflow-hidden`} onClick={(e) => e.stopPropagation()}>
      <div className={`flex items-center gap-2 px-4 py-1.5 border-b ${a.border} bg-black/30`}>
        <FileSignature className={`w-3.5 h-3.5 ${a.icon} shrink-0`} />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80">{item.playerName}</span>
        <span className={`ml-auto text-[9px] font-bold uppercase tracking-widest ${a.label}`}>RFA Offer Sheet</span>
      </div>
      <div className="px-4 py-2.5 text-[13px] leading-snug text-white/90 font-medium">
        <div className="mb-2">
          <span className="text-rose-300 font-bold">{item.signingTeamName}</span> offered{' '}
          <span className="text-[#FDB927] font-bold tabular-nums">${item.annualM}M/{item.years}yr</span>.
          <div className="text-[11px] text-white/60 mt-0.5">{item.expiresInDays}-day window — match to retain via Bird Rights, or decline and they walk.</div>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => handle('match')}
            disabled={decided}
            className="flex-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900 disabled:opacity-50 text-white font-black text-[11px] uppercase tracking-widest rounded-lg"
          >
            Match
          </button>
          <button
            onClick={() => handle('decline')}
            disabled={decided}
            className="flex-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-900 disabled:opacity-50 text-white font-black text-[11px] uppercase tracking-widest rounded-lg"
          >
            Decline
          </button>
        </div>
        {decided && <div className="text-[10px] text-white/60 text-center mt-2">Decision submitted.</div>}
      </div>
    </div>
  );
};
