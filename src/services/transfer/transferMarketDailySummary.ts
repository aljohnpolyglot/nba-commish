import type { GameState, TransferMarketDailyDecision, TransferMarketDailySummary } from '../../types';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { getTeamFullName } from '../../utils/teamNames';

type SummaryState = Pick<
  GameState,
  'leagueStats' | 'loanAgreements' | 'nonNBATeams' | 'players' | 'teams' | 'transferActivity' | 'userTeamId'
>;

function teamDetails(state: SummaryState, teamId: number) {
  const team = [...state.teams, ...(state.nonNBATeams ?? [])].find(candidate =>
    Number('id' in candidate ? candidate.id : candidate.tid) === teamId,
  );
  return {
    name: team ? getTeamFullName(team) : 'Unknown club',
    logo: team ? getResolvedTeamLogoUrl(team, state.leagueStats.year) : undefined,
  };
}

function playerName(state: SummaryState, playerId: string): string {
  return state.players.find(player => player.internalId === playerId)?.name ?? 'Unknown player';
}

export function buildTransferMarketDailySummary(
  previous: SummaryState,
  next: SummaryState,
  date: string,
): TransferMarketDailySummary {
  const existingTransferIds = new Set((previous.transferActivity ?? []).map(entry => entry.id));
  const existingLoanIds = new Set((previous.loanAgreements ?? []).map(entry => entry.id));
  const decisions: TransferMarketDailyDecision[] = [];

  for (const activity of next.transferActivity ?? []) {
    if (existingTransferIds.has(activity.id) || activity.date !== date) continue;
    const from = teamDetails(next, activity.fromTid);
    const to = teamDetails(next, activity.toTid);
    decisions.push({
      id: activity.id,
      playerId: activity.playerId,
      playerName: activity.playerName,
      fromTeamId: activity.fromTid,
      fromTeamName: from.name,
      fromTeamLogo: from.logo,
      toTeamId: activity.toTid,
      toTeamName: to.name,
      toTeamLogo: to.logo,
      feeEUR: activity.feeEUR,
      type: 'transfer',
      involvesUserTeam: activity.fromTid === next.userTeamId || activity.toTid === next.userTeamId,
    });
  }

  for (const agreement of next.loanAgreements ?? []) {
    const isNewLoan = !existingLoanIds.has(agreement.id) && agreement.startDate === date;
    const previousAgreement = (previous.loanAgreements ?? []).find(entry => entry.id === agreement.id);
    const isNewReturn = agreement.returnedDate === date && previousAgreement?.status !== 'returned';
    if (!isNewLoan && !isNewReturn) continue;
    const fromTid = isNewReturn ? agreement.borrowerTid : agreement.parentTid;
    const toTid = isNewReturn ? agreement.parentTid : agreement.borrowerTid;
    const from = teamDetails(next, fromTid);
    const to = teamDetails(next, toTid);
    decisions.push({
      id: `${agreement.id}:${isNewReturn ? 'return' : 'loan'}`,
      playerId: agreement.playerId,
      playerName: playerName(next, agreement.playerId),
      fromTeamId: fromTid,
      fromTeamName: from.name,
      fromTeamLogo: from.logo,
      toTeamId: toTid,
      toTeamName: to.name,
      toTeamLogo: to.logo,
      feeEUR: isNewReturn ? 0 : agreement.feeEUR,
      type: isNewReturn ? 'loan-return' : 'loan',
      involvesUserTeam: fromTid === next.userTeamId || toTid === next.userTeamId,
    });
  }

  return { date, decisions };
}
