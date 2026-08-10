import React from 'react';
import { Star, BarChart2 } from 'lucide-react';
import { Movie } from '../types';
import {
  MovieDisplayMode,
  getMovieDisplayMode,
  getLatestRating,
  getAverageRating,
} from '../utils/movieDisplay';

interface MovieRatingToggleProps {
  movie: Movie;
  onToggle: (movieId: string, mode: MovieDisplayMode) => void;
  variant?: 'default' | 'dark';
  compact?: boolean;
}

const MovieRatingToggle: React.FC<MovieRatingToggleProps> = ({
  movie,
  onToggle,
  variant = 'default',
  compact = false,
}) => {
  if ((movie.watch_count ?? 1) <= 1) return null;

  const mode = getMovieDisplayMode(movie);
  const latestVal = getLatestRating(movie).toFixed(1);
  const avgVal = getAverageRating(movie).toFixed(1);

  const isDark = variant === 'dark';

  const containerCls = isDark
    ? 'flex bg-white/10 p-0.5 rounded-full w-fit border border-white/10'
    : 'flex bg-stone-100 dark:bg-[#161616] p-1 rounded-full w-fit';

  const activeCls = isDark
    ? 'bg-white/15 text-white shadow-sm'
    : 'bg-white dark:bg-[#252525] text-forest dark:text-bitter-lime shadow-sm';

  const inactiveCls = isDark
    ? 'text-white/30 hover:text-white/60'
    : 'text-stone-400 dark:text-stone-600 hover:text-stone-600 dark:hover:text-stone-400';

  const btnCls = compact
    ? 'flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-black transition-all'
    : 'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black transition-all';

  return (
    <div className={containerCls} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => onToggle(movie.id, 'latest')}
        className={`${btnCls} ${mode === 'latest' ? activeCls : inactiveCls}`}
      >
        <Star size={compact ? 8 : 10} strokeWidth={2.5} />
        {compact ? (
          <span className="opacity-80">DER</span>
        ) : (
          <>{latestVal} <span className="opacity-60">DER</span></>
        )}
      </button>
      <button
        onClick={() => onToggle(movie.id, 'average')}
        className={`${btnCls} ${mode === 'average' ? activeCls : inactiveCls}`}
      >
        <BarChart2 size={compact ? 8 : 10} strokeWidth={2.5} />
        {compact ? (
          <span className="opacity-80">MOY</span>
        ) : (
          <>{avgVal} <span className="opacity-60">MOY</span></>
        )}
      </button>
    </div>
  );
};

export default MovieRatingToggle;
