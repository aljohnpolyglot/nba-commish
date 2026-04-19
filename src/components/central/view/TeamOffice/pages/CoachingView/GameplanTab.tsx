/**
 * GameplanTab — GM-only rotation editor.
 *
 * Live reads base minutes from MinutesPlayedService, lets the GM drag-drop
 * starters and slide per-player minutes, and autosaves to gameplanStore so
 * the preview modal + simulator respect the plan next game.
 *
 * Injured players are pinned to the bottom (read-only) — rotation
 * auto-repopulates from the healthy pool.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, GripVertical, Sparkles } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { useGame } from '../../../../../../store/GameContext';
import { MinutesPlayedService } from '../../../../../../services/simulation/MinutesPlayedService';
import { StarterService } from '../../../../../../services/simulation/StarterService';
import { effectiveRecord } from '../../../../../../utils/salaryUtils';
import { getDisplayOverall } from '../../../../../../utils/playerRatings';
import { PlayerPortrait } from '../../../../../shared/PlayerPortrait';
import {
  getGameplan,
  saveGameplan,
  clearGameplan,
  type Gameplan,
} from '../../../../../../store/gameplanStore';
import {
  getIdealRotation,
  reconcileIdealMinutes,
} from '../../../../../../store/idealRotationStore';
import type { NBAPlayer } from '../../../../../../types';

interface GameplanTabProps {
  teamId: number;
}

const STARTER_POS_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

function getK2(p: NBAPlayer): number {
  // Canonical: use the same source of truth as PlayerRatingsView / NBA Central.
  return getDisplayOverall(p);
}

function isInjured(p: NBAPlayer): boolean {
  return !!p.injury && (p.injury.gamesRemaining ?? 0) > 0;
}

/** 1 game ≈ 2.5 days (matches InjuriesView). */
function injuryReturnLabel(gamesRemaining: number, today: string | Date): string {
  if (gamesRemaining <= 0) return '—';
  const daysOut = Math.ceil(gamesRemaining * 2.5);
  try {
    return format(addDays(new Date(today), daysOut), 'd MMM');
  } catch {
    return `${gamesRemaining} game${gamesRemaining === 1 ? '' : 's'}`;
  }
}

export function GameplanTab({ teamId }: GameplanTabProps) {
  const { state } = useGame();
  const team = state.teams.find(t => t.id === teamId);
  const currentYear = state.leagueStats?.year || 2026;

  const isGM = state.gameMode === 'gm';
  const isCommissioner = state.gameMode !== 'gm';
  // Commissioner can edit any team's gameplan; GM can only edit their own team.
  // The old "GM mode only" lockout is gone — commissioner mode is supposed to let
  // you do everything.
  const canEdit = isCommissioner || teamId === state.userTeamId;
  const isOwnTeam = canEdit; // kept as an alias so existing markup still reads naturally

  // ── Rotation computation (live, uses MinutesPlayedService) ─────────────────
  const { rotation, baseMinutes, injuredPlayers, benchPool } = useMemo(() => {
    if (!team) return { rotation: [], baseMinutes: [], injuredPlayers: [], benchPool: [] };

    const roster = state.players.filter(p => p.tid === teamId && p.status === 'Active');
    const injured = roster.filter(isInjured);

    const rec = effectiveRecord(team, currentYear);
    const confTeams = state.teams
      .filter(t => t.conference === team.conference)
      .map(t => ({ t, rec: effectiveRecord(t, currentYear) }))
      .sort((a, b) => b.rec.wins - b.rec.losses - (a.rec.wins - a.rec.losses));
    const leader = confTeams[0];
    const idx = confTeams.findIndex(c => c.t.id === teamId);
    const confRank = idx >= 0 ? idx + 1 : 8;
    const gb = Math.max(
      0,
      ((leader?.rec.wins ?? 0) - rec.wins + rec.losses - (leader?.rec.losses ?? 0)) / 2,
    );
    const totalGames = rec.wins + rec.losses;
    const gamesRemaining = Math.max(0, 82 - totalGames);

    const rot = MinutesPlayedService.getRotation(
      team,
      state.players,
      0,
      currentYear,
      undefined,
      confRank,
      gb,
      gamesRemaining,
    );

    const { minutes } = MinutesPlayedService.allocateMinutes(
      rot.players,
      currentYear,
      0,
      0,
      rot.starMpgTarget,
      false,
    );

    const inRotationIds = new Set(rot.players.map(p => p.internalId));
    const bench = roster.filter(
      p => !inRotationIds.has(p.internalId) && !isInjured(p),
    );

    return {
      rotation: rot.players,
      baseMinutes: minutes,
      injuredPlayers: injured,
      benchPool: bench,
    };
  }, [team, state.players, state.teams, teamId, currentYear]);

  // ── Editable local state (seeded from saved gameplan or computed defaults) ─
  const [starterOrder, setStarterOrder] = useState<string[]>([]);
  const [benchOrder, setBenchOrder] = useState<string[]>([]);
  const [minuteOverrides, setMinuteOverrides] = useState<Record<string, number>>({});
  const seededFor = useRef<string>('');

  useEffect(() => {
    const key = rotation.map(p => p.internalId).join('|');
    if (!key || key === seededFor.current) return;
    seededFor.current = key;

    // Only players still on this team are eligible starters — a saved
    // starterId pointing at someone who's been traded/cut is invalid.
    const onTeamIds = new Set(
      state.players.filter(p => p.tid === teamId && p.status === 'Active').map(p => p.internalId),
    );

    const saved = getGameplan(teamId);

    // Source-of-truth chain for starter/minute seeding:
    //   saved Gameplan (explicit daily override) → locked Ideal (user's
    //   perfect-world plan, injured stripped out + minutes redistributed) →
    //   service-computed defaults.
    // This is the "Ideal → Daily Gameplan" pipeline. Users who only touch the
    // Ideal tab get their intent respected on every game day automatically;
    // power users can still override per-matchup here.
    const ideal = !saved ? getIdealRotation(teamId) : null;
    const idealActive = !!ideal?.locked;
    const healthyIds = new Set(
      state.players.filter(p => p.tid === teamId && p.status === 'Active' && (!p.injury || (p.injury.gamesRemaining ?? 0) <= 0))
        .map(p => p.internalId),
    );

    const savedStarters = (saved?.starterIds ?? []).filter(id => onTeamIds.has(id));
    const projected = team
      ? StarterService.getProjectedStarters(team, state.players)
          .slice(0, 5)
          .map(p => p.internalId)
      : [];

    let nextStarters: string[];
    if (savedStarters.length > 0) {
      nextStarters = [...savedStarters];
    } else if (idealActive && ideal) {
      // Derive daily starters from Ideal: keep healthy ideal starters, fill
      // vacated slots from projected order (also health-filtered).
      nextStarters = ideal.starterIds.filter(id => healthyIds.has(id));
    } else {
      nextStarters = [];
    }
    for (const pid of projected) {
      if (nextStarters.length >= 5) break;
      if (!nextStarters.includes(pid)) nextStarters.push(pid);
    }
    const finalStarters = nextStarters.slice(0, 5);
    setStarterOrder(finalStarters);

    // Seed bench order: saved order first (filtered to on-team, non-starter),
    // then append any rotation-bench players not already in the saved order so
    // newly-added guys still show up.
    const starterSet = new Set(finalStarters);
    const savedBench = (saved?.benchOrder ?? []).filter(
      id => onTeamIds.has(id) && !starterSet.has(id),
    );
    const benchFromRotation = rotation
      .map(p => p.internalId)
      .filter(id => !starterSet.has(id) && !savedBench.includes(id));
    setBenchOrder([...savedBench, ...benchFromRotation]);

    // Seed minutes — drop overrides for players no longer on the team so
    // the 240-min budget isn't inflated by ghosts. When Ideal is locked and
    // no Gameplan is saved, derive from Ideal minutes with injured stripped
    // (minutes redistribute proportionally to healthy survivors).
    let idealDerived: Record<string, number> | null = null;
    if (idealActive && ideal) {
      const healthyRotationIds = rotation.map(p => p.internalId);
      idealDerived = reconcileIdealMinutes(ideal.minutes, healthyRotationIds);
    }

    const seed: Record<string, number> = {};
    rotation.forEach((p, i) => {
      const prior = saved?.minuteOverrides?.[p.internalId];
      const fromIdeal = idealDerived?.[p.internalId];
      seed[p.internalId] = prior ?? fromIdeal ?? Math.round(baseMinutes[i] ?? 0);
    });
    setMinuteOverrides(seed);
  }, [rotation, baseMinutes, team, state.players, teamId]);

  // ── Autosave to gameplanStore whenever the GM/commissioner edits something ─
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!canEdit) return;
    if (starterOrder.length !== 5) return;
    const plan: Gameplan = {
      starterIds: starterOrder,
      benchOrder,
      minuteOverrides,
    };
    saveGameplan(teamId, plan);
  }, [starterOrder, benchOrder, minuteOverrides, canEdit, teamId]);

  // ── Touch-to-swap selection ──────────────────────────────────────────────
  // Mobile browsers don't fire HTML5 drag events reliably, so a two-tap swap is
  // the primary interaction model. First tap highlights a card; second tap on
  // another card swaps them (or drops the first into the second's starter slot
  // if the target is a starter and the source is bench — matching the drag
  // behaviour exactly). Works identically on desktop so the UX is consistent.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Physical touch-drag — HTML5 drag events don't dispatch from mobile touch
  // (browser limitation), so we bolt on our own drag using touch events. The
  // card visually follows the finger via inline CSS transform, and elementFromPoint
  // resolves the drop target on touchend. Short taps (finger movement below the
  // DRAG_THRESHOLD) fall through to the existing tap-to-swap path.
  const DRAG_THRESHOLD = 8; // px of finger movement before we commit to a drag
  const [drag, setDrag] = useState<null | {
    id: string;
    /** Where the drag originated — 'starter' card vs 'rotation' row. The same
     *  player appears in both zones, so dragStyle must only light up the card
     *  that was actually grabbed, not every card with a matching internalId. */
    source: 'starter' | 'rotation';
    startX: number;
    startY: number;
    dx: number;
    dy: number;
    active: boolean;
  }>(null);
  const dragRef = useRef(drag);
  useEffect(() => { dragRef.current = drag; }, [drag]);
  // Refs keep the drag-finish path pointed at the latest state/closures even
  // though the window listeners are registered once per drag session.
  const performSwapRef = useRef<(src: string, target: string) => void>(() => {});
  const handleTapRef = useRef<(id: string) => void>(() => {});
  // After we handle a tap/drop inside the touchend path, the browser fires a
  // synthetic click that would run onClick a second time — which would immediately
  // deselect what we just selected. This flag swallows that duplicate click.
  const suppressNextClick = useRef(false);
  // Rolling debug log — last 6 tap/swap events, rendered in a small panel at the
  // top of the tab so the user can confirm on their phone that taps are firing
  // (native HTML5 drag events don't dispatch from mobile touch, so there's no
  // drag log to show — tap is the only path on mobile).
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const pushDebug = (line: string) => {
    const stamp = new Date().toISOString().slice(11, 19);
    setDebugLog(prev => [`${stamp} ${line}`, ...prev].slice(0, 6));
  };
  const performSwap = (src: string, target: string) => {
    if (!canEdit || src === target) return;
    const srcInStart = starterOrder.indexOf(src);
    const tgtInStart = starterOrder.indexOf(target);
    // Use the rendered rotationBench as the canonical bench list so players
    // newly-added to the bench (not yet in benchOrder) still participate in swaps.
    const benchIds = rotationBench.map(p => p.internalId);
    const srcInBench = benchIds.indexOf(src);
    const tgtInBench = benchIds.indexOf(target);

    // Case 1: starter ↔ starter — reorder the starting five.
    if (srcInStart >= 0 && tgtInStart >= 0) {
      setStarterOrder(prev => {
        const next = [...prev];
        [next[srcInStart], next[tgtInStart]] = [next[tgtInStart], next[srcInStart]];
        return next;
      });
      pushDebug(`SWAP starter[${srcInStart}] ↔ starter[${tgtInStart}]`);
      return;
    }
    // Case 2: bench ↔ bench — reorder the bench.
    if (srcInBench >= 0 && tgtInBench >= 0) {
      const next = [...benchIds];
      [next[srcInBench], next[tgtInBench]] = [next[tgtInBench], next[srcInBench]];
      setBenchOrder(next);
      pushDebug(`SWAP bench[${srcInBench}] ↔ bench[${tgtInBench}]`);
      return;
    }
    // Case 3: bench → starter — promote bench player, demote displaced starter
    // into the bench slot the promoter vacated.
    if (srcInBench >= 0 && tgtInStart >= 0) {
      const displaced = starterOrder[tgtInStart];
      setStarterOrder(prev => {
        const next = [...prev];
        next[tgtInStart] = src;
        return next;
      });
      const nextBench = [...benchIds];
      nextBench[srcInBench] = displaced;
      setBenchOrder(nextBench);
      pushDebug(`PROMOTE bench[${srcInBench}] → starter[${tgtInStart}]`);
      return;
    }
    // Case 4: starter → bench — mirror of case 3.
    if (srcInStart >= 0 && tgtInBench >= 0) {
      const displaced = benchIds[tgtInBench];
      setStarterOrder(prev => {
        const next = [...prev];
        next[srcInStart] = displaced;
        return next;
      });
      const nextBench = [...benchIds];
      nextBench[tgtInBench] = src;
      setBenchOrder(nextBench);
      pushDebug(`DEMOTE starter[${srcInStart}] → bench[${tgtInBench}]`);
      return;
    }
    pushDebug(`SWAP no-op (src=${srcInStart}/${srcInBench}, tgt=${tgtInStart}/${tgtInBench})`);
  };
  const handleTap = (id: string) => {
    if (!canEdit) {
      pushDebug(`TAP blocked (read-only) id=${id.slice(-6)}`);
      return;
    }
    if (selectedId === null) {
      setSelectedId(id);
      pushDebug(`SELECT id=${id.slice(-6)}`);
      return;
    }
    if (selectedId === id) {
      setSelectedId(null);
      pushDebug(`DESELECT id=${id.slice(-6)}`);
      return;
    }
    pushDebug(`TAP-SWAP ${selectedId.slice(-6)} → ${id.slice(-6)}`);
    performSwap(selectedId, id);
    setSelectedId(null);
  };

  // Keep refs current so the window listeners always see the latest closures.
  performSwapRef.current = performSwap;
  handleTapRef.current = handleTap;

  // Unified pointer-based drag start. Pointer events cover mouse + touch + pen
  // with a single API, so desktop and mobile share the exact same drag path —
  // crucially, this sidesteps the browser's native HTML5-drag auto-scroll on
  // PC (which was making the page lurch whenever the user clicked a card).
  const onCardPointerDown = (id: string, source: 'starter' | 'rotation') => (e: React.PointerEvent) => {
    if (!canEdit) {
      pushDebug(`POINTERDOWN BLOCKED (canEdit=false, mode=${state.gameMode}) id=${id.slice(-6)}`);
      return;
    }
    // Only react to primary button / primary touch — no right-click drags.
    if (e.button !== undefined && e.button !== 0) return;
    // Don't hijack touches that land on the minute slider or any form control.
    const target = e.target as HTMLElement;
    if (target.closest('input, button, [data-no-drag]')) return;
    setDrag({ id, source, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, active: false });
    pushDebug(`POINTERDOWN id=${id.slice(-6)}`);
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
      // Once a drag is committed, block default scroll/selection behavior so
      // the card tracks the pointer 1:1. touch-action: none on the card itself
      // already neutralizes native scroll-from-card-start; this is defensive.
      if (active) e.preventDefault();
    };

    const finish = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) { setDrag(null); return; }
      if (!d.active) {
        // Movement never crossed the drag threshold → treat as a tap.
        // Swallow the synthetic click that fires after a touch-tap so handleTap
        // doesn't run twice. Mouse pointerup is itself the click, so the flag
        // is cleared fast either way.
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
        pushDebug(`DRAG-DROP ${d.id.slice(-6)} → ${targetId.slice(-6)}`);
        suppressNextClick.current = true;
        performSwapRef.current(d.id, targetId);
      } else {
        pushDebug(`DRAG-DROP missed (${d.id.slice(-6)})`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id]);

  // Style applied to whichever card is currently being touch-dragged — follows
  // the finger with a slight scale + shadow so it feels tactile.
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

  // ── Derived view data ──────────────────────────────────────────────────────
  const playersById = useMemo(() => {
    const m = new Map<string, NBAPlayer>();
    for (const p of state.players) m.set(p.internalId, p);
    return m;
  }, [state.players]);

  const starters = starterOrder
    .map(id => playersById.get(id))
    .filter((p): p is NBAPlayer => !!p);

  // Union of rotation bench + deep bench pool, de-duped, excluding current
  // starters and injured.  `benchOrder` then imposes the user's explicit order:
  // anything present in benchOrder comes first in that order; anything else
  // (newly-added players not yet tracked) is appended in natural order.
  const rawBench = (() => {
    const starterSet = new Set(starterOrder);
    const seen = new Set<string>();
    const out: NBAPlayer[] = [];
    for (const p of rotation) {
      if (starterSet.has(p.internalId) || isInjured(p)) continue;
      if (seen.has(p.internalId)) continue;
      seen.add(p.internalId);
      out.push(p);
    }
    for (const p of benchPool) {
      if (starterSet.has(p.internalId) || seen.has(p.internalId)) continue;
      seen.add(p.internalId);
      out.push(p);
    }
    return out;
  })();
  const rotationBench = (() => {
    const byId = new Map(rawBench.map(p => [p.internalId, p]));
    const ordered: NBAPlayer[] = [];
    for (const id of benchOrder) {
      const p = byId.get(id);
      if (p) { ordered.push(p); byId.delete(id); }
    }
    // Remaining (not yet in benchOrder) appended in natural order.
    for (const p of rawBench) if (byId.has(p.internalId)) ordered.push(p);
    return ordered;
  })();

  const totalMinutes = Object.values(minuteOverrides).reduce((a, b) => a + b, 0);
  const targetMinutes = 240;
  const remaining = targetMinutes - totalMinutes;

  const setMins = (id: string, v: number) => {
    setMinuteOverrides(prev => {
      const clamped = Math.max(0, Math.min(48, v));
      const current = prev[id] ?? 0;
      // Cap increase at the remaining headroom when team is already at 240
      if (clamped > current) {
        const othersTotal = Object.entries(prev).reduce(
          (s, [k, n]) => (k === id ? s : s + n),
          0,
        );
        const maxAllowed = Math.max(current, targetMinutes - othersTotal);
        return { ...prev, [id]: Math.min(clamped, maxAllowed) };
      }
      return { ...prev, [id]: clamped };
    });
  };

  if (!team) {
    return <div className="text-red-400 font-bold uppercase tracking-widest">Team not found</div>;
  }

  // Proportional auto-balance so the 240-min budget is always reachable in one tap.
  // Reset to the coach's auto-computed rotation — clears every user edit,
  // then re-seeds from the same Ideal → service chain the initial seed uses.
  // If the user has a locked Ideal, the daily gameplan re-derives from it
  // (minus injured, minutes redistributed). Otherwise service defaults.
  const resetToAuto = () => {
    if (!canEdit) return;
    clearGameplan(teamId);
    // Blank guard so the seeding effect re-runs and picks the right source.
    seededFor.current = '';
    const ideal = getIdealRotation(teamId);
    const idealActive = !!ideal?.locked;
    const healthyIds = new Set(
      state.players.filter(p => p.tid === teamId && p.status === 'Active' && (!p.injury || (p.injury.gamesRemaining ?? 0) <= 0))
        .map(p => p.internalId),
    );
    const projected = team
      ? StarterService.getProjectedStarters(team, state.players).slice(0, 5).map(p => p.internalId)
      : [];

    let starters: string[];
    if (idealActive && ideal) {
      starters = ideal.starterIds.filter(id => healthyIds.has(id));
      for (const pid of projected) {
        if (starters.length >= 5) break;
        if (!starters.includes(pid)) starters.push(pid);
      }
      starters = starters.slice(0, 5);
    } else {
      starters = projected;
    }
    setStarterOrder(starters);

    const starterSet = new Set(starters);
    setBenchOrder(rotation.map(p => p.internalId).filter(id => !starterSet.has(id)));

    const seed: Record<string, number> = {};
    const idealDerived = idealActive && ideal
      ? reconcileIdealMinutes(ideal.minutes, rotation.map(p => p.internalId))
      : null;
    rotation.forEach((p, i) => {
      seed[p.internalId] = idealDerived?.[p.internalId] ?? Math.round(baseMinutes[i] ?? 0);
    });
    setMinuteOverrides(seed);
    setSelectedId(null);
  };

  // Scales every non-zero allocation toward 240, clamps to [0, 48], then distributes
  // any rounding delta to the highest-minute players until the sum hits exactly 240.
  const autoDistribute = () => {
    if (!canEdit) return;
    const entries = Object.entries(minuteOverrides);
    const currentTotal = entries.reduce((a, [, v]) => a + v, 0);
    if (currentTotal === targetMinutes) return;
    let next: Record<string, number>;
    if (currentTotal <= 0) {
      // Everyone is at 0 — split evenly across current rotation (5 starters + top bench).
      const roster = [...starters, ...rotationBench].slice(0, 10);
      if (roster.length === 0) return;
      const per = Math.floor(targetMinutes / roster.length);
      next = Object.fromEntries(roster.map(p => [p.internalId, per]));
      let residual = targetMinutes - per * roster.length;
      for (let i = 0; i < roster.length && residual > 0; i++) {
        next[roster[i].internalId] += 1;
        residual -= 1;
      }
    } else {
      const scale = targetMinutes / currentTotal;
      next = Object.fromEntries(
        entries.map(([k, v]) => [k, Math.max(0, Math.min(48, Math.round(v * scale)))]),
      );
      let diff = targetMinutes - Object.values(next).reduce((a, b) => a + b, 0);
      // Absorb rounding residue on the biggest buckets first so the result looks sane.
      const order = Object.entries(next).sort((a, b) => b[1] - a[1]).map(([k]) => k);
      for (let i = 0; diff !== 0 && i < order.length; i++) {
        const k = order[i];
        const step = diff > 0 ? 1 : -1;
        const n = next[k] + step;
        if (n < 0 || n > 48) continue;
        next[k] = n;
        diff -= step;
      }
    }
    setMinuteOverrides(next);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
            Head Coach Gameplan {isCommissioner && <span className="ml-2 text-[9px] text-violet-300">COMMISSIONER</span>}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            Tap one card then another to swap · drag also works · slider sets minutes · autosaves
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {canEdit && (
            <button
              onClick={resetToAuto}
              className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-amber-500/50 px-2 py-1 rounded font-black uppercase tracking-widest text-[10px] text-slate-300 hover:text-amber-300 transition-colors"
              title="Reset to coach's auto-computed rotation (clears all your overrides)"
            >
              <Sparkles className="w-3 h-3" />
              Auto
            </button>
          )}
          <div className={`font-mono ${remaining === 0 ? 'text-emerald-400' : Math.abs(remaining) <= 5 ? 'text-amber-300' : 'text-rose-400'}`}>
            {totalMinutes} / {targetMinutes} min
          </div>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Autosaved" />
        </div>
      </div>

      {/* Unbalanced-minutes warning — visible whenever the plan doesn't sum to 240.
          Auto-distribute button scales existing allocations to hit exactly 240. */}
      {canEdit && remaining !== 0 && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
          remaining > 0
            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200'
            : 'bg-rose-500/10 border border-rose-500/30 text-rose-200'
        }`}>
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">
            {remaining > 0
              ? <>Rotation under budget by <b>{remaining} min</b> — starters will get thin minutes next game.</>
              : <>Rotation over budget by <b>{Math.abs(remaining)} min</b> — the sim will scale back minutes to fit 48-min quarters.</>}
          </span>
          <button
            onClick={autoDistribute}
            className="shrink-0 flex items-center gap-1.5 bg-black/30 hover:bg-black/50 border border-white/10 px-2.5 py-1 rounded font-black uppercase tracking-widest text-[10px]"
          >
            <Sparkles className="w-3 h-3" />
            Auto-Distribute
          </button>
        </div>
      )}

      {selectedId && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-200">
          <span>Tap another player to swap · tap the same one again to cancel.</span>
          <button
            onClick={() => setSelectedId(null)}
            className="ml-auto shrink-0 bg-black/30 hover:bg-black/50 border border-white/10 px-2 py-0.5 rounded font-black uppercase tracking-widest text-[10px]"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Starting Five */}
      <div className="bg-black/40 border border-slate-800 rounded-lg p-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
          Starting Five
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {STARTER_POS_ORDER.map((pos, i) => {
            const p = starters[i];
            if (!p) {
              return (
                <div
                  key={pos}
                  onClick={() => selectedId && handleTap(selectedId) /* placing into empty slot */}
                  className="aspect-[3/4] border-2 border-dashed border-slate-700 rounded-lg flex items-center justify-center text-slate-600 text-xs uppercase touch-none select-none"
                >
                  {pos}
                </div>
              );
            }
            const k2 = getK2(p);
            const isSelected = selectedId === p.internalId;
            return (
              <div
                key={p.internalId}
                data-player-id={p.internalId}
                onClick={() => {
                  if (suppressNextClick.current) { suppressNextClick.current = false; return; }
                  if (!drag) handleTap(p.internalId);
                }}
                onPointerDown={onCardPointerDown(p.internalId, 'starter')}
                style={dragStyle(p.internalId, 'starter')}
                // touch-none + select-none make the card a pure gesture target
                // on mobile (no scroll hijack, no text selection). On desktop,
                // `user-select: none` + our pointer-event drag means the page
                // never auto-scrolls the way native HTML5 drag does.
                className={`relative bg-gradient-to-b from-slate-800/80 to-slate-900/90 rounded-lg p-2 cursor-pointer active:cursor-grabbing transition-colors group border touch-none select-none ${
                  isSelected
                    ? 'border-amber-400 ring-2 ring-amber-400/50'
                    : 'border-slate-700 hover:border-amber-500'
                }`}
              >
                <div className="absolute top-1 left-1 text-[9px] font-black text-amber-400 bg-black/60 px-1.5 py-0.5 rounded z-10">
                  {pos}
                </div>
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <GripVertical className="w-3 h-3 text-slate-400" />
                </div>
                <div className="flex flex-col items-center gap-1 mt-2">
                  <PlayerPortrait
                    imgUrl={p.imgURL}
                    playerName={p.name}
                    size={72}
                    overallRating={p.overallRating}
                  />
                  <div className="text-[11px] font-bold text-white text-center line-clamp-1 w-full">
                    {p.name}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rotation — minute sliders */}
      <div className="bg-black/40 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Rotation
          </div>
          <div className="text-[10px] text-slate-500">
            Drag row into starters above · slider sets minutes
          </div>
        </div>
        <div className="flex flex-col gap-1">
          {[...starters, ...rotationBench].map((p, idx) => {
            if (!p) return null;
            const k2 = getK2(p);
            const mins = minuteOverrides[p.internalId] ?? 0;
            const isStarter = idx < 5;
            const isSelected = selectedId === p.internalId;
            const k2Color = k2 >= 90 ? 'text-blue-300' : k2 >= 85 ? 'text-emerald-300' : k2 >= 78 ? 'text-amber-300' : 'text-slate-400';
            return (
              <div
                key={p.internalId}
                data-player-id={p.internalId}
                onClick={() => {
                  if (suppressNextClick.current) { suppressNextClick.current = false; return; }
                  if (!drag) handleTap(p.internalId);
                }}
                onPointerDown={onCardPointerDown(p.internalId, 'rotation')}
                style={dragStyle(p.internalId, 'rotation')}
                className={`rounded cursor-pointer active:cursor-grabbing transition-colors px-2 py-1.5 touch-none select-none ${
                  isSelected
                    ? 'bg-amber-500/25 ring-2 ring-amber-400/60 border-l-2 border-amber-400'
                    : isStarter
                    ? 'bg-amber-500/10 hover:bg-amber-500/15 border-l-2 border-amber-500'
                    : 'bg-white/5 hover:bg-white/10 border-l-2 border-transparent'
                }`}
              >
                {/* Desktop: single row. Mobile: stacks top (identity) + bottom (slider). */}
                <div className="sm:grid sm:grid-cols-[20px_40px_1fr_40px_1fr_40px] sm:gap-2 sm:items-center flex items-center gap-2">
                  <GripVertical className="w-3 h-3 text-slate-500 shrink-0" />
                  <PlayerPortrait
                    imgUrl={p.imgURL}
                    playerName={p.name}
                    size={36}
                    overallRating={p.overallRating}
                  />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-bold text-white truncate">{p.name}</span>
                    <span className="text-[10px] text-slate-400">
                      {p.pos}{p.born?.year ? ` | ${currentYear - p.born.year}y` : (p.age ? ` | ${p.age}y` : '')}
                    </span>
                  </div>
                  <span className={`text-center text-xs font-black tabular-nums shrink-0 ${k2Color}`}>{k2}</span>
                  {/* Desktop slider — inline. Stop propagation so dragging it doesn't fire tap-to-swap.
                      touch-pan-x re-enables horizontal scrubbing inside the `touch-none` row. */}
                  <input
                    type="range"
                    min={0}
                    // Cap the thumb's travel at remaining headroom so the user
                    // physically can't drag past the 240-min team budget.
                    max={Math.max(mins, Math.min(48, mins + Math.max(0, remaining)))}
                    step={1}
                    value={mins}
                    onChange={e => setMins(p.internalId, +e.target.value)}
                    onClick={e => e.stopPropagation()}
                    onPointerDown={e => e.stopPropagation()}
                    className="hidden sm:block w-full accent-amber-500 touch-pan-x"
                  />
                  <span className="hidden sm:block text-xs font-mono text-slate-200 text-right tabular-nums">
                    {mins}
                  </span>
                </div>
                {/* Mobile slider — own line, full width so the name above doesn't get squeezed.
                    Click propagation is killed at the wrapper so a scrub never fires tap-to-swap.
                    touch-pan-x re-enables horizontal scrubbing inside the `touch-none` row. */}
                <div
                  className="flex sm:hidden items-center gap-2 mt-1.5 pl-[28px] touch-pan-x"
                  onClick={e => e.stopPropagation()}
                >
                  <input
                    type="range"
                    min={0}
                    max={Math.max(mins, Math.min(48, mins + Math.max(0, remaining)))}
                    step={1}
                    value={mins}
                    onChange={e => setMins(p.internalId, +e.target.value)}
                    onPointerDown={e => e.stopPropagation()}
                    className="flex-1 accent-amber-500 touch-pan-x"
                  />
                  <span className="text-xs font-mono text-slate-200 text-right tabular-nums w-9">
                    {mins}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Injuries */}
      {injuredPlayers.length > 0 && (
        <div className="bg-rose-950/20 border border-rose-900/40 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <div className="text-[10px] font-bold uppercase tracking-widest text-rose-300">
              Unavailable — Injured
            </div>
            <div className="text-[10px] text-rose-400/70 ml-auto">
              Rotation auto-adjusts while these players recover
            </div>
          </div>
          <div className="flex flex-col gap-1">
            {injuredPlayers.map(p => {
              const k2 = getK2(p);
              const games = p.injury?.gamesRemaining ?? 0;
              return (
                <div
                  key={p.internalId}
                  className="grid grid-cols-[40px_1fr_40px_1fr] gap-2 items-center px-2 py-1.5 rounded bg-rose-900/10 opacity-80"
                >
                  <div className="grayscale">
                    <PlayerPortrait
                      imgUrl={p.imgURL}
                      playerName={p.name}
                      size={36}
                      overallRating={p.overallRating}
                    />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-rose-100/80 truncate line-through decoration-rose-400/40">
                      {p.name}
                    </span>
                    <span className="text-[10px] text-rose-300/70">{p.injury?.type ?? 'Injured'}</span>
                  </div>
                  <span className="text-center text-xs font-black tabular-nums text-slate-500">
                    {k2}
                  </span>
                  <span className="text-[10px] text-rose-300/80 font-mono text-right">
                    est. {injuryReturnLabel(games, state.date)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
