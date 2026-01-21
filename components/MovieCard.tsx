import React, { useState, useEffect } from 'react';
import { Movie, ThemeColor } from '../types';
import { Star, ChevronDown, ChevronUp, Trash2, Pencil, AlertCircle, Play, CheckCircle2, Ticket, Globe, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MovieCardProps {
  movie: Movie;
  index: number;
  onDelete: (id: string) => void;
  onEdit: (movie: Movie) => void;
  searchQuery?: string;
}

const themeStyles: Record<ThemeColor, string> = {
  orange: 'bg-tz-orange text-white',
  green: 'bg-tz-green text-white',
  yellow: 'bg-tz-yellow text-charcoal',
  blue: 'bg-tz-blue text-white',
  purple: 'bg-tz-purple text-white',
  black: 'bg-charcoal text-white',
};

const NOISE_BG = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.07'/%3E%3C/svg%3E")`
};

const MovieCard: React.FC<MovieCardProps> = ({ movie, index, onDelete, onEdit, searchQuery }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!isExpanded) setDeleteConfirm(false);
  }, [isExpanded]);

  const globalRatingRaw = (movie.ratings.story + movie.ratings.visuals + movie.ratings.acting + movie.ratings.sound) / 4;
  const globalRating = globalRatingRaw.toFixed(1);

  const hasPoster = !!movie.posterUrl;
  const isWatchlist = movie.status === 'watchlist';

  const heightClass = isExpanded 
    ? 'h-auto min-h-[26rem]' 
    : (index % 3 === 0 ? 'h-80' : 'h-64');

  const highlightText = (text: string, query?: string) => {
    if (!query || !query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return (
      <span>
        {parts.map((part, i) => 
          part.toLowerCase() === query.toLowerCase() ? (
            <span key={i} className="bg-yellow-300 text-charcoal px-0.5 rounded-[2px] shadow-sm">{part}</span>
          ) : part
        )}
      </span>
    );
  };

  const RatingBar = ({ label, value }: { label: string, value: number }) => (
    <div className="group relative flex items-center gap-3 mb-2" title={`${label}: ${value}/10`}>
      <span className={`text-[10px] font-bold uppercase w-10 opacity-60 tracking-wider ${hasPoster ? 'text-white' : 'text-current'}`}>
        {label}
      </span>
      <div className={`flex-1 h-1 rounded-full overflow-hidden ${hasPoster ? 'bg-white/20' : 'bg-black/10'}`}>
        <div 
          className="h-full bg-current opacity-90 rounded-full transition-all duration-500 ease-out" 
          style={{ width: `${value * 10}%` }}
        />
      </div>
      <span className={`text-[10px] font-bold w-4 text-right opacity-90 ${hasPoster ? 'text-white' : 'text-current'}`}>
        {value}
      </span>
    </div>
  );

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (deleteConfirm) {
      onDelete(movie.id);
    } else {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 3000);
    }
  };

  const cardClasses = `
    relative rounded-[2rem] p-7 flex flex-col transition-all duration-500 w-full overflow-hidden cursor-pointer group/card
    ${isExpanded ? 'shadow-2xl scale-[1.02] z-10' : 'shadow-soft hover:shadow-soft-hover hover:scale-[1.01] hover:-translate-y-1'}
    ${heightClass}
  `;

  // --- WATCHLIST CARD ---
  if (isWatchlist) {
      return (
        <div 
          onClick={() => setIsExpanded(!isExpanded)}
          className={`
            ${cardClasses}
            ${hasPoster ? 'text-white' : 'bg-surface/50 border-2 border-dashed border-stone-200 text-charcoal'}
          `}
          style={hasPoster ? {
            backgroundImage: `url(${movie.posterUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          } : {}}
        >
            {hasPoster && (
                <div className={`absolute inset-0 bg-charcoal/40 grayscale transition-all duration-500 ${isExpanded ? 'bg-charcoal/80 grayscale-0' : ''}`} />
            )}
            
            <div className="relative z-10 flex justify-between items-start mb-4">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-widest ${hasPoster ? 'bg-white/20 backdrop-blur-md text-white' : 'bg-white text-stone-500 shadow-sm'}`}>
                   <Ticket size={12} />
                   {highlightText(movie.genre, searchQuery)}
                </span>
                
                <div className="flex items-center gap-2">
                   {movie.tmdbRating && movie.tmdbRating > 0 && (
                      <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${hasPoster ? 'bg-white/10 text-white' : 'bg-black/5 text-stone-400'}`}>
                         <Globe size={10} />
                         {movie.tmdbRating}
                      </div>
                   )}
                   <div className={`w-8 h-8 rounded-full flex items-center justify-center ${hasPoster ? 'bg-white/20 text-white' : 'bg-white text-stone-400 shadow-sm'}`}>
                      {isExpanded ? <ChevronUp size={16} /> : <Play size={14} fill="currentColor" />}
                   </div>
                </div>
            </div>

            <div className={`relative z-10 transition-all duration-500 flex flex-col ${isExpanded ? 'mb-4' : 'mt-auto'}`}>
                <h3 className="text-2xl font-black leading-tight tracking-tight mb-2 break-words">
                  {highlightText(movie.title, searchQuery)}
                </h3>
                <p className={`text-xs font-bold uppercase tracking-widest ${hasPoster ? 'text-zinc-300' : 'text-stone-400'}`}>
                    {highlightText(movie.director, searchQuery)} <span className="opacity-50 mx-1">/</span> {movie.year}
                </p>
            </div>

            {isExpanded && (
                <div className="relative z-10 mt-auto pt-6 border-t border-current/10 animate-[fadeIn_0.4s_ease-out]">
                     <button 
                        onClick={(e) => { e.stopPropagation(); onEdit(movie); }}
                        className="w-full flex items-center justify-center gap-2 bg-forest text-white py-3.5 rounded-xl font-bold text-sm shadow-lg mb-3 hover:scale-[1.02] active:scale-[0.98] transition-all"
                     >
                        <CheckCircle2 size={18} />
                        Marquer comme vu
                     </button>
                     
                     <div className="flex justify-between items-center px-2">
                        <button onClick={(e) => { e.stopPropagation(); onEdit(movie); }} className="text-xs font-bold opacity-60 hover:opacity-100 transition-opacity">Modifier</button>
                        <button onClick={handleDeleteClick} className="text-xs font-bold text-red-500 opacity-80 hover:opacity-100 transition-opacity">
                             {deleteConfirm ? 'Confirmer ?' : 'Retirer'}
                        </button>
                     </div>
                </div>
            )}
            
            {!hasPoster && <div className="absolute inset-0 opacity-40 pointer-events-none" style={NOISE_BG} />}
        </div>
      );
  }

  const isDarkTheme = hasPoster || movie.theme === 'black' || movie.theme === 'blue' || movie.theme === 'purple' || movie.theme === 'green' || movie.theme === 'orange';
  const textColor = isDarkTheme ? 'text-white' : 'text-charcoal';
  const secondaryTextColor = isDarkTheme ? 'text-white/70' : 'text-charcoal/60';

  const diff = movie.tmdbRating ? (globalRatingRaw - movie.tmdbRating).toFixed(1) : "0";
  const diffNum = Number(diff);

  return (
    <div 
      onClick={() => setIsExpanded(!isExpanded)}
      className={`
        ${cardClasses}
        ${hasPoster ? 'text-white' : themeStyles[movie.theme]}
      `}
      style={hasPoster ? {
        backgroundImage: `url(${movie.posterUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      } : {}}
    >
      {!hasPoster && <div className="absolute inset-0 mix-blend-overlay pointer-events-none" style={NOISE_BG} />}
      
      {!hasPoster && (
        <>
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl pointer-events-none mix-blend-overlay" />
            <div className="absolute bottom-[-10%] left-[-10%] w-32 h-32 bg-black/5 rounded-full blur-2xl pointer-events-none" />
        </>
      )}

      {hasPoster && (
        <div className={`absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/40 to-transparent transition-opacity duration-500 pointer-events-none ${isExpanded ? 'opacity-95' : 'opacity-80'}`} />
      )}

      <div className="relative z-10 flex justify-between items-start mb-4">
        <span className={`inline-block text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full border border-current/20 ${hasPoster ? 'bg-black/30 backdrop-blur-md text-white' : ''}`}>
            {highlightText(movie.genre, searchQuery)}
        </span>
        <div className="flex flex-col items-end gap-1.5">
           <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${hasPoster ? 'bg-black/40 backdrop-blur-md text-white' : 'bg-black/5'}`}>
             <Star size={12} fill="currentColor" className={isDarkTheme ? 'text-yellow-400' : 'text-charcoal'} />
             <span className="text-xs font-bold">{globalRating}</span>
           </div>
           {movie.tmdbRating && movie.tmdbRating > 0 && !isExpanded && (
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black tracking-tighter uppercase ${hasPoster ? 'bg-white/10 text-white/60' : 'bg-black/5 text-stone-400'}`}>
                 <Globe size={10} className="opacity-70" />
                 TMDB {movie.tmdbRating}
              </div>
           )}
        </div>
      </div>

      <div className={`relative z-10 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isExpanded ? 'mb-4' : 'mt-auto'}`}>
        <h3 className="text-2xl font-black leading-none tracking-tight mb-2 drop-shadow-sm">
          {highlightText(movie.title, searchQuery)}
        </h3>
        
        <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${secondaryTextColor} transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-80'}`}>
             <span>{movie.year}</span>
             <span className="w-1 h-1 rounded-full bg-current opacity-50"></span>
             <span className="truncate max-w-[120px]">{highlightText(movie.director, searchQuery)}</span>
        </div>
      </div>

      {isExpanded && (
        <div 
          className="relative z-10 mt-2 pt-6 border-t border-current/10 animate-[fadeIn_0.5s_ease-out] cursor-default" 
          onClick={(e) => e.stopPropagation()}
        >
          {/* Detailed Ratings Comparison */}
          <div className={`rounded-2xl p-5 mb-6 ${hasPoster ? 'bg-white/5' : 'bg-black/5'}`}>
             <div className="flex items-center justify-between mb-4 pb-4 border-b border-current/10">
                <div className="flex flex-col">
                   <span className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-1">Écart de goût</span>
                   <div className="flex items-center gap-2">
                      {diffNum > 0 ? <TrendingUp size={16} className="text-forest" /> : diffNum < 0 ? <TrendingDown size={16} className="text-burnt" /> : <Minus size={16} className="text-stone-400" />}
                      <span className="text-lg font-black">{diffNum > 0 ? '+' : ''}{diff}</span>
                      <span className="text-[10px] font-bold opacity-40">vs TMDB</span>
                   </div>
                </div>
                <div className="flex flex-col items-end">
                   <span className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-1">Moyenne Public</span>
                   <div className="flex items-center gap-2">
                      <Globe size={14} className="opacity-60" />
                      <span className="text-lg font-black">{movie.tmdbRating || '--'}</span>
                   </div>
                </div>
             </div>
             <RatingBar label="Hist" value={movie.ratings.story} />
             <RatingBar label="Visu" value={movie.ratings.visuals} />
             <RatingBar label="Jeu" value={movie.ratings.acting} />
             <RatingBar label="Son" value={movie.ratings.sound} />
          </div>
          
          {movie.review && (
            <div className="mb-6 pl-4 border-l-2 border-current/20">
              <p className={`text-sm font-medium leading-relaxed italic ${secondaryTextColor}`}>
                "{movie.review}"
              </p>
            </div>
          )}

          <div className="flex justify-between items-center mt-auto">
             <div className="flex gap-1">
                 <button 
                    onClick={(e) => { e.stopPropagation(); onEdit(movie); }}
                    className={`p-2.5 rounded-xl transition-colors ${hasPoster ? 'hover:bg-white/20 text-white' : 'hover:bg-black/10 text-current'}`}
                    title="Éditer"
                 >
                    <Pencil size={18} />
                 </button>
             </div>

             <button 
                onClick={handleDeleteClick}
                className={`
                  flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-300
                  ${deleteConfirm 
                    ? 'bg-red-500 text-white shadow-lg scale-105' 
                    : (hasPoster ? 'bg-white/10 hover:bg-red-500 hover:text-white text-white/80' : 'bg-black/5 hover:bg-red-500 hover:text-white text-current')
                  }
                `}
              >
                {deleteConfirm ? (
                   <>
                     <AlertCircle size={14} />
                     <span>Confirmer</span>
                   </>
                ) : (
                   <>
                     <Trash2 size={16} />
                   </>
                )}
              </button>
          </div>
        </div>
      )}

      {isExpanded && (
        <button 
            onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
            className={`absolute top-4 right-4 z-20 p-2 rounded-full transition-colors ${hasPoster ? 'hover:bg-white/20 text-white' : 'hover:bg-black/10 text-current'}`}
        >
             <ChevronUp size={20} />
        </button>
      )}

      {!isExpanded && (
        <div className={`absolute bottom-6 right-6 opacity-40 transition-transform duration-300 group-hover/card:translate-y-1 ${hasPoster ? 'text-white' : 'text-current'}`}>
            <ChevronDown size={24} />
        </div>
      )}

    </div>
  );
};

export default MovieCard;