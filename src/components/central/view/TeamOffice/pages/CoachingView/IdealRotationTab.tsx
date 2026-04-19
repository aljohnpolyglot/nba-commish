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
import { Lock, Unlock, Sparkles } from 'lucide-react';
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

  const roster = useMemo(
    () => state.players.filter(p => p.tid === teamId && p.status === 'Active'),
    [state.players, teamId],
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
  const starterPlayers = starters.map(id => playersById.get(id)).filter((p): p is NBAPlayer => !!p);

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
      // Snapshot current effective plan as the locked baseline.
      saveIdealRotation(teamId, { starterIds: starters, minutes, locked: true });
    }
    setTick(t => t + 1);
  };

  const resetToAuto = () => {
    if (!canEdit) return;
    // Re-lock with a fresh service-derived baseline (same engine as live sim,
    // injuries stripped).
    const baseline = computeBaselineFromService(team, state.players, roster, season, standingsCtx);
    saveIdealRotation(teamId, {
      starterIds: baseline.starterIds,
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

  const promoteToStarter = (id: string) => {
    if (!writable || starters.includes(id)) return;
    // Swap into the lowest-minute starter slot by default.
    const weakestIdx = starters
      .map((sid, i) => ({ i, m: minutes[sid] ?? 0 }))
      .sort((a, b) => a.m - b.m)[0]?.i ?? 4;
    const nextStarters = [...starters];
    nextStarters[weakestIdx] = id;
    persistEdit(nextStarters, minutes);
  };

  const demoteStarter = (id: string) => {
    if (!writable) return;
    const idx = starters.indexOf(id);
    if (idx < 0) return;
    // Replace with the highest-minute bench player.
    const replacement = benchPlayers[0]?.internalId;
    if (!replacement) return;
    const nextStarters = [...starters];
    nextStarters[idx] = replacement;
    persistEdit(nextStarters, minutes);
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
              ? 'Locked — sliders persist, roster changes auto-redistribute minutes.'
              : 'Unlocked — auto-derives from roster. Lock to customize.'}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {canEdit && (
            <>
              {locked && (
                <button
                  onClick={resetToAuto}
                  className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-sky-500/50 px-2 py-1 rounded font-black uppercase tracking-widest text-[10px] text-slate-300 hover:text-sky-300 transition-colors"
                  title="Reset to baseline (top-of-roster by rating)"
                >
                  <Sparkles className="w-3 h-3" />
                  Auto
                </button>
              )}
              <button
                onClick={toggleLock}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-black uppercase transition-colors ${
                  locked
                    ? 'bg-sky-500 text-black hover:bg-sky-400'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
                title={locked ? 'Unlocking reverts to auto-derived baseline' : 'Lock your current plan against roster/injury changes'}
              >
                {locked ? <Lock size={12} /> : <Unlock size={12} />}
                {locked ? 'Locked' : 'Lock'}
              </button>
            </>
          )}
          <div className={`font-mono ${remaining === 0 ? 'text-emerald-400' : Math.abs(remaining) <= 5 ? 'text-amber-300' : 'text-rose-400'}`}>
            {totalMinutes} / {TARGET_MINUTES} min
          </div>
        </div>
      </div>

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
            return (
              <div
                key={p.internalId}
                onClick={() => writable && demoteStarter(p.internalId)}
                className={`relative bg-gradient-to-b from-slate-800/80 to-slate-900/90 rounded-lg p-2 border border-slate-700 ${writable ? 'cursor-pointer hover:border-sky-500' : 'cursor-default'}`}
                title={writable ? 'Click to demote to bench' : ''}
              >
                <div className="absolute top-1 left-1 text-[9px] font-black text-sky-400 bg-black/60 px-1.5 py-0.5 rounded z-10">{pos}</div>
                <div className="flex flex-col items-center gap-1 mt-2">
                  <PlayerPortrait imgUrl={p.imgURL} playerName={p.name} size={72} overallRating={p.overallRating} />
                  <div className="text-[11px] font-bold text-white text-center line-clamp-1 w-full">{p.name}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rotation — minute sliders, includes injured (ideal is injury-agnostic) */}
      <div className="bg-black/40 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Rotation</div>
          <div className="text-[10px] text-slate-500">
            {writable ? 'Click bench player to promote · slider sets minutes' : 'Locked plan shown read-only'}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          {[...starterPlayers, ...benchPlayers].map((p, idx) => {
            if (!p) return null;
            const ovr = getDisplayOverall(p);
            const mins = minutes[p.internalId] ?? 0;
            const isStarter = idx < 5;
            const ovrColor = ovr >= 90 ? 'text-blue-300' : ovr >= 85 ? 'text-emerald-300' : ovr >= 78 ? 'text-amber-300' : 'text-slate-400';
            return (
              <div
                key={p.internalId}
                onClick={() => writable && !isStarter && promoteToStarter(p.internalId)}
                className={`rounded transition-colors px-2 py-1.5 ${
                  isStarter
                    ? 'bg-sky-500/10 border-l-2 border-sky-500'
                    : `bg-white/5 border-l-2 border-transparent ${writable ? 'cursor-pointer hover:bg-white/10' : ''}`
                }`}
              >
                <div className="sm:grid sm:grid-cols-[40px_1fr_40px_1fr_40px] sm:gap-2 sm:items-center flex items-center gap-2">
                  <PlayerPortrait imgUrl={p.imgURL} playerName={p.name} size={36} overallRating={p.overallRating} />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-bold text-white truncate">{p.name}</span>
                    <span className="text-[10px] text-slate-400">{p.pos}</span>
                  </div>
                  <span className={`text-center text-xs font-black tabular-nums shrink-0 ${ovrColor}`}>{ovr}</span>
                  <input
                    type="range"
                    min={0}
                    // Physical travel cap at remaining team-budget headroom so
                    // the user can't drag past the 240-min total.
                    max={Math.max(mins, Math.min(48, mins + Math.max(0, remaining)))}
                    value={mins}
                    readOnly={!writable}
                    disabled={!writable}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setMins(p.internalId, Number(e.target.value))}
                    className={`w-full accent-sky-500 ${writable ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
                  />
                  <span className="text-[11px] font-mono text-slate-300 tabular-nums shrink-0 text-right">{mins}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
