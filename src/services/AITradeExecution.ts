import type { DraftPick, GameState, NBATeam, TradeProposal, TransactionDto } from '../types';
import { DEFAULT_TRADABLE_PICK_SEASONS } from './draft/DraftPickGenerator';
import { buildFullDraftSlotMap, formatPickLabel } from './draft/draftClassStrength';
import { generateTPEsFromTrade } from '../utils/tradeExceptionUtils';
import { validateStepienRule } from './trade/stepienRule';
import { validateCBATradeRules, type CBATradeValidationResult } from '../utils/cbaTradeRules';
import { consumeBiannualException, recordTeamCapSpaceUse } from '../utils/salaryUtils';
import { resolveAnyTeam } from '../utils/teamLookup';
import { getTradeValidationLeagueStats } from './trade/tradeLeagueStats';
import { applyTradeToPlayer } from '../utils/playerBirdRights';
import { isTwoWayContract } from '../utils/contractTypes';
import { getStandardRosterLimit, getTwoWayRosterLimit } from '../utils/rosterLimits';
import { trimPbaOversizedRosters } from './pba/rosterTrim';
import { hasExplicitPbaImportProvenance } from './pba/importManager';
import { isPbaTradeTeam } from './pba/tradeWindow';
import { isOnRoster } from '../utils/teamLookup';
import { isEurostashPlayer, isTradeAssetOwnedBy, transferEurostashRights } from './freeAgency/eurostashRights';
import { buildTradeHistoryMetadata } from './trade/tradeHistory';

function getKnownTradeTeams(state: GameState): NBATeam[] {
  const teams = new Map<number, NBATeam>();
  for (const team of state.teams ?? []) teams.set(team.id, team);
  for (const team of state.nonNBATeams ?? []) {
    const resolved = resolveAnyTeam(team.tid, state.teams, state.nonNBATeams ?? []);
    if (resolved) teams.set(resolved.id, { ...resolved, cashUsedInTrades: (team as any).cashUsedInTrades } as NBATeam);
  }
  return Array.from(teams.values());
}

function getTradeHistoryLeague(team: NBATeam): string | undefined {
  const teamId = Number((team as any)?.id ?? -1);
  if (teamId >= 0 && teamId < 100) return undefined;
  const league = String((team as any)?.league ?? (team as any)?.conference ?? '').trim();
  return league || undefined;
}

export function validatePostTradeRosterLimits(
  proposal: Pick<TradeProposal, 'proposingTeamId' | 'receivingTeamId' | 'playersOffered' | 'playersRequested'>,
  state: Pick<GameState, 'players' | 'leagueStats'>,
  leagueStats: GameState['leagueStats'] = state.leagueStats,
): string | null {
  const maxStandard = getStandardRosterLimit(leagueStats);
  const minStandard = Math.min(maxStandard, Math.max(1, Number(leagueStats.minPlayersPerTeam ?? 1)));
  const maxTwoWay = getTwoWayRosterLimit(leagueStats);
  const enforceMinimum = leagueStats.uiMode === 'pba_isolated';
  const offered = new Set(proposal.playersOffered);
  const requested = new Set(proposal.playersRequested);
  const projectedTid = (player: GameState['players'][number]) => {
    if (isEurostashPlayer(player)) return Number(player.tid);
    if (offered.has(player.internalId)) return proposal.receivingTeamId;
    if (requested.has(player.internalId)) return proposal.proposingTeamId;
    return Number(player.tid);
  };
  const rosterCounts = (teamId: number, projected: boolean) => {
    let standard = 0;
    let localStandard = 0;
    let twoWay = 0;
    for (const player of state.players) {
      if (!isOnRoster(player)) continue;
      const tid = projected ? projectedTid(player) : Number(player.tid);
      if (tid !== teamId) continue;
      if (isTwoWayContract(player, leagueStats)) twoWay += 1;
      else {
        standard += 1;
        if (!hasExplicitPbaImportProvenance(player)) localStandard += 1;
      }
    }
    return { standard, localStandard, twoWay };
  };

  for (const teamId of [proposal.proposingTeamId, proposal.receivingTeamId]) {
    const before = rosterCounts(teamId, false);
    const after = rosterCounts(teamId, true);
    if (after.standard > maxStandard && after.standard >= before.standard) {
      return `AI trade failed revalidation: team ${teamId} would carry ${after.standard} standard players (limit ${maxStandard}).`;
    }
    if (enforceMinimum && after.localStandard < minStandard && after.localStandard <= before.localStandard) {
      return `AI trade failed revalidation: PBA team ${teamId} would carry ${after.localStandard} local players (minimum ${minStandard}).`;
    }
    if (after.twoWay > maxTwoWay && after.twoWay >= before.twoWay) {
      return `AI trade failed revalidation: team ${teamId} would carry ${after.twoWay} two-way players (limit ${maxTwoWay}).`;
    }
  }
  return null;
}

function validateAITradeExecution(
  proposal: TradeProposal,
  state: GameState,
): { ok: true; cba: CBATradeValidationResult } | { ok: false; reason: string } {
  const {
    proposingTeamId,
    receivingTeamId,
    playersOffered,
    playersRequested,
    picksOffered,
    picksRequested,
  } = proposal;

  const dupPlayer = playersOffered.some(id => playersRequested.includes(id));
  const dupPick = picksOffered.some(id => picksRequested.includes(id));
  if (dupPlayer || dupPick) {
    return { ok: false, reason: 'AI trade failed revalidation: duplicate asset listed on both sides.' };
  }

  const offeredPlayers = state.players.filter(p => playersOffered.includes(p.internalId));
  const requestedPlayers = state.players.filter(p => playersRequested.includes(p.internalId));
  const offeredPicksState = state.draftPicks.filter(pk => picksOffered.includes(pk.dpid));
  const requestedPicksState = state.draftPicks.filter(pk => picksRequested.includes(pk.dpid));

  if (
    offeredPlayers.length !== playersOffered.length ||
    requestedPlayers.length !== playersRequested.length ||
    offeredPicksState.length !== picksOffered.length ||
    requestedPicksState.length !== picksRequested.length
  ) {
    return { ok: false, reason: 'AI trade failed revalidation: one or more assets no longer exist.' };
  }

  if (offeredPlayers.some(p => !isTradeAssetOwnedBy(p, proposingTeamId)) || offeredPicksState.some(pk => pk.tid !== proposingTeamId)) {
    return { ok: false, reason: 'AI trade failed revalidation: proposing team no longer owns all outgoing assets.' };
  }
  if (requestedPlayers.some(p => !isTradeAssetOwnedBy(p, receivingTeamId)) || requestedPicksState.some(pk => pk.tid !== receivingTeamId)) {
    return { ok: false, reason: 'AI trade failed revalidation: receiving team no longer owns all outgoing assets.' };
  }

  const knownTeams = getKnownTradeTeams(state);
  const tradeLeagueStats = getTradeValidationLeagueStats(state, proposingTeamId, receivingTeamId);
  const rosterViolation = validatePostTradeRosterLimits(proposal, state, tradeLeagueStats ?? state.leagueStats);
  if (rosterViolation) return { ok: false, reason: rosterViolation };
  const pbaTrade = tradeLeagueStats?.uiMode === 'pba_isolated'
    || knownTeams.some(team => (team.id === proposingTeamId || team.id === receivingTeamId) && isPbaTradeTeam(team));
  if (pbaTrade && [...offeredPlayers, ...requestedPlayers].some(hasExplicitPbaImportProvenance)) {
    return { ok: false, reason: 'AI trade failed revalidation: PBA imports are not trade eligible.' };
  }

  if (tradeLeagueStats?.stepienRuleEnabled !== false && (offeredPicksState.length > 0 || requestedPicksState.length > 0)) {
    const currentYear = tradeLeagueStats?.year ?? state.leagueStats?.year ?? new Date().getFullYear();
    const tradablePickWindow = tradeLeagueStats?.tradableDraftPickSeasons ?? DEFAULT_TRADABLE_PICK_SEASONS;
    const stepien = validateStepienRule(state.draftPicks ?? [], currentYear, tradablePickWindow, proposingTeamId, receivingTeamId, offeredPicksState, requestedPicksState);
    if (!stepien.ok) {
      const stepienReason = 'reason' in stepien ? stepien.reason : 'Stepien Rule failure.';
      return { ok: false, reason: `AI trade failed revalidation: ${stepienReason}` };
    }
  }

  const cashFromProposer = proposal.cashOfferedUSD ?? 0;
  const cashFromReceiver = proposal.cashRequestedUSD ?? 0;
  if (playersOffered.length + picksOffered.length === 0 && cashFromProposer === 0) {
    return { ok: false, reason: 'AI trade failed revalidation: proposer side empty.' };
  }
  const oneSidedSalaryDump =
    playersOffered.length > 0 &&
    picksOffered.length > 0 &&
    playersRequested.length + picksRequested.length === 0 &&
    cashFromReceiver === 0;
  if (!oneSidedSalaryDump && playersRequested.length + picksRequested.length === 0 && cashFromReceiver === 0) {
    return { ok: false, reason: 'AI trade failed revalidation: receiver side empty.' };
  }
  const proposingTeamCashUsed = (knownTeams.find(t => t.id === proposingTeamId) as any)?.cashUsedInTrades ?? 0;
  const receivingTeamCashUsed = (knownTeams.find(t => t.id === receivingTeamId) as any)?.cashUsedInTrades ?? 0;
  if (proposingTeamCashUsed + cashFromProposer > 7_500_000 + 1) {
    return { ok: false, reason: 'AI trade failed revalidation: proposer cash cap.' };
  }
  if (receivingTeamCashUsed + cashFromReceiver > 7_500_000 + 1) {
    return { ok: false, reason: 'AI trade failed revalidation: receiver cash cap.' };
  }

  const cba = validateCBATradeRules({
    teamAId: proposingTeamId,
    teamBId: receivingTeamId,
    teamAPlayers: offeredPlayers,
    teamBPlayers: requestedPlayers,
    teamAPicks: offeredPicksState,
    teamBPicks: requestedPicksState,
    teamACashUSD: cashFromProposer,
    teamBCashUSD: cashFromReceiver,
    teams: knownTeams,
    players: state.players,
    leagueStats: tradeLeagueStats,
    currentDate: state.date,
    currentYear: tradeLeagueStats?.year ?? state.leagueStats?.year ?? new Date().getFullYear(),
    teamAReceivesSignAndTrade: proposal.isSignAndTrade === true,
    teamBReceivesSignAndTrade: proposal.isSignAndTrade === true,
  });
  if (!cba.ok) {
    return { ok: false, reason: `AI trade failed revalidation: ${cba.reason}` };
  }
  return { ok: true, cba };
}

export function executeAITrade(proposal: TradeProposal, state: GameState): Partial<GameState> {
  const {
    proposingTeamId, receivingTeamId,
    playersOffered, playersRequested,
    picksOffered, picksRequested,
  } = proposal;

  const proposingTeam = resolveAnyTeam(proposingTeamId, state.teams, state.nonNBATeams ?? []);
  const receivingTeam = resolveAnyTeam(receivingTeamId, state.teams, state.nonNBATeams ?? []);
  if (!proposingTeam || !receivingTeam) return {};

  const validation = validateAITradeExecution(proposal, state);
  if (validation.ok === false) {
    return {
      tradeProposals: (state.tradeProposals ?? []).map(p =>
        p.id === proposal.id
          ? { ...p, status: 'rejected' as const, tradeText: validation.reason }
          : p
      ),
    };
  }

  const tradeLeagueStats = getTradeValidationLeagueStats(state, proposingTeamId, receivingTeamId);
  const currentYear = tradeLeagueStats?.year ?? state.leagueStats?.year ?? new Date().getFullYear();
  const backgroundNba = (
    state.leagueStats.uiMode === 'pba_isolated' ||
    state.leagueStats.uiMode === 'euro_isolated'
  ) && proposingTeamId < 100 && receivingTeamId < 100;
  let exceptionRulesState: GameState['leagueStats'] = {
    ...tradeLeagueStats,
    capExceptionUsage: backgroundNba
      ? state.leagueStats.backgroundNbaCapExceptionUsage ?? {}
      : state.leagueStats.capExceptionUsage ?? {},
  };
  if (validation.cba.teamABaeUsedUSD) {
    exceptionRulesState = consumeBiannualException(exceptionRulesState, {
      teamId: proposingTeamId,
      amountUSD: validation.cba.teamABaeUsedUSD,
      season: currentYear,
      currentDate: state.date,
    });
  }
  if (validation.cba.teamBBaeUsedUSD) {
    exceptionRulesState = consumeBiannualException(exceptionRulesState, {
      teamId: receivingTeamId,
      amountUSD: validation.cba.teamBBaeUsedUSD,
      season: currentYear,
      currentDate: state.date,
    });
  }
  if (validation.cba.teamACapRoomUsedUSD) {
    exceptionRulesState = recordTeamCapSpaceUse(exceptionRulesState, proposingTeamId, currentYear);
  }
  if (validation.cba.teamBCapRoomUsedUSD) {
    exceptionRulesState = recordTeamCapSpaceUse(exceptionRulesState, receivingTeamId, currentYear);
  }
  let updatedPlayers = state.players.map(p => {
    if (playersOffered.includes(p.internalId)) return isEurostashPlayer(p)
      ? transferEurostashRights(p, receivingTeamId)
      : applyTradeToPlayer(p, receivingTeamId, currentYear, 0);
    if (playersRequested.includes(p.internalId)) return isEurostashPlayer(p)
      ? transferEurostashRights(p, proposingTeamId)
      : applyTradeToPlayer(p, proposingTeamId, currentYear, 0);
    return p;
  });
  const pbaTrim = trimPbaOversizedRosters(state, updatedPlayers);
  updatedPlayers = pbaTrim.players;

  const updatedPicks = state.draftPicks.map(pk => {
    if (picksOffered.includes(pk.dpid)) return { ...pk, tid: receivingTeamId };
    if (picksRequested.includes(pk.dpid)) return { ...pk, tid: proposingTeamId };
    return pk;
  });

  const offeredNames = playersOffered.map(id => state.players.find(p => p.internalId === id)?.name).filter(Boolean);
  const requestedNames = playersRequested.map(id => state.players.find(p => p.internalId === id)?.name).filter(Boolean);
  const knownTeams = getKnownTradeTeams(state);
  const lotterySlotByTid = buildFullDraftSlotMap((state as any).draftLotteryResult, knownTeams);
  const formatPickDesc = (dpid: number): string => {
    const pk = state.draftPicks.find(p => p.dpid === dpid);
    if (!pk) return 'pick';
    const origTeam = resolveAnyTeam(pk.originalTid, state.teams, state.nonNBATeams ?? []);
    return `${formatPickLabel(pk, currentYear, lotterySlotByTid, false)} (${origTeam?.abbrev ?? '?'})`;
  };
  const offeredPicks = picksOffered.map(formatPickDesc);
  const requestedPicks = picksRequested.map(formatPickDesc);
  const joinAssets = (players: string[], picks: string[]): string => {
    if (players.length === 0 && picks.length === 0) return '';
    if (picks.length === 0) return players.join(', ');
    if (players.length === 0) return picks.join(', ');
    return `${players.join(', ')} + ${picks.join(', ')}`;
  };
  const sentAssets = joinAssets(offeredNames as string[], offeredPicks);
  const recvAssets = joinAssets(requestedNames as string[], requestedPicks);

  const cashOut = proposal.cashOfferedUSD ?? 0;
  const cashIn = proposal.cashRequestedUSD ?? 0;
  const fmtCash = (usd: number) => `$${(usd / 1_000_000).toFixed(1)}M`;
  const sentWithCash = cashOut > 0 ? (sentAssets ? `${sentAssets} + ${fmtCash(cashOut)} cash` : `${fmtCash(cashOut)} cash`) : sentAssets;
  const recvWithCash = cashIn > 0 ? (recvAssets ? `${recvAssets} + ${fmtCash(cashIn)} cash` : `${fmtCash(cashIn)} cash`) : recvAssets;

  const buildHistoryText = (): string => {
    if (sentWithCash && recvWithCash) {
      return `TRADE: ${proposingTeam.name} sends ${sentWithCash} to ${receivingTeam.name} for ${recvWithCash}.`;
    }
    if (sentWithCash) {
      return `TRADE: ${proposingTeam.name} sends ${sentWithCash} to ${receivingTeam.name}.`;
    }
    if (recvWithCash) {
      return `TRADE: ${proposingTeam.name} receives ${recvWithCash} from ${receivingTeam.name}.`;
    }
    return `TRADE: ${proposingTeam.name} and ${receivingTeam.name} exchange picks.`;
  };
  const historyTransaction: TransactionDto = {
    teams: {
      [proposingTeamId]: {
        playersSent: state.players.filter(player => playersOffered.includes(player.internalId)),
        picksSent: state.draftPicks.filter(pick => picksOffered.includes(pick.dpid)),
        cashSentUSD: cashOut,
      },
      [receivingTeamId]: {
        playersSent: state.players.filter(player => playersRequested.includes(player.internalId)),
        picksSent: state.draftPicks.filter(pick => picksRequested.includes(pick.dpid)),
        cashSentUSD: cashIn,
      },
    },
  };
  const historyEntry = {
    text: buildHistoryText(),
    date: state.date,
    type: 'Trade' as const,
    ...buildTradeHistoryMetadata(historyTransaction, state.date, proposal.id),
    tid: proposingTeamId,
    league: getTradeHistoryLeague(proposingTeam),
  };

  const tpeEnabled = tradeLeagueStats?.tradeExceptionsEnabled !== false;
  let updatedTeams = state.teams;
  if (tpeEnabled && proposingTeamId < 100 && receivingTeamId < 100) {
    const sentByProp = state.players.filter(p => playersOffered.includes(p.internalId));
    const sentByRecv = state.players.filter(p => playersRequested.includes(p.internalId));
    const txnForTPE = {
      teams: {
        [proposingTeamId]: { playersSent: sentByProp, picksSent: [] as DraftPick[] },
        [receivingTeamId]: { playersSent: sentByRecv, picksSent: [] as DraftPick[] },
      },
    };
    updatedTeams = generateTPEsFromTrade(
      txnForTPE,
      state.teams,
      state.players,
      tradeLeagueStats,
      state.date,
      proposal.id,
    );
  }

  let updatedNonNBATeams = state.nonNBATeams;
  if (cashOut > 0 || cashIn > 0) {
    updatedTeams = updatedTeams.map(t => {
      if (t.id === proposingTeamId && cashOut > 0) {
        return { ...t, cashUsedInTrades: (t.cashUsedInTrades ?? 0) + cashOut };
      }
      if (t.id === receivingTeamId && cashIn > 0) {
        return { ...t, cashUsedInTrades: (t.cashUsedInTrades ?? 0) + cashIn };
      }
      return t;
    });
    if (updatedNonNBATeams) {
      updatedNonNBATeams = updatedNonNBATeams.map(t => {
        if (t.tid === proposingTeamId && cashOut > 0) {
          return { ...t, cashUsedInTrades: ((t as any).cashUsedInTrades ?? 0) + cashOut } as any;
        }
        if (t.tid === receivingTeamId && cashIn > 0) {
          return { ...t, cashUsedInTrades: ((t as any).cashUsedInTrades ?? 0) + cashIn } as any;
        }
        return t;
      });
    }
  }

  const patch: Partial<GameState> = {
    players: updatedPlayers,
    draftPicks: updatedPicks,
    teams: updatedTeams,
    history: [...(state.history ?? []), historyEntry, ...pbaTrim.history],
    tradeProposals: (state.tradeProposals ?? []).map(p =>
      p.id === proposal.id ? { ...p, status: 'executed' as const } : p
    ),
    leagueStats: backgroundNba
      ? {
          ...state.leagueStats,
          backgroundNbaCapExceptionUsage: exceptionRulesState.capExceptionUsage ?? {},
        }
      : {
          ...state.leagueStats,
          capExceptionUsage: exceptionRulesState.capExceptionUsage ?? {},
        },
  };
  if (updatedNonNBATeams !== state.nonNBATeams) patch.nonNBATeams = updatedNonNBATeams;
  return patch;
}
