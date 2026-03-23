import React, { useEffect, useState } from 'react';
import {
  X,
  Calendar,
  Clock,
  Star,
  Play,
  Eye,
  Plus,
  User,
  Film,
  Tv,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from '../constants';
import { MovieStatus } from '../types';
import { haptics } from '../utils/haptics';

interface MovieDetailModalProps {
  tmdbId: number;
  isOpen: boolean;
  onClose: () => void;
  onAction: (id: number, status: MovieStatus) => void;
  onViewDirector?: (name: string, id?: number) => void;
  mediaType?: 'movie' | 'tv';
  collectionMovieId?: string;
  collectionTmdbRating?: number;
  collectionUserRating?: number;
  onUpdateTmdbRating?: (movieId: string, newRating: number) => void;
}

interface TMDBReview {
  id: string;
  author: string;
  author_details: { rating: number | null; avatar_path: string | null };
  content: string;
  created_at: string;
}

interface MovieDetail {
  id: number;
  title?: string;
  name?: string; // For TV
  overview: string;
  poster_path: string;
  backdrop_path: string;
  release_date?: string;
  first_air_date?: string; // For TV
  runtime?: number;
  episode_run_time?: number[]; // For TV
  number_of_seasons?: number; // For TV
  vote_average: number;
  genres: { name: string }[];
  credits: {
    crew: { job: string; name: string }[];
    cast: { name: string; character: string; profile_path: string }[];
  };
  created_by?: { name: string }[]; // For TV
  'watch/providers': {
    results: {
      FR?: {
        flatrate?: { provider_name: string; logo_path: string }[];
        rent?: { provider_name: string; logo_path: string }[];
        buy?: { provider_name: string; logo_path: string }[];
      };
    };
  };
  videos?: {
    results: {
      key: string;
      site: string;
      type: string;
    }[];
  };
  reviews?: { results: TMDBReview[] };
}

const MovieDetailModal: React.FC<MovieDetailModalProps> = ({
  tmdbId,
  isOpen,
  onClose,
  onAction,
  onViewDirector,
  mediaType = 'movie',
  collectionMovieId,
  collectionTmdbRating,
  collectionUserRating,
  onUpdateTmdbRating,
}) => {
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [reviews, setReviews] = useState<TMDBReview[]>([]);
  const [reviewFilter, setReviewFilter] = useState<'good' | 'bad' | 'matching'>('good');
  const [expandedReview, setExpandedReview] = useState<TMDBReview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && tmdbId) {
      const fetchDetails = async () => {
        setLoading(true);
        try {
          const res = await fetch(
            `${TMDB_BASE_URL}/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=fr-FR&append_to_response=credits,watch/providers,videos,reviews`
          );
          const data = await res.json();
          setMovie(data);
          if (collectionMovieId && onUpdateTmdbRating && data.vote_average) {
            const freshRating = Number(data.vote_average.toFixed(1));
            if (collectionTmdbRating !== freshRating) {
              onUpdateTmdbRating(collectionMovieId, freshRating);
            }
          }
          // Reviews: FR p1 (append) + FR p2-3 + EN p1-22 = 25 parallel requests → ~500 reviews
          const frP1: TMDBReview[] = data.reviews?.results ?? [];
          const [
            frP2,
            frP3,
            p1,
            p2,
            p3,
            p4,
            p5,
            p6,
            p7,
            p8,
            p9,
            p10,
            p11,
            p12,
            p13,
            p14,
            p15,
            p16,
            p17,
            p18,
            p19,
            p20,
            p21,
            p22,
          ] = await Promise.all([
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&language=fr-FR&page=2`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&language=fr-FR&page=3`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=1`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=2`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=3`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=4`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=5`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=6`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=7`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=8`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=9`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=10`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=11`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=12`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=13`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=14`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=15`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=16`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=17`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=18`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=19`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=20`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=21`
            ).then((r) => r.json()),
            fetch(
              `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/reviews?api_key=${TMDB_API_KEY}&page=22`
            ).then((r) => r.json()),
          ]);
          const seen = new Set(frP1.map((r) => r.id));
          const allFr: TMDBReview[] = [
            ...frP1,
            ...(frP2.results ?? []).filter((r: TMDBReview) => !seen.has(r.id)),
            ...(frP3.results ?? []).filter((r: TMDBReview) => !seen.has(r.id)),
          ];
          allFr.forEach((r) => seen.add(r.id));
          const enReviews: TMDBReview[] = [
            ...(p1.results ?? []),
            ...(p2.results ?? []),
            ...(p3.results ?? []),
            ...(p4.results ?? []),
            ...(p5.results ?? []),
            ...(p6.results ?? []),
            ...(p7.results ?? []),
            ...(p8.results ?? []),
            ...(p9.results ?? []),
            ...(p10.results ?? []),
            ...(p11.results ?? []),
            ...(p12.results ?? []),
            ...(p13.results ?? []),
            ...(p14.results ?? []),
            ...(p15.results ?? []),
            ...(p16.results ?? []),
            ...(p17.results ?? []),
            ...(p18.results ?? []),
            ...(p19.results ?? []),
            ...(p20.results ?? []),
            ...(p21.results ?? []),
            ...(p22.results ?? []),
          ].filter((r: TMDBReview) => !seen.has(r.id));
          setReviews([...allFr, ...enReviews]);
        } catch (e) {
          if (import.meta.env.DEV) console.error(e);
        } finally {
          setLoading(false);
        }
      };
      fetchDetails();
    } else {
      setMovie(null);
      setReviews([]);
      setExpandedReview(null);
    }
  }, [isOpen, tmdbId, mediaType]);

  if (!isOpen) return null;

  // Normalized data for Movie/TV
  const title = movie?.title || movie?.name;
  const date = movie?.release_date || movie?.first_air_date;
  const year = date?.split('-')[0];

  // Director Logic
  let director = 'Inconnu';
  if (mediaType === 'movie') {
    director = movie?.credits.crew.find((c) => c.job === 'Director')?.name || 'Inconnu';
  } else if (movie?.created_by && movie.created_by.length > 0) {
    director = movie.created_by.map((c) => c.name).join(', ');
  }

  // Runtime Logic
  let runtime = movie?.runtime;
  if (!runtime && movie?.episode_run_time && movie.episode_run_time.length > 0) {
    runtime = movie.episode_run_time[0];
  }

  const cast = movie?.credits.cast.slice(0, 6) || [];
  const providers = movie?.['watch/providers']?.results?.FR?.flatrate || [];
  const trailer = movie?.videos?.results?.find((v) => v.type === 'Trailer' && v.site === 'YouTube');

  // Review categories — thresholds: ≥7 positive, ≤4 negative, closest to user rating
  const ratedReviews = reviews.filter((r) => r.author_details.rating != null);
  const goodReviews = [...ratedReviews]
    .filter((r) => (r.author_details.rating ?? 0) >= 7)
    .sort((a, b) => (b.author_details.rating ?? 0) - (a.author_details.rating ?? 0))
    .slice(0, 5);
  const badReviews = [...ratedReviews]
    .filter((r) => (r.author_details.rating ?? 10) <= 4)
    .sort((a, b) => (a.author_details.rating ?? 10) - (b.author_details.rating ?? 10))
    .slice(0, 5);
  const matchingReviews =
    collectionUserRating != null
      ? [...ratedReviews]
          .filter((r) => Math.abs((r.author_details.rating ?? -99) - collectionUserRating) <= 0.5)
          .sort(
            (a, b) =>
              Math.abs((a.author_details.rating ?? 5) - collectionUserRating) -
              Math.abs((b.author_details.rating ?? 5) - collectionUserRating)
          )
          .slice(0, 5)
      : [];
  const hasReviews = ratedReviews.length > 0;
  const displayedReviews =
    reviewFilter === 'good' ? goodReviews : reviewFilter === 'bad' ? badReviews : matchingReviews;

  const getAvatarUrl = (r: TMDBReview) => {
    if (!r.author_details.avatar_path) return null;
    return r.author_details.avatar_path.startsWith('/https')
      ? r.author_details.avatar_path.slice(1)
      : `${TMDB_IMAGE_URL}${r.author_details.avatar_path}`;
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center pointer-events-none">
      <div
        className="absolute inset-0 bg-charcoal/60 backdrop-blur-sm transition-opacity duration-300 pointer-events-auto"
        onClick={onClose}
      />

      <div className="bg-cream w-full sm:max-w-md h-[85vh] sm:h-auto sm:max-h-[90vh] rounded-t-[3rem] sm:rounded-[3rem] shadow-2xl relative z-10 flex flex-col animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)] pointer-events-auto overflow-hidden">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <Loader2 size={40} className="animate-spin text-forest mb-4" />
          </div>
        ) : movie ? (
          <>
            {/* Header Image */}
            <div className="relative h-64 sm:h-72 shrink-0">
              <img
                src={
                  movie.backdrop_path
                    ? `${TMDB_IMAGE_URL}${movie.backdrop_path}`
                    : `${TMDB_IMAGE_URL}${movie.poster_path}`
                }
                className="w-full h-full object-cover"
                alt={title}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-cream" />

              {trailer && (
                <button
                  onClick={() =>
                    window.open(`https://www.youtube.com/watch?v=${trailer.key}`, '_blank')
                  }
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-forest text-white rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-transform z-20 group"
                >
                  <Play
                    size={24}
                    fill="currentColor"
                    className="group-hover:scale-110 transition-transform"
                  />
                </button>
              )}
              <button
                onClick={onClose}
                className="absolute top-6 right-6 w-10 h-10 bg-white/20 backdrop-blur-md text-white rounded-full flex items-center justify-center active:scale-90 transition-transform z-20 border border-white/20"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto -mt-12 relative z-10 px-8 pb-32 no-scrollbar">
              {/* Poster & Title Block */}
              <div className="flex gap-5 mb-8">
                <div className="w-24 aspect-[2/3] rounded-2xl overflow-hidden shadow-xl border-2 border-white shrink-0 -mt-8 bg-stone-200">
                  <img
                    src={`${TMDB_IMAGE_URL}${movie.poster_path}`}
                    className="w-full h-full object-cover"
                    alt=""
                  />
                </div>
                <div className="flex-1 pt-2">
                  <h2 className="text-2xl font-black text-charcoal leading-tight mb-1 line-clamp-2">
                    {title}
                  </h2>
                  <p className="text-xs font-bold text-stone-400 dark:text-stone-400 uppercase tracking-wider mb-2 line-clamp-1">
                    {year} •{' '}
                    <span
                      className={`transition-colors duration-200 ${onViewDirector ? 'hover:text-forest dark:hover:text-lime-500 cursor-pointer underline decoration-current/20 underline-offset-4' : ''}`}
                      onClick={(e) => {
                        if (onViewDirector && director !== 'Inconnu') {
                          e.stopPropagation();
                          haptics.soft();
                          // If multiple directors, we just take the first one or the whole string
                          onViewDirector(director);
                        }
                      }}
                    >
                      {director}
                    </span>
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1 bg-charcoal text-white px-2 py-0.5 rounded-md text-[10px] font-black">
                      <Star size={8} fill="currentColor" className="text-bitter-lime" />
                      {movie.vote_average.toFixed(1)}
                    </div>
                    {movie.genres && movie.genres.length > 0 && (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black text-forest dark:text-lime-500 border border-forest/20 dark:border-lime-500/20 bg-forest/5">
                        {movie.genres[0].name}
                      </div>
                    )}
                    {runtime ? (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black text-stone-400 dark:text-stone-300 border border-stone-200 dark:border-stone-700">
                        <Clock size={8} />
                        {runtime} min
                      </div>
                    ) : null}
                    {mediaType === 'tv' && movie.number_of_seasons && (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black text-stone-400 dark:text-stone-300 border border-stone-200 dark:border-stone-700">
                        <Tv size={8} />
                        {movie.number_of_seasons} S
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Providers */}
              {providers.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-400 tracking-widest mb-3">
                    Disponible sur
                  </h3>
                  <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                    {providers.map((p) => (
                      <div
                        key={p.provider_name}
                        className="flex items-center gap-2 bg-white border border-stone-100 pr-3 rounded-xl p-1 shadow-sm"
                      >
                        <img
                          src={`${TMDB_IMAGE_URL}${p.logo_path}`}
                          className="w-6 h-6 rounded-lg"
                          alt=""
                        />
                        <span className="text-[10px] font-bold text-charcoal whitespace-nowrap">
                          {p.provider_name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Synopsis */}
              <div className="mb-8">
                <h3 className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-400 tracking-widest mb-3">
                  Synopsis
                </h3>
                <p className="text-sm font-medium text-stone-600 dark:text-stone-300 leading-relaxed">
                  {movie.overview || 'Aucun résumé disponible.'}
                </p>
              </div>

              {/* Reviews */}
              {hasReviews && (
                <div className="mb-8">
                  <h3 className="text-[10px] font-black uppercase text-stone-400 tracking-widest mb-3">
                    Avis
                  </h3>
                  {/* Filter CTAs */}
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {goodReviews.length > 0 && (
                      <button
                        onClick={() => {
                          haptics.soft();
                          setReviewFilter('good');
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black border transition-all ${reviewFilter === 'good' ? 'bg-forest text-white border-forest shadow-sm' : 'bg-white text-stone-400 border-stone-200'}`}
                      >
                        👍 Les + enthousiastes
                      </button>
                    )}
                    {badReviews.length > 0 && (
                      <button
                        onClick={() => {
                          haptics.soft();
                          setReviewFilter('bad');
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black border transition-all ${reviewFilter === 'bad' ? 'bg-charcoal text-white border-charcoal shadow-sm' : 'bg-white text-stone-400 border-stone-200'}`}
                      >
                        👎 Les + critiques
                      </button>
                    )}
                    {matchingReviews.length > 0 && (
                      <button
                        onClick={() => {
                          haptics.soft();
                          setReviewFilter('matching');
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black border transition-all ${reviewFilter === 'matching' ? 'bg-bitter-lime text-charcoal border-bitter-lime shadow-sm' : 'bg-white text-stone-400 border-stone-200'}`}
                      >
                        🎯 Comme moi ({matchingReviews.length})
                      </button>
                    )}
                  </div>
                  {/* Cards */}
                  {displayedReviews.length > 0 ? (
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-2 px-2">
                      {displayedReviews.map((r) => {
                        const avatarUrl = getAvatarUrl(r);
                        const monthYear = new Date(r.created_at).toLocaleDateString('fr-FR', {
                          month: 'short',
                          year: 'numeric',
                        });
                        return (
                          <button
                            key={r.id}
                            onClick={() => {
                              haptics.soft();
                              setExpandedReview(r);
                            }}
                            className="min-w-[240px] max-w-[260px] shrink-0 bg-stone-50 rounded-2xl border border-stone-100 p-4 flex flex-col gap-2 text-left active:scale-[0.98] transition-transform"
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full overflow-hidden bg-stone-200 shrink-0 flex items-center justify-center text-[11px] font-black text-stone-500">
                                {avatarUrl ? (
                                  <img
                                    src={avatarUrl}
                                    className="w-full h-full object-cover"
                                    alt=""
                                  />
                                ) : (
                                  r.author.charAt(0).toUpperCase()
                                )}
                              </div>
                              <span className="text-[11px] font-black text-charcoal truncate flex-1">
                                {r.author}
                              </span>
                              {r.author_details.rating != null && (
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <Star size={9} fill="currentColor" className="text-bitter-lime" />
                                  <span className="text-[10px] font-black text-stone-500">
                                    {r.author_details.rating.toFixed(1)}
                                  </span>
                                </div>
                              )}
                            </div>
                            <p className="text-[11px] font-medium text-stone-600 leading-relaxed line-clamp-4 flex-1">
                              {r.content}
                            </p>
                            <p className="text-[9px] font-bold text-stone-300 uppercase tracking-widest">
                              {monthYear} · Lire la suite →
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-stone-400 font-medium">
                      Aucun avis dans cette catégorie.
                    </p>
                  )}
                </div>
              )}

              {/* Cast */}
              <div className="mb-8">
                <h3 className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-400 tracking-widest mb-3">
                  Distribution
                </h3>
                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 -mx-2 px-2">
                  {cast.map((person) => (
                    <div key={person.name} className="w-16 shrink-0 flex flex-col gap-1">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden bg-stone-100 shadow-sm">
                        {person.profile_path ? (
                          <img
                            src={`${TMDB_IMAGE_URL}${person.profile_path}`}
                            className="w-full h-full object-cover"
                            alt=""
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-stone-300">
                            <User size={20} />
                          </div>
                        )}
                      </div>
                      <p className="text-[9px] font-bold text-charcoal leading-tight truncate">
                        {person.name}
                      </p>
                      <p className="text-[8px] font-medium text-stone-400 dark:text-stone-500 truncate">
                        {person.character}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Full review popup */}
            {expandedReview && (
              <div
                className="absolute inset-0 z-40 bg-charcoal/70 backdrop-blur-sm flex items-center justify-center p-4"
                onClick={() => setExpandedReview(null)}
              >
                <div
                  className="bg-cream w-full sm:max-w-md max-h-[70vh] rounded-3xl shadow-2xl flex flex-col animate-[slideUp_0.25s_cubic-bezier(0.16,1,0.3,1)] overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-3 p-5 border-b border-sand shrink-0">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-stone-200 shrink-0 flex items-center justify-center text-[12px] font-black text-stone-500">
                      {getAvatarUrl(expandedReview) ? (
                        <img
                          src={getAvatarUrl(expandedReview)!}
                          className="w-full h-full object-cover"
                          alt=""
                        />
                      ) : (
                        expandedReview.author.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-black text-charcoal truncate">
                        {expandedReview.author}
                      </p>
                      <p className="text-[9px] text-stone-400 font-bold uppercase tracking-widest">
                        {new Date(expandedReview.created_at).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                        {expandedReview.author_details.rating != null &&
                          ` · ⭐ ${expandedReview.author_details.rating.toFixed(1)}`}
                      </p>
                    </div>
                    <button
                      onClick={() => setExpandedReview(null)}
                      className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 active:scale-90 transition-transform shrink-0"
                    >
                      <X size={14} strokeWidth={2.5} />
                    </button>
                  </div>
                  <div className="overflow-y-auto p-5 no-scrollbar">
                    <p className="text-sm font-medium text-stone-600 leading-relaxed whitespace-pre-wrap">
                      {expandedReview.content}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Sticky Actions */}
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-cream border-t border-sand flex gap-3 z-30">
              <button
                onClick={() => {
                  haptics.soft();
                  onAction(movie.id, 'watched');
                }}
                className="flex-1 bg-charcoal text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <Eye size={18} /> J'ai vu
              </button>
              <button
                onClick={() => {
                  haptics.soft();
                  onAction(movie.id, 'watchlist');
                }}
                className="flex-1 bg-white text-charcoal border border-stone-200 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <Plus size={18} /> À voir
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default MovieDetailModal;
