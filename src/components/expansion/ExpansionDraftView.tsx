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
import type { NBAPlayer, NBATeam } from '../../types';
import { FullDraftTable } from '../draft/simulator/FullDraftTable';
import { getOrdinalSuffix } from '../draft/simulator/helpers';
import { getTeamFullName } from '../../utils/teamNames';
import { getDisplayPotential } from '../../utils/playerRatings';
import { getHistoricalTeamSnapshot } from '../../utils/teamAssets';
import { getPlayerImage } from '../../utils/playerImage';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { getDisplayOverall } from '../../store/playerRatingStore';
import { formatExternalSalary } from '../../constants';
import { getExpansionLeague, isPrimaryExpansionRosterPlayer } from '../../services/expansion/expansionLeagueScope';

interface Props {
  onClose: () => void;
}

type DraftBoardTeam = Pick<NBATeam, 'id' | 'name' | 'abbrev' | 'region' | 'logoUrl'> & {
  tid?: number;
};
type DraftableExpansionPlayer = NBAPlayer & {
  _ovr: number;
  _aiScore: number;
  displayOvr?: number;
  displayPot?: number;
};
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

function getOriginalTeamId(player: NBAPlayer, isPbaExpansion: boolean): number {
  const expansionTransaction = player.transactions?.find(transaction => transaction.type === 'expansion-draft');
  const expansionOriginalTid = Number((expansionTransaction as any)?.originalTid);
  if (Number.isFinite(expansionOriginalTid)) return expansionOriginalTid;

  const previousNonExpansionTransaction = [...(player.transactions ?? [])]
    .reverse()
    .find(transaction =>
      transaction.type !== 'expansion-draft'
      && (isPbaExpansion
        ? transaction.tid >= 2000 && transaction.tid < 3000
        : transaction.tid >= 0 && transaction.tid < 100)
    );
  return previousNonExpansionTransaction?.tid ?? player.tid;
}

function buildDraftableExpansionPlayer(player: NBAPlayer, currentYear: number): DraftableExpansionPlayer {
  const ovr = getDisplayOverall(player);
  const pot = getDisplayPotential(player, currentYear);
  const yearsLeft = Math.max(0, (player.contract?.exp ?? currentYear) - currentYear);
  const expiringPenalty = yearsLeft === 0 ? -20 : 0;
  const lengthBonus = Math.min(15, Math.max(0, (yearsLeft - 1) * 5));
  return {
    ...player,
    displayOvr: ovr,
    displayPot: pot,
    _ovr: ovr,
    _aiScore: ovr + expiringPenalty + lengthBonus,
  };
}

export const ExpansionDraftView: React.FC<Props> = ({ onClose }) => {
  const { state, dispatchAction: dispatch } = useGame();

  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const expansionTids = state.expansionTeamIds ?? [];
  const picksPerTeam = state.expansionProtectionSettings?.picksPerExpansionTeam ?? 14;
  const maxPerTeam = state.expansionProtectionSettings?.maxDraftedPerTeam ?? 2;
  const userTid = state.userTeamId ?? -999;
  const isGM = state.gameMode === 'gm';
  const isPbaExpansion = state.expansionSchedule?.league === 'pba';
  const expansionLeague = getExpansionLeague(state.expansionSchedule);

  // Pick-Order (statisch, einmal berechnen)
  const pickOrder = useMemo(() => buildRoundRobinOrder(expansionTids, picksPerTeam), [expansionTids, picksPerTeam]);
  const totalPicks = pickOrder.length;

  // Resolve Team-Object pro Slot (für FullDraftTable)
  const draftOrderTeams = useMemo<DraftBoardTeam[]>(() => {
    const teams = isPbaExpansion
      ? state.nonNBATeams
          .filter(team => team.league === 'PBA')
          .map(team => ({
            id: team.tid,
            tid: team.tid,
            name: team.name,
            abbrev: team.abbrev ?? 'PBA',
            region: team.region,
            logoUrl: team.imgURL,
          }))
      : (state.teams ?? []) as DraftBoardTeam[];
    return pickOrder.map(tid => {
      const team = teams.find(entry => findTeamId(entry) === tid);
      if (!team) return { id: tid, name: `Team ${tid}`, abbrev: '?', logoUrl: undefined };
      return isPbaExpansion ? team : getHistoricalTeamSnapshot(team, currentYear);
    });
  }, [currentYear, isPbaExpansion, pickOrder, state.nonNBATeams, state.teams]);

  const pool = useMemo<DraftableExpansionPlayer[]>(() => {
    const eligibleIds = new Set(state.expansionEligiblePlayers ?? []);
    // Defense-in-Depth gegen Save-Drift: tid<100 + Status-Filter doppelt prüfen,
    // falls expansionEligiblePlayers von einem alten Save mit WNBA/Euroleague-
    // Leaks befüllt wurde (vor dem Reducer-Fix).
    const pbaTeamIds = new Set(
      state.nonNBATeams.filter(team => team.league === 'PBA').map(team => team.tid),
    );
    const primaryTeamIds = new Set(state.teams.map(team => team.id));
    return (state.players ?? [])
      .filter(player => {
        if (!eligibleIds.has(player.internalId)) return false;
        if (isPbaExpansion) {
          return pbaTeamIds.has(player.tid) && player.status === 'PBA';
        }
        return isPrimaryExpansionRosterPlayer(player, primaryTeamIds, expansionLeague);
      })
      .map(player => buildDraftableExpansionPlayer(player, currentYear))
      .sort((a, b) => b._ovr - a._ovr); // UI: OVR desc; AI uses _aiScore separately.
  }, [currentYear, expansionLeague, isPbaExpansion, state.expansionEligiblePlayers, state.nonNBATeams, state.players, state.teams]);

  const savedPicked = useMemo<Record<number, DraftableExpansionPlayer>>(() => {
    const activePicks = ((state as any).activeExpansionDraftPicks ?? {}) as Record<number, NBAPlayer>;
    const activeEntries = Object.entries(activePicks)
      .map(([pick, player]) => [Number(pick), player] as const)
      .filter(([pick, player]) => Number.isFinite(pick) && !!player);
    if (activeEntries.length > 0) {
      return Object.fromEntries(
        activeEntries.map(([pick, player]) => [pick, buildDraftableExpansionPlayer(player, currentYear)]),
      ) as Record<number, DraftableExpansionPlayer>;
    }

    const reconstructed: Record<number, DraftableExpansionPlayer> = {};
    for (const player of (state.players ?? []) as NBAPlayer[]) {
      const tx = player.transactions?.find(transaction =>
        transaction.type === 'expansion-draft' &&
        transaction.season === currentYear &&
        Number.isFinite(Number(transaction.pickNum))
      );
      if (!tx?.pickNum) continue;
      reconstructed[Number(tx.pickNum)] = buildDraftableExpansionPlayer(player, currentYear);
    }
    return reconstructed;
  }, [(state as any).activeExpansionDraftPicks, state.players, currentYear]);

  const savedProgressSlots = useMemo(
    () => Object.keys(savedPicked).map(Number).filter(Number.isFinite),
    [savedPicked],
  );

  // Lokaler State
  const [picked, setPicked] = useState<Record<number, DraftableExpansionPlayer>>(() => savedPicked);
  const [currentPick, setCurrentPick] = useState(() =>
    savedProgressSlots.length > 0 ? Math.min(totalPicks + 1, Math.max(...savedProgressSlots) + 1) : 1,
  );
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSpeed, setSimSpeed] = useState<SimSpeed>('normal');
  const [hasStarted, setHasStarted] = useState(() => savedProgressSlots.length > 0);

  const draftedIds = useMemo(() => new Set(Object.values(picked).map((p) => p.internalId)), [picked]);
  const isComplete = currentPick > totalPicks;

  // Per-original-team count (für maxPerTeam-Constraint)
  const drainedByOriginalTid = useMemo(() => {
    const counts: Record<number, number> = {};
    Object.values(picked).forEach(player => {
      const originalTid = getOriginalTeamId(player, isPbaExpansion);
      counts[originalTid] = (counts[originalTid] ?? 0) + 1;
    });
    return counts;
  }, [isPbaExpansion, picked]);

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
      payload: { tid: tidOnClock, playerId: player.internalId, pick: currentPick },
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
      // AI pick: highest _aiScore (OVR + length bonus - expiring penalty).
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
        payload: { tid: tidOnClock, playerId: candidate.internalId, pick: cur },
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
        className="fixed inset-0 z-[220] bg-black flex flex-col"
      >
        {/* Header */}
        <div className="flex flex-col gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-3 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
            <MapIcon className="w-5 h-5 text-indigo-400" />
              <div className="min-w-0">
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
            {!isComplete && (
              <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white" title="Close">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto xl:overflow-hidden">
          <div className="grid min-h-full grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px]">
          {/* Left: Draft Board */}
          <div className="order-2 xl:order-1 min-h-0 overflow-y-visible xl:overflow-y-auto p-3 sm:p-4">
            {!isComplete && teamOnClock && (
              <OnTheClockCard
                team={teamOnClock}
                pick={currentPick}
                isUser={!!isUserOnClock}
              />
            )}

            <FullDraftTable
              drafted={picked}
              passedPicks={new Set()}
              draftOrder={draftOrderTeams}
              onReview={() => { /* no-op for expansion */ }}
              currentPick={currentPick}
              userTeamId={userTid >= 0 ? userTid : null}
              isGM={isGM}
            />
          </div>

          {/* Right: Available Players */}
          <div className="order-1 xl:order-2 border-b xl:border-b-0 xl:border-l border-zinc-800 flex flex-col overflow-hidden min-h-[320px] xl:min-h-0 bg-black/20">
            <div className="px-4 py-3 border-b border-zinc-800">
              <h3 className="text-sm font-semibold">Available · {availableForUser.length}</h3>
              <p className="text-xs text-zinc-500">
                Sorted by OVR. Max {maxPerTeam} per existing team.
              </p>
            </div>
            <div className="px-3 py-2 border-b border-zinc-900 grid grid-cols-[1.5rem_2.5rem_minmax(0,1fr)_2.5rem_2.5rem_auto] gap-2 text-[9px] font-black uppercase tracking-widest text-zinc-600">
              <span>#</span>
              <span />
              <span>Player</span>
              <span className="text-right">OVR</span>
              <span className="text-right">POT</span>
              <span className="w-10" />
            </div>
            <div className="flex-1 overflow-y-auto max-h-[55vh] xl:max-h-none overscroll-contain">
              {availableForUser.map((player, i) => {
                const originalTid = getOriginalTeamId(player, isPbaExpansion);
                const teamLogoUrl = isPbaExpansion
                  ? state.nonNBATeams.find(team => team.league === 'PBA' && team.tid === originalTid)?.imgURL
                  : (() => {
                      const originalTeam = (state.teams ?? []).find(team => findTeamId(team) === originalTid);
                      return originalTeam ? getHistoricalTeamSnapshot(originalTeam, currentYear).logoUrl : undefined;
                    })();
                return (
                  <PoolRow
                    key={player.internalId}
                    player={player}
                    rank={i + 1}
                    currentYear={currentYear}
                    teamLogoUrl={teamLogoUrl}
                    isPba={isPbaExpansion}
                    canPick={!isComplete && (!isGM || isUserOnClock)}
                    onPick={() => pickPlayer(player)}
                  />
                );
              })}
              {availableForUser.length === 0 && (
                <p className="text-center text-zinc-500 text-sm py-8">No eligible players left.</p>
              )}
            </div>
          </div>
        </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

// ─── Sub-Komponenten ───────────────────────────────────────────────────────

const OnTheClockCard: React.FC<{ team: DraftBoardTeam; pick: number; isUser: boolean }> = ({ team, pick, isUser }) => (
  <div className={`bg-zinc-900 border rounded-md p-3 sm:p-4 mb-4 flex items-center gap-3 sm:gap-4 ${
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
  teamLogoUrl?: string;
  isPba: boolean;
  canPick: boolean;
  onPick: () => void;
}> = ({ player, rank, currentYear, teamLogoUrl, isPba, canPick, onPick }) => {
  const salaryM = ((player.contract?.amount ?? 0) * 1000) / 1_000_000;
  const age = player.born?.year ? currentYear - player.born.year : (player.age ?? null);
  const meta: string[] = [];
  if (player.pos) meta.push(player.pos);
  if (age != null) meta.push(`${age}y`);
  if (salaryM > 0) meta.push(isPba
    ? formatExternalSalary((player.contract?.amount ?? 0) * 1_000, 'PBA')
    : `$${salaryM.toFixed(1)}M`);
  return (
    <div className="grid grid-cols-[1.5rem_2.5rem_minmax(0,1fr)_2.5rem_2.5rem_auto] items-center gap-2 px-3 py-2 border-b border-zinc-800/50 hover:bg-zinc-900">
      <span className="text-xs font-mono text-zinc-500">{rank}</span>
      <PlayerPortrait
        imgUrl={getPlayerImage(player)}
        fallbackImgUrl={player.imgURL}
        face={(player as any).face}
        playerName={player.name}
        teamLogoUrl={teamLogoUrl}
        size={36}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{player.name}</div>
        <div className="text-[10px] text-zinc-500">
          {meta.join(' · ') || '—'}
        </div>
      </div>
      <span className="font-mono text-sm text-right text-sky-300">{player._ovr}</span>
      <span className="font-mono text-sm text-right text-emerald-300">{player.displayPot ?? '—'}</span>
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
