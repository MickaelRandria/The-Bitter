import React, { useState, useEffect } from 'react';
import { Movie, ThemeColor } from '../types';
import { Star, ChevronDown, ChevronUp, Trash2, Pencil, AlertCircle, Play, CheckCircle2, Ticket, Globe, TrendingUp, TrendingDown, Minus, Repeat, Film, Calendar, Clock, Sparkles } from 'lucide-react';

interface MovieCardProps {
  movie: Movie;
  index: number;
  onDelete: (id: string) => void;
  onEdit: (movie: Movie) => void;
  onOpenFilmography?: (id: number, name: string) => void;
  onShowRecommendations?: (movie: Movie) => void; // Nouvelle Prop
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

const MovieCard: React.FC<MovieCardProps> = ({ movie, index, onDelete, onEdit, onOpenFilmography, onShowRecommendations, searchQuery }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!isExpanded) setDeleteConfirm(false);
  }, [isExpanded]);

  const globalRatingRaw = (movie.ratings.story + movie.ratings.visuals + movie.ratings.acting + movie.ratings.sound) / 4;
  const globalRating = globalRatingRaw.toFixed(1);

  const hasPoster = !!movie.posterUrl;
  const isWatchlist = movie.status === 'watchlist';

  const baseHeight = index % 3 === 0 ? 'h-80' : 'h-64';

  const getContextualDate = () => {
     if (!movie.dateWatched) return null;
     const date = new Date(movie.dateWatched);
     const now = Date.now();
     const isFuture = movie.dateWatched > now;
     
     const dateStr = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

     return (
        <div className={`flex items-center gap-1.5 uppercase tracking-widest text-[9px] font-black ${hasPoster ? 'text-white/80' : 'text-current opacity-60'}`}>
            {isFuture ? <Calendar size={10} /> : <CheckCircle2 size={10} />}
            <span>{isFuture ? `Séance le ${dateStr}` : `Vu le ${dateStr}`}</span>
        </div>
     );
  };

  const highlightText = (text: string, query?: string) => {
    if (!query || !query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return (
      <span>
        {parts.map((part, i) => 
          part.toLowerCase() === query.toLowerCase() ? (
            <span key={i} className="bg-yellow-400 text-charcoal px-0.5 rounded-sm">{part}</span>
          ) : part
        )}
      </span>
    );
  };

  const RatingBar = ({ label, value }: { label: string, value: number }) => (
    <div className="flex items-center gap-4 mb-3 group/bar">
      <span className={`text-[9px] font-black uppercase w-10 opacity-40 tracking-widest ${hasPoster ? 'text-white' : 'text-current'}`}>
        {label}
      </span>
      <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${hasPoster ? 'bg-white/10' : 'bg-black/5'}`}>
        <div 
          className="h-full bg-current rounded-full transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/bar:brightness-110" 
          style={{ width: isExpanded ? `${value * 10}%` : '0%' }}
        />
      </div>
      <span className={`text-[10px] font-black w-4 text-right ${hasPoster ? 'text-white' : 'text-current'}`}>
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
    relative rounded-4xl p-8 flex flex-col transition-all duration-700 w-full overflow-hidden cursor-pointer group/card
    ${isExpanded ? 'shadow-2xl z-10 scale-[1.01]' : `shadow-soft hover:shadow-soft-hover hover:-translate-y-1.5 ${baseHeight}`}
    ${hasPoster ? 'text-white' : (isWatchlist ? 'bg-white border border-sand text-charcoal' : themeStyles[movie.theme])}
  `;

  return (
    <div 
      onClick={() => setIsExpanded(!isExpanded)}
      className={cardClasses}
      style={hasPoster ? {
        backgroundImage: `url(${movie.posterUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      } : {}}
    >
      {hasPoster && (
        <div className={`absolute inset-0 bg-gradient-to-t transition-all duration-700 ${isExpanded ? 'from-charcoal via-charcoal/90 to-black/30 opacity-100' : 'from-charcoal via-charcoal/40 to-transparent opacity-85'}`} />
      )}
      
      {!hasPoster && !isWatchlist && (
        <div className="absolute inset-0 bg-white/5 mix-blend-overlay pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.05\'/%3E%3C/svg%3E")' }} />
      )}

      {/* Header Info */}
      <div className="relative z-10 flex justify-between items-start mb-4">
        <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-full border border-current/20 transition-all ${hasPoster ? 'bg-black/30 backdrop-blur-md group-hover/card:bg-black/50' : 'bg-current/5 group-hover/card:bg-current/10'}`}>
            {highlightText(movie.genre, searchQuery)}
        </span>
        
        {!isWatchlist ? (
           <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-transform ${hasPoster ? 'bg-black/30 backdrop-blur-md' : 'bg-black/5'} group-hover/card:scale-105`}>
             <Star size={12} fill="currentColor" className={(!hasPoster && movie.theme === 'yellow') ? 'text-charcoal' : 'text-yellow-400'} />
             <span className="text-xs font-black">{globalRating}</span>
           </div>
        ) : (
          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${hasPoster ? 'bg-black/30 backdrop-blur-md' : 'bg-sand'} group-hover/card:scale-110 group-hover/card:rotate-12`}>
             <Play size={14} fill="currentColor" className="ml-0.5" />
          </div>
        )}
      </div>

      {/* Main Title Area */}
      <div className={`relative z-10 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${isExpanded ? 'mb-4' : 'mt-auto'}`}>
        <h3 className="text-2xl font-black leading-tight tracking-tighter mb-2 group-hover/card:tracking-normal transition-all duration-500">
          {highlightText(movie.title, searchQuery)}
        </h3>
        
        {/* Contextual Date or Director */}
        <div className={`flex items-center gap-3 transition-all duration-500 ${
            isExpanded 
            ? 'border-b border-current/10 pb-4 w-full' 
            : ''
        }`}>
            {/* Si étendu ou pas de date précise, on affiche l'année et réal, sinon la date contextuelle si non étendu */}
             {(!isExpanded && movie.status !== 'watchlist') ? (
                 getContextualDate()
             ) : (
                 <div className={`flex items-center gap-3 uppercase tracking-widest ${isExpanded ? 'text-xs font-black opacity-90' : 'text-[10px] font-black opacity-60'}`}>
                    <span>{movie.year}</span>
                    <span className="w-1 h-1 rounded-full bg-current opacity-40"></span>
                    <span className="truncate max-w-[140px]">{highlightText(movie.director, searchQuery)}</span>
                 </div>
             )}
        </div>
      </div>

      {/* Expanded Content using Grid animation */}
      <div className={`relative z-10 grid transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${isExpanded ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          {!isWatchlist && (
            <div className={`rounded-3xl p-6 mb-6 ${hasPoster ? 'bg-black/20 backdrop-blur-md border border-white/5 shadow-inner' : 'bg-black/5'}`}>
               <div className="flex items-center justify-between mb-6">
                  <div className="flex flex-col">
                     <span className="text-[9px] font-black uppercase opacity-40 tracking-widest mb-1">Impact Scénaristique</span>
                     <div className="flex items-center gap-2">
                        {Number(globalRating) >= (movie.tmdbRating || 0) ? <TrendingUp size={16} className="text-tz-green" /> : <TrendingDown size={16} className="text-tz-orange" />}
                        <span className="text-2xl font-black tracking-tighter">{globalRating}</span>
                        <span className="text-[10px] font-bold opacity-30">vs {movie.tmdbRating || '--'} TMDB</span>
                     </div>
                  </div>
                  
                  {/* Rewatch Indicator in Expanded View */}
                  {movie.rewatch && (
                     <div className="flex items-center gap-1.5 bg-forest text-white px-3 py-1.5 rounded-full shadow-lg animate-[fadeIn_0.5s_ease-out]">
                        <Repeat size={12} strokeWidth={2.5} />
                        <span className="text-[9px] font-black uppercase tracking-widest">À Revoir</span>
                     </div>
                  )}
               </div>
               
               <RatingBar label="Hist" value={movie.ratings.story} />
               <RatingBar label="Visu" value={movie.ratings.visuals} />
               <RatingBar label="Jeu" value={movie.ratings.acting} />
               <RatingBar label="Son" value={movie.ratings.sound} />
               
               {/* Date displayed clearly in expanded view */}
               <div className="mt-4 pt-4 border-t border-current/10 flex justify-end">
                   {getContextualDate()}
               </div>
            </div>
          )}

          {/* Draggable Filmographies */}
          <div className="flex flex-col gap-4 mb-6 animate-[fadeIn_0.5s_ease-out]">
            {movie.directorId && onOpenFilmography && (
               <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase opacity-40 tracking-widest">Réalisation</span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onOpenFilmography(movie.directorId!, movie.director); }}
                    className="flex items-center gap-2 text-xs font-black hover:text-forest transition-colors underline decoration-dotted underline-offset-4"
                  >
                    {movie.director}
                  </button>
               </div>
            )}
            
            {movie.actorIds && movie.actorIds.length > 0 && onOpenFilmography && (
               <div className="flex items-start justify-between">
                  <span className="text-[10px] font-black uppercase opacity-40 tracking-widest mt-1">Casting</span>
                  <div className="flex flex-wrap justify-end gap-x-4 gap-y-2 max-w-[60%]">
                    {movie.actorIds.map(actor => (
                      <button 
                        key={actor.id}
                        onClick={(e) => { e.stopPropagation(); onOpenFilmography(actor.id, actor.name); }}
                        className="text-xs font-black hover:text-forest transition-colors underline decoration-dotted underline-offset-4"
                      >
                        {actor.name}
                      </button>
                    ))}
                  </div>
               </div>
            )}
          </div>

          {/* Tags Display */}
          {movie.tags && movie.tags.length > 0 && (
             <div className="flex flex-wrap gap-2 mb-6 animate-[fadeIn_0.6s_ease-out]">
                {movie.tags.map(tag => (
                   <span key={tag} className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide border ${hasPoster ? 'bg-white/10 text-white border-white/20' : 'bg-white text-charcoal border-stone-200'}`}>
                      {tag}
                   </span>
                ))}
             </div>
          )}
          
          {movie.review && (
            <div className="mb-8 pl-5 border-l-2 border-current/20 animate-[fadeIn_0.5s_ease-out]">
              <p className="text-sm font-medium leading-relaxed italic opacity-80">
                "{movie.review}"
              </p>
            </div>
          )}

          <div className="flex justify-between items-center mt-auto gap-4 relative z-20">
             <button 
                onClick={(e) => { e.stopPropagation(); onEdit(movie); }}
                className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-90 hover:brightness-110 shadow-lg ${hasPoster ? 'bg-white text-charcoal' : (isWatchlist ? 'bg-forest text-white' : 'bg-charcoal text-white')}`}
             >
                {isWatchlist ? <CheckCircle2 size={14} strokeWidth={2.5} /> : <Pencil size={14} strokeWidth={2.5} />}
                {isWatchlist ? 'Marquer Vu' : 'Éditer'}
             </button>
             
             {/* Recommendation Sparkle Button (New) */}
             {movie.tmdbId && onShowRecommendations && (
                 <button 
                    onClick={(e) => { e.stopPropagation(); onShowRecommendations(movie); }}
                    className={`p-4 rounded-2xl transition-all active:scale-90 shadow-lg group/sparkle ${hasPoster ? 'bg-white/20 hover:bg-white text-white hover:text-charcoal backdrop-blur-md' : 'bg-tz-purple/10 text-tz-purple hover:bg-tz-purple hover:text-white'}`}
                    title="Similaires"
                 >
                    <Sparkles size={20} strokeWidth={2.5} className="group-hover/sparkle:animate-spin" />
                 </button>
             )}

             <button 
                onClick={handleDeleteClick}
                className={`p-4 rounded-2xl transition-all active:scale-90 shadow-lg ${deleteConfirm ? 'bg-red-500 text-white animate-pulse' : 'bg-current/10 hover:bg-red-500 hover:text-white'}`}
              >
                {deleteConfirm ? <AlertCircle size={20} strokeWidth={2.5} /> : <Trash2 size={20} strokeWidth={1.5} />}
              </button>
          </div>
        </div>
      </div>

      {isExpanded && (
        <button 
            onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
            className={`absolute top-6 right-6 z-30 p-3 rounded-full bg-black/10 backdrop-blur-md active:scale-75 hover:bg-black/20 transition-all`}
        >
             <ChevronUp size={20} strokeWidth={2.5} />
        </button>
      )}

      {!isExpanded && (
        <div className="absolute bottom-8 right-8 opacity-20 group-hover/card:translate-y-1 transition-transform group-hover/card:opacity-40">
            <ChevronDown size={20} strokeWidth={2.5} />
        </div>
      )}
    </div>
  );
};

export default MovieCard;