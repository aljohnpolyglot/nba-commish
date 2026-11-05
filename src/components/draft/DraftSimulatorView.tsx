import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../../store/GameContext';
import { UNDRAFTED_OVR_CAP } from '../../constants';
import { normalizeDate } from '../../utils/helpers';
import { getDraftCombineStartDate, getDraftDate, isDraftBlockedByUnresolvedPlayoffs, toISODateString } from '../../utils/dateUtils';
import { getLsYear } from '../../utils/leagueYear';
import { normalizeTeamJerseyNumbers, pickJerseyNumber } from '../../utils/jerseyUtils';
import type { NBAPlayer } from '../../types';
import { DraftScoutingModal } from './DraftScoutingModal';
import { ConfirmationModal } from '../modals/ConfirmationModal';
import { buildDraftOrderFromState, type DraftOrderTeam } from '../../services/draft/draftOrder';
import {
  batchComparisonsDeduped,
  computeSkillScores,
  type SkillAxis,
} from '../../services/scoutingReport';
import { ensureDraftScouting, getCachedDraftScouting, matchProspectToGist, type GistProspect } from '../../services/draftScoutingGist';
import { PlayerActionsModal } from '../shared/PlayerActionsModal';
import { computeDraftPickFields, getOrdinalSuffix, MAX_DRAFT_POOL_SIZE } from './simulator/helpers';
import { isPbaIsolatedMode } from '../../utils/uiMode';
import { buildDraftProspects, buildFantasyDraftProspects, buildPbaDraftOrderTeams, type DraftSimulatorProspect } from './DraftSimulatorView.helpers';
import { DraftBoardSection, PreDraftProspectsPanel } from './DraftSimulatorViewSections';
import { fuzzDraftRatingValue } from '../../utils/scoutingFuzz';
import { isOnRoster } from '../../utils/teamLookup';
import { isExternalLeaguePlayer } from '../../utils/playerLeagueScope';
import { getTeamFullName } from '../../utils/teamNames';
import { getPbaComparisonPool, getPbaDraftPool, tunePbaDraftProspects } from '../../services/pba/draftRules';
import { selectAiDraftProspect } from '../../services/draft/aiDraftBoard';
import { isCurrentDraftClassComplete } from '../../services/draft/DraftPickGenerator';
import { appendLiveDraftSelection } from '../../services/draft/draftHistoryLiveState';
import { isPrimaryNbaComparisonCandidate } from './DraftScoutingModalShared';
import { getDraftSeasonYearForState } from '../../services/offseason/offseasonState';
import { lifecycleWithDraftProgress } from '../../services/lifecycle/leagueSeasonLifecycle';
import { buildDraftSelectionPatch } from '../../services/draft/draftSelection';

interface DraftSimulatorViewProps {
  onViewChange?: (view: string) => void;
}

const teamIdOf = (team: any): number | null => {
  const id = Number(team?.id ?? team?.tid);
  return Number.isFinite(id) ? id : null;
};

export const DraftSimulatorView: React.FC<DraftSimulatorViewProps> = ({ onViewChange }) => {
  const { state, dispatchAction: dispatch, navigateToPlayer } = useGame();
  const [pendingAdvance, setPendingAdvance] = useState<'end' | 'auto' | 'pass' | null>(null);
  const pbaMode = isPbaIsolatedMode(state);
  const isFictional = state.leagueType === 'fictional';
  const initialFantasyDraft = isFictional
    && state.leagueStats.fictionalRosterMode === 'fantasy_draft';
  const fantasyDraftMode = initialFantasyDraft
    && state.leagueStats.fictionalFantasyDraftCompleted !== true;
  const savedDraftOrder = (state as any).activeDraftOrder as DraftOrderTeam[] | undefined;
  const leagueYear = fantasyDraftMode ? getLsYear(state) : getDraftSeasonYearForState(state);
  const draftDate = toISODateString(getDraftDate(leagueYear, state.leagueStats));
  const combineDate = toISODateString(getDraftCombineStartDate(leagueYear, state.leagueStats as any));
  const today = normalizeDate(state.date);
  const draftLabel = fantasyDraftMode ? 'Association Fantasy Draft' : pbaMode ? 'PBA Draft' : 'NBA Draft';
  const allowDraftPickPasses = !fantasyDraftMode && (pbaMode || (state.leagueStats as any)?.draftPickPassesEnabled === true);
  const isDraftTime = fantasyDraftMode || (pbaMode
    ? (state.leagueStats as any)?.pbaConferencePhase === 'offseason'
      && state.offseasonChecklist?.pbaDraft === 'in-progress'
      && today >= draftDate
    : today >= draftDate && !isDraftBlockedByUnresolvedPlayoffs(state));
  const isDraftDone = isCurrentDraftClassComplete(state);
  const showCombineTab = today >= combineDate;

  const pbaDraftPoolCount = useMemo(
    () => pbaMode ? getPbaDraftPool(state.players, leagueYear, state.leagueStats).length : 0,
    [leagueYear, pbaMode, state.leagueStats, state.players],
  );

  const computedDraftOrder = useMemo(() => {
    if (fantasyDraftMode) return savedDraftOrder ?? [];
    if (pbaMode) {
      return buildPbaDraftOrderTeams((state as any).nonNBATeams ?? [], state.boxScores ?? [], leagueYear, pbaDraftPoolCount, state.draftPicks);
    }
    return buildDraftOrderFromState(state);
  }, [fantasyDraftMode, leagueYear, pbaDraftPoolCount, pbaMode, savedDraftOrder, state.boxScores, state.draftLotteryResult, state.draftPicks, state.seasonLifecycle, state.teams, (state as any).nonNBATeams]);

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

  const scopedPlayers = useMemo(
    () => isFictional ? state.players.filter(player => !isExternalLeaguePlayer(player)) : state.players,
    [isFictional, state.players],
  );
  const draftPoolLimit = Math.max(MAX_DRAFT_POOL_SIZE, computedDraftOrder.length + 20);

  const draftClassProspects = useMemo(
    () => fantasyDraftMode
      ? buildFantasyDraftProspects(scopedPlayers, leagueYear)
      : buildDraftProspects(scopedPlayers, leagueYear, pbaMode, state.leagueStats),
    [fantasyDraftMode, scopedPlayers, leagueYear, pbaMode, state.leagueStats],
  );
  const allProspects = useMemo(
    () => fantasyDraftMode
      ? draftClassProspects
      : draftClassProspects.slice(0, draftPoolLimit),
    [draftClassProspects, draftPoolLimit, fantasyDraftMode],
  );

  const activePlayers = useMemo(
    () =>
      (pbaMode
        ? getPbaComparisonPool(scopedPlayers)
        : scopedPlayers.filter(
            player =>
              isPrimaryNbaComparisonCandidate(player) &&
              isOnRoster(player) &&
              player.status !== 'Draft Prospect' &&
              player.status !== 'Prospect' &&
              ((player as any).draft?.year ?? 0) < leagueYear,
          )),
    [scopedPlayers, leagueYear, pbaMode],
  );

  const batchComps = useMemo(
    () => batchComparisonsDeduped(allProspects as unknown as NBAPlayer[], activePlayers, 3, 3, pbaMode ? 'pba' : 'nba'),
    [allProspects, activePlayers, pbaMode],
  );

  const savedDraftPicks: Record<number, DraftSimulatorProspect> = (state as any).activeDraftPicks ?? {};
  const savedPassedPicks: Record<number, true> = (state as any).activeDraftPassedPicks ?? {};
  const savedProgressSlots = [
    ...Object.keys(savedDraftPicks).map(Number),
    ...Object.keys(savedPassedPicks).map(Number),
  ].filter(Number.isFinite);
  const [currentPick, setCurrentPick] = useState<number>(() => {
    let slot = 1;
    while (slot <= computedDraftOrder.length && (savedDraftPicks[slot] || savedPassedPicks[slot] || computedDraftOrder[slot - 1]._forfeited)) slot++;
    return slot;
  });
  const [drafted, setDrafted] = useState<Record<number, DraftSimulatorProspect>>(() => savedDraftPicks);
  const [passedPicks, setPassedPicks] = useState<Record<number, true>>(() => savedPassedPicks);
  const draftedRef = useRef<Record<number, DraftSimulatorProspect>>(savedDraftPicks);
  const passedPicksRef = useRef<Record<number, true>>(savedPassedPicks);
  const [posFilter, setPosFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'ovr' | 'pot' | SkillAxis>('ovr');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSpeed, setSimSpeed] = useState('normal');
  const [hasStarted, setHasStarted] = useState<boolean>(() => savedProgressSlots.length > 0);
  const [scoutingPlayer, setScoutingPlayer] = useState<DraftSimulatorProspect | null>(null);
  const [actionsPlayer, setActionsPlayer] = useState<DraftSimulatorProspect | null>(null);
  const [pendingCommissionerPick, setPendingCommissionerPick] = useState<DraftSimulatorProspect | null>(null);
  const [draftFinalized, setDraftFinalized] = useState(false);
  const [simTarget, setSimTarget] = useState<number | null>(null);
  const [gistByYear, setGistByYear] = useState<GistProspect[] | null>(() => pbaMode || isFictional ? null : getCachedDraftScouting(leagueYear) ?? null);

  const draftOrder = useMemo(() => {
    if ((savedDraftOrder?.length ?? 0) === 0) return computedDraftOrder;
    return savedDraftOrder!.map((team, index) => {
      const pickSlot = index + 1;
      return pickSlot < currentPick && !computedDraftOrder[index]?._forfeited ? team : (computedDraftOrder[index] ?? team);
    });
  }, [computedDraftOrder, currentPick, savedDraftOrder]);

  const draftedSet = useMemo(() => new Set(Object.values(drafted).map(player => player.internalId)), [drafted]);

  const sortedPool = useMemo(() => {
    const pool = allProspects.filter(player => !draftedSet.has(player.internalId));
    if (sortBy === 'pot') {
      return [...pool].sort((a, b) =>
        fuzzDraftRatingValue((b.displayPot ?? 0), state, b as NBAPlayer, 'pot') -
        fuzzDraftRatingValue((a.displayPot ?? 0), state, a as NBAPlayer, 'pot'),
      );
    }
    if (sortBy === 'ovr') {
      return [...pool].sort((a, b) =>
        fuzzDraftRatingValue((b.displayOvr ?? 0), state, b as NBAPlayer, 'ovr') -
        fuzzDraftRatingValue((a.displayOvr ?? 0), state, a as NBAPlayer, 'ovr'),
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

  const selectAiProspect = useCallback(
    (pickSlot: number, pool: DraftSimulatorProspect[]): DraftSimulatorProspect | undefined => {
      const teamId = teamIdOf(draftOrder[pickSlot - 1]);
      if (teamId == null || pool.length === 0) return pool[0];
      return selectAiDraftProspect({ state, teamId, pickSlot, season: leagueYear, pool });
    },
    [draftOrder, leagueYear, state],
  );

  const teamOnClock = draftOrder[currentPick - 1];
  const nextTeam = draftOrder[currentPick];
  const isDraftComplete = currentPick > draftOrder.length;
  const isGM = state.gameMode === 'gm';
  const userTeamId = state.userTeamId;
  const isUserOnClock = isGM && !teamOnClock?._forfeited && userTeamId != null && teamIdOf(teamOnClock) === Number(userTeamId);
  const userPickSlots = useMemo(() => {
    if (!isGM || userTeamId == null) return [] as number[];
    return draftOrder
      .map((team, index) => (!team._forfeited && teamIdOf(team) === Number(userTeamId) ? index + 1 : -1))
      .filter(slot => slot > 0);
  }, [draftOrder, isGM, userTeamId]);
  const userRemainingPicks = useMemo(
    () => userPickSlots.filter(slot => slot >= currentPick),
    [currentPick, userPickSlots],
  );
  const nextUserPick = userRemainingPicks[0] ?? null;
  const userHasMorePicks = nextUserPick != null;
  const getDraftRoundForPick = useCallback(
    (pickSlot: number, team?: DraftOrderTeam) => fantasyDraftMode
      ? ((team as any)?._round ?? Math.ceil(pickSlot / Math.max(1, state.teams.length)))
      : (Number((team as any)?._round) || ((team as any)?._r2 ? 2 : (pickSlot <= (Number((team as any)?._roundSize) || 30) ? 1 : 2))),
    [fantasyDraftMode, pbaMode, state.teams.length],
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
      if (!allowDraftPickPasses) return false;
      if (!player) return true;
      if (!pbaMode) return false;
      const round = getDraftRoundForPick(pickSlot, draftOrder[pickSlot - 1]);
      return round >= 2 && (player.displayOvr ?? 0) < 50 && (player.displayPot ?? 0) < 55;
    },
    [allowDraftPickPasses, draftOrder, getDraftRoundForPick, pbaMode],
  );

  useEffect(() => {
    if (pbaMode || isFictional) {
      setGistByYear(null);
      return;
    }
    let cancelled = false;
    ensureDraftScouting(leagueYear).then(data => {
      if (!cancelled) setGistByYear(data);
    });
    return () => { cancelled = true; };
  }, [isFictional, leagueYear, pbaMode]);

  const buildDraftedPlayerUpdate = useCallback(
    (pickSlot: number) => {
      const team = draftOrder[pickSlot - 1];
      const teamId = teamIdOf(team);
      if (fantasyDraftMode) return teamId == null ? null : { tid: teamId, status: 'Active' as const };
      return computeDraftPickFields(pickSlot, team, state.leagueStats, leagueYear);
    },
    [draftOrder, fantasyDraftMode, leagueYear, state.leagueStats],
  );

  const commitPassToState = useCallback(
    (pickSlot: number, passedAfter: Record<number, true>) => {
      if (!allowDraftPickPasses) return;
      const team = draftOrder[pickSlot - 1];
      if (!team) return;
      const draftSeason = leagueYear;
      const round = getDraftRoundForPick(pickSlot, team);
      const teamId = teamIdOf(team);
      const originalTid = (team as any)?._originalTid ?? teamId ?? -1;
      const draftPicksAfter = fantasyDraftMode
        ? state.draftPicks ?? []
        : (state.draftPicks ?? []).filter(
          draftPick => !(draftPick.season === draftSeason && draftPick.round === round && draftPick.originalTid === originalTid),
        );

      dispatch({
        type: 'UPDATE_STATE',
        payload: {
          draftPicks: draftPicksAfter,
          activeDraftPicks: draftedRef.current,
          activeDraftPassedPicks: passedAfter,
          activeDraftOrder: draftOrder,
          seasonLifecycle: lifecycleWithDraftProgress(
            state,
            Object.fromEntries(Object.entries(draftedRef.current).map(([slot, draftedPlayer]) => [
              Number(slot),
              draftedPlayer.internalId,
            ])),
            Object.keys(passedAfter).map(Number),
            draftOrder.length,
            true,
          ),
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
    [allowDraftPickPasses, dispatch, draftLabel, draftOrder, fantasyDraftMode, getDraftRoundForPick, leagueYear, state.date, state.draftPicks, state.history, state.leagueStats?.year],
  );

  const commitPickToState = useCallback(
    (pickSlot: number, player: DraftSimulatorProspect, activeDraftPicksAfter: Record<number, DraftSimulatorProspect>) => {
      const team = draftOrder[pickSlot - 1];
      const patch = buildDraftSelectionPatch({
        activeDraftPicksAfter,
        draftLabel,
        draftOrderLength: draftOrder.length,
        draftSeason: leagueYear,
        fantasyDraftMode,
        jerseyTeams: draftJerseyTeams as any,
        passedSlots: Object.keys(passedPicksRef.current).map(Number),
        pickSlot,
        player,
        state,
        team,
      });
      if (!patch) return;

      dispatch({
        type: 'UPDATE_STATE',
        payload: { ...patch, activeDraftOrder: draftOrder },
      } as any);
    },
    [dispatch, draftJerseyTeams, draftLabel, draftOrder, fantasyDraftMode, leagueYear, state],
  );

  const draftPlayer = useCallback(
    (player: DraftSimulatorProspect) => {
      if (!draftOrder[currentPick - 1] || draftOrder[currentPick - 1]._forfeited) return;
      setHasStarted(true);
      const nextDrafted = appendLiveDraftSelection(draftedRef.current, currentPick, player);
      draftedRef.current = nextDrafted;
      setDrafted(nextDrafted);
      commitPickToState(currentPick, player, nextDrafted);
      if (currentPick >= draftOrder.length) {
        setIsSimulating(false);
        setSimTarget(null);
      }
      setCurrentPick(previous => previous + 1);
    },
    [commitPickToState, currentPick, draftOrder],
  );

  const passCurrentPick = useCallback(() => {
    if (!allowDraftPickPasses) return;
    if (isDraftComplete || !teamOnClock || teamOnClock._forfeited) return;
    const nextPassed = { ...passedPicksRef.current, [currentPick]: true as const };
    const endsDraft = shouldEndDraftAfterPass(currentPick, nextPassed);
    setHasStarted(true);
    passedPicksRef.current = nextPassed;
    setPassedPicks(nextPassed);
    commitPassToState(currentPick, nextPassed);
    if (endsDraft) {
      setIsSimulating(false);
      setSimTarget(null);
    }
    setCurrentPick(previous => endsDraft ? draftOrder.length + 1 : previous + 1);
  }, [allowDraftPickPasses, commitPassToState, currentPick, draftOrder.length, isDraftComplete, shouldEndDraftAfterPass, teamOnClock]);

  const simToPickInstant = useCallback(
    (targetPick: number) => {
      setIsSimulating(false);
      setSimTarget(null);
      setHasStarted(true);

      const newPicks: Record<number, DraftSimulatorProspect> = { ...draftedRef.current };
      const newPassedPicks: Record<number, true> = { ...passedPicksRef.current };
      const usedIds = new Set(Object.values(newPicks).map(player => player.internalId));
      const pool = allProspects.filter(player => !usedIds.has(player.internalId));
      let pickNum = currentPick;
      const freshPicks: Array<{ slot: number; player: DraftSimulatorProspect }> = [];
      const freshPasses: number[] = [];

      while (pickNum < targetPick) {
        if (draftOrder[pickNum - 1]?._forfeited) {
          pickNum++;
          continue;
        }
        const remaining = pool.filter(player => !usedIds.has(player.internalId));
        const top = selectAiProspect(pickNum, remaining);
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
        usedIds.add(top.internalId);
        freshPicks.push({ slot: pickNum, player: top });
        pickNum++;
      }

      draftedRef.current = newPicks;
      passedPicksRef.current = newPassedPicks;
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

      const draftSeason = leagueYear;
      const updatedPlayers = state.players.map(player => {
        const patch = updateMap.get(player.internalId);
        if (!patch) return player;
        const slot = freshPicks.find(p => p.player.internalId === player.internalId)?.slot;
        const teamForPick = slot ? draftOrder[slot - 1] : null;
        const teamForPickId = teamIdOf(teamForPick);
        const existingTx = (player as any).transactions ?? [];
        const transactionType = fantasyDraftMode ? 'fantasy_draft' : 'draft';
        const hasDraftTx = existingTx.some((tx: any) => tx?.type === transactionType && tx?.season === draftSeason);
        const nextTransactions = hasDraftTx || !slot || teamForPickId == null
          ? existingTx
          : [...existingTx, { season: draftSeason, tid: teamForPickId, type: transactionType, phase: 0, pickNum: slot }];
        return { ...player, ...patch, ...(fantasyDraftMode ? {} : { signedDate: state.date }), transactions: nextTransactions };
      });
      const consumedKeys = new Set(
        [...freshPicks.map(pick => pick.slot), ...freshPasses].map(slot => {
          const team = draftOrder[slot - 1];
          const round = getDraftRoundForPick(slot, team);
          const originalTid = (team as any)?._originalTid ?? teamIdOf(team) ?? -1;
          return `${draftSeason}|${round}|${originalTid}`;
        }),
      );
      const draftPicksAfter = fantasyDraftMode
        ? state.draftPicks ?? []
        : (state.draftPicks ?? []).filter(
          draftPick => draftPick.forfeiture || !consumedKeys.has(`${draftPick.season}|${draftPick.round}|${draftPick.originalTid}`),
        );
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
          seasonLifecycle: lifecycleWithDraftProgress(
            { ...state, players: updatedPlayers as NBAPlayer[] },
            Object.fromEntries(Object.entries(newPicks).map(([slot, draftedPlayer]) => [
              Number(slot),
              draftedPlayer.internalId,
            ])),
            Object.keys(newPassedPicks).map(Number),
            draftOrder.length,
            true,
          ),
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
        },
      } as any);
    },
    [allProspects, buildDraftedPlayerUpdate, currentPick, dispatch, draftJerseyTeams, draftLabel, draftOrder, fantasyDraftMode, getDraftRoundForPick, leagueYear, selectAiProspect, shouldAiPassPick, shouldEndDraftAfterPass, state.date, state.draftPicks, state.history, state.leagueStats?.year, state.players],
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
    if (isDraftTime && draftOrder.length > 0 && draftOrder.every(team => team._forfeited)) setHasStarted(true);
    if (!teamOnClock?._forfeited) return;
    setCurrentPick(previous => {
      let next = previous;
      while (draftOrder[next - 1]?._forfeited) next++;
      return next;
    });
  }, [draftOrder, isDraftTime, teamOnClock]);

  useEffect(() => {
    if (!isSimulating || isDraftComplete || scoutingPlayer) return;
    if (draftOrder[currentPick - 1]?._forfeited) return;
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
      const top = selectAiProspect(currentPick, allProspects.filter(player => !draftedSet.has(player.internalId)));
      if (shouldAiPassPick(currentPick, top)) {
        passCurrentPick();
      } else if (top) {
        draftPlayer(top);
      }
    }, speedMs[simSpeed] ?? 800);

    return () => clearTimeout(timer);
  }, [allProspects, currentPick, draftOrder, draftPlayer, draftedSet, isDraftComplete, isSimulating, passCurrentPick, scoutingPlayer, selectAiProspect, shouldAiPassPick, simSpeed, simTarget]);

  const completeScoutingPick = useCallback((player: DraftSimulatorProspect) => {
    if (!draftOrder[currentPick - 1] || draftOrder[currentPick - 1]._forfeited) return;
    const pick = currentPick;
    setHasStarted(true);
    const nextDrafted = appendLiveDraftSelection(draftedRef.current, pick, player);
    draftedRef.current = nextDrafted;
    setDrafted(nextDrafted);
    commitPickToState(pick, player, nextDrafted);
    setCurrentPick(pick + 1);
    setScoutingPlayer(null);
    setPendingCommissionerPick(null);
  }, [commitPickToState, currentPick, draftOrder]);

  const onConfirmPickForScouting = useCallback(() => {
    if (!scoutingPlayer) return;
    if (!isGM && !fantasyDraftMode) {
      setPendingCommissionerPick(scoutingPlayer);
      return;
    }
    completeScoutingPick(scoutingPlayer);
  }, [completeScoutingPick, fantasyDraftMode, isGM, scoutingPlayer]);

  const finalizeDraft = useCallback(() => {
    const leagueStats = state.leagueStats ?? {};
    const season = leagueYear;
    if (fantasyDraftMode) {
      const draftedIds = new Set(Object.values(drafted).map(player => player.internalId));
      const finalPlayers = state.players.map(player => {
        if (!player.fictionalFantasyDraftEligible) return player;
        return {
          ...player,
          fictionalFantasyDraftEligible: undefined,
          fictionalOriginalTid: undefined,
          ...(draftedIds.has(player.internalId)
            ? { status: 'Active' as const }
            : { tid: -1, status: 'Free Agent' as const }),
        };
      });
      dispatch({
        type: 'UPDATE_STATE',
        payload: {
          players: finalPlayers,
          draftComplete: false,
          activeDraftPicks: undefined,
          activeDraftPassedPicks: undefined,
          activeDraftOrder: undefined,
          leagueStats: { ...state.leagueStats, fictionalFantasyDraftCompleted: true },
        },
      } as any);
      onViewChange?.('Schedule');
      setDraftFinalized(true);
      return;
    }
    const tunedPlayers = pbaMode
      ? getPbaDraftPool(tunePbaDraftProspects(state.players, season, leagueStats as any), season, leagueStats as any)
      : state.players;
    const currentDraftPoolIds = new Set(draftClassProspects.map(player => player.internalId));
    const updatedPlayers = state.players.map(player => {
      const pickEntry = Object.entries(drafted).find(([, draftedPlayer]) => draftedPlayer.internalId === player.internalId);
      if (!pickEntry) return player;
      const pickSlot = Number(pickEntry[0]);
      const draftedPlayer = pickEntry[1];
      const fields = computeDraftPickFields(pickSlot, draftOrder[pickSlot - 1], leagueStats, season);
      return fields ? {
        ...player,
        pos: draftedPlayer.pos,
        overallRating: draftedPlayer.overallRating,
        potential: draftedPlayer.potential,
        ratings: draftedPlayer.ratings,
        ovrHistory: (draftedPlayer as any).ovrHistory ?? (player as any).ovrHistory,
        ovrTimeline: (draftedPlayer as any).ovrTimeline ?? (player as any).ovrTimeline,
        pbaDraftTunedVersion: (draftedPlayer as any).pbaDraftTunedVersion,
        ...fields,
      } : player;
    });
    const draftedIds = new Set(Object.values(drafted).map(player => player.internalId));
    const tunedById = new Map(tunedPlayers.map(player => [player.internalId, player]));
    const finalPlayers = updatedPlayers.map(player => {
      if (
        currentDraftPoolIds.has(player.internalId) &&
        (player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect') &&
        !draftedIds.has(player.internalId)
      ) {
        const tuned = tunedById.get(player.internalId);
        const transactions = (player as any).transactions ?? [];
        const hasUndraftedTx = transactions.some((tx: any) =>
          tx?.type === 'draft' &&
          Number(tx?.season) === season &&
          Number(tx?.pickNum ?? -1) === 0
        );
        return {
          ...player,
          pos: tuned?.pos ?? player.pos,
          overallRating: Math.min(tuned?.overallRating ?? player.overallRating ?? 99, UNDRAFTED_OVR_CAP),
          potential: tuned?.potential ?? player.potential,
          ratings: tuned?.ratings ?? player.ratings,
          ovrHistory: (tuned as any)?.ovrHistory ?? (player as any).ovrHistory,
          ovrTimeline: (tuned as any)?.ovrTimeline ?? (player as any).ovrTimeline,
          pbaDraftTunedVersion: (tuned as any)?.pbaDraftTunedVersion ?? (player as any).pbaDraftTunedVersion,
          tid: -1,
          status: 'Free Agent' as const,
          transactions: hasUndraftedTx
            ? transactions
            : [...transactions, { season, tid: -1, type: 'draft', phase: 0, pickNum: 0 }],
          draft: { round: 0, pick: 0, year: season, tid: -1, originalTid: -1 },
        };
      }
      return player;
    });
    const draftPicksAfter = (state.draftPicks ?? []).filter(pick => pick.forfeiture || pick.season !== season
      || !draftOrder.some(team => (team._originalTid ?? team.id) === pick.originalTid));

    dispatch({
      type: 'UPDATE_STATE',
      payload: {
        players: finalPlayers,
        draftPicks: draftPicksAfter,
        draftComplete: true,
        seasonLifecycle: lifecycleWithDraftProgress(
          { ...state, players: finalPlayers },
          Object.fromEntries(Object.entries(drafted).map(([slot, draftedPlayer]) => [
            Number(slot),
            draftedPlayer.internalId,
          ])),
          Object.keys(passedPicks).map(Number),
          draftOrder.length,
          true,
        ),
        ...(pbaMode ? {
          leagueStats: {
            ...state.leagueStats,
            pbaDraftComplete: true,
            pbaDraftCompleteSeason: season,
          },
        } : {}),
        activeDraftPicks: undefined,
        activeDraftPassedPicks: undefined,
        activeDraftOrder: undefined,
      },
    } as any);
    setDraftFinalized(true);
  }, [dispatch, draftClassProspects, draftOrder, drafted, fantasyDraftMode, leagueYear, onViewChange, pbaMode, state.draftPicks, state.leagueStats, state.players]);

  useEffect(() => {
    if (isDraftComplete && hasStarted && !draftFinalized) {
      finalizeDraft();
    }
  }, [draftFinalized, finalizeDraft, hasStarted, isDraftComplete]);

  useEffect(() => {
    if (isDraftDone && onViewChange && !initialFantasyDraft) {
      onViewChange('Draft History');
    }
  }, [initialFantasyDraft, isDraftDone, onViewChange]);

  const handleProspectAction = (action: string) => {
    const player = actionsPlayer;
    if (!player) return;
    setActionsPlayer(null);
    if (action === 'view_bio') navigateToPlayer(player);
    else if (action === 'view_scouting') setScoutingPlayer(player);
  };

  const canConfirmScoutingPick =
    ((!isGM || isUserOnClock) &&
      !isDraftComplete &&
      !teamOnClock?._forfeited &&
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
          draftYear={leagueYear}
          draftLabel={draftLabel}
          teamOnClock={teamOnClock}
          nextTeam={nextTeam}
          isDraftComplete={isDraftComplete}
          hasStarted={hasStarted}
          isGM={isGM}
          isUserOnClock={isUserOnClock}
          allowPassPick={allowDraftPickPasses}
          userHasMorePicks={userHasMorePicks}
          nextUserPick={nextUserPick}
          isSimulating={isSimulating}
          simSpeed={simSpeed}
          posFilter={posFilter}
          sortBy={sortBy}
          userTeamId={userTeamId}
          players={scopedPlayers}
          onSetPosFilter={setPosFilter}
          onSetSortBy={setSortBy}
          onOpenPlayerActions={setActionsPlayer}
          onOpenScoutingPlayer={setScoutingPlayer}
          onSimToMyPick={() => simToPickInstant(nextUserPick ?? currentPick)}
          onSimToEnd={() => setPendingAdvance('end')}
          onPassPick={() => setPendingAdvance('pass')}
          onToggleAutoSim={() => isSimulating ? onToggleAutoSim() : setPendingAdvance('auto')}
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
          onViewPlayer={navigateToPlayer}
          state={state}
        />
      )}

      <DraftScoutingModal
        player={scoutingPlayer}
        onClose={() => setScoutingPlayer(null)}
        classProspects={allProspects as unknown as NBAPlayer[]}
        activePlayers={activePlayers}
        draftYear={leagueYear}
        gistData={scoutingPlayer && gistByYear ? matchProspectToGist(scoutingPlayer, gistByYear) : null}
        onViewPlayerBio={player => {
          setScoutingPlayer(null);
          navigateToPlayer(player);
        }}
        onConfirmPick={canConfirmScoutingPick ? onConfirmPickForScouting : undefined}
        pickLabel={`Pick #${currentPick}`}
        preComputedComps={scoutingPlayer ? batchComps.get((scoutingPlayer as NBAPlayer).internalId) : undefined}
        showCombineTab={showCombineTab}
      />
      {actionsPlayer && (
        <PlayerActionsModal
          player={actionsPlayer}
          context="draft-scouting"
          onClose={() => setActionsPlayer(null)}
          onActionSelect={handleProspectAction}
        />
      )}
      {pendingAdvance && (
        <ConfirmationModal
          title={pendingAdvance === 'end'
            ? 'Sim the Rest of the Draft?'
            : pendingAdvance === 'pass'
              ? 'Pass This Pick?'
              : 'Start Auto Sim?'}
          message={pendingAdvance === 'end'
            ? 'Your Assistant GM will make every remaining selection. This cannot be undone.'
            : pendingAdvance === 'pass'
              ? `This will pass pick ${currentPick} without selecting a player and cannot be undone.`
              : 'Auto Sim will begin making selections until you pause it or your team is on the clock.'}
          onCancel={() => setPendingAdvance(null)}
          onConfirm={() => {
            const action = pendingAdvance;
            setPendingAdvance(null);
            if (action === 'end') simToPickInstant(draftOrder.length + 1);
            else if (action === 'pass') passCurrentPick();
            else onToggleAutoSim();
          }}
        />
      )}

      {pendingCommissionerPick && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-amber-400/30 bg-slate-950 p-6 shadow-2xl">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-300">Commissioner override</p>
            <h2 className="mt-2 text-2xl font-black uppercase text-white">Override this team’s pick?</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              You are selecting <span className="font-black text-white">{pendingCommissionerPick.name}</span> for{' '}
              <span className="font-black text-white">{teamOnClock ? getTeamFullName(teamOnClock as any) : 'the team on the clock'}</span> at pick #{currentPick}.
            </p>
            <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-500">
              This bypasses the team’s normal draft operation and is recorded as the official selection.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={() => setPendingCommissionerPick(null)}
                className="rounded-2xl border border-white/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-300 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={() => completeScoutingPick(pendingCommissionerPick)}
                className="rounded-2xl bg-amber-400 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-amber-300"
              >
                Confirm Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
