import React, { useState, useMemo } from 'react';
import { Search, Star, Clock, Film, ChevronDown, SortAsc, SortDesc } from 'lucide-react';
import { Movie } from './types';

interface MovieStepProps {
  movies: Movie[];
  movieSearch: string;
  setMovieSearch: (val: string) => void;
  selectedMovie: Movie | null;
  setSelectedMovie: (movie: Movie | null) => void;
  loadingMovies: boolean;
}

export const MovieStep: React.FC<MovieStepProps> = ({
  movies,
  movieSearch,
  setMovieSearch,
  selectedMovie,
  setSelectedMovie,
  loadingMovies
}) => {
  const [sortBy, setSortBy] = useState<'rank' | 'rating' | 'title'>('rank');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const filteredMovies = useMemo(() => {
    let result = movies;
    if (movieSearch) {
      result = movies.filter(m => 
        m.title.toLowerCase().includes(movieSearch.toLowerCase()) ||
        m.genres.some(g => g.toLowerCase().includes(movieSearch.toLowerCase()))
      );
    }

    return result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'rank') comparison = a.rank - b.rank;
      else if (sortBy === 'rating') comparison = b.rating - a.rating;
      else if (sortBy === 'title') comparison = a.title.localeCompare(b.title);
      
      return sortOrder === 'asc' ? comparison : -comparison;
    }).slice(0, 50);
  }, [movies, movieSearch, sortBy, sortOrder]);

  const formatDuration = (isoDuration: string) => {
    // Basic PT2H22M parser
    const match = isoDuration.match(/PT(\d+H)?(\d+M)?/);
    if (!match) return isoDuration;
    const hours = match[1] ? match[1].replace('H', 'h ') : '';
    const minutes = match[2] ? match[2].replace('M', 'm') : '';
    return `${hours}${minutes}`.trim();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Search Movies</label>
          <div className="flex gap-2">
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-800 text-slate-300 text-[10px] font-bold px-2 py-1 rounded-lg border-none outline-none cursor-pointer"
            >
              <option value="rank">Rank</option>
              <option value="rating">Rating</option>
              <option value="title">Title</option>
            </select>
            <button 
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors"
            >
              {sortOrder === 'asc' ? <SortAsc size={14} /> : <SortDesc size={14} />}
            </button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
          <input
            type="text"
            value={movieSearch}
            onChange={(e) => setMovieSearch(e.target.value)}
            placeholder="Search by title or genre..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm font-medium text-slate-200 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none placeholder:text-slate-700 transition-all"
          />
        </div>
      </div>

      {loadingMovies ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Accessing IMDb Database...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredMovies.map((movie) => (
            <button
              key={movie.rank}
              onClick={() => setSelectedMovie(selectedMovie?.rank === movie.rank ? null : movie)}
              className={`flex gap-4 p-4 rounded-2xl border transition-all text-left group ${
                selectedMovie?.rank === movie.rank 
                ? 'bg-indigo-500/10 border-indigo-500 shadow-lg shadow-indigo-500/10' 
                : 'bg-slate-950 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="relative shrink-0">
                <img 
                  src={movie.image} 
                  alt={movie.title}
                  className="w-20 h-28 object-cover rounded-lg shadow-xl"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute -top-2 -left-2 w-6 h-6 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center text-[10px] font-black text-indigo-400">
                  {movie.rank}
                </div>
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className={`font-black text-sm truncate transition-colors ${selectedMovie?.rank === movie.rank ? 'text-indigo-400' : 'text-white'}`}>
                      {movie.title}
                    </h4>
                    <div className="flex items-center gap-1 bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px] font-black text-amber-500">
                      <Star size={10} fill="currentColor" />
                      {movie.rating}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                    {movie.description}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                    <Clock size={10} />
                    {formatDuration(movie.duration)}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                    <Film size={10} />
                    {movie.genres.join(', ')}
                  </div>
                  <div className="bg-slate-800 text-slate-400 text-[10px] font-black px-1.5 py-0.5 rounded">
                    {movie.content_rating}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
