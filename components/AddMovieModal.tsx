import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Eye,
  Clock,
  Smartphone,
  FlaskConical,
  Zap,
  BrainCircuit,
  Smile,
  Heart,
  ToggleLeft,
  ToggleRight,
  Minus,
  Plus,
  Search,
  Loader2,
  Info,
  Tv,
  Film,
  Calendar,
  Gauge,
  Hourglass,
  Equal,
  FastForward,
} from 'lucide-react';
import { GENRES, TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from '../constants';
import {
  MovieFormData,
  Movie,
  MovieStatus,
  VibeCriteria,
  QualityMetrics,
  TMDBSearchResult,
  AdaptiveRatingData,
  AdaptiveRatingCriterion,
} from '../types';
import { haptics } from '../utils/haptics';
import { SharedSpace, addMovieToSpace } from '../services/supabase';
import { getSharedMovieDetails } from '../services/tmdb';
import { useLanguage } from '../contexts/LanguageContext';
import {
  PROFILE_OPTIONS,
  RatingProfileId,
  getRatingProfile,
  CUSTOM_WEIGHT_LEVELS,
  DEFAULT_CUSTOM_WEIGHTS,
} from '../config/ratingProfiles';
import {
  buildCriteriaForProfile,
  calculateWeightedRating,
  detectRatingProfile,
} from '../utils/rating';
import { ADAPTIVE_RATING_VERSION } from '../config/ratingProfiles';

interface AddMovieModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (movie: MovieFormData) => void;
  initialData: Movie | null;
  tmdbIdToLoad?: number | null;
  initialStatus?: MovieStatus;
  sharedSpace?: SharedSpace | null;
  currentUserId?: string;
  onSharedMovieAdded?: () => void;
  initialMediaType?: 'movie' | 'tv';
  onToast?: (message: string) => void;
}

const INITIAL_VIBE: VibeCriteria = { story: 5, emotion: 5, fun: 5, visual: 5, tension: 5 };
const INITIAL_QUALITY: QualityMetrics = { scenario: 5, acting: 5, visual: 5, sound: 5 };

const INITIAL_FORM_STATE: MovieFormData = {
  title: '',
  director: '',
  actors: '',
  year: new Date().getFullYear(),
  genre: GENRES[0],
  ratings: { story: 5, visuals: 5, acting: 5, sound: 5 },
  review: '',
  comment: '',
  theme: 'black',
  posterUrl: '',
  status: 'watched',
  dateWatched: Date.now(),
  smartphoneFactor: 0,
  vibe: INITIAL_VIBE,
  qualityMetrics: INITIAL_QUALITY,
  hype: 5,
  pacing: undefined,
  mediaType: 'movie',
  numberOfSeasons: 0,
  tmdbRating: 0,
  runtime: 0,
};

const RatingStepper: React.FC<{
  label: string;
  value: number;
  onChange: (val: number) => void;
  isBitter?: boolean;
}> = ({ label, value, onChange, isBitter }) => {
  const isHigh = value >= 7;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value.replace(',', '.'));
    if (!isNaN(val)) onChange(Math.min(10, Math.max(0, val)));
    else if (e.target.value === '') onChange(0);
  };

  return (
    <div
      className={`bg-white dark:bg-[#1a1a1a] rounded-[1.5rem] p-3 border transition-all hover:border-stone-200 dark:hover:border-white/20 flex flex-col h-full shadow-sm border-stone-100 dark:border-white/10`}
    >
      <div className="flex justify-between items-center mb-2">
        <span className="text-[8px] font-black text-stone-400 dark:text-stone-600 uppercase tracking-widest leading-none truncate pr-1">
          {label}
        </span>
        <div
          className={`w-1.5 h-1.5 rounded-full transition-all duration-500 shrink-0 ${isHigh ? (isBitter ? 'bg-bitter-lime' : 'bg-forest dark:bg-lime-500') : 'bg-stone-200 dark:bg-stone-800'}`}
        />
      </div>

      <div className="flex items-center justify-between gap-1 flex-1 min-h-[48px]">
        <button
          type="button"
          onClick={() => {
            haptics.soft();
            onChange(Math.max(0, value - 0.5));
          }}
          className="w-8 h-8 rounded-xl bg-stone-50 dark:bg-[#161616] border border-stone-200 dark:border-white/5 flex items-center justify-center active:scale-90 transition-all shadow-sm shrink-0"
        >
          <Minus size={12} strokeWidth={3} className="text-charcoal dark:text-white" />
        </button>
        <div className="flex-1 flex justify-center items-center overflow-hidden">
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0"
            max="10"
            value={value === 0 ? '' : value}
            placeholder="0"
            onChange={handleInputChange}
            className="w-full text-center text-2xl font-black tracking-tighter text-charcoal dark:text-white bg-transparent outline-none py-0 appearance-none border-none ring-0 focus:ring-0"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            haptics.soft();
            onChange(Math.min(10, value + 0.5));
          }}
          className={`w-8 h-8 rounded-xl flex items-center justify-center active:scale-90 transition-all shadow-md shrink-0 ${isBitter ? 'bg-bitter-lime text-charcoal' : 'bg-forest dark:bg-lime-500 text-white'}`}
        >
          <Plus size={12} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
};

const AddMovieModal: React.FC<AddMovieModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  tmdbIdToLoad,
  initialStatus = 'watched',
  sharedSpace,
  currentUserId,
  onSharedMovieAdded,
  initialMediaType = 'movie',
  onToast,
}) => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState<MovieFormData>(INITIAL_FORM_STATE);
  const [mode, setMode] = useState<MovieStatus>(initialStatus);
  // Bitter+ = advanced adaptive rating. Bitter = simple 4-criteria average (default).
  const [useBitterPlus, setUseBitterPlus] = useState(false);
  const [profileId, setProfileId] = useState<RatingProfileId>('standard');
  const [criteriaValues, setCriteriaValues] = useState<Record<string, number>>({});
  const [customWeights, setCustomWeights] = useState<Record<string, number>>({ ...DEFAULT_CUSTOM_WEIGHTS });
  const [profileManuallySet, setProfileManuallySet] = useState(false);
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [searchResults, setSearchResults] = useState<TMDBSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isEditMode = !!initialData;
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [searchType, setSearchType] = useState<'movie' | 'tv'>('movie');
  const skipSearchRef = useRef(false);
  const searchTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        skipSearchRef.current = true;
        setFormData({ ...initialData, comment: initialData.comment || '' });
        setMode(initialData.status || 'watched');
        // Bitter+ when the saved data contains an adaptive rating (advanced grid).
        // Otherwise, default to Bitter (simple 4-criteria average).
        setUseBitterPlus(!!initialData.adaptiveRating);
        setSearchType(initialData.mediaType === 'tv' ? 'tv' : 'movie');
        // Restore adaptive rating state when editing
        if (initialData.adaptiveRating) {
          const adaptiveProfileId = initialData.adaptiveRating.profile.id;
          // Only restore if it's a real profile (not legacy)
          const isLegacyProfile = adaptiveProfileId === 'standard_legacy';
          const restoredProfile = isLegacyProfile ? detectRatingProfile(initialData.genre) : (adaptiveProfileId as RatingProfileId);
          setProfileId(restoredProfile);
          setProfileManuallySet(!isLegacyProfile);
          const values: Record<string, number> = {};
          for (const c of initialData.adaptiveRating.criteria) values[c.key] = c.value;
          setCriteriaValues(values);
          // Restore custom weights from stored criteria when the saved profile is custom
          if (restoredProfile === 'custom') {
            const weights: Record<string, number> = { ...DEFAULT_CUSTOM_WEIGHTS };
            for (const c of initialData.adaptiveRating.criteria) weights[c.key] = c.weight;
            setCustomWeights(weights);
          } else {
            setCustomWeights({ ...DEFAULT_CUSTOM_WEIGHTS });
          }
        } else {
          const detected = detectRatingProfile(initialData.genre);
          setProfileId(detected);
          setProfileManuallySet(false);
          // Seed values from existing qualityMetrics/ratings
          const qm = initialData.qualityMetrics;
          setCriteriaValues({
            scenario: qm?.scenario ?? initialData.ratings.story,
            image: qm?.visual ?? initialData.ratings.visuals,
            interpretation: qm?.acting ?? initialData.ratings.acting,
            sound: qm?.sound ?? initialData.ratings.sound,
          });
        }
        if (initialData.dateWatched)
          setSelectedDate(new Date(initialData.dateWatched).toISOString().split('T')[0]);
      } else if (tmdbIdToLoad) {
        const type: 'movie' | 'tv' = initialMediaType === 'tv' ? 'tv' : 'movie';
        setSearchType(type);
        handleSelectTMDBMovie(tmdbIdToLoad, type);
        setMode(initialStatus);
        setSelectedDate(new Date().toISOString().split('T')[0]);
      } else {
        skipSearchRef.current = false;
        setFormData({ ...INITIAL_FORM_STATE });
        setMode(initialStatus);
        setSearchResults([]);
        setShowResults(false);
        setSearchType('movie');
        setSelectedDate(new Date().toISOString().split('T')[0]);
        setProfileId('standard');
        setProfileManuallySet(false);
        setCriteriaValues({});
        setCustomWeights({ ...DEFAULT_CUSTOM_WEIGHTS });
        setUseBitterPlus(false);
      }
    }
  }, [isOpen, initialData, tmdbIdToLoad, initialStatus, initialMediaType]);

  // Auto-detect profile from genre unless user manually overrode it
  useEffect(() => {
    if (profileManuallySet) return;
    const detected = detectRatingProfile(formData.genre);
    setProfileId((prev) => (prev === detected ? prev : detected));
  }, [formData.genre, profileManuallySet]);

  useEffect(() => {
    if (!isOpen) return;
    if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    if (formData.title.trim().length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    searchTimeoutRef.current = window.setTimeout(() => {
      searchTMDB(formData.title);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    };
  }, [formData.title, searchType]);

  const searchTMDB = async (query: string) => {
    setIsSearching(true);
    setShowResults(true);
    try {
      const endpoint = searchType === 'tv' ? 'search/tv' : 'search/movie';
      const res = await fetch(
        `${TMDB_BASE_URL}/${endpoint}?api_key=${TMDB_API_KEY}&language=fr-FR&region=FR&query=${encodeURIComponent(query)}&page=1`
      );
      const data = await res.json();
      const normalizedResults = data.results.map((item: any) => {
        if (searchType === 'tv')
          return { ...item, title: item.name, release_date: item.first_air_date };
        return item;
      });

      // Deduplicate results by ID
      const uniqueResults = Array.from(
        new Map(normalizedResults.map((m: any) => [m.id, m])).values()
      );
      setSearchResults(uniqueResults.slice(0, 5));
    } catch (e) {
      if (import.meta.env.DEV) console.error(e);
      setSearchResults([]);
      onToast?.(t('addMovie.searchError'));
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectTMDBMovie = async (id: number, explicitType?: 'movie' | 'tv') => {
    haptics.medium();
    setIsSearching(true);
    setShowResults(false);
    setSearchResults([]);
    skipSearchRef.current = true;
    const typeToUse: 'movie' | 'tv' = explicitType || searchType;
    try {
      const endpoint = typeToUse === 'tv' ? 'tv' : 'movie';
      const res = await fetch(
        `${TMDB_BASE_URL}/${endpoint}/${id}?api_key=${TMDB_API_KEY}&append_to_response=credits&language=fr-FR`
      );
      const data = await res.json();
      let director = 'Inconnu';
      if (typeToUse === 'tv') {
        if (data.created_by?.length > 0)
          director = data.created_by.map((c: any) => c.name).join(', ');
      } else {
        director = data.credits?.crew?.find((c: any) => c.job === 'Director')?.name || 'Inconnu';
      }
      const genre = data.genres?.[0]?.name || GENRES[0];
      const yearStr = typeToUse === 'tv' ? data.first_air_date : data.release_date;
      const year = yearStr ? parseInt(yearStr.split('-')[0]) : new Date().getFullYear();
      setFormData((prev) => ({
        ...prev,
        title: typeToUse === 'tv' ? data.name : data.title,
        tmdbId: data.id,
        year,
        director,
        posterUrl: data.poster_path ? `${TMDB_IMAGE_URL}${data.poster_path}` : '',
        review: data.overview || '',
        genre,
        mediaType: typeToUse,
        numberOfSeasons: typeToUse === 'tv' ? data.number_of_seasons : undefined,
        tmdbRating: data.vote_average ? Number(data.vote_average.toFixed(1)) : 0,
        runtime: data.runtime || 0,
      }));
    } catch (e) {
      if (import.meta.env.DEV) console.error(e);
    }
    setIsSearching(false);
    setShowResults(false);
  };

  const adaptiveCriteria: AdaptiveRatingCriterion[] = buildCriteriaForProfile(
    profileId,
    criteriaValues,
    customWeights
  );
  const adaptiveWeightedRating = calculateWeightedRating(adaptiveCriteria);

  // Bitter (simple) mode: 4 base criteria, equal weights, simple average.
  const bitterCriteria: AdaptiveRatingCriterion[] = buildCriteriaForProfile('standard', criteriaValues);
  const bitterFinalRating =
    bitterCriteria.length === 0
      ? 0
      : Math.round(
          (bitterCriteria.reduce((s, c) => s + c.value, 0) / bitterCriteria.length) * 10
        ) / 10;

  const setCustomWeight = (key: string, weight: number) => {
    haptics.soft();
    setCustomWeights((prev) => ({ ...prev, [key]: weight }));
  };

  const setCriterionValue = (key: string, value: number) => {
    setCriteriaValues((prev) => ({ ...prev, [key]: Math.min(10, Math.max(0, value)) }));
  };

  const handleSelectProfile = (id: RatingProfileId) => {
    haptics.soft();
    setProfileId(id);
    setProfileManuallySet(true);
    setShowProfilePicker(false);
  };

  const handleSubmit = async () => {
    if (isSaving || !formData.title.trim()) return;
    haptics.medium();
    setIsSaving(true);
    const isWatchlist = mode === 'watchlist';

    let finalAdaptiveRating: AdaptiveRatingData | undefined;
    let finalRatings;
    let finalQualityMetrics = formData.qualityMetrics;

    if (isWatchlist) {
      finalRatings = { story: 0, visuals: 0, acting: 0, sound: 0 };
    } else if (useBitterPlus) {
      // Bitter+ : full adaptive rating with profile, weights, specific criterion.
      const profile = getRatingProfile(profileId);
      const legacyAvg =
        adaptiveCriteria.length > 0
          ? Math.round(
              (adaptiveCriteria.reduce((s, c) => s + c.value, 0) / adaptiveCriteria.length) * 10
            ) / 10
          : 0;
      finalAdaptiveRating = {
        profile: { id: profile.id, label: profile.label, version: ADAPTIVE_RATING_VERSION },
        criteria: adaptiveCriteria,
        weightedRating: adaptiveWeightedRating,
        legacyRating: legacyAvg,
      };
      const byKey = new Map(adaptiveCriteria.map((c) => [c.key, c.value]));
      const scenario = byKey.get('scenario') ?? 5;
      const image = byKey.get('image') ?? 5;
      const interpretation = byKey.get('interpretation') ?? 5;
      const sound = byKey.get('sound') ?? 5;
      // Use the weighted rating for the legacy ratings so display helpers reflect it
      finalRatings = {
        story: adaptiveWeightedRating,
        visuals: adaptiveWeightedRating,
        acting: adaptiveWeightedRating,
        sound: adaptiveWeightedRating,
      };
      // Keep qualityMetrics in sync with the 4 base criteria for backward compat
      finalQualityMetrics = { scenario, acting: interpretation, visual: image, sound };
    } else {
      // Bitter : 4 base criteria, simple average. No adaptiveRating, no profile.
      finalRatings = {
        story: criteriaValues.scenario ?? 5,
        visuals: criteriaValues.image ?? 5,
        acting: criteriaValues.interpretation ?? 5,
        sound: criteriaValues.sound ?? 5,
      };
      finalAdaptiveRating = undefined;
    }
    const finalDateWatched = isWatchlist ? undefined : new Date(selectedDate).getTime();
    if (sharedSpace && currentUserId) {
      try {
        const tmdbDetails =
          formData.tmdbId && formData.mediaType !== 'tv'
            ? await getSharedMovieDetails(formData.tmdbId)
            : {};
        const result = await addMovieToSpace(
          sharedSpace.id,
          {
            tmdb_id: formData.tmdbId,
            title: formData.title,
            director: formData.director,
            year: formData.year,
            genre: formData.genre,
            poster_url: formData.posterUrl,
            status: mode,
            media_type: formData.mediaType,
            number_of_seasons: formData.numberOfSeasons,
            ...tmdbDetails,
          },
          currentUserId
        );
        if (result) {
          haptics.success();
          onSharedMovieAdded?.();
          onClose();
        }
      } catch (err) {
        haptics.error();
        onToast?.(t('addMovie.cannotAddToSpace'));
      } finally {
        setIsSaving(false);
      }
      return;
    }
    onSave({
      ...formData,
      status: mode,
      ratings: finalRatings,
      dateWatched: finalDateWatched,
      qualityMetrics: finalQualityMetrics,
      adaptiveRating: finalAdaptiveRating,
    });
    haptics.success();
    setIsSaving(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />
      <div className="bg-cream dark:bg-[#0c0c0c] w-full sm:max-w-md rounded-t-[3.5rem] sm:rounded-[3.5rem] shadow-2xl dark:shadow-black/60 relative z-10 max-h-[92vh] flex flex-col animate-[springSlideUp_0.5s_cubic-bezier(0.175,0.885,0.32,1.1)] border-t dark:border-white/10 sm:border dark:border-white/10 transition-colors will-change-transform">
        <style>{`
          @keyframes springSlideUp {
            0% { transform: translateY(100%) scale(0.95); opacity: 0; }
            50% { transform: translateY(-2%) scale(1.02); opacity: 1; }
            100% { transform: translateY(0) scale(1); opacity: 1; }
          }
        `}</style>

        <div className="flex justify-between items-center p-8 border-b border-black/5 dark:border-white/10 bg-white dark:bg-[#1a1a1a] shrink-0 transition-colors">
          <div className="min-w-0">
            {sharedSpace && (
              <p className="text-[10px] font-black uppercase tracking-widest text-forest dark:text-lime-500 mb-1 truncate">
                {sharedSpace.name}
              </p>
            )}
            <h2 className="text-2xl font-black tracking-tighter truncate text-charcoal dark:text-white">
              {isEditMode ? t('addMovie.edit') : formData.title || t('addMovie.newVerdict')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-3 bg-stone-100 dark:bg-[#161616] text-stone-500 rounded-full active:scale-90 transition-all ml-4 shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 sm:p-8 space-y-8 no-scrollbar flex-1 pb-32">
          <div className="flex bg-stone-100 dark:bg-[#161616] p-1.5 rounded-full border border-stone-200/50 dark:border-white/5 transition-colors">
            <button
              onClick={() => {
                haptics.soft();
                setMode('watched');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all ${mode === 'watched' ? 'bg-white dark:bg-[#202020] text-charcoal dark:text-white shadow-sm' : 'text-stone-400 dark:text-stone-600'}`}
            >
              <Eye size={16} strokeWidth={2.5} /> {t('addMovie.watched')}
            </button>
            <button
              onClick={() => {
                haptics.soft();
                setMode('watchlist');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all ${mode === 'watchlist' ? 'bg-white dark:bg-[#202020] text-charcoal dark:text-white shadow-sm' : 'text-stone-400 dark:text-stone-600'}`}
            >
              <Clock size={16} strokeWidth={2.5} /> {t('addMovie.toWatch')}
            </button>
          </div>

          {mode === 'watched' && (
            <div className="bg-stone-50 dark:bg-[#161616] border border-stone-100 dark:border-white/5 rounded-3xl p-4 flex items-center justify-between transition-colors">
              <div className="flex items-center gap-3 text-stone-400 dark:text-stone-600">
                <div className="p-2 bg-white dark:bg-[#202020] rounded-xl shadow-sm">
                  <Calendar size={16} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest">{t('addMovie.viewing')}</span>
              </div>
              <input
                type="date"
                value={selectedDate}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => {
                  haptics.soft();
                  setSelectedDate(e.target.value);
                }}
                className="bg-transparent font-black text-sm text-charcoal dark:text-white text-right focus:outline-none uppercase tracking-wide cursor-pointer"
              />
            </div>
          )}

          {isEditMode && (
            <div className="flex gap-4 bg-white dark:bg-[#202020] rounded-[2rem] p-4 border border-stone-100 dark:border-white/10 shadow-sm transition-colors">
              {formData.posterUrl && (
                <div className="w-20 h-28 rounded-2xl overflow-hidden shrink-0 shadow-md">
                  <img src={formData.posterUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <h3 className="font-black text-lg text-charcoal dark:text-white tracking-tight truncate leading-tight">
                  {formData.title}
                </h3>
                <p className="text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-widest mt-1">
                  {formData.director} • {formData.year}
                </p>
              </div>
            </div>
          )}

          {!isEditMode && (
            <div className="space-y-6 relative">
              <div className="group">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600 mb-2 block ml-1">
                  {t('addMovie.searchType')}
                </label>
                <div className="flex bg-stone-100 dark:bg-[#161616] p-1 rounded-2xl mb-4 w-fit transition-colors">
                  <button
                    onClick={() => {
                      haptics.soft();
                      setSearchType('movie');
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${searchType === 'movie' ? 'bg-charcoal dark:bg-[#202020] text-white shadow-sm' : 'text-stone-400 dark:text-stone-600 hover:text-stone-500'}`}
                  >
                    <Film size={12} /> {t('addMovie.movies')}
                  </button>
                  <button
                    onClick={() => {
                      haptics.soft();
                      setSearchType('tv');
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${searchType === 'tv' ? 'bg-charcoal dark:bg-[#202020] text-white shadow-sm' : 'text-stone-400 dark:text-stone-600 hover:text-stone-500'}`}
                  >
                    <Tv size={12} /> {t('addMovie.series')}
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    className="w-full bg-white dark:bg-[#161616] border-2 border-stone-100 dark:border-white/5 focus:border-charcoal dark:focus:border-white/20 p-5 rounded-2xl font-black text-xl outline-none transition-all shadow-sm pr-12 text-charcoal dark:text-white placeholder:text-stone-300 dark:placeholder:text-stone-700"
                    placeholder={searchType === 'tv' ? t('addMovie.seriesName') : t('addMovie.movieTitle')}
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 text-stone-300 dark:text-stone-700">
                    {isSearching ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <Search size={20} />
                    )}
                  </div>
                </div>

                {showResults && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-white dark:bg-[#1a1a1a] border border-stone-100 dark:border-white/10 rounded-3xl shadow-2xl dark:shadow-black/60 overflow-hidden transition-colors">
                    {searchResults.length > 0
                      ? searchResults.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => handleSelectTMDBMovie(m.id)}
                            className="w-full flex items-center gap-4 p-4 hover:bg-stone-50 dark:hover:bg-[#252525] border-b border-stone-50 dark:border-white/5 last:border-0 transition-colors text-left"
                          >
                            <div className="w-10 h-14 bg-stone-100 dark:bg-[#202020] rounded-lg shrink-0 overflow-hidden">
                              <img
                                src={`${TMDB_IMAGE_URL}${m.poster_path}`}
                                className="w-full h-full object-cover"
                                alt=""
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-black text-sm text-charcoal dark:text-white truncate">
                                {m.title}
                              </p>
                              <p className="text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-widest">
                                {m.release_date?.split('-')[0]}
                              </p>
                            </div>
                          </button>
                        ))
                      : !isSearching &&
                        formData.title.trim().length >= 2 && (
                          <div className="p-10 text-center bg-stone-50/50 dark:bg-[#161616]/50 transition-colors">
                            <p className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-700">
                              {t('addMovie.noResults')}
                            </p>
                          </div>
                        )}
                  </div>
                )}
              </div>
            </div>
          )}

          {mode === 'watched' && !sharedSpace && (
            <div className="space-y-8 animate-[fadeIn_0.3s_ease-out]">
              {/* Bitter / Bitter+ mode switch — Bitter is the default, Bitter+ opens the advanced grid */}
              <div className="bg-white dark:bg-[#1a1a1a] border border-stone-100 dark:border-white/10 rounded-[2rem] p-2 shadow-sm">
                <div className="flex items-stretch gap-1" role="tablist" aria-label="Mode de notation">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!useBitterPlus}
                    onClick={() => {
                      if (useBitterPlus) {
                        haptics.soft();
                        setUseBitterPlus(false);
                      }
                    }}
                    className={`flex-1 py-3 px-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest transition-all active:scale-[0.98] ${
                      !useBitterPlus
                        ? 'bg-charcoal text-white dark:bg-bitter-lime dark:text-charcoal shadow-md'
                        : 'bg-transparent text-stone-400 dark:text-stone-500'
                    }`}
                  >
                    {t('addMovie.bitterMode')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={useBitterPlus}
                    onClick={() => {
                      if (!useBitterPlus) {
                        haptics.soft();
                        setUseBitterPlus(true);
                      }
                    }}
                    className={`flex-1 py-3 px-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest transition-all active:scale-[0.98] ${
                      useBitterPlus
                        ? 'bg-charcoal text-white dark:bg-bitter-lime dark:text-charcoal shadow-md'
                        : 'bg-transparent text-stone-400 dark:text-stone-500'
                    }`}
                  >
                    {t('addMovie.bitterPlusMode')}
                  </button>
                </div>
                <p className="text-[11px] font-medium text-stone-500 dark:text-stone-500 mt-3 mb-1 ml-2 leading-snug">
                  {useBitterPlus ? t('addMovie.bitterPlusModeHint') : t('addMovie.bitterModeHint')}
                </p>
              </div>

              {useBitterPlus ? (
                <div className="space-y-8">
                  <AdaptiveRatingSection
                    profileId={profileId}
                    profileLabel={getRatingProfile(profileId).label}
                    criteria={adaptiveCriteria}
                    weightedRating={adaptiveWeightedRating}
                    customWeights={customWeights}
                    onChange={setCriterionValue}
                    onChangeCustomWeight={setCustomWeight}
                    onOpenProfilePicker={() => {
                      haptics.soft();
                      setShowProfilePicker(true);
                    }}
                  />
                  <div className="bg-charcoal dark:bg-[#1a1a1a] text-white p-6 sm:p-8 rounded-[2rem] shadow-xl transition-all">
                    <div className="flex justify-between items-start gap-3 mb-2">
                      <div className="flex items-start gap-3 min-w-0">
                        <Smartphone size={20} className="text-bitter-lime shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">
                            {t('addMovie.distraction')}
                          </p>
                          <p className="text-[11px] font-medium text-stone-300 dark:text-stone-500 mt-1 leading-snug">
                            {t('addMovie.distractionDesc')}
                          </p>
                        </div>
                      </div>
                      <span className="text-2xl font-black text-bitter-lime shrink-0">
                        {formData.smartphoneFactor || 0}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="10"
                      value={formData.smartphoneFactor || 0}
                      onChange={(e) => {
                        haptics.soft();
                        setFormData({ ...formData, smartphoneFactor: Number(e.target.value) });
                      }}
                      className="w-full h-2 bg-white/10 rounded-full appearance-none slider mt-4"
                    />
                  </div>

                  {/* Hype */}
                  <div className="bg-white dark:bg-[#202020] rounded-[2rem] p-5 border border-stone-100 dark:border-white/10 shadow-sm transition-colors">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-forest/10 dark:bg-bitter-lime/10 rounded-xl">
                          <Zap size={16} className="text-forest dark:text-bitter-lime" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">
                            {t('addMovie.hype')}
                          </p>
                          <p className="text-[9px] font-bold text-stone-300 dark:text-stone-600">
                            {t('addMovie.hypeDesc')}
                          </p>
                        </div>
                      </div>
                      <span className="text-2xl font-black text-charcoal dark:text-white">
                        {formData.hype ?? 5}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="1"
                      value={formData.hype ?? 5}
                      onChange={(e) => {
                        haptics.soft();
                        setFormData({ ...formData, hype: Number(e.target.value) });
                      }}
                      className="w-full h-2 bg-stone-100 dark:bg-white/10 rounded-full appearance-none slider"
                    />
                    <div className="flex justify-between mt-2">
                      <span className="text-[9px] font-bold text-stone-300 dark:text-stone-600">
                        {t('addMovie.noExpectations')}
                      </span>
                      <span className="text-[9px] font-bold text-stone-300 dark:text-stone-600">
                        {t('addMovie.megaHype')}
                      </span>
                    </div>
                  </div>

                  {/* Pacing */}
                  <div className="bg-white dark:bg-[#202020] rounded-[2rem] p-5 border border-stone-100 dark:border-white/10 shadow-sm transition-colors">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-forest/10 dark:bg-bitter-lime/10 rounded-xl">
                        <Gauge size={16} className="text-forest dark:text-bitter-lime" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">
                          {t('addMovie.rhythm')}
                        </p>
                        <p className="text-[9px] font-bold text-stone-300 dark:text-stone-600">
                          {t('addMovie.rhythmDesc')}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          ['slow', Hourglass, 'addMovie.slow'],
                          ['perfect', Equal, 'addMovie.perfect'],
                          ['fast', FastForward, 'addMovie.fast'],
                        ] as const
                      ).map(([val, Icon, labelKey]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            haptics.soft();
                            setFormData({ ...formData, pacing: val });
                          }}
                          className={`py-3 rounded-xl text-center transition-all flex flex-col items-center gap-1.5 ${
                            formData.pacing === val
                              ? 'bg-charcoal text-white dark:bg-bitter-lime/15 dark:text-bitter-lime'
                              : 'bg-stone-50 dark:bg-[#161616] text-stone-400 border border-stone-100 dark:border-white/5'
                          }`}
                        >
                          <Icon size={18} strokeWidth={2.25} />
                          <div className="text-[9px] font-black uppercase tracking-wider">
                            {t(labelKey)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <VibeBox
                      icon={<Heart size={14} />}
                      label={t('addMovie.emotion')}
                      value={formData.vibe?.emotion || 5}
                      onChange={(v) =>
                        setFormData({ ...formData, vibe: { ...formData.vibe!, emotion: v } })
                      }
                    />
                    <VibeBox
                      icon={<Zap size={14} />}
                      label={t('addMovie.tension')}
                      value={formData.vibe?.tension || 5}
                      onChange={(v) =>
                        setFormData({ ...formData, vibe: { ...formData.vibe!, tension: v } })
                      }
                    />
                    <VibeBox
                      icon={<Smile size={14} />}
                      label={t('addMovie.fun')}
                      value={formData.vibe?.fun || 5}
                      onChange={(v) =>
                        setFormData({ ...formData, vibe: { ...formData.vibe!, fun: v } })
                      }
                    />
                    <VibeBox
                      icon={<BrainCircuit size={14} />}
                      label={t('addMovie.cerebral')}
                      value={formData.vibe?.story || 5}
                      onChange={(v) =>
                        setFormData({ ...formData, vibe: { ...formData.vibe!, story: v } })
                      }
                    />
                  </div>
                </div>
              ) : (
                <BitterRatingSection
                  criteria={bitterCriteria}
                  finalRating={bitterFinalRating}
                  onChange={setCriterionValue}
                  onSwitchToBitterPlus={() => {
                    haptics.soft();
                    setUseBitterPlus(true);
                  }}
                />
              )}

              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600 block ml-1">
                  {t('addMovie.myReview')}
                </label>
                <textarea
                  className="w-full bg-white dark:bg-[#161616] border border-stone-100 dark:border-white/10 p-6 rounded-[2rem] font-medium text-sm outline-none focus:border-stone-200 dark:focus:border-white/30 transition-all min-h-[120px] resize-none shadow-sm dark:text-white placeholder:text-stone-300 dark:placeholder:text-stone-700"
                  placeholder={t('addMovie.reviewPlaceholder')}
                  value={formData.comment || ''}
                  onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-8 border-t border-black/5 dark:border-white/10 bg-white dark:bg-[#1a1a1a] rounded-b-[3.5rem] shrink-0 transition-colors">
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="w-full bg-charcoal dark:bg-forest text-white py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] active:scale-95 transition-all flex items-center justify-center gap-3 shadow-xl disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : t('addMovie.confirm')}
          </button>
        </div>
      </div>

      {showProfilePicker && (
        <ProfilePicker
          currentProfileId={profileId}
          onSelect={handleSelectProfile}
          onClose={() => setShowProfilePicker(false)}
        />
      )}
    </div>
  );
};

// Mapping weight → pips: Essentiel ●●●, Important ●●○, Standard ●○○, Secondaire ○○○
const weightToPipCount = (weight: number): number =>
  weight >= 1.7 ? 3 : weight >= 1.3 ? 2 : weight >= 0.9 ? 1 : 0;

const PIP_A11Y_LABEL: Record<AdaptiveRatingCriterion['weightLabel'], string> = {
  Essentiel: 'Influence forte dans la note finale',
  Important: 'Influence moyenne dans la note finale',
  Standard: 'Influence normale dans la note finale',
  Secondaire: 'Influence légère dans la note finale',
};

const WeightPips: React.FC<{
  weight: number;
  weightLabel?: AdaptiveRatingCriterion['weightLabel'];
  variant?: 'lime' | 'mono';
  size?: 'sm' | 'md';
}> = ({ weight, weightLabel, variant = 'lime', size = 'md' }) => {
  const filled = weightToPipCount(weight);
  const filledClass =
    variant === 'mono' ? 'bg-charcoal dark:bg-white' : 'bg-bitter-lime dark:bg-bitter-lime';
  const emptyClass =
    variant === 'mono'
      ? 'bg-stone-300 dark:bg-stone-700'
      : 'bg-stone-200 dark:bg-white/15';
  const dot = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';
  return (
    <span
      className="inline-flex items-center gap-1 shrink-0"
      role="img"
      aria-label={weightLabel ? PIP_A11Y_LABEL[weightLabel] : undefined}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`${dot} rounded-full ${i < filled ? filledClass : emptyClass}`}
        />
      ))}
    </span>
  );
};

const BitterRatingSection: React.FC<{
  criteria: AdaptiveRatingCriterion[];
  finalRating: number;
  onChange: (key: string, value: number) => void;
  onSwitchToBitterPlus: () => void;
}> = ({ criteria, finalRating, onChange, onSwitchToBitterPlus }) => {
  const [showFormulaHelp, setShowFormulaHelp] = useState(false);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600 ml-1 mb-3">
          Critères de notation
        </p>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {criteria.map((c) => (
            <AdaptiveCriterionStepper key={c.key} criterion={c} onChange={onChange} hideImportance />
          ))}
        </div>
      </div>

      {/* Final rating (simple average) */}
      <div className="bg-charcoal dark:bg-[#1a1a1a] text-white rounded-[2rem] p-6 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">
            Note finale
          </p>
          <span className="text-5xl font-black text-bitter-lime tracking-tighter shrink-0">
            {finalRating.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Discreet upgrade CTA */}
      <button
        type="button"
        onClick={onSwitchToBitterPlus}
        className="w-full bg-white dark:bg-[#1a1a1a] border border-stone-100 dark:border-white/10 rounded-2xl p-4 text-left active:scale-[0.98] transition-all flex items-center justify-between gap-3 shadow-sm"
      >
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-charcoal dark:text-white">
            Passer en Bitter+
          </p>
          <p className="text-[11px] font-medium text-stone-500 dark:text-stone-500 mt-1 leading-snug">
            Une grille adaptée au type d’expérience du film, avec profil et critères renforcés.
          </p>
        </div>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-full bg-stone-100 dark:bg-[#252525] text-charcoal dark:text-white">
          Activer
        </span>
      </button>

      {/* Formula help */}
      <div className="bg-stone-50 dark:bg-[#161616] border border-stone-100 dark:border-white/5 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => {
            haptics.soft();
            setShowFormulaHelp((v) => !v);
          }}
          className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-stone-100 dark:active:bg-[#1f1f1f] transition-colors"
        >
          <span className="text-[11px] font-black uppercase tracking-widest text-charcoal dark:text-white">
            Comment est calculée la note&nbsp;?
          </span>
          <span className="text-charcoal dark:text-white text-lg leading-none">
            {showFormulaHelp ? '−' : '+'}
          </span>
        </button>
        {showFormulaHelp && (
          <div className="px-4 pb-4 pt-1 text-[12px] leading-relaxed text-stone-600 dark:text-stone-400 space-y-2">
            <p>La note finale est la moyenne des 4 critères.</p>
            <p>
              Chaque critère compte autant : <span className="font-bold text-charcoal dark:text-white">Scénario</span>,{' '}
              <span className="font-bold text-charcoal dark:text-white">Image</span>,{' '}
              <span className="font-bold text-charcoal dark:text-white">Interprétation</span> et{' '}
              <span className="font-bold text-charcoal dark:text-white">Sonore</span>.
            </p>
            <p className="text-[11px] text-stone-500 dark:text-stone-500">
              Pour adapter le poids des critères au type de film, passe en Bitter+.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

const CustomWeightRow: React.FC<{
  label: string;
  selectedWeight: number;
  onSelect: (weight: number) => void;
}> = ({ label, selectedWeight, onSelect }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-[11px] font-black uppercase tracking-widest text-charcoal dark:text-white leading-tight flex-1 min-w-0 break-words">
      {label}
    </span>
    <div className="inline-flex items-center gap-1 shrink-0">
      {CUSTOM_WEIGHT_LEVELS.map((opt) => {
        const isSelected = Math.abs(selectedWeight - opt.weight) < 0.001;
        return (
          <button
            key={opt.label}
            type="button"
            aria-label={`Définir comme ${opt.label.toLowerCase()}`}
            aria-pressed={isSelected}
            onClick={() => onSelect(opt.weight)}
            className={`h-8 px-2 rounded-lg flex items-center justify-center transition-all active:scale-90 border ${
              isSelected
                ? 'bg-charcoal text-white border-charcoal dark:bg-bitter-lime/15 dark:border-bitter-lime/40'
                : 'bg-stone-50 dark:bg-[#161616] border-stone-200 dark:border-white/5'
            }`}
          >
            <WeightPips
              weight={opt.weight}
              weightLabel={opt.label}
              variant="lime"
              size="sm"
            />
          </button>
        );
      })}
    </div>
  </div>
);

const AdaptiveRatingSection: React.FC<{
  profileId: RatingProfileId;
  profileLabel: string;
  criteria: AdaptiveRatingCriterion[];
  weightedRating: number;
  customWeights: Record<string, number>;
  onChange: (key: string, value: number) => void;
  onChangeCustomWeight: (key: string, weight: number) => void;
  onOpenProfilePicker: () => void;
}> = ({
  profileId,
  profileLabel,
  criteria,
  weightedRating,
  customWeights,
  onChange,
  onChangeCustomWeight,
  onOpenProfilePicker,
}) => {
  const [showFormulaHelp, setShowFormulaHelp] = useState(false);
  const base = criteria.filter((c) => c.group === 'base');
  const specific = criteria.filter((c) => c.group === 'specific');
  const isCustom = profileId === 'custom';
  const reinforcedLabels = criteria
    .filter((c) => c.weightLabel === 'Essentiel' || c.weightLabel === 'Important')
    .map((c) => c.label);

  return (
    <div className="space-y-6">
      {/* Profile header */}
      <div className="bg-white dark:bg-[#202020] border border-stone-100 dark:border-white/10 rounded-[2rem] p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600">
              Profil de notation
            </p>
            <p className="text-xl font-black text-charcoal dark:text-white tracking-tight mt-1">
              {profileLabel}
            </p>
            <p className="text-[11px] font-medium text-stone-500 dark:text-stone-500 mt-2 leading-snug">
              {isCustom
                ? 'Choisis les critères qui comptent le plus dans ta manière de noter ce film.'
                : 'La grille est adaptée automatiquement au type d’expérience du film, mais tu peux la changer.'}
            </p>
            {!isCustom && reinforcedLabels.length > 0 && (
              <div className="mt-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600">
                  Critères renforcés
                </p>
                <p className="text-[12px] font-bold text-charcoal dark:text-white mt-0.5 leading-snug">
                  {reinforcedLabels.join(' · ')}
                </p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onOpenProfilePicker}
            className="shrink-0 text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-full bg-stone-100 dark:bg-[#161616] text-charcoal dark:text-white border border-stone-200 dark:border-white/5 active:scale-95 transition-all"
          >
            Changer
          </button>
        </div>

        {isCustom && (
          <div className="mt-5 pt-5 border-t border-stone-100 dark:border-white/5 space-y-3">
            {base.map((c) => (
              <CustomWeightRow
                key={c.key}
                label={c.label}
                selectedWeight={customWeights[c.key] ?? 1.0}
                onSelect={(w) => onChangeCustomWeight(c.key, w)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Base criteria */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600 ml-1 mb-3">
          Critères de notation
        </p>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {base.map((c) => (
            <AdaptiveCriterionStepper key={c.key} criterion={c} onChange={onChange} />
          ))}
        </div>
      </div>

      {/* Specific criterion */}
      {specific.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600 ml-1">
            Critère spécifique
          </p>
          <p className="text-[11px] font-medium text-stone-500 dark:text-stone-500 mt-1 ml-1 mb-3 leading-snug">
            L’élément clé pour évaluer ce type de film.
          </p>
          <div className="grid grid-cols-1 gap-3">
            {specific.map((c) => (
              <AdaptiveCriterionStepper key={c.key} criterion={c} onChange={onChange} showDescription />
            ))}
          </div>
        </div>
      )}

      {/* Final weighted rating */}
      <div className="bg-charcoal dark:bg-[#1a1a1a] text-white rounded-[2rem] p-6 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">
            Note finale
          </p>
          <span className="text-5xl font-black text-bitter-lime tracking-tighter shrink-0">
            {weightedRating.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Formula help (collapsible) */}
      <div className="bg-stone-50 dark:bg-[#161616] border border-stone-100 dark:border-white/5 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => {
            haptics.soft();
            setShowFormulaHelp((v) => !v);
          }}
          className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-stone-100 dark:active:bg-[#1f1f1f] transition-colors"
        >
          <span className="text-[11px] font-black uppercase tracking-widest text-charcoal dark:text-white">
            Comment est calculée la note&nbsp;?
          </span>
          <span className="text-charcoal dark:text-white text-lg leading-none">
            {showFormulaHelp ? '−' : '+'}
          </span>
        </button>
        {showFormulaHelp && (
          <div className="px-4 pb-4 pt-1 text-[12px] leading-relaxed text-stone-600 dark:text-stone-400 space-y-3">
            <p>
              La note finale est une moyenne pondérée. Chaque critère n’a pas toujours le même
              poids selon le profil de notation choisi.
            </p>
            <p>Les points indiquent l’influence du critère dans la note finale&nbsp;:</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <WeightPips weight={1.8} variant="mono" />
                  <span className="font-bold text-charcoal dark:text-white">Critère essentiel</span>
                </span>
                <span className="font-black text-charcoal dark:text-white tabular-nums">×1.8</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <WeightPips weight={1.4} variant="mono" />
                  <span className="font-bold text-charcoal dark:text-white">Critère important</span>
                </span>
                <span className="font-black text-charcoal dark:text-white tabular-nums">×1.4</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <WeightPips weight={1.0} variant="mono" />
                  <span className="font-bold text-charcoal dark:text-white">Critère standard</span>
                </span>
                <span className="font-black text-charcoal dark:text-white tabular-nums">×1.0</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <WeightPips weight={0.7} variant="mono" />
                  <span className="font-bold text-charcoal dark:text-white">Critère secondaire</span>
                </span>
                <span className="font-black text-charcoal dark:text-white tabular-nums">×0.7</span>
              </div>
            </div>
            <p className="text-[11px] text-stone-500 dark:text-stone-500">
              Les poids sont appliqués automatiquement selon le profil de notation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

const AdaptiveCriterionStepper: React.FC<{
  criterion: AdaptiveRatingCriterion;
  onChange: (key: string, value: number) => void;
  showDescription?: boolean;
  hideImportance?: boolean;
}> = ({ criterion, onChange, showDescription, hideImportance }) => {
  const { key, label, value, weight, weightLabel, description } = criterion;
  return (
    <div className="bg-white dark:bg-[#1a1a1a] rounded-[1.5rem] p-3 sm:p-4 border border-stone-100 dark:border-white/10 flex flex-col h-full shadow-sm">
      {/* Top row: label (full width, never truncated) + value */}
      <div className="flex justify-between items-start gap-2">
        <span className="text-[10px] sm:text-[11px] font-black text-charcoal dark:text-white uppercase tracking-widest leading-tight break-words flex-1 min-w-0">
          {label}
        </span>
        <span className="text-2xl font-black tracking-tighter text-charcoal dark:text-white shrink-0 leading-none tabular-nums">
          {value.toFixed(1)}
        </span>
      </div>
      {/* Importance pips (hidden in Bitter mode) */}
      {!hideImportance && (
        <div className="mt-2">
          <WeightPips weight={weight} weightLabel={weightLabel} size="sm" />
        </div>
      )}
      {/* Optional description (specific criteria) */}
      {showDescription && description && (
        <p className="text-[11px] leading-snug text-stone-500 dark:text-stone-400 mt-3">
          {description}
        </p>
      )}
      {/* Stepper control */}
      <div className="flex items-center justify-between gap-1 mt-3 pt-3 border-t border-stone-100 dark:border-white/5">
        <button
          type="button"
          aria-label="Diminuer la note"
          onClick={() => {
            haptics.soft();
            onChange(key, Math.max(0, value - 0.5));
          }}
          className="w-8 h-8 rounded-xl bg-stone-50 dark:bg-[#161616] border border-stone-200 dark:border-white/5 flex items-center justify-center active:scale-90 transition-all shadow-sm shrink-0"
        >
          <Minus size={12} strokeWidth={3} className="text-charcoal dark:text-white" />
        </button>
        <input
          type="number"
          inputMode="decimal"
          step="0.5"
          min="0"
          max="10"
          aria-label={`Note pour ${label}`}
          value={value === 0 ? '' : value}
          placeholder="0"
          onChange={(e) => {
            const val = parseFloat(e.target.value.replace(',', '.'));
            if (!isNaN(val)) onChange(key, Math.min(10, Math.max(0, val)));
            else if (e.target.value === '') onChange(key, 0);
          }}
          className="flex-1 min-w-0 text-center text-base font-bold tracking-tight text-stone-500 dark:text-stone-400 bg-transparent outline-none py-0 appearance-none border-none ring-0 focus:ring-0"
        />
        <button
          type="button"
          aria-label="Augmenter la note"
          onClick={() => {
            haptics.soft();
            onChange(key, Math.min(10, value + 0.5));
          }}
          className="w-8 h-8 rounded-xl flex items-center justify-center active:scale-90 transition-all shadow-md shrink-0 bg-bitter-lime text-charcoal"
        >
          <Plus size={12} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
};

const ProfilePicker: React.FC<{
  currentProfileId: RatingProfileId;
  onSelect: (id: RatingProfileId) => void;
  onClose: () => void;
}> = ({ currentProfileId, onSelect, onClose }) => (
  <div
    className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
    onClick={onClose}
  >
    <div className="absolute inset-0 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm" />
    <div
      onClick={(e) => e.stopPropagation()}
      className="relative bg-cream dark:bg-[#0c0c0c] w-full sm:max-w-sm rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl max-h-[80vh] overflow-y-auto border-t dark:border-white/10 sm:border dark:border-white/10"
    >
      <div className="p-6 border-b border-black/5 dark:border-white/10 flex items-center justify-between">
        <h3 className="font-black text-lg text-charcoal dark:text-white tracking-tight">
          Choisir un profil
        </h3>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-stone-100 dark:bg-[#161616] flex items-center justify-center active:scale-90 transition-all"
        >
          <X size={16} className="text-charcoal dark:text-white" />
        </button>
      </div>
      <div className="p-3 space-y-1">
        {PROFILE_OPTIONS.map((opt) => {
          const selected = opt.id === currentProfileId;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelect(opt.id)}
              className={`w-full text-left px-4 py-4 rounded-2xl font-black text-sm transition-all active:scale-[0.98] ${
                selected
                  ? 'bg-charcoal text-white dark:bg-bitter-lime dark:text-charcoal'
                  : 'bg-white dark:bg-[#1a1a1a] text-charcoal dark:text-white border border-stone-100 dark:border-white/10'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  </div>
);

const VibeBox: React.FC<{
  icon: any;
  label: string;
  value: number;
  onChange: (v: number) => void;
}> = ({ icon, label, value, onChange }) => (
  <div className="bg-white dark:bg-[#1a1a1a] p-4 rounded-[1.5rem] border border-stone-100 dark:border-white/10 flex flex-col items-center gap-2 shadow-sm transition-colors">
    <div className="text-stone-300 dark:text-stone-700">{icon}</div>
    <span className="text-[8px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 text-center leading-none truncate w-full">
      {label}
    </span>
    <div className="flex items-center justify-between gap-1 w-full mt-1">
      <button
        onClick={() => {
          haptics.soft();
          onChange(Math.max(0, value - 1));
        }}
        className="text-stone-300 dark:text-stone-700 hover:text-charcoal dark:hover:text-white p-1 active:scale-90 transition-colors"
      >
        <Minus size={10} strokeWidth={4} />
      </button>
      <span className="text-base font-black text-charcoal dark:text-white leading-none">
        {value}
      </span>
      <button
        onClick={() => {
          haptics.soft();
          onChange(Math.min(10, value + 1));
        }}
        className="text-stone-300 dark:text-stone-700 hover:text-charcoal dark:hover:text-white p-1 active:scale-90 transition-colors"
      >
        <Plus size={10} strokeWidth={4} />
      </button>
    </div>
  </div>
);

export default AddMovieModal;
