import type { Tab } from '../../types';
import { getSeasonReviewDestination } from '../../services/news/seasonRecaps';
import { requestLeagueHistorySeasonDetail } from '../central/view/LeagueHistoryNav';
import { requestNewsArticle } from './NewsFeedNav';

export function requestSeasonReviewView(news: any[] | undefined, season: number, uiMode?: string): Tab {
  const destination = getSeasonReviewDestination(news, season, uiMode);
  if (destination.articleId) requestNewsArticle(destination.articleId);
  else requestLeagueHistorySeasonDetail(season);
  return destination.view;
}
