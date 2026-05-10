// ExpansionDraftView — Round-Robin Single-Round-Draft für die Expansion-Teams.
//
// Unterschiede zum normalen Rookie-Draft:
//   - Pool: state.expansionEligiblePlayers (unprotected vets/FAs), nicht Prospects
//   - Pick-Order: Round-Robin über state.expansionTeamIds × picksPerExpansionTeam
//   - Vertrag wandert mit (kein Rookie-Salary)
//   - Constraint: maxDraftedPerTeam pro original tid (Cap-Schutz für Bestandsteams)
//
// Reuse: nutzt FullDraftTable + helpers aus draft/simulator/. Eigene Komponente
// statt Mode-Switch im DraftSimulatorView, weil Pick-Logic, Pool-Filter und
// Pick-Order grundverschieden sind — Mode-Switch hätte if/else durchsetzen alles.

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Play, Pause, FastForward, Clock, CheckCircle, Map as MapIcon } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { convertTo2KRating } from '../../utils/helpers';
import type { NBAPlayer, NBATeam } from '../../types';
import { FullDraftTable } from '../draft/simulator/FullDraftTable';
import { getOrdinalSuffix } from '../draft/simulator/helpers';
import { getTeamFullName } from '../../utils/teamNames';

interface Props {
  onClose: () => void;
}

type DraftBoardTeam = Pick<NBATeam, 'id' | 'name' | 'abbrev' | 'region' | 'logoUrl'> & {
  tid?: number;
};
type DraftableExpansionPlayer = NBAPlayer & { _k2: number; _aiScore: number };
type SimSpeed = 'fastest' | 'normal' | 'slow';

const SIM_SPEED_MS: Record<SimSpeed, number> = {
  fastest: 200,
  normal: 800,
  slow: 1500,
};

/** Build Round-Robin pick order. Returns flat array of expansion-team tids,
 *  one entry per pick slot. Length = expansionTids.length × picksPerTeam. */
function buildRoundRobinOrder(expansionTids: number[], picksPerTeam: number): number[] {
  const order: number[] = [];
  for (let round = 0; round < picksPerTeam; round++) {
    for (const tid of expansionTids) {
      order.push(tid);
    }
  }
  return order;
}

function findTeamId(team: { id?: number; tid?: number }): number {
  return team.id ?? team.tid ?? -1;
}

function getOriginalTeamId(player: NBAPlayer): number {
  const previousNonExpansionTransaction = player.transactions?.find(transaction => transaction.type !== 'expansion-draft');
  return previousNonExpansionTransaction?.tid ?? player.tid;
}

export const ExpansionDraftView: React.FC<Props> = ({ onClose }) => {
  const { state, dispatchAction: dispatch } = useGame();

  const expansionTids = state.expansionTeamIds ?? [];
  const picksPerTeam = state.expansionProtectionSettings?.picksPerExpansionTeam ?? 14;
  const maxPerTeam = state.expansionProtectionSettings?.maxDraftedPerTeam ?? 2;
  const userTid = state.userTeamId ?? -999;
  const isGM = state.gameMode === 'gm';

  // Pick-Order (statisch, einmal berechnen)
  const pickOrder = useMemo(() => buildRoundRobinOrder(expansionTids, picksPerTeam), [expansionTids, picksPerTeam]);
  const totalPicks = pickOrder.length;

  // Resolve Team-Object pro Slot (für FullDraftTable)
  const draftOrderTeams = useMemo<DraftBoardTeam[]>(() => {
    const teams = (state.teams ?? []) as DraftBoardTeam[];
    return pickOrder.map(tid => {
      const team = teams.find(entry => findTeamId(entry) === tid);
      return team ?? { id: tid, name: `Team ${tid}`, abbrev: '?', logoUrl: undefined };
    });
  }, [pickOrder, state.teams]);

  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();

  const pool = useMemo<DraftableExpansionPlayer[]>(() => {
    const eligibleIds = new Set(state.expansionEligiblePlayers ?? []);
    // Defense-in-Depth gegen Save-Drift: tid<100 + Status-Filter doppelt prüfen,
    // falls expansionEligiblePlayers von einem alten Save mit WNBA/Euroleague-
    // Leaks befüllt wurde (vor dem Reducer-Fix).
    const EXTERNAL_STATUSES = new Set([
      'Retired', 'WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League',
      'Endesa', 'China CBA', 'NBL Australia', 'Free Agent', 'Draft Prospect', 'Prospect',
    ]);
    return (state.players ?? [])
      .filter(player => {
        if (!eligibleIds.has(player.internalId)) return false;
        if (typeof player.tid !== 'number' || player.tid < 0 || player.tid >= 100) return false;
        if (EXTERNAL_STATUSES.has(player.status as string)) return false;
        return true;
      })
      .map(player => {
        const k2 = convertTo2KRating(player.overallRating ?? 60, 50);
        // AI-Pick-Score: K2 + Vertrags-Multi-Year-Bonus.
        // Echte Expansion-Teams meiden 1-Jahr-Mietverträge — Penalty -20 bei
        // exp <= currentYear, +5 für jedes weitere Vertragsjahr (capped bei +15).
        // Star-Vet (K2 90, expiring) → 70, weniger als Long-Deal-Starter (K2 78,
        // 3yrs) → 78+15=93. Mittelmäßiger Long-Deal schlägt Star-Mietvertrag.
        const yearsLeft = Math.max(0, (player.contract?.exp ?? currentYear) - currentYear);
        const expiringPenalty = yearsLeft === 0 ? -20 : 0;
        const lengthBonus = Math.min(15, Math.max(0, (yearsLeft - 1) * 5));
        return { ...player, _k2: k2, _aiScore: k2 + expiringPenalty + lengthBonus };
      })
      .sort((a, b) => b._k2 - a._k2); // UI: K2 desc; AI nutzt _aiScore separat
  }, [state.players, state.expansionEligiblePlayers, currentYear]);

  // Lokaler State
  const [picked, setPicked] = useState<Record<number, NBAPlayer>>({});
  const [currentPick, setCurrentPick] = useState(1);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSpeed, setSimSpeed] = useState<SimSpeed>('normal');
  const [hasStarted, setHasStarted] = useState(false);

  const draftedIds = useMemo(() => new Set(Object.values(picked).map((p) => p.internalId)), [picked]);
  const isComplete = currentPick > totalPicks;

  // Per-original-team count (für maxPerTeam-Constraint)
  const drainedByOriginalTid = useMemo(() => {
    const counts: Record<number, number> = {};
    Object.values(picked).forEach(player => {
      const originalTid = getOriginalTeamId(player);
      counts[originalTid] = (counts[originalTid] ?? 0) + 1;
    });
    return counts;
  }, [picked]);

  const teamOnClock = draftOrderTeams[currentPick - 1];
  const isUserOnClock = isGM && teamOnClock && teamOnClock.id === userTid;

  const canPickPlayer = useCallback((player: DraftableExpansionPlayer): boolean => {
    return (drainedByOriginalTid[player.tid] ?? 0) < maxPerTeam;
  }, [drainedByOriginalTid, maxPerTeam]);

  const pickPlayer = useCallback((player: DraftableExpansionPlayer) => {
    const tidOnClock = pickOrder[currentPick - 1];
    if (tidOnClock == null) return;
    setHasStarted(true);
    setPicked(prev => ({ ...prev, [currentPick]: player }));
    dispatch({
      type: 'EXPANSION_DRAFT_PICK',
      payload: { tid: tidOnClock, playerId: player.internalId },
    } as never);
    setCurrentPick(prev => prev + 1);
  }, [currentPick, pickOrder, dispatch]);

  // Auto-Sim-Loop
  useEffect(() => {
    if (!isSimulating || isComplete) return;
    if (isGM && isUserOnClock) {
      setIsSimulating(false);
      return;
    }
    const timer = setTimeout(() => {
      // AI-Pick: höchster _aiScore (K2 + length bonus - expiring penalty)
      let best: DraftableExpansionPlayer | null = null;
      for (const p of pool) {
        if (draftedIds.has(p.internalId)) continue;
        if (!canPickPlayer(p)) continue;
        if (!best || p._aiScore > best._aiScore) best = p;
      }
      if (best) pickPlayer(best);
      else setIsSimulating(false);
    }, SIM_SPEED_MS[simSpeed]);
    return () => clearTimeout(timer);
  }, [isSimulating, isComplete, isUserOnClock, isGM, pool, draftedIds, canPickPlayer, pickPlayer, simSpeed]);

  // COMPLETE wird NICHT mehr automatisch dispatched, weil das Reducer-COMPLETE
  // expansionTeamIds=undefined setzt — das räumt unsere pickOrder/draftOrder ab
  // und der Review-Bildschirm zeigt nur "No picks for this team". Stattdessen
  // dispatcht der Exit-Button (handleExit) COMPLETE und schließt das Modal.
  const handleExit = useCallback(() => {
    if (isComplete && hasStarted) {
      dispatch({ type: 'EXPANSION_DRAFT_COMPLETE' } as never);
    }
    onClose();
  }, [isComplete, hasStarted, dispatch, onClose]);

  const simToEnd = () => {
    setIsSimulating(false);
    setHasStarted(true);
    let cur = currentPick;
    const newPicked = { ...picked };
    const usedIds = new Set(Object.values(newPicked).map(player => player.internalId));
    const localCounts = { ...drainedByOriginalTid };
    while (cur <= totalPicks) {
      // AI-Pick (Sim to End): höchster _aiScore mit valid constraints
      let candidate: DraftableExpansionPlayer | null = null;
      for (const p of pool) {
        if (usedIds.has(p.internalId)) continue;
        if ((localCounts[p.tid] ?? 0) >= maxPerTeam) continue;
        if (!candidate || p._aiScore > candidate._aiScore) candidate = p;
      }
      if (!candidate) break;
      newPicked[cur] = candidate;
      usedIds.add(candidate.internalId);
      localCounts[candidate.tid] = (localCounts[candidate.tid] ?? 0) + 1;
      const tidOnClock = pickOrder[cur - 1];
      dispatch({
        type: 'EXPANSION_DRAFT_PICK',
        payload: { tid: tidOnClock, playerId: candidate.internalId },
      } as never);
      cur++;
    }
    setPicked(newPicked);
    setCurrentPick(cur);
  };

  const availableForUser = useMemo(() =>
    pool.filter(player => !draftedIds.has(player.internalId) && canPickPlayer(player)).slice(0, 50),
  [pool, draftedIds, canPickPlayer]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-950">
          <div className="flex items-center gap-3">
            <MapIcon className="w-5 h-5 text-indigo-400" />
            <div>
              <h2 className="text-lg font-bold">
                {isComplete ? 'Draft Complete · Review' : 'Expansion Draft'}
              </h2>
              <p className="text-xs text-zinc-400">
                {isComplete
                  ? `${totalPicks} picks · scroll the board to review`
                  : `${expansionTids.length} expansion teams · ${totalPicks} picks · pick ${Math.min(currentPick, totalPicks)} of ${totalPicks}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isComplete ? (
              <>
                <button
                  onClick={() => setIsSimulating(s => !s)}
                  disabled={isUserOnClock}
                  className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 rounded flex items-center gap-1.5"
                >
                  {isSimulating ? <><Pause className="w-3 h-3" /> Pause</> : <><Play className="w-3 h-3" /> Auto Sim</>}
                </button>
                <select
                  value={simSpeed}
                  onChange={(e) => setSimSpeed(e.target.value as SimSpeed)}
                  className="bg-zinc-800 text-xs px-2 py-1.5 rounded"
                >
                  <option value="fastest">Fastest</option>
                  <option value="normal">Normal</option>
                  <option value="slow">Slow</option>
                </select>
                <button
                  onClick={simToEnd}
                  className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 rounded flex items-center gap-1.5"
                >
                  <FastForward className="w-3 h-3" /> Sim to End
                </button>
              </>
            ) : (
              <>
                <span className="text-emerald-400 text-xs flex items-center gap-1.5 mr-2">
                  <CheckCircle className="w-4 h-4" /> Complete
                </span>
                <button
                  onClick={handleExit}
                  className="px-4 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 rounded font-semibold flex items-center gap-1.5"
                >
                  Exit
                </button>
              </>
            )}
            {!isComplete && (
              <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white" title="Close">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_400px]">
          {/* Left: Draft Board */}
          <div className="overflow-y-auto p-4">
            {!isComplete && teamOnClock && (
              <OnTheClockCard
                team={teamOnClock}
                pick={currentPick}
                isUser={!!isUserOnClock}
              />
            )}

            <FullDraftTable
              drafted={picked}
              draftOrder={draftOrderTeams}
              onReview={() => { /* no-op for expansion */ }}
              currentPick={currentPick}
              userTeamId={userTid >= 0 ? userTid : null}
              isGM={isGM}
            />
          </div>

          {/* Right: Available Players */}
          <div className="border-l border-zinc-800 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800">
              <h3 className="text-sm font-semibold">Available · {availableForUser.length}</h3>
              <p className="text-xs text-zinc-500">
                Sorted by K2 OVR. Max {maxPerTeam} per existing team.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {availableForUser.map((player, i) => (
                <PoolRow
                  key={player.internalId}
                  player={player}
                  rank={i + 1}
                  currentYear={state.leagueStats?.year ?? new Date().getFullYear()}
                  canPick={!isComplete && (!isGM || isUserOnClock)}
                  onPick={() => pickPlayer(player)}
                />
              ))}
              {availableForUser.length === 0 && (
                <p className="text-center text-zinc-500 text-sm py-8">No eligible players left.</p>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

// ─── Sub-Komponenten ───────────────────────────────────────────────────────

const OnTheClockCard: React.FC<{ team: DraftBoardTeam; pick: number; isUser: boolean }> = ({ team, pick, isUser }) => (
  <div className={`bg-zinc-900 border rounded-md p-4 mb-4 flex items-center gap-4 ${
    isUser ? 'border-amber-500/70 shadow-[0_0_14px_rgba(245,158,11,0.35)]' : 'border-zinc-700'
  }`}>
    <Clock className="w-5 h-5 text-zinc-400" />
    <div className="w-12 h-12 rounded relative overflow-hidden bg-indigo-900/50 flex items-center justify-center font-bold text-sm">
      <span className="absolute inset-0 flex items-center justify-center pointer-events-none">{team.abbrev}</span>
      {team.logoUrl && (
        <img
          src={team.logoUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-contain"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
    </div>
    <div className="flex-1">
      {isUser && (
        <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-0.5">
          You're on the clock
        </div>
      )}
      <p className="text-sm">
        With the <strong>{pick}{getOrdinalSuffix(pick)}</strong> pick of the expansion draft,
        the <strong>{getTeamFullName(team)}</strong> select…
      </p>
    </div>
  </div>
);

const PoolRow: React.FC<{
  player: DraftableExpansionPlayer;
  rank: number;
  currentYear: number;
  canPick: boolean;
  onPick: () => void;
}> = ({ player, rank, currentYear, canPick, onPick }) => {
  const salaryM = ((player.contract?.amount ?? 0) * 1000) / 1_000_000;
  const age = player.born?.year ? currentYear - player.born.year : (player.age ?? null);
  const meta: string[] = [];
  if (player.pos) meta.push(player.pos);
  if (age != null) meta.push(`${age}y`);
  if (salaryM > 0) meta.push(`$${salaryM.toFixed(1)}M`);
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/50 hover:bg-zinc-900">
      <span className="w-6 text-xs font-mono text-zinc-500">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{player.name}</div>
        <div className="text-[10px] text-zinc-500">
          {meta.join(' · ') || '—'}
        </div>
      </div>
      <span className="font-mono text-sm">{player._k2}</span>
      {canPick && (
        <button
          onClick={onPick}
          className="px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 rounded"
        >
          Pick
        </button>
      )}
    </div>
  );
};
