import type { GameState, NBAPlayer } from '../../../types';
import { computeContractOffer, formatContractUSD } from '../../../utils/salaryUtils';

type HistoryEntry = NonNullable<GameState['history']>[number];

export type PendingOptionToast = {
  playerName: string;
  teamName: string;
  pos: string;
  decision: 'player-in' | 'player-out' | 'team-exercised' | 'team-declined';
  amountM?: number;
  amountUSD?: number;
};

type OptionDecisionArgs = {
  state: GameState;
  currentYear: number;
  nextYear: number;
  optionDateStr: string;
  leagueStats?: GameState['leagueStats'];
};

type OptionDecisionResult = {
  playerOptOutIds: Set<string>;
  playerOptInIds: Set<string>;
  teamOptionExercisedIds: Set<string>;
  teamOptionDeclinedIds: Set<string>;
  playerOptionNews: string[];
  teamOptionNews: string[];
  playerOptionHistory: HistoryEntry[];
  pendingOptionToasts: PendingOptionToast[];
};

export function resolveSeasonRolloverOptionDecisions({
  state,
  currentYear,
  nextYear,
  optionDateStr,
  leagueStats,
}: OptionDecisionArgs): OptionDecisionResult {
  const playerOptOutIds = new Set<string>();
  const playerOptInIds = new Set<string>();
  const teamOptionExercisedIds = new Set<string>();
  const teamOptionDeclinedIds = new Set<string>();
  const playerOptionNews: string[] = [];
  const teamOptionNews: string[] = [];
  const playerOptionHistory: HistoryEntry[] = [];
  const pendingOptionToasts: PendingOptionToast[] = [];

  const isGM = state.gameMode === 'gm';
  const userTid = isGM ? state.userTeamId : undefined;
  const optionSeasonStr = `${currentYear}-${String(nextYear).slice(-2)}`;
  const optionSalaryUSD = (player: NBAPlayer): number => {
    const contractYears = (player as any).contractYears as Array<{ season?: string; guaranteed?: number; option?: string }> | undefined;
    const entry = Array.isArray(contractYears)
      ? contractYears.find(cy => cy.season === optionSeasonStr && (cy.option ?? '').toLowerCase().includes('player'))
      : undefined;
    const guaranteed = Number(entry?.guaranteed ?? 0);
    return guaranteed > 0 ? guaranteed : (player.contract?.amount ?? 0) * 1_000;
  };

  for (const player of state.players) {
    if (!(player as any).contract?.hasPlayerOption) continue;
    if (!player.contract || (player.contract.exp ?? 0) !== nextYear) continue;
    if (player.tid < 0 || player.tid >= 100) continue;

    const offer = computeContractOffer(player, (leagueStats ?? state.leagueStats) as any);
    const currentAmountUSD = optionSalaryUSD(player);
    const team = state.teams.find(t => t.id === player.tid);
    if (currentAmountUSD >= offer.salaryUSD * 0.9) {
      playerOptInIds.add(player.internalId);
      const text = `${player.name} has accepted his player option with the ${team?.name ?? 'team'}: ${formatContractUSD(currentAmountUSD)}`;
      playerOptionNews.push(text);
      playerOptionHistory.push({ text, date: optionDateStr, type: 'Signing', playerIds: [player.internalId], tid: player.tid } as unknown as HistoryEntry);
      if (isGM && player.tid === userTid) {
        pendingOptionToasts.push({
          playerName: player.name,
          teamName: team?.name ?? '',
          pos: (player as any).pos ?? '',
          decision: 'player-in',
          amountM: +(currentAmountUSD / 1_000_000).toFixed(1),
          amountUSD: currentAmountUSD,
        });
      }
      continue;
    }

    playerOptOutIds.add(player.internalId);
    const text = `${player.name} has declined his player option${team ? ` with the ${team.name}` : ''}, becoming a free agent.`;
    playerOptionNews.push(text);
    playerOptionHistory.push({ text, date: optionDateStr, type: 'Signing', playerIds: [player.internalId], tid: player.tid } as unknown as HistoryEntry);
    if (isGM && player.tid === userTid) {
      pendingOptionToasts.push({
        playerName: player.name,
        teamName: team?.name ?? '',
        pos: (player as any).pos ?? '',
        decision: 'player-out',
      });
    }
  }

  for (const player of state.players) {
    if (!(player as any).contract?.hasTeamOption) continue;
    const teamOptExp: number = (player as any).contract?.teamOptionExp ?? -1;
    if (teamOptExp !== nextYear) continue;
    if (player.tid < 0 || player.tid >= 100) continue;
    if ((player as any).status === 'Retired') continue;

    const team = state.teams.find(t => t.id === player.tid);
    const exercise = (player.overallRating ?? 60) >= 50;
    if (exercise) {
      teamOptionExercisedIds.add(player.internalId);
      teamOptionNews.push(`${team?.name ?? 'A team'} has exercised their team option on ${player.name}.`);
      if (isGM && player.tid === userTid) {
        pendingOptionToasts.push({
          playerName: player.name,
          teamName: team?.name ?? '',
          pos: (player as any).pos ?? '',
          decision: 'team-exercised',
        });
      }
      continue;
    }

    teamOptionDeclinedIds.add(player.internalId);
    teamOptionNews.push(`${team?.name ?? 'A team'} has declined their team option on ${player.name}, making him a restricted free agent.`);
    if (isGM && player.tid === userTid) {
      pendingOptionToasts.push({
        playerName: player.name,
        teamName: team?.name ?? '',
        pos: (player as any).pos ?? '',
        decision: 'team-declined',
      });
    }
  }

  return {
    playerOptOutIds,
    playerOptInIds,
    teamOptionExercisedIds,
    teamOptionDeclinedIds,
    playerOptionNews,
    teamOptionNews,
    playerOptionHistory,
    pendingOptionToasts,
  };
}
