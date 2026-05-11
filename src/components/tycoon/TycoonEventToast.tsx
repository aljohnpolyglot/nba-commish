import React from 'react';
import { AlertTriangle, Handshake, TrendingUp, X, Check, XCircle } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { acceptMidTermBonus } from '../../services/tycoon/eventChecker';
import { formatCurrencyWithCode } from '../../utils/helpers';

interface ToastEventConfig {
  icon: React.ReactNode;
  borderClass: string;
  bgClass: string;
  title: string;
  body: (payload: any, currency: string) => React.ReactNode;
  actions: 'dismiss-only' | 'accept-decline' | 'accept-bonus';
}

const EVENT_CONFIG: Record<string, ToastEventConfig> = {
  bankAlarm: {
    icon: <AlertTriangle size={16} className="text-rose-400" />,
    borderClass: 'border-rose-500/50',
    bgClass: 'bg-rose-500/10',
    title: 'Bank Alarm',
    body: (p, c) => (
      <span>Your club is operating in the red. Cash on hand: <strong className="text-rose-300">{formatCurrencyWithCode(p?.cash ?? 0, c, false)}</strong>. Interest costs accruing.</span>
    ),
    actions: 'dismiss-only',
  },
  crisisMeeting: {
    icon: <AlertTriangle size={16} className="text-amber-400" />,
    borderClass: 'border-amber-500/50',
    bgClass: 'bg-amber-500/10',
    title: 'Boardroom Crisis Meeting',
    body: (p) => (
      <span>The board has called an emergency meeting. Current league rank: <strong className="text-amber-300">{p?.rank ?? '?'}</strong>. Underperformance flagged.</span>
    ),
    actions: 'dismiss-only',
  },
  sponsorWarning: {
    icon: <AlertTriangle size={16} className="text-yellow-400" />,
    borderClass: 'border-yellow-500/40',
    bgClass: 'bg-yellow-500/5',
    title: 'Sponsor Concerns',
    body: () => (
      <span>Losing streak detected. Sponsors will offer ~10% less on the next renewal.</span>
    ),
    actions: 'dismiss-only',
  },
  sponsorMidTermBonus: {
    icon: <TrendingUp size={16} className="text-emerald-400" />,
    borderClass: 'border-emerald-500/50',
    bgClass: 'bg-emerald-500/10',
    title: 'Sponsor Bonus Offer',
    body: (p) => (
      <span>Your <strong className="text-emerald-300">{p?.slot ?? 'sponsor'}</strong> sponsor offers a mid-term extension: <strong>+20% value</strong>, +2 years.</span>
    ),
    actions: 'accept-bonus',
  },
  sponsorPoachingOffer: {
    icon: <Handshake size={16} className="text-amber-400" />,
    borderClass: 'border-amber-500/50',
    bgClass: 'bg-amber-500/10',
    title: 'Sponsor Poaching Offer',
    body: () => (
      <span>A premium sponsor wants your <strong className="text-amber-300">Sleeve</strong> slot. Accepting breaks the existing deal (penalty applies).</span>
    ),
    actions: 'accept-decline',
  },
};

export const TycoonEventToast: React.FC = () => {
  const { state, dispatchAction, applyTycoonMutation } = useGame() as any;
  const events: any[] = state.tycoonEvents ?? [];
  const userTeamId: number = state.userTeamId;
  const currency: string = state.leagueStats?.currency ?? 'EUR';

  const unread = events.find((e: any) => e.unread && e.teamId === userTeamId);
  if (!unread) return null;

  const cfg = EVENT_CONFIG[unread.kind];
  if (!cfg) return null;

  const markRead = () => {
    dispatchAction({
      type: 'UPDATE_STATE' as any,
      payload: {
        tycoonEvents: events.map((e: any) => e.id === unread.id ? { ...e, unread: false } : e),
      },
    });
  };

  const acceptBonus = () => {
    if (unread.kind !== 'sponsorMidTermBonus' || !unread.payload?.slot) {
      markRead();
      return;
    }
    applyTycoonMutation(userTeamId, (team: any) => acceptMidTermBonus(team, unread.payload.slot));
    markRead();
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 max-w-sm">
      <div className={`${cfg.bgClass} ${cfg.borderClass} border rounded-xl p-4 shadow-lg backdrop-blur-sm`}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{cfg.icon}</div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-black uppercase tracking-widest text-white mb-1">{cfg.title}</h3>
            <p className="text-sm text-slate-300 leading-snug">{cfg.body(unread.payload ?? {}, currency)}</p>
            <div className="mt-3 flex gap-2">
              {cfg.actions === 'dismiss-only' && (
                <button onClick={markRead} className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded">
                  Acknowledge
                </button>
              )}
              {cfg.actions === 'accept-bonus' && (
                <>
                  <button onClick={acceptBonus} className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded">
                    <Check size={10} /> Accept
                  </button>
                  <button onClick={markRead} className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded">
                    Decline
                  </button>
                </>
              )}
              {cfg.actions === 'accept-decline' && (
                <>
                  <button onClick={markRead} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded" title="Poaching-offer flow lands in a future slice — for now this just dismisses">
                    <XCircle size={10} /> Pass
                  </button>
                </>
              )}
            </div>
          </div>
          <button onClick={markRead} aria-label="Dismiss"><X size={14} className="text-slate-500 hover:text-white" /></button>
        </div>
      </div>
    </div>
  );
};
