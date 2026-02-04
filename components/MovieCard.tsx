
import React, { useState, memo } from 'react';
import { Movie } from '../types';
import { Star, ChevronDown, Trash2, Pencil, Play, Smartphone } from 'lucide-react';

interface MovieCardProps {
  movie: Movie;
  index: number;
  onDelete: (id: string) => void;
  onEdit: (movie: Movie) => void;
}

const RatingBar = ({ label, value, hasPoster, isExpanded }: { label: string, value: number, hasPoster: boolean, isExpanded: boolean }) => {
  return (
    <div className="flex items-center gap-4 mb-4 group/bar">
      <span className={`text-[9px] font-black uppercase w-20 tracking-widest ${hasPoster ? 'text-white/40' : 'text-stone-400'}`}>
        {label}
      </span>
      <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${hasPoster ? 'bg-white/10' : 'bg-stone-100'}`}>
        <div 
          className={`h-full rounded-full ${hasPoster ? 'bg-white' : 'bg-charcoal'}`} 
          style={{ 
            width: isExpanded ? `${value * 10}%` : '0%',
            transition: 'width 500ms cubic-bezier(0.16, 1, 0.3, 1)',
            willChange: isExpanded ? 'width' : 'auto'
          }}
        />
      </div>
      <span className={`text-[10px] font-black w-6 text-right ${hasPoster ? 'text-white' : 'text-charcoal'}`}>
        {value}
      </span>
    </div>
  );
};

const MovieCard: React.FC<MovieCardProps> = memo(({ movie, index, onDelete, onEdit }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const globalRatingRaw = (movie.ratings.story + movie.ratings.visuals + movie.ratings.acting + movie.ratings.sound) / 4;
  const globalRating = globalRatingRaw.toFixed(1);
  const hasPoster = !!movie.posterUrl;
  const isWatchlist = movie.status === 'watchlist';
  const baseHeight = index % 3 === 0 ? 'h-80' : 'h-64';

  const cardClasses = `
    relative rounded-[2.5rem] p-8 flex flex-col transition-[transform,box-shadow,height] duration-300 w-full overflow-hidden cursor-pointer group/card
    ${isExpanded ? 'shadow-2xl z-20 scale-[1.01] h-auto' : `shadow-lg hover:shadow-xl hover:-translate-y-2 ${baseHeight}`}
    ${hasPoster ? 'text-white bg-[#0c0c0c]' : 'text-charcoal bg-white border border-stone-100'}
  `;

  return (
    <div 
      onClick={() => setIsExpanded(!isExpanded)}
      className={cardClasses}
      style={{
        backgroundImage: hasPoster ? `linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.85)), url(${movie.posterUrl})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        willChange: 'transform, opacity'
      }}
    >
      <div className="relative z-10 flex justify-between items-start mb-4">
        <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-full border border-current/20 transition-colors duration-200 ${hasPoster ? 'bg-black/60' : 'bg-stone-50'}`}>
            {movie.genre}
        </span>
        
        {!isWatchlist ? (
           <div className={`flex items-center gap-3 px-4 py-2 rounded-full border border-white/10 transition-all duration-200 ${hasPoster ? 'bg-black/80 backdrop-blur-md shadow-lg shadow-black/20' : 'bg-stone-50 border-stone-100'}`}>
             {movie.tmdbRating && (
               <>
                 <div className="flex items-center gap-1.5">
                   <span className={`text-[8px] font-black uppercase tracking-tighter ${hasPoster ? 'text-white/40' : 'text-stone-300'}`}>TMDB</span>
                   <span className="text-xs font-black text-white">{movie.tmdbRating}</span>
                 </div>
                 <div className={`w-px h-3 ${hasPoster ? 'bg-white/20' : 'bg-stone-200'}`} />
               </>
             )}
             <div className="flex items-center gap-1.5">
               <Star size={12} fill="#D9FF00" className="text-bitter-lime" />
               <span className="text-xs font-black text-bitter-lime">{globalRating}</span>
             </div>
           </div>
        ) : (
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white text-charcoal shadow-lg border border-sand active:scale-90 transition-transform duration-150">
             <Play size={14} fill="currentColor" className="ml-0.5" />
          </div>
        )}
      </div>

      <div className={`relative z-10 transition-[margin,transform] duration-300 ${isExpanded ? 'mb-6' : 'mt-auto'}`}>
        <h3 className="text-2xl font-black leading-tight tracking-tighter mb-2">
          {movie.title}
        </h3>
        <div className={`flex items-center gap-3 uppercase tracking-widest text-[10px] font-black transition-colors duration-200 ${hasPoster ? 'text-white/60' : 'text-stone-400'}`}>
            <span>{movie.year}</span>
            <span className="w-1 h-1 rounded-full bg-current opacity-40"></span>
            <span className="truncate max-w-[140px]">{movie.director}</span>
        </div>
      </div>

      <div className={`relative z-10 grid transition-[grid-template-rows,opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'}`} style={{ willChange: 'opacity, transform' }}>
        <div className="overflow-hidden">
          {!isWatchlist && (
            <div className={`rounded-[2rem] p-6 mb-6 border transition-colors duration-200 ${hasPoster ? 'bg-[#0c0c0c] border-white/10' : 'bg-stone-50 border-stone-100'}`}>
               <div className="flex justify-between items-center mb-6">
                  <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${hasPoster ? 'text-white/30' : 'text-stone-300'}`}>Analyse Sensorielle</span>
                  {movie.smartphoneFactor && movie.smartphoneFactor > 0 && (
                    <div className="flex items-center gap-2 bg-red-500/20 text-red-500 px-3 py-1 rounded-lg">
                      <Smartphone size={12} />
                      <span className="text-[10px] font-black">{movie.smartphoneFactor}%</span>
                    </div>
                  )}
               </div>
               
               <RatingBar label="Écriture" value={movie.ratings.story} hasPoster={hasPoster} isExpanded={isExpanded} />
               <RatingBar label="Esthétique" value={movie.ratings.visuals} hasPoster={hasPoster} isExpanded={isExpanded} />
               <RatingBar label="Interprétation" value={movie.ratings.acting} hasPoster={hasPoster} isExpanded={isExpanded} />
               <RatingBar label="Univers Sonore" value={movie.ratings.sound} hasPoster={hasPoster} isExpanded={isExpanded} />
            </div>
          )}

          {movie.review && (
            <div className={`mb-8 pl-5 border-l-2 transition-colors duration-200 ${hasPoster ? 'border-white/20' : 'border-stone-200'}`}>
              <p className={`text-sm font-medium leading-relaxed italic ${hasPoster ? 'text-white/80' : 'text-stone-600'}`}>
                "{movie.review}"
              </p>
            </div>
          )}

          <div className="flex gap-3 mt-4 pb-4">
             <button 
                onClick={(e) => { e.stopPropagation(); onEdit(movie); }}
                className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-white text-charcoal active:scale-95 transition-[transform,background-color] duration-150 shadow-lg"
             >
                <Pencil size={14} /> Éditer
             </button>
             
             <button 
                onClick={(e) => { e.stopPropagation(); onDelete(movie.id); }}
                className="p-4 rounded-2xl bg-white/20 text-white border border-white/20 active:scale-90 transition-[transform,background-color] duration-150 shadow-lg"
              >
                <Trash2 size={20} />
              </button>
          </div>
        </div>
      </div>

      {!isExpanded && (
        <div className="absolute bottom-8 right-8 opacity-20 group-hover:translate-y-1 transition-all duration-300">
           <ChevronDown size={24} />
        </div>
      )}
    </div>
  );
});

export default MovieCard;
