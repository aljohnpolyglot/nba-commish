export interface Author {
  name: string;
  position: string;
  image_url: string;
}

export interface NewsItem {
  id: string;
  category: string;
  date: string;
  title: string;
  content: string;
  imageUrl?: string;
  photoCredit?: string;
  impact?: 'high' | 'standard';
  url: string;
  author?: Author;
  htmlContent?: string;
  sourceUrl?: string;
  readMoreLinks?: Array<{ text: string; url: string }>;
  skipAiExpansion?: boolean;
  /** Game context for ArticleViewer LLM enrichment */
  gameId?: number;
  homeTeamId?: number;
  awayTeamId?: number;
  teamIds?: number[];
  countries?: string[];
  competitionId?: string;
  league?: string;
  leagueId?: string;
  scope?: 'league' | 'country' | 'europe-wide' | 'international' | 'pba';
}
