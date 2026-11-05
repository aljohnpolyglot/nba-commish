export interface Restaurant {
  name: string;
  city: string;
  state: string;
  telephone: string;
  genre: string;
}

export interface Movie {
  id: string;
  rank: number;
  title: string;
  url: string;
  image: string;
  description: string;
  contentRating?: string;
  duration: string;
  genres: string[];
  rating?: number;
  releaseDate?: string;
  releaseYear?: number;
  gross?: string;
  distributor?: string;
  source: 'historical' | 'future-fallback';
}

export const RESTAURANT_DATA_URL = 'https://raw.githubusercontent.com/listsfordesign/Lists/refs/heads/master/Lists/restaurants-en_US.txt';
