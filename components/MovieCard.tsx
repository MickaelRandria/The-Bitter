
import React, { useState, memo, useRef } from 'react';
import { Movie } from '../types';
import { Star, ChevronDown, Trash2, Pencil, Play, Smartphone } from 'lucide-react';
import ShareStoryButtonSimple from './ShareStoryButtonSimple';

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
  
  // Swipe State
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const globalRatingRaw = (movie.ratings.story + movie.ratings.visuals + movie.ratings.acting + movie.ratings.sound) / 4;
  const globalRating = globalRatingRaw.toFixed(1);
  const hasPoster = !!movie.posterUrl;
  const isWatchlist = movie.status === 'watchlist';
  const baseHeight = index % 3 === 0 ? 'h-80' : 'h-64';

  const isTv = movie.mediaType === 'tv';

  const SWIPE_THRESHOLD = 80;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now()
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    
    const deltaX = e.touches[0].clientX - touchStartRef.current.x;
    const deltaY = e.touches[0].clientY - touchStartRef.current.y;
    
    // Si le mouvement est plus vertical qu'horizontal, ignorer (scroll)
    if (Math.abs(deltaY) > Math.abs(deltaX) && !isSwiping) return;
    
    // Empêcher le scroll vertical pendant le swipe horizontal
    if (Math.abs(deltaX) > 10) {
      setIsSwiping(true);
    }
    
    // Limiter le swipe avec une résistance élastique
    const maxSwipe = 120;
    const clampedX = Math.max(-maxSwipe, Math.min(maxSwipe, deltaX));
    setSwipeX(clampedX);
  };

  const handleTouchEnd = () => {
    if (!touchStartRef.current) return;
    
    if (swipeX < -SWIPE_THRESHOLD) {
      // Swipe gauche → Supprimer (avec confirmation)
      setSwipeX(-SWIPE_THRESHOLD);
      setShowDeleteConfirm(true);
    } else if (swipeX > SWIPE_THRESHOLD) {
      // Swipe droit → Éditer
      setSwipeX(0);
      setIsSwiping(false);
      onEdit(movie);
    } else {
      // Snap back
      setSwipeX(0);
      setShowDeleteConfirm(false);
    }
    
    setTimeout(() => setIsSwiping(false), 50);
    touchStartRef.current = null;
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(movie.id);
    setSwipeX(0);
    setShowDeleteConfirm(false);
  };

  const handleCancelSwipe = () => {
    setSwipeX(0);
    setShowDeleteConfirm(false);
    setIsSwiping(false);
  };

  const cardClasses = `
    relative rounded-[2.5rem] p-8 flex flex-col transition-[transform,box-shadow,height] duration-300 w-full overflow-hidden cursor-pointer group/card
    ${isExpanded ? 'shadow-2xl z-20 scale-[1.01] h-auto' : `shadow-lg hover:shadow-xl hover:-translate-y-2 ${baseHeight}`}
    ${hasPoster ? 'text-white bg-[#0c0c0c]' : 'text-charcoal bg-white border border-stone-100'}
  `;

  return (
    <div className="relative overflow-hidden rounded-[2.5rem]" ref={cardRef}>
      
      {/* Layer arrière : Actions révélées par le swipe */}
      <div className="absolute inset-0 flex bg-stone-100 rounded-[2.5rem]">
        {/* Action Éditer (swipe droit → visible à gauche) */}
        <div 
          className="flex items-center justify-center bg-white border-r border-stone-100"
          style={{ width: SWIPE_THRESHOLD }}
        >
          <div className="flex flex-col items-center gap-1">
            <Pencil size={20} className="text-charcoal" />
            <span className="text-[8px] font-black uppercase tracking-widest text-stone-400">Éditer</span>
          </div>
        </div>
        
        {/* Spacer */}
        <div className="flex-1" />
        
        {/* Action Supprimer (swipe gauche → visible à droite) */}
        <div 
          className={`flex items-center justify-center transition-colors ${showDeleteConfirm ? 'bg-red-600' : 'bg-red-500'}`}
          style={{ width: SWIPE_THRESHOLD }}
          onClick={showDeleteConfirm ? handleConfirmDelete : undefined}
        >
          <div className="flex flex-col items-center gap-1">
            <Trash2 size={20} className="text-white" />
            <span className="text-[8px] font-black uppercase tracking-widest text-white">
              {showDeleteConfirm ? 'Confirmer' : 'Supprimer'}
            </span>
          </div>
        </div>
      </div>
      
      {/* Layer avant : La carte elle-même (se déplace avec le swipe) */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => {
          if (!isSwiping && swipeX === 0 && !showDeleteConfirm) {
            setIsExpanded(!isExpanded);
          } else if (showDeleteConfirm || swipeX !== 0) {
            handleCancelSwipe();
          }
        }}
        className={cardClasses}
        style={{
          backgroundImage: hasPoster ? `linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.85)), url(${movie.posterUrl})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transform: `translateX(${swipeX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          willChange: 'transform'
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
              <span>
                  {isWatchlist && movie.releaseDate 
                  ? new Date(movie.releaseDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
                  : movie.year
                  }
              </span>
              {isTv && movie.numberOfSeasons && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-current opacity-40"></span>
                    <span>{movie.numberOfSeasons} Saisons</span>
                  </>
              )}
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

            {/* New logic for Comment/Review separation */}
            {movie.comment ? (
              <>
                  {/* Synopsis (discret) if exists */}
                  {movie.review && (
                      <div className="mb-3">
                          <p className={`text-[11px] leading-relaxed line-clamp-2 ${hasPoster ? 'text-white/40' : 'text-stone-400'}`}>
                              {movie.review}
                          </p>
                      </div>
                  )}
                  {/* Personal Comment (prominent) */}
                  <div className={`mb-8 pl-5 border-l-2 transition-colors duration-200 ${hasPoster ? 'border-white/20' : 'border-stone-200'}`}>
                      <p className={`text-sm font-medium leading-relaxed italic ${hasPoster ? 'text-white/80' : 'text-stone-600'}`}>
                          "{movie.comment}"
                      </p>
                  </div>
              </>
            ) : (
              /* Fallback Legacy: Review acts as comment if no specific comment exists */
              movie.review && (
                  <div className={`mb-8 pl-5 border-l-2 transition-colors duration-200 ${hasPoster ? 'border-white/20' : 'border-stone-200'}`}>
                      <p className={`text-sm font-medium leading-relaxed italic ${hasPoster ? 'text-white/80' : 'text-stone-600'}`}>
                          "{movie.review}"
                      </p>
                  </div>
              )
            )}

            <div className="flex gap-3 mt-4 pb-4">
               {/* Bouton Partage Story (Activé en v0.73+) */}
               {!isWatchlist && <ShareStoryButtonSimple movie={movie} />}

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
    </div>
  );
});

export default MovieCard;
