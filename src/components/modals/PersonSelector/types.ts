export interface Restaurant {
  name: string;
  city: string;
  state: string;
  telephone: string;
  genre: string;
}

export interface Movie {
  rank: number;
  title: string;
  url: string;
  image: string;
  description: string;
  content_rating: string;
  duration: string;
  genres: string[];
  rating: number;
  rating_count: number;
}

export const RESTAURANT_DATA_URL = 'https://raw.githubusercontent.com/listsfordesign/Lists/refs/heads/master/Lists/restaurants-en_US.txt';
export const MOVIE_DATA_URL = 'https://raw.githubusercontent.com/sharmadhiraj/free-json-datasets/refs/heads/master/docs/sports-entertainment/imdb_top_movies.json';
