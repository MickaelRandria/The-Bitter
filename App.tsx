import {
  Plus,
  Search,
  SlidersHorizontal,
  X,
  LayoutGrid,
  PieChart,
  Clock,
  CheckCircle2,
  Sparkles,
  PiggyBank,
  Radar,
  Activity,
  Heart,
  User,
  LogOut,
  Clapperboard,
  Wand2,
  CalendarDays,
  BarChart3,
  Hourglass,
  ArrowDown,
  Film,
  FlaskConical,
  Target,
  Instagram,
  Loader2,
  Star,
  Tags,
  ChevronLeft,
  ChevronRight,
  MessageSquareText,
  Users,
  Globe,
  Info,
  Check,
  Shuffle,
  Trash2,
  Filter,
} from 'lucide-react';
import React, { useState, useEffect, useMemo, lazy, Suspense, memo, useRef } from 'react';
import { GENRES, TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from './constants';
import { getMovieDetailsForAdd } from './services/tmdb';
import { Movie, MovieFormData, MovieStatus, UserProfile } from './types';
import { RELEASE_HISTORY } from './constants/changelog';
import { haptics } from './utils/haptics';
import {
  getSmartTonightPick,
  filterByMoodPreset,
  sortByVibeAxis,
  MoodPreset,
  VibeAxis,
  MOOD_PRESETS,
} from './utils/tonightPick';
import MoodPicker from './components/MoodPicker';
import { initAnalytics } from './utils/analytics';
import MovieCard from './components/MovieCard';
import WelcomePage from './components/WelcomePage';
import ConsentModal from './components/ConsentModal';
import { SharedSpace, supabase, getUserSpaces } from './services/supabase';
import AuthScreen from './components/AuthScreen';
import ThemeToggle from './components/ThemeToggle';
import NotificationCenter from './components/NotificationCenter';
import { ContextualTooltip } from './components/ContextualTooltip';
import { ProfileCompletionWidget } from './components/ProfileCompletionWidget';
import { AIUnlockWidget } from './components/AIUnlockWidget';
import DirectorMoviesModal from './components/DirectorMoviesModal';

// Lazy loading components
const AnalyticsView = lazy(() => import('./components/AnalyticsView'));
const DiscoverView = lazy(() => import('./components/DiscoverView'));
const CalendarView = lazy(() => import('./components/CalendarView'));
const MovieDeck = lazy(() => import('./components/MovieDeck'));
const AddMovieModal = lazy(() => import('./components/AddMovieModal'));
const ChangelogModal = lazy(() => import('./components/ChangelogModal'));
const OnboardingModal = lazy(() => import('./components/OnboardingModal'));
const CineAssistant = lazy(() => import('./components/CineAssistant'));
const MovieDetailModal = lazy(() => import('./components/MovieDetailModal'));
const SharedSpacesModal = lazy(() => import('./components/SharedSpacesModal'));
const SharedSpaceView = lazy(() => import('./components/SharedSpaceView'));
const NewFeaturesModal = lazy(() => import('./components/NewFeaturesModal'));
const ProfileModal = lazy(() => import('./components/ProfileModal'));
const RecommendationsModal = lazy(() => import('./components/RecommendationsModal'));

type SortOption = 'Date' | 'Rating' | 'Year' | 'Title';
type ViewMode = 'Feed' | 'Analytics' | 'Discover' | 'Calendar' | 'Deck' | 'SharedSpace';
type FeedTab = 'history' | 'queue';

const BottomNav = memo(
  ({
    viewMode,
    setViewMode,
    setIsModalOpen,
    feedTab,
    setInitialStatusForAdd,
    movieCount,
  }: {
    viewMode: ViewMode;
    setViewMode: (v: ViewMode) => void;
    setIsModalOpen: (o: boolean) => void;
    feedTab: FeedTab;
    setInitialStatusForAdd: (s: MovieStatus) => void;
    movieCount: number;
  }) => {
    const navItemClass = (isActive: boolean) =>
      `p-3 rounded-full transition-all duration-300 ${isActive ? 'bg-sand dark:bg-[#1a1a1a] text-charcoal dark:text-white shadow-sm opacity-100 scale-105' : 'text-stone-300 dark:text-stone-600 opacity-50 hover:opacity-100'}`;

    return (
      <nav
        className="fixed left-6 right-6 z-50 max-w-sm mx-auto"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)' }}
      >
        <div
          className="bg-white/95 dark:bg-black/95 backdrop-blur-2xl border border-white/20 dark:border-white/10 shadow-2xl rounded-[2.5rem] px-6 py-3.5 flex justify-between items-center transition-colors"
          style={{ willChange: 'transform' }}
        >
          <button
            onClick={() => {
              haptics.soft();
              setViewMode('Feed');
            }}
            className={navItemClass(viewMode === 'Feed')}
          >
            <LayoutGrid size={22} />
          </button>
          <button
            onClick={() => {
              haptics.soft();
              setViewMode('Discover');
            }}
            className={navItemClass(viewMode === 'Discover')}
          >
            <Clapperboard size={22} />
          </button>
          <button
            onClick={() => {
              haptics.medium();
              setInitialStatusForAdd(feedTab === 'queue' ? 'watchlist' : 'watched');
              setIsModalOpen(true);
            }}
            className={`bg-forest text-white p-4.5 rounded-full shadow-xl shadow-forest/20 mx-2 active:scale-90 transition-transform duration-150 ${movieCount < 3 ? 'animate-pulse ring-4 ring-forest/20' : ''}`}
          >
            <Plus size={24} strokeWidth={3} />
          </button>
          <button
            onClick={() => {
              haptics.soft();
              setViewMode('Analytics');
            }}
            className={navItemClass(viewMode === 'Analytics')}
          >
            <PieChart size={22} />
          </button>
          <button
            onClick={() => {
              haptics.soft();
              setViewMode('Calendar');
            }}
            className={navItemClass(viewMode === 'Calendar')}
          >
            <CalendarDays size={22} />
          </button>
        </div>
      </nav>
    );
  }
);

const App: React.FC = () => {
  const STORAGE_KEY = 'the_bitter_profiles_v2';
  const LAST_PROFILE_ID_KEY = 'THE_BITTER_LAST_PROFILE_ID';
  const LAST_SEEN_VERSION_KEY = 'the_bitter_last_seen_version';
  const SEEN_TOOLTIPS_KEY = 'the_bitter_seen_tooltips';

  const [session, setSession] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('Feed');
  const [feedTab, setFeedTab] = useState<FeedTab>('history');
  const [showFeedStats, setShowFeedStats] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('Date');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [editingMovie, setEditingMovie] = useState<Movie | null>(null);
  const [tmdbIdToLoad, setTmdbIdToLoad] = useState<number | null>(null);
  const [initialStatusForAdd, setInitialStatusForAdd] = useState<MovieStatus>('watched');
  const [watchlistGenreFilter, setWatchlistGenreFilter] = useState<string>('all');
  const [tonightPick, setTonightPick] = useState<Movie | null>(null);
  const [isPickAnimating, setIsPickAnimating] = useState(false);
  const [historyGenreFilter, setHistoryGenreFilter] = useState<string>('all');
  const [selectedMood, setSelectedMood] = useState<MoodPreset>(null);
  const [activeVibeSort, setActiveVibeSort] = useState<VibeAxis | null>(null);
  const [minRatingFilter, setMinRatingFilter] = useState(0);
  const [yearMinFilter, setYearMinFilter] = useState<number | null>(null);
  const [yearMaxFilter, setYearMaxFilter] = useState<number | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [mediaTypeToLoad, setMediaTypeToLoad] = useState<'movie' | 'tv'>('movie');
  const [previewTmdbId, setPreviewTmdbId] = useState<number | null>(null);
  const [previewMediaType, setPreviewMediaType] = useState<'movie' | 'tv'>('movie');
  const [previewDirector, setPreviewDirector] = useState<{ name: string; id?: number } | null>(
    null
  );
  const [showSharedSpaces, setShowSharedSpaces] = useState(false);
  const [activeSharedSpace, setActiveSharedSpace] = useState<SharedSpace | null>(null);
  const [sharedSpaceRefreshTrigger, setSharedSpaceRefreshTrigger] = useState(0);
  const [mySpaces, setMySpaces] = useState<SharedSpace[]>([]);
  const [showCalibration, setShowCalibration] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showConsent, setShowConsent] = useState(true);
  const [showCineAssistant, setShowCineAssistant] = useState(false);
  const [deckAdvanceTrigger, setDeckAdvanceTrigger] = useState(0);
  const [showNewFeatures, setShowNewFeatures] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    title: string;
    timeoutId: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showRecommendationsModal, setShowRecommendationsModal] = useState(false);
  const [seenTooltips, setSeenTooltips] = useState<string[]>([]);
  const [activeTooltip, setActiveTooltip] = useState<{
    id: string;
    title: string;
    content: React.ReactNode;
  } | null>(null);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) || null,
    [profiles, activeProfileId]
  );

  useEffect(() => {
    const savedProfiles = localStorage.getItem(STORAGE_KEY);
    let loadedProfiles: UserProfile[] = [];
    if (savedProfiles) {
      try {
        loadedProfiles = JSON.parse(savedProfiles);
        setProfiles(loadedProfiles);
      } catch (e) {
        if (import.meta.env.DEV) console.error('Error loading profiles', e);
      }
    }
    const lastProfileId = localStorage.getItem(LAST_PROFILE_ID_KEY);
    if (lastProfileId) {
      const exists = loadedProfiles.some((p) => p.id === lastProfileId);
      if (exists) {
        setActiveProfileId(lastProfileId);
        setShowWelcome(false);
        setViewMode('Feed');
      } else {
        localStorage.removeItem(LAST_PROFILE_ID_KEY);
      }
    }
    const lastSeenVersion = localStorage.getItem(LAST_SEEN_VERSION_KEY);
    if (lastSeenVersion !== RELEASE_HISTORY[0].version) {
      setShowNewFeatures(true);
    }

    const savedTooltips = localStorage.getItem(SEEN_TOOLTIPS_KEY);
    if (savedTooltips) {
      try {
        setSeenTooltips(JSON.parse(savedTooltips));
      } catch (e) {
        if (import.meta.env.DEV) console.error('Error loading tooltips', e);
      }
    }
  }, []);

  useEffect(() => {
    if (activeProfileId) {
      localStorage.setItem(LAST_PROFILE_ID_KEY, activeProfileId);
    }
  }, [activeProfileId]);

  useEffect(() => {
    if (profiles.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    }
  }, [profiles]);

  useEffect(() => {
    localStorage.setItem(SEEN_TOOLTIPS_KEY, JSON.stringify(seenTooltips));
  }, [seenTooltips]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Tooltip Logic
  const showTooltip = (id: string, title: string, content: React.ReactNode) => {
    if (!seenTooltips.includes(id)) {
      setActiveTooltip({ id, title, content });
    }
  };

  const dismissTooltip = () => {
    if (activeTooltip) {
      setSeenTooltips((prev) => [...prev, activeTooltip.id]);
      setActiveTooltip(null);
    }
  };

  // Trigger tooltips based on viewMode
  useEffect(() => {
    if (!activeProfile) return;

    if (viewMode === 'Analytics' && !seenTooltips.includes('analytics_intro')) {
      showTooltip(
        'analytics_intro',
        'Statistiques',
        'Découvre ton archétype cinéphile, tes genres favoris et ta sévérité comparée au reste du monde.'
      );
    } else if (viewMode === 'Calendar' && !seenTooltips.includes('calendar_intro')) {
      showTooltip(
        'calendar_intro',
        'Calendrier',
        'Visualise ton historique de visionnage mois par mois. Chaque point correspond à un film vu.'
      );
    } else if (viewMode === 'Discover' && !seenTooltips.includes('discover_intro')) {
      showTooltip(
        'discover_intro',
        'Explorateur',
        'Parcours les sorties par période et plateforme. Appuie sur une affiche pour voir les détails.'
      );
    } else if (
      viewMode === 'Feed' &&
      activeProfile.movies.length > 0 &&
      !seenTooltips.includes('feed_intro')
    ) {
      // Delay feed intro slightly
      const timer = setTimeout(() => {
        showTooltip(
          'feed_intro',
          'Ta Collection',
          'Glisse une carte vers la gauche pour supprimer, vers la droite pour éditer. Utilise le bouton + pour ajouter.'
        );
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [viewMode, activeProfile, seenTooltips]);

  const loadOrCreateProfile = async (user: any) => {
    if (!supabase) return;

    // Lire localStorage AVANT les awaits — source de vérité fiable (pas de stale closure React)
    // activeProfileId peut encore être null dans cette closure async même si Effect 1 l'a déjà restauré
    const existingLocalProfileId = localStorage.getItem(LAST_PROFILE_ID_KEY);

    try {
      // Tenter de charger le profil existant
      const { data: existingProfile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (existingProfile) {
        // Profil trouvé → charger normalement
        setProfiles((prev) => {
          const exists = prev.find((p) => p.id === existingProfile.id);
          if (exists) {
            return prev.map((p) =>
              p.id === existingProfile.id
                ? {
                    ...p,
                    firstName: existingProfile.first_name,
                    lastName: existingProfile.last_name || p.lastName,
                    severityIndex: existingProfile.severity_index || p.severityIndex,
                    patienceLevel: existingProfile.patience_level || p.patienceLevel,
                    favoriteGenres: existingProfile.favorite_genres || p.favoriteGenres,
                    role: existingProfile.role || p.role,
                    isOnboarded: existingProfile.is_onboarded || p.isOnboarded,
                    movies: p.movies,
                  }
                : p
            );
          } else {
            return [
              ...prev,
              {
                id: existingProfile.id,
                firstName:
                  existingProfile.first_name || user.user_metadata?.first_name || 'Utilisateur',
                lastName: existingProfile.last_name || '',
                movies: [],
                createdAt: new Date(existingProfile.created_at).getTime(),
                severityIndex: existingProfile.severity_index || 5,
                patienceLevel: existingProfile.patience_level || 5,
                favoriteGenres: existingProfile.favorite_genres || [],
                role: existingProfile.role,
                isOnboarded: existingProfile.is_onboarded || false,
                gender: 'h',
                age: 25,
              },
            ];
          }
        });
        // Ne switcher que si aucun profil local n'était déjà actif
        if (!existingLocalProfileId) {
          setActiveProfileId(user.id);
          setShowWelcome(false);
        }
      } else {
        // Profil introuvable → le créer (cas post-signup avec email vérifié)
        const firstName = user.user_metadata?.first_name || 'Utilisateur';

        const { error: insertError } = await supabase.from('profiles').insert([
          {
            id: user.id,
            first_name: firstName,
            email: user.email,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]);

        if (!insertError) {
          // Profil créé → charger
          setProfiles((prev) => [
            ...prev,
            {
              id: user.id,
              firstName,
              lastName: '',
              movies: [],
              createdAt: Date.now(),
              severityIndex: 5,
              patienceLevel: 5,
              favoriteGenres: [],
              isOnboarded: false,
              gender: 'h',
              age: 25,
            },
          ]);
          // Ne switcher que si aucun profil local n'était déjà actif
          if (!existingLocalProfileId) {
            setActiveProfileId(user.id);
            setShowWelcome(false);
          }
        }
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('loadOrCreateProfile error:', err);
    }
  };

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    // Vérifier la session existante
    (supabase.auth as any).getSession().then(({ data: { session } }: any) => {
      setSession(session);
      setAuthLoading(false);
      if (session?.user) {
        loadOrCreateProfile(session.user);
      }
    });

    // Écouter les changements d'état
    const {
      data: { subscription },
    } = (supabase.auth as any).onAuthStateChange(async (event: string, session: any) => {
      setSession(session);

      if (event === 'SIGNED_IN' && session?.user) {
        await loadOrCreateProfile(session.user);
      }

      if (event === 'SIGNED_OUT') {
        setActiveProfileId(null);
        setIsGuestMode(false);
      }

      if (event === 'PASSWORD_RECOVERY') {
        // Gérer le reset de mot de passe si nécessaire
        console.log('Password recovery event');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const loadMySpaces = async () => {
      const userId = session?.user?.id || activeProfile?.id;
      if (userId) {
        const spaces = await getUserSpaces(userId);
        setMySpaces(spaces);
      }
    };
    if (activeProfile) loadMySpaces();
  }, [activeProfile?.id, activeProfile?.joinedSpaceIds?.length, session]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (viewMode === 'Feed') searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode]);

  const handleCompleteCalibration = (data: {
    name: string;
    severityIndex: number;
    patienceLevel: number;
    favoriteGenres: string[];
    role: string;
  }) => {
    if (!activeProfileId) return;
    setProfiles((prev) =>
      prev.map((p) =>
        p.id === activeProfileId
          ? {
              ...p,
              firstName: data.name,
              severityIndex: data.severityIndex,
              patienceLevel: data.patienceLevel,
              favoriteGenres: data.favoriteGenres,
              role: data.role,
              isOnboarded: true,
            }
          : p
      )
    );
    setShowCalibration(false);
    setViewMode('Deck');
    haptics.success();
  };

  const handleSaveMovie = (data: MovieFormData) => {
    if (!activeProfileId) return;
    const hasRatings =
      data.ratings &&
      (data.ratings.story > 0 ||
        data.ratings.visuals > 0 ||
        data.ratings.acting > 0 ||
        data.ratings.sound > 0);
    const determinedStatus: MovieStatus = hasRatings ? 'watched' : data.status || 'watchlist';
    const newMovieId = crypto.randomUUID();
    const newMovieTimestamp = Date.now();
    let finalMovie: Movie = editingMovie
      ? { ...editingMovie, ...data, status: determinedStatus }
      : { ...data, id: newMovieId, dateAdded: newMovieTimestamp, status: determinedStatus };
    setProfiles((prev) =>
      prev.map((p) => {
        if (p.id !== activeProfileId) return p;
        let updatedMovies = editingMovie
          ? p.movies.map((m) => (m.id === finalMovie.id ? finalMovie : m))
          : [finalMovie, ...p.movies];
        return { ...p, movies: updatedMovies };
      })
    );
    setToastMessage(
      editingMovie
        ? 'Film modifié ✓'
        : data.status === 'watchlist'
          ? 'Ajouté à ta watchlist ✓'
          : 'Film ajouté ✓'
    );
    setEditingMovie(null);
    setTmdbIdToLoad(null);
    setIsModalOpen(false);
    if (viewMode === 'Deck') setDeckAdvanceTrigger((prev) => prev + 1);
  };

  const handleUpdateTmdbRating = (movieId: string, newRating: number) => {
    setProfiles((prev) =>
      prev.map((p) =>
        p.id !== activeProfileId
          ? p
          : {
              ...p,
              movies: p.movies.map((m) => (m.id === movieId ? { ...m, tmdbRating: newRating } : m)),
            }
      )
    );
  };

  const handleQuickWatchlist = async (tmdbId: number, mediaType: 'movie' | 'tv') => {
    if (!activeProfileId) return;
    try {
      let formData: MovieFormData | null = null;
      if (mediaType === 'movie') {
        formData = await getMovieDetailsForAdd(tmdbId);
      } else {
        const res = await fetch(
          `${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=credits&language=fr-FR`
        );
        const data = await res.json();
        const creator =
          data.created_by?.[0] || data.credits?.crew?.find((p: any) => p.job === 'Director');
        const actors = data.credits?.cast?.slice(0, 3) || [];
        formData = {
          title: data.name || '',
          tmdbId: data.id,
          director: creator?.name || 'Inconnu',
          directorId: creator?.id,
          actors: actors.map((p: any) => p.name).join(', '),
          actorIds: actors.map((p: any) => ({ id: p.id, name: p.name })),
          year: data.first_air_date ? parseInt(data.first_air_date) : new Date().getFullYear(),
          releaseDate: data.first_air_date || '',
          runtime: data.episode_run_time?.[0] || 0,
          genre: GENRES[0],
          ratings: { story: 0, visuals: 0, acting: 0, sound: 0 },
          review: data.overview || '',
          theme: 'black',
          posterUrl: data.poster_path ? `${TMDB_IMAGE_URL}${data.poster_path}` : '',
          status: 'watchlist',
          dateWatched: Date.now(),
          tmdbRating: data.vote_average ? Number(data.vote_average.toFixed(1)) : 0,
          rewatch: false,
          tags: [],
          smartphoneFactor: 0,
          hype: 5,
          mediaType: 'tv',
        };
      }
      if (!formData) throw new Error('fetch failed');
      handleSaveMovie({ ...formData, status: 'watchlist' });
    } catch {
      setToastMessage("Impossible d'ajouter à la watchlist");
    }
  };

  const handleDeleteMovie = (id: string) => {
    if (!activeProfileId) return;
    haptics.medium();

    // Si une suppression est déjà en attente, l'exécuter immédiatement avant d'en créer une nouvelle
    if (pendingDelete) {
      clearTimeout(pendingDelete.timeoutId);
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === activeProfileId
            ? { ...p, movies: p.movies.filter((m) => m.id !== pendingDelete.id) }
            : p
        )
      );
    }

    const movieTitle = activeProfile?.movies.find((m) => m.id === id)?.title ?? 'Film';

    const timeoutId = setTimeout(() => {
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === activeProfileId ? { ...p, movies: p.movies.filter((m) => m.id !== id) } : p
        )
      );
      setPendingDelete(null);
    }, 4500);

    setPendingDelete({ id, title: movieTitle, timeoutId });
  };

  const handleUndoDelete = () => {
    if (!pendingDelete) return;
    haptics.soft();
    clearTimeout(pendingDelete.timeoutId);
    setPendingDelete(null);
  };

  const handleMarkAsWatched = (movie: Movie) => {
    haptics.medium();
    // Pré-remplir le film avec status 'watched' pour forcer l'onglet "Vu"
    setEditingMovie({ ...movie, status: 'watched' });
    setIsModalOpen(true);
  };

  const watchlistGenres = useMemo(() => {
    if (!activeProfile) return [];
    return [
      ...new Set(
        activeProfile.movies
          .filter((m) => (m.status || 'watched') === 'watchlist')
          .map((m) => m.genre)
          .filter(Boolean)
      ),
    ];
  }, [activeProfile]);

  const uniqueMovies = useMemo(() => {
    if (!activeProfile) return [];
    return Array.from(new Map(activeProfile.movies.map((m) => [m.id, m])).values());
  }, [activeProfile]);

  const historyGenres = useMemo(() => {
    return [
      ...new Set(
        uniqueMovies
          .filter((m) => (m.status || 'watched') === 'watched')
          .map((m) => m.genre)
          .filter(Boolean)
      ),
    ];
  }, [uniqueMovies]);

  const feedStats = useMemo(() => {
    if (!activeProfile) return null;
    const watched = uniqueMovies.filter((m) => (m.status || 'watched') === 'watched');
    const watchedCount = watched.length;
    if (watchedCount === 0) return null;
    const avgRating =
      watched.reduce(
        (acc, m) =>
          acc + (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4,
        0
      ) / watchedCount;
    const totalHours = Math.round(watched.reduce((acc, m) => acc + (m.runtime || 0), 0) / 60);
    const queueCount = uniqueMovies.filter((m) => (m.status || 'watched') === 'watchlist').length;
    return { watchedCount, avgRating, totalHours, queueCount };
  }, [uniqueMovies, activeProfile]);

  const isAIUnlocked = (feedStats?.watchedCount ?? 0) >= 10;
  const lastWatchedMovie = useMemo(() => {
    const watched = uniqueMovies.filter((m) => m.status === 'watched' && m.tmdbId);
    return watched.sort((a, b) => (b.dateWatched ?? 0) - (a.dateWatched ?? 0))[0] ?? null;
  }, [uniqueMovies]);

  const yearBounds = useMemo(() => {
    const years = uniqueMovies.map((m) => m.year).filter(Boolean);
    if (years.length === 0) return { min: 1970, max: new Date().getFullYear() };
    return { min: Math.min(...years), max: Math.max(...years) };
  }, [uniqueMovies]);

  const activeAdvancedFilterCount = useMemo(() => {
    let count = 0;
    if (minRatingFilter > 0) count++;
    if (yearMinFilter !== null) count++;
    if (yearMaxFilter !== null) count++;
    return count;
  }, [minRatingFilter, yearMinFilter, yearMaxFilter]);

  const filteredAndSortedMovies = useMemo(() => {
    if (!activeProfile) return [];
    const targetStatus: MovieStatus = feedTab === 'history' ? 'watched' : 'watchlist';

    let result = uniqueMovies.filter((m) => {
      if ((m.status || 'watched') !== targetStatus) return false;
      if (feedTab === 'queue' && watchlistGenreFilter !== 'all' && m.genre !== watchlistGenreFilter)
        return false;
      if (feedTab === 'history' && historyGenreFilter !== 'all' && m.genre !== historyGenreFilter)
        return false;

      // Recherche étendue : titre, réalisateur, acteurs, genre — mots-clés multiples
      if (debouncedSearch) {
        const fields = [m.title, m.director, m.actors || '', m.genre].map((f) =>
          f.toLowerCase()
        );
        const words = debouncedSearch.toLowerCase().trim().split(/\s+/).filter(Boolean);
        if (!words.every((word) => fields.some((field) => field.includes(word)))) return false;
      }

      // Filtres avancés
      if (minRatingFilter > 0) {
        const avg =
          (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4;
        if (avg < minRatingFilter) return false;
      }
      if (yearMinFilter !== null && m.year < yearMinFilter) return false;
      if (yearMaxFilter !== null && m.year > yearMaxFilter) return false;

      return true;
    });

    // 🎯 Appliquer les filtres Vibes (watchlist uniquement)
    if (feedTab === 'queue') {
      if (selectedMood) {
        result = filterByMoodPreset(result, selectedMood);
      }
      if (activeVibeSort) {
        result = sortByVibeAxis(result, activeVibeSort);
        // Skip le tri standard si on trie par vibe
        return result;
      }
    }

    // Tri standard
    return result.sort((a, b) => {
      if (sortBy === 'Date') return (b.dateWatched || b.dateAdded) - (a.dateWatched || a.dateAdded);
      if (sortBy === 'Year') return b.year - a.year;
      if (sortBy === 'Title') return a.title.localeCompare(b.title);
      if (sortBy === 'Rating') {
        const ra = (a.ratings.story + a.ratings.visuals + a.ratings.acting + a.ratings.sound) / 4;
        const rb = (b.ratings.story + b.ratings.visuals + b.ratings.acting + b.ratings.sound) / 4;
        return rb - ra;
      }
      return 0;
    });
  }, [
    uniqueMovies,
    sortBy,
    debouncedSearch,
    feedTab,
    watchlistGenreFilter,
    historyGenreFilter,
    selectedMood,
    activeVibeSort,
    minRatingFilter,
    yearMinFilter,
    yearMaxFilter,
  ]);

  const handleTonightPick = () => {
    if (!activeProfile) return;
    const watchlist = activeProfile.movies.filter((m) => (m.status || 'watched') === 'watchlist');
    if (watchlist.length === 0) return;
    haptics.medium();
    setIsPickAnimating(true);

    // Animation de roulette (inchangée visuellement)
    let count = 0,
      maxCycles = 12;
    const interval = setInterval(() => {
      setTonightPick(watchlist[Math.floor(Math.random() * watchlist.length)]);
      if (++count >= maxCycles) {
        clearInterval(interval);
        // 🎯 Le pick final utilise l'algorithme intelligent
        const smartPick = getSmartTonightPick(watchlist, activeProfile.movies, selectedMood);
        setTonightPick(smartPick);
        setTimeout(() => setIsPickAnimating(false), 300);
      }
    }, 120);
  };

  const handleBackToFeed = () => {
    haptics.soft();
    if (viewMode === 'SharedSpace') setActiveSharedSpace(null);
    setViewMode('Feed');
  };

  const handleSignOut = () => {
    setShowProfile(false);
    setShowSignOutConfirm(true);
  };

  const handleSignOutConfirmed = async () => {
    haptics.medium();
    setShowSignOutConfirm(false);
    if (session) await (supabase?.auth as any).signOut();
    setIsGuestMode(false);
    setActiveProfileId(null);
    setSession(null);
    setShowWelcome(true);
    setViewMode('Feed');
    setActiveSharedSpace(null);
    setShowProfile(false);
    localStorage.removeItem(LAST_PROFILE_ID_KEY);
  };

  if (authLoading)
    return (
      <div className="min-h-screen bg-cream dark:bg-[#0c0c0c] flex items-center justify-center transition-colors">
        <Loader2 size={32} className="animate-spin text-forest" />
      </div>
    );
  if (!session && !isGuestMode && !activeProfileId)
    return <AuthScreen onContinueAsGuest={() => setIsGuestMode(true)} />;
  if (showWelcome && !activeProfileId)
    return (
      <div className="relative min-h-screen">
        <WelcomePage
          existingProfiles={profiles}
          onSelectProfile={(id) => {
            setActiveProfileId(id);
            setShowWelcome(false);
            setViewMode('Feed');
            haptics.medium();
          }}
          onCreateProfile={(f, l, g, a, vp, sp) => {
            const newP: UserProfile = {
              id: crypto.randomUUID(),
              firstName: f,
              lastName: l,
              gender: g,
              age: a,
              viewingPreference: vp,
              streamingPlatforms: sp,
              movies: [],
              createdAt: Date.now(),
              isOnboarded: false,
            };
            setProfiles((p) => [...p, newP]);
            setActiveProfileId(newP.id);
            setShowWelcome(false);
          }}
          onDeleteProfile={(id) => {
            setProfiles((prev) => {
              const updated = prev.filter((x) => x.id !== id);
              if (activeProfileId === id) {
                setActiveProfileId(null);
                localStorage.removeItem(LAST_PROFILE_ID_KEY);
              }
              return updated;
            });
          }}
        />
        {showConsent && (
          <ConsentModal
            onAccept={() => {
              haptics.success();
              setShowConsent(false);
              initAnalytics();
            }}
          />
        )}
      </div>
    );

  return (
    <div className="min-h-[100dvh] flex flex-col text-charcoal dark:text-white font-sans relative overflow-x-hidden bg-cream dark:bg-[#0c0c0c] transition-colors">
      <style>{`@keyframes shimmer { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }`}</style>

      {viewMode !== 'SharedSpace' && (
        <header
          className="px-6 sticky top-0 z-40 bg-cream/95 dark:bg-[#0c0c0c]/95 backdrop-blur-xl border-b border-sand/40 dark:border-white/10 transition-colors"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}
        >
          <div className="flex items-center justify-between h-14 max-w-2xl mx-auto w-full">
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-2">
                {viewMode !== 'Feed' && (
                  <button
                    onClick={handleBackToFeed}
                    className="w-8 h-8 bg-white dark:bg-[#1a1a1a] border border-sand dark:border-white/10 rounded-xl flex items-center justify-center shadow-soft dark:shadow-none active:scale-90 transition-all mr-1"
                  >
                    <ChevronLeft
                      size={16}
                      strokeWidth={3}
                      className="text-charcoal dark:text-white"
                    />
                  </button>
                )}
                <h1 className="text-lg font-black tracking-tighter leading-none text-charcoal dark:text-white">
                  The Bitter
                </h1>
              </div>
              <button
                onClick={() => {
                  haptics.soft();
                  setShowChangelog(true);
                }}
                className="text-[8px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500 hover:text-forest transition-colors text-left mt-1.5"
              >
                {RELEASE_HISTORY[0].version} • Notes
              </button>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              {isGuestMode && (
                <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-stone-100 dark:bg-[#1a1a1a] text-stone-400 dark:text-stone-500 border border-stone-200 dark:border-white/5">
                  Invité
                </span>
              )}
              <ThemeToggle />
              <NotificationCenter movies={activeProfile?.movies || []} />
              <button
                onClick={() => {
                  if (!session) {
                    setToastMessage('Connecte-toi pour accéder aux espaces partagés');
                    return;
                  }
                  setShowSharedSpaces(true);
                }}
                className={`relative w-10 h-10 rounded-2xl border flex items-center justify-center shadow-soft dark:shadow-none active:scale-90 transition-all ${!session ? 'bg-stone-50 dark:bg-stone-900 border-stone-100 dark:border-stone-800 text-stone-300' : 'bg-white dark:bg-[#1a1a1a] border-sand dark:border-white/10 text-charcoal dark:text-white'}`}
              >
                <Users size={20} />
                {mySpaces.length > 0 && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-forest text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-sm">
                    {mySpaces.length}
                  </div>
                )}
              </button>
              <button
                onClick={() => {
                  haptics.soft();
                  setShowProfile(true);
                }}
                className="w-10 h-10 rounded-full bg-forest text-white flex items-center justify-center font-black text-sm shadow-md active:scale-90 transition-all shadow-forest/20"
              >
                {activeProfile?.firstName?.[0]?.toUpperCase() ?? '?'}
              </button>
            </div>
          </div>
        </header>
      )}

      <main className={`flex-1 px-6 ${viewMode === 'SharedSpace' ? 'pt-6' : 'pt-6'} pb-32`}>
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-stone-300" size={32} />
            </div>
          }
        >
          {viewMode === 'SharedSpace' && activeSharedSpace ? (
            <SharedSpaceView
              space={activeSharedSpace}
              currentUserId={session?.user?.id || activeProfile?.id || ''}
              onBack={handleBackToFeed}
              onAddMovie={() => setIsModalOpen(true)}
              refreshTrigger={sharedSpaceRefreshTrigger}
            />
          ) : viewMode === 'Analytics' ? (
            <AnalyticsView
              movies={uniqueMovies.filter((m) => m.status === 'watched')}
              userProfile={activeProfile}
              onNavigateToCalendar={() => setViewMode('Calendar')}
              onRecalibrate={() => setShowCalibration(true)}
              onViewDirector={(name, id) => setPreviewDirector({ name, id })}
            />
          ) : viewMode === 'Discover' ? (
            <DiscoverView
              onSelectMovie={(id, type) => {
                setTmdbIdToLoad(id);
                setMediaTypeToLoad(type);
                setIsModalOpen(true);
              }}
              onPreview={(id, type) => {
                setPreviewTmdbId(id);
                setPreviewMediaType(type);
              }}
              onQuickWatchlist={handleQuickWatchlist}
              userProfile={activeProfile}
              movies={uniqueMovies}
              onToast={setToastMessage}
            />
          ) : viewMode === 'Calendar' ? (
            <CalendarView movies={uniqueMovies} />
          ) : viewMode === 'Deck' ? (
            <MovieDeck
              onRate={(id) => {
                setTmdbIdToLoad(id);
                setMediaTypeToLoad('movie');
                setIsModalOpen(true);
              }}
              onClose={() => setViewMode('Feed')}
              favoriteGenres={activeProfile?.favoriteGenres}
              advanceTrigger={deckAdvanceTrigger}
            />
          ) : (
            <div className="max-w-md mx-auto w-full space-y-8 animate-[fadeIn_0.3s_ease-out]">
              {!activeProfile || activeProfile.movies.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-24 h-24 bg-white dark:bg-[#1a1a1a] rounded-[2.5rem] border border-sand dark:border-white/5 flex items-center justify-center text-stone-300 dark:text-stone-700 mb-8 shadow-sm transition-colors transition-all animate-bounce">
                    <Film size={40} />
                  </div>
                  <h2 className="text-2xl font-black mb-3 tracking-tighter">
                    Démarrez votre collection
                  </h2>
                  <p className="text-stone-400 dark:text-stone-500 font-medium mb-10 max-w-xs mx-auto text-sm leading-relaxed">
                    Ajoutez des films pour voir vos statistiques d'analyste.
                  </p>

                  <div className="flex flex-col gap-3 w-full max-w-xs">
                    <button
                      onClick={() => setIsModalOpen(true)}
                      className="bg-charcoal dark:bg-forest text-white px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all hover:scale-105"
                    >
                      <Plus size={18} strokeWidth={3} /> Ajouter un film
                    </button>
                    <button
                      onClick={() => setViewMode('Discover')}
                      className="bg-stone-100 dark:bg-[#1a1a1a] text-charcoal dark:text-white px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-widest border border-stone-200 dark:border-white/5 flex items-center justify-center gap-3 active:scale-95 transition-all hover:scale-105"
                    >
                      <Clapperboard size={18} /> Explorer
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-12">
                  {activeProfile && (
                    <ProfileCompletionWidget
                      profile={activeProfile}
                      onCompleteProfile={() => setShowCalibration(true)}
                    />
                  )}
                  <AIUnlockWidget
                    watchedCount={feedStats?.watchedCount ?? 0}
                    onAddMovie={() => setIsModalOpen(true)}
                  />
                  <div className="space-y-2">
                    {feedStats && (
                    <div className="flex flex-col items-center">
                      <button
                        onClick={() => {
                          haptics.soft();
                          setShowFeedStats((s) => !s);
                        }}
                        className="flex items-center gap-1.5 py-1 px-3 text-stone-400 dark:text-stone-600 hover:text-stone-600 dark:hover:text-stone-400 transition-colors"
                      >
                        <span className="text-[9px] font-black uppercase tracking-widest">
                          Mes stats
                        </span>
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                          className={`transition-transform duration-300 ${showFeedStats ? 'rotate-180' : ''}`}
                        >
                          <path
                            d="M2 3.5L5 6.5L8 3.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      <div
                        className={`w-full overflow-hidden transition-all duration-300 ease-in-out ${showFeedStats ? 'max-h-32 opacity-100 mt-1' : 'max-h-0 opacity-0'}`}
                      >
                        <div className="flex justify-center items-center gap-6 py-3 px-5 bg-stone-50 dark:bg-[#161616] rounded-t-2xl border border-b-0 border-stone-100 dark:border-white/5">
                          <div className="text-center">
                            <p className="text-base font-black tracking-tight text-charcoal dark:text-white">
                              {feedStats.watchedCount}
                            </p>
                            <p className="text-[9px] font-black uppercase tracking-widest text-stone-400">
                              films
                            </p>
                          </div>
                          <div className="w-px h-8 bg-stone-200 dark:bg-white/10" />
                          <div className="text-center">
                            <p className="text-base font-black tracking-tight text-charcoal dark:text-white">
                              {feedStats.avgRating.toFixed(1)}
                            </p>
                            <p className="text-[9px] font-black uppercase tracking-widest text-stone-400">
                              moy.
                            </p>
                          </div>
                          <div className="w-px h-8 bg-stone-200 dark:bg-white/10" />
                          <div className="text-center">
                            <p className="text-base font-black tracking-tight text-charcoal dark:text-white">
                              {feedStats.totalHours}h
                            </p>
                            <p className="text-[9px] font-black uppercase tracking-widest text-stone-400">
                              vues
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            haptics.soft();
                            setViewMode('Analytics');
                          }}
                          className="w-full flex items-center justify-center gap-1.5 py-2 px-5 bg-stone-100 dark:bg-[#111] rounded-b-2xl border border-stone-100 dark:border-white/5 text-[9px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 hover:text-stone-600 dark:hover:text-stone-400 transition-colors"
                        >
                          Voir mes statistiques complètes
                          <ChevronRight size={10} strokeWidth={3} />
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-center w-full mb-2">
                    <div className="relative bg-stone-100 dark:bg-[#161616] p-1 rounded-full flex w-full max-w-[280px] shadow-inner border border-stone-200/50 dark:border-white/5 transition-colors">
                      <div
                        className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white dark:bg-[#2a2a2a] rounded-full shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                        style={{
                          transform: feedTab === 'history' ? 'translateX(0)' : 'translateX(100%)',
                        }}
                      />
                      <button
                        onClick={() => {
                          haptics.soft();
                          setFeedTab('history');
                          setHistoryGenreFilter('all');
                          setSelectedMood(null);
                          setActiveVibeSort(null);
                        }}
                        className={`relative z-10 flex-1 py-3 rounded-full text-[11px] font-bold uppercase tracking-widest transition-colors duration-300 ${feedTab === 'history' ? 'text-charcoal dark:text-white' : 'text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-400'}`}
                      >
                        Vu {feedStats ? `(${feedStats.watchedCount})` : ''}
                      </button>
                      <button
                        onClick={() => {
                          haptics.soft();
                          setFeedTab('queue');
                          setWatchlistGenreFilter('all');
                        }}
                        className={`relative z-10 flex-1 py-3 rounded-full text-[11px] font-bold uppercase tracking-widest transition-colors duration-300 ${feedTab === 'queue' ? 'text-charcoal dark:text-white' : 'text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-400'}`}
                      >
                        À voir {feedStats ? `(${feedStats.queueCount})` : ''}
                      </button>
                    </div>
                  </div>
                  </div>
                  {feedTab === 'queue' &&
                    activeProfile &&
                    activeProfile.movies.filter((m) => (m.status || 'watched') === 'watchlist')
                      .length === 0 && (
                      <div className="flex flex-col items-center justify-center py-10 text-center animate-[fadeIn_0.3s_ease-out]">
                        <div className="w-16 h-16 bg-white dark:bg-[#1a1a1a] rounded-2xl border border-sand dark:border-white/5 flex items-center justify-center text-stone-300 dark:text-stone-700 mb-5 shadow-sm transition-colors">
                          <Clock size={28} />
                        </div>
                        <h3 className="text-base font-black tracking-tight mb-2">
                          Ta liste est vide
                        </h3>
                        <p className="text-stone-400 dark:text-stone-500 font-medium text-sm max-w-xs mx-auto leading-relaxed mb-6">
                          Ajoute des films à ta watchlist pour les retrouver ici.
                        </p>
                        <button
                          onClick={() => setViewMode('Discover')}
                          className="bg-stone-100 dark:bg-[#1a1a1a] text-charcoal dark:text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest border border-stone-200 dark:border-white/5 active:scale-95 transition-all"
                        >
                          Explorer
                        </button>
                      </div>
                    )}
                  {feedTab === 'queue' &&
                    activeProfile &&
                    activeProfile.movies.filter((m) => (m.status || 'watched') === 'watchlist')
                      .length > 0 && (
                      <div className="space-y-5 animate-[fadeIn_0.3s_ease-out]">
                        <MoodPicker
                          selectedMood={selectedMood}
                          onSelectMood={setSelectedMood}
                          activeVibeSort={activeVibeSort}
                          onSelectVibeSort={setActiveVibeSort}
                          matchCount={filteredAndSortedMovies.length}
                        />
                        <button
                          onClick={handleTonightPick}
                          className="w-full bg-bitter-lime text-charcoal py-5 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-lime-400/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                        >
                          <Shuffle size={18} strokeWidth={2.5} />
                          {selectedMood
                            ? `Ce soir · ${MOOD_PRESETS.find((m) => m.id === selectedMood)?.label}`
                            : 'Ce soir ?'}
                        </button>
                        {tonightPick && !isPickAnimating && (
                          <div className="bg-charcoal dark:bg-[#1a1a1a] text-white p-5 rounded-[2rem] shadow-2xl flex gap-4 items-center border border-white/5 animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)]">
                            {tonightPick.posterUrl && (
                              <div className="w-16 h-24 rounded-2xl overflow-hidden shrink-0 shadow-lg">
                                <img
                                  src={tonightPick.posterUrl}
                                  alt={tonightPick.title}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-[9px] font-black uppercase tracking-widest text-bitter-lime mb-1">
                                {selectedMood
                                  ? `🎯 Mood : ${MOOD_PRESETS.find((m) => m.id === selectedMood)?.label}`
                                  : '🎲 Suggestion'}
                              </p>
                              <h4 className="font-black text-lg tracking-tight truncate">
                                {tonightPick.title}
                              </h4>
                              <p className="text-[10px] text-stone-400 font-bold mt-1">
                                {tonightPick.director} • {tonightPick.year}
                              </p>
                            </div>
                            <button
                              onClick={() => setTonightPick(null)}
                              className="p-2 text-stone-500 hover:text-white transition-colors"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        )}
                        {watchlistGenres.length > 1 && (
                          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            <button
                              onClick={() => setWatchlistGenreFilter('all')}
                              className={`flex-shrink-0 px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${watchlistGenreFilter === 'all' ? 'bg-charcoal dark:bg-forest text-white border-charcoal shadow-md' : 'bg-white dark:bg-[#1a1a1a] text-stone-400 dark:text-stone-600 border-stone-200 dark:border-white/5'}`}
                            >
                              Tous
                            </button>
                            {watchlistGenres.map((genre) => (
                              <button
                                key={genre}
                                onClick={() => setWatchlistGenreFilter(genre)}
                                className={`flex-shrink-0 px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${watchlistGenreFilter === genre ? 'bg-charcoal dark:bg-forest text-white border-charcoal shadow-md' : 'bg-white dark:bg-[#1a1a1a] text-stone-400 dark:text-stone-600 border-stone-200 dark:border-white/5'}`}
                              >
                                {genre}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                  {feedTab === 'history' && historyGenres.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 animate-[fadeIn_0.3s_ease-out]">
                      <button
                        onClick={() => setHistoryGenreFilter('all')}
                        className={`flex-shrink-0 px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${historyGenreFilter === 'all' ? 'bg-charcoal dark:bg-forest text-white border-charcoal shadow-md' : 'bg-white dark:bg-[#1a1a1a] text-stone-400 dark:text-stone-600 border-stone-200 dark:border-white/5'}`}
                      >
                        Tous
                      </button>
                      {historyGenres.map((genre) => (
                        <button
                          key={genre}
                          onClick={() => setHistoryGenreFilter(genre)}
                          className={`flex-shrink-0 px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${historyGenreFilter === genre ? 'bg-charcoal dark:bg-forest text-white border-charcoal shadow-md' : 'bg-white dark:bg-[#1a1a1a] text-stone-400 dark:text-stone-600 border-stone-200 dark:border-white/5'}`}
                        >
                          {genre}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="space-y-4 border-b border-sand dark:border-white/5 pb-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-300 dark:text-stone-700">
                        {feedTab === 'history' ? 'Films Vus' : 'À Voir'} (
                        {filteredAndSortedMovies.length})
                      </h2>
                      <div className="flex items-center gap-1.5 bg-stone-100 dark:bg-[#1a1a1a] px-3 py-2 rounded-full shrink-0">
                        <SlidersHorizontal size={12} className="text-stone-400" />
                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as SortOption)}
                          className="bg-transparent text-[10px] font-bold uppercase text-charcoal dark:text-white outline-none cursor-pointer tracking-widest appearance-none pr-1"
                        >
                          <option value="Date">Récents</option>
                          {feedTab === 'history' && <option value="Rating">Note</option>}
                          <option value="Year">Année</option>
                          <option value="Title">A-Z</option>
                        </select>
                      </div>
                    </div>
                    <div className="relative">
                      <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                      />
                      <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Titre, réalisateur, acteur, genre... (⌘K)"
                        className="w-full bg-stone-100 dark:bg-[#1a1a1a] border border-transparent focus:border-stone-200 dark:focus:border-white/10 py-2.5 pl-9 pr-8 rounded-full font-medium text-xs outline-none transition-all text-charcoal dark:text-white"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-charcoal dark:hover:text-white"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    {/* ── FILTRES AVANCÉS ── */}
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setShowAdvancedFilters((p) => !p)}
                        className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${showAdvancedFilters || activeAdvancedFilterCount > 0 ? 'text-forest dark:text-bitter-lime' : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'}`}
                      >
                        <Filter size={11} />
                        Filtres
                        {activeAdvancedFilterCount > 0 && (
                          <span className="w-4 h-4 bg-forest dark:bg-lime-500 text-white dark:text-black rounded-full text-[8px] flex items-center justify-center font-black">
                            {activeAdvancedFilterCount}
                          </span>
                        )}
                      </button>
                      {activeAdvancedFilterCount > 0 && (
                        <button
                          onClick={() => {
                            setMinRatingFilter(0);
                            setYearMinFilter(null);
                            setYearMaxFilter(null);
                          }}
                          className="text-[10px] font-black uppercase tracking-widest text-stone-400 hover:text-red-400 transition-colors"
                        >
                          Effacer
                        </button>
                      )}
                    </div>

                    {showAdvancedFilters && (
                      <div className="bg-white dark:bg-[#1a1a1a] border border-sand dark:border-white/5 rounded-2xl p-4 space-y-5 animate-[fadeIn_0.2s_ease-out]">
                        {/* Note minimum */}
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                              Note min.
                            </span>
                            <span className="text-xs font-black text-charcoal dark:text-white">
                              {minRatingFilter > 0 ? `${minRatingFilter}+` : 'Toutes'}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={9}
                            step={1}
                            value={minRatingFilter}
                            onChange={(e) => setMinRatingFilter(Number(e.target.value))}
                            className="w-full accent-forest dark:accent-lime-500 cursor-pointer"
                          />
                          <div className="flex justify-between mt-1 px-0.5">
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => (
                              <span
                                key={v}
                                className={`text-[8px] font-bold transition-colors ${v === minRatingFilter ? 'text-forest dark:text-lime-500' : 'text-stone-300 dark:text-stone-700'}`}
                              >
                                {v}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Période */}
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 block mb-2">
                            Période
                          </span>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              placeholder={String(yearBounds.min)}
                              min={yearBounds.min}
                              max={yearBounds.max}
                              value={yearMinFilter ?? ''}
                              onChange={(e) =>
                                setYearMinFilter(e.target.value ? Number(e.target.value) : null)
                              }
                              className="flex-1 bg-stone-100 dark:bg-[#111] border border-transparent focus:border-stone-200 dark:focus:border-white/10 rounded-xl py-2 px-3 text-xs font-bold text-charcoal dark:text-white outline-none text-center"
                            />
                            <span className="text-stone-300 dark:text-stone-700 text-xs font-bold">
                              —
                            </span>
                            <input
                              type="number"
                              placeholder={String(yearBounds.max)}
                              min={yearBounds.min}
                              max={yearBounds.max}
                              value={yearMaxFilter ?? ''}
                              onChange={(e) =>
                                setYearMaxFilter(e.target.value ? Number(e.target.value) : null)
                              }
                              className="flex-1 bg-stone-100 dark:bg-[#111] border border-transparent focus:border-stone-200 dark:focus:border-white/10 rounded-xl py-2 px-3 text-xs font-bold text-charcoal dark:text-white outline-none text-center"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  {filteredAndSortedMovies.length === 0 &&
                  (searchQuery ||
                    watchlistGenreFilter !== 'all' ||
                    historyGenreFilter !== 'all' ||
                    activeAdvancedFilterCount > 0) ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center animate-[fadeIn_0.3s_ease-out]">
                      <div className="w-16 h-16 bg-white dark:bg-[#1a1a1a] rounded-2xl border border-sand dark:border-white/5 flex items-center justify-center text-stone-300 dark:text-stone-700 mb-5 shadow-sm transition-colors">
                        <Search size={28} />
                      </div>
                      <h3 className="text-base font-black tracking-tight mb-2">Aucun résultat</h3>
                      <p className="text-stone-400 dark:text-stone-500 font-medium text-sm max-w-xs mx-auto leading-relaxed mb-4">
                        Aucun film ne correspond à ta recherche.
                      </p>
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setWatchlistGenreFilter('all');
                          setHistoryGenreFilter('all');
                          setMinRatingFilter(0);
                          setYearMinFilter(null);
                          setYearMaxFilter(null);
                        }}
                        className="text-xs font-black uppercase tracking-widest text-forest dark:text-bitter-lime underline underline-offset-4 active:scale-95 transition-all"
                      >
                        Effacer les filtres
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-8">
                      {filteredAndSortedMovies.map((movie, index) => (
                        <MovieCard
                          key={movie.id}
                          movie={movie}
                          index={index}
                          onDelete={handleDeleteMovie}
                          onEdit={(m) => {
                            setEditingMovie(m);
                            setIsModalOpen(true);
                          }}
                          onMarkAsWatched={handleMarkAsWatched}
                          onViewDetails={(id, type) => {
                            setPreviewTmdbId(id);
                            setPreviewMediaType(type);
                          }}
                          onViewDirector={(name, id) => setPreviewDirector({ name, id })}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Suspense>
      </main>

      <BottomNav
        viewMode={viewMode}
        setViewMode={setViewMode}
        setIsModalOpen={() => {
          setEditingMovie(null);
          setTmdbIdToLoad(null);
          setIsModalOpen(true);
        }}
        feedTab={feedTab}
        setInitialStatusForAdd={setInitialStatusForAdd}
        movieCount={activeProfile?.movies.length || 0}
      />

      {/* Cine Assistant Button removed for now */}

      {pendingDelete && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[200] animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]">
          <div className="bg-charcoal dark:bg-[#1a1a1a] text-white pl-5 pr-3 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10">
            <Trash2 size={14} className="text-stone-400 shrink-0" />
            <span className="text-sm font-bold tracking-tight truncate max-w-[140px]">
              {pendingDelete.title}
            </span>
            <button
              onClick={handleUndoDelete}
              className="ml-2 px-4 py-2 bg-bitter-lime text-charcoal rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all shrink-0"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {toastMessage && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-[200] animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)] ${pendingDelete ? 'bottom-44' : 'bottom-28'}`}
        >
          <div className="bg-charcoal dark:bg-forest text-white px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-2.5 border border-white/10">
            <Check size={12} strokeWidth={3} />
            <span className="text-sm font-bold tracking-tight">{toastMessage}</span>
          </div>
        </div>
      )}

      <Suspense
        fallback={
          <div className="fixed inset-0 z-[200] bg-charcoal/20 backdrop-blur-sm flex items-center justify-center">
            <Loader2 className="animate-spin text-white" size={48} />
          </div>
        }
      >
        {activeTooltip && (
          <ContextualTooltip
            id={activeTooltip.id}
            title={activeTooltip.title}
            content={activeTooltip.content}
            onDismiss={dismissTooltip}
          />
        )}
        {showNewFeatures && (
          <NewFeaturesModal
            onClose={() => {
              setShowNewFeatures(false);
              localStorage.setItem(LAST_SEEN_VERSION_KEY, RELEASE_HISTORY[0].version);
            }}
            onNeverShowAgain={() => {
              setShowNewFeatures(false);
              localStorage.setItem(LAST_SEEN_VERSION_KEY, RELEASE_HISTORY[0].version);
            }}
          />
        )}
        {isModalOpen && (
          <AddMovieModal
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false);
              setEditingMovie(null);
              setTmdbIdToLoad(null);
            }}
            onSave={handleSaveMovie}
            initialData={editingMovie}
            tmdbIdToLoad={tmdbIdToLoad}
            initialMediaType={mediaTypeToLoad}
            initialStatus={initialStatusForAdd}
            sharedSpace={viewMode === 'SharedSpace' ? activeSharedSpace : null}
            currentUserId={session?.user?.id || activeProfile?.id}
            onSharedMovieAdded={() => setSharedSpaceRefreshTrigger((prev) => prev + 1)}
            onToast={setToastMessage}
          />
        )}
        {previewTmdbId &&
          (() => {
            const collectionMovie = uniqueMovies.find((m) => m.tmdbId === previewTmdbId);
            return (
              <MovieDetailModal
                tmdbId={previewTmdbId}
                mediaType={previewMediaType}
                isOpen={!!previewTmdbId}
                onClose={() => setPreviewTmdbId(null)}
                onAction={(id, status) => {
                  setPreviewTmdbId(null);
                  setTmdbIdToLoad(id);
                  setMediaTypeToLoad(previewMediaType);
                  setInitialStatusForAdd(status);
                  setTimeout(() => setIsModalOpen(true), 100);
                }}
                onViewDirector={(name, id) => setPreviewDirector({ name, id })}
                collectionMovieId={collectionMovie?.id}
                collectionTmdbRating={collectionMovie?.tmdbRating}
                collectionUserRating={
                  collectionMovie?.ratings
                    ? (collectionMovie.ratings.story +
                        collectionMovie.ratings.visuals +
                        collectionMovie.ratings.acting +
                        collectionMovie.ratings.sound) /
                      4
                    : undefined
                }
                onUpdateTmdbRating={handleUpdateTmdbRating}
              />
            );
          })()}
        {previewDirector && (
          <DirectorMoviesModal
            directorName={previewDirector.name}
            directorId={previewDirector.id}
            onClose={() => setPreviewDirector(null)}
            onSelectMovie={(tmdbId) => {
              setPreviewTmdbId(tmdbId);
              setPreviewMediaType('movie');
              setPreviewDirector(null);
            }}
          />
        )}
        {showChangelog && (
          <ChangelogModal isOpen={showChangelog} onClose={() => setShowChangelog(false)} />
        )}
        {showSharedSpaces && activeProfile && (
          <SharedSpacesModal
            isOpen={showSharedSpaces}
            onClose={() => setShowSharedSpaces(false)}
            userId={session?.user?.id || activeProfile.id}
            onSelectSpace={(space) => {
              setActiveSharedSpace(space);
              setShowSharedSpaces(false);
              setViewMode('SharedSpace');
              haptics.medium();
            }}
          />
        )}
        {showCineAssistant && activeProfile && (
          <CineAssistant
            isOpen={showCineAssistant}
            onClose={() => setShowCineAssistant(false)}
            userProfile={activeProfile}
            onAddToWatchlist={(id) => {
              setTmdbIdToLoad(id);
              setInitialStatusForAdd('watchlist');
              setIsModalOpen(true);
              setShowCineAssistant(false);
            }}
          />
        )}
        {showCalibration && activeProfile && (
          <OnboardingModal
            initialName={activeProfile.firstName}
            userId={session?.user?.id || activeProfile.id}
            onComplete={handleCompleteCalibration}
          />
        )}
        {/* FAB Recos Perso */}
        {viewMode === 'Feed' && isAIUnlocked && (
          <button
            onClick={() => {
              haptics.soft();
              setShowRecommendationsModal(true);
            }}
            className="fixed left-4 z-40 w-14 h-14 bg-forest dark:bg-lime-400 text-white dark:text-charcoal rounded-full flex items-center justify-center shadow-xl animate-pulse-glow active:scale-90 transition-all"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6rem)' }}
            aria-label="Recommandations personnalisées"
          >
            <Sparkles size={22} />
          </button>
        )}

        {showRecommendationsModal && (
          <RecommendationsModal
            isOpen={showRecommendationsModal}
            onClose={() => setShowRecommendationsModal(false)}
            sourceMovie={lastWatchedMovie}
            onAddMovie={(movieData) => {
              handleSaveMovie(movieData);
              setShowRecommendationsModal(false);
            }}
            existingTmdbIds={new Set(uniqueMovies.map((m) => m.tmdbId).filter(Boolean) as number[])}
            movies={uniqueMovies}
          />
        )}
        {showProfile && activeProfile && (
          <ProfileModal
            profile={activeProfile}
            session={session}
            onClose={() => setShowProfile(false)}
            onSwitchProfile={() => {
              setShowProfile(false);
              setActiveProfileId(null);
              localStorage.removeItem(LAST_PROFILE_ID_KEY);
              setShowWelcome(true);
              setViewMode('Feed');
            }}
            onRecalibrate={() => {
              setShowProfile(false);
              setShowCalibration(true);
            }}
            onSignOut={handleSignOut}
          />
        )}
      </Suspense>

      {showSignOutConfirm && (
        <div
          className="fixed inset-0 z-[500] flex flex-col justify-end"
          onClick={() => setShowSignOutConfirm(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]" />

          {/* Sheet */}
          <div
            className="relative bg-white dark:bg-[#1a1a1a] rounded-t-[2.5rem] p-8 pb-12 shadow-2xl animate-[slideUp_0.35s_cubic-bezier(0.16,1,0.3,1)] border-t border-stone-100 dark:border-white/10"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)' }}
          >
            {/* Drag indicator */}
            <div className="w-12 h-1.5 bg-stone-200 dark:bg-stone-700 rounded-full mx-auto mb-8" />

            <div className="mb-8">
              <h3 className="text-2xl font-black tracking-tighter text-charcoal dark:text-white mb-2">
                Se déconnecter ?
              </h3>
              <p className="text-sm font-medium text-stone-500 dark:text-stone-400 leading-relaxed">
                Tes films et ta collection restent sauvegardés sur cet appareil.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleSignOutConfirmed}
                className="w-full py-5 rounded-[1.8rem] font-black text-sm uppercase tracking-widest bg-red-500 text-white shadow-xl shadow-red-500/20 active:scale-[0.98] transition-all"
              >
                Confirmer la déconnexion
              </button>
              <button
                onClick={() => {
                  haptics.soft();
                  setShowSignOutConfirm(false);
                }}
                className="w-full py-5 rounded-[1.8rem] font-black text-sm uppercase tracking-widest bg-stone-100 dark:bg-[#202020] text-charcoal dark:text-white active:scale-[0.98] transition-all"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
