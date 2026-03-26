import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Sparkles, Plus, Check, Loader2, Calendar, ChevronLeft, Search } from 'lucide-react';
import { Movie, MovieFormData } from '../types';
import { getRecommendations, getTopRatedRecommendations, getMovieDetailsForAdd } from '../services/tmdb';
import { TMDB_IMAGE_URL } from '../constants';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';

const MIN_MOVIES_FOR_AI = 10;

interface RecommendationsModalProps {
  sourceMovie: Movie | null;
  isOpen: boolean;
  onClose: () => void;
  onAddMovie: (movie: MovieFormData) => void;
  existingTmdbIds: Set<number>;
  movies?: Movie[];
}

const RecommendationsModal: React.FC<RecommendationsModalProps> = ({
  sourceMovie,
  isOpen,
  onClose,
  onAddMovie,
  existingTmdbIds,
  movies = [],
}) => {
  const { t } = useLanguage();
  const watchedMovies = useMemo(() => movies.filter((m) => m.status === 'watched'), [movies]);
  const watchedCount = watchedMovies.length;

  const [mode, setMode] = useState<'smart' | 'pick'>('smart');
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(sourceMovie);
  const [pickerSearch, setPickerSearch] = useState('');
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);

  // Top 10 films les mieux notés
  const top10 = useMemo(() => {
    return [...watchedMovies]
      .filter((m) => m.tmdbId)
      .sort((a, b) => {
        const avgA = (a.ratings.story + a.ratings.visuals + a.ratings.acting + a.ratings.sound) / 4;
        const avgB = (b.ratings.story + b.ratings.visuals + b.ratings.acting + b.ratings.sound) / 4;
        return avgB - avgA;
      })
      .slice(0, 10) as (Movie & { tmdbId: number })[];
  }, [watchedMovies]);

  // Stable ref pour existingTmdbIds — évite de relancer les effects quand le Set change de référence
  const existingTmdbIdsRef = useRef(existingTmdbIds);
  existingTmdbIdsRef.current = existingTmdbIds;

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode('smart');
      setSelectedMovie(sourceMovie);
      setPickerSearch('');
      setRecommendations([]);
    }
  }, [isOpen, sourceMovie]);

  // Fetch smart recs — top10 stable grâce au double useMemo, existingTmdbIds via ref
  useEffect(() => {
    if (!isOpen || mode !== 'smart' || top10.length === 0) return;
    let cancelled = false;
    const doFetch = async () => {
      setLoading(true);
      setRecommendations([]);
      const results = await getTopRatedRecommendations(top10, existingTmdbIdsRef.current);
      if (!cancelled) {
        setRecommendations(results);
        setLoading(false);
      }
    };
    doFetch();
    return () => { cancelled = true; };
  }, [isOpen, mode, top10]);

  // Fetch pick recs
  useEffect(() => {
    if (!isOpen || mode !== 'pick' || !selectedMovie?.tmdbId) return;
    let cancelled = false;
    const doFetch = async () => {
      setLoading(true);
      setRecommendations([]);
      const raw = await getRecommendations(selectedMovie.tmdbId!);
      if (!cancelled) {
        const filtered = raw
          .filter((r) => r.poster_path && !existingTmdbIdsRef.current.has(r.id))
          .slice(0, 5);
        setRecommendations(filtered);
        setLoading(false);
      }
    };
    doFetch();
    return () => { cancelled = true; };
  }, [isOpen, mode, selectedMovie]);

  const handleAdd = async (tmdbId: number) => {
    setAddingId(tmdbId);
    haptics.soft();
    const movieData = await getMovieDetailsForAdd(tmdbId);
    if (movieData) {
      onAddMovie(movieData);
      haptics.success();
    }
    setAddingId(null);
  };

  const filteredWatched = watchedMovies
    .filter((m) =>
      pickerSearch
        ? m.title.toLowerCase().includes(pickerSearch.toLowerCase()) ||
          m.director.toLowerCase().includes(pickerSearch.toLowerCase())
        : true
    )
    .sort((a, b) => (b.dateWatched ?? 0) - (a.dateWatched ?? 0));

  if (!isOpen) return null;

  // ── Unlock screen ──────────────────────────────────────────────────────────
  if (watchedCount < MIN_MOVIES_FOR_AI) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
        <div
          className="absolute inset-0 bg-charcoal/80 backdrop-blur-md animate-[fadeIn_0.3s_ease-out]"
          onClick={onClose}
        />
        <div className="relative z-10 bg-white dark:bg-[#111] w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-[scaleIn_0.3s_ease-out]">
          <div className="flex justify-end p-5 pb-0">
            <button
              onClick={onClose}
              className="p-2 rounded-full text-stone-400 hover:text-charcoal dark:hover:text-white transition-colors"
            >
              <X size={20} strokeWidth={2.5} />
            </button>
          </div>
          <div className="text-center px-8 pb-10 pt-4">
            <div className="w-20 h-20 bg-gradient-to-br from-forest to-lime-400 rounded-full flex items-center justify-center mx-auto mb-6">
              <Sparkles size={36} className="text-white" />
            </div>
            <h3 className="text-2xl font-black text-charcoal dark:text-white mb-2 tracking-tight">
              {t('reco.unlocking')}
            </h3>
            <div className="max-w-xs mx-auto mb-6 mt-5">
              <div className="flex items-center justify-between text-sm font-bold text-stone-400 mb-2">
                <span>{t('aiUnlock.progress')}</span>
                <span>
                  {watchedCount}/{MIN_MOVIES_FOR_AI} films
                </span>
              </div>
              <div className="h-3 bg-stone-100 dark:bg-[#1a1a1a] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-forest to-lime-400 transition-all duration-500"
                  style={{ width: `${(watchedCount / MIN_MOVIES_FOR_AI) * 100}%` }}
                />
              </div>
            </div>
            <p className="text-sm text-stone-500 dark:text-stone-400 max-w-xs mx-auto mb-6">
              {t('reco.unlockDesc', { n: String(MIN_MOVIES_FOR_AI - watchedCount), s: MIN_MOVIES_FOR_AI - watchedCount > 1 ? 's' : '' })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Picker (mode pick, no movie selected) ─────────────────────────────────
  if (mode === 'pick' && !selectedMovie) {
    return (
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
        <div
          className="absolute inset-0 bg-charcoal/80 backdrop-blur-md animate-[fadeIn_0.3s_ease-out]"
          onClick={onClose}
        />
        <div className="relative z-10 bg-white dark:bg-[#111] w-full sm:max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)]">
          {/* Header */}
          <div className="p-6 pb-4 border-b border-sand dark:border-white/10 shrink-0">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMode('smart')}
                  className="p-2 bg-stone-100 dark:bg-white/10 rounded-full text-stone-500 dark:text-stone-400 hover:text-charcoal dark:hover:text-white transition-all active:scale-90"
                >
                  <ChevronLeft size={18} strokeWidth={2.5} />
                </button>
                <div>
                  <h3 className="text-lg font-black text-charcoal dark:text-white tracking-tight">
                    {t('reco.title')}
                  </h3>
                  <p className="text-xs text-stone-400 font-bold">{t('reco.pickMovie')}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2.5 bg-stone-100 dark:bg-white/10 rounded-full text-stone-400 hover:text-charcoal dark:hover:text-white transition-all active:scale-90"
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder={t('reco.searchPlaceholder')}
                className="w-full pl-9 pr-4 py-2.5 bg-stone-100 dark:bg-white/5 rounded-2xl text-sm font-medium text-charcoal dark:text-white placeholder-stone-400 outline-none border border-transparent focus:border-forest/30 transition-colors"
              />
            </div>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
            <div className="grid grid-cols-3 gap-3">
              {filteredWatched.map((movie) => {
                const avg = (
                  (movie.ratings.story + movie.ratings.visuals + movie.ratings.acting + movie.ratings.sound) / 4
                ).toFixed(1);
                return (
                  <button
                    key={movie.id}
                    onClick={() => {
                      haptics.soft();
                      setSelectedMovie(movie);
                    }}
                    className="flex flex-col text-left group"
                  >
                    <div className="w-full aspect-[2/3] rounded-2xl overflow-hidden bg-stone-100 dark:bg-stone-800 mb-2 relative shadow-sm group-active:scale-95 transition-transform">
                      {movie.posterUrl ? (
                        <img
                          src={movie.posterUrl}
                          alt={movie.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-stone-300 dark:text-stone-600">
                          <Sparkles size={20} />
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black/60 to-transparent" />
                      <span className="absolute bottom-1.5 right-1.5 text-[10px] font-black text-white bg-black/40 px-1.5 py-0.5 rounded-md">
                        ★ {avg}
                      </span>
                    </div>
                    <p className="text-[10px] font-black text-charcoal dark:text-white leading-tight line-clamp-2 uppercase tracking-tight">
                      {movie.title}
                    </p>
                    <p className="text-[9px] text-stone-400 mt-0.5">{movie.year}</p>
                  </button>
                );
              })}
              {filteredWatched.length === 0 && (
                <div className="col-span-3 text-center py-10 text-stone-400 text-sm font-bold">
                  {t('addMovie.noResults')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Smart mode OR pick mode with selected movie ────────────────────────────
  const isPickWithMovie = mode === 'pick' && selectedMovie;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-charcoal/80 backdrop-blur-md animate-[fadeIn_0.3s_ease-out]"
        onClick={onClose}
      />
      <div className="relative z-10 bg-white dark:bg-[#111] w-full sm:max-w-2xl rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)]">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-sand dark:border-white/10 shrink-0">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-start gap-3 min-w-0">
              {isPickWithMovie && (
                <button
                  onClick={() => setSelectedMovie(null)}
                  className="p-2 bg-stone-100 dark:bg-white/10 rounded-full text-stone-500 dark:text-stone-400 hover:text-charcoal dark:hover:text-white transition-all active:scale-90 shrink-0 mt-0.5"
                >
                  <ChevronLeft size={18} strokeWidth={2.5} />
                </button>
              )}
              {isPickWithMovie && selectedMovie.posterUrl && (
                <img
                  src={selectedMovie.posterUrl}
                  alt={selectedMovie.title}
                  className="w-10 h-14 rounded-xl object-cover shrink-0 shadow-sm"
                />
              )}
              <div className="min-w-0">
                {isPickWithMovie ? (
                  <>
                    <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 mb-0.5">
                      {t('reco.because')}
                    </p>
                    <h3 className="text-base font-black text-charcoal dark:text-white tracking-tight leading-tight truncate">
                      {selectedMovie.title}
                    </h3>
                    <p className="text-xs text-stone-400 font-bold">
                      {selectedMovie.director} · {selectedMovie.year}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className="p-1.5 bg-forest text-white rounded-xl">
                        <Sparkles size={14} />
                      </div>
                      <h3 className="text-base font-black text-charcoal dark:text-white tracking-tight">
                        {t('reco.title')}
                      </h3>
                    </div>
                    <p className="text-xs text-stone-400 font-bold">{t('reco.smartSubtitle')}</p>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2.5 bg-stone-100 dark:bg-white/10 rounded-full text-stone-400 hover:text-charcoal dark:hover:text-white transition-all active:scale-90 shrink-0"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => { setMode('smart'); setSelectedMovie(null); setRecommendations([]); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-black transition-all ${
                mode === 'smart'
                  ? 'bg-forest text-white shadow-sm'
                  : 'bg-stone-100 dark:bg-white/10 text-stone-500 dark:text-stone-400'
              }`}
            >
              <Sparkles size={11} />
              {t('reco.smartMode')}
            </button>
            <button
              onClick={() => { setMode('pick'); setSelectedMovie(null); setRecommendations([]); }}
              className={`px-4 py-2 rounded-2xl text-xs font-black transition-all ${
                mode === 'pick'
                  ? 'bg-forest text-white shadow-sm'
                  : 'bg-stone-100 dark:bg-white/10 text-stone-500 dark:text-stone-400'
              }`}
            >
              {t('reco.pickMode')}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 no-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 opacity-50">
              <Loader2 size={36} className="animate-spin text-forest dark:text-lime-400" />
              <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                {t('reco.searching')}
              </p>
            </div>
          ) : recommendations.length === 0 ? (
            <div className="text-center py-16 opacity-40">
              <p className="font-bold text-stone-400 text-sm">
                {mode === 'smart' ? t('reco.noSmartReco') : t('reco.noReco')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {recommendations.map((movie) => {
                const isAdded = existingTmdbIds.has(movie.id);
                const isAdding = addingId === movie.id;
                return (
                  <div
                    key={movie.id}
                    className="group relative flex flex-col text-left animate-[fadeIn_0.5s_ease-out]"
                  >
                    <div className="w-full aspect-[2/3] rounded-2xl overflow-hidden bg-stone-100 dark:bg-stone-800 mb-2 shadow-sm relative">
                      <img
                        src={`${TMDB_IMAGE_URL}${movie.poster_path}`}
                        alt={movie.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      />
                      <div
                        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 flex items-center justify-center ${isAdding ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                      >
                        <button
                          onClick={() => !isAdded && !isAdding && handleAdd(movie.id)}
                          disabled={isAdded || isAdding}
                          className={`w-12 h-12 rounded-full flex items-center justify-center shadow-2xl scale-75 group-hover:scale-100 transition-all duration-300 ${isAdded ? 'bg-forest text-white cursor-default' : 'bg-white text-charcoal hover:scale-110 active:scale-90'}`}
                        >
                          {isAdding ? (
                            <Loader2 size={20} className="animate-spin" />
                          ) : isAdded ? (
                            <Check size={20} strokeWidth={3} />
                          ) : (
                            <Plus size={20} strokeWidth={3} />
                          )}
                        </button>
                      </div>
                      {(movie.vote_average ?? 0) > 0 && (
                        <div className="absolute top-1.5 right-1.5 bg-black/50 backdrop-blur-sm text-white px-1.5 py-0.5 rounded-md text-[9px] font-bold">
                          {movie.vote_average.toFixed(1)}
                        </div>
                      )}
                    </div>
                    <h4 className="font-black text-[10px] text-charcoal dark:text-white leading-tight uppercase tracking-tight line-clamp-2 mb-0.5">
                      {movie.title}
                    </h4>
                    <div className="flex items-center gap-1 text-stone-400">
                      <Calendar size={9} />
                      <span className="text-[9px] font-bold">
                        {movie.release_date?.split('-')[0] || 'N/A'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecommendationsModal;
