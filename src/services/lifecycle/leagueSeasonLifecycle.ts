import { isDraftLotteryEnabled } from '../../lib/lotteryPresets';
import type {
  GameState,
  LeagueLifecycleMode,
  LeagueSeasonLifecycle,
  LifecycleStepStatus,
  OffseasonChecklistRow,
} from '../../types';
import { normalizeDate } from '../../utils/helpers';
import { getDraftDate, getDraftLotteryDate, toISODateString } from '../../utils/dateUtils';
import { getLeagueCalendarDates } from '../leagueCalendar';
import { getPbaDraftYearForSeasonYear } from '../pba/draftCalendar';
import { isNoDraftLeague } from '../offseason/offseasonChecklistState';
import { buildDraftOrderFromState } from '../draft/draftOrder';
import { buildPbaDraftOrderTeams } from '../pba/draftRules';

const VERSION = 3 as const;
const NBA_TRANSITION_OWNER: OffseasonChecklistRow = 'retiredPlayersReview';

export function hasPrematureLegacyLotteryEvidence(
  state: Partial<Pick<GameState, 'date' | 'draftLotteryResult' | 'seasonLifecycle' | 'offseasonChecklist'>>,
): boolean {
  const draft = state.seasonLifecycle?.draft;
  return draft?.lottery === 'complete'
    && draft.lotteryEvidence?.provenance === 'legacy-result'
    && !(state.draftLotteryResult?.length)
    && state.offseasonChecklist?.draftLottery !== 'done'
    && state.offseasonChecklist?.draftLottery !== 'skipped'
    && !!state.date
    && !!draft.eventDates.lotteryDate
    && normalizeDate(state.date) < draft.eventDates.lotteryDate;
}

export function isOffseasonTaskRailActive(
  lifecycle: Pick<LeagueSeasonLifecycle, 'currentPhase' | 'offseasonOpen'>,
): boolean {
  return lifecycle.offseasonOpen
    && (lifecycle.currentPhase === 'OFFSEASON_OPEN'
      || lifecycle.currentPhase === 'OFFSEASON_TASKS_ACTIVE');
}

export interface DraftCycleEvidence {
  year: number | null;
  expectedSlots: number;
  selectedPlayerIdsBySlot: Record<number, string>;
  passedSlots: number[];
  historyPersisted: boolean;
  rookieContractsPersisted: boolean;
  complete: boolean;
}

export function getLeagueLifecycleMode(state: Pick<GameState, 'leagueType' | 'leagueStats'>): LeagueLifecycleMode {
  const uiMode = state.leagueStats?.uiMode;
  if (uiMode === 'wnba_isolated') return 'wnba';
  if (uiMode === 'pba_isolated') return 'pba';
  if (uiMode === 'euro_isolated') return 'euro';
  if (uiMode === 'fictional' || state.leagueType === 'fictional') return 'fictional';
  return 'nba';
}

function transitionOwner(mode: LeagueLifecycleMode): LeagueSeasonLifecycle['transition']['owner'] {
  if (mode === 'pba') return 'conference';
  if (mode === 'euro') return 'league-assembly';
  return NBA_TRANSITION_OWNER;
}

function draftYearForMode(state: GameState, mode: LeagueLifecycleMode, activeSeason: number): number | null {
  if (mode === 'euro' || isNoDraftLeague(state.leagueStats)) return null;
  if (mode === 'pba') return getPbaDraftYearForSeasonYear(activeSeason);
  if (mode === 'wnba' && state.leagueStats.openingRosterMode === 'current') {
    const sourceSeason = Number(state.leagueStats.wnbaSourceSeason);
    if (Number.isFinite(sourceSeason) && activeSeason <= sourceSeason) return sourceSeason + 1;
  }
  return activeSeason;
}

function activeTeamIds(state: GameState, mode: LeagueLifecycleMode): number[] {
  if (mode === 'pba') {
    return (state.nonNBATeams ?? [])
      .filter(team => team.league === 'PBA')
      .map(team => Number(team.tid))
      .filter(Number.isInteger);
  }
  return (state.teams ?? [])
    .filter(team => (team as typeof team & { disabled?: boolean }).disabled !== true && Number(team.id) >= 0 && Number(team.id) < 100)
    .map(team => Number(team.id));
}

function expectedDraftSlots(state: GameState, mode: LeagueLifecycleMode): number {
  if (state.activeDraftOrder?.length) return state.activeDraftOrder.length;
  const rounds = mode === 'wnba' ? 3 : 2;
  return activeTeamIds(state, mode).length * rounds;
}

function draftHistoryEvidence(state: GameState, year: number): {
  playerIds: Set<string>;
  passedSlots: Set<number>;
} {
  const ids = new Set<string>();
  const passedSlots = new Set<number>();
  for (const entry of state.history ?? []) {
    if (typeof entry === 'string' || entry.type !== 'Draft') continue;
    const text = String(entry.text ?? '');
    const datedForCycle = text.includes(String(year)) || normalizeDate(entry.date ?? '').startsWith(String(year));
    if (!datedForCycle) continue;
    for (const playerId of entry.playerIds ?? []) ids.add(String(playerId));
    const pass = text.match(/pass(?:es)? on the (\d+)(?:st|nd|rd|th)? overall pick/i);
    if (pass) passedSlots.add(Number(pass[1]));
  }
  return { playerIds: ids, passedSlots };
}

export function getDraftCycleEvidence(state: GameState, requestedYear?: number | null): DraftCycleEvidence {
  const mode = getLeagueLifecycleMode(state);
  const activeSeason = Number(state.seasonLifecycle?.activeSeason ?? state.leagueStats.year);
  const year = requestedYear ?? state.seasonLifecycle?.draft.year ?? draftYearForMode(state, mode, activeSeason);
  if (year == null) {
    return {
      year: null,
      expectedSlots: 0,
      selectedPlayerIdsBySlot: {},
      passedSlots: [],
      historyPersisted: true,
      rookieContractsPersisted: true,
      complete: true,
    };
  }

  const expectedSlots = Math.max(
    Number(state.seasonLifecycle?.draft.year) === year
      ? Number(state.seasonLifecycle?.draft.expectedSlots ?? 0)
      : 0,
    expectedDraftSlots(state, mode),
  );
  const selected = new Map<number, string>();
  if (Number(state.seasonLifecycle?.draft.year) === year) {
    for (const [slot, playerId] of Object.entries(state.seasonLifecycle?.draft.selectedPlayerIdsBySlot ?? {})) {
      const numericSlot = Number(slot);
      if (Number.isInteger(numericSlot) && numericSlot > 0 && playerId) selected.set(numericSlot, String(playerId));
    }
  }
  for (const [slot, player] of Object.entries(state.activeDraftPicks ?? {})) {
    const numericSlot = Number(slot);
    const playerId = String(player?.internalId ?? '');
    if (Number.isInteger(numericSlot) && numericSlot > 0 && playerId) selected.set(numericSlot, playerId);
  }
  for (const player of state.players ?? []) {
    for (const transaction of player.transactions ?? []) {
      if (transaction.type !== 'draft' || Number(transaction.season) !== year) continue;
      const slot = Number(transaction.pickNum);
      if (Number.isInteger(slot) && slot > 0 && !selected.has(slot)) selected.set(slot, player.internalId);
    }
  }

  const passed = new Set<number>();
  if (Number(state.seasonLifecycle?.draft.year) === year) {
    for (const slot of state.seasonLifecycle?.draft.passedSlots ?? []) {
      if (Number.isInteger(slot) && slot > 0) passed.add(slot);
    }
  }
  for (const slot of Object.keys(state.activeDraftPassedPicks ?? {}).map(Number)) {
    if (Number.isInteger(slot) && slot > 0) passed.add(slot);
  }
  for (const slot of selected.keys()) passed.delete(slot);

  const forfeited = new Set<number>();
  if (Number(state.seasonLifecycle?.draft.year) === year) {
    for (const slot of state.seasonLifecycle?.draft.orderLedger ?? []) {
      if (slot.disposition === 'forfeited') forfeited.add(slot.overallPick);
    }
  }
  state.activeDraftOrder?.forEach((team, index) => {
    if (team._forfeited) forfeited.add(index + 1);
  });
  for (const slot of selected.keys()) forfeited.delete(slot);
  for (const slot of forfeited) passed.delete(slot);

  const historyEvidence = draftHistoryEvidence(state, year);
  const historyPersisted = selected.size + passed.size + forfeited.size > 0
    && [...selected.values()].every(playerId => historyEvidence.playerIds.has(playerId))
    && [...passed].every(slot => historyEvidence.passedSlots.has(slot));
  const draftedPlayersById = new Map((state.players ?? []).map(player => [player.internalId, player]));
  const rookieContractsPersisted = selected.size + forfeited.size > 0
    && [...selected.values()].every(playerId => draftedPlayersById.get(playerId)?.contract?.rookie === true);
  const pbaComplete = mode === 'pba'
    && state.leagueStats.pbaDraftComplete === true
    && Number(state.leagueStats.pbaDraftCompleteSeason) === year;
  const sourceWnbaDraftComplete = mode === 'wnba'
    && state.leagueStats.openingRosterMode === 'current'
    && Number(state.leagueStats.wnbaSourceSeason) === year;
  const resolvedSlots = new Set([...selected.keys(), ...passed, ...forfeited]);
  const ledgerComplete = expectedSlots > 0
    && resolvedSlots.size >= expectedSlots
    && historyPersisted;

  return {
    year,
    expectedSlots,
    selectedPlayerIdsBySlot: Object.fromEntries([...selected.entries()].sort(([left], [right]) => left - right)),
    passedSlots: [...passed].sort((left, right) => left - right),
    historyPersisted,
    rookieContractsPersisted: sourceWnbaDraftComplete || (ledgerComplete && rookieContractsPersisted),
    complete: pbaComplete || sourceWnbaDraftComplete || ledgerComplete,
  };
}

function statusFromEvidence(
  persisted: LifecycleStepStatus | undefined,
  complete: boolean,
  applicable = true,
): LifecycleStepStatus {
  if (!applicable) return 'not-applicable';
  if (complete) return 'complete';
  return persisted === 'in-progress' ? 'in-progress' : 'pending';
}

const orderFingerprint = (slots: LeagueSeasonLifecycle['draft']['orderLedger']): string => slots
  .map(slot => `${slot.slotId}:${slot.currentOwnerTeamId}:${slot.disposition}:${slot.selectedPlayerId ?? ''}`)
  .join('|');

function buildCanonicalOrderLedger(
  state: GameState,
  year: number | null,
  lotteryComplete: boolean,
): LeagueSeasonLifecycle['draft']['orderLedger'] {
  if (year == null || !lotteryComplete) return [];
  const persisted = state.seasonLifecycle?.draft.orderLedger;
  if (Number(state.seasonLifecycle?.draft.year) === year && persisted?.length) {
    return persisted.map(slot => {
      if (slot.disposition !== 'open') return { ...slot };
      const pickAsset = state.draftPicks?.find(pick => (
        Number(pick.season) === year
        && Number(pick.round) === slot.round
        && Number(pick.originalTid) === slot.originalTeamId
      ));
      if (!pickAsset) return { ...slot };
      return {
        ...slot,
        currentOwnerTeamId: Number(pickAsset.tid),
        pickAssetId: Number(pickAsset.dpid),
        disposition: pickAsset.forfeiture ? 'forfeited' as const : slot.disposition,
      };
    });
  }
  const order = getLeagueLifecycleMode(state) === 'pba'
    ? buildPbaDraftOrderTeams(state.nonNBATeams ?? [], state.boxScores ?? [], year, 0, state.draftPicks)
    : buildDraftOrderFromState(state);
  return order.map((team, index) => {
    const roundSize = Math.max(1, Number(team._roundSize) || Math.floor(order.length / 2));
    const round = Number(team._round) || Math.floor(index / roundSize) + 1;
    const pickInRound = (index % roundSize) + 1;
    const originalTeamId = Number(team._originalTid);
    const pickAsset = state.draftPicks?.find(pick => (
      Number(pick.season) === year
      && Number(pick.round) === round
      && Number(pick.originalTid) === originalTeamId
    )) as any;
    const selectedPlayerId = state.seasonLifecycle?.draft.selectedPlayerIdsBySlot?.[index + 1]
      ?? state.activeDraftPicks?.[index + 1]?.internalId;
    const passed = state.seasonLifecycle?.draft.passedSlots?.includes(index + 1)
      || state.activeDraftPassedPicks?.[index + 1] === true;
    return {
      slotId: String(pickAsset?.dpid ?? `${year}:${round}:${originalTeamId}`),
      draftYear: year,
      round,
      pickInRound,
      overallPick: index + 1,
      oddsTeamId: originalTeamId,
      originalTeamId,
      currentOwnerTeamId: Number(team.id),
      ...(Number.isFinite(Number(pickAsset?.dpid)) ? { pickAssetId: Number(pickAsset.dpid) } : {}),
      ...(pickAsset?.protection != null ? { protection: pickAsset.protection } : {}),
      ...(pickAsset?.conveyanceState != null ? { conveyanceState: pickAsset.conveyanceState } : {}),
      ...(selectedPlayerId ? { selectedPlayerId } : {}),
      disposition: selectedPlayerId ? 'selected' : team._forfeited ? 'forfeited' : passed ? 'passed' : 'open',
    };
  });
}

function draftEventDates(state: GameState, year: number | null): LeagueSeasonLifecycle['draft']['eventDates'] {
  if (year == null) return {};
  const calendar = getLeagueCalendarDates(year, state.leagueStats) as any;
  return {
    regularSeasonEndDate: calendar.regularSeasonEnd ? toISODateString(calendar.regularSeasonEnd) : undefined,
    postseasonStartDate: calendar.playoffsStart ? toISODateString(calendar.playoffsStart) : undefined,
    seasonEndDate: calendar.playoffsEnd ? toISODateString(calendar.playoffsEnd) : undefined,
    lotteryDate: toISODateString(getDraftLotteryDate(year, state.leagueStats)),
    draftOrderReviewDate: (state.leagueStats as any).draftOrderReviewMonth && (state.leagueStats as any).draftOrderReviewDay
      ? `${year}-${String((state.leagueStats as any).draftOrderReviewMonth).padStart(2, '0')}-${String((state.leagueStats as any).draftOrderReviewDay).padStart(2, '0')}`
      : undefined,
    draftDate: toISODateString(getDraftDate(year, state.leagueStats)),
  };
}

export function resolveLeagueSeasonLifecycle(state: GameState): LeagueSeasonLifecycle {
  const mode = getLeagueLifecycleMode(state);
  const activeSeason = Number(state.seasonLifecycle?.activeSeason ?? state.leagueStats.year);
  const draftYear = state.seasonLifecycle?.draft.year ?? draftYearForMode(state, mode, activeSeason);
  const evidence = getDraftCycleEvidence(state, draftYear);
  const draftApplicable = draftYear != null;
  const lotteryApplicable = draftApplicable && mode !== 'pba' && isDraftLotteryEnabled(state.leagueStats.draftType);
  const persistedLotteryEvidence = state.seasonLifecycle?.draft.lotteryEvidence;
  const lotteryComplete = !lotteryApplicable
    || (Number(persistedLotteryEvidence?.resolvedSeason) === draftYear && !hasPrematureLegacyLotteryEvidence(state))
    || (state.draftLotteryResult?.length ?? 0) > 0;
  const draftStatus = statusFromEvidence(state.seasonLifecycle?.draft.draft, evidence.complete, draftApplicable);
  const orderLedger = buildCanonicalOrderLedger(state, draftYear, lotteryComplete);
  const orderAlreadyReviewed = state.seasonLifecycle?.draft.orderReview === 'complete'
    || Number(state.seasonLifecycle?.draft.orderReviewedSeason) === draftYear
    || state.offseasonChecklist?.draftOrderReview === 'done'
    || draftStatus === 'in-progress'
    || draftStatus === 'complete';
  const orderReview = !draftApplicable
    ? 'not-applicable'
    : !lotteryComplete || orderLedger.length === 0
      ? 'blocked'
      : orderAlreadyReviewed
        ? 'complete'
        : state.seasonLifecycle?.draft.orderReview === 'in-progress'
          || state.offseasonChecklist?.draftOrderReview === 'in-progress'
          ? 'in-progress'
          : 'pending';
  const persistedAuthority = state.seasonLifecycle?.draft.authority;
  const authority = persistedAuthority ?? {
    lottery: (state.leagueStats as any).draftLotteryAuthority === 'automatic' ? 'automatic' as const : 'manual' as const,
    draftOrderReview: 'manual' as const,
    draft: 'manual' as const,
    rookieContracts: 'manual' as const,
  };
  const inferredLotteryEvidence = lotteryApplicable && lotteryComplete && orderLedger.length > 0
    ? persistedLotteryEvidence ?? {
        resolvedSeason: draftYear!,
        eventRunId: `legacy:${draftYear}:${orderFingerprint(orderLedger)}`,
        provenance: 'legacy-result' as const,
        orderFingerprint: orderFingerprint(orderLedger),
      }
    : undefined;
  const rookieContracts = !draftApplicable
    ? 'not-applicable'
    : !evidence.complete
      ? 'blocked'
      : evidence.rookieContractsPersisted
        ? 'complete'
        : 'pending';
  const completedSeason = state.seasonLifecycle?.completedSeason
    ?? (state.offseasonChecklist ? activeSeason : activeSeason - 1);
  const offseasonCycle = state.seasonLifecycle?.offseasonCycle ?? (state.offseasonChecklist ? activeSeason : null);
  const transitionReady = mode === 'wnba'
    ? completedSeason === activeSeason && offseasonCycle === activeSeason
    : evidence.complete && (rookieContracts === 'complete' || rookieContracts === 'not-applicable');
  const transitionStatus = state.seasonLifecycle?.transition.status === 'complete'
    ? 'complete'
    : transitionReady ? 'ready' : 'pending';

  const regularGames = (state.schedule ?? []).filter(game => (
    !game.isPreseason
    && !game.isPlayoff
    && !game.isPlayIn
    && (game.season == null || Number(game.season) === activeSeason)
  ));
  const completedGameIds = state.seasonLifecycle?.regularSeason?.season === activeSeason
    ? state.seasonLifecycle.regularSeason.completedGameIds
    : regularGames.filter(game => game.played).map(game => game.gid).sort((left, right) => left - right);
  const regularComplete = state.seasonLifecycle?.regularSeason?.season === activeSeason
    ? state.seasonLifecycle.regularSeason.status === 'complete'
    : regularGames.length > 0 && regularGames.every(game => game.played);
  const playoffsMaterialized = (
    state.seasonLifecycle?.playoffs?.season === activeSeason
    && state.seasonLifecycle.playoffs.materialized
  ) || Number(state.playoffs?.season) === activeSeason;
  const championTeamId = state.seasonLifecycle?.playoffs?.season === activeSeason
    ? state.seasonLifecycle.playoffs.championTeamId ?? state.playoffs?.champion
    : state.playoffs?.champion;
  const checklistOpensActiveOffseason = offseasonCycle === activeSeason
    && state.offseasonChecklist != null
    && (!playoffsMaterialized || completedSeason === activeSeason);
  const offseasonOpen = state.seasonLifecycle?.offseasonOpen === true || checklistOpensActiveOffseason;
  const persistedPhase = Number(state.seasonLifecycle?.version) === VERSION
    ? state.seasonLifecycle?.currentPhase
    : undefined;
  const stalePreOffseasonPhase = checklistOpensActiveOffseason && (
    persistedPhase === 'REGULAR_SEASON_ACTIVE'
    || persistedPhase === 'REGULAR_SEASON_COMPLETE'
    || persistedPhase === 'PLAYOFFS_MATERIALIZED'
    || persistedPhase === 'PLAYOFFS_ACTIVE'
    || persistedPhase === 'CHAMPION_FINALIZED'
  );
  const postseasonStarted = state.schedule?.some(game => (
    game.played
    && !game.competitionId
    && (game.isPlayoff || game.isPlayIn)
    && (game.season == null || Number(game.season) === activeSeason)
  ));
  const staleCompetitionPhase = championTeamId != null
    ? persistedPhase === 'PRESEASON_ACTIVE'
      || persistedPhase === 'REGULAR_SEASON_ACTIVE'
      || persistedPhase === 'REGULAR_SEASON_COMPLETE'
      || persistedPhase === 'PLAYOFFS_MATERIALIZED'
      || persistedPhase === 'PLAYOFFS_ACTIVE'
    : playoffsMaterialized && (
      persistedPhase === 'PRESEASON_ACTIVE'
      || persistedPhase === 'REGULAR_SEASON_ACTIVE'
      || persistedPhase === 'REGULAR_SEASON_COMPLETE'
      || (persistedPhase === 'PLAYOFFS_MATERIALIZED' && postseasonStarted)
    );
  const inferredPhase = (
    offseasonOpen
      ? 'OFFSEASON_TASKS_ACTIVE'
      : championTeamId != null
        ? 'CHAMPION_FINALIZED'
        : playoffsMaterialized
          ? state.playoffs?.series?.some(series => series.status === 'active')
            ? 'PLAYOFFS_ACTIVE'
            : 'PLAYOFFS_MATERIALIZED'
          : regularComplete
            ? 'REGULAR_SEASON_COMPLETE'
            : 'REGULAR_SEASON_ACTIVE'
  );
  const inferredCompetitionPhase = championTeamId != null
    ? 'PLAYOFFS_ACTIVE'
    : state.playoffs?.series?.some(series => series.status === 'active')
      ? 'PLAYOFFS_ACTIVE'
      : 'PLAYOFFS_MATERIALIZED';
  const currentPhase = stalePreOffseasonPhase
    ? 'OFFSEASON_TASKS_ACTIVE'
    : staleCompetitionPhase ? inferredCompetitionPhase : persistedPhase ?? inferredPhase;
  const phaseNext: Partial<Record<typeof currentPhase, LeagueSeasonLifecycle['nextValidTransition']>> = {
    REGULAR_SEASON_ACTIVE: 'REGULAR_SEASON_COMPLETE',
    REGULAR_SEASON_COMPLETE: 'PLAYOFFS_MATERIALIZED',
    PLAYOFFS_MATERIALIZED: 'PLAYOFFS_ACTIVE',
    PLAYOFFS_ACTIVE: 'CHAMPION_FINALIZED',
    CHAMPION_FINALIZED: 'OFFSEASON_OPEN',
    OFFSEASON_OPEN: 'OFFSEASON_TASKS_ACTIVE',
    OFFSEASON_TASKS_ACTIVE: 'NEXT_SEASON_PREPARED',
    NEXT_SEASON_PREPARED: 'PRESEASON_ACTIVE',
    PRESEASON_ACTIVE: 'REGULAR_SEASON_ACTIVE',
  };
  const finalizedAwardKeys = state.seasonLifecycle?.awards?.season === activeSeason
    ? state.seasonLifecycle.awards.finalizedAwardKeys
    : (state.historicalAwards ?? [])
        .filter(award => Number(award.season) === activeSeason)
        .map(award => String(award.type))
        .sort();
  const rolloverOwner = state.seasonLifecycle?.rolloverOwner ?? state.seasonLifecycle?.transition.owner ?? transitionOwner(mode);
  return {
    version: VERSION,
    mode,
    activeSeason,
    completedSeason,
    displayedSeason: Number(state.seasonLifecycle?.displayedSeason ?? activeSeason),
    currentPhase,
    regularSeason: {
      season: activeSeason,
      status: regularComplete ? 'complete' : 'active',
      completedGameIds,
      standingsFingerprint: state.seasonLifecycle?.regularSeason?.season === activeSeason
        ? state.seasonLifecycle.regularSeason.standingsFingerprint
        : undefined,
    },
    playoffs: {
      season: activeSeason,
      materialized: playoffsMaterialized,
      bracketFingerprint: state.seasonLifecycle?.playoffs?.season === activeSeason
        ? state.seasonLifecycle.playoffs.bracketFingerprint
        : undefined,
      regularSeasonCompletionFingerprint: state.seasonLifecycle?.playoffs?.season === activeSeason
        ? state.seasonLifecycle.playoffs.regularSeasonCompletionFingerprint
        : state.playoffs?.regularSeasonCompletionFingerprint,
      championTeamId,
      runnerUpTeamId: state.seasonLifecycle?.playoffs?.season === activeSeason
        ? state.seasonLifecycle.playoffs.runnerUpTeamId
        : undefined,
      finalizedAtDate: state.seasonLifecycle?.playoffs?.season === activeSeason
        ? state.seasonLifecycle.playoffs.finalizedAtDate
        : undefined,
    },
    awards: {
      season: activeSeason,
      status: state.seasonLifecycle?.awards?.season === activeSeason
        ? state.seasonLifecycle.awards.status
        : championTeamId != null ? 'pending' : 'blocked',
      finalizedAwardKeys,
    },
    taskCycle: {
      id: state.seasonLifecycle?.taskCycle?.season === activeSeason
        ? state.seasonLifecycle.taskCycle.id
        : `${mode}:${activeSeason}`,
      season: activeSeason,
      status: state.seasonLifecycle?.taskCycle?.season === activeSeason
        ? state.seasonLifecycle.taskCycle.status
        : offseasonOpen ? 'pending' : 'blocked',
    },
    offseasonCycle,
    offseasonOpen,
    nextSeason: Number(state.seasonLifecycle?.nextSeason ?? activeSeason + 1),
    draft: {
      year: evidence.year,
      eventDates: draftEventDates(state, evidence.year),
      lotteryEnabled: lotteryApplicable,
      lotteryRequiredForCycle: lotteryApplicable,
      lottery: statusFromEvidence(state.seasonLifecycle?.draft.lottery, lotteryComplete, lotteryApplicable),
      lotteryEvidence: inferredLotteryEvidence,
      orderReview,
      orderLedger,
      orderReviewedSeason: orderAlreadyReviewed && draftYear != null ? draftYear : undefined,
      authority,
      draft: draftStatus,
      draftCompleteSeason: draftStatus === 'complete' && draftYear != null ? draftYear : undefined,
      expectedSlots: evidence.expectedSlots,
      selectedPlayerIdsBySlot: evidence.selectedPlayerIdsBySlot,
      passedSlots: evidence.passedSlots,
      historyPersisted: evidence.historyPersisted,
      rookieContracts,
      rookieContractsResolvedSeason: rookieContracts === 'complete' && draftYear != null ? draftYear : undefined,
    },
    retirements: state.seasonLifecycle?.retirements ?? (state.offseasonChecklist ? 'pending' : 'not-applicable'),
    transition: {
      fromSeason: Number(state.seasonLifecycle?.transition.fromSeason ?? activeSeason),
      toSeason: Number(state.seasonLifecycle?.transition.toSeason ?? activeSeason + 1),
      owner: state.seasonLifecycle?.transition.owner ?? transitionOwner(mode),
      status: transitionStatus,
      completedAtDate: state.seasonLifecycle?.transition.completedAtDate,
    },
    rolloverOwner,
    nextValidTransition: state.seasonLifecycle?.nextValidTransition ?? phaseNext[currentPhase] ?? null,
    migration: {
      version: VERSION,
      provenance: state.seasonLifecycle?.migration?.provenance
        ?? (Number((state.seasonLifecycle as any)?.version) === VERSION
          ? 'native'
          : Number((state.seasonLifecycle as any)?.version) === 2 ? 'v2-upgrade' : 'v1-upgrade'),
    },
  };
}

export function initializeLeagueSeasonLifecycle(state: GameState): LeagueSeasonLifecycle {
  return resolveLeagueSeasonLifecycle({ ...state, seasonLifecycle: undefined });
}

export function isCanonicalDraftComplete(state: GameState): boolean {
  return resolveLeagueSeasonLifecycle(state).draft.draft === 'complete';
}

export function canRunRookieContracts(state: GameState): boolean {
  const lifecycle = resolveLeagueSeasonLifecycle(state);
  return lifecycle.draft.draft === 'complete' && lifecycle.draft.historyPersisted;
}

export function canActivateNextSeason(state: GameState): boolean {
  const lifecycle = resolveLeagueSeasonLifecycle(state);
  if (lifecycle.mode === 'euro') return false;
  if (lifecycle.mode === 'pba') return true;
  return lifecycle.transition.status === 'ready';
}

export function lifecycleWithDraftProgress(
  state: GameState,
  selectedPlayerIdsBySlot: Record<number, string>,
  passedSlots: number[],
  expectedSlots: number,
  historyPersisted: boolean,
): LeagueSeasonLifecycle {
  const lifecycle = resolveLeagueSeasonLifecycle(state);
  const resolvedCount = new Set([
    ...Object.keys(selectedPlayerIdsBySlot).map(Number),
    ...passedSlots,
    ...lifecycle.draft.orderLedger.filter(slot => slot.disposition === 'forfeited').map(slot => slot.overallPick),
  ]).size;
  const complete = expectedSlots > 0 && resolvedCount >= expectedSlots && historyPersisted;
  const playersById = new Map(state.players.map(player => [player.internalId, player]));
  const rookieContractsPersisted = complete
    && Object.values(selectedPlayerIdsBySlot).every(playerId => playersById.get(playerId)?.contract?.rookie === true);
  return {
    ...lifecycle,
    draft: {
      ...lifecycle.draft,
      expectedSlots,
      selectedPlayerIdsBySlot,
      orderLedger: lifecycle.draft.orderLedger.map(slot => ({
        ...slot,
        ...(selectedPlayerIdsBySlot[slot.overallPick] ? {
          disposition: 'selected' as const,
          selectedPlayerId: selectedPlayerIdsBySlot[slot.overallPick],
        } : slot.disposition !== 'forfeited' && passedSlots.includes(slot.overallPick) ? {
          disposition: 'passed' as const,
        } : {}),
      })),
      passedSlots: [...new Set(passedSlots)].sort((left, right) => left - right),
      historyPersisted,
      draft: complete ? 'complete' : resolvedCount > 0 ? 'in-progress' : 'pending',
      rookieContracts: !complete ? 'blocked' : rookieContractsPersisted ? 'complete' : 'pending',
    },
    transition: {
      ...lifecycle.transition,
      status: rookieContractsPersisted ? 'ready' : 'pending',
    },
  };
}

export function lifecycleWithLotteryComplete(state: GameState): LeagueSeasonLifecycle {
  const lifecycle = resolveLeagueSeasonLifecycle(state);
  const orderLedger = buildCanonicalOrderLedger(state, lifecycle.draft.year, true);
  const year = lifecycle.draft.year;
  const provenance = lifecycle.draft.authority.lottery;
  return {
    ...lifecycle,
    draft: {
      ...lifecycle.draft,
      lottery: lifecycle.draft.lottery === 'not-applicable' ? 'not-applicable' : 'complete',
      orderLedger,
      orderReview: year == null || orderLedger.length === 0 ? 'blocked' : 'pending',
      lotteryEvidence: year == null || lifecycle.draft.lottery === 'not-applicable'
        ? undefined
        : {
            resolvedSeason: year,
            resolvedAtDate: normalizeDate(state.date),
            eventRunId: `${year}:${normalizeDate(state.date)}:${orderFingerprint(orderLedger)}`,
            provenance,
            orderFingerprint: orderFingerprint(orderLedger),
          },
    },
  };
}

export function lifecycleWithDraftOrderReviewed(state: GameState): LeagueSeasonLifecycle {
  const lifecycle = resolveLeagueSeasonLifecycle(state);
  if (lifecycle.draft.lottery !== 'complete' || lifecycle.draft.orderLedger.length === 0) return lifecycle;
  return {
    ...lifecycle,
    draft: {
      ...lifecycle.draft,
      orderReview: 'complete',
      orderReviewedSeason: lifecycle.draft.year ?? undefined,
    },
  };
}

export function lifecycleWithDraftEventAuthority(
  state: GameState,
  event: keyof LeagueSeasonLifecycle['draft']['authority'],
  authority: 'manual' | 'automatic' | 'delegated',
): LeagueSeasonLifecycle {
  const lifecycle = resolveLeagueSeasonLifecycle(state);
  if (event !== 'lottery' && authority === 'automatic') return lifecycle;
  return {
    ...lifecycle,
    draft: {
      ...lifecycle.draft,
      authority: {
        ...lifecycle.draft.authority,
        [event]: authority,
      },
    },
  };
}

export function lifecycleAfterSeasonCompletion(state: GameState, completedSeason: number): LeagueSeasonLifecycle {
  const lifecycle = resolveLeagueSeasonLifecycle(state);
  if (lifecycle.mode === 'pba' || lifecycle.mode === 'euro') return lifecycle;
  if (lifecycle.completedSeason === completedSeason && lifecycle.offseasonCycle === completedSeason) return lifecycle;
  return {
    ...lifecycle,
    completedSeason,
    offseasonCycle: completedSeason,
    retirements: 'pending',
    transition: {
      ...lifecycle.transition,
      fromSeason: completedSeason,
      toSeason: completedSeason + 1,
      status: 'pending',
      completedAtDate: undefined,
    },
  };
}

export function lifecycleAfterSeasonTransition(state: GameState, nextSeason: number): LeagueSeasonLifecycle {
  const lifecycle = resolveLeagueSeasonLifecycle(state);
  const targetDraftYear = lifecycle.mode === 'euro'
    ? null
    : lifecycle.mode === 'pba'
      ? getPbaDraftYearForSeasonYear(nextSeason)
      : nextSeason;
  const preserveDraftCycle = lifecycle.mode === 'wnba' && lifecycle.draft.year === targetDraftYear;
  const draftApplicable = targetDraftYear != null;
  return {
    ...lifecycle,
    activeSeason: nextSeason,
    completedSeason: lifecycle.activeSeason,
    nextSeason: nextSeason + 1,
    draft: preserveDraftCycle
      ? lifecycle.draft
      : {
          year: targetDraftYear,
          eventDates: draftEventDates(state, targetDraftYear),
          lotteryEnabled: draftApplicable && lifecycle.mode !== 'pba' && isDraftLotteryEnabled(state.leagueStats.draftType),
          lotteryRequiredForCycle: draftApplicable && lifecycle.mode !== 'pba' && isDraftLotteryEnabled(state.leagueStats.draftType),
          lottery: draftApplicable && lifecycle.mode !== 'pba' && isDraftLotteryEnabled(state.leagueStats.draftType)
            ? 'pending'
            : 'not-applicable',
          orderReview: draftApplicable ? 'blocked' : 'not-applicable',
          orderLedger: [],
          authority: {
            lottery: (state.leagueStats as any).draftLotteryAuthority === 'automatic' ? 'automatic' : 'manual',
            draftOrderReview: 'manual',
            draft: 'manual',
            rookieContracts: 'manual',
          },
          draft: draftApplicable ? 'pending' : 'not-applicable',
          expectedSlots: 0,
          selectedPlayerIdsBySlot: {},
          passedSlots: [],
          historyPersisted: !draftApplicable,
          rookieContracts: draftApplicable ? 'blocked' : 'not-applicable',
        },
    retirements: 'complete',
    transition: {
      ...lifecycle.transition,
      fromSeason: lifecycle.activeSeason,
      toSeason: nextSeason,
      status: 'complete',
      completedAtDate: state.date,
    },
  };
}

export function lifecycleForNextRegularSeason(state: GameState): LeagueSeasonLifecycle {
  const previous = resolveLeagueSeasonLifecycle(state);
  const activeSeason = Number(state.leagueStats.year);
  const mode = getLeagueLifecycleMode(state);
  const draftYear = mode === 'euro'
    ? null
    : mode === 'wnba'
      ? activeSeason + 1
      : mode === 'pba'
        ? getPbaDraftYearForSeasonYear(activeSeason)
        : activeSeason;
  const applicable = draftYear != null;
  return {
    version: VERSION,
    mode,
    activeSeason,
    completedSeason: previous.completedSeason,
    displayedSeason: activeSeason,
    currentPhase: 'REGULAR_SEASON_ACTIVE',
    regularSeason: { season: activeSeason, status: 'active', completedGameIds: [] },
    playoffs: { season: activeSeason, materialized: false },
    awards: { season: activeSeason, status: 'blocked', finalizedAwardKeys: [] },
    taskCycle: { id: `${mode}:${activeSeason}`, season: activeSeason, status: 'blocked' },
    offseasonCycle: null,
    offseasonOpen: false,
    nextSeason: activeSeason + 1,
    draft: {
      year: draftYear,
      eventDates: draftEventDates(state, draftYear),
      lotteryEnabled: applicable && mode !== 'pba' && isDraftLotteryEnabled(state.leagueStats.draftType),
      lotteryRequiredForCycle: applicable && mode !== 'pba' && isDraftLotteryEnabled(state.leagueStats.draftType),
      lottery: applicable && mode !== 'pba' && isDraftLotteryEnabled(state.leagueStats.draftType) ? 'pending' : 'not-applicable',
      orderReview: applicable ? 'blocked' : 'not-applicable',
      orderLedger: [],
      authority: {
        lottery: (state.leagueStats as any).draftLotteryAuthority === 'automatic' ? 'automatic' : 'manual',
        draftOrderReview: 'manual',
        draft: 'manual',
        rookieContracts: 'manual',
      },
      draft: applicable ? 'pending' : 'not-applicable',
      expectedSlots: 0,
      selectedPlayerIdsBySlot: {},
      passedSlots: [],
      historyPersisted: false,
      rookieContracts: applicable ? 'blocked' : 'not-applicable',
    },
    retirements: 'not-applicable',
    transition: {
      fromSeason: activeSeason,
      toSeason: activeSeason + 1,
      owner: transitionOwner(mode),
      status: 'pending',
    },
    rolloverOwner: transitionOwner(mode),
    nextValidTransition: 'REGULAR_SEASON_COMPLETE',
    migration: { version: VERSION, provenance: 'native' },
  };
}
