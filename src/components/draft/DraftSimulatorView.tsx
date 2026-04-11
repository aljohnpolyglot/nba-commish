/**
 * DraftSimulatorView.tsx
 * Mock draft simulator connected to game state.
 * Uses real game prospects + real team draft order (worst record → #1 pick).
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Play, Pause } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { convertTo2KRating } from '../../utils/helpers';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getOrdinalSuffix = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};

const POSITIONS = ['ALL', 'PG', 'SG', 'SF', 'PF', 'C'];

// ─── Component ────────────────────────────────────────────────────────────────

export const DraftSimulatorView: React.FC = () => {
  const { state } = useGame();

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

  // Draft board: prospects sorted by display OVR
  const allProspects = useMemo(() => {
    return state.players
      .filter(p => p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect')
      .map(p => {
        const displayOvr = convertTo2KRating(
          p.overallRating || p.ratings?.[0]?.ovr || 0,
          p.ratings?.[p.ratings.length - 1]?.hgt ?? 50,
          p.ratings?.[p.ratings.length - 1]?.tp,
        );
        const lastRatings = p.ratings?.[p.ratings.length - 1] ?? {};
        const gp = (p.stats ?? []).reduce((s: number, r: any) => s + (r.gp ?? 0), 0);
        const pts = (p.stats ?? []).reduce((s: number, r: any) => s + (r.pts ?? 0), 0);
        const trb = (p.stats ?? []).reduce((s: number, r: any) => s + (r.trb ?? (r.orb ?? 0) + (r.drb ?? 0)), 0);
        const ast = (p.stats ?? []).reduce((s: number, r: any) => s + (r.ast ?? 0), 0);
        return {
          ...p,
          displayOvr,
          ppg: gp > 0 ? (pts / gp).toFixed(1) : '—',
          rpg: gp > 0 ? (trb / gp).toFixed(1) : '—',
          apg: gp > 0 ? (ast / gp).toFixed(1) : '—',
          pos: p.pos ?? lastRatings.pos ?? 'F',
        };
      })
      .sort((a, b) => b.displayOvr - a.displayOvr);
  }, [state.players]);

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

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="grid lg:grid-cols-[1fr_320px] gap-6">

        {/* LEFT COLUMN */}
        <div className="space-y-5">

          {/* ON THE CLOCK */}
          <div className="bg-[#1A1A1A] rounded-sm p-5 border border-[#333]">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={16} className="text-white/60" />
              <span className="text-sm font-black uppercase tracking-widest text-white">On The Clock</span>
            </div>

            {!isDraftComplete && teamOnClock ? (
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

            <div className="max-h-[550px] overflow-y-auto custom-scrollbar">
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
