import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useGame } from '../../store/GameContext';
import { normalizeDate } from '../../utils/helpers';
import { getDraftDate, isDraftBlockedByUnresolvedPlayoffs, toISODateString } from '../../utils/dateUtils';
import { getLsYear } from '../../utils/leagueYear';
import { normalizeTeamJerseyNumbers, pickJerseyNumber } from '../../utils/jerseyUtils';
import type { NBAPlayer } from '../../types';
import { DraftScoutingModal } from './DraftScoutingModal';
import { buildDraftOrderFromState, type DraftOrderTeam } from '../../services/draft/draftOrder';
import {
  batchComparisonsDeduped,
  computeSkillScores,
  getClassAverages,
  getClassPercentiles,
  type ClassPercentileMaps,
  type SkillAxis,
} from '../../services/scoutingReport';
import { ensureDraftScouting, getCachedDraftScouting, matchProspectToGist, type GistProspect } from '../../services/draftScoutingGist';
import { PlayerBioView } from '../central/view/PlayerBioView';
import { computeDraftPickFields, MAX_DRAFT_POOL_SIZE } from './simulator/helpers';
import { FullDraftTable } from './simulator/FullDraftTable';
import { isPbaIsolatedMode } from '../../utils/uiMode';
import { buildDraftProspects, buildPbaDraftOrderTeams, type DraftSimulatorProspect } from './DraftSimulatorView.helpers';
import { DraftBoardSection, PreDraftProspectsPanel } from './DraftSimulatorViewSections';

interface DraftSimulatorViewProps {
  onViewChange?: (view: string) => void;
}

export const DraftSimulatorView: React.FC<DraftSimulatorViewProps> = ({ onViewChange }) => {
  const { state, dispatchAction: dispatch } = useGame();
  const pbaMode = isPbaIsolatedMode(state);
  const savedDraftOrder = (state as any).activeDraftOrder as DraftOrderTeam[] | undefined;
  const leagueYear = getLsYear(state);
  const draftDate = toISODateString(getDraftDate(leagueYear, state.leagueStats));
  const today = normalizeDate(state.date);
  const isDraftTime = pbaMode
    ? (state.leagueStats as any)?.pbaConferencePhase === 'offseason'
    : today >= draftDate && !isDraftBlockedByUnresolvedPlayoffs(state);
  const isDraftDone = !!(state as any).draftComplete;

  const computedDraftOrder = useMemo(() => {
    if (pbaMode) {
      return buildPbaDraftOrderTeams((state as any).nonNBATeams ?? []);
    }
    return buildDraftOrderFromState(state);
  }, [pbaMode, state.leagueStats?.year, state.draftLotteryResult, state.draftPicks, state.teams, (state as any).nonNBATeams]);

  const allProspects = useMemo(
    () => buildDraftProspects(state.players, leagueYear, pbaMode).slice(0, MAX_DRAFT_POOL_SIZE),
    [state.players, leagueYear, pbaMode],
  );

  const activePlayers = useMemo(
    () =>
      state.players.filter(
        player =>
          player.tid >= 0 &&
          player.tid < 100 &&
          player.status !== 'Draft Prospect' &&
          player.status !== 'Prospect' &&
          ((player as any).draft?.year ?? 0) < leagueYear,
      ),
    [state.players, leagueYear],
  );

  const classAverages = useMemo(() => getClassAverages(allProspects), [allProspects]);
  const percentilesByPos = useMemo(() => {
    const maps = new Map<string, ClassPercentileMaps>();
    maps.set('Guard', getClassPercentiles(allProspects, 'Guard'));
    maps.set('Forward', getClassPercentiles(allProspects, 'Forward'));
    maps.set('Center', getClassPercentiles(allProspects, 'Center'));
    maps.set('Class', getClassPercentiles(allProspects, 'Class'));
    return maps;
  }, [allProspects]);

  const batchComps = useMemo(
    () => batchComparisonsDeduped(allProspects as unknown as NBAPlayer[], activePlayers),
    [allProspects, activePlayers],
  );

  const savedDraftPicks: Record<number, DraftSimulatorProspect> = (state as any).activeDraftPicks ?? {};
  const savedPickCount = Object.keys(savedDraftPicks).length;
  const [currentPick, setCurrentPick] = useState<number>(() =>
    savedPickCount > 0 ? Math.max(...Object.keys(savedDraftPicks).map(Number)) + 1 : 1,
  );
  const [drafted, setDrafted] = useState<Record<number, DraftSimulatorProspect>>(() => savedDraftPicks);
  const [posFilter, setPosFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'ovr' | 'pot' | SkillAxis>('ovr');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSpeed, setSimSpeed] = useState('normal');
  const [hasStarted, setHasStarted] = useState<boolean>(() => savedPickCount > 0);
  const [scoutingPlayer, setScoutingPlayer] = useState<DraftSimulatorProspect | null>(null);
  const [viewingBioPlayer, setViewingBioPlayer] = useState<NBAPlayer | null>(null);
  const [draftFinalized, setDraftFinalized] = useState(false);
  const [simTarget, setSimTarget] = useState<number | null>(null);
  const [gistByYear, setGistByYear] = useState<GistProspect[] | null>(getCachedDraftScouting(leagueYear) ?? null);

  const draftOrder = useMemo(() => {
    if ((savedDraftOrder?.length ?? 0) === 0) return computedDraftOrder;
    return savedDraftOrder!.map((team, index) => {
      const pickSlot = index + 1;
      return pickSlot < currentPick ? team : (computedDraftOrder[index] ?? team);
    });
  }, [computedDraftOrder, currentPick, savedDraftOrder]);

  const draftedSet = useMemo(() => new Set(Object.values(drafted).map(player => player.internalId)), [drafted]);

  const sortedPool = useMemo(() => {
    const pool = allProspects.filter(player => !draftedSet.has(player.internalId));
    if (sortBy === 'pot') {
      return [...pool].sort((a, b) => (b.displayPot ?? 0) - (a.displayPot ?? 0));
    }
    if (sortBy === 'ovr') {
      return pool;
    }
    return [...pool].sort(
      (a, b) =>
        computeSkillScores(b as NBAPlayer)[sortBy as SkillAxis] -
        computeSkillScores(a as NBAPlayer)[sortBy as SkillAxis],
    );
  }, [allProspects, draftedSet, sortBy]);

  const rankById = useMemo(() => {
    const ranks = new Map<any, number>();
    sortedPool.forEach((player, index) => ranks.set(player.internalId, index + 1));
    return ranks;
  }, [sortedPool]);

  const available = useMemo(
    () => sortedPool.filter(player => posFilter === 'ALL' || (player.pos ?? '').includes(posFilter)),
    [posFilter, sortedPool],
  );

  const teamOnClock = draftOrder[currentPick - 1];
  const nextTeam = draftOrder[currentPick];
  const isDraftComplete = currentPick > draftOrder.length;
  const isGM = state.gameMode === 'gm';
  const userTeamId = state.userTeamId;
  const isUserOnClock = isGM && userTeamId != null && teamOnClock?.id === userTeamId;
  const userPickSlots = useMemo(() => {
    if (!isGM || userTeamId == null) return [] as number[];
    return draftOrder
      .map((team, index) => (team?.id === userTeamId ? index + 1 : -1))
      .filter(slot => slot > 0);
  }, [draftOrder, isGM, userTeamId]);
  const userRemainingPicks = useMemo(
    () => userPickSlots.filter(slot => slot >= currentPick),
    [currentPick, userPickSlots],
  );
  const nextUserPick = userRemainingPicks[0] ?? null;
  const userHasMorePicks = nextUserPick != null;

  useEffect(() => {
    let cancelled = false;
    ensureDraftScouting(leagueYear).then(data => {
      if (!cancelled) setGistByYear(data);
    });
    return () => { cancelled = true; };
  }, [leagueYear]);

  const buildDraftedPlayerUpdate = useCallback(
    (pickSlot: number) => computeDraftPickFields(pickSlot, draftOrder[pickSlot - 1], state.leagueStats),
    [draftOrder, state.leagueStats],
  );

  const commitPickToState = useCallback(
    (pickSlot: number, player: DraftSimulatorProspect) => {
      const update = buildDraftedPlayerUpdate(pickSlot);
      if (!update) return;

      const activeDraftPicksAfter: Record<number, DraftSimulatorProspect> = { ...drafted, [pickSlot]: player };
      const team = draftOrder[pickSlot - 1];
      const retired = new Set<string>(((team as any)?.retiredJerseyNumbers ?? []).map((entry: any) => String(entry.number)));
      const taken = new Set<string>(
        state.players
          .filter(entry => entry.tid === team?.id && entry.jerseyNumber && entry.internalId !== player.internalId)
          .map(entry => String(entry.jerseyNumber)),
      );
      const existingNumber = player.jerseyNumber ? String(player.jerseyNumber) : '';
      const jerseyNumber = !existingNumber || retired.has(existingNumber)
        ? pickJerseyNumber(new Set([...retired, ...taken]))
        : existingNumber;
      const updatedPlayers = state.players.map(entry =>
        entry.internalId === player.internalId ? { ...entry, ...update, jerseyNumber } : entry,
      );
      const draftSeason = state.leagueStats?.year ?? leagueYear;
      const round = pickSlot <= 30 ? 1 : 2;
      const originalTid = (team as any)?._originalTid ?? team?.id;
      const draftPicksAfter = (state.draftPicks ?? []).filter(
        draftPick => !(draftPick.season === draftSeason && draftPick.round === round && draftPick.originalTid === originalTid),
      );

      dispatch({
        type: 'UPDATE_STATE',
        payload: {
          players: normalizeTeamJerseyNumbers(updatedPlayers as any, state.teams as any, leagueYear, {
            history: state.history,
            targetTeamIds: team?.id != null ? [team.id] : [],
          }),
          draftPicks: draftPicksAfter,
          activeDraftPicks: activeDraftPicksAfter,
          activeDraftOrder: draftOrder,
        },
      } as any);
    },
    [buildDraftedPlayerUpdate, dispatch, draftOrder, drafted, leagueYear, state.draftPicks, state.history, state.leagueStats?.year, state.players, state.teams],
  );

  const draftPlayer = useCallback(
    (player: DraftSimulatorProspect) => {
      setHasStarted(true);
      setDrafted(previous => ({ ...previous, [currentPick]: player }));
      commitPickToState(currentPick, player);
      setCurrentPick(previous => previous + 1);
    },
    [commitPickToState, currentPick],
  );

  const simToPickInstant = useCallback(
    (targetPick: number) => {
      setIsSimulating(false);
      setSimTarget(null);
      setHasStarted(true);

      const newPicks: Record<number, DraftSimulatorProspect> = { ...drafted };
      const usedIds = new Set(Object.values(newPicks).map(player => player.internalId));
      const pool = allProspects.filter(player => !usedIds.has(player.internalId));
      let poolIndex = 0;
      let pickNum = currentPick;
      const freshPicks: Array<{ slot: number; player: DraftSimulatorProspect }> = [];

      while (pickNum < targetPick && poolIndex < pool.length) {
        const top = pool[poolIndex++];
        newPicks[pickNum] = top;
        freshPicks.push({ slot: pickNum, player: top });
        pickNum++;
      }

      setDrafted(newPicks);
      setCurrentPick(pickNum);

      if (freshPicks.length === 0) return;

      const batchRetiredByTeam = new Map<number, Set<string>>();
      const batchTakenByTeam = new Map<number, Set<string>>();

      for (const team of state.teams as any[]) {
        batchRetiredByTeam.set(team.id, new Set((team.retiredJerseyNumbers ?? []).map((entry: any) => String(entry.number))));
      }
      for (const player of state.players as any[]) {
        if (player.tid >= 0 && player.jerseyNumber) {
          if (!batchTakenByTeam.has(player.tid)) batchTakenByTeam.set(player.tid, new Set());
          batchTakenByTeam.get(player.tid)!.add(String(player.jerseyNumber));
        }
      }

      const updateMap = new Map<string, object>();
      for (const { slot, player } of freshPicks) {
        const update = buildDraftedPlayerUpdate(slot);
        if (!update) continue;
        const team = draftOrder[slot - 1];
        const retired = batchRetiredByTeam.get(team?.id) ?? new Set<string>();
        const taken = batchTakenByTeam.get(team?.id) ?? new Set<string>();
        const existingNumber = player.jerseyNumber ? String(player.jerseyNumber) : '';
        const jerseyNumber = !existingNumber || retired.has(existingNumber)
          ? pickJerseyNumber(new Set([...retired, ...taken]))
          : existingNumber;

        if (team?.id != null) {
          if (!batchTakenByTeam.has(team.id)) batchTakenByTeam.set(team.id, new Set());
          batchTakenByTeam.get(team.id)!.add(jerseyNumber);
        }
        updateMap.set(player.internalId, { ...update, jerseyNumber });
      }

      const updatedPlayers = state.players.map(player =>
        updateMap.has(player.internalId) ? { ...player, ...updateMap.get(player.internalId) } : player,
      );
      const draftSeason = state.leagueStats?.year ?? leagueYear;
      const consumedKeys = new Set(
        freshPicks.map(({ slot }) => {
          const team = draftOrder[slot - 1];
          const round = slot <= 30 ? 1 : 2;
          const originalTid = (team as any)?._originalTid ?? team?.id;
          return `${draftSeason}|${round}|${originalTid}`;
        }),
      );
      const draftPicksAfter = (state.draftPicks ?? []).filter(
        draftPick => !consumedKeys.has(`${draftPick.season}|${draftPick.round}|${draftPick.originalTid}`),
      );
      const allPicksDone = targetPick > draftOrder.length;

      dispatch({
        type: 'UPDATE_STATE',
        payload: {
          players: normalizeTeamJerseyNumbers(updatedPlayers as any, state.teams as any, leagueYear, {
            history: state.history,
            targetTeamIds: freshPicks.map(pick => draftOrder[pick.slot - 1]?.id).filter((id): id is number => id != null),
          }),
          draftPicks: draftPicksAfter,
          activeDraftPicks: newPicks,
          activeDraftOrder: draftOrder,
          ...(allPicksDone ? { draftComplete: true } : {}),
        },
      } as any);
    },
    [allProspects, buildDraftedPlayerUpdate, currentPick, dispatch, draftOrder, drafted, leagueYear, state.draftPicks, state.history, state.leagueStats?.year, state.players, state.teams],
  );

  const onToggleAutoSim = useCallback(() => {
    if (isSimulating) {
      setIsSimulating(false);
      setSimTarget(null);
      return;
    }
    if (isGM && userHasMorePicks) {
      setSimTarget(nextUserPick);
    } else {
      setSimTarget(null);
    }
    setIsSimulating(true);
    setHasStarted(true);
  }, [isGM, isSimulating, nextUserPick, userHasMorePicks]);

  useEffect(() => {
    if (!isSimulating || isDraftComplete || scoutingPlayer) return;
    if (simTarget != null && currentPick >= simTarget) {
      setIsSimulating(false);
      setSimTarget(null);
      return;
    }

    const speedMs: Record<string, number> = {
      fastest: 200,
      normal: 800,
      slow: 1500,
      slower: 3000,
      dramatic: 5000,
    };
    const timer = setTimeout(() => {
      const top = available[0];
      if (top) draftPlayer(top);
    }, speedMs[simSpeed] ?? 800);

    return () => clearTimeout(timer);
  }, [available, currentPick, draftPlayer, isDraftComplete, isSimulating, scoutingPlayer, simSpeed, simTarget]);

  const onConfirmPickForScouting = useCallback(() => {
    if (!scoutingPlayer) return;
    const pick = currentPick;
    setHasStarted(true);
    setDrafted(previous => ({ ...previous, [pick]: scoutingPlayer }));
    commitPickToState(pick, scoutingPlayer);
    setCurrentPick(pick + 1);
    setScoutingPlayer(null);
  }, [commitPickToState, currentPick, scoutingPlayer]);

  const finalizeDraft = useCallback(() => {
    const leagueStats = state.leagueStats ?? {};
    const season = getLsYear({ leagueStats } as any);
    const updatedPlayers = state.players.map(player => {
      const pickEntry = Object.entries(drafted).find(([, draftedPlayer]) => draftedPlayer.internalId === player.internalId);
      if (!pickEntry) return player;
      const pickSlot = Number(pickEntry[0]);
      const fields = computeDraftPickFields(pickSlot, draftOrder[pickSlot - 1], leagueStats);
      return fields ? { ...player, ...fields } : player;
    });
    const draftedIds = new Set(Object.values(drafted).map(player => player.internalId));
    const finalPlayers = updatedPlayers.map(player => {
      const draftYear = (player as any).draft?.year;
      const isCurrentClass = !draftYear || Number(draftYear) === season;
      if (
        isCurrentClass &&
        (player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect') &&
        !draftedIds.has(player.internalId)
      ) {
        return { ...player, tid: -1, status: 'Free Agent' as const };
      }
      return player;
    });
    const draftPicksAfter = (state.draftPicks ?? []).filter(pick => pick.season !== season);

    dispatch({
      type: 'UPDATE_STATE',
      payload: {
        players: finalPlayers,
        draftPicks: draftPicksAfter,
        draftComplete: true,
        activeDraftPicks: undefined,
        activeDraftOrder: undefined,
      },
    } as any);
    setDraftFinalized(true);
  }, [dispatch, draftOrder, drafted, state.draftPicks, state.leagueStats, state.players]);

  useEffect(() => {
    if (isDraftComplete && hasStarted && !draftFinalized) {
      finalizeDraft();
    }
  }, [draftFinalized, finalizeDraft, hasStarted, isDraftComplete]);

  useEffect(() => {
    if (isDraftDone && onViewChange) {
      onViewChange('Draft History');
    }
  }, [isDraftDone, onViewChange]);

  if (viewingBioPlayer) {
    return <PlayerBioView player={viewingBioPlayer} onBack={() => setViewingBioPlayer(null)} />;
  }

  const canConfirmScoutingPick =
    ((!isGM || isUserOnClock) &&
      !isDraftComplete &&
      !Object.values(drafted).some(player => player?.internalId === scoutingPlayer?.internalId)) ||
    false;
  const draftDateLabel = getDraftDate(leagueYear, state.leagueStats).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="container mx-auto px-4 py-6">
      {isDraftTime && !isDraftDone && (
        <DraftBoardSection
          allProspects={allProspects}
          available={available}
          rankById={rankById}
          draftedSet={draftedSet}
          currentPick={currentPick}
          draftYear={state.leagueStats?.year ?? ''}
          teamOnClock={teamOnClock}
          nextTeam={nextTeam}
          isDraftComplete={isDraftComplete}
          hasStarted={hasStarted}
          isGM={isGM}
          isUserOnClock={isUserOnClock}
          userHasMorePicks={userHasMorePicks}
          nextUserPick={nextUserPick}
          isSimulating={isSimulating}
          simSpeed={simSpeed}
          posFilter={posFilter}
          sortBy={sortBy}
          userTeamId={userTeamId}
          players={state.players}
          onSetPosFilter={setPosFilter}
          onSetSortBy={setSortBy}
          onOpenScoutingPlayer={setScoutingPlayer}
          onSimToMyPick={() => simToPickInstant(nextUserPick ?? currentPick)}
          onSimToEnd={() => simToPickInstant(draftOrder.length + 1)}
          onToggleAutoSim={onToggleAutoSim}
          onSetSimSpeed={setSimSpeed}
        />
      )}

      {!isDraftTime && !isDraftDone && allProspects.length > 0 && (
        <PreDraftProspectsPanel
          allProspects={allProspects}
          draftDateLabel={draftDateLabel}
          leagueYear={leagueYear}
          onViewPlayer={setViewingBioPlayer}
        />
      )}

      {isDraftTime && !isDraftDone && draftOrder.length > 0 && (
        <FullDraftTable
          drafted={drafted}
          draftOrder={draftOrder}
          onReview={player => setScoutingPlayer(player)}
          currentPick={currentPick}
          userTeamId={userTeamId ?? null}
          isGM={isGM}
        />
      )}

      <DraftScoutingModal
        player={scoutingPlayer}
        onClose={() => setScoutingPlayer(null)}
        classProspects={allProspects as unknown as NBAPlayer[]}
        activePlayers={activePlayers}
        percentilesByPos={percentilesByPos}
        classAverages={classAverages}
        draftYear={leagueYear}
        gistData={scoutingPlayer && gistByYear ? matchProspectToGist(scoutingPlayer, gistByYear) : null}
        onViewPlayerBio={player => {
          setScoutingPlayer(null);
          setViewingBioPlayer(player);
        }}
        onConfirmPick={canConfirmScoutingPick ? onConfirmPickForScouting : undefined}
        pickLabel={`Pick #${currentPick}`}
        preComputedComps={scoutingPlayer ? batchComps.get((scoutingPlayer as NBAPlayer).internalId) : undefined}
      />
    </div>
  );
};
