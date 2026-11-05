import type { CommissionerTaskId, FranchiseLeagueEventDeal, GameState } from '../../types';
import { ensureFranchiseLeagueEvents } from './franchiseSponsors';

const currentDeal = (state: GameState, assetId: string): FranchiseLeagueEventDeal | undefined => {
  const season = state.leagueStats.year;
  return ensureFranchiseLeagueEvents(state).deals.find(deal =>
    deal.assetId === assetId
    && deal.startSeason <= season
    && deal.endSeason >= season,
  );
};

export const getLeagueEventSponsorName = (
  state: GameState,
  assetId: string,
): string | undefined => {
  const deal = currentDeal(state, assetId);
  return deal?.brand !== 'Unbranded' ? deal?.brand : undefined;
};

export const getLeagueEventDisplayName = (
  state: GameState,
  assetId: string,
  fallback: string,
): string => {
  const deal = currentDeal(state, assetId);
  if (!deal) return fallback;
  if (deal.brand === 'Unbranded') return deal.assetName || fallback;
  return deal.namingTemplate?.replace('{brand}', deal.brand) ?? `${deal.brand} ${fallback}`;
};

const taskAssetIds: Partial<Record<CommissionerTaskId, string>> = {
  nba_draft: 'nba_draft',
  nba_cup_host: 'nba_cup',
  global_games: 'global_games',
  celebrity_roster: 'celebrity_game',
  dunk_participants: 'slam_dunk',
  three_point_participants: 'three_point',
  shooting_stars_participants: 'shooting_stars',
  skills_participants: 'skills_challenge',
};

export const getCommissionerTaskDisplayTitle = (
  state: GameState,
  taskId: CommissionerTaskId,
  fallback: string,
) => {
  const assetId = taskAssetIds[taskId];
  return assetId ? getLeagueEventDisplayName(state, assetId, fallback) : fallback;
};
