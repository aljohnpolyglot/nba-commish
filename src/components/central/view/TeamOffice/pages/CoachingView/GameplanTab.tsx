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
import { AlertTriangle, GripVertical, Lock } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { useGame } from '../../../../../../store/GameContext';
import { MinutesPlayedService } from '../../../../../../services/simulation/MinutesPlayedService';
import { StarterService } from '../../../../../../services/simulation/StarterService';
import { effectiveRecord } from '../../../../../../utils/salaryUtils';
import { convertTo2KRating } from '../../../../../../utils/helpers';
import { PlayerPortrait } from '../../../../../shared/PlayerPortrait';
import {
  getGameplan,
  saveGameplan,
  type Gameplan,
} from '../../../../../../store/gameplanStore';
import type { NBAPlayer } from '../../../../../../types';

interface GameplanTabProps {
  teamId: number;
}

const STARTER_POS_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

function getK2(p: NBAPlayer): number {
  const r = p.ratings?.[p.ratings.length - 1];
  if (!r) return p.overallRating ?? 50;
  return convertTo2KRating(p.overallRating, r.hgt ?? 50, r.tp ?? 50);
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
  const isOwnTeam = isGM && teamId === state.userTeamId;

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
  const [minuteOverrides, setMinuteOverrides] = useState<Record<string, number>>({});
  const seededFor = useRef<string>('');

  useEffect(() => {
    const key = rotation.map(p => p.internalId).join('|');
    if (!key || key === seededFor.current) return;
    seededFor.current = key;

    const saved = getGameplan(teamId);
    // Seed starters — prefer saved, else projected starters
    if (saved?.starterIds?.length === 5) {
      setStarterOrder(saved.starterIds);
    } else if (team) {
      const picks = StarterService.getProjectedStarters(team, state.players).slice(0, 5);
      setStarterOrder(picks.map(p => p.internalId));
    }
    // Seed minutes — prefer saved, else base minutes
    const seed: Record<string, number> = {};
    rotation.forEach((p, i) => {
      seed[p.internalId] =
        saved?.minuteOverrides?.[p.internalId] ?? Math.round(baseMinutes[i] ?? 0);
    });
    setMinuteOverrides(seed);
  }, [rotation, baseMinutes, team, state.players, teamId]);

  // ── Autosave to gameplanStore whenever the GM edits something ──────────────
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!isOwnTeam) return;
    if (starterOrder.length !== 5) return;
    const plan: Gameplan = {
      starterIds: starterOrder,
      minuteOverrides,
    };
    saveGameplan(teamId, plan);
  }, [starterOrder, minuteOverrides, isOwnTeam, teamId]);

  // ── Drag & Drop (HTML5 native — no extra deps) ─────────────────────────────
  const dragId = useRef<string | null>(null);
  const onDragStart = (id: string) => (e: React.DragEvent) => {
    if (!isOwnTeam) return;
    dragId.current = id;
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!isOwnTeam) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const onDropStarter = (targetId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!isOwnTeam || !dragId.current || dragId.current === targetId) return;
    const src = dragId.current;
    dragId.current = null;

    setStarterOrder(prev => {
      const next = [...prev];
      const srcIdx = next.indexOf(src);
      const tgtIdx = next.indexOf(targetId);
      if (srcIdx >= 0 && tgtIdx >= 0) {
        [next[srcIdx], next[tgtIdx]] = [next[tgtIdx], next[srcIdx]];
        return next;
      }
      if (tgtIdx >= 0 && srcIdx < 0) {
        next[tgtIdx] = src;
      }
      return next;
    });
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

  const rotationBench = rotation
    .filter(p => !starterOrder.includes(p.internalId) && !isInjured(p))
    .concat(benchPool.filter(p => !starterOrder.includes(p.internalId)));

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

  if (!isOwnTeam) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Lock className="w-10 h-10 text-slate-500 mb-4" />
        <div className="font-black uppercase tracking-widest text-slate-300">
          Gameplan editing is GM-mode only
        </div>
        <div className="text-xs text-slate-500 mt-2 max-w-sm">
          Switch to your own team's Team Office to drag-drop starters and adjust minutes.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
            Head Coach Gameplan
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            Drag players into the starting five · adjust minutes per game · autosaves
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className={`font-mono ${remaining === 0 ? 'text-emerald-400' : Math.abs(remaining) <= 5 ? 'text-amber-300' : 'text-rose-400'}`}>
            {totalMinutes} / {targetMinutes} min
          </div>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Autosaved" />
        </div>
      </div>

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
                  onDragOver={onDragOver}
                  className="aspect-[3/4] border-2 border-dashed border-slate-700 rounded-lg flex items-center justify-center text-slate-600 text-xs uppercase"
                >
                  {pos}
                </div>
              );
            }
            const k2 = getK2(p);
            return (
              <div
                key={p.internalId}
                draggable={isOwnTeam}
                onDragStart={onDragStart(p.internalId)}
                onDragOver={onDragOver}
                onDrop={onDropStarter(p.internalId)}
                className="relative bg-gradient-to-b from-slate-800/80 to-slate-900/90 border border-slate-700 hover:border-amber-500 rounded-lg p-2 cursor-grab active:cursor-grabbing transition-colors group"
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
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-black tabular-nums ${
                      k2 >= 90 ? 'text-blue-300' : k2 >= 85 ? 'text-emerald-300' : k2 >= 78 ? 'text-amber-300' : 'text-slate-400'
                    }`}>{k2} OVR</span>
                    <span className="text-[10px] text-slate-500">·</span>
                    <span className="text-[10px] font-mono text-slate-300 tabular-nums">
                      {minuteOverrides[p.internalId] ?? 0}
                    </span>
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
            return (
              <div
                key={p.internalId}
                draggable={isOwnTeam}
                onDragStart={onDragStart(p.internalId)}
                onDragOver={onDragOver}
                onDrop={onDropStarter(p.internalId)}
                className={`grid grid-cols-[20px_40px_1fr_40px_1fr_40px] gap-2 items-center px-2 py-1.5 rounded cursor-grab active:cursor-grabbing transition-colors ${
                  isStarter
                    ? 'bg-amber-500/10 hover:bg-amber-500/15 border-l-2 border-amber-500'
                    : 'bg-white/5 hover:bg-white/10 border-l-2 border-transparent'
                }`}
              >
                <GripVertical className="w-3 h-3 text-slate-500" />
                <PlayerPortrait
                  imgUrl={p.imgURL}
                  playerName={p.name}
                  size={36}
                  overallRating={p.overallRating}
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-white truncate">{p.name}</span>
                  <span className="text-[10px] text-slate-400">{p.pos}</span>
                </div>
                <span className={`text-center text-xs font-black tabular-nums ${
                  k2 >= 90 ? 'text-blue-300' : k2 >= 85 ? 'text-emerald-300' : k2 >= 78 ? 'text-amber-300' : 'text-slate-400'
                }`}>{k2}</span>
                <input
                  type="range"
                  min={0}
                  max={48}
                  step={1}
                  value={mins}
                  onChange={e => setMins(p.internalId, +e.target.value)}
                  className="w-full accent-amber-500"
                />
                <span className="text-xs font-mono text-slate-200 text-right tabular-nums">
                  {mins}
                </span>
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
