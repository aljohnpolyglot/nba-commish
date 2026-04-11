/**
 * DraftSimulatorView.tsx
 * Mock draft simulator connected to game state.
 * Uses real game prospects + real team draft order (worst record → #1 pick).
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Play, Pause, CheckCircle, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { convertTo2KRating, normalizeDate } from '../../utils/helpers';
import { PlayerBioView } from '../central/view/PlayerBioView';
import type { NBAPlayer } from '../../types';

// Rookie contract scale by pick slot (slot 1 = 120% of max rookie, slot 60 = min contract)
// NBA rookie scale: first 13 picks have fixed amounts; rest scale down linearly
const getRookieContractAmount = (pickSlot: number): number => {
  // Approximate NBA rookie scale in millions (round 1 scaled amounts)
  const r1Scale = [
    10.1, 9.5, 9.0, 8.5, 7.9, 7.4, 6.9, 6.5, 6.1, 5.7,
    5.4, 5.1, 4.8, 4.5, 4.3, 4.1, 3.9, 3.7, 3.6, 3.4,
    3.3, 3.2, 3.1, 3.0, 2.9, 2.8, 2.7, 2.6, 2.5, 2.4,
  ];
  if (pickSlot <= 30) return (r1Scale[pickSlot - 1] ?? 2.4) * 1_000_000;
  // Round 2: scale from $1.8M (pick 31) down to $1.27M (pick 60)
  const r2Fraction = (pickSlot - 31) / 29;
  return Math.round((1_800_000 - r2Fraction * 530_000) / 1000) * 1000;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getOrdinalSuffix = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};

const POSITIONS = ['ALL', 'PG', 'SG', 'SF', 'PF', 'C'];

// ─── Component ────────────────────────────────────────────────────────────────

interface DraftSimulatorViewProps {
  onViewChange?: (view: string) => void;
}

export const DraftSimulatorView: React.FC<DraftSimulatorViewProps> = ({ onViewChange }) => {
  const { state, dispatch } = useGame();

  // Build 60-pick draft order: worst-to-best for R1, then R2
  const draftOrder = useMemo(() => {
    const sorted = [...state.teams]
      .filter(t => t.id > 0)
      .sort((a, b) => {
        const wa = a.wins / Math.max(1, a.wins + a.losses);
        const wb = b.wins / Math.max(1, b.wins + b.losses);
        return wa - wb;
      });
    return [
      ...sorted,
      ...sorted.map(t => ({ ...t, _r2: true })),
    ] as any[];
  }, [state.teams]);

  const EXTERNAL_STATUSES = new Set(['Retired', 'WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa']);

  // POT estimator (BBGM formula) — same as used in PlayerRatingsModal
  const estimatePot = (rawOvr: number, hgt: number, tp: number | undefined, age: number): number => {
    if (age >= 29) return convertTo2KRating(rawOvr, hgt, tp);
    const potBbgm = Math.max(rawOvr, 72.31428908571982 + (-2.33062761 * age) + (0.83308748 * rawOvr));
    return convertTo2KRating(potBbgm, hgt, tp);
  };

  // All available draft years (from players who have draft.year set and are on NBA teams)
  const nbaTids = useMemo(() => new Set(state.teams.map(t => t.id)), [state.teams]);
  const availableDraftYears = useMemo(() => {
    const years = new Set<number>();
    for (const p of state.players) {
      const d = (p as any).draft;
      if (d?.year && nbaTids.has(p.tid) && !EXTERNAL_STATUSES.has(p.status ?? '')) {
        years.add(Number(d.year));
      }
    }
    return Array.from(years).sort((a, b) => b - a); // newest first
  }, [state.players, nbaTids]);

  const defaultViewYear = availableDraftYears[0] ?? (state.leagueStats?.year ?? 2026) - 1;
  const [viewDraftYear, setViewDraftYear] = useState<number>(defaultViewYear);

  // Sync viewDraftYear when availableDraftYears changes (new save loaded)
  useEffect(() => {
    if (availableDraftYears.length > 0 && !availableDraftYears.includes(viewDraftYear)) {
      setViewDraftYear(availableDraftYears[0]);
    }
  }, [availableDraftYears]);

  const latestDraftClass = useMemo(() => {
    const candidates = state.players.filter(p => {
      const d = (p as any).draft;
      if (!d?.year || Number(d.year) !== viewDraftYear) return false;
      if (EXTERNAL_STATUSES.has(p.status ?? '')) return false;
      if (!nbaTids.has(p.tid)) return false;
      return true;
    });

    // Deduplicate by pick slot (keep highest OVR if collision)
    const bySlot = new Map<number, any>();
    for (const p of candidates) {
      const d = (p as any).draft;
      const slot = (d.round === 1 ? 0 : 30) + (d.pick ?? 0);
      const existing = bySlot.get(slot);
      if (!existing || (p.overallRating ?? 0) > (existing.overallRating ?? 0)) {
        bySlot.set(slot, p);
      }
    }

    return Array.from(bySlot.entries())
      .sort(([a], [b]) => a - b)
      .map(([slot, p]) => {
        // Use ratings from the draft year if available, otherwise current
        const draftRatings = p.ratings?.find((r: any) => r.season === viewDraftYear) ?? p.ratings?.[0] ?? {};
        const currentRatings = p.ratings?.[p.ratings.length - 1] ?? {};
        const hgt = currentRatings.hgt ?? 50; // height doesn't change
        const tp = draftRatings.tp;
        const rawOvr = draftRatings.ovr ?? p.overallRating ?? 0;
        const draftAge = typeof p.age === 'number' ? p.age - ((state.leagueStats?.year ?? 2026) - viewDraftYear) : 20;
        return {
          ...p,
          _slot: slot,
          displayOvr: convertTo2KRating(rawOvr, hgt, tp),
          displayPot: estimatePot(rawOvr, hgt, tp, Math.max(18, draftAge)),
        };
      });
  }, [state.players, viewDraftYear, nbaTids, state.leagueStats?.year]);

  const mostRecentDraftYear = viewDraftYear;

  // ─── Date gating ──────────────────────────────────────────────────────────
  const leagueYear = state.leagueStats?.year ?? 2026;
  const draftDate = `${leagueYear}-06-25`;
  const today = normalizeDate(state.date);
  const isDraftTime = today >= draftDate;
  // draftComplete is stored as a top-level state field via UPDATE_STATE dispatch
  const isDraftDone = !!(state as any).draftComplete;

  // Draft board: undrafted prospects for the CURRENT season's draft class only
  // (BBGM data includes future classes 2027/2028 — filter to leagueYear only)
  const allProspects = useMemo(() => {
    return state.players
      .filter(p => {
        const isProspect = p.tid === -2 || p.status === 'Prospect' || p.status === 'Draft Prospect';
        if (!isProspect) return false;
        if (EXTERNAL_STATUSES.has(p.status ?? '')) return false;
        // Only current year's draft class (or prospects without a year set)
        const draftYear = (p as any).draft?.year;
        if (draftYear && Number(draftYear) !== leagueYear) return false;
        return true;
      })
      .map(p => {
        const lastRatings = p.ratings?.[p.ratings.length - 1] ?? {};
        const hgt = lastRatings.hgt ?? 50;
        const tp = lastRatings.tp;
        const rawOvr = p.overallRating || lastRatings.ovr || 0;
        const age = p.age ?? 20;
        const displayOvr = convertTo2KRating(rawOvr, hgt, tp);
        const displayPot = estimatePot(rawOvr, hgt, tp, age);
        const gp = (p.stats ?? []).reduce((s: number, r: any) => s + (r.gp ?? 0), 0);
        const pts = (p.stats ?? []).reduce((s: number, r: any) => s + (r.pts ?? 0), 0);
        const trb = (p.stats ?? []).reduce((s: number, r: any) => s + (r.trb ?? (r.orb ?? 0) + (r.drb ?? 0)), 0);
        const ast = (p.stats ?? []).reduce((s: number, r: any) => s + (r.ast ?? 0), 0);
        return {
          ...p,
          displayOvr,
          displayPot,
          ppg: gp > 0 ? (pts / gp).toFixed(1) : '—',
          rpg: gp > 0 ? (trb / gp).toFixed(1) : '—',
          apg: gp > 0 ? (ast / gp).toFixed(1) : '—',
          pos: p.pos ?? lastRatings.pos ?? 'F',
        };
      })
      .sort((a, b) => b.displayOvr - a.displayOvr);
  }, [state.players, state.leagueStats?.year]);

  const [viewingBioPlayer, setViewingBioPlayer] = useState<NBAPlayer | null>(null);
  const [currentPick, setCurrentPick] = useState(1);
  const [drafted, setDrafted] = useState<Record<number, any>>({});
  const [posFilter, setPosFilter] = useState('ALL');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSpeed, setSimSpeed] = useState('normal');
  const [hasStarted, setHasStarted] = useState(false);
  const [modalPlayer, setModalPlayer] = useState<any>(null);
  const [modalMode, setModalMode] = useState<'draft' | 'scouting' | 'review'>('draft');
  const [reviewPick, setReviewPick] = useState<number | null>(null);

  const draftedSet = useMemo(() => new Set(Object.values(drafted).map((p: any) => p.internalId)), [drafted]);

  const available = useMemo(() =>
    allProspects
      .filter(p => !draftedSet.has(p.internalId))
      .filter(p => posFilter === 'ALL' || (p.pos ?? '').includes(posFilter))
  , [allProspects, draftedSet, posFilter]);

  const teamOnClock = draftOrder[currentPick - 1];
  const nextTeam = draftOrder[currentPick];
  const isDraftComplete = currentPick > draftOrder.length;

  const draftPlayer = useCallback((player: any, auto = false) => {
    setHasStarted(true);
    if (auto) {
      setDrafted(prev => ({ ...prev, [currentPick]: player }));
      setCurrentPick(prev => prev + 1);
    } else {
      setModalPlayer(player);
      setModalMode('draft');
    }
  }, [currentPick]);

  // Auto-sim loop
  useEffect(() => {
    if (!isSimulating || isDraftComplete || modalPlayer) return;
    const speedMs: Record<string, number> = { fastest: 200, normal: 800, slow: 1500, slower: 3000, dramatic: 5000 };
    const timer = setTimeout(() => {
      const top = available[0];
      if (top) draftPlayer(top, true);
    }, speedMs[simSpeed] ?? 800);
    return () => clearTimeout(timer);
  }, [isSimulating, currentPick, available, simSpeed, isDraftComplete, modalPlayer, draftPlayer]);

  const confirmPick = () => {
    if (modalMode === 'scouting' || modalMode === 'review') {
      setModalPlayer(null);
      return;
    }
    if (modalPlayer) {
      setDrafted(prev => ({ ...prev, [currentPick]: modalPlayer }));
      setCurrentPick(prev => prev + 1);
      setModalPlayer(null);
    }
  };

  // Commit all draft picks to game state
  const [draftFinalized, setDraftFinalized] = useState(false);
  const finalizeDraft = () => {
    const season = state.leagueStats?.year ?? 2026;
    const rookieScaleType = state.leagueStats?.rookieScaleType ?? 'dynamic';
    const rookieContractYrs = state.leagueStats?.rookieContractLength ?? 4;
    const staticRookieAmt = (state.leagueStats?.rookieScaleStaticAmount ?? 3) * 1_000_000;

    const updatedPlayers = state.players.map(p => {
      // Find if this player was drafted
      const pickEntry = Object.entries(drafted).find(([, pl]: [string, any]) => pl.internalId === p.internalId);
      if (!pickEntry) return p;

      const pickSlot = parseInt(pickEntry[0]);
      const team = draftOrder[pickSlot - 1];
      if (!team) return p;

      const round = pickSlot <= 30 ? 1 : 2;
      const pickInRound = pickSlot <= 30 ? pickSlot : pickSlot - 30;
      const salaryAmount = rookieScaleType === 'static'
        ? staticRookieAmt
        : getRookieContractAmount(pickSlot);

      // Contract length: user setting for R1 (default 4yr), R2 always 2yr
      const contractYrs = round === 1 ? rookieContractYrs : 2;

      return {
        ...p,
        tid: team.id,
        status: 'Active' as const,
        draft: { round, pick: pickInRound, year: season, tid: team.id, originalTid: team.id },
        contract: {
          amount: salaryAmount / 1_000_000,
          exp: season + contractYrs - 1,
          salaryDetails: [{ season, amount: salaryAmount }],
        },
      };
    });

    // Undrafted current-year prospects → free agents (future classes stay as prospects)
    const draftedIds = new Set(Object.values(drafted).map((pl: any) => pl.internalId));
    const finalPlayers = updatedPlayers.map(p => {
      const draftYear = (p as any).draft?.year;
      const isCurrentClass = !draftYear || Number(draftYear) === season;
      if (isCurrentClass && (p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect') && !draftedIds.has(p.internalId)) {
        return { ...p, tid: -1, status: 'Free Agent' as const };
      }
      return p;
    });

    dispatch({
      type: 'UPDATE_STATE',
      payload: {
        players: finalPlayers,
        draftComplete: true,
      },
    } as any);
    setDraftFinalized(true);
  };

  if (viewingBioPlayer) {
    return (
      <PlayerBioView
        player={viewingBioPlayer}
        onBack={() => setViewingBioPlayer(null)}
      />
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">

      {/* PREVIOUS DRAFT RESULTS — shown when no active draft in progress */}
      {latestDraftClass.length > 0 && !hasStarted && (!isDraftTime || isDraftDone) && (
        <div className="mb-8">
          <div className="border-b border-[#333] pb-2 mb-4 flex items-center justify-between">
            <h4 className="text-xl font-black text-white uppercase tracking-tight">{mostRecentDraftYear} NBA Draft Results</h4>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-white/30 uppercase">{latestDraftClass.length} picks</span>
              {availableDraftYears.length > 1 && (
                <div className="flex items-center gap-1 bg-black/40 border border-[#333] rounded-md p-0.5">
                  <button
                    onClick={() => {
                      const idx = availableDraftYears.indexOf(viewDraftYear);
                      if (idx < availableDraftYears.length - 1) setViewDraftYear(availableDraftYears[idx + 1]);
                    }}
                    disabled={availableDraftYears.indexOf(viewDraftYear) === availableDraftYears.length - 1}
                    className="p-1 text-white/50 hover:text-white disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-[10px] font-black text-white/60 px-1">{viewDraftYear}</span>
                  <button
                    onClick={() => {
                      const idx = availableDraftYears.indexOf(viewDraftYear);
                      if (idx > 0) setViewDraftYear(availableDraftYears[idx - 1]);
                    }}
                    disabled={availableDraftYears.indexOf(viewDraftYear) === 0}
                    className="p-1 text-white/50 hover:text-white disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {latestDraftClass.map((player: any) => {
              // draft.tid = the team that made the pick (not original owner)
              const team = state.teams.find(t => t.id === player.draft?.tid);
              return (
                <div
                  key={player.internalId}
                  onClick={() => setViewingBioPlayer(player as NBAPlayer)}
                  className="bg-[#1A1A1A] border border-[#333] rounded-sm flex h-16 overflow-hidden cursor-pointer hover:border-indigo-600/50 transition-colors"
                >
                  <div className="w-10 bg-indigo-900/60 flex items-center justify-center shrink-0">
                    <span className="text-base font-black text-white">{String(player._slot).padStart(2, '0')}</span>
                  </div>
                  <div className="w-16 bg-[#111] relative shrink-0 overflow-hidden">
                    {player.imgURL ? (
                      <img src={player.imgURL} alt={player.name} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-lg font-black text-indigo-900">
                        {player.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 p-2 flex flex-col justify-center min-w-0">
                    <p className="font-black text-white text-sm truncate uppercase tracking-tight">{player.name}</p>
                    <div className="text-[10px] font-bold text-white/40 uppercase">
                      {player.pos} · OVR {player.displayOvr} | POT {player.displayPot} · {player.draft?.round === 1 ? 'R1' : 'R2'} #{player.draft?.pick}
                    </div>
                  </div>
                  <div className="w-12 flex items-center justify-center shrink-0 border-l border-[#333] bg-black/20">
                    {team?.logoUrl ? (
                      <img src={team.logoUrl} alt="" className="w-8 h-8 object-contain" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="text-[10px] font-black text-white/30">{team?.abbrev}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PRE-DRAFT banner — visible before draft day */}
      {!isDraftTime && !isDraftDone && (
        <div className="mb-6 bg-[#111] border border-yellow-700/40 rounded-sm p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Calendar size={18} className="text-yellow-400 shrink-0" />
            <div>
              <p className="text-yellow-300 font-black text-sm uppercase tracking-tight">Draft Day is June 25, {leagueYear}</p>
              <p className="text-white/40 text-xs font-medium mt-0.5">The draft board unlocks on draft day. Prospects below are for scouting only.</p>
            </div>
          </div>
          {onViewChange && (
            <button
              onClick={() => onViewChange('Draft Scouting')}
              className="shrink-0 text-[10px] font-black uppercase tracking-widest text-yellow-400/70 hover:text-yellow-300 border border-yellow-700/40 hover:border-yellow-600/60 px-3 py-1.5 rounded-sm transition-colors whitespace-nowrap"
            >
              Full Scouting Report →
            </button>
          )}
        </div>
      )}

      {/* DRAFT COMPLETE banner */}
      {isDraftDone && !hasStarted && (
        <div className="mb-6 bg-[#111] border border-emerald-700/40 rounded-sm p-4 flex items-center gap-3">
          <CheckCircle size={18} className="text-emerald-400 shrink-0" />
          <div>
            <p className="text-emerald-300 font-black text-sm uppercase tracking-tight">{leagueYear} NBA Draft Complete</p>
            <p className="text-white/40 text-xs font-medium mt-0.5">Draft results have been committed to the game state. See the results above.</p>
          </div>
        </div>
      )}

      {/* INTERACTIVE DRAFT BOARD — only shown on/after draft day and draft not yet committed */}
      {isDraftTime && !isDraftDone && (
      <div className="grid lg:grid-cols-[1fr_320px] gap-6">

        {/* LEFT COLUMN */}
        <div className="space-y-5">

          {/* ON THE CLOCK */}
          <div className="bg-[#1A1A1A] rounded-sm p-5 border border-[#333]">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={16} className="text-white/60" />
              <span className="text-sm font-black uppercase tracking-widest text-white">On The Clock</span>
            </div>

            {isDraftComplete && hasStarted ? (
              <div className="flex flex-col gap-3">
                <p className="text-white font-black text-lg uppercase tracking-tight">Draft Complete</p>
                {!draftFinalized ? (
                  <button
                    onClick={finalizeDraft}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white font-black uppercase text-xs rounded-sm transition-colors w-fit"
                  >
                    <CheckCircle size={14} /> Commit Picks to Game State
                  </button>
                ) : (
                  <p className="text-emerald-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
                    <CheckCircle size={13} /> Draft results committed to game state
                  </p>
                )}
              </div>
            ) : !isDraftComplete && teamOnClock ? (
              <div className="flex items-center gap-4">
                {teamOnClock.logoUrl ? (
                  <img src={teamOnClock.logoUrl} alt={teamOnClock.name} className="w-14 h-14 object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-indigo-900/40 flex items-center justify-center font-black text-indigo-300">{teamOnClock.abbrev}</div>
                )}
                <p className="text-white/70 text-sm leading-relaxed">
                  With the <strong className="text-white">{currentPick}{getOrdinalSuffix(currentPick)}</strong> pick in the {state.leagueStats?.year ?? ''} NBA draft,
                  the <strong className="text-white">{teamOnClock.name}</strong> select…
                </p>
              </div>
            ) : (
              <p className="text-white/60 font-bold uppercase text-sm tracking-widest">Draft Complete</p>
            )}

            {/* Controls */}
            <div className="flex justify-end mt-4 gap-3 items-center">
              <div className="flex items-center gap-1 bg-black/40 p-1 rounded-md border border-[#333]">
                <button
                  onClick={() => { setIsSimulating(v => !v); setHasStarted(true); }}
                  disabled={isDraftComplete}
                  className={`h-8 px-3 text-xs font-black uppercase rounded-sm transition-all flex items-center gap-1.5 ${
                    isSimulating ? 'text-indigo-400 bg-indigo-500/10' : 'text-white/50 hover:text-white'
                  }`}
                >
                  {isSimulating ? <><Pause size={11} className="fill-current" /> Pause</> : <><Play size={11} className="fill-current" /> Auto Sim</>}
                </button>
                <div className="h-4 w-px bg-zinc-700 mx-1" />
                <select
                  value={simSpeed}
                  onChange={e => setSimSpeed(e.target.value)}
                  className="bg-transparent text-[10px] font-black uppercase text-white/50 border-none outline-none cursor-pointer"
                >
                  {['fastest', 'normal', 'slow', 'slower', 'dramatic'].map(s => (
                    <option key={s} value={s} className="bg-zinc-900">{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* AVAILABLE PLAYERS */}
          <div className="bg-[#1A1A1A] rounded-sm border border-[#333] overflow-hidden">
            <div className="p-3 border-b border-[#333] flex items-center justify-between">
              <span className="font-black text-white text-sm">Available Players</span>
              <div className="flex bg-black/40 rounded-md p-0.5 border border-[#333]">
                {POSITIONS.map(pos => (
                  <button
                    key={pos}
                    onClick={() => setPosFilter(pos)}
                    className={`px-2.5 py-1 text-[10px] font-black rounded-sm transition-colors ${
                      posFilter === pos ? 'bg-indigo-600 text-white' : 'text-white/40 hover:text-white'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            <div>
              {available.length === 0 ? (
                <p className="text-center text-zinc-600 font-bold text-xs uppercase py-8">No players available</p>
              ) : (
                available.map((player, i) => (
                  <div
                    key={player.internalId}
                    onClick={() => { setModalPlayer(player); setModalMode('scouting'); }}
                    className="flex items-center p-2.5 border-b border-[#333] hover:bg-white/5 transition-colors cursor-pointer group"
                  >
                    {/* Rank */}
                    <div className="w-10 h-10 bg-black/40 rounded-sm font-black text-lg text-white/40 mr-3 shrink-0 flex items-center justify-center">
                      {String(i + 1).padStart(2, '0')}
                    </div>

                    {/* Photo */}
                    <div className="w-10 h-10 rounded-full bg-black/40 mr-3 shrink-0 border border-zinc-800 overflow-hidden">
                      {player.imgURL ? (
                        <img src={player.imgURL} alt={player.name} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-zinc-500">
                          {player.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-white text-base leading-tight truncate">{player.name}</p>
                      <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1 flex-wrap">
                        <span>{player.pos}</span>
                        <span className="w-1 h-1 bg-white/20 rounded-full" />
                        <span className="text-indigo-300">OVR {player.displayOvr}</span>
                        <span className="w-1 h-1 bg-white/20 rounded-full" />
                        <span className="text-emerald-400/70">POT {player.displayPot}</span>
                        {(player as any).college && (
                          <>
                            <span className="w-1 h-1 bg-white/20 rounded-full" />
                            <span className="text-white/50">{(player as any).college}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Draft button */}
                    <button
                      onClick={e => { e.stopPropagation(); draftPlayer(player); }}
                      disabled={isDraftComplete}
                      className="ml-3 bg-indigo-800 hover:bg-indigo-600 text-white font-black text-[10px] h-6 px-4 rounded-sm transition-colors uppercase disabled:opacity-30"
                    >
                      Draft
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-5">

          {/* NEXT UP */}
          {nextTeam && !isDraftComplete && (
            <div className="bg-[#1A1A1A] rounded-sm p-3 border border-[#333] flex justify-between items-center">
              <div>
                <div className="text-[9px] font-black uppercase text-white/40">Next Up — Pick {currentPick + 1}</div>
                <div className="font-black text-white text-sm">{nextTeam.name}</div>
              </div>
              {nextTeam.logoUrl && (
                <img src={nextTeam.logoUrl} alt={nextTeam.name} className="w-10 h-10 object-contain" referrerPolicy="no-referrer" />
              )}
            </div>
          )}

          {/* STATS LEGEND */}
          <div className="bg-[#1A1A1A] rounded-sm border border-[#333] p-4">
            <div className="text-[9px] font-black uppercase text-indigo-400 tracking-widest mb-3">Top Prospects by OVR</div>
            {allProspects.slice(0, 10).map((p, i) => (
              <div key={p.internalId} className={`flex items-center gap-2 py-1 ${draftedSet.has(p.internalId) ? 'opacity-30 line-through' : ''}`}>
                <span className="text-[10px] font-black text-white/30 w-5">{i + 1}</span>
                <span className="text-xs font-bold text-white truncate flex-1">{p.name}</span>
                <span className="text-[10px] font-black text-indigo-300">{p.displayOvr}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      )} {/* end isDraftTime && !isDraftDone */}

      {/* PRE-DRAFT: Top prospects scouting panel (always visible when draft not yet done) */}
      {!isDraftTime && !isDraftDone && allProspects.length > 0 && (
        <div className="bg-[#1A1A1A] rounded-sm border border-[#333] overflow-hidden">
          <div className="p-3 border-b border-[#333]">
            <span className="font-black text-white text-sm">Top Prospects by OVR — {leagueYear} Draft Class</span>
            <p className="text-[10px] text-white/30 font-medium mt-0.5">Available for drafting on June 25, {leagueYear}. Ratings may improve before draft day.</p>
          </div>
          <div>
            {allProspects.map((player, i) => (
              <div
                key={player.internalId}
                onClick={() => setViewingBioPlayer(player as NBAPlayer)}
                className="flex items-center p-2.5 border-b border-[#333] hover:bg-white/5 transition-colors cursor-pointer group"
              >
                <div className="w-8 h-8 bg-black/40 rounded-sm font-black text-base text-white/30 mr-3 shrink-0 flex items-center justify-center">{i + 1}</div>
                <div className="w-9 h-9 rounded-full bg-black/40 mr-3 shrink-0 border border-zinc-800 overflow-hidden">
                  {player.imgURL ? (
                    <img src={player.imgURL} alt={player.name} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-zinc-500">
                      {player.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-white text-sm leading-tight truncate">{player.name}</p>
                  <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1 flex-wrap">
                    <span>{player.pos}</span>
                    <span className="w-1 h-1 bg-white/20 rounded-full" />
                    <span className="text-indigo-300">OVR {player.displayOvr}</span>
                    <span className="w-1 h-1 bg-white/20 rounded-full" />
                    <span className="text-emerald-400/70">POT {player.displayPot}</span>
                    {(player as any).college && <><span className="w-1 h-1 bg-white/20 rounded-full" /><span className="text-white/50">{(player as any).college}</span></>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PICK MODAL */}
      <AnimatePresence>
        {modalPlayer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#1A1A1A] border border-[#333] rounded-md shadow-2xl w-full max-w-lg overflow-hidden"
            >
              {/* Modal header */}
              <div className="p-4 border-b border-indigo-800 flex justify-between items-center bg-black/40">
                <div className="flex items-center gap-3">
                  {teamOnClock?.logoUrl && (
                    <img src={teamOnClock.logoUrl} alt="" className="w-7 h-7 object-contain" referrerPolicy="no-referrer" />
                  )}
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">
                    {modalMode === 'draft' ? 'Confirm Pick' : modalMode === 'scouting' ? 'Scouting Report' : `Pick #${reviewPick}`}
                  </h3>
                </div>
                <span className="text-[10px] font-black text-white/30 uppercase">{state.leagueStats?.year} NBA Draft</span>
              </div>

              {/* Modal body */}
              <div className="p-6 flex gap-6 items-start">
                {/* Player photo */}
                <div className="w-24 h-24 rounded-full bg-black/40 border-2 border-[#333] overflow-hidden shrink-0">
                  {modalPlayer.imgURL ? (
                    <img src={modalPlayer.imgURL} alt={modalPlayer.name} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-black text-indigo-300">
                      {modalPlayer.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                  )}
                </div>

                {/* Player info */}
                <div className="flex-1 min-w-0">
                  {modalMode !== 'scouting' && (
                    <div className="inline-block bg-indigo-600 text-white text-[10px] font-black px-2 py-0.5 rounded-sm mb-1 uppercase">
                      Pick #{modalMode === 'draft' ? currentPick : reviewPick}
                    </div>
                  )}
                  <h4 className="text-2xl font-black text-white tracking-tight truncate">{modalPlayer.name}</h4>
                  <div className="flex flex-wrap gap-2 text-[11px] text-white/50 font-bold uppercase mt-1">
                    <span>{modalPlayer.pos}</span>
                    <span>·</span>
                    <span className="text-indigo-300">OVR {modalPlayer.displayOvr}</span>
                    <span>·</span>
                    <span className="text-emerald-400">POT {modalPlayer.displayPot}</span>
                    {modalPlayer.college && <><span>·</span><span>{modalPlayer.college}</span></>}
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-4 bg-black/20 p-3 rounded-sm border border-[#333]">
                    {[
                      { label: 'PPG', value: modalPlayer.ppg },
                      { label: 'RPG', value: modalPlayer.rpg },
                      { label: 'APG', value: modalPlayer.apg },
                    ].map(stat => (
                      <div key={stat.label} className="text-center">
                        <div className="text-[9px] text-white/30 uppercase font-black">{stat.label}</div>
                        <div className="text-base font-black text-white">{stat.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal footer */}
              <div className="p-3 bg-[#111] border-t border-[#333] flex justify-end gap-2">
                <button
                  onClick={() => setModalPlayer(null)}
                  className="text-white/40 hover:text-white border border-zinc-700 font-black uppercase text-[10px] h-8 px-5 rounded-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmPick}
                  className="bg-indigo-700 hover:bg-indigo-600 text-white font-black uppercase text-[10px] h-8 px-6 rounded-sm transition-colors"
                >
                  {modalMode === 'draft' ? 'Confirm Pick' : 'Close'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FULL DRAFT TABLE */}
      {hasStarted && Object.keys(drafted).length > 0 && (
        <div className="mt-10 space-y-5">
          <div className="border-b border-[#333] pb-2">
            <h4 className="text-xl font-black text-white uppercase tracking-tight">Full Draft</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(drafted)
              .sort(([a], [b]) => parseInt(a) - parseInt(b))
              .map(([pick, player]: [string, any]) => {
                const team = draftOrder[parseInt(pick) - 1];
                return (
                  <div
                    key={pick}
                    onClick={() => { setModalPlayer(player); setReviewPick(parseInt(pick)); setModalMode('review'); }}
                    className="bg-[#1A1A1A] border border-[#333] rounded-sm flex h-20 overflow-hidden hover:border-indigo-600 transition-colors cursor-pointer group"
                  >
                    {/* Pick # */}
                    <div className="w-11 bg-indigo-900/60 flex items-center justify-center shrink-0">
                      <span className="text-xl font-black text-white">{pick.padStart(2, '0')}</span>
                    </div>

                    {/* Player photo */}
                    <div className="w-20 bg-[#111] relative shrink-0 overflow-hidden">
                      {player.imgURL ? (
                        <img src={player.imgURL} alt={player.name} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl font-black text-indigo-900">
                          {player.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </div>
                      )}
                    </div>

                    {/* Player info */}
                    <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
                      <p className="font-black text-white text-base truncate uppercase tracking-tight">{player.name}</p>
                      <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        {player.pos} · OVR {player.displayOvr}
                        {(player as any).college && ` · ${(player as any).college}`}
                      </div>
                    </div>

                    {/* Team logo */}
                    <div className="w-14 flex items-center justify-center shrink-0 border-l border-[#333] bg-black/20 group-hover:bg-black/40 transition-colors">
                      {team?.logoUrl ? (
                        <img src={team.logoUrl} alt="" className="w-9 h-9 object-contain" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="text-[10px] font-black text-white/30">{team?.abbrev}</span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};
