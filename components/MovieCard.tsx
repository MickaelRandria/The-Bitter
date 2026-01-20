import React, { useState, useEffect } from 'react';
import { Movie, ThemeColor } from '../types';
import { Star, ChevronDown, ChevronUp, Trash2, Pencil, AlertCircle, Play, CheckCircle2 } from 'lucide-react';

interface MovieCardProps {
  movie: Movie;
  index: number;
  onDelete: (id: string) => void;
  onEdit: (movie: Movie) => void;
}

const themeStyles: Record<ThemeColor, string> = {
  orange: 'bg-tz-orange text-white',
  green: 'bg-tz-green text-white',
  yellow: 'bg-tz-yellow text-charcoal',
  blue: 'bg-tz-blue text-white',
  purple: 'bg-tz-purple text-white',
  black: 'bg-charcoal text-white',
};

const MovieCard: React.FC<MovieCardProps> = ({ movie, index, onDelete, onEdit }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Reset delete confirmation when card is collapsed
  useEffect(() => {
    if (!isExpanded) {
      setDeleteConfirm(false);
    }
  }, [isExpanded]);

  const globalRating = (
    (movie.ratings.story + movie.ratings.visuals + movie.ratings.acting + movie.ratings.sound) / 4
  ).toFixed(1);

  const hasPoster = !!movie.posterUrl;
  const isWatchlist = movie.status === 'watchlist';

  // Staggered Masonry Height
  const heightClass = isExpanded 
    ? 'h-auto min-h-[24rem]' 
    : (index % 3 === 0 ? 'h-72' : 'h-60');

  const RatingBar = ({ label, value }: { label: string, value: number }) => (
    <div className="group relative flex items-center gap-2 mb-1.5" title={`${label}: ${value}/10`}>
      {/* Tooltip on Hover */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/90 backdrop-blur text-white text-[10px] font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-30 shadow-xl">
        {value} / 10
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black/90"></div>
      </div>

      <span className={`text-[10px] font-bold uppercase w-10 opacity-70 ${hasPoster ? 'text-white' : ''}`}>{label}</span>
      <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${hasPoster ? 'bg-white/20' : 'bg-black/10'}`}>
        <div 
          className="h-full bg-current opacity-90 rounded-full" 
          style={{ width: `${value * 10}%` }}
        />
      </div>
      <span className={`text-[10px] font-bold w-4 text-right ${hasPoster ? 'text-white' : ''}`}>{value}</span>
    </div>
  );

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Critical: Stop bubbling to card expand/collapse
    
    if (deleteConfirm) {
      onDelete(movie.id);
    } else {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 3000);
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onEdit(movie);
  };

  // Special Card Style for Watchlist
  if (isWatchlist) {
      return (
        <div 
          onClick={() => setIsExpanded(!isExpanded)}
          className={`
            relative rounded-3xl p-6 flex flex-col transition-all duration-300 w-full overflow-hidden cursor-pointer group/card
            ${hasPoster ? 'text-white shadow-soft' : 'bg-white text-charcoal border-2 border-dashed border-stone-200'}
            ${heightClass}
          `}
          style={hasPoster ? {
            backgroundImage: `url(${movie.posterUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          } : {}}
        >
            {/* Overlay for poster watchlist items */}
            {hasPoster && (
                <div className={`absolute inset-0 bg-black/50 grayscale transition-opacity duration-300 ${isExpanded ? 'opacity-80' : 'opacity-60'}`} />
            )}

            {/* Badge */}
            <div className="relative z-10 flex justify-between items-start mb-2">
                <span className={`inline-block text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full ${hasPoster ? 'bg-white/20 backdrop-blur-md' : 'bg-stone-100 text-stone-500'}`}>
                    {movie.genre}
                </span>
                <div className={`px-2 py-1 rounded-full flex items-center gap-1 ${hasPoster ? 'bg-white/20' : 'bg-stone-100 text-stone-500'}`}>
                    <Play size={10} fill="currentColor" />
                    <span className="text-[10px] font-bold uppercase tracking-wide">File</span>
                </div>
            </div>

            {/* Content */}
            <div className={`relative z-10 transition-all duration-300 ${isExpanded ? 'mb-2' : 'mt-auto'}`}>
                <h3 className="text-2xl font-bold leading-tight tracking-tight mb-1 break-words">
                {movie.title}
                </h3>
                <p className={`text-xs font-bold uppercase tracking-wider ${hasPoster ? 'text-zinc-300' : 'text-stone-400'}`}>
                    {movie.director}
                </p>
            </div>

            {/* Expanded for Watchlist (Actions) */}
            {isExpanded && (
                <div className="relative z-10 mt-auto pt-6 animate-[fadeIn_0.3s_ease-out]">
                     <button 
                        onClick={(e) => { e.stopPropagation(); onEdit(movie); }}
                        className="w-full flex items-center justify-center gap-2 bg-forest text-white py-3 rounded-xl font-bold text-sm shadow-lg mb-3 hover:scale-105 transition-transform"
                     >
                        <CheckCircle2 size={16} />
                        Marquer comme vu
                     </button>
                     
                     <div className="flex justify-between items-center px-1">
                        <button onClick={handleEditClick} className="text-xs font-bold opacity-60 hover:opacity-100">Modifier</button>
                        <button onClick={handleDeleteClick} className="text-xs font-bold text-red-500 opacity-80 hover:opacity-100">
                             {deleteConfirm ? 'Sûr ?' : 'Retirer'}
                        </button>
                     </div>
                </div>
            )}
            
            {/* Visual indicator for unexpanded card */}
            {!isExpanded && (
                <div className={`absolute bottom-6 right-6 opacity-30 ${hasPoster ? 'text-white' : 'text-stone-400'}`}>
                    <Play size={24} />
                </div>
            )}
        </div>
      );
  }

  // --- STANDARD WATCHED CARD ---
  return (
    <div 
      onClick={() => setIsExpanded(!isExpanded)}
      className={`
        relative rounded-3xl p-6 flex flex-col shadow-soft hover:shadow-soft-hover hover:scale-[1.02] transition-all duration-300 w-full overflow-hidden cursor-pointer group/card
        ${hasPoster ? 'text-white' : themeStyles[movie.theme]}
        ${heightClass}
      `}
      style={hasPoster ? {
        backgroundImage: `url(${movie.posterUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      } : {}}
    >
      {/* Dark Overlay for Image Cards */}
      {hasPoster && (
        <div className={`absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent transition-opacity duration-300 pointer-events-none ${isExpanded ? 'opacity-95' : 'opacity-80'}`} />
      )}

      {/* Header */}
      <div className="relative z-10 flex justify-between items-start mb-2">
        <span className={`inline-block text-[10px] uppercase font-bold tracking-widest opacity-80 border border-current px-2 py-0.5 rounded-full ${hasPoster ? 'bg-black/30 backdrop-blur-md border-white/20' : ''}`}>
            {movie.genre}
        </span>
        <div className={`backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-1 ${hasPoster ? 'bg-black/40 text-white' : 'bg-white/20'}`}>
          <Star size={12} fill="currentColor" className="opacity-90" />
          <span className="text-xs font-bold">{globalRating}</span>
        </div>
      </div>

      {/* Title */}
      <div className={`relative z-10 transition-all duration-300 ${isExpanded ? 'mb-2' : 'mt-auto'}`}>
        <h3 className="text-2xl font-bold leading-tight tracking-tight mb-1 break-words drop-shadow-md">
          {movie.title}
        </h3>
        {!isExpanded && (
          <p className={`text-xs font-medium ${hasPoster ? 'text-zinc-300' : 'opacity-80'}`}>
            {movie.director} • {movie.year}
          </p>
        )}
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div 
          className="relative z-10 mt-2 animate-[fadeIn_0.3s_ease-out] cursor-default" 
          onClick={(e) => e.stopPropagation()}
        >
          
          <div className={`mb-5 pb-5 border-b ${hasPoster ? 'border-white/20' : 'border-current/10'}`}>
             <div className="grid grid-cols-2 gap-4">
                <div>
                   <span className="block text-[10px] font-bold uppercase opacity-60 mb-1">Réalisateur</span>
                   <span className="block text-lg font-extrabold leading-snug tracking-tight">{movie.director}</span>
                </div>
                <div>
                   <span className="block text-[10px] font-bold uppercase opacity-60 mb-1">Sortie</span>
                   <span className="block text-lg font-extrabold leading-snug tracking-tight">{movie.year}</span>
                </div>
             </div>
          </div>

          <div className={`rounded-2xl p-4 mb-4 backdrop-blur-sm ${hasPoster ? 'bg-black/40' : 'bg-white/10'}`}>
             <RatingBar label="Hist" value={movie.ratings.story} />
             <RatingBar label="Visu" value={movie.ratings.visuals} />
             <RatingBar label="Jeu" value={movie.ratings.acting} />
             <RatingBar label="Son" value={movie.ratings.sound} />
          </div>
          
          {movie.review && (
            <div className="relative mb-6">
              <span className="absolute -top-2 -left-1 text-4xl opacity-20 font-serif">“</span>
              <p className="text-sm font-medium opacity-90 leading-relaxed pl-3 italic relative z-10">
                {movie.review}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end items-center gap-2 mt-4">
               <button 
                type="button"
                onClick={handleEditClick}
                className={`cursor-pointer relative z-20 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${hasPoster ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-black/5 hover:bg-black/10'}`}
              >
                <Pencil size={14} />
                Éditer
              </button>

              <button 
                type="button"
                onClick={handleDeleteClick}
                className={`
                  cursor-pointer relative z-20 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200
                  ${deleteConfirm 
                    ? 'bg-red-600 text-white shadow-md scale-105' 
                    : (hasPoster ? 'bg-white/10 text-red-300 hover:bg-red-500/80 hover:text-white' : 'bg-red-50 text-red-500 hover:bg-red-500 hover:text-white')
                  }
                `}
              >
                {deleteConfirm ? (
                   <>
                     <AlertCircle size={14} />
                     Sûr ?
                   </>
                ) : (
                   <>
                     <Trash2 size={14} />
                     Suppr.
                   </>
                )}
              </button>
          </div>
        </div>
      )}

      {/* Indicator - hidden when expanded because we stop propagation on the details container */}
      <div 
        className={`relative z-10 mt-auto pt-4 flex justify-center opacity-50 transition-opacity ${isExpanded ? 'hidden' : ''}`}
      >
        <ChevronDown size={20} />
      </div>

      {/* Collapse Trigger (Footer area to click to close) */}
      {isExpanded && (
        <div 
            onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
            className="relative z-10 mt-auto pt-6 flex justify-center opacity-50 hover:opacity-100 cursor-pointer"
        >
             <ChevronUp size={20} />
        </div>
      )}

      {/* Background Decor */}
      {!hasPoster && (
        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
      )}
    </div>
  );
};

export default MovieCard;