import type { NewsItem } from '../../components/news/types';

interface LeagueStoryStatLine {
  gameScore?: number;
}

interface LeagueStoryBoxScore {
  gameId: number;
  homeStats?: LeagueStoryStatLine[];
  awayStats?: LeagueStoryStatLine[];
}

function timestamp(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function selectTopLeagueStories(
  articles: readonly NewsItem[],
  boxScores: readonly LeagueStoryBoxScore[],
  currentDate: string,
  limit = 8,
): NewsItem[] {
  const currentTimestamp = timestamp(currentDate);
  const cutoff = currentTimestamp - 7 * 24 * 60 * 60 * 1000;
  const gameScoreLookup = new Map<number, number>();
  for (const box of boxScores) {
    const topScore = [...(box.homeStats ?? []), ...(box.awayStats ?? [])]
      .reduce((best, line) => Math.max(best, Number(line.gameScore ?? 0)), 0);
    gameScoreLookup.set(box.gameId, topScore);
  }

  const storyScore = (article: NewsItem) => article.gameId != null
    ? gameScoreLookup.get(article.gameId) ?? 0
    : article.impact === 'high' ? 30 : 0;

  return articles
    .filter(article => {
      const published = timestamp(article.date);
      return published >= cutoff && published <= currentTimestamp;
    })
    .sort((left, right) => (
      storyScore(right) - storyScore(left)
      || timestamp(right.date) - timestamp(left.date)
    ))
    .slice(0, limit);
}
