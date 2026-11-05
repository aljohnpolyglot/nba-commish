import type { GameState, NBAPlayer, NBATeam } from '../../types';
import { normalizeTeamJerseyNumbers, pickJerseyNumber } from '../../utils/jerseyUtils';
import { computeRookieContractSalaryUSD, computeRookieSalaryUSD } from '../../utils/rookieContractUtils';
import { getTeamFullName } from '../../utils/teamNames';
import { PBA_PLAYER_ECONOMY_VERSION } from '../pba/historicalEconomy';
import { lifecycleWithDraftProgress } from '../lifecycle/leagueSeasonLifecycle';

export function computeDraftPickFields(pickSlot: number, team: any, leagueStats: any, draftSeason: number) {
  if (!team) return null;
  const teamId = Number(team.id ?? team.tid);
  if (!Number.isFinite(teamId)) return null;
  const pbaMode = leagueStats?.uiMode === 'pba_isolated';
  const wnbaMode = leagueStats?.uiMode === 'wnba_isolated';
  const roundSize = Number(team._roundSize) || (pbaMode ? 12 : 30);
  const round = Number(team._round) || (team._r2 ? 2 : (pickSlot <= roundSize ? 1 : 2));
  const pickInRound = pickSlot - ((round - 1) * roundSize);
  return {
    tid: teamId,
    status: 'Prospect' as const,
    draft: { round, pick: pickInRound, year: draftSeason, tid: teamId, originalTid: team._originalTid ?? teamId },
  };
}

export function computeRookieContractFields(pickSlot: number, team: any, leagueStats: any, draftSeason: number) {
  const selection = computeDraftPickFields(pickSlot, team, leagueStats, draftSeason);
  if (!selection) return null;
  const pbaMode = leagueStats?.uiMode === 'pba_isolated';
  const wnbaMode = leagueStats?.uiMode === 'wnba_isolated';
  const roundSize = Number(team._roundSize) || (pbaMode ? 12 : 30);
  const round = selection.draft.round;
  const guaranteedYears = Number(leagueStats?.rookieContractLength ?? 2);
  const teamOptionsEnabled = leagueStats?.rookieTeamOptionsEnabled ?? true;
  const teamOptionYears = Number(leagueStats?.rookieTeamOptionYears ?? 2);
  const restrictedFreeAgency = leagueStats?.rookieRestrictedFreeAgentEligibility ?? true;
  const baseYears = pbaMode || wnbaMode ? Math.max(1, guaranteedYears) : (round === 1 ? guaranteedYears : 2);
  const optionYears = wnbaMode && teamOptionsEnabled
    ? teamOptionYears
    : (!pbaMode && round === 1 && teamOptionsEnabled) ? teamOptionYears : 0;
  const totalYears = baseYears + optionYears;
  const salaryAmount = computeRookieSalaryUSD(pickSlot, leagueStats, roundSize, draftSeason);
  const contractYears = Array.from({ length: totalYears }, (_, index) => {
    const year = draftSeason + index;
    return {
      season: wnbaMode ? String(year) : `${year}-${String(year + 1).slice(-2)}`,
      guaranteed: computeRookieContractSalaryUSD(pickSlot, index, leagueStats, roundSize, draftSeason),
      option: index >= baseYears ? 'Team' : '',
    };
  });
  return {
    tid: selection.tid,
    status: pbaMode ? 'PBA' as const : wnbaMode ? 'WNBA' as const : 'Active' as const,
    nonGuaranteed: !pbaMode && round >= 2 && (leagueStats?.r2ContractsNonGuaranteed ?? true),
    contract: {
      amount: Math.round(salaryAmount / 1_000),
      exp: wnbaMode ? draftSeason + totalYears - 1 : draftSeason + totalYears,
      salaryDetails: [{ season: draftSeason, amount: salaryAmount }],
      ...(optionYears > 0 && { hasTeamOption: true, teamOptionExp: draftSeason + baseYears + (wnbaMode ? 0 : 1) }),
      ...(!pbaMode && round === 1 && restrictedFreeAgency && { restrictedFA: true }),
      rookie: true,
      ...(pbaMode ? { pbaEconomyVersion: PBA_PLAYER_ECONOMY_VERSION, pbaSalarySource: 'rookie' as const } : {}),
    },
    contractYears,
  };
}

export function signDraftedRookieContracts(state: GameState): Partial<GameState> {
  const draftSeason = Number(state.seasonLifecycle?.draft.year ?? state.leagueStats.year);
  const roundSize = Math.max(1, state.teams.filter(team => team.id >= 0 && team.id < 100).length);
  const selectedPlayerIds = new Set<string>([
    ...Object.values(state.seasonLifecycle?.draft.selectedPlayerIdsBySlot ?? {}),
    ...Object.values(state.activeDraftPicks ?? {}).map(player => player.internalId),
  ].filter((playerId): playerId is string => typeof playerId === 'string' && playerId.length > 0));
  // Rookie contracts are the final step of this league's saved draft, not a
  // global scan of every player sharing the same draft year. Without this
  // authority boundary, WNBA/background prospects whose tids overlap NBA ids
  // can be signed into the active league.
  if (selectedPlayerIds.size === 0) return {};
  const signedPlayerIds: string[] = [];
  const players = state.players.map(player => {
    if (!selectedPlayerIds.has(player.internalId)) return player;
    const draft = player.draft;
    if (Number(draft?.year) !== draftSeason || !Number(draft?.round) || !Number(draft?.pick)) return player;
    if (player.contract?.rookie) return player;
    const team = state.teams.find(candidate => candidate.id === Number(draft?.tid));
    if (!team) return player;
    const round = Number(draft!.round);
    const pickInRound = Number(draft!.pick);
    const overallPick = (round - 1) * roundSize + pickInRound;
    const fields = computeRookieContractFields(overallPick, {
      ...team,
      _round: round,
      _roundSize: roundSize,
      _originalTid: draft?.originalTid ?? team.id,
    }, state.leagueStats, draftSeason);
    if (!fields) return player;
    signedPlayerIds.push(player.internalId);
    const transactions = player.transactions ?? [];
    const hasTransaction = transactions.some(transaction => (
      transaction.type === 'rookie_contract' && Number(transaction.season) === draftSeason
    ));
    return {
      ...player,
      ...fields,
      signedDate: state.date,
      transactions: hasTransaction
        ? transactions
        : [...transactions, { season: draftSeason, tid: team.id, type: 'rookie_contract', date: state.date }],
    } as NBAPlayer;
  });
  if (signedPlayerIds.length === 0) return {};
  return {
    players,
    seasonLifecycle: lifecycleWithDraftProgress(
      { ...state, players },
      state.seasonLifecycle?.draft.selectedPlayerIdsBySlot ?? {},
      state.seasonLifecycle?.draft.passedSlots ?? [],
      state.seasonLifecycle?.draft.expectedSlots ?? 0,
      true,
    ),
  };
}

interface DraftSelectionInput {
  activeDraftPicksAfter: Record<number, NBAPlayer>;
  draftLabel: string;
  draftOrderLength: number;
  draftSeason: number;
  fantasyDraftMode: boolean;
  jerseyTeams: NBATeam[];
  passedSlots: number[];
  pickSlot: number;
  player: NBAPlayer;
  state: GameState;
  team: any;
}

export function buildDraftSelectionPatch(input: DraftSelectionInput): Partial<GameState> | null {
  const { state, team, player, pickSlot, draftSeason, fantasyDraftMode } = input;
  const teamId = Number(team?.id ?? team?.tid);
  if (!Number.isFinite(teamId)) return null;
  const fields = fantasyDraftMode
    ? { tid: teamId, status: 'Active' as const }
    : computeDraftPickFields(pickSlot, team, state.leagueStats, draftSeason);
  if (!fields) return null;

  const retired = new Set<string>((team.retiredJerseyNumbers ?? []).map((entry: any) => String(entry.number)));
  const taken = new Set<string>(state.players
    .filter(entry => entry.tid === teamId && entry.jerseyNumber && entry.internalId !== player.internalId)
    .map(entry => String(entry.jerseyNumber)));
  const existingNumber = player.jerseyNumber ? String(player.jerseyNumber) : '';
  const jerseyNumber = !existingNumber || retired.has(existingNumber)
    ? pickJerseyNumber(new Set([...retired, ...taken]))
    : existingNumber;
  const transactionType = fantasyDraftMode ? 'fantasy_draft' : 'draft';
  const updatedPlayers = state.players.map(entry => {
    if (entry.internalId !== player.internalId) return entry;
    const sourceHistory = player as NBAPlayer & {
      ovrHistory?: unknown;
      ovrTimeline?: unknown;
      pbaDraftTunedVersion?: number;
    };
    const existingHistory = entry as NBAPlayer & {
      ovrHistory?: unknown;
      ovrTimeline?: unknown;
    };
    const transactions = entry.transactions ?? [];
    const hasTransaction = transactions.some(transaction => (
      transaction.type === transactionType && Number(transaction.season) === draftSeason
    ));
    return {
      ...entry,
      pos: player.pos,
      overallRating: player.overallRating,
      potential: player.potential,
      ratings: player.ratings,
      ovrHistory: sourceHistory.ovrHistory ?? existingHistory.ovrHistory,
      ovrTimeline: sourceHistory.ovrTimeline ?? existingHistory.ovrTimeline,
      pbaDraftTunedVersion: sourceHistory.pbaDraftTunedVersion,
      ...fields,
      jerseyNumber,
      transactions: hasTransaction
        ? transactions
        : [...transactions, { season: draftSeason, tid: teamId, type: transactionType, phase: 0, pickNum: pickSlot }],
    } as unknown as NBAPlayer;
  });
  const round = 'draft' in fields ? fields.draft.round : 0;
  const originalTid = team._originalTid ?? teamId;
  const draftPicks = fantasyDraftMode
    ? state.draftPicks ?? []
    : (state.draftPicks ?? []).filter(pick => !(
      pick.season === draftSeason && pick.round === round && pick.originalTid === originalTid
    ));
  const lifecycle = fantasyDraftMode ? undefined : lifecycleWithDraftProgress(
    { ...state, players: updatedPlayers },
    Object.fromEntries(Object.entries(input.activeDraftPicksAfter).map(([slot, draftedPlayer]) => [Number(slot), draftedPlayer.internalId])),
    input.passedSlots,
    input.draftOrderLength,
    true,
  );

  return {
    players: normalizeTeamJerseyNumbers(updatedPlayers, input.jerseyTeams, draftSeason, {
      history: state.history,
      targetTeamIds: [teamId],
    }),
    draftPicks,
    activeDraftPicks: input.activeDraftPicksAfter,
    activeDraftPassedPicks: Object.fromEntries(input.passedSlots.map(slot => [slot, true])),
    ...(lifecycle ? { seasonLifecycle: lifecycle } : {}),
    history: [
      ...(state.history ?? []),
      {
        text: `The ${getTeamFullName(team) || team.name} select ${player.name} as the ${pickSlot}${ordinalSuffix(pickSlot)} overall pick of the ${draftSeason} ${input.draftLabel}.`,
        date: state.date,
        type: 'Draft',
        playerIds: [player.internalId],
      },
    ],
  };
}

const ordinalSuffix = (value: number): string => {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const remainder = value % 100;
  return suffixes[(remainder - 20) % 10] || suffixes[remainder] || suffixes[0];
};
