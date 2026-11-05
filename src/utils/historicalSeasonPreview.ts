import type { NBAPlayer, NBATeam } from '../types';
import { convertTo2KRating } from './helpers';
import { isPlayerVisibleInTimeline } from './historicalTimeline';
import { getHistoricalTeamSnapshot } from './teamAssets';

export interface HistoricalPreviewPlayer {
  player: NBAPlayer;
  k2: number;
}

export interface HistoricalSeasonPreview {
  topTeams: NBATeam[];
  notablePlayers: HistoricalPreviewPlayer[];
}

export function getPlayerK2ForSeason(player: NBAPlayer, seasonEndYear: number): number | null {
  const rating = [...(player.ratings ?? [])]
    .filter(row => Number(row?.season ?? seasonEndYear) <= seasonEndYear)
    .sort((left, right) => Number(right?.season ?? 0) - Number(left?.season ?? 0))[0];
  if (!rating) return null;

  const rawOvr = Number(rating.ovr ?? player.overallRating ?? 0);
  if (!Number.isFinite(rawOvr) || rawOvr <= 0) return null;
  return convertTo2KRating(rawOvr, Number(rating.hgt ?? 50), rating.tp);
}

export function buildHistoricalSeasonPreview(
  teams: readonly NBATeam[],
  players: readonly NBAPlayer[],
  startYear: number,
): HistoricalSeasonPreview {
  const seasonEndYear = startYear + 1;
  const topTeams = teams
    .map(team => getHistoricalTeamSnapshot(team, startYear) as NBATeam)
    .sort((left, right) => (right.strength ?? 0) - (left.strength ?? 0))
    .slice(0, 3);

  const notablePlayers = players
    .filter(player =>
      player.tid >= 0 &&
      player.tid < 100 &&
      player.status === 'Active' &&
      isPlayerVisibleInTimeline(player, seasonEndYear)
    )
    .map(player => ({ player, k2: getPlayerK2ForSeason(player, seasonEndYear) }))
    .filter((entry): entry is HistoricalPreviewPlayer => entry.k2 != null)
    .sort((left, right) => right.k2 - left.k2)
    .slice(0, 6);

  return { topTeams, notablePlayers };
}
