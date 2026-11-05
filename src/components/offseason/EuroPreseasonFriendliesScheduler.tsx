import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, MapPin, Plus, Trash2, Trophy, X } from 'lucide-react';
import type { Game, GameState } from '../../types';
import {
  getEuroPreseasonFriendlyCandidates,
  getEuroPreseasonFriendlyGames,
  getEuroPreseasonFriendlyWindow,
  removeEuroPreseasonFriendly,
  scheduleEuroPreseasonFriendly,
  type EuroFriendlyVenue,
} from '../../services/euro/preseasonFriendlies';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { getTeamFullName } from '../../utils/teamNames';

type Props = {
  open: boolean;
  state: GameState;
  onScheduleChange: (schedule: Game[]) => void;
  onClose: () => void;
  onDone: () => void;
};

const readableDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export function EuroPreseasonFriendliesScheduler({ open, state, onScheduleChange, onClose, onDone }: Props) {
  const window = useMemo(() => getEuroPreseasonFriendlyWindow(state), [state]);
  const games = useMemo(() => getEuroPreseasonFriendlyGames(state), [state]);
  const candidates = useMemo(() => getEuroPreseasonFriendlyCandidates(state), [state]);
  const teamsByTid = useMemo(() => new Map(state.nonNBATeams.map(team => [team.tid, team])), [state.nonNBATeams]);
  const [date, setDate] = useState(window.startDate);
  const [opponentTid, setOpponentTid] = useState<number | null>(candidates[0]?.tid ?? null);
  const [venue, setVenue] = useState<EuroFriendlyVenue>('home');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDate(current => current >= window.startDate && current <= window.endDate ? current : window.startDate);
    setOpponentTid(current => candidates.some(team => team.tid === current) ? current : candidates[0]?.tid ?? null);
    setError('');
  }, [candidates, open, window.endDate, window.startDate]);

  if (!open) return null;

  const addFriendly = () => {
    if (opponentTid == null) return;
    try {
      const next = scheduleEuroPreseasonFriendly(state, { opponentTid, date, venue });
      onScheduleChange(next.schedule);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This friendly could not be scheduled.');
    }
  };

  const removeFriendly = (gid: number) => {
    onScheduleChange(removeEuroPreseasonFriendly(state, gid).schedule);
    setError('');
  };

  return createPortal(
    <div className="fixed inset-0 z-[125] flex items-center justify-center p-0 sm:p-4">
      <button type="button" aria-label="Close friendlies planner" className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="friendlies-planner-title"
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#07111f] shadow-[0_30px_100px_rgba(0,0,0,0.72)] sm:h-[min(92dvh,880px)] sm:max-w-4xl sm:rounded-2xl sm:border sm:border-slate-700/80"
      >
        <header className="shrink-0 border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.1),transparent_48%)] px-4 py-4 sm:px-7 sm:py-6">
          <div className="flex items-start gap-3 sm:gap-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
              <Trophy size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.26em] text-emerald-300">Preseason</p>
              <h2 id="friendlies-planner-title" className="mt-1 text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">Plan Club Friendlies</h2>
              <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-400 sm:text-sm">
                Invite European clubs for home or away tune-ups. These games do not affect standings, records, or season awards.
              </p>
            </div>
            <button type="button" aria-label="Close" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/10">
              <X size={21} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-7 sm:py-6">
          <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Date</span>
              <input
                aria-label="Friendly date"
                type="date"
                min={window.startDate}
                max={window.endDate}
                value={date}
                onChange={event => setDate(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm font-semibold text-white outline-none focus:border-emerald-400/60"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Opponent</span>
              <select
                aria-label="Friendly opponent"
                value={opponentTid ?? ''}
                onChange={event => setOpponentTid(Number(event.target.value))}
                className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm font-semibold text-white outline-none focus:border-emerald-400/60"
              >
                {candidates.length === 0 && <option value="">No eligible clubs available</option>}
                {candidates.map(team => <option key={team.tid} value={team.tid}>{getTeamFullName(team)}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={addFriendly}
              disabled={opponentTid == null || games.length >= window.limit}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-xs font-black uppercase tracking-wide text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              <Plus size={17} /> Add
            </button>
            <div className="flex gap-2 sm:col-span-3">
              {(['home', 'away'] as const).map(option => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={venue === option}
                  onClick={() => setVenue(option)}
                  className={`min-h-10 flex-1 rounded-xl border px-3 text-xs font-black uppercase tracking-wide ${venue === option ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/[0.025] text-slate-400 hover:bg-white/[0.05]'}`}
                >
                  {option === 'home' ? 'Home Game' : 'Away Game'}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-2"><CalendarDays size={14} /> {readableDate(window.startDate)} – {readableDate(window.endDate)}</span>
            <span>{games.length} / {window.limit} scheduled</span>
          </div>
          {error && <div role="alert" className="mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

          <div className="mt-5 space-y-2">
            {games.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">No friendlies scheduled yet. You may continue without adding one.</div>
            ) : games.map(game => {
              const opponentId = game.homeTid === state.userTeamId ? game.awayTid : game.homeTid;
              const opponent = teamsByTid.get(opponentId);
              const logo = opponent ? getResolvedTeamLogoUrl(opponent, state.leagueStats.year) : undefined;
              const isHome = game.homeTid === state.userTeamId;
              return (
                <div key={game.gid} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-950/50">
                    {logo ? <img src={logo} alt="" className="max-h-9 max-w-9 object-contain" referrerPolicy="no-referrer" /> : <span className="text-xs font-black text-slate-500">{opponent?.abbrev?.slice(0, 3) ?? 'CLB'}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-white">{opponent ? getTeamFullName(opponent) : `Club ${opponentId}`}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1"><CalendarDays size={13} />{readableDate(game.date)}</span>
                      <span className="inline-flex items-center gap-1"><MapPin size={13} />{isHome ? 'Home' : 'Away'}</span>
                    </div>
                  </div>
                  <button type="button" aria-label={`Remove friendly against ${opponent ? getTeamFullName(opponent) : `Club ${opponentId}`}`} onClick={() => removeFriendly(game.gid)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 text-slate-400 hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-300">
                    <Trash2 size={17} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <footer className="shrink-0 border-t border-white/10 bg-[#060e19] p-3 sm:flex sm:items-center sm:justify-between sm:px-7 sm:py-4">
          <p className="mb-3 text-center text-xs text-slate-500 sm:mb-0 sm:text-left">You can play or simulate these games from the main schedule.</p>
          <button type="button" onClick={onDone} className="min-h-12 w-full rounded-xl bg-emerald-500 px-6 text-sm font-black uppercase tracking-wide text-slate-950 hover:bg-emerald-400 sm:w-auto">
            {games.length === 0 ? 'Continue Without Friendlies' : 'Confirm Friendlies'}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
