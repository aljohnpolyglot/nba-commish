import type { GameState } from '../../types';
import { normalizeDate } from '../../utils/helpers';
import { setRowStatus } from '../offseason/offseasonState';
import { tickLoanMarket } from './loanMarket';
import { buildTransferMarketDailySummary } from './transferMarketDailySummary';
import { tickTransferMarket } from './transferMarketTicker';

function nextGameDate(date: string): string {
  const next = new Date(`${normalizeDate(date)}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function advanceTransferMarketDay(state: GameState, includeSummary: boolean): GameState {
  if (state.leagueStats?.uiMode !== 'euro_isolated') return state;
  const summaryDate = normalizeDate(state.date);
  const transfer = tickTransferMarket(state);
  const afterTransfer = {
    ...state,
    transferListings: transfer.transferListings,
    transferBids: transfer.transferBids,
    transferActivity: transfer.transferActivity,
    players: transfer.players,
    teams: transfer.teams,
    nonNBATeams: transfer.nonNBATeams,
    history: transfer.historyEntries.length > 0
      ? [...(state.history ?? []), ...transfer.historyEntries]
      : state.history,
    pendingTransferToasts: transfer.userBidResolutions.length > 0
      ? [...(state.pendingTransferToasts ?? []), ...transfer.userBidResolutions]
      : state.pendingTransferToasts,
  } as GameState;
  const loan = tickLoanMarket(afterTransfer);
  const resolved = {
    ...afterTransfer,
    players: loan.players,
    teams: loan.teams,
    nonNBATeams: loan.nonNBATeams,
    loanOffers: loan.loanOffers,
    loanAgreements: loan.loanAgreements,
    history: loan.history,
    pendingLoanToasts: loan.pendingLoanToasts,
    date: nextGameDate(state.date),
    day: Number(state.day ?? 0) + 1,
    offseasonChecklist: setRowStatus(state.offseasonChecklist, 'transferMarket', 'in-progress'),
  } as GameState;
  return includeSummary
    ? {
        ...resolved,
        pendingTransferMarketSummary: buildTransferMarketDailySummary(state, resolved, summaryDate),
      }
    : resolved;
}

export function advanceTransferMarketToDate(state: GameState, targetDate: string): GameState {
  const target = normalizeDate(targetDate);
  let next = state;
  let guard = 0;
  while (normalizeDate(next.date) < target && guard < 62) {
    next = advanceTransferMarketDay(next, false);
    guard += 1;
  }
  return next;
}
