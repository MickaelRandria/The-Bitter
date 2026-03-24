import React, { useState, useEffect } from 'react';
import { X, Sparkles, Plus, Check, Loader2, Calendar } from 'lucide-react';
import { Movie, MovieFormData } from '../types';
import {
  getRecommendations,
  getMovieDetailsForAdd,
  getRecommendationsByGenres,
  getRecommendationsByDirectors,
  getRecommendationsByDecades,
  getHiddenGems,
} from '../services/tmdb';
import { analyzeUserProfile, UserProfileAnalysis } from '../services/profileAnalyzer';
import { TMDB_IMAGE_URL } from '../constants';
import { haptics } from '../utils/haptics';

const MIN_MOVIES_FOR_AI = 10;

type RecoMode = 'similar' | 'genres' | 'directors' | 'decades' | 'gems' | 'optimal';

interface RecommendationsModalProps {
  sourceMovie: Movie | null;
  isOpen: boolean;
  onClose: () => void;
  onAddMovie: (movie: MovieFormData) => void;
  existingTmdbIds: Set<number>;
  movies?: Movie[];
}

const TABS: { id: RecoMode; label: string }[] = [
  { id: 'similar', label: '🎯 Film similaire' },
  { id: 'genres', label: '🎭 Mes genres' },
  { id: 'directors', label: '🎬 Mes réalisateurs' },
  { id: 'decades', label: '📅 Mes décennies' },
  { id: 'gems', label: '💎 Découvertes' },
  { id: 'optimal', label: '🎯 Mix optimal' },
];

const MODE_TITLE: Record<RecoMode, string> = {
  similar: 'Parce que tu as vu...',
  genres: 'Dans tes genres favoris',
  directors: 'De tes réalisateurs favoris',
  decades: 'De tes décennies préférées',
  gems: 'Gems cachés pour toi',
  optimal: 'Mix optimal pour toi',
};

const RecommendationsModal: React.FC<RecommendationsModalProps> = ({
  sourceMovie,
  isOpen,
  onClose,
  onAddMovie,
  existingTmdbIds,
  movies = [],
}) => {
  const watchedCount = movies.filter((m) => m.status === 'watched').length;
  const [mode, setMode] = useState<RecoMode>('similar');
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileAnalysis | null>(null);

  // Analyse le profil une fois débloqué
  useEffect(() => {
    if (isOpen && watchedCount >= MIN_MOVIES_FOR_AI) {
      setUserProfile(analyzeUserProfile(movies));
    }
  }, [isOpen, movies, watchedCount]);

  // Fetch selon le mode actif
  useEffect(() => {
    if (!isOpen || watchedCount < MIN_MOVIES_FOR_AI) return;

    const fetchRecs = async () => {
      setLoading(true);
      setRecommendations([]);
      let recs: any[] = [];

      try {
        if (mode === 'similar' && sourceMovie?.tmdbId) {
          const raw = await getRecommendations(sourceMovie.tmdbId);
          recs = raw.filter((r) => r.poster_path && !existingTmdbIds.has(r.id)).slice(0, 6);
        } else if (mode === 'genres' && userProfile) {
          recs = await getRecommendationsByGenres(
            userProfile.favoriteGenres.map((g) => g.name),
            existingTmdbIds
          );
        } else if (mode === 'directors' && userProfile) {
          recs = await getRecommendationsByDirectors(
            userProfile.favoriteDirectors.map((d) => d.name),
            existingTmdbIds
          );
        } else if (mode === 'decades' && userProfile) {
          recs = await getRecommendationsByDecades(
            userProfile.favoriteDecades.map((d) => d.decade),
            existingTmdbIds
          );
        } else if (mode === 'gems' && userProfile) {
          recs = await getHiddenGems(
            userProfile.favoriteGenres.map((g) => g.name),
            existingTmdbIds
          );
        } else if (mode === 'optimal' && userProfile) {
          const [genreRecs, directorRecs, decadeRecs] = await Promise.all([
            getRecommendationsByGenres(
              userProfile.favoriteGenres.map((g) => g.name),
              existingTmdbIds
            ),
            getRecommendationsByDirectors(
              userProfile.favoriteDirectors.map((d) => d.name),
              existingTmdbIds
            ),
            getRecommendationsByDecades(
              userProfile.favoriteDecades.map((d) => d.decade),
              existingTmdbIds
            ),
          ]);
          const all = [...genreRecs, ...directorRecs, ...decadeRecs];
          recs = Array.from(new Map(all.map((m) => [m.id, m])).values()).slice(0, 12);
        }
      } catch (error) {
        if (import.meta.env.DEV) console.error('Recommendation error:', error);
      }

      setRecommendations(recs);
      setLoading(false);
    };

    fetchRecs();
  }, [isOpen, mode, sourceMovie, existingTmdbIds, userProfile, watchedCount]);

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

  if (!isOpen) return null;

  // Unlock screen
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
              Recos perso en cours d'activation
            </h3>
            <div className="max-w-xs mx-auto mb-6 mt-5">
              <div className="flex items-center justify-between text-sm font-bold text-stone-400 mb-2">
                <span>Progression</span>
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
              Note encore{' '}
              <span className="font-black text-forest dark:text-lime-400">
                {MIN_MOVIES_FOR_AI - watchedCount} film
                {MIN_MOVIES_FOR_AI - watchedCount > 1 ? 's' : ''}
              </span>{' '}
              pour débloquer des recommandations basées sur TES goûts.
            </p>
            <div className="text-left bg-stone-50 dark:bg-[#1a1a1a] p-4 rounded-2xl">
              <p className="text-xs font-bold text-stone-600 dark:text-stone-400 mb-1">
                💡 En attendant
              </p>
              <p className="text-xs text-stone-500">
                Continue à noter des films pour que l'algo puisse analyser tes préférences :
                genres, réalisateurs, style, etc.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-charcoal/80 backdrop-blur-md animate-[fadeIn_0.3s_ease-out]"
        onClick={onClose}
      />

      <div className="relative z-10 bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-[scaleIn_0.3s_ease-out]">
        {/* Header */}
        <div className="p-6 pb-0 border-b border-sand bg-stone-50/50">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-forest text-white rounded-2xl shadow-lg shadow-forest/20">
                <Sparkles size={22} className="animate-pulse" />
              </div>
              <div>
                <h3 className="text-xl font-black text-charcoal tracking-tight leading-none">
                  {MODE_TITLE[mode]}
                </h3>
                {mode === 'similar' && sourceMovie && (
                  <p className="text-sm font-bold text-stone-400 mt-1 truncate max-w-[200px] sm:max-w-sm">
                    "{sourceMovie.title}"
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-3 bg-white border border-sand rounded-full text-stone-400 hover:text-charcoal hover:border-stone-300 transition-all active:scale-90"
            >
              <X size={20} strokeWidth={2.5} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 pb-4 overflow-x-auto no-scrollbar -mx-1 px-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  haptics.soft();
                  setMode(tab.id);
                }}
                className={`px-3 py-2 rounded-2xl text-xs font-black transition-all whitespace-nowrap flex-shrink-0 ${
                  mode === tab.id
                    ? 'bg-forest text-white shadow-sm'
                    : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Profile context strip */}
        {userProfile && mode !== 'similar' && (
          <div className="px-6 py-3 bg-stone-50 border-b border-sand">
            <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 mb-2">
              {mode === 'genres' && 'Tes genres favoris'}
              {mode === 'directors' && 'Tes réalisateurs favoris'}
              {mode === 'decades' && 'Tes décennies préférées'}
              {mode === 'gems' && 'Dans tes genres favoris'}
              {mode === 'optimal' && 'Basé sur ton profil complet'}
            </p>
            <div className="flex gap-2 flex-wrap">
              {mode === 'genres' &&
                userProfile.favoriteGenres.map((g) => (
                  <span
                    key={g.name}
                    className="px-2 py-1 bg-forest/10 text-forest rounded-lg text-[10px] font-black"
                  >
                    {g.name} · {g.avgRating.toFixed(1)}/10
                  </span>
                ))}
              {mode === 'directors' &&
                (userProfile.favoriteDirectors.length > 0 ? (
                  userProfile.favoriteDirectors.map((d) => (
                    <span
                      key={d.name}
                      className="px-2 py-1 bg-forest/10 text-forest rounded-lg text-[10px] font-black"
                    >
                      {d.name} · {d.count} film{d.count > 1 ? 's' : ''}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-stone-400">
                    Note 2+ films du même réalisateur pour ce mode
                  </span>
                ))}
              {mode === 'decades' &&
                userProfile.favoriteDecades.map((d) => (
                  <span
                    key={d.decade}
                    className="px-2 py-1 bg-forest/10 text-forest rounded-lg text-[10px] font-black"
                  >
                    {d.decade}s · {d.avgRating.toFixed(1)}/10
                  </span>
                ))}
              {(mode === 'gems' || mode === 'optimal') &&
                userProfile.favoriteGenres.map((g) => (
                  <span
                    key={g.name}
                    className="px-2 py-1 bg-forest/10 text-forest rounded-lg text-[10px] font-black"
                  >
                    {g.name}
                  </span>
                ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 no-scrollbar bg-white">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 opacity-50">
              <Loader2 size={40} className="animate-spin text-forest" />
              <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                Analyse de tes goûts...
              </p>
            </div>
          ) : recommendations.length === 0 ? (
            <div className="text-center py-16 opacity-40">
              <p className="font-bold text-stone-400">Aucune recommandation trouvée.</p>
              {mode === 'directors' && (
                <p className="text-xs text-stone-400 mt-2">
                  Note 2+ films du même réalisateur pour ce mode.
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {recommendations.map((movie) => {
                const isAdded = existingTmdbIds.has(movie.id);
                const isAdding = addingId === movie.id;
                return (
                  <div
                    key={movie.id}
                    className="group relative flex flex-col text-left animate-[fadeIn_0.5s_ease-out]"
                  >
                    <div className="w-full aspect-[2/3] rounded-3xl overflow-hidden bg-stone-100 mb-3 shadow-sm group-hover:shadow-xl transition-all relative">
                      <img
                        src={`${TMDB_IMAGE_URL}${movie.poster_path}`}
                        alt={movie.title || movie.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      />
                      <div
                        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 flex items-center justify-center ${isAdding ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                      >
                        <button
                          onClick={() => !isAdded && !isAdding && handleAdd(movie.id)}
                          disabled={isAdded || isAdding}
                          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl scale-0 group-hover:scale-100 transition-all duration-300 delay-75 ${isAdded ? 'bg-forest text-white cursor-default' : 'bg-white text-charcoal hover:scale-110 active:scale-90'}`}
                        >
                          {isAdding ? (
                            <Loader2 size={24} className="animate-spin" />
                          ) : isAdded ? (
                            <Check size={24} strokeWidth={3} />
                          ) : (
                            <Plus size={24} strokeWidth={3} />
                          )}
                        </button>
                      </div>
                      {(movie.vote_average ?? 0) > 0 && (
                        <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-md text-white px-2 py-1 rounded-lg text-[9px] font-bold">
                          {movie.vote_average.toFixed(1)}
                        </div>
                      )}
                    </div>
                    <h4 className="font-black text-xs text-charcoal leading-tight uppercase tracking-tighter line-clamp-2 mb-1 group-hover:text-forest transition-colors">
                      {movie.title || movie.name}
                    </h4>
                    <div className="flex items-center gap-1.5 text-stone-400 opacity-80">
                      <Calendar size={10} />
                      <span className="text-[9px] font-bold">
                        {(movie.release_date || movie.first_air_date || '')?.split('-')[0] || 'N/A'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 bg-stone-50 border-t border-sand text-center">
          <p className="text-[9px] font-black text-stone-300 uppercase tracking-widest">
            Recos Perso · Powered by TMDB
          </p>
        </div>
      </div>
    </div>
  );
};

export default RecommendationsModal;
