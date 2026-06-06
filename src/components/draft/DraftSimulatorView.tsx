import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useGame } from '../../store/GameContext';
import { normalizeDate } from '../../utils/helpers';
import { getDraftCombineStartDate, getDraftDate, isDraftBlockedByUnresolvedPlayoffs, toISODateString } from '../../utils/dateUtils';
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
import { computeDraftPickFields, getOrdinalSuffix, MAX_DRAFT_POOL_SIZE } from './simulator/helpers';
import { FullDraftTable } from './simulator/FullDraftTable';
import { isPbaIsolatedMode } from '../../utils/uiMode';
import { buildDraftProspects, buildPbaDraftOrderTeams, type DraftSimulatorProspect } from './DraftSimulatorView.helpers';
import { DraftBoardSection, PreDraftProspectsPanel } from './DraftSimulatorViewSections';
import { fuzzRatingValue } from '../../utils/scoutingFuzz';
import { isOnRoster } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';
import { getPbaComparisonPool, getPbaDraftPool } from '../../services/pba/draftRules';

interface DraftSimulatorViewProps {
  onViewChange?: (view: string) => void;
}

const teamIdOf = (team: any): number | null => {
  const id = Number(team?.id ?? team?.tid);
  return Number.isFinite(id) ? id : null;
};

export const DraftSimulatorView: React.FC<DraftSimulatorViewProps> = ({ onViewChange }) => {
  const { state, dispatchAction: dispatch } = useGame();
  const pbaMode = isPbaIsolatedMode(state);
  const savedDraftOrder = (state as any).activeDraftOrder as DraftOrderTeam[] | undefined;
  const leagueYear = getLsYear(state);
  const draftDate = toISODateString(getDraftDate(leagueYear, state.leagueStats));
  const combineDate = toISODateString(getDraftCombineStartDate(leagueYear, state.leagueStats as any));
  const today = normalizeDate(state.date);
  const draftLabel = pbaMode ? 'PBA Draft' : 'NBA Draft';
  const isDraftTime = pbaMode
    ? (state.leagueStats as any)?.pbaConferencePhase === 'offseason'
    : today >= draftDate && !isDraftBlockedByUnresolvedPlayoffs(state);
  const isDraftDone = !!(state as any).draftComplete;
  const showCombineTab = pbaMode || today >= combineDate;

  const pbaDraftPoolCount = useMemo(
    () => pbaMode ? getPbaDraftPool(state.players).length : 0,
    [pbaMode, state.players],
  );

  const computedDraftOrder = useMemo(() => {
    if (pbaMode) {
      return buildPbaDraftOrderTeams((state as any).nonNBATeams ?? [], state.boxScores ?? [], leagueYear, pbaDraftPoolCount);
    }
    return buildDraftOrderFromState(state);
  }, [leagueYear, pbaDraftPoolCount, pbaMode, state.boxScores, state.draftLotteryResult, state.draftPicks, state.teams, (state as any).nonNBATeams]);

  const draftJerseyTeams = useMemo(() => {
    if (!pbaMode) return state.teams as any[];
    const pbaTeams = ((state as any).nonNBATeams ?? [])
      .filter((team: any) => team?.league === 'PBA')
      .map((team: any) => ({
        ...team,
        id: team.tid ?? team.id,
      }));
    return [...(state.teams as any[]), ...pbaTeams];
  }, [pbaMode, state.teams, (state as any).nonNBATeams]);

  const allProspects = useMemo(
    () => buildDraftProspects(state.players, leagueYear, pbaMode).slice(0, MAX_DRAFT_POOL_SIZE),
    [state.players, leagueYear, pbaMode],
  );

  const activePlayers = useMemo(
    () =>
      (pbaMode
        ? getPbaComparisonPool(state.players)
        : state.players.filter(
            player =>
              player.tid >= 0 &&
              isOnRoster(player) &&
              player.status !== 'Draft Prospect' &&
              player.status !== 'Prospect' &&
              ((player as any).draft?.year ?? 0) < leagueYear,
          )),
    [state.players, leagueYear, pbaMode],
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
  const savedPassedPicks: Record<number, true> = (state as any).activeDraftPassedPicks ?? {};
  const savedProgressSlots = [
    ...Object.keys(savedDraftPicks).map(Number),
    ...Object.keys(savedPassedPicks).map(Number),
  ].filter(Number.isFinite);
  const [currentPick, setCurrentPick] = useState<number>(() =>
    savedProgressSlots.length > 0 ? Math.max(...savedProgressSlots) + 1 : 1,
  );
  const [drafted, setDrafted] = useState<Record<number, DraftSimulatorProspect>>(() => savedDraftPicks);
  const [passedPicks, setPassedPicks] = useState<Record<number, true>>(() => savedPassedPicks);
  const [posFilter, setPosFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'ovr' | 'pot' | SkillAxis>('ovr');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSpeed, setSimSpeed] = useState('normal');
  const [hasStarted, setHasStarted] = useState<boolean>(() => savedProgressSlots.length > 0);
  const [scoutingPlayer, setScoutingPlayer] = useState<DraftSimulatorProspect | null>(null);
  const [viewingBioPlayer, setViewingBioPlayer] = useState<NBAPlayer | null>(null);
  const [draftFinalized, setDraftFinalized] = useState(false);
  const [simTarget, setSimTarget] = useState<number | null>(null);
  const [gistByYear, setGistByYear] = useState<GistProspect[] | null>(() => pbaMode ? null : getCachedDraftScouting(leagueYear) ?? null);

  const draftOrder = useMemo(() => {
    if ((savedDraftOrder?.length ?? 0) === 0) return computedDraftOrder;
    return savedDraftOrder!.map((team, index) => {
      const pickSlot = index + 1;
      return pickSlot < currentPick ? team : (computedDraftOrder[index] ?? team);
    });
  }, [computedDraftOrder, currentPick, savedDraftOrder]);

  const draftedSet = useMemo(() => new Set(Object.values(drafted).map(player => player.internalId)), [drafted]);
  const passedPickSet = useMemo(() => new Set(Object.keys(passedPicks).map(Number)), [passedPicks]);

  const sortedPool = useMemo(() => {
    const pool = allProspects.filter(player => !draftedSet.has(player.internalId));
    if (sortBy === 'pot') {
      return [...pool].sort((a, b) =>
        fuzzRatingValue((b.displayPot ?? 0), state, b as NBAPlayer, 'draft-view-pot') -
        fuzzRatingValue((a.displayPot ?? 0), state, a as NBAPlayer, 'draft-view-pot'),
      );
    }
    if (sortBy === 'ovr') {
      return [...pool].sort((a, b) =>
        fuzzRatingValue((b.displayOvr ?? 0), state, b as NBAPlayer, 'draft-view-ovr') -
        fuzzRatingValue((a.displayOvr ?? 0), state, a as NBAPlayer, 'draft-view-ovr'),
      );
    }
    return [...pool].sort(
      (a, b) =>
        computeSkillScores(b as NBAPlayer)[sortBy as SkillAxis] -
        computeSkillScores(a as NBAPlayer)[sortBy as SkillAxis],
    );
  }, [allProspects, draftedSet, sortBy, state]);

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
  const isUserOnClock = isGM && userTeamId != null && teamIdOf(teamOnClock) === Number(userTeamId);
  const userPickSlots = useMemo(() => {
    if (!isGM || userTeamId == null) return [] as number[];
    return draftOrder
      .map((team, index) => (teamIdOf(team) === Number(userTeamId) ? index + 1 : -1))
      .filter(slot => slot > 0);
  }, [draftOrder, isGM, userTeamId]);
  const userRemainingPicks = useMemo(
    () => userPickSlots.filter(slot => slot >= currentPick),
    [currentPick, userPickSlots],
  );
  const nextUserPick = userRemainingPicks[0] ?? null;
  const userHasMorePicks = nextUserPick != null;
  const getDraftRoundForPick = useCallback(
    (pickSlot: number, team?: DraftOrderTeam) => pbaMode ? ((team as any)?._round ?? ((team as any)?._r2 ? 2 : 1)) : (pickSlot <= 30 ? 1 : 2),
    [pbaMode],
  );

  const shouldEndDraftAfterPass = useCallback(
    (pickSlot: number, passedAfter: Record<number, true>) => {
      if (pickSlot >= draftOrder.length) return true;
      if (!pbaMode) return false;
      const round = getDraftRoundForPick(pickSlot, draftOrder[pickSlot - 1]);
      if (round < 2) return false;
      const roundSlots = draftOrder
        .map((team, index) => ({ slot: index + 1, round: getDraftRoundForPick(index + 1, team) }))
        .filter(entry => entry.round === round)
        .map(entry => entry.slot);
      const lastRoundSlot = roundSlots[roundSlots.length - 1] ?? 0;
      return pickSlot >= lastRoundSlot && roundSlots.every(slot => passedAfter[slot]);
    },
    [draftOrder, getDraftRoundForPick, pbaMode],
  );

  const shouldAiPassPick = useCallback(
    (pickSlot: number, player?: DraftSimulatorProspect) => {
      if (!player) return true;
      if (!pbaMode) return false;
      const round = getDraftRoundForPick(pickSlot, draftOrder[pickSlot - 1]);
      return round >= 2 && (player.displayOvr ?? 0) < 50 && (player.displayPot ?? 0) < 55;
    },
    [draftOrder, getDraftRoundForPick, pbaMode],
  );

  useEffect(() => {
    if (pbaMode) {
      setGistByYear(null);
      return;
    }
    let cancelled = false;
    ensureDraftScouting(leagueYear).then(data => {
      if (!cancelled) setGistByYear(data);
    });
    return () => { cancelled = true; };
  }, [leagueYear, pbaMode]);

  const buildDraftedPlayerUpdate = useCallback(
    (pickSlot: number) => computeDraftPickFields(pickSlot, draftOrder[pickSlot - 1], state.leagueStats),
    [draftOrder, state.leagueStats],
  );

  const commitPassToState = useCallback(
    (pickSlot: number, passedAfter: Record<number, true>) => {
      const team = draftOrder[pickSlot - 1];
      if (!team) return;
      const allPicksDone = shouldEndDraftAfterPass(pickSlot, passedAfter);
      const draftSeason = state.leagueStats?.year ?? leagueYear;
      const round = getDraftRoundForPick(pickSlot, team);
      const teamId = teamIdOf(team);
      const originalTid = (team as any)?._originalTid ?? teamId ?? -1;
      const draftPicksAfter = (state.draftPicks ?? []).filter(
        draftPick => !(draftPick.season === draftSeason && draftPick.round === round && draftPick.originalTid === originalTid),
      );

      dispatch({
        type: 'UPDATE_STATE',
        payload: {
          draftPicks: draftPicksAfter,
          activeDraftPicks: drafted,
          activeDraftPassedPicks: passedAfter,
          activeDraftOrder: draftOrder,
          ...(allPicksDone ? { draftComplete: true } : {}),
          history: [
            ...(state.history ?? []),
            {
              text: `The ${getTeamFullName(team as any) || team.name} pass on the ${pickSlot}${getOrdinalSuffix(pickSlot)} overall pick of the ${draftSeason} ${draftLabel}.`,
              date: state.date,
              type: 'Draft',
              playerIds: [],
            },
          ],
        },
      } as any);
    },
    [dispatch, draftLabel, draftOrder, drafted, getDraftRoundForPick, leagueYear, shouldEndDraftAfterPass, state.date, state.draftPicks, state.history, state.leagueStats?.year],
  );

  const commitPickToState = useCallback(
    (pickSlot: number, player: DraftSimulatorProspect) => {
      const update = buildDraftedPlayerUpdate(pickSlot);
      if (!update) return;

      const activeDraftPicksAfter: Record<number, DraftSimulatorProspect> = { ...drafted, [pickSlot]: player };
      const team = draftOrder[pickSlot - 1];
      const teamId = teamIdOf(team);
      if (teamId == null) return;
      const allPicksDone = pickSlot >= draftOrder.length;
      const draftSeason = state.leagueStats?.year ?? leagueYear;
      const retired = new Set<string>(((team as any)?.retiredJerseyNumbers ?? []).map((entry: any) => String(entry.number)));
      const taken = new Set<string>(
        state.players
          .filter(entry => entry.tid === teamId && entry.jerseyNumber && entry.internalId !== player.internalId)
          .map(entry => String(entry.jerseyNumber)),
      );
      const existingNumber = player.jerseyNumber ? String(player.jerseyNumber) : '';
      const jerseyNumber = !existingNumber || retired.has(existingNumber)
        ? pickJerseyNumber(new Set([...retired, ...taken]))
        : existingNumber;
      const updatedPlayers = state.players.map(entry => {
        if (entry.internalId !== player.internalId) return entry;
        const existingTx = (entry as any).transactions ?? [];
        const hasDraftTx = existingTx.some((tx: any) => tx?.type === 'draft' && tx?.season === draftSeason);
        const nextTransactions = hasDraftTx
          ? existingTx
          : [...existingTx, { season: draftSeason, tid: teamId, type: 'draft', phase: 0, pickNum: pickSlot }];
        return { ...entry, ...update, jerseyNumber, signedDate: state.date, transactions: nextTransactions };
      });
      const round = getDraftRoundForPick(pickSlot, team);
      const originalTid = (team as any)?._originalTid ?? teamId;
      const draftPicksAfter = (state.draftPicks ?? []).filter(
        draftPick => !(draftPick.season === draftSeason && draftPick.round === round && draftPick.originalTid === originalTid),
      );

      dispatch({
        type: 'UPDATE_STATE',
        payload: {
          players: normalizeTeamJerseyNumbers(updatedPlayers as any, draftJerseyTeams as any, leagueYear, {
            history: state.history,
            targetTeamIds: [teamId],
          }),
          draftPicks: draftPicksAfter,
          activeDraftPicks: activeDraftPicksAfter,
          activeDraftPassedPicks: passedPicks,
          activeDraftOrder: draftOrder,
          ...(allPicksDone ? { draftComplete: true } : {}),
          history: [
            ...(state.history ?? []),
            {
              text: `The ${getTeamFullName(team as any) || team.name} select ${player.name} as the ${pickSlot}${getOrdinalSuffix(pickSlot)} overall pick of the ${draftSeason} ${draftLabel}.`,
              date: state.date,
              type: 'Draft',
              playerIds: [player.internalId],
            },
          ],
        },
      } as any);
    },
    [buildDraftedPlayerUpdate, dispatch, draftJerseyTeams, draftLabel, draftOrder, drafted, getDraftRoundForPick, leagueYear, passedPicks, state.date, state.draftPicks, state.history, state.leagueStats?.year, state.players],
  );

  const draftPlayer = useCallback(
    (player: DraftSimulatorProspect) => {
      setHasStarted(true);
      setDrafted(previous => ({ ...previous, [currentPick]: player }));
      commitPickToState(currentPick, player);
      if (currentPick >= draftOrder.length) {
        setIsSimulating(false);
        setSimTarget(null);
      }
      setCurrentPick(previous => previous + 1);
    },
    [commitPickToState, currentPick, draftOrder.length],
  );

  const passCurrentPick = useCallback(() => {
    if (isDraftComplete || !teamOnClock) return;
    const nextPassed = { ...passedPicks, [currentPick]: true as const };
    const endsDraft = shouldEndDraftAfterPass(currentPick, nextPassed);
    setHasStarted(true);
    setPassedPicks(nextPassed);
    commitPassToState(currentPick, nextPassed);
    if (endsDraft) {
      setIsSimulating(false);
      setSimTarget(null);
    }
    setCurrentPick(previous => endsDraft ? draftOrder.length + 1 : previous + 1);
  }, [commitPassToState, currentPick, draftOrder.length, isDraftComplete, passedPicks, shouldEndDraftAfterPass, teamOnClock]);

  const simToPickInstant = useCallback(
    (targetPick: number) => {
      setIsSimulating(false);
      setSimTarget(null);
      setHasStarted(true);

      const newPicks: Record<number, DraftSimulatorProspect> = { ...drafted };
      const newPassedPicks: Record<number, true> = { ...passedPicks };
      const usedIds = new Set(Object.values(newPicks).map(player => player.internalId));
      const pool = allProspects.filter(player => !usedIds.has(player.internalId));
      let poolIndex = 0;
      let pickNum = currentPick;
      const freshPicks: Array<{ slot: number; player: DraftSimulatorProspect }> = [];
      const freshPasses: number[] = [];

      while (pickNum < targetPick) {
        const top = pool[poolIndex++];
        if (shouldAiPassPick(pickNum, top)) {
          newPassedPicks[pickNum] = true;
          freshPasses.push(pickNum);
          if (shouldEndDraftAfterPass(pickNum, newPassedPicks)) {
            pickNum = draftOrder.length + 1;
            break;
          }
          pickNum++;
          continue;
        }
        if (!top) break;
        newPicks[pickNum] = top;
        freshPicks.push({ slot: pickNum, player: top });
        pickNum++;
      }

      setDrafted(newPicks);
      setPassedPicks(newPassedPicks);
      setCurrentPick(pickNum);

      if (freshPicks.length === 0 && freshPasses.length === 0) return;

      const batchRetiredByTeam = new Map<number, Set<string>>();
      const batchTakenByTeam = new Map<number, Set<string>>();

      for (const team of draftJerseyTeams as any[]) {
        const teamId = teamIdOf(team);
        if (teamId != null) {
          batchRetiredByTeam.set(teamId, new Set((team.retiredJerseyNumbers ?? []).map((entry: any) => String(entry.number))));
        }
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
        const teamId = teamIdOf(team);
        const retired = teamId != null ? batchRetiredByTeam.get(teamId) ?? new Set<string>() : new Set<string>();
        const taken = teamId != null ? batchTakenByTeam.get(teamId) ?? new Set<string>() : new Set<string>();
        const existingNumber = player.jerseyNumber ? String(player.jerseyNumber) : '';
        const jerseyNumber = !existingNumber || retired.has(existingNumber)
          ? pickJerseyNumber(new Set([...retired, ...taken]))
          : existingNumber;

        if (teamId != null) {
          if (!batchTakenByTeam.has(teamId)) batchTakenByTeam.set(teamId, new Set());
          batchTakenByTeam.get(teamId)!.add(jerseyNumber);
        }
        updateMap.set(player.internalId, { ...update, jerseyNumber });
      }

      const draftSeason = state.leagueStats?.year ?? leagueYear;
      const updatedPlayers = state.players.map(player => {
        const patch = updateMap.get(player.internalId);
        if (!patch) return player;
        const slot = freshPicks.find(p => p.player.internalId === player.internalId)?.slot;
        const teamForPick = slot ? draftOrder[slot - 1] : null;
        const teamForPickId = teamIdOf(teamForPick);
        const existingTx = (player as any).transactions ?? [];
        const hasDraftTx = existingTx.some((tx: any) => tx?.type === 'draft' && tx?.season === draftSeason);
        const nextTransactions = hasDraftTx || !slot || teamForPickId == null
          ? existingTx
          : [...existingTx, { season: draftSeason, tid: teamForPickId, type: 'draft', phase: 0, pickNum: slot }];
        return { ...player, ...patch, signedDate: state.date, transactions: nextTransactions };
      });
      const consumedKeys = new Set(
        [...freshPicks.map(pick => pick.slot), ...freshPasses].map(slot => {
          const team = draftOrder[slot - 1];
          const round = getDraftRoundForPick(slot, team);
          const originalTid = (team as any)?._originalTid ?? teamIdOf(team) ?? -1;
          return `${draftSeason}|${round}|${originalTid}`;
        }),
      );
      const draftPicksAfter = (state.draftPicks ?? []).filter(
        draftPick => !consumedKeys.has(`${draftPick.season}|${draftPick.round}|${draftPick.originalTid}`),
      );
      const allPicksDone = pickNum > draftOrder.length || targetPick > draftOrder.length;

      dispatch({
        type: 'UPDATE_STATE',
        payload: {
          players: normalizeTeamJerseyNumbers(updatedPlayers as any, draftJerseyTeams as any, leagueYear, {
            history: state.history,
            targetTeamIds: freshPicks.map(pick => teamIdOf(draftOrder[pick.slot - 1])).filter((id): id is number => id != null),
          }),
          draftPicks: draftPicksAfter,
          activeDraftPicks: newPicks,
          activeDraftPassedPicks: newPassedPicks,
          activeDraftOrder: draftOrder,
          history: [
            ...(state.history ?? []),
            ...freshPasses.map(slot => {
              const team = draftOrder[slot - 1];
              return {
                text: `The ${getTeamFullName(team as any) || 'Team'} pass on the ${slot}${getOrdinalSuffix(slot)} overall pick of the ${draftSeason} ${draftLabel}.`,
                date: state.date,
                type: 'Draft',
                playerIds: [],
              };
            }),
            ...freshPicks.map(({ slot, player }) => {
              const team = draftOrder[slot - 1];
                return {
                  text: `The ${getTeamFullName(team as any) || 'Team'} select ${player.name} as the ${slot}${getOrdinalSuffix(slot)} overall pick of the ${draftSeason} ${draftLabel}.`,
                  date: state.date,
                  type: 'Draft',
                  playerIds: [player.internalId],
                };
            }),
          ],
          ...(allPicksDone ? { draftComplete: true } : {}),
        },
      } as any);
    },
    [allProspects, buildDraftedPlayerUpdate, currentPick, dispatch, draftJerseyTeams, draftLabel, draftOrder, drafted, getDraftRoundForPick, leagueYear, passedPicks, shouldAiPassPick, shouldEndDraftAfterPass, state.date, state.draftPicks, state.history, state.leagueStats?.year, state.players],
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
      if (shouldAiPassPick(currentPick, top)) {
        passCurrentPick();
      } else if (top) {
        draftPlayer(top);
      }
    }, speedMs[simSpeed] ?? 800);

    return () => clearTimeout(timer);
  }, [available, currentPick, draftPlayer, isDraftComplete, isSimulating, passCurrentPick, scoutingPlayer, shouldAiPassPick, simSpeed, simTarget]);

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
    const pbaDraftPoolIds = pbaMode
      ? new Set(getPbaDraftPool(state.players).map(player => player.internalId))
      : null;
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
        (!pbaDraftPoolIds || pbaDraftPoolIds.has(player.internalId)) &&
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
        activeDraftPassedPicks: undefined,
        activeDraftOrder: undefined,
      },
    } as any);
    setDraftFinalized(true);
  }, [dispatch, draftOrder, drafted, pbaMode, state.draftPicks, state.leagueStats, state.players]);

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
          draftLabel={draftLabel}
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
          onPassPick={passCurrentPick}
          onToggleAutoSim={onToggleAutoSim}
          onSetSimSpeed={setSimSpeed}
          state={state}
        />
      )}

      {!isDraftTime && !isDraftDone && allProspects.length > 0 && (
        <PreDraftProspectsPanel
          allProspects={allProspects}
          draftDateLabel={draftDateLabel}
          draftLabel={draftLabel}
          leagueYear={leagueYear}
          onViewPlayer={setViewingBioPlayer}
          state={state}
        />
      )}

      {isDraftTime && !isDraftDone && draftOrder.length > 0 && (
        <FullDraftTable
          drafted={drafted}
          passedPicks={passedPickSet}
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
        showCombineTab={showCombineTab}
      />
    </div>
  );
};
