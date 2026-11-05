import type { CommissionerTaskId, CommissionerTaskView, Tab } from '../../types';

export interface TaskDestination {
  tab: Tab;
  focus?: string;
}

export const CANONICAL_TASK_DESTINATIONS = {
  nbaDraft: { tab: 'Draft Board', focus: 'draft-board' },
  draftLottery: { tab: 'Draft Lottery', focus: 'draft-lottery' },
  draftOrderReview: { tab: 'Draft Order Review', focus: 'draft-order-review' },
  leagueSettingsReview: { tab: 'League Settings', focus: 'league-settings' },
  retiredPlayers: { tab: 'League History', focus: 'retired-players' },
} as const;

const DESTINATIONS: Partial<Record<CommissionerTaskId, TaskDestination>> = {
  season_review: { tab: 'League History', focus: 'season-review' },
  draft_lottery: CANONICAL_TASK_DESTINATIONS.draftLottery,
  nba_draft: CANONICAL_TASK_DESTINATIONS.nbaDraft,
  retired_players: CANONICAL_TASK_DESTINATIONS.retiredPlayers,
  league_settings_review: CANONICAL_TASK_DESTINATIONS.leagueSettingsReview,
  media_rights_renewal: { tab: 'Broadcasting' },
  franchise_event_sponsorships: { tab: 'Franchises' },
  international_tournament: { tab: 'International' },
  hof_endorsement: { tab: 'Hall of Fame' },
  hof_ceremony: { tab: 'Hall of Fame' },
};

export function resolveCommissionerTaskDestination(
  task: CommissionerTaskId | Pick<CommissionerTaskView, 'taskId'>,
): TaskDestination | null {
  const taskId = typeof task === 'string' ? task : task.taskId;
  return DESTINATIONS[taskId] ?? null;
}
