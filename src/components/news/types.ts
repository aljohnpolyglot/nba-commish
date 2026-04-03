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
  impact?: 'high' | 'standard';
  url: string;
  author?: Author;
  /** Game context for ArticleViewer LLM enrichment */
  gameId?: number;
  homeTeamId?: number;
  awayTeamId?: number;
}
