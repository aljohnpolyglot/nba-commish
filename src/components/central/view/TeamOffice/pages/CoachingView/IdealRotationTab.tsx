/**
 * IdealRotationTab — the coach's "perfect world" rotation baseline.
 *
 * Shows every active roster player (INCLUDING injured, since the ideal is
 * injury-agnostic). The user sets starters + minutes once, locks it, and
 * lives there. When a trade/signing happens, the stored plan is reconciled
 * against the new roster: departing players' minutes redistribute to
 * survivors by existing share, and new additions slot in at 0 for manual
 * assignment.
 *
 * Persisted per-save via idealRotationStore. When unlocked, the UI shows
 * baseline values derived from roster ratings and does not persist edits —
 * unlocking is the "auto-pilot" state, locking is "I want my choices to
 * stick through roster churn".
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GripVertical, Pencil, RotateCcw, Sparkles } from 'lucide-react';
import { useGame } from '../../../../../../store/GameContext';
import { PlayerPortrait } from '../../../../../shared/PlayerPortrait';
import { StarterService } from '../../../../../../services/simulation/StarterService';
import { MinutesPlayedService } from '../../../../../../services/simulation/MinutesPlayedService';
import { effectiveRecord } from '../../../../../../utils/salaryUtils';
import { getDisplayOverall } from '../../../../../../utils/playerRatings';
import {
  getIdealRotation,
  saveIdealRotation,
  clearIdealRotation,
  reconcileIdealMinutes,
  reconcileStarters,
} from '../../../../../../store/idealRotationStore';
import type { NBAPlayer } from '../../../../../../types';

interface IdealRotationTabProps {
  teamId: number;
}

const STARTER_POS_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
const TARGET_MINUTES = 240;

/**
 * Baseline ideal rotation — defers to MinutesPlayedService so the ideal uses
 * the EXACT same depth/minutes logic as live games (standings, star MPG target,
 * durability caps, age adjustments). The only difference: we strip injury
 * fields so the service treats everyone as healthy. Result: "what would
 * Rotation look like if nobody was hurt?"
 */
function computeBaselineFromService(
  team: any,
  allPlayers: NBAPlayer[],
  roster: NBAPlayer[],
  season: number,
  ctx: { conferenceRank: number; gbFromLeader: number; gamesRemaining: number },
): { starterIds: string[]; minutes: Record<string, number> } {
  if (!roster.length || !team) return { starterIds: [], minutes: {} };

  // Clone each player, zero-out injury. The service's first step filters out
  // `p.injury?.gamesRemaining > 0` — stripping injury is what makes this the
  // "ideal / full-strength" rotation.
  const healthy: NBAPlayer[] = roster.map(p => ({
    ...(p as any),
    injury: undefined,
  })) as NBAPlayer[];

  const rot = MinutesPlayedService.getRotation(
    team, allPlayers, 0, season, healthy,
    ctx.conferenceRank, ctx.gbFromLeader, ctx.gamesRemaining,
  );
  const { minutes } = MinutesPlayedService.allocateMinutes(
    rot.players, season, 0, 0, rot.starMpgTarget, false,
  );

  const out: Record<string, number> = {};
  rot.players.forEach((p, i) => {
    out[p.internalId] = Math.max(0, Math.round(minutes[i] ?? 0));
  });

  // Absorb rounding drift into the biggest bucket so the total lands on 240.
  let sum = Object.values(out).reduce((a, b) => a + b, 0);
  const ids = Object.keys(out);
  if (sum !== TARGET_MINUTES && ids.length > 0) {
    const order = [...ids].sort((a, b) => out[b] - out[a]);
    let i = 0;
    let guard = order.length * 48;
    while (sum !== TARGET_MINUTES && guard-- > 0) {
      const k = order[i % order.length];
      const step = sum < TARGET_MINUTES ? 1 : -1;
      const next = out[k] + step;
      if (next >= 0 && next <= 48) {
        out[k] = next;
        sum += step;
      }
      i++;
    }
  }

  return {
    starterIds: rot.players.slice(0, 5).map(p => p.internalId),
    minutes: out,
  };
}

export function IdealRotationTab({ teamId }: IdealRotationTabProps) {
  const { state } = useGame();
  const team = state.teams.find(t => t.id === teamId);
  const isGM = state.gameMode === 'gm';
  const isCommissioner = state.gameMode !== 'gm';
  const canEdit = isCommissioner || teamId === state.userTeamId;

  const isPlayoffSeason = useMemo(() => {
    if (!state.date) return false;
    const m = new Date(state.date).getMonth() + 1;
    return m >= 4 && m <= 6;
  }, [state.date]);

  const allRoster = useMemo(
    () => state.players.filter(p => p.tid === teamId && p.status === 'Active'),
    [state.players, teamId],
  );
  const twoWayIneligible = useMemo(
    () => isPlayoffSeason ? allRoster.filter(p => (p as any).twoWay) : [],
    [allRoster, isPlayoffSeason],
  );
  const roster = useMemo(
    () => isPlayoffSeason ? allRoster.filter(p => !(p as any).twoWay) : allRoster,
    [allRoster, isPlayoffSeason],
  );
  const rosterIds = useMemo(() => roster.map(p => p.internalId), [roster]);
  const rosterIdKey = rosterIds.join('|');
  const currentYear = state.leagueStats?.year || 2026;
  const season = currentYear;

  const projectedStarters = useMemo(
    () => team ? StarterService.getProjectedStarters(team, state.players).slice(0, 5).map(p => p.internalId) : [],
    [team, state.players],
  );

  // Standings context mirroring GameplanTab — same depth/MPG logic so Ideal
  // reflects the team's actual play style (contender = short rotation, etc.).
  const standingsCtx = useMemo(() => {
    if (!team) return { conferenceRank: 8, gbFromLeader: 0, gamesRemaining: 41 };
    const rec = effectiveRecord(team, currentYear);
    const confTeams = state.teams
      .filter(t => t.conference === team.conference)
      .map(t => ({ t, rec: effectiveRecord(t, currentYear) }))
      .sort((a, b) => (b.rec.wins - b.rec.losses) - (a.rec.wins - a.rec.losses));
    const leader = confTeams[0];
    const conferenceRank = Math.max(1, confTeams.findIndex(c => c.t.id === team.id) + 1);
    const leaderWL = leader ? leader.rec.wins - leader.rec.losses : 0;
    const myWL = rec.wins - rec.losses;
    const gbFromLeader = Math.max(0, (leaderWL - myWL) / 2);
    const gamesRemaining = Math.max(0, 82 - (rec.wins + rec.losses));
    return { conferenceRank, gbFromLeader, gamesRemaining };
  }, [team, state.teams, currentYear]);

  // Lock/edit state + reconciliation tick
  const [tick, setTick] = useState(0);
  const saved = useMemo(() => getIdealRotation(teamId), [teamId, tick, rosterIdKey]);
  const locked = saved?.locked ?? false;

  // Effective plan — locked uses saved (reconciled), unlocked derives fresh
  // via MinutesPlayedService (same engine the live sim uses, with injuries
  // stripped so it's "full-strength").
  const { starters, minutes } = useMemo(() => {
    const baseline = computeBaselineFromService(team, state.players, roster, season, standingsCtx);
    const byOvr = [...roster].sort((a, b) => getDisplayOverall(b) - getDisplayOverall(a)).map(p => p.internalId);

    if (!locked || !saved) {
      const fallback = baseline.starterIds.length
        ? baseline.starterIds
        : (projectedStarters.length ? projectedStarters : byOvr);
      return {
        starters: reconcileStarters([], rosterIds, fallback),
        minutes: baseline.minutes,
      };
    }
    // Locked — reconcile stored values against current roster.
    const reconciledStarters = reconcileStarters(saved.starterIds, rosterIds,
      baseline.starterIds.length ? baseline.starterIds : (projectedStarters.length ? projectedStarters : byOvr));
    const reconciledMinutes = reconcileIdealMinutes(saved.minutes, rosterIds);
    const changed =
      reconciledStarters.join('|') !== saved.starterIds.join('|') ||
      Object.keys(reconciledMinutes).length !== Object.keys(saved.minutes).length ||
      Object.entries(reconciledMinutes).some(([k, v]) => saved.minutes[k] !== v);
    if (changed && canEdit) {
      saveIdealRotation(teamId, { starterIds: reconciledStarters, minutes: reconciledMinutes, locked: true });
    }
    return { starters: reconciledStarters, minutes: reconciledMinutes };
  }, [team, state.players, roster, rosterIds, rosterIdKey, season, standingsCtx, locked, saved, projectedStarters, teamId, canEdit]);

  const playersById = useMemo(() => {
    const m = new Map<string, NBAPlayer>();
    for (const p of state.players) m.set(p.internalId, p);
    return m;
  }, [state.players]);

  const starterSet = new Set(starters);
  const benchPlayers = roster.filter(p => !starterSet.has(p.internalId))
    .sort((a, b) => (minutes[b.internalId] ?? 0) - (minutes[a.internalId] ?? 0));
  // Render starters in PG→SG→SF→PF→C slot order. Unlocked (Auto) or partially
  // reconciled lineups get resorted; locked-and-intact saves are untouched so
  // a user's explicit drag order survives remount.
  const rawStarterPlayers = starters.map(id => playersById.get(id)).filter((p): p is NBAPlayer => !!p);
  const needsResort = !locked || !saved || saved.starterIds.some(id => !rosterIds.includes(id));
  const starterPlayers = needsResort
    ? StarterService.sortByPositionSlot(rawStarterPlayers, season)
    : rawStarterPlayers;

  const totalMinutes = Object.values(minutes).reduce((a, b) => a + b, 0);
  const remaining = TARGET_MINUTES - totalMinutes;

  // ── Mutation helpers (only fire when locked + canEdit) ──────────────────
  const writable = canEdit && locked;

  const persistEdit = (nextStarters: string[], nextMinutes: Record<string, number>) => {
    if (!canEdit) return;
    saveIdealRotation(teamId, { starterIds: nextStarters, minutes: nextMinutes, locked: true });
    setTick(t => t + 1);
  };

  const toggleLock = () => {
    if (!canEdit) return;
    if (locked) {
      clearIdealRotation(teamId);
    } else {
      // Snapshot current effective plan as the custom baseline — persist in
      // PG→SG→SF→PF→C slot order so the saved starterIds stop relying on a
      // render-time fixup.
      const ordered = StarterService.sortByPositionSlot(
        starters.map(id => playersById.get(id)).filter((p): p is NBAPlayer => !!p),
        season,
      ).map(p => p.internalId);
      saveIdealRotation(teamId, { starterIds: ordered, minutes, locked: true });
    }
    setTick(t => t + 1);
  };

  const resetToAuto = () => {
    if (!canEdit) return;
    // Re-seed with a fresh service-derived baseline (same engine as live sim,
    // injuries stripped). Sort into slot order so saved starterIds reflect
    // PG→SG→SF→PF→C without leaning on the render-time fixup.
    const baseline = computeBaselineFromService(team, state.players, roster, season, standingsCtx);
    const orderedIds = StarterService.sortByPositionSlot(
      baseline.starterIds.map(id => state.players.find(p => p.internalId === id)).filter((p): p is NBAPlayer => !!p),
      season,
    ).map(p => p.internalId);
    saveIdealRotation(teamId, {
      starterIds: orderedIds,
      minutes: baseline.minutes,
      locked: true,
    });
    setTick(t => t + 1);
  };

  const setMins = (id: string, v: number) => {
    if (!writable) return;
    const clamped = Math.max(0, Math.min(48, v));
    const current = minutes[id] ?? 0;
    // If the user is trying to raise minutes, cap at remaining team-budget
    // headroom. Decreases always allowed.
    if (clamped > current) {
      const othersTotal = Object.entries(minutes).reduce(
        (s, [k, n]) => (k === id ? s : s + n),
        0,
      );
      const maxAllowed = Math.max(current, TARGET_MINUTES - othersTotal);
      persistEdit(starters, { ...minutes, [id]: Math.min(clamped, maxAllowed) });
      return;
    }
    persistEdit(starters, { ...minutes, [id]: clamped });
  };

  // ── Drag-drop / tap-to-swap (parity with GameplanTab) ──────────────────
  // starter↔starter reorders the five; bench↔starter promotes one and demotes
  // the displaced starter into the bench; bench↔bench is a no-op here because
  // IdealRotation doesn't persist bench order (it's sorted by minutes).
  const performSwap = (src: string, target: string) => {
    if (!writable || src === target) return;
    const srcInStart = starters.indexOf(src);
    const tgtInStart = starters.indexOf(target);
    const benchIds = benchPlayers.map(p => p.internalId);
    const srcInBench = benchIds.indexOf(src);
    const tgtInBench = benchIds.indexOf(target);

    if (srcInStart >= 0 && tgtInStart >= 0) {
      const next = [...starters];
      [next[srcInStart], next[tgtInStart]] = [next[tgtInStart], next[srcInStart]];
      persistEdit(next, minutes);
      return;
    }
    if (srcInBench >= 0 && tgtInStart >= 0) {
      const next = [...starters];
      next[tgtInStart] = src;
      persistEdit(next, minutes);
      return;
    }
    if (srcInStart >= 0 && tgtInBench >= 0) {
      const next = [...starters];
      next[srcInStart] = target;
      persistEdit(next, minutes);
      return;
    }
  };

  const DRAG_THRESHOLD = 8;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingSlider, setDraggingSlider] = useState<{ id: string; value: number } | null>(null);
  const [drag, setDrag] = useState<null | {
    id: string;
    source: 'starter' | 'rotation';
    startX: number;
    startY: number;
    dx: number;
    dy: number;
    active: boolean;
  }>(null);
  const dragRef = useRef(drag);
  useEffect(() => { dragRef.current = drag; }, [drag]);
  const performSwapRef = useRef(performSwap);
  performSwapRef.current = performSwap;
  const suppressNextClick = useRef(false);

  const handleTap = (id: string) => {
    if (!writable) return;
    if (selectedId === null) { setSelectedId(id); return; }
    if (selectedId === id) { setSelectedId(null); return; }
    performSwap(selectedId, id);
    setSelectedId(null);
  };
  const handleTapRef = useRef(handleTap);
  handleTapRef.current = handleTap;

  const onCardPointerDown = (id: string, source: 'starter' | 'rotation') =>
    (e: React.PointerEvent) => {
      if (!writable) return;
      if (e.button !== undefined && e.button !== 0) return;
      const target = e.target as HTMLElement;
      // Don't hijack touches that land on the slider.
      if (target.closest('input, button, [data-no-drag]')) return;
      setDrag({ id, source, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, active: false });
    };

  useEffect(() => {
    if (!drag) return;
    const handleMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const active = d.active || Math.hypot(dx, dy) > DRAG_THRESHOLD;
      setDrag({ ...d, dx, dy, active });
      if (active) e.preventDefault();
    };
    const finish = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) { setDrag(null); return; }
      if (!d.active) {
        suppressNextClick.current = true;
        handleTapRef.current(d.id);
        setDrag(null);
        window.setTimeout(() => { suppressNextClick.current = false; }, 500);
        return;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const dropTarget = (el as HTMLElement | null)?.closest?.('[data-player-id]') as HTMLElement | null;
      const targetId = dropTarget?.getAttribute('data-player-id');
      if (targetId && targetId !== d.id) {
        suppressNextClick.current = true;
        performSwapRef.current(d.id, targetId);
      } else {
        suppressNextClick.current = true;
      }
      setDrag(null);
      window.setTimeout(() => { suppressNextClick.current = false; }, 500);
    };
    const cancel = () => { setDrag(null); };
    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [drag?.id]);

  const dragStyle = (id: string, source: 'starter' | 'rotation'): React.CSSProperties | undefined => {
    if (!drag || drag.id !== id || drag.source !== source || !drag.active) return undefined;
    return {
      transform: `translate3d(${drag.dx}px, ${drag.dy}px, 0) scale(1.06)`,
      zIndex: 50,
      opacity: 0.92,
      boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
      transition: 'none',
      pointerEvents: 'none',
    };
  };

  const onCardClick = (id: string) => {
    if (suppressNextClick.current) { suppressNextClick.current = false; return; }
    if (!drag) handleTap(id);
  };

  const noScrollOnFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    const scrollables: Array<{ el: Element; top: number }> = [];
    let el: Element | null = e.target;
    while (el) {
      if (el.scrollHeight > el.clientHeight) scrollables.push({ el, top: el.scrollTop });
      el = el.parentElement;
    }
    const winY = window.scrollY;
    requestAnimationFrame(() => {
      scrollables.forEach(({ el, top }) => { (el as HTMLElement).scrollTop = top; });
      window.scrollTo(window.scrollX, winY);
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────
  if (!team) return <div className="text-slate-400 text-sm">Team not found.</div>;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-sky-400">
            Ideal Rotation (Full Strength) {isCommissioner && <span className="ml-2 text-[9px] text-violet-300">COMMISSIONER</span>}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {locked
              ? 'Custom plan — drag or tap-to-swap players, slide to set minutes, autosaves.'
              : 'Auto baseline — derived from roster. Customize to edit.'}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {canEdit && (
            <>
              {locked && (
                <button
                  onClick={resetToAuto}
                  className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-sky-500/50 px-2 py-1 rounded font-black uppercase tracking-widest text-[10px] text-slate-300 hover:text-sky-300 transition-colors"
                  title="Re-seed the custom plan from the auto baseline"
                >
                  <Sparkles className="w-3 h-3" />
                  Reseed Auto
                </button>
              )}
              <button
                onClick={toggleLock}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-black uppercase transition-colors ${
                  locked
                    ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                    : 'bg-sky-500 text-black hover:bg-sky-400'
                }`}
                title={locked ? 'Clear the custom plan and go back to the auto baseline' : 'Start a custom plan you can edit'}
              >
                {locked ? <RotateCcw size={12} /> : <Pencil size={12} />}
                {locked ? 'Use Auto' : 'Customize'}
              </button>
            </>
          )}
          <div className={`font-mono ${remaining === 0 ? 'text-emerald-400' : Math.abs(remaining) <= 5 ? 'text-amber-300' : 'text-rose-400'}`}>
            {totalMinutes} / {TARGET_MINUTES} min
          </div>
        </div>
      </div>

      {selectedId && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs bg-sky-500/10 border border-sky-500/30 text-sky-200">
          <span>Tap another player to swap · tap the same one again to cancel.</span>
          <button
            onClick={() => setSelectedId(null)}
            className="ml-auto shrink-0 bg-black/30 hover:bg-black/50 border border-white/10 px-2 py-0.5 rounded font-black uppercase tracking-widest text-[10px]"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Starters */}
      <div className="bg-black/40 border border-slate-800 rounded-lg p-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
          Starting Five {!writable && <span className="ml-2 text-[9px] text-slate-500">read-only</span>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {STARTER_POS_ORDER.map((pos, i) => {
            const p = starterPlayers[i];
            if (!p) return (
              <div key={pos} className="aspect-[3/4] border-2 border-dashed border-slate-700 rounded-lg flex items-center justify-center text-slate-600 text-xs uppercase">
                {pos}
              </div>
            );
            const isSelected = selectedId === p.internalId;
            return (
              <div
                key={p.internalId}
                data-player-id={p.internalId}
                onClick={() => onCardClick(p.internalId)}
                onPointerDown={onCardPointerDown(p.internalId, 'starter')}
                style={dragStyle(p.internalId, 'starter')}
                className={`relative bg-gradient-to-b from-slate-800/80 to-slate-900/90 rounded-lg p-2 border touch-none select-none transition-colors group ${
                  writable ? 'cursor-pointer active:cursor-grabbing' : 'cursor-default'
                } ${
                  isSelected
                    ? 'border-sky-400 ring-2 ring-sky-400/50'
                    : `border-slate-700 ${writable ? 'hover:border-sky-500' : ''}`
                }`}
                title={writable ? 'Drag onto a bench player to swap, or tap two cards in sequence' : ''}
              >
                <div className="absolute top-1 left-1 text-[9px] font-black text-sky-400 bg-black/60 px-1.5 py-0.5 rounded z-10">{pos}</div>
                {writable && (
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <GripVertical className="w-3 h-3 text-slate-400" />
                  </div>
                )}
                <div className="flex flex-col items-center gap-1 mt-2">
                  <PlayerPortrait imgUrl={p.imgURL} face={(p as any).face} playerName={p.name} size={72} overallRating={p.overallRating} />
                  <div className="text-[11px] font-bold text-white text-center line-clamp-1 w-full">{p.name}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Two-Way Ineligible (Playoffs) */}
      {isPlayoffSeason && twoWayIneligible.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-700/40 rounded-lg p-3 opacity-60">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Ineligible — Two-Way Contract
            </div>
            <div className="text-[10px] text-slate-500 ml-auto">
              Two-way players cannot participate in playoff games
            </div>
          </div>
          <div className="flex flex-col gap-1">
            {twoWayIneligible.map(p => {
              const ovr = getDisplayOverall(p);
              const age = p.born?.year ? currentYear - p.born.year : (p as any).age;
              return (
                <div
                  key={p.internalId}
                  className="sm:grid sm:grid-cols-[20px_40px_1fr_40px] gap-2 items-center px-2 py-1.5 rounded bg-slate-800/20 flex"
                >
                  <GripVertical className="w-3 h-3 text-slate-700 shrink-0" />
                  <div className="grayscale opacity-50">
                    <PlayerPortrait imgUrl={p.imgURL} face={(p as any).face} playerName={p.name} size={36} overallRating={p.overallRating} />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-bold text-slate-500 truncate">{p.name}</span>
                    <span className="text-[10px] text-sky-500/70 font-bold">
                      TWO WAY{age ? ` | ${age}y` : ''}
                    </span>
                  </div>
                  <span className="text-center text-xs font-black tabular-nums text-slate-600">{ovr}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rotation — minute sliders, includes injured (ideal is injury-agnostic) */}
      <div className="bg-black/40 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Rotation</div>
          <div className="text-[10px] text-slate-500">
            {writable ? 'Drag row into starters above · slider sets minutes' : 'Locked plan shown read-only'}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          {[...starterPlayers, ...benchPlayers].map((p, idx) => {
            if (!p) return null;
            const ovr = getDisplayOverall(p);
            const storedMins = minutes[p.internalId] ?? 0;
            const displayMins = draggingSlider?.id === p.internalId ? draggingSlider.value : storedMins;
            const isStarter = idx < 5;
            const isSelected = selectedId === p.internalId;
            const ovrColor = ovr >= 90 ? 'text-blue-300' : ovr >= 85 ? 'text-emerald-300' : ovr >= 78 ? 'text-amber-300' : 'text-slate-400';
            const age = p.born?.year ? currentYear - p.born.year : (p as any).age;
            return (
              <div
                key={p.internalId}
                data-player-id={p.internalId}
                onClick={() => onCardClick(p.internalId)}
                onPointerDown={onCardPointerDown(p.internalId, 'rotation')}
                style={dragStyle(p.internalId, 'rotation')}
                className={`rounded transition-colors px-2 py-1.5 touch-none select-none ${
                  writable ? 'cursor-pointer active:cursor-grabbing' : ''
                } ${
                  isSelected
                    ? 'bg-sky-500/25 ring-2 ring-sky-400/60 border-l-2 border-sky-400'
                    : isStarter
                    ? `bg-sky-500/10 border-l-2 border-sky-500 ${writable ? 'hover:bg-sky-500/15' : ''}`
                    : `bg-white/5 border-l-2 border-transparent ${writable ? 'hover:bg-white/10' : ''}`
                }`}
              >
                {/* Desktop: single row. Mobile: stacks top (identity) + bottom (slider). */}
                <div className="sm:grid sm:grid-cols-[20px_40px_1fr_1fr_40px] sm:gap-2 sm:items-center flex items-center gap-2">
                  <GripVertical className="w-3 h-3 text-slate-500 shrink-0" />
                  <PlayerPortrait imgUrl={p.imgURL} face={(p as any).face} playerName={p.name} size={36} />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-bold text-white truncate">{p.name}</span>
                    <span className="text-[10px] text-slate-400">
                      <span className={ovrColor}>{ovr}</span>{` ${p.pos}`}{age ? ` | ${age}y` : ''}
                    </span>
                  </div>
                  {/* Desktop slider — inline. Stop propagation so dragging it doesn't fire tap-to-swap. */}
                  <input
                    type="range"
                    min={0}
                    max={48}
                    step={1}
                    value={displayMins}
                    readOnly={!writable}
                    disabled={!writable}
                    onChange={e => writable && setDraggingSlider({ id: p.internalId, value: +e.target.value })}
                    onPointerUp={() => {
                      if (writable && draggingSlider?.id === p.internalId) {
                        setMins(p.internalId, draggingSlider.value);
                        setDraggingSlider(null);
                      }
                    }}
                    onClick={e => e.stopPropagation()}
                    onPointerDown={e => e.stopPropagation()}
                    onFocus={noScrollOnFocus}
                    className={`hidden sm:block w-full touch-pan-x ${writable ? 'accent-sky-500 cursor-pointer' : 'accent-slate-500 cursor-not-allowed opacity-60'}`}
                  />
                  <span className="hidden sm:block text-xs font-mono text-slate-200 text-right tabular-nums">
                    {displayMins}
                  </span>
                </div>
                {/* Mobile slider — own line, full width. */}
                <div
                  className="flex sm:hidden items-center gap-2 mt-1.5 pl-[28px] touch-pan-x"
                  onClick={e => e.stopPropagation()}
                >
                  <input
                    type="range"
                    min={0}
                    max={48}
                    step={1}
                    value={displayMins}
                    readOnly={!writable}
                    disabled={!writable}
                    onChange={e => writable && setDraggingSlider({ id: p.internalId, value: +e.target.value })}
                    onPointerUp={() => {
                      if (writable && draggingSlider?.id === p.internalId) {
                        setMins(p.internalId, draggingSlider.value);
                        setDraggingSlider(null);
                      }
                    }}
                    onPointerDown={e => e.stopPropagation()}
                    onFocus={noScrollOnFocus}
                    className={`flex-1 touch-pan-x ${writable ? 'accent-sky-500' : 'accent-slate-500 cursor-not-allowed opacity-60'}`}
                  />
                  <span className="text-xs font-mono text-slate-200 text-right tabular-nums w-9">
                    {displayMins}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
