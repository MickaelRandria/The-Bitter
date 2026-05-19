import React, { useState, memo, useRef } from 'react';
import { Movie, WeightLabel } from '../types';
import { Star, ChevronDown, Trash2, Pencil, Play, Smartphone, Info, RotateCw } from 'lucide-react';
import { getMovieDisplayRating, getDisplayRatings, MovieDisplayMode } from '../utils/movieDisplay';
import MovieRatingToggle from './MovieRatingToggle';
import ShareStoryButtonSimple from './ShareStoryButtonSimple';
import { haptics } from '../utils/haptics';

interface MovieCardProps {
  movie: Movie;
  index: number;
  onDelete: (id: string) => void;
  onEdit: (movie: Movie) => void;
  onMarkAsWatched: (movie: Movie) => void;
  onViewDetails?: (tmdbId: number, mediaType: 'movie' | 'tv') => void;
  onViewDirector?: (name: string, id?: number) => void;
  onRewatch?: (movie: Movie) => void;
  onToggleDisplayMode?: (movieId: string, mode: MovieDisplayMode) => void;
}

const PIP_A11Y_LABEL: Record<WeightLabel, string> = {
  Essentiel: 'Influence forte dans la note finale',
  Important: 'Influence moyenne dans la note finale',
  Standard: 'Influence normale dans la note finale',
  Secondaire: 'Influence légère dans la note finale',
};

const WeightPipsInline: React.FC<{
  weight: number;
  weightLabel?: WeightLabel;
  hasPoster: boolean;
}> = ({ weight, weightLabel, hasPoster }) => {
  const filled = weight >= 1.7 ? 3 : weight >= 1.3 ? 2 : weight >= 0.9 ? 1 : 0;
  const filledClass = hasPoster ? 'bg-white' : 'bg-bitter-lime dark:bg-bitter-lime';
  const emptyClass = hasPoster
    ? 'bg-white/20'
    : 'bg-stone-200 dark:bg-white/15';
  return (
    <span
      className="inline-flex items-center gap-0.5 shrink-0"
      role="img"
      aria-label={weightLabel ? PIP_A11Y_LABEL[weightLabel] : undefined}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`w-1 h-1 rounded-full ${i < filled ? filledClass : emptyClass}`}
        />
      ))}
    </span>
  );
};

const RatingBar: React.FC<{
  label: string;
  value: number;
  hasPoster: boolean;
  isExpanded: boolean;
  weight?: number;
  weightLabel?: WeightLabel;
}> = ({ label, value, hasPoster, isExpanded, weight, weightLabel }) => (
  <div className="flex items-center gap-4 mb-4 group/bar">
    <div className="w-20 flex flex-col gap-1">
      <span
        className={`text-[9px] font-black uppercase tracking-widest leading-tight break-words ${hasPoster ? 'text-white/40' : 'text-stone-400 dark:text-stone-500'}`}
      >
        {label}
      </span>
      {weight !== undefined && (
        <WeightPipsInline weight={weight} weightLabel={weightLabel} hasPoster={hasPoster} />
      )}
    </div>
    <div
      className={`flex-1 h-1.5 rounded-full overflow-hidden ${hasPoster ? 'bg-white/10' : 'bg-stone-100 dark:bg-white/5'}`}
    >
      <div
        className={`h-full rounded-full ${hasPoster ? 'bg-white' : 'bg-charcoal dark:bg-white'}`}
        style={{
          width: isExpanded ? `${value * 10}%` : '0%',
          transition: 'width 500ms cubic-bezier(0.16, 1, 0.3, 1)',
          willChange: isExpanded ? 'width' : 'auto',
        }}
      />
    </div>
    <span
      className={`text-[10px] font-black w-6 text-right ${hasPoster ? 'text-white' : 'text-charcoal dark:text-white'}`}
    >
      {value}
    </span>
  </div>
);

const MovieCard: React.FC<MovieCardProps> = memo(
  ({
    movie,
    index,
    onDelete,
    onEdit,
    onMarkAsWatched,
    onViewDetails,
    onViewDirector,
    onRewatch,
    onToggleDisplayMode,
  }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [swipeX, setSwipeX] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);

    if (!movie?.ratings) return null;

    const adaptive = movie.adaptiveRating;
    const isLegacyOnly = !adaptive;
    const displayRating = adaptive?.weightedRating ?? getMovieDisplayRating(movie);
    const globalRating = displayRating.toFixed(1);
    const displayRatings = getDisplayRatings(movie);
    const profileLabel = adaptive?.profile.label;
    const hasRewatches = (movie.watch_count ?? 1) > 1;
    const hasPoster = !!movie.posterUrl;
    const isWatchlist = movie.status === 'watchlist';
    const baseHeight = index % 3 === 0 ? 'h-80' : 'h-64';
    const isTv = movie.mediaType === 'tv';

    const SWIPE_THRESHOLD = 80;

    const handleTouchStart = (e: React.TouchEvent) => {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
    };

    const handleTouchMove = (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const deltaX = e.touches[0].clientX - touchStartRef.current.x;
      const deltaY = e.touches[0].clientY - touchStartRef.current.y;
      if (Math.abs(deltaY) > Math.abs(deltaX) && !isSwiping) return;
      if (Math.abs(deltaX) > 10) setIsSwiping(true);
      const maxSwipe = 120;
      setSwipeX(Math.max(-maxSwipe, Math.min(maxSwipe, deltaX)));
    };

    const handleTouchEnd = () => {
      if (!touchStartRef.current) return;
      if (swipeX < -SWIPE_THRESHOLD) {
        setSwipeX(-SWIPE_THRESHOLD - 20);
        setShowDeleteConfirm(true);
      } else if (swipeX > SWIPE_THRESHOLD) {
        setSwipeX(0);
        setIsSwiping(false);
        onEdit(movie);
      } else {
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

    const deleteProgress = Math.min(1, Math.max(0, -swipeX / SWIPE_THRESHOLD));
    const editProgress = Math.min(1, Math.max(0, swipeX / SWIPE_THRESHOLD));

    const cardClasses = `
      relative rounded-[2.5rem] p-8 flex flex-col transition-[transform,box-shadow,height,background-color] duration-300 w-full overflow-hidden cursor-pointer group/card
      ${isExpanded ? 'shadow-2xl z-20 scale-[1.01] h-auto' : `shadow-lg hover:shadow-xl hover:-translate-y-2 ${baseHeight}`}
      ${hasPoster ? 'text-white bg-[#0c0c0c]' : 'text-charcoal dark:text-white bg-white dark:bg-[#1a1a1a] border border-stone-100 dark:border-white/5'}
    `;

    return (
      <div className="relative overflow-hidden rounded-[2.5rem]" ref={cardRef}>
        {/* Actions révélées */}
        <div className="absolute inset-0 flex rounded-[2.5rem] overflow-hidden bg-stone-100 dark:bg-[#161616]">
          <div
            className="absolute left-0 top-0 bottom-0 flex items-center justify-center bg-white dark:bg-[#202020] border-r border-stone-100 dark:border-white/5"
            style={{ width: SWIPE_THRESHOLD, opacity: editProgress }}
          >
            <div
              className="flex flex-col items-center gap-1"
              style={{ transform: `scale(${0.5 + editProgress * 0.5})` }}
            >
              <Pencil size={20} className="text-charcoal dark:text-white" />
              <span className="text-[8px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600">
                Éditer
              </span>
            </div>
          </div>
          <div
            className="absolute right-0 top-0 bottom-0 flex items-center justify-center transition-colors"
            style={{
              width: SWIPE_THRESHOLD + 20,
              backgroundColor: showDeleteConfirm
                ? '#dc2626'
                : `rgba(239, 68, 68, ${deleteProgress})`,
              opacity: deleteProgress > 0 ? 1 : 0,
            }}
            onClick={showDeleteConfirm ? handleConfirmDelete : undefined}
          >
            <div
              className="flex flex-col items-center gap-1"
              style={{ transform: `scale(${0.5 + deleteProgress * 0.5})` }}
            >
              <Trash2 size={20} className="text-white" />
              <span className="text-[8px] font-black uppercase tracking-widest text-white">
                {showDeleteConfirm ? 'Confirmer' : 'Supprimer'}
              </span>
            </div>
          </div>
        </div>

        {/* Carte principale */}
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
            backgroundImage: hasPoster
              ? `linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.85)), url(${movie.posterUrl})`
              : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            transform: `translateX(${swipeX}px)`,
            transition: isSwiping ? 'none' : 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.1)',
            willChange: 'transform',
          }}
        >
          {hasPoster && (
            <div className="absolute inset-0 bg-black/20 dark:bg-black/40 opacity-100 transition-colors pointer-events-none" />
          )}

          {/* Top row */}
          <div className="relative z-10 flex justify-between items-start mb-4">
            <span
              className={`text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-full border border-current/20 transition-colors duration-200 ${hasPoster ? 'bg-black/60' : 'bg-stone-50 dark:bg-[#161616]'}`}
            >
              {movie.genre}
            </span>
            <div className="flex items-center gap-2">
              {movie.tmdbId && onViewDetails && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewDetails(movie.tmdbId!, movie.mediaType || 'movie');
                  }}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 ${hasPoster ? 'bg-black/60 text-white/70 hover:text-white' : 'bg-stone-100 dark:bg-white/5 text-stone-400 dark:text-stone-600'}`}
                >
                  <Info size={14} />
                </button>
              )}
              {!isWatchlist ? (
                <div
                  className={`flex items-center gap-3 px-4 py-2 rounded-full border border-white/10 transition-all duration-200 ${hasPoster ? 'bg-black/80 backdrop-blur-md shadow-lg shadow-black/20' : 'bg-stone-50 dark:bg-[#161616] border-stone-100 dark:border-white/5'}`}
                >
                  {movie.tmdbRating && (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[8px] font-black uppercase tracking-tighter ${hasPoster ? 'text-white/40' : 'text-stone-300 dark:text-stone-700'}`}
                        >
                          TMDB
                        </span>
                        <span className="text-xs font-black text-white dark:text-stone-100">
                          {movie.tmdbRating}
                        </span>
                      </div>
                      <div
                        className={`w-px h-3 ${hasPoster ? 'bg-white/20' : 'bg-stone-200 dark:bg-white/10'}`}
                      />
                    </>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Star size={12} fill="#D9FF00" className="text-bitter-lime" />
                    <span className="text-xs font-black text-bitter-lime">{globalRating}</span>
                    {hasRewatches && (
                      <span
                        className={`text-[7px] font-black uppercase tracking-wider ${hasPoster ? 'text-white/40' : 'text-stone-400 dark:text-stone-600'}`}
                      >
                        {(movie.preferred_display_mode ?? 'average') === 'latest' ? 'DER' : 'MOY'}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkAsWatched(movie);
                  }}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-forest text-white shadow-lg shadow-forest/20 active:scale-90 transition-all border border-forest/20"
                >
                  <Play size={14} fill="currentColor" className="ml-0.5" />
                </button>
              )}
            </div>
          </div>

          {/* Title + meta */}
          <div
            className={`relative z-10 transition-[margin,transform] duration-300 ${isExpanded ? 'mb-6' : 'mt-auto'}`}
          >
            <h3 className="text-2xl font-black leading-tight tracking-tighter mb-2">
              {movie.title}
            </h3>
            <div
              className={`flex items-center gap-3 uppercase tracking-widest text-[10px] font-black transition-colors duration-200 ${hasPoster ? 'text-white/60' : 'text-stone-400 dark:text-stone-600'}`}
            >
              <span>
                {isWatchlist && movie.releaseDate
                  ? new Date(movie.releaseDate).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                  : movie.year}
              </span>
              {isTv && movie.numberOfSeasons && (
                <>
                  <span className="w-1 h-1 rounded-full bg-current opacity-40"></span>
                  <span>{movie.numberOfSeasons} Saisons</span>
                </>
              )}
              <span className="w-1 h-1 rounded-full bg-current opacity-40"></span>
              <span
                className={`truncate max-w-[140px] transition-colors duration-200 ${onViewDirector ? 'hover:text-bitter-lime cursor-pointer underline decoration-bitter-lime/30 underline-offset-4' : ''}`}
                onClick={(e) => {
                  if (onViewDirector) {
                    e.stopPropagation();
                    haptics.soft();
                    onViewDirector(movie.director, movie.directorId);
                  }
                }}
              >
                {movie.director}
              </span>
            </div>
            {!isWatchlist && !isLegacyOnly && (
              <div
                className={`mt-2 inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${hasPoster ? 'bg-white/10 text-white/70' : 'bg-stone-100 dark:bg-white/5 text-stone-500 dark:text-stone-400'}`}
              >
                <span className="w-1 h-1 rounded-full bg-bitter-lime" />
                {profileLabel ? `Bitter+ · ${profileLabel}` : 'Bitter+'}
              </div>
            )}
            {!isWatchlist && isLegacyOnly && (
              <div
                className={`mt-2 inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${hasPoster ? 'bg-white/10 text-white/70' : 'bg-stone-100 dark:bg-white/5 text-stone-500 dark:text-stone-400'}`}
              >
                <span className="w-1 h-1 rounded-full bg-bitter-lime" />
                Bitter
              </div>
            )}
          </div>

          {/* Expanded section */}
          <div
            className={`relative z-10 grid transition-[grid-template-rows,opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'}`}
            style={{ willChange: 'opacity, transform' }}
          >
            <div className="overflow-hidden">
              {!isWatchlist && (
                <div
                  className={`rounded-[2rem] p-6 mb-6 border transition-colors duration-200 ${hasPoster ? 'bg-[#0c0c0c] border-white/10' : 'bg-stone-50 dark:bg-[#0c0c0c] border-stone-100 dark:border-white/5'}`}
                >
                  {/* Section header */}
                  <div className="flex justify-between items-center mb-6">
                    <div className="flex flex-col gap-1 min-w-0">
                      <span
                        className={`text-[10px] font-black uppercase tracking-[0.2em] ${hasPoster ? 'text-white/30' : 'text-stone-300 dark:text-stone-700'}`}
                      >
                        {isLegacyOnly
                          ? 'Notation Bitter'
                          : profileLabel
                            ? `Bitter+ · ${profileLabel}`
                            : 'Notation Bitter+'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {hasRewatches && onToggleDisplayMode && (
                        <MovieRatingToggle
                          movie={movie}
                          onToggle={onToggleDisplayMode}
                          variant={hasPoster ? 'dark' : 'default'}
                          compact
                        />
                      )}
                      {movie.smartphoneFactor && movie.smartphoneFactor > 0 && (
                        <div className="flex items-center gap-1.5 bg-red-500/20 text-red-500 px-2.5 py-1 rounded-lg">
                          <Smartphone size={11} />
                          <span className="text-[9px] font-black">{movie.smartphoneFactor}%</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {adaptive ? (
                    <>
                      {adaptive.criteria
                        .filter((c) => c.group === 'base')
                        .map((c) => (
                          <RatingBar
                            key={c.key}
                            label={c.label}
                            value={c.value}
                            hasPoster={hasPoster}
                            isExpanded={isExpanded}
                            weight={c.weight}
                            weightLabel={c.weightLabel}
                          />
                        ))}
                      {adaptive.criteria
                        .filter((c) => c.group === 'specific')
                        .map((c) => (
                          <RatingBar
                            key={c.key}
                            label={c.label}
                            value={c.value}
                            hasPoster={hasPoster}
                            isExpanded={isExpanded}
                            weight={c.weight}
                            weightLabel={c.weightLabel}
                          />
                        ))}
                    </>
                  ) : (
                    <>
                      <RatingBar label="Écriture" value={displayRatings.story} hasPoster={hasPoster} isExpanded={isExpanded} />
                      <RatingBar label="Esthétique" value={displayRatings.visuals} hasPoster={hasPoster} isExpanded={isExpanded} />
                      <RatingBar label="Interprétation" value={displayRatings.acting} hasPoster={hasPoster} isExpanded={isExpanded} />
                      <RatingBar label="Univers Sonore" value={displayRatings.sound} hasPoster={hasPoster} isExpanded={isExpanded} />
                    </>
                  )}
                </div>
              )}

              {movie.comment ? (
                <>
                  {movie.review && (
                    <div className="mb-3">
                      <p
                        className={`text-[11px] leading-relaxed line-clamp-2 ${hasPoster ? 'text-white/40' : 'text-stone-400 dark:text-stone-600'}`}
                      >
                        {movie.review}
                      </p>
                    </div>
                  )}
                  <div
                    className={`mb-8 pl-5 border-l-2 transition-colors duration-200 ${hasPoster ? 'border-white/20' : 'border-stone-200 dark:border-stone-800'}`}
                  >
                    <p
                      className={`text-sm font-medium leading-relaxed italic ${hasPoster ? 'text-white/80' : 'text-stone-600 dark:text-stone-400'}`}
                    >
                      "{movie.comment}"
                    </p>
                  </div>
                </>
              ) : (
                movie.review && (
                  <div
                    className={`mb-8 pl-5 border-l-2 transition-colors duration-200 ${hasPoster ? 'border-white/20' : 'border-stone-200 dark:border-stone-800'}`}
                  >
                    <p
                      className={`text-sm font-medium leading-relaxed italic ${hasPoster ? 'text-white/80' : 'text-stone-600 dark:text-stone-400'}`}
                    >
                      "{movie.review}"
                    </p>
                  </div>
                )
              )}

              {/* Actions */}
              <div className="grid grid-cols-2 gap-3 mt-2 pb-4">
                {!isWatchlist && onRewatch && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRewatch(movie);
                    }}
                    className={`flex items-center justify-center gap-1.5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 border ${hasPoster ? 'bg-white/10 text-white border-white/10 hover:bg-white/20' : 'bg-stone-100 dark:bg-[#252525] text-charcoal dark:text-white border-stone-200 dark:border-white/10 hover:bg-stone-200 dark:hover:bg-[#303030]'}`}
                  >
                    <RotateCw size={12} strokeWidth={2.5} />
                    <span>Rewatch</span>
                    {hasRewatches && (
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${hasPoster ? 'bg-white/20 text-white' : 'bg-stone-300 dark:bg-white/20 text-charcoal dark:text-white'}`}
                      >
                        ×{movie.watch_count}
                      </span>
                    )}
                  </button>
                )}

                {!isWatchlist && <ShareStoryButtonSimple movie={movie} />}

                {isWatchlist && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkAsWatched(movie);
                    }}
                    className="flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-forest text-white active:scale-95 transition-all shadow-lg shadow-forest/20"
                  >
                    <Play size={14} fill="currentColor" /> J'ai vu ça
                  </button>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(movie);
                  }}
                  className="flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-white dark:bg-[#202020] text-charcoal dark:text-white active:scale-95 transition-all shadow-lg border dark:border-white/5"
                >
                  <Pencil size={14} /> Éditer
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(movie.id);
                  }}
                  className={`flex items-center justify-center gap-2 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-90 border ${hasPoster ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400 border-red-100 dark:border-red-500/10'}`}
                >
                  <Trash2 size={14} /> Supprimer
                </button>
              </div>
            </div>
          </div>

          {!isExpanded && (
            <div className="absolute bottom-8 right-8 opacity-20 dark:opacity-40 group-hover:translate-y-1 transition-all duration-300">
              <ChevronDown size={24} />
            </div>
          )}

          {!isExpanded && swipeX === 0 && !showDeleteConfirm && (
            <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-3 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${hasPoster ? 'bg-white/10 text-white/40' : 'bg-stone-100 dark:bg-white/5 text-stone-300 dark:text-stone-700'}`}
              >
                <Pencil size={9} /> Éditer
              </div>
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${hasPoster ? 'bg-red-500/20 text-red-400' : 'bg-red-50 dark:bg-red-500/10 text-red-300 dark:text-red-700'}`}
              >
                Sup. <Trash2 size={9} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

export default MovieCard;
