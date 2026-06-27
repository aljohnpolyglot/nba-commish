import type { DraftPick, GameState, NBATeam, TradeProposal } from '../types';
import { DEFAULT_TRADABLE_PICK_SEASONS } from './draft/DraftPickGenerator';
import { buildFullDraftSlotMap, formatPickLabel } from './draft/draftClassStrength';
import { generateTPEsFromTrade } from '../utils/tradeExceptionUtils';
import { validateStepienRule } from './trade/stepienRule';
import { validateCBATradeRules } from '../utils/cbaTradeRules';
import { resolveAnyTeam } from '../utils/teamLookup';
import { isPbaIsolatedMode } from '../utils/uiMode';

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

function validateAITradeExecution(
  proposal: TradeProposal,
  state: GameState,
): { ok: true } | { ok: false; reason: string } {
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

  if (offeredPlayers.some(p => p.tid !== proposingTeamId) || offeredPicksState.some(pk => pk.tid !== proposingTeamId)) {
    return { ok: false, reason: 'AI trade failed revalidation: proposing team no longer owns all outgoing assets.' };
  }
  if (requestedPlayers.some(p => p.tid !== receivingTeamId) || requestedPicksState.some(pk => pk.tid !== receivingTeamId)) {
    return { ok: false, reason: 'AI trade failed revalidation: receiving team no longer owns all outgoing assets.' };
  }

  if (state.leagueStats?.stepienRuleEnabled !== false && (offeredPicksState.length > 0 || requestedPicksState.length > 0)) {
    const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
    const tradablePickWindow = state.leagueStats?.tradableDraftPickSeasons ?? DEFAULT_TRADABLE_PICK_SEASONS;
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
  if (playersRequested.length + picksRequested.length === 0 && cashFromReceiver === 0) {
    return { ok: false, reason: 'AI trade failed revalidation: receiver side empty.' };
  }
  const knownTeams = getKnownTradeTeams(state);
  const proposingTeamCashUsed = (knownTeams.find(t => t.id === proposingTeamId) as any)?.cashUsedInTrades ?? 0;
  const receivingTeamCashUsed = (knownTeams.find(t => t.id === receivingTeamId) as any)?.cashUsedInTrades ?? 0;
  if (proposingTeamCashUsed + cashFromProposer > 7_500_000 + 1) {
    return { ok: false, reason: 'AI trade failed revalidation: proposer cash cap.' };
  }
  if (receivingTeamCashUsed + cashFromReceiver > 7_500_000 + 1) {
    return { ok: false, reason: 'AI trade failed revalidation: receiver cash cap.' };
  }

  if (!isPbaIsolatedMode(state)) {
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
      leagueStats: state.leagueStats,
      currentDate: state.date,
      currentYear: state.leagueStats?.year ?? new Date().getFullYear(),
      teamAReceivesSignAndTrade: proposal.isSignAndTrade === true,
      teamBReceivesSignAndTrade: proposal.isSignAndTrade === true,
    });
    if (!cba.ok) {
      return { ok: false, reason: `AI trade failed revalidation: ${cba.reason}` };
    }
  }
  return { ok: true };
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

  const updatedPlayers = state.players.map(p => {
    if (playersOffered.includes(p.internalId)) return { ...p, tid: receivingTeamId, yearsWithTeam: 0 };
    if (playersRequested.includes(p.internalId)) return { ...p, tid: proposingTeamId, yearsWithTeam: 0 };
    return p;
  });

  const updatedPicks = state.draftPicks.map(pk => {
    if (picksOffered.includes(pk.dpid)) return { ...pk, tid: receivingTeamId };
    if (picksRequested.includes(pk.dpid)) return { ...pk, tid: proposingTeamId };
    return pk;
  });

  const offeredNames = playersOffered.map(id => state.players.find(p => p.internalId === id)?.name).filter(Boolean);
  const requestedNames = playersRequested.map(id => state.players.find(p => p.internalId === id)?.name).filter(Boolean);
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
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
  const historyEntry = {
    text: buildHistoryText(),
    date: state.date,
    type: 'Trade' as const,
    playerIds: [...playersOffered, ...playersRequested],
    tid: proposingTeamId,
    league: getTradeHistoryLeague(proposingTeam),
  };

  const tpeEnabled = state.leagueStats?.tradeExceptionsEnabled !== false;
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
    updatedTeams = generateTPEsFromTrade(txnForTPE, state.teams, state.players, state.leagueStats, state.date);
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
    history: [...(state.history ?? []), historyEntry],
    tradeProposals: (state.tradeProposals ?? []).map(p =>
      p.id === proposal.id ? { ...p, status: 'executed' as const } : p
    ),
  };
  if (updatedNonNBATeams !== state.nonNBATeams) patch.nonNBATeams = updatedNonNBATeams;
  return patch;
}
