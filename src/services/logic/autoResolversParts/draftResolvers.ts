import type { GameState, NBAPlayer } from '../../../types';
import { isDraftLotteryEnabled } from '../../../lib/lotteryPresets';
import { UNDRAFTED_OVR_CAP } from '../../../constants';
import { isDraftBlockedByUnresolvedPlayoffs } from '../../../utils/dateUtils';
import { normalizeTeamJerseyNumbers, pickJerseyNumber } from '../../../utils/jerseyUtils';
import { getLsYear } from '../../../utils/leagueYear';
import { getTrainingCampRosterLimit, getTwoWayRosterLimit } from '../../../utils/rosterLimits';
import { isTwoWayContract } from '../../../utils/contractTypes';
import { isHistoricalNbaStart } from '../../../data/historicalNbaSeasons';
import { applyDraftPickForfeitures, buildDraftOrderFromState } from '../../draft/draftOrder';
import { returnUndraftedToHomeLeague } from '../../externalLeagueSustainer';
import { logPlanEvent } from '../../offseason/offseasonPlan';
import { isNoDraftLeague } from '../../offseason/offseasonState';
import { buildPbaDraftOrderTeams, getPbaDraftPool, tunePbaDraftProspects } from '../../pba/draftRules';
import { applyLotteryPickOverrides, getPossibleLotteryPicks, getSeasonLotteryOverrides } from '../../draft/lotteryOverrides';
import { clearWaiverMarkers, historicalContractYearsBefore, stripLiveContractAfterWaive } from '../../../utils/contractCleanup';
import { appendPlayerTransaction } from '../../../utils/playerBirdRights';
import { getTeamFullName } from '../../../utils/teamNames';
import { getDraftSeasonYearForState } from '../../offseason/offseasonState';
import { buildDraftLotteryPool } from '../../draft/draftLotteryPool';
import { buildCanonicalDraftProspectPool, dedupeDraftProspectPool } from '../../draft/draftProspectPool';
import { selectAiDraftProspect } from '../../draft/aiDraftBoard';
import { computeDraftPickFields, signDraftedRookieContracts } from '../../draft/draftSelection';
import {
  areWnbaDevelopmentalContractsEnabled,
  getWnbaDevelopmentalBaseStipendUSD,
  getWnbaDevelopmentalContractLabel,
  isWnbaDevelopmentalServiceEligible,
} from '../../wnba/developmentalContracts';
import {
  isCanonicalDraftComplete,
  lifecycleWithDraftOrderReviewed,
  lifecycleWithLotteryComplete,
  lifecycleWithDraftProgress,
  resolveLeagueSeasonLifecycle,
} from '../../lifecycle/leagueSeasonLifecycle';
import { getSimulationSeed } from '../../saveIdentity';
import { withDeterministicRandom } from '../../simulation/deterministicRandom';
import { isInternationalTournamentOnlyPlayer } from '../../../utils/prospectUtils';

const TWO_WAY_SALARY_THOUSANDS = 625;

export function signDraftPoolTwoWayPlayer(
  player: NBAPlayer,
  teamId: number,
  draftSeason: number,
  signedDate: string,
  leagueStats?: GameState['leagueStats'],
): NBAPlayer {
  const contractSeason = draftSeason + 1;
  const developmental = areWnbaDevelopmentalContractsEnabled(leagueStats);
  const salaryThousands = developmental
    ? Math.round(getWnbaDevelopmentalBaseStipendUSD(leagueStats) / 1_000)
    : TWO_WAY_SALARY_THOUSANDS;
  return clearWaiverMarkers({
    ...player,
    tid: teamId,
    status: (developmental ? 'WNBA' : 'Active') as NBAPlayer['status'],
    twoWay: !developmental,
    developmentalContract: developmental || undefined,
    developmentalGamesPlayed: developmental ? 0 : undefined,
    developmentalContractSeason: developmental ? contractSeason : undefined,
    nonGuaranteed: false,
    yearsWithTeam: 0,
    hasBirdRights: false,
    signedDate,
    tradeEligibleDate: undefined,
    contract: {
      amount: salaryThousands,
      exp: contractSeason,
      type: developmental ? 'DEVELOPMENTAL' : 'TWO_WAY',
      hasPlayerOption: false,
    },
    contractYears: [
      ...historicalContractYearsBefore(player, contractSeason),
      {
        season: `${draftSeason}-${String(contractSeason).slice(-2)}`,
        guaranteed: salaryThousands * 1_000,
        option: developmental ? 'Developmental' : 'Two-Way',
      },
    ],
    transactions: appendPlayerTransaction(player, { season: draftSeason, tid: teamId, type: 'freeAgent' }),
  } as NBAPlayer);
}

function trimAiDraftDayTwoWayOverflow(
  players: NBAPlayer[],
  state: GameState,
  season: number,
): { players: NBAPlayer[]; historyEntries: Array<{ text: string; date: string; type: string; playerIds: string[]; tid: number }> } {
  const limit = getTrainingCampRosterLimit(state.leagueStats);
  const secondaryLabel = getWnbaDevelopmentalContractLabel(state.leagueStats).toLowerCase();
  const userTeamId = state.gameMode === 'gm' ? state.userTeamId : undefined;
  const releasedById = new Map<string, { playerId: string; teamId: number; playerName: string; teamName: string }>();

  for (const team of state.teams.filter(candidate => candidate.id >= 0 && candidate.id < 100)) {
    if (team.id === userTeamId) continue;
    const roster = players.filter(player => player.tid === team.id && player.status === 'Active');
    let excess = roster.length - limit;
    if (excess <= 0) continue;
    const twoWayCandidates = roster
      .filter(player => isTwoWayContract(player, state.leagueStats))
      .sort((left, right) =>
        Number(left.overallRating ?? 0) - Number(right.overallRating ?? 0)
        || String(left.internalId).localeCompare(String(right.internalId)));
    for (const player of twoWayCandidates) {
      if (excess <= 0) break;
      releasedById.set(player.internalId, {
        playerId: player.internalId,
        teamId: team.id,
        playerName: player.name,
        teamName: getTeamFullName(team),
      });
      excess -= 1;
    }
  }

  if (releasedById.size === 0) return { players, historyEntries: [] };
  return {
    players: players.map(player => {
      const release = releasedById.get(player.internalId);
      if (!release) return player;
      const cleared = stripLiveContractAfterWaive(player, season);
      return {
        ...cleared,
        tid: -1,
        status: 'Free Agent',
        gLeagueAssigned: false,
        hasBirdRights: false,
        yearsWithTeam: 0,
        signedDate: undefined,
        tradeEligibleDate: undefined,
        recentlyWaivedBy: release.teamId,
        recentlyWaivedDate: state.date,
        transactions: appendPlayerTransaction(player, { season, tid: -1, type: 'waive' }),
      } as NBAPlayer;
    }),
    historyEntries: [...releasedById.values()].map(release => ({
      text: `${release.playerName} was released from a ${secondaryLabel} contract by the ${release.teamName} after the draft.`,
      date: state.date,
      type: 'Waiver',
      playerIds: [release.playerId],
      tid: release.teamId,
    })),
  };
}

function runWeightedLottery<T extends { originalSeed: number }>(
  teams: T[],
  chances: number[],
  numToPick: number
): { pick: number; team: T; change: number }[] {
  const results: { pick: number; team: T; change: number }[] = [];
  const drawnSeeds = new Set<number>();
  const actual = Math.min(numToPick, teams.length);

  for (let i = 1; i <= actual; i++) {
    const avail = teams.filter(t => !drawnSeeds.has(t.originalSeed));
    const totalW = avail.reduce((s, t) => s + (chances[t.originalSeed - 1] ?? 0), 0);
    if (!totalW) break;
    let rnd = Math.random() * totalW;
    let winner = avail[0];
    for (const t of avail) {
      rnd -= chances[t.originalSeed - 1] ?? 0;
      if (rnd <= 0) { winner = t; break; }
    }
    drawnSeeds.add(winner.originalSeed);
    results.push({ pick: i, team: winner, change: winner.originalSeed - i });
  }

  teams
    .filter(t => !drawnSeeds.has(t.originalSeed))
    .sort((a, b) => a.originalSeed - b.originalSeed)
    .forEach((t, idx) => results.push({ pick: idx + actual + 1, team: t, change: t.originalSeed - (idx + actual + 1) }));

  return results;
}

export const autoRunLottery = (state: GameState): Partial<GameState> => {
  logPlanEvent('autoResolvers.autoRunLottery', 'fire', `date=${state.date}`);
  if (state.leagueStats?.uiMode === 'pba_isolated') return {};
  if (isNoDraftLeague(state.leagueStats)) return {};
  if ((state.draftLotteryResult?.length ?? 0) > 0) return {};
  if (!isDraftLotteryEnabled(state.leagueStats?.draftType)) return {};

  const draftSeason = getDraftSeasonYearForState(state);
  const pool = buildDraftLotteryPool(state, draftSeason);
  const preset = pool.preset;
  const lotteryTeams = pool.teams;
  if (lotteryTeams.length < Math.min(2, preset.chances.length)) {
    return { _deferred: true } as any;
  }

  const weighted = withDeterministicRandom(
    [getSimulationSeed(state), draftSeason, state.date, 'draft-lottery'].join(':'),
    () => runWeightedLottery(lotteryTeams, pool.chances, preset.numToPick),
  );
  const storedOverrides = getSeasonLotteryOverrides(state.draftLotteryOverrides, draftSeason);
  const validOverrides = Object.fromEntries(
    Object.entries(storedOverrides).filter(([tid, pick]) => {
      const teamIndex = lotteryTeams.findIndex(team => team.tid === Number(tid));
      return getPossibleLotteryPicks(
        pool.chances,
        teamIndex,
        preset.numToPick,
      ).includes(Number(pick));
    }),
  );
  const draftLotteryResult = applyLotteryPickOverrides(weighted, validOverrides);
  return {
    draftLotteryResult,
    seasonLifecycle: lifecycleWithLotteryComplete({ ...state, draftLotteryResult }),
  } as any;
};

export const autoReviewDraftOrder = (state: GameState): Partial<GameState> => {
  const lifecycle = resolveLeagueSeasonLifecycle(state);
  if (lifecycle.draft.orderReview === 'complete') return {};
  const seasonComplete = lifecycle.completedSeason === lifecycle.activeSeason
    && lifecycle.offseasonCycle === lifecycle.activeSeason;
  if (
    lifecycle.draft.authority.draftOrderReview !== 'delegated'
    || lifecycle.draft.lottery !== 'complete'
    || lifecycle.draft.orderLedger.length === 0
    || !seasonComplete
  ) return { _deferred: true } as any;
  return {
    seasonLifecycle: lifecycleWithDraftOrderReviewed(state),
    offseasonChecklist: state.offseasonChecklist
      ? { ...state.offseasonChecklist, draftOrderReview: 'done' }
      : state.offseasonChecklist,
  };
};

export const completeDraftedRookieContracts = (state: GameState): Partial<GameState> => {
  const patch = signDraftedRookieContracts(state);
  if (Object.keys(patch).length === 0) return {};
  const signedState = { ...state, ...patch } as GameState;
  const season = Number(signedState.seasonLifecycle?.draft.year ?? signedState.leagueStats.year);
  const trim = trimAiDraftDayTwoWayOverflow(signedState.players, signedState, season);
  const lifecycleAfterTrim = lifecycleWithDraftProgress(
    { ...signedState, players: trim.players },
    signedState.seasonLifecycle?.draft.selectedPlayerIdsBySlot ?? {},
    signedState.seasonLifecycle?.draft.passedSlots ?? [],
    signedState.seasonLifecycle?.draft.expectedSlots ?? 0,
    true,
  );
  return {
    ...patch,
    players: trim.players,
    history: [...(signedState.history ?? []), ...trim.historyEntries],
    seasonLifecycle: lifecycleAfterTrim,
    offseasonChecklist: state.offseasonChecklist
      ? { ...state.offseasonChecklist, rookieContracts: 'done' }
      : state.offseasonChecklist,
  };
};

export const autoRunRookieContracts = (state: GameState): Partial<GameState> => {
  const lifecycle = resolveLeagueSeasonLifecycle(state);
  if (lifecycle.draft.rookieContracts === 'complete') return {};
  if (
    lifecycle.draft.authority.rookieContracts !== 'delegated'
    || lifecycle.draft.draft !== 'complete'
    || !lifecycle.draft.historyPersisted
  ) return { _deferred: true } as any;
  const patch = completeDraftedRookieContracts(state);
  return Object.keys(patch).length > 0 ? patch : { _deferred: true } as any;
};

export const autoRunDraft = (state: GameState): Partial<GameState> => {
  logPlanEvent('autoResolvers.autoRunDraft', 'fire', `date=${state.date}`);
  const pbaIsolated = state.leagueStats?.uiMode === 'pba_isolated';
  const wnbaIsolated = state.leagueStats?.uiMode === 'wnba_isolated';
  if (isNoDraftLeague(state.leagueStats)) return {};
  if (isCanonicalDraftComplete(state)) return {};
  if (!pbaIsolated && resolveLeagueSeasonLifecycle(state).draft.orderReview !== 'complete') {
    return { _deferred: true } as any;
  }
  if (!pbaIsolated && isDraftBlockedByUnresolvedPlayoffs(state)) return { _deferred: true } as any;

  const season = pbaIsolated ? getLsYear(state) : getDraftSeasonYearForState(state);
  const draftScope = wnbaIsolated
    ? 'wnba'
    : state.leagueStats?.uiMode === 'fictional'
      ? 'fictional'
      : 'nba';

  const tunedPlayers = pbaIsolated ? tunePbaDraftProspects(state.players, season, state.leagueStats) : state.players;
  const pbaDraftPool = pbaIsolated ? getPbaDraftPool(tunedPlayers, season, state.leagueStats) : [];
  const draftOrder = applyDraftPickForfeitures((((state as any).activeDraftOrder?.length ?? 0) > 0
    ? (state as any).activeDraftOrder
    : pbaIsolated
      ? buildPbaDraftOrderTeams((state as any).nonNBATeams ?? [], state.boxScores ?? [], season, pbaDraftPool.length, state.draftPicks)
      : buildDraftOrderFromState(state)) as any[], state.draftPicks ?? [], season);
  const prospects = (pbaIsolated
    ? dedupeDraftProspectPool(pbaDraftPool, season)
    : buildCanonicalDraftProspectPool(tunedPlayers, season, draftScope))
    .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0))
    .slice(0, 100);
  const draftPoolIds = new Set(prospects.map(player => player.internalId));

  const assignedIds = new Set<string>();
  const pickMap = new Map<number, { player: typeof state.players[0]; team: any }>();
  const activeDraftPicks: Record<number, any> = (state as any).activeDraftPicks ?? {};
  const passedSlots = new Set(Object.keys((state as any).activeDraftPassedPicks ?? {}).map(Number));
  draftOrder.forEach((team, index) => { if (team._forfeited) passedSlots.add(index + 1); });
  for (const [slotKey, savedPlayer] of Object.entries(activeDraftPicks)) {
    const slot = Number(slotKey);
    const team = draftOrder[slot - 1];
    if (!team || !savedPlayer?.internalId || !draftPoolIds.has(savedPlayer.internalId)) continue;
    const live = state.players.find(p => p.internalId === savedPlayer.internalId) ?? savedPlayer;
    pickMap.set(slot, { player: live, team });
    assignedIds.add(savedPlayer.internalId);
  }
  const nbaRoundSize = Math.max(1, state.teams.filter(candidate => candidate.id >= 0 && candidate.id < 100).length);
  for (const player of prospects) {
    if (assignedIds.has(player.internalId) || player.preDraftClub?.draftSelection !== 'source') continue;
    const round = Number(player.draft?.round ?? 0);
    const pick = Number(player.draft?.pick ?? 0);
    const slot = ((round - 1) * nbaRoundSize) + pick;
    if (round < 1 || pick < 1 || pick > nbaRoundSize || slot > draftOrder.length) continue;
    if (pickMap.has(slot) || passedSlots.has(slot)) continue;
    assignedIds.add(player.internalId);
    pickMap.set(slot, { player, team: draftOrder[slot - 1] });
  }
  const projectedDeclarations = prospects
    .filter(player =>
      !assignedIds.has(player.internalId)
      && player.preDraftClub?.draftSelection === 'projection'
      && Number(player.preDraftClub.projectedOverallPick ?? 0) > 0)
    .sort((left, right) =>
      Number(left.preDraftClub?.projectedOverallPick ?? 999)
      - Number(right.preDraftClub?.projectedOverallPick ?? 999));
  for (const player of projectedDeclarations) {
    const preferred = Number(player.preDraftClub?.projectedOverallPick ?? 1);
    const openSlots = draftOrder
      .map((_, index) => index + 1)
      .filter(slot => !pickMap.has(slot) && !passedSlots.has(slot));
    if (openSlots.length === 0) break;
    openSlots.sort((left, right) => Math.abs(left - preferred) - Math.abs(right - preferred) || left - right);
    const slot = openSlots[0];
    assignedIds.add(player.internalId);
    pickMap.set(slot, { player, team: draftOrder[slot - 1] });
  }
  for (let slot = 1; slot <= draftOrder.length; slot++) {
    if (pickMap.has(slot) || passedSlots.has(slot)) continue;
    const team = draftOrder[slot - 1];
    const available = prospects.filter(player => !assignedIds.has(player.internalId));
    const teamId = Number(team?.id ?? team?.tid);
    const best = Number.isFinite(teamId)
      ? selectAiDraftProspect({ state, teamId, pickSlot: slot, season, pool: available })
      : available[0];
    if (!best) break;
    assignedIds.add(best.internalId);
    pickMap.set(slot, { player: best, team });
  }

  const teamRetiredNums = new Map<number, Set<string>>();
  const teamTakenNums = new Map<number, Set<string>>();
  for (const t of state.teams) {
    teamRetiredNums.set(t.id, new Set<string>(((t as any).retiredJerseyNumbers ?? []).map((j: any) => String(j.number))));
  }
  for (const p of state.players) {
    if (p.tid >= 0 && p.jerseyNumber) {
      if (!teamTakenNums.has(p.tid)) teamTakenNums.set(p.tid, new Set());
      teamTakenNums.get(p.tid)!.add(String(p.jerseyNumber));
    }
  }
  const draftJerseyAssignments = new Map<string, string>();
  for (const [, { player, team }] of pickMap.entries()) {
    const retired = teamRetiredNums.get(team.id) ?? new Set<string>();
    const taken = teamTakenNums.get(team.id) ?? new Set<string>();
    const excluded = new Set([...retired, ...taken]);
    let num = player.jerseyNumber ? String(player.jerseyNumber) : '';
    if (!num || retired.has(num)) num = pickJerseyNumber(excluded);
    draftJerseyAssignments.set(player.internalId, num);
    if (!teamTakenNums.has(team.id)) teamTakenNums.set(team.id, new Set());
    teamTakenNums.get(team.id)!.add(num);
  }

  const undrafted: Array<{ name: string; id: string }> = [];
  const tunedById = new Map(tunedPlayers.map(player => [player.internalId, player]));
  const updatedPlayers: NBAPlayer[] = state.players.map(p => {
    for (const [slot, { player, team }] of pickMap.entries()) {
      if (player.internalId !== p.internalId) continue;
      const selectionFields = computeDraftPickFields(slot, team, state.leagueStats, season);
      if (!selectionFields) return p;
      const existingTransactions = p.transactions ?? [];
      const hasDraftTransaction = existingTransactions.some(transaction => (
        transaction.type === 'draft' && Number(transaction.season) === season
      ));
      return {
        ...p,
        pos: player.pos,
        overallRating: player.overallRating,
        potential: player.potential,
        ratings: player.ratings,
        ovrHistory: (player as any).ovrHistory ?? (p as any).ovrHistory,
        ovrTimeline: (player as any).ovrTimeline ?? (p as any).ovrTimeline,
        pbaDraftTunedVersion: (player as any).pbaDraftTunedVersion,
        ...selectionFields,
        euroAcademyPlayer: undefined,
        promotedFromAcademy: undefined,
        jerseyNumber: draftJerseyAssignments.get(p.internalId) ?? p.jerseyNumber,
        transactions: hasDraftTransaction
          ? existingTransactions
          : [...existingTransactions, { season, tid: team.id, type: 'draft', phase: 0, pickNum: slot }],
      };
    }
    const draftYear = (p as any).draft?.year;
    const isCurrentClass = !draftYear || Number(draftYear) === season;
    if (
      isCurrentClass &&
      (p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect') &&
      draftPoolIds.has(p.internalId) &&
      !assignedIds.has(p.internalId)
    ) {
      const tuned = tunedById.get(p.internalId);
      undrafted.push({ name: p.name, id: p.internalId });
      return {
        ...p,
        pos: tuned?.pos ?? p.pos,
        overallRating: Math.min(tuned?.overallRating ?? p.overallRating ?? 99, UNDRAFTED_OVR_CAP),
        potential: tuned?.potential ?? p.potential,
        ratings: tuned?.ratings ?? p.ratings,
        ovrHistory: (tuned as any)?.ovrHistory ?? (p as any).ovrHistory,
        ovrTimeline: (tuned as any)?.ovrTimeline ?? (p as any).ovrTimeline,
        pbaDraftTunedVersion: (tuned as any)?.pbaDraftTunedVersion ?? (p as any).pbaDraftTunedVersion,
        tid: -1 as const,
        status: 'Free Agent' as const,
        transactions: [
          ...((p as any).transactions ?? []),
          { season, tid: -1, type: 'draft', phase: 0, pickNum: 0 },
        ],
        draft: { round: 0, pick: 0, year: season, tid: -1, originalTid: -1 },
      };
    }
    return p;
  });

  const ordinal = (n: number): string => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const draftHistoryEntries: Array<{ text: string; date: string; type: string; playerIds: string[] }> = [];
  const existingDraftHistory = (state.history ?? []).filter(entry => (
    typeof entry !== 'string'
    && entry.type === 'Draft'
    && (String(entry.text ?? '').includes(String(season)) || String(entry.date ?? '').startsWith(String(season)))
  ));
  const historyPlayerIds = new Set(existingDraftHistory.flatMap(entry => typeof entry === 'string' ? [] : entry.playerIds ?? []));
  const historyPassedSlots = new Set(existingDraftHistory.flatMap(entry => {
    if (typeof entry === 'string') return [];
    const match = String(entry.text ?? '').match(/pass(?:es)? on the (\d+)(?:st|nd|rd|th)? overall pick/i);
    return match ? [Number(match[1])] : [];
  }));
  for (const [slot, { player, team }] of pickMap.entries()) {
    if (historyPlayerIds.has(player.internalId)) continue;
    draftHistoryEntries.push({
      text: `The ${team.name} select ${player.name} as the ${ordinal(slot)} overall pick of the ${season} ${pbaIsolated ? 'PBA' : 'NBA'} Draft.`,
      date: state.date,
      type: 'Draft',
      playerIds: [player.internalId],
    });
  }
  for (const u of undrafted) {
    draftHistoryEntries.push({
      text: `${u.name} went undrafted in the ${season} ${pbaIsolated ? 'PBA' : 'NBA'} Draft.`,
      date: state.date,
      type: 'Draft',
      playerIds: [u.id],
    });
  }

  const maxTwoWay = getTwoWayRosterLimit(state.leagueStats as any);
  const twoWayEnabled = maxTwoWay > 0;
  const wnbaDevelopmental = areWnbaDevelopmentalContractsEnabled(state.leagueStats);
  const secondaryLabel = getWnbaDevelopmentalContractLabel(state.leagueStats).toLowerCase();
  const isActiveTwoWay = (player: any) => twoWayEnabled && isTwoWayContract(player, state.leagueStats);
  const gmUserTeamId = state.gameMode === 'gm' ? (state as any).userTeamId : -999;
  const hasValidGmUserTeamId = state.gameMode !== 'gm' || (Number.isInteger(gmUserTeamId) && gmUserTeamId >= 0);
  let warnedUserTeamFillSkip = false;
  const shouldSkipUserTeamFill = (teamId: number): boolean => {
    if (state.gameMode !== 'gm') return false;
    if (hasValidGmUserTeamId && teamId !== gmUserTeamId) return false;
    if (!warnedUserTeamFillSkip) {
      console.warn('[autoRunDraft] SKIPPING user team fill');
      warnedUserTeamFillSkip = true;
    }
    return true;
  };

  const draftedTeamIds = new Set(Array.from(pickMap.values()).map(({ team }) => team.id));
  let twoWayPlayers = normalizeTeamJerseyNumbers(updatedPlayers, state.teams, season, {
    history: state.history,
    targetTeamIds: draftedTeamIds,
  });
  const twoWayHistoryEntries: Array<{ text: string; date: string; type: string; playerIds: string[] }> = [];
  if (!pbaIsolated && twoWayEnabled && maxTwoWay > 0) {
    const TWO_WAY_OVR_CAP = 45;
    const twoWayPool = twoWayPlayers
      .filter(p => p.tid === -1
        && p.status === 'Free Agent'
        && !isInternationalTournamentOnlyPlayer(p)
        && (p.overallRating ?? 99) <= TWO_WAY_OVR_CAP)
      .filter(p => {
        if (wnbaDevelopmental) return isWnbaDevelopmentalServiceEligible(p, season, state.leagueStats);
        const age = p.born?.year ? season - p.born.year : (p.age ?? 99);
        if (age >= 30) return false;
        if (age <= 24) return true;
        const yosFromStats = ((p as any).stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
        const draftYr = (p as any).draft?.year;
        const yosFromDraft = (draftYr && season > draftYr) ? season - draftYr : 0;
        return Math.max(yosFromStats, yosFromDraft) <= 2;
      })
      .sort((a, b) => (a.overallRating ?? 0) - (b.overallRating ?? 0));

    const twoWayAssignments = new Map<string, number>();
    const twoWayCountByTeam = new Map<number, number>();
    for (const player of twoWayPlayers) {
      if (player.tid >= 0 && player.tid < 100 && isActiveTwoWay(player)) {
        twoWayCountByTeam.set(player.tid, (twoWayCountByTeam.get(player.tid) ?? 0) + 1);
      }
    }
    for (const team of state.teams.filter(t => t.id >= 0 && t.id < 100)) {
      if (shouldSkipUserTeamFill(team.id)) continue;
      const standardCount = twoWayPlayers.filter(p => p.tid === team.id && !isActiveTwoWay(p)).length;
      if (standardCount < 1) continue;

      let given = twoWayCountByTeam.get(team.id) ?? 0;
      for (const candidate of twoWayPool) {
        if (given >= maxTwoWay) break;
        if (twoWayAssignments.has(candidate.internalId)) continue;
        twoWayAssignments.set(candidate.internalId, team.id);
        given++;
        twoWayCountByTeam.set(team.id, given);
      }
    }

    if (twoWayAssignments.size > 0) {
      twoWayPlayers = twoWayPlayers.map(p => {
        const teamId = twoWayAssignments.get(p.internalId);
        if (teamId === undefined) return p;
        const team = state.teams.find(t => t.id === teamId);
        const teamName = team?.name ?? `Team ${teamId}`;
        twoWayHistoryEntries.push({
          text: `${p.name} signed a ${secondaryLabel} contract with the ${teamName}.`,
          date: state.date,
          type: 'Signing',
          playerIds: [p.internalId],
        });
        return signDraftPoolTwoWayPlayer(p, teamId, season, state.date, state.leagueStats);
      });
    }
  }

  const keepHistoricalUndraftedInNbaFa = !pbaIsolated && isHistoricalNbaStart(Number((state as any).nbaStartYear ?? 0));
  const returned = pbaIsolated || keepHistoricalUndraftedInNbaFa
    ? { players: twoWayPlayers, historyEntries: [], euroScouting: state.euroScouting }
    : returnUndraftedToHomeLeague(twoWayPlayers, season, state as any);
  const draftDayTrim = pbaIsolated
    ? { players: returned.players, historyEntries: [] }
    : trimAiDraftDayTwoWayOverflow(returned.players, state, season);
  const playersAfterReturn = draftDayTrim.players;
  const returnHistory = returned.historyEntries;
  const existingHistory: any[] = (state.history as any[]) ?? [];
  const selectedPlayerIdsBySlot = Object.fromEntries(
    [...pickMap.entries()].map(([slot, row]) => [slot, row.player.internalId]),
  );
  const completedPassedSlots = draftOrder
    .map((_, index) => index + 1)
    .filter(slot => !pickMap.has(slot) && !draftOrder[slot - 1]._forfeited);
  for (const slot of completedPassedSlots) {
    if (historyPassedSlots.has(slot)) continue;
    const team = draftOrder[slot - 1];
    draftHistoryEntries.push({
      text: `The ${getTeamFullName(team) || team.name} pass on the ${ordinal(slot)} overall pick of the ${season} ${pbaIsolated ? 'PBA' : 'NBA'} Draft.`,
      date: state.date,
      type: 'Draft',
      playerIds: [],
    });
  }
  const completedLifecycle = lifecycleWithDraftProgress(
    { ...state, players: playersAfterReturn },
    selectedPlayerIdsBySlot,
    completedPassedSlots,
    draftOrder.length,
    true,
  );
  return {
    players: normalizeTeamJerseyNumbers(playersAfterReturn, state.teams, season, {
      history: state.history,
      targetTeamIds: draftedTeamIds,
    }),
    draftComplete: true,
    seasonLifecycle: completedLifecycle,
    ...(pbaIsolated ? {
      leagueStats: {
        ...state.leagueStats,
        pbaDraftComplete: true,
        pbaDraftCompleteSeason: season,
      },
    } : {}),
    draftPicks: (state.draftPicks ?? []).filter(p => p.forfeiture || p.season !== season
      || !draftOrder.some(team => (team._originalTid ?? team.id) === p.originalTid)),
    activeDraftPicks: undefined,
    activeDraftPassedPicks: undefined,
    activeDraftOrder: undefined,
    euroScouting: returned.euroScouting,
    history: [...existingHistory, ...draftHistoryEntries, ...twoWayHistoryEntries, ...returnHistory, ...draftDayTrim.historyEntries],
    offseasonChecklist: state.offseasonChecklist
      ? { ...state.offseasonChecklist, draft: 'done' }
      : state.offseasonChecklist,
  } as any;
};
