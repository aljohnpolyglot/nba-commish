import type { GameState, NewsItem } from '../../types';
import { NewsGenerator } from '../news/NewsGenerator';

export type SatelliteContestKind = 'dance' | 'shooting-stars' | 'skills' | 'horse';

const contestLabel: Record<SatelliteContestKind, string> = {
  dance: 'Dance Contest',
  'shooting-stars': 'Shooting Stars',
  skills: 'Skills Challenge',
  horse: 'H-O-R-S-E',
};

const winnerName = (contest: SatelliteContestKind, result: any): string => {
  if (contest === 'dance') return String(result?.winnerLabel ?? '').trim();
  if (contest !== 'shooting-stars') return String(result?.winnerName ?? '').trim();
  const team = result?.teams?.find((entry: any) => entry.teamId === result?.winnerTeamId);
  return String(result?.winnerLabel ?? team?.label ?? team?.teamName ?? '').trim();
};

export function buildContestResultNews(
  state: Pick<GameState, 'date' | 'leagueStats' | 'news'>,
  contest: SatelliteContestKind,
  result: any,
): NewsItem | null {
  const winner = winnerName(contest, result);
  if (!winner) return null;

  const season = Number(state.leagueStats.year);
  const scope = state.leagueStats.uiMode ?? 'nba';
  const id = `all-star-${scope}-${contest}-${season}`;
  if ((state.news ?? []).some(item => item.id === id)) return null;

  const item = NewsGenerator.generate('all_star_contest', state.date, {
    eventName: contestLabel[contest],
    winnerName: winner,
    year: season,
  });
  return item ? { ...item, id } : null;
}
