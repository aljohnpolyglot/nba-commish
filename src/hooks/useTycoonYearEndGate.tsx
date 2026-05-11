import React, { useState, useMemo, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useGame } from '../store/GameContext';
import { isEuroIsolatedMode } from '../utils/uiMode';
import { getRolloverDate, toISODateString } from '../utils/dateUtils';
import { SponsorshipNegotiationModal } from '../components/tycoon/SponsorshipNegotiationModal';
import { formatCurrencyWithCode } from '../utils/helpers';

interface Props {
  /** Optional — when provided, the gate uses this to recompute on intent change. */
  onNavigate?: () => void;
}

/**
 * Year-End Gate (Tycoon, Euro-Isolated only).
 *
 * Blocks the next sim step when ALL of:
 *  - User is in euro_isolated mode
 *  - User team has at least one expired sponsorship slot (`sponsorships[slot] === null`)
 *  - The pending sim target date would cross the season rollover date (June 30)
 *
 * Surfaces a "Negotiate now or fall back to default sponsors?" modal. The user
 * either opens negotiations (the row in OffseasonAufgaben handles this, but
 * the gate gives a second chance here) or proceeds and accepts the revenue
 * hit on the next ledger.
 */
export function useTycoonYearEndGate(_props?: Props) {
  const { state } = useGame();
  const [open, setOpen] = useState(false);
  const [negotiateOpen, setNegotiateOpen] = useState(false);
  const pendingRef = useRef<(() => void | Promise<void>) | null>(null);
  const acknowledgedYearRef = useRef<number | null>(null);

  const userTeam = useMemo(
    () => state.teams.find((t: any) => (t.id ?? t.tid) === state.userTeamId),
    [state.teams, state.userTeamId],
  );

  const expiredSlots = useMemo(() => {
    const s = (userTeam as any)?.tycoon?.sponsorships;
    if (!s) return [] as Array<'kit' | 'sleeve' | 'stadium'>;
    return (['kit', 'sleeve', 'stadium'] as const).filter(k => s[k] === null);
  }, [userTeam]);

  const rolloverDate = useMemo(() => {
    if (!isEuroIsolatedMode(state as any)) return null;
    try {
      return toISODateString(getRolloverDate(state.leagueStats.year, state.leagueStats as any, state.schedule as any));
    } catch {
      return null;
    }
  }, [state]);

  const attempt = (fn: () => void | Promise<void>, targetDate?: string) => {
    // Fast-path: no gate needed
    if (!isEuroIsolatedMode(state as any)) { void fn(); return true; }
    if (expiredSlots.length === 0) { void fn(); return true; }
    if (!rolloverDate || !targetDate) { void fn(); return true; }
    // Only block if this advance would cross year-end
    if (targetDate < rolloverDate) { void fn(); return true; }
    // Acknowledge-once: don't re-block for the same year after user proceeded
    if (acknowledgedYearRef.current === state.leagueStats.year) { void fn(); return true; }

    pendingRef.current = fn;
    setOpen(true);
    return false;
  };

  const handleProceed = () => {
    acknowledgedYearRef.current = state.leagueStats.year;
    setOpen(false);
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) void pending();
  };

  const handleNegotiate = () => {
    setOpen(false);
    setNegotiateOpen(true);
  };

  const handleNegotiateClose = () => {
    setNegotiateOpen(false);
    // After negotiating, re-check: if slots are now all resolved, advance.
    // If user closed without resolving all, leave them on PlayButton — they
    // can press again and the gate will re-evaluate.
    const s = (userTeam as any)?.tycoon?.sponsorships;
    const stillExpired = s
      ? (['kit', 'sleeve', 'stadium'] as const).some(k => s[k] === null)
      : false;
    if (!stillExpired) {
      acknowledgedYearRef.current = state.leagueStats.year;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) void pending();
    }
  };

  const currency = state.leagueStats?.currency ?? 'EUR';
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  const tierBaseSum = (() => {
    const t = (userTeam as any)?.tycoon;
    if (!t) return 0;
    // approximate the fallback hit: sum of 50% of tier floors per expired slot
    // — UI estimate only, not used in any calc.
    // Hard-coded tier floors per spec to avoid pulling spec into the hook.
    const FLOORS: Record<string, number> = { S: 3_000_000, A: 1_000_000, B: 400_000, C: 200_000, D: 100_000 };
    return (FLOORS[t.tier] ?? 0) * 0.5 * expiredSlots.length;
  })();

  const modal = (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-lg w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={20} className="text-amber-400" />
              <h2 className="text-lg font-black uppercase tracking-widest text-white">Year-End Approaching</h2>
            </div>
            <p className="text-sm text-slate-300 mb-2">
              {expiredSlots.length} sponsorship slot{expiredSlots.length === 1 ? '' : 's'} expired
              {' — '}
              <strong className="text-amber-300">{expiredSlots.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')}</strong>.
            </p>
            <p className="text-sm text-slate-400 mb-4">
              If you continue past year-end without negotiating, each slot falls back to a default sponsor worth ~50% of your tier floor
              {tierBaseSum > 0 ? ` (~${fmt(tierBaseSum)}/yr revenue floor)` : ''}.
              You can still negotiate later but this season's ledger will already be lower.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleNegotiate}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase tracking-widest py-2.5 rounded-xl text-xs"
              >
                Open Negotiations
              </button>
              <button
                onClick={handleProceed}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black uppercase tracking-widest py-2.5 rounded-xl text-xs border border-slate-700"
              >
                Proceed Anyway
              </button>
            </div>
          </div>
        </div>
      )}
      <SponsorshipNegotiationModal open={negotiateOpen} onClose={handleNegotiateClose} />
    </>
  );

  return { attempt, modal, isBlocked: expiredSlots.length > 0 };
}
