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
  ChevronRight,
  ChevronLeft,
  Users,
  Globe,
  Info,
  Check,
  Shuffle,
  Trash2,
  Filter,
} from 'lucide-react';
import React, { useState, useEffect, useMemo, lazy, Suspense, memo, useRef } from 'react';
import { useLanguage } from './contexts/LanguageContext';
import { GENRES, TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from './constants';
import { getMovieDetailsForAdd, getSharedMovieDetails } from './services/tmdb';
import { avatarSrc } from './utils/avatar';
import {
  migrateLocalStorageToSupabase,
  resyncAllMoviesToSupabase,
  syncCinemaSubscriptionToSupabase,
  syncMovieToSupabase,
  syncMoviesToSupabase,
  syncProfileFieldsToSupabase,
} from './services/migration';
import {
  CinemaSubscription,
  Movie,
  MovieFormData,
  MovieStatus,
  MovieWatch,
  UserProfile,
  ViewingContext,
} from './types';
import { withFirstWatchContext } from './utils/cinemaSubscription';
import {
  backfillProfileToSupabase,
  fetchRemoteMovies,
  hasDeclinedMerge,
  mergeRemoteAndLocal,
  rememberMergeDeclined,
  restoreDeletedMovie,
  softDeleteMovie,
} from './services/movieSync';
import RewatchModal from './components/RewatchModal';
import { MovieDisplayMode } from './utils/movieDisplay';
import { resizeTmdbImage } from './utils/tmdbImage';
import { countCustomVibes, MIN_MOVIES_FOR_VIBES, totalWatchHours } from './utils/movieStats';
import { RELEASE_HISTORY } from './constants/changelog';
import { haptics } from './utils/haptics';
import ErrorBoundary from './components/ErrorBoundary';
import { restoreBackupPreferences, TheBitterBackup } from './utils/dataBackup';
import { getAdvancedArchetype } from './utils/archetypes';
import {
  getSmartTonightPick,
  filterByMoodPreset,
  sortByVibeAxis,
  MoodPreset,
  VibeAxis,
} from './utils/tonightPick';
import MoodPicker from './components/MoodPicker';
import { initAnalytics } from './utils/analytics';
import MovieCard from './components/MovieCard';
import WelcomePage from './components/WelcomePage';
import ConsentModal from './components/ConsentModal';
import { SharedSpace, supabase, getUserSpaces, addMovieToSpace } from './services/supabase';
import ThemeToggle from './components/ThemeToggle';
import NotificationCenter from './components/NotificationCenter';
import { ContextualTooltip } from './components/ContextualTooltip';
import DirectorMoviesModal from './components/DirectorMoviesModal';
import FeedbackModal from './components/FeedbackModal';
import ProfileLinkingModal from './components/ProfileLinkingModal';
import GuidedTour from './components/GuidedTour';
import TourPrompt from './components/TourPrompt';
import { notifySplashReady } from './utils/splash';

const AccountSyncModal = lazy(() => import('./components/AccountSyncModal'));
const AccountMergeModal = lazy(() => import('./components/AccountMergeModal'));
const CinemaSubscriptionSetupModal = lazy(
  () => import('./components/CinemaSubscriptionSetupModal')
);
const CinemaHistoryImportModal = lazy(() => import('./components/CinemaHistoryImportModal'));
const CinemaSubscriptionDetailsModal = lazy(
  () => import('./components/CinemaSubscriptionDetailsModal')
);
import { TOUR_STEPS, RATING_TOUR_STEPS, RATING_TOUR_SEEN_ID } from './constants/tour';

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
const LetterboxdImport = lazy(() => import('./components/LetterboxdImport'));

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
    t,
  }: {
    viewMode: ViewMode;
    setViewMode: (v: ViewMode) => void;
    setIsModalOpen: (o: boolean) => void;
    feedTab: FeedTab;
    setInitialStatusForAdd: (s: MovieStatus) => void;
    movieCount: number;
    t: (key: string, params?: Record<string, string | number>) => string;
  }) => {
    const navItemClass = (isActive: boolean) =>
      `p-3 rounded-full transition-all duration-300 ${isActive ? 'bg-sand dark:bg-[#1a1a1a] text-charcoal dark:text-white shadow-sm opacity-100 scale-105' : 'text-stone-300 dark:text-stone-600 opacity-50 hover:opacity-100'}`;

    return (
      <nav
        className="fixed left-6 right-6 z-50 max-w-sm mx-auto"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)' }}
      >
        <div
          className="bg-white/95 dark:bg-black/95 backdrop-blur-2xl border border-white/20 dark:border-white/10 shadow-2xl rounded-[2.5rem] px-4 py-3.5 flex justify-between items-center transition-colors"
          style={{ willChange: 'transform' }}
        >
          <button
            data-tour="nav-feed"
            onClick={() => {
              haptics.soft();
              setViewMode('Feed');
            }}
            aria-label={t('nav.feed')}
            aria-current={viewMode === 'Feed' ? 'page' : undefined}
            className={navItemClass(viewMode === 'Feed')}
          >
            <LayoutGrid size={22} />
          </button>
          <button
            data-tour="nav-discover"
            onClick={() => {
              haptics.soft();
              setViewMode('Discover');
            }}
            aria-label={t('nav.discover')}
            aria-current={viewMode === 'Discover' ? 'page' : undefined}
            className={navItemClass(viewMode === 'Discover')}
          >
            <Clapperboard size={22} />
          </button>
          <button
            data-tour="nav-add"
            onClick={() => {
              haptics.medium();
              setInitialStatusForAdd(feedTab === 'queue' ? 'watchlist' : 'watched');
              setIsModalOpen(true);
            }}
            aria-label={t('nav.add')}
            className={`bg-forest text-white p-4.5 rounded-full shadow-xl shadow-forest/20 mx-2 active:scale-90 transition-transform duration-150 ${movieCount < 3 ? 'animate-pulse ring-4 ring-forest/20' : ''}`}
          >
            <Plus size={24} strokeWidth={3} />
          </button>
          <button
            data-tour="nav-analytics"
            onClick={() => {
              haptics.soft();
              setViewMode('Analytics');
            }}
            aria-label={t('nav.analytics')}
            aria-current={viewMode === 'Analytics' ? 'page' : undefined}
            className={navItemClass(viewMode === 'Analytics')}
          >
            <PieChart size={22} />
          </button>
          <button
            data-tour="nav-calendar"
            onClick={() => {
              haptics.soft();
              setViewMode('Calendar');
            }}
            aria-label={t('nav.calendar')}
            aria-current={viewMode === 'Calendar' ? 'page' : undefined}
            className={navItemClass(viewMode === 'Calendar')}
          >
            <CalendarDays size={22} />
          </button>
        </div>
      </nav>
    );
  }
);

/**
 * Menu de tri maison : le <select> natif ouvrait le picker système d'iOS au milieu
 * d'une interface entièrement dessinée, et n'affichait pas l'option active.
 */
const SortMenu = memo(
  ({
    value,
    onChange,
    options,
  }: {
    value: SortOption;
    onChange: (v: SortOption) => void;
    options: { value: SortOption; label: string }[];
  }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!open) return;
      const onPointerDown = (e: MouseEvent) => {
        if (!ref.current?.contains(e.target as Node)) setOpen(false);
      };
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setOpen(false);
      };
      document.addEventListener('mousedown', onPointerDown);
      document.addEventListener('keydown', onKeyDown);
      return () => {
        document.removeEventListener('mousedown', onPointerDown);
        document.removeEventListener('keydown', onKeyDown);
      };
    }, [open]);

    const current = options.find((o) => o.value === value) ?? options[0];

    return (
      <div className="relative shrink-0" ref={ref}>
        <button
          onClick={() => {
            haptics.soft();
            setOpen((o) => !o);
          }}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex items-center gap-1.5 bg-stone-100 dark:bg-[#1a1a1a] px-3 py-2 rounded-full"
        >
          <SlidersHorizontal size={12} className="text-stone-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-charcoal dark:text-white">
            {current.label}
          </span>
          <svg
            width="8"
            height="8"
            viewBox="0 0 10 10"
            fill="none"
            className={`text-stone-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          >
            <path
              d="M2 3.5L5 6.5L8 3.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {open && (
          <div
            role="listbox"
            className="absolute right-0 top-full mt-2 z-50 min-w-[150px] bg-white dark:bg-[#1a1a1a] border border-stone-200 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden animate-[fadeIn_0.15s_ease-out]"
          >
            {options.map((o) => (
              <button
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                onClick={() => {
                  haptics.soft();
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors ${
                  o.value === value
                    ? 'bg-stone-100 dark:bg-white/10 text-charcoal dark:text-white'
                    : 'text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-white/5'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
);

const App: React.FC = () => {
  const { t } = useLanguage();
  const STORAGE_KEY = 'the_bitter_profiles_v2';
  const LAST_PROFILE_ID_KEY = 'THE_BITTER_LAST_PROFILE_ID';
  const LAST_SEEN_VERSION_KEY = 'the_bitter_last_seen_version';
  const HIDE_NEW_FEATURES_KEY = 'the_bitter_hide_new_features';
  const SEEN_TOOLTIPS_KEY = 'the_bitter_seen_tooltips';
  const linkedProfileKey = (userId: string) => `bitter_linked_profile_${userId}`;

  const [session, setSession] = useState<any | null>(null);
  /** Session lue au moment de l'exécution, pour les traitements différés. */
  const sessionRef = useRef<any | null>(null);
  sessionRef.current = session;
  const [authLoading, setAuthLoading] = useState(true);
  // Amorçage complet : vérification de session PUIS migration éventuelle. Distinct
  // de `authLoading`, qui retombe dès la session connue pour ne pas retenir l'UI
  // pendant une migration réseau. Sert uniquement à retirer le splash.
  const [bootstrapping, setBootstrapping] = useState(true);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showProfileLinking, setShowProfileLinking] = useState(false);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  /**
   * Profils lus au moment de l'exécution. L'effet de téléchargement ne dépend pas
   * de `profiles` (il bouclerait sur lui-même), il a pourtant besoin de savoir
   * si l'appareil est réellement vierge : sans ce ref il lirait une valeur figée
   * au premier rendu, donc un tableau vide, et recréerait un profil à chaque fois.
   */
  const profilesRef = useRef<UserProfile[]>([]);
  profilesRef.current = profiles;
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  /**
   * Vrai quand l'utilisateur a lui-même demandé le sélecteur de profils.
   *
   * `activeProfileId` à null ne suffit pas à distinguer les deux situations : un
   * appareil vierge et un retour volontaire au sélecteur y ressemblent trait pour
   * trait. Sans ce drapeau, l'effet de téléchargement reconstruisait un profil et
   * le réactivait aussitôt, renvoyant l'utilisateur dans le feed sans qu'il ait pu
   * changer quoi que ce soit, en ajoutant un doublon à chaque tentative.
   */
  const [choosingProfile, setChoosingProfile] = useState(false);
  const choosingProfileRef = useRef(false);
  choosingProfileRef.current = choosingProfile;
  const [viewMode, setViewMode] = useState<ViewMode>('Feed');
  const [feedTab, setFeedTab] = useState<FeedTab>('history');
  // null = l'utilisateur n'a pas encore tranché : on ouvre le bloc dès que la
  // collection est assez fournie pour que les stats disent quelque chose.
  const [showFeedStats, setShowFeedStats] = useState<boolean | null>(null);
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
  const [showTonightControls, setShowTonightControls] = useState(false);
  const [minRatingFilter, setMinRatingFilter] = useState(0);
  const [yearMinFilter, setYearMinFilter] = useState<number | null>(null);
  const [yearMaxFilter, setYearMaxFilter] = useState<number | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [feedPage, setFeedPage] = useState(1);
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
  const [showCalibration, setShowCalibration] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showConsent, setShowConsent] = useState(true);
  const [showCineAssistant, setShowCineAssistant] = useState(false);
  const [deckAdvanceTrigger, setDeckAdvanceTrigger] = useState(0);
  const [showNewFeatures, setShowNewFeatures] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showLetterboxdImport, setShowLetterboxdImport] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    title: string;
    timeoutId: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showRecommendationsModal, setShowRecommendationsModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  // Abonnement cinéma : configuration, rattrapage historique, détail des économies.
  const [showCinemaSetup, setShowCinemaSetup] = useState(false);
  const [showCinemaImport, setShowCinemaImport] = useState(false);
  const [showCinemaDetails, setShowCinemaDetails] = useState(false);
  // Sauvegarde en ligne du profil rattaché.
  const [showAccountSync, setShowAccountSync] = useState(false);
  /**
   * Espaces de l'utilisateur, chargés seulement pour le raccourci « proposer une
   * sortie ». La modale des espaces garde sa propre lecture : elle s'ouvre bien plus
   * souvent que l'onglet des sorties, et n'a pas à dépendre de lui.
   */
  const [mySpaces, setMySpaces] = useState<SharedSpace[]>([]);
  /** Film d'un espace que l'on vient noter, avec le verdict déjà donné s'il existe. */
  const [sharedMovieToRate, setSharedMovieToRate] = useState<any | null>(null);
  const [sharedRatingToEdit, setSharedRatingToEdit] = useState<any | null>(null);
  const [mergeChoice, setMergeChoice] = useState<{ remote: number; local: number } | null>(null);
  /** Films déjà présents sur le compte, pour savoir ce qui reste à envoyer. */
  const [remoteTmdbIds, setRemoteTmdbIds] = useState<Set<number>>(new Set());
  const [rewatchMovie, setRewatchMovie] = useState<Movie | null>(null);
  const [seenTooltips, setSeenTooltips] = useState<string[]>([]);
  // Deux visites guidées : 'main' à la création du profil (découverte des pages),
  // 'rating' à la première ouverture de l'écran d'ajout (notation et Bitter+).
  const [activeTour, setActiveTour] = useState<'main' | 'rating' | null>(null);
  // Les deux parcours démarrent tout seuls : on demande d'abord, on n'impose pas.
  const [pendingTour, setPendingTour] = useState<'main' | 'rating' | null>(null);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const tourSteps = activeTour === 'rating' ? RATING_TOUR_STEPS : TOUR_STEPS;
  const tourStep = activeTour ? tourSteps[tourStepIndex] : null;
  const tourActive = activeTour !== null;
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
    const hideNewFeatures = localStorage.getItem(HIDE_NEW_FEATURES_KEY) === '1';
    if (!hideNewFeatures && lastSeenVersion !== RELEASE_HISTORY[0].version) {
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
    setProfiles((prev) =>
      prev.map((profile) => ({
        ...profile,
        movies: profile.movies.map((movie) => {
          if (movie.status === 'watched' && !movie.watches) {
            const avg =
              (movie.ratings.story +
                movie.ratings.visuals +
                movie.ratings.acting +
                movie.ratings.sound) /
              4;
            return {
              ...movie,
              watches: [
                {
                  id: crypto.randomUUID(),
                  watch_number: 1,
                  watched_at: movie.dateWatched
                    ? new Date(movie.dateWatched).toISOString()
                    : new Date(movie.dateAdded).toISOString(),
                  ratings: movie.ratings,
                  review: movie.review || undefined,
                },
              ],
              watch_count: 1,
              first_rating: avg,
              current_rating: avg,
              avg_rating: avg,
            };
          }
          return movie;
        }),
      }))
    );
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

  // Amorçage terminé : le splash peut s'effacer. Il gère lui-même sa durée
  // plancher, donc on signale simplement dès que possible.
  useEffect(() => {
    if (!bootstrapping) notifySplashReady();
  }, [bootstrapping]);

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
    // La visite guidée pilote elle-même les changements de page : sans ce garde-fou,
    // chaque saut d'étape déclencherait en plus une bulle contextuelle par-dessus.
    if (tourActive) return;

    if (viewMode === 'Analytics' && !seenTooltips.includes('analytics_intro')) {
      showTooltip(
        'analytics_intro',
        t('tooltip.analytics.title'),
        t('tooltip.analytics.content')
      );
    } else if (viewMode === 'Calendar' && !seenTooltips.includes('calendar_intro')) {
      showTooltip(
        'calendar_intro',
        t('tooltip.calendar.title'),
        t('tooltip.calendar.content')
      );
    } else if (viewMode === 'Discover' && !seenTooltips.includes('discover_intro')) {
      showTooltip(
        'discover_intro',
        t('tooltip.discover.title'),
        t('tooltip.discover.content')
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
          t('tooltip.feed.title'),
          t('tooltip.feed.content')
        );
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [viewMode, activeProfile, seenTooltips, tourActive]);

  // C'est l'étape courante qui décide de la page affichée : le tuto se déroule sur
  // la vraie app, pas dans un carrousel. Le parcours notation ne pilote rien — il
  // se joue dans l'écran d'ajout que l'utilisateur vient d'ouvrir lui-même.
  useEffect(() => {
    if (activeTour !== 'main') return;
    const step = TOUR_STEPS[tourStepIndex];
    if (!step) return;

    if (step.page === 'Profile') {
      setShowProfile(true);
    } else if (step.page !== 'AddMovie') {
      setShowProfile(false);
      setViewMode(step.page);
    }
  }, [activeTour, tourStepIndex]);

  // Le parcours notation se déclenche à la première ouverture de l'écran d'ajout,
  // au moment où ses explications servent vraiment. On l'écarte en édition (pas de
  // champ de recherche) et en mode « À voir » (la grille de notation n'est pas rendue).
  useEffect(() => {
    if (!isModalOpen || activeTour !== null || pendingTour !== null) return;
    if (editingMovie || initialStatusForAdd !== 'watched') return;
    if (seenTooltips.includes(RATING_TOUR_SEEN_ID)) return;

    // La modale est chargée en lazy : on la laisse se monter avant de proposer.
    const timer = setTimeout(() => setPendingTour('rating'), 500);
    return () => clearTimeout(timer);
  }, [isModalOpen, activeTour, pendingTour, editingMovie, initialStatusForAdd, seenTooltips]);

  const acceptTour = () => {
    const variant = pendingTour;
    setPendingTour(null);
    if (!variant) return;
    // « Quoi de neuf » s'ouvre aussi au tout premier lancement : les deux se
    // superposeraient sur le même écran.
    setShowNewFeatures(false);
    setTourStepIndex(0);
    setActiveTour(variant);
  };

  const declineTour = () => {
    const variant = pendingTour;
    setPendingTour(null);
    // Refuser le parcours notation le marque comme vu : sans ça, la proposition
    // reviendrait à chaque ouverture de l'écran d'ajout. Il reste relançable
    // depuis les paramètres du profil.
    if (variant === 'rating') {
      setSeenTooltips((prev) =>
        prev.includes(RATING_TOUR_SEEN_ID) ? prev : [...prev, RATING_TOUR_SEEN_ID]
      );
    }
  };

  const finishTour = () => {
    const finished = activeTour;
    setActiveTour(null);

    if (finished === 'rating') {
      // On ne referme pas l'écran d'ajout : l'utilisateur était en train de s'en servir.
      setSeenTooltips((prev) =>
        prev.includes(RATING_TOUR_SEEN_ID) ? prev : [...prev, RATING_TOUR_SEEN_ID]
      );
      return;
    }

    // Ces bulles réexpliqueraient mot pour mot ce que le tuto vient de montrer :
    // on les marque comme vues plutôt que de les enchaîner en doublon.
    setSeenTooltips((prev) => {
      const covered = ['analytics_intro', 'calendar_intro', 'discover_intro'];
      const missing = covered.filter((id) => !prev.includes(id));
      return missing.length > 0 ? [...prev, ...missing] : prev;
    });
  };

  const handleTourNext = () => {
    if (tourStepIndex >= tourSteps.length - 1) {
      finishTour();
      return;
    }
    setTourStepIndex((i) => i + 1);
  };

  const handleTourPrev = () => {
    setTourStepIndex((i) => Math.max(0, i - 1));
  };

  /** Lancement explicite depuis les paramètres du profil : pas de question à poser. */
  const handleStartTour = () => {
    setShowProfile(false);
    // Au tout premier lancement, « Quoi de neuf » s'ouvre aussi : les deux se
    // superposeraient sur le même écran.
    setShowNewFeatures(false);
    setPendingTour(null);
    // Relancer le tuto réarme aussi le parcours notation, reproposé au prochain ajout.
    setSeenTooltips((prev) => prev.filter((id) => id !== RATING_TOUR_SEEN_ID));
    setTourStepIndex(0);
    setActiveTour('main');
  };

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
        /**
         * L'identité vient de l'appareil, jamais du serveur.
         *
         * `profiles.first_name` porte souvent le repli « Utilisateur », écrit à la
         * création du compte alors que le prénom n'était pas encore connu. Le
         * redescendre écrasait le prénom saisi par l'utilisateur, et quand aucun
         * profil local ne portait l'identifiant du compte, il fabriquait en plus un
         * second profil vide dans le sélecteur, qui revenait à chaque connexion.
         */
        let localProfiles: UserProfile[] = [];
        try {
          localProfiles = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch {
          localProfiles = [];
        }
        const linkedLocal = existingLocalProfileId
          ? localProfiles.find((p) => p.id === existingLocalProfileId)
          : undefined;

        // On remonte ce que l'utilisateur a renseigné ici plutôt que de le laisser
        // écraser : identité, mais aussi genre, âge, façon de regarder, plateformes.
        if (linkedLocal) {
          const changed = await syncProfileFieldsToSupabase(
            user.id,
            linkedLocal,
            existingProfile
          );
          if (changed.includes('first_name')) existingProfile.first_name = linkedLocal.firstName;
          if (changed.includes('last_name')) existingProfile.last_name = linkedLocal.lastName || null;
        }

        // Un profil local est déjà rattaché à ce compte, sous un autre identifiant :
        // en créer un second ne ferait qu'encombrer le sélecteur d'un profil vide.
        if (linkedLocal && linkedLocal.id !== existingProfile.id) {
          // On récupère tout de même ce que le serveur a en plus et que cet
          // appareil ignore, typiquement un abonnement réglé ailleurs.
          if (existingProfile.cinema_subscription && !linkedLocal.cinemaSubscription) {
            setProfiles((prev) =>
              prev.map((p) =>
                p.id === linkedLocal.id
                  ? { ...p, cinemaSubscription: existingProfile.cinema_subscription }
                  : p
              )
            );
          }
          return;
        }

        // Profil trouvé → charger normalement
        setProfiles((prev) => {
          const exists = prev.find((p) => p.id === existingProfile.id);
          if (exists) {
            return prev.map((p) =>
              p.id === existingProfile.id
                ? {
                    ...p,
                    // Le local d'abord : le serveur ne sert que de repli.
                    firstName: p.firstName || existingProfile.first_name,
                    lastName: p.lastName || existingProfile.last_name || '',
                    // Réponses de création : le local gagne, le serveur comble.
                    gender: p.gender || existingProfile.gender || undefined,
                    age: p.age ?? existingProfile.age ?? undefined,
                    viewingPreference:
                      p.viewingPreference || existingProfile.viewing_preference || undefined,
                    streamingPlatforms:
                      p.streamingPlatforms?.length
                        ? p.streamingPlatforms
                        : existingProfile.streaming_platforms || undefined,
                    severityIndex: existingProfile.severity_index || p.severityIndex,
                    patienceLevel: existingProfile.patience_level || p.patienceLevel,
                    favoriteGenres: existingProfile.favorite_genres || p.favoriteGenres,
                    role: existingProfile.role || p.role,
                    isOnboarded: existingProfile.is_onboarded || p.isOnboarded,
                    // Le fallback local évite d'effacer un abonnement configuré
                    // avant l'application de la migration SQL côté Supabase.
                    cinemaSubscription:
                      existingProfile.cinema_subscription ?? p.cinemaSubscription,
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
                // Ce que l'utilisateur avait renseigné à la création, récupéré tel
                // quel. Les valeurs en dur d'avant réinventaient un homme de 25 ans
                // à chaque appareil neuf, et faussaient les recommandations.
                gender: existingProfile.gender || undefined,
                age: existingProfile.age ?? undefined,
                viewingPreference: existingProfile.viewing_preference || undefined,
                streamingPlatforms: existingProfile.streaming_platforms || undefined,
                cinemaSubscription: existingProfile.cinema_subscription ?? undefined,
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
      setBootstrapping(false);
      return;
    }

    // Vérifier la session existante
    (supabase.auth as any).getSession().then(async ({ data: { session } }: any) => {
      setSession(session);
      setAuthLoading(false);
      if (session?.user) {
        await loadOrCreateProfile(session.user);
        const result = await migrateLocalStorageToSupabase(session.user.id);
        console.log('[Migration]', result);
        const linkedId = localStorage.getItem(linkedProfileKey(session.user.id)) ?? undefined;
        resyncAllMoviesToSupabase(session.user.id, linkedId);
        if (!linkedId) {
          const localProfiles = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
          if (localProfiles.length === 1) {
            localStorage.setItem(linkedProfileKey(session.user.id), localProfiles[0].id);
            resyncAllMoviesToSupabase(session.user.id, localProfiles[0].id);
          } else if (localProfiles.length > 1) {
            setShowProfileLinking(true);
          }
        }
      }
    })
      // Le callback ci-dessus étant async, `finally` attend bien la fin de la
      // migration. Il se déclenche aussi en cas d'échec : le splash ne doit jamais
      // rester coincé sur une erreur réseau.
      .finally(() => setBootstrapping(false));

    // Écouter les changements d'état
    const {
      data: { subscription },
    } = (supabase.auth as any).onAuthStateChange(async (event: string, session: any) => {
      setSession(session);

      if (event === 'SIGNED_IN' && session?.user) {
        await loadOrCreateProfile(session.user);
        const result = await migrateLocalStorageToSupabase(session.user.id);
        console.log('[Migration]', result);
        const linkedId = localStorage.getItem(linkedProfileKey(session.user.id)) ?? undefined;
        resyncAllMoviesToSupabase(session.user.id, linkedId);
        if (!linkedId) {
          const localProfiles = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
          if (localProfiles.length === 1) {
            localStorage.setItem(linkedProfileKey(session.user.id), localProfiles[0].id);
            resyncAllMoviesToSupabase(session.user.id, localProfiles[0].id);
          } else if (localProfiles.length > 1) {
            setShowProfileLinking(true);
          }
        }
      }

      if (event === 'SIGNED_OUT') {
        setActiveProfileId(null);
      }

      if (event === 'PASSWORD_RECOVERY') {
        // Gérer le reset de mot de passe si nécessaire
        console.log('Password recovery event');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  /*
   * L'effet `loadMySpaces` qui se trouvait ici a été retiré. Il appelait le réseau
   * à chaque montage pour remplir `mySpaces`, un état que rien ne lisait, et sa
   * dépendance `activeProfile?.joinedSpaceIds?.length` portait sur un champ jamais
   * écrit nulle part, donc figée sur undefined. La liste des espaces se charge dans
   * SharedSpacesModal, à l'ouverture, et c'est le seul endroit qui en a besoin.
   */

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setMySpaces([]);
      return;
    }
    let cancelled = false;
    getUserSpaces(userId).then((result) => {
      if (!cancelled) setMySpaces(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  /**
   * Propose une sortie dans un espace, en liste d'envies.
   *
   * C'est ce raccourci qui empêche les sorties d'être une liste que l'on regarde
   * une fois : le film part là où les membres pourront voter pour ou contre.
   */
  const handleProposeToSpace = async (tmdbId: number, space: SharedSpace): Promise<boolean> => {
    const userId = session?.user?.id;
    if (!userId) return false;

    // Deux appels, comme le fait déjà l'ajout de film : le premier donne l'identité
    // du film, le second les champs propres aux espaces (synopsis, durée, casting).
    const base = await getMovieDetailsForAdd(tmdbId);
    if (!base?.title) {
      setToastMessage(t('releases.proposeFailed'));
      return false;
    }
    const extras = await getSharedMovieDetails(tmdbId);

    const result = await addMovieToSpace(
      space.id,
      {
        tmdb_id: tmdbId,
        title: base.title,
        director: base.director,
        year: base.year,
        genre: base.genre,
        poster_url: base.posterUrl,
        status: 'watchlist',
        media_type: 'movie',
        ...extras,
      },
      userId
    );

    if (!result.movie) {
      setToastMessage(result.error ?? t('releases.proposeFailed'));
      return false;
    }

    setToastMessage(t('releases.proposed', { name: space.name }));
    return true;
  };

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

  const handleSaveMovie = (data: MovieFormData, viewingContext?: ViewingContext) => {
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

    // Le contexte de visionnage appartient à la séance : on le pose sur la première,
    // en la créant si le film n'en a pas encore.
    finalMovie = withFirstWatchContext(finalMovie, viewingContext);

    // Recalcul de l'archétype basé sur les films regardés
    const currentProfile = profiles.find((p) => p.id === activeProfileId);
    let newRole: string | undefined;
    if (currentProfile) {
      const updatedMovies = editingMovie
        ? currentProfile.movies.map((m) => (m.id === finalMovie.id ? finalMovie : m))
        : [finalMovie, ...currentProfile.movies];
      const watched = updatedMovies.filter((m) => m.status === 'watched');
      if (watched.length >= 10) {
        const getVibe = (m: Movie, key: 'cerebral' | 'emotion' | 'fun' | 'visual' | 'tension'): number => {
          if (m.vibe) {
            switch (key) {
              case 'cerebral': return m.vibe.story;
              case 'emotion': return m.vibe.emotion;
              case 'fun': return m.vibe.fun;
              case 'visual': return m.vibe.visual;
              case 'tension': return m.vibe.tension;
            }
          }
          switch (key) {
            case 'cerebral': return m.ratings.story;
            case 'emotion': return (m.ratings.story + m.ratings.acting) / 2;
            case 'fun': return m.ratings.acting;
            case 'visual': return m.ratings.visuals;
            case 'tension': return (m.ratings.sound + m.ratings.visuals) / 2;
          }
        };
        const avg = (key: 'cerebral' | 'emotion' | 'fun' | 'visual' | 'tension') =>
          watched.reduce((s, m) => s + getVibe(m, key), 0) / watched.length;
        const result = getAdvancedArchetype({
          vibes: { cerebral: avg('cerebral'), emotion: avg('emotion'), fun: avg('fun'), visual: avg('visual'), tension: avg('tension') },
          quality: { scenario: 5, acting: 5, visual: 5, sound: 5 },
          smartphone: watched.reduce((s, m) => s + (m.smartphoneFactor ?? 0), 0) / watched.length,
          distinctGenreCount: new Set(watched.map((m) => m.genre)).size,
          severityIndex: currentProfile.severityIndex ?? 5,
          rhythmIndex: currentProfile.patienceLevel ?? 5,
        });
        if (result.title !== currentProfile.role) newRole = result.title;
      }
    }

    setProfiles((prev) =>
      prev.map((p) => {
        if (p.id !== activeProfileId) return p;
        let updatedMovies = editingMovie
          ? p.movies.map((m) => (m.id === finalMovie.id ? finalMovie : m))
          : [finalMovie, ...p.movies];
        return { ...p, movies: updatedMovies, ...(newRole ? { role: newRole } : {}) };
      })
    );
    setToastMessage(
      newRole
        ? t('archetype.evolved', { title: newRole })
        : editingMovie
          ? t('feed.movieEdited')
          : data.status === 'watchlist'
            ? t('feed.addedToWatchlist')
            : t('feed.movieAdded')
    );
    setEditingMovie(null);
    setTmdbIdToLoad(null);
    setIsModalOpen(false);
    if (viewMode === 'Deck') setDeckAdvanceTrigger((prev) => prev + 1);
    if (session?.user?.id) syncMovieToSupabase(session.user.id, finalMovie);
  };

  /**
   * Descente serveur : c'est le chemin qui manquait et qui explique que l'historique
   * ne revenait jamais sur un nouvel appareil.
   *
   * Trois précautions :
   * - un échec de lecture renvoie null et on ne touche à rien, une panne réseau ne
   *   doit jamais vider l'écran ;
   * - la fusion garde les films locaux absents du serveur, ils viennent peut-être
   *   d'être ajoutés hors ligne ;
   * - on ne propose de tout réunir que si les deux côtés ont vraiment de la matière,
   *   et seulement si l'utilisateur n'a pas déjà refusé sur CET appareil.
   */
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    let cancelled = false;

    (async () => {
      const result = await fetchRemoteMovies(userId);
      if (cancelled || !result) return;

      const remote = result.movies;
      setRemoteTmdbIds(
        new Set(remote.map((m) => m.tmdbId).filter((id): id is number => id != null))
      );

      // Appareil vierge : aucun profil local, mais un compte qui a de l'historique.
      // On reconstruit le profil à partir du serveur, sinon se connecter depuis
      // l'écran d'accueil ne ramènerait rien et l'app resterait vide.
      if (!activeProfileId) {
        if (remote.length === 0) return;
        // Retour volontaire au sélecteur : on ne le renvoie pas dans le feed.
        // La fusion se fera de toute façon dès qu'il aura choisi un profil.
        if (choosingProfileRef.current) return;

        // `loadOrCreateProfile` a pu créer, à la connexion, un profil vide portant
        // l'identifiant du compte. On y verse les films plutôt que d'en créer un
        // second, sinon l'utilisateur hérite d'un profil fantôme sans aucun film.
        const own = profilesRef.current.find((p) => p.id === userId);
        if (own) {
          setProfiles((prev) =>
            prev.map((p) =>
              p.id === userId ? { ...p, movies: mergeRemoteAndLocal(remote, p.movies) } : p
            )
          );
          setActiveProfileId(userId);
          localStorage.setItem(linkedProfileKey(userId), userId);
          setShowWelcome(false);
          setToastMessage(t('accountSync.restored', { count: String(remote.length) }));
          return;
        }

        const restored: UserProfile = {
          id: crypto.randomUUID(),
          firstName: session.user.email?.split('@')[0] || 'Moi',
          lastName: '',
          movies: remote,
          createdAt: Date.now(),
        };
        setProfiles((prev) => [...prev, restored]);
        setActiveProfileId(restored.id);
        localStorage.setItem(linkedProfileKey(userId), restored.id);
        setShowWelcome(false);
        setToastMessage(t('accountSync.restored', { count: String(remote.length) }));
        return;
      }

      const localBefore = profiles.find((p) => p.id === activeProfileId)?.movies ?? [];

      setProfiles((prev) =>
        prev.map((p) =>
          p.id === activeProfileId ? { ...p, movies: mergeRemoteAndLocal(remote, p.movies) } : p
        )
      );

      const remoteIds = new Set(remote.map((m) => m.tmdbId).filter((id) => id != null));
      const localOnly = localBefore.filter(
        (m) => m.tmdbId != null && !remoteIds.has(m.tmdbId)
      ).length;

      if (remote.length > 0 && localOnly > 0 && !hasDeclinedMerge(userId)) {
        setMergeChoice({ remote: remote.length, local: localOnly });
      }
    })();

    return () => {
      cancelled = true;
    };
    // Volontairement au changement de compte ou de profil actif seulement : relancer
    // à chaque modification de `profiles` provoquerait une boucle de fusion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, activeProfileId]);

  /** Films du profil actif qui ne sont pas encore sur le compte. */
  const pendingSyncCount = useMemo(
    () =>
      (activeProfile?.movies ?? []).filter(
        (m) => m.tmdbId != null && !remoteTmdbIds.has(m.tmdbId)
      ).length,
    [activeProfile?.movies, remoteTmdbIds]
  );

  const runBackfill = async () => {
    const userId = session?.user?.id;
    if (!userId || !activeProfile) {
      return { pushed: 0, failed: [], skippedDeleted: 0, fatalError: 'no-session' };
    }
    const report = await backfillProfileToSupabase(userId, activeProfile.movies);
    // Le compte vient de gagner ces films : on rafraîchit ce qu'on croit distant.
    const refreshed = await fetchRemoteMovies(userId);
    if (refreshed) {
      setRemoteTmdbIds(
        new Set(refreshed.movies.map((m) => m.tmdbId).filter((id): id is number => id != null))
      );
    }
    return report;
  };

  const updateActiveProfile = (updater: (profile: UserProfile) => UserProfile) => {
    if (!activeProfileId) return;
    setProfiles((prev) => prev.map((p) => (p.id === activeProfileId ? updater(p) : p)));
  };

  const handleSaveCinemaSubscription = (subscription: CinemaSubscription) => {
    updateActiveProfile((p) => ({ ...p, cinemaSubscription: subscription }));
    if (session?.user?.id) {
      void syncCinemaSubscriptionToSupabase(session.user.id, subscription);
    }
  };

  /**
   * Suppression de l'abonnement. On retire aussi le rattachement des séances : sans
   * ça, elles resteraient marquées « incluses » avec un identifiant orphelin et
   * seraient recomptées si un nouvel abonnement réutilisait le même id.
   */
  const handleDeleteCinemaSubscription = () => {
    const removedId = activeProfile?.cinemaSubscription?.id;
    updateActiveProfile((p) => {
      const profileSubscriptionId = p.cinemaSubscription?.id;
      const { cinemaSubscription: _removed, ...rest } = p;
      return {
        ...rest,
        movies: !profileSubscriptionId
          ? p.movies
          : p.movies.map((movie) =>
              !movie.watches
                ? movie
                : {
                    ...movie,
                    watches: movie.watches.map((watch) =>
                      watch.viewingContext?.subscriptionId === profileSubscriptionId
                        ? {
                            ...watch,
                            viewingContext: {
                              ...watch.viewingContext,
                              paymentType: 'other' as const,
                              subscriptionId: undefined,
                            },
                          }
                        : watch
                    ),
                  }
        ),
      };
    });
    if (session?.user?.id) {
      void syncCinemaSubscriptionToSupabase(session.user.id);
      if (removedId && activeProfile) {
        const updatedMovies = activeProfile.movies.map((movie) =>
          !movie.watches
            ? movie
            : {
                ...movie,
                watches: movie.watches.map((watch) =>
                  watch.viewingContext?.subscriptionId === removedId
                    ? {
                        ...watch,
                        viewingContext: {
                          ...watch.viewingContext,
                          paymentType: 'other' as const,
                          subscriptionId: undefined,
                        },
                      }
                    : watch
                ),
              }
        );
        void syncMoviesToSupabase(session.user.id, updatedMovies);
      }
    }
    setShowCinemaSetup(false);
    setToastMessage(t('cinemaSub.toast.deleted'));
  };

  /** Complétion de l'historique : chaque séance reçoit le contexte choisi par l'utilisateur. */
  const handleApplyCinemaHistory = (contextsByWatchId: Record<string, ViewingContext>) => {
    const applyContexts = (movies: Movie[]) =>
      movies.map((movie) => {
        if (!movie.watches) return movie;
        return {
          ...movie,
          watches: movie.watches.map((watch) =>
            contextsByWatchId[watch.id]
              ? { ...watch, viewingContext: contextsByWatchId[watch.id] }
              : watch
          ),
        };
      });

    updateActiveProfile((p) => ({
      ...p,
      movies: applyContexts(p.movies),
    }));

    // Les séances changées sont déjà disponibles ici, avant l'écriture async de localStorage.
    if (session?.user?.id && activeProfile) {
      const updatedMovies = applyContexts(activeProfile.movies);
      const changedMovies = updatedMovies.filter((movie) =>
        movie.watches?.some((watch) => !!contextsByWatchId[watch.id])
      );
      void syncMoviesToSupabase(session.user.id, changedMovies);
    }
  };

  const handleLinkProfile = async (profileId: string) => {
    if (!session?.user?.id) return;
    localStorage.setItem(linkedProfileKey(session.user.id), profileId);
    setShowProfileLinking(false);
    const count = await resyncAllMoviesToSupabase(session.user.id, profileId);
    if (count > 0) setToastMessage(`${count} film${count > 1 ? 's' : ''} synchronisé${count > 1 ? 's' : ''} avec ton compte`);
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
      setToastMessage(t('feed.cannotAddToWatchlist'));
    }
  };

  /**
   * Propage une suppression au compte, en suppression douce.
   *
   * La session est lue au moment de l'exécution et non capturée à l'appel : une
   * suppression déclenchée juste avant la fin de la connexion aurait sinon vu une
   * session vide et ne serait jamais remontée.
   */
  const propagateDeletion = async (movie?: Movie) => {
    const userId = sessionRef.current?.user?.id;
    if (!userId || !movie || movie.tmdbId == null) return;

    const ok = await softDeleteMovie(userId, movie.tmdbId);
    if (!ok) {
      // Une synchro qui échoue en silence est ce qui avait masqué le bug d'origine.
      setToastMessage(t('sync.deleteFailed'));
      return;
    }
    setRemoteTmdbIds((prev) => {
      const next = new Set(prev);
      next.delete(movie.tmdbId as number);
      return next;
    });
  };

  const handleDeleteMovie = (id: string) => {
    if (!activeProfileId) return;
    haptics.medium();

    // Si une suppression est déjà en attente, l'exécuter immédiatement avant d'en créer une nouvelle
    if (pendingDelete) {
      clearTimeout(pendingDelete.timeoutId);
      const flushed = activeProfile?.movies.find((m) => m.id === pendingDelete.id);
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === activeProfileId
            ? { ...p, movies: p.movies.filter((m) => m.id !== pendingDelete.id) }
            : p
        )
      );
      // Ce chemin supprimait en local sans jamais prévenir le serveur : le film
      // serait revenu à la première remontée d'historique.
      propagateDeletion(flushed);
    }

    const movie = activeProfile?.movies.find((m) => m.id === id);
    const movieTitle = movie?.title ?? 'Film';

    // Propagation IMMÉDIATE, et non à la fin du délai d'annulation : sur mobile,
    // passer dans une autre application ou verrouiller l'écran suspend les
    // minuteurs, et la requête ne partait jamais. Si l'utilisateur annule,
    // handleUndoDelete lève la suppression côté serveur.
    propagateDeletion(movie);

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

    // La suppression a déjà été propagée au clic : on la lève côté compte.
    const userId = sessionRef.current?.user?.id;
    const restored = activeProfile?.movies.find((m) => m.id === pendingDelete.id);
    if (userId && restored?.tmdbId != null) {
      restoreDeletedMovie(userId, restored.tmdbId);
      setRemoteTmdbIds((prev) => new Set(prev).add(restored.tmdbId as number));
    }

    setPendingDelete(null);
  };

  const handleMarkAsWatched = (movie: Movie) => {
    haptics.medium();
    // Pré-remplir le film avec status 'watched' pour forcer l'onglet "Vu"
    setEditingMovie({ ...movie, status: 'watched' });
    setIsModalOpen(true);
  };

  const handleToggleMovieDisplayMode = (movieId: string, mode: MovieDisplayMode) => {
    setProfiles((prev) =>
      prev.map((p) =>
        p.id !== activeProfileId
          ? p
          : {
              ...p,
              movies: p.movies.map((m) =>
                m.id === movieId ? { ...m, preferred_display_mode: mode } : m
              ),
            }
      )
    );
  };

  const handleSaveRewatch = (watch: MovieWatch) => {
    if (!rewatchMovie || !activeProfileId) return;
    const existingWatches = rewatchMovie.watches ?? [];
    const updatedWatches = [...existingWatches, watch];
    const avgs = updatedWatches.map(
      (item) =>
        (item.ratings.story + item.ratings.visuals + item.ratings.acting + item.ratings.sound) / 4
    );
    const updatedMovie: Movie = {
      ...rewatchMovie,
      watches: updatedWatches,
      watch_count: updatedWatches.length,
      ratings: watch.ratings,
      dateWatched: new Date(watch.watched_at).getTime(),
      first_rating: avgs[0],
      current_rating: avgs[avgs.length - 1],
      avg_rating: avgs.reduce((total, rating) => total + rating, 0) / avgs.length,
    };

    setProfiles((prev) =>
      prev.map((profile) => {
        if (profile.id !== activeProfileId) return profile;
        return {
          ...profile,
          movies: profile.movies.map((movie) =>
            movie.id === rewatchMovie.id ? updatedMovie : movie
          ),
        };
      })
    );
    if (session?.user?.id) void syncMovieToSupabase(session.user.id, updatedMovie);
    setToastMessage('Rewatch enregistré !');
    setRewatchMovie(null);
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

  // Films de la watchlist dont l'ambiance a réellement été renseignée : en dessous
  // du seuil, les moods ne peuvent rien classer et restent verrouillés.
  const watchlistVibeCount = useMemo(
    () => countCustomVibes(uniqueMovies.filter((m) => (m.status || 'watched') === 'watchlist')),
    [uniqueMovies]
  );

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
    const totalHours = totalWatchHours(watched);
    const queueCount = uniqueMovies.filter((m) => (m.status || 'watched') === 'watchlist').length;
    return { watchedCount, avgRating, totalHours, queueCount };
  }, [uniqueMovies, activeProfile]);

  const sortOptions = useMemo(
    () =>
      [
        { value: 'Date' as SortOption, label: t('feed.sortRecent') },
        ...(feedTab === 'history'
          ? [{ value: 'Rating' as SortOption, label: t('feed.sortRating') }]
          : []),
        { value: 'Year' as SortOption, label: t('feed.sortYear') },
        { value: 'Title' as SortOption, label: t('feed.sortAlpha') },
      ],
    [feedTab, t]
  );

  const AUTO_OPEN_STATS_FROM = 5;
  const feedStatsOpen = showFeedStats ?? (feedStats?.watchedCount ?? 0) >= AUTO_OPEN_STATS_FROM;

  // Stats de la file d'attente : sur l'onglet « À voir », le nombre d'heures déjà
  // vues et la moyenne des notes n'ont rien à y faire.
  const queueStats = useMemo(() => {
    const queue = uniqueMovies.filter((m) => (m.status || 'watched') === 'watchlist');
    if (queue.length === 0) return null;
    const oldest = queue.reduce((min, m) => Math.min(min, m.dateAdded), Date.now());
    return {
      count: queue.length,
      totalHours: totalWatchHours(queue),
      waitingDays: Math.max(0, Math.floor((Date.now() - oldest) / 86400000)),
    };
  }, [uniqueMovies]);

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

  const activeCollectionFilterCount =
    activeAdvancedFilterCount +
    ((feedTab === 'history' ? historyGenreFilter !== 'all' : watchlistGenreFilter !== 'all') ? 1 : 0) +
    (sortBy !== 'Date' ? 1 : 0);

  const resetCollectionFilters = () => {
    haptics.soft();
    setHistoryGenreFilter('all');
    setWatchlistGenreFilter('all');
    setMinRatingFilter(0);
    setYearMinFilter(null);
    setYearMaxFilter(null);
    setSortBy('Date');
  };

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

  const visibleMovies = useMemo(
    () => filteredAndSortedMovies.slice(0, feedPage * 20),
    [filteredAndSortedMovies, feedPage]
  );

  // « Note » n'est proposé que sur l'historique : sans ça, passer sur la file
  // laissait un tri actif absent du menu.
  useEffect(() => {
    if (feedTab === 'queue' && sortBy === 'Rating') setSortBy('Date');
  }, [feedTab, sortBy]);

  useEffect(() => {
    setFeedPage(1);
  }, [feedTab, debouncedSearch, historyGenreFilter, watchlistGenreFilter, minRatingFilter, yearMinFilter, yearMaxFilter, sortBy, selectedMood, activeVibeSort]);

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

  const handleImportBackup = async (backup: TheBitterBackup) => {
    if (!activeProfileId) return;

    // Le profil importé remplace le profil local actif. On conserve son ID local :
    // il peut être lié à un compte Supabase et ne fait pas partie des données cinéma à restaurer.
    const restoredProfile: UserProfile = { ...backup.profile, id: activeProfileId };
    const nextProfiles = profiles.map((profile) =>
      profile.id === activeProfileId ? restoredProfile : profile
    );

    restoreBackupPreferences(backup.preferences);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextProfiles));
    localStorage.setItem(LAST_PROFILE_ID_KEY, activeProfileId);
    setProfiles(nextProfiles);
    setShowProfile(false);

    // Le backup contient déjà cinemaSubscription et watches (avec viewingContext).
    // On attend l'écriture distante avant le rechargement pour ne pas perdre ces
    // données si l'utilisateur est connecté.
    if (session?.user?.id) {
      await Promise.all([
        syncCinemaSubscriptionToSupabase(session.user.id, restoredProfile.cinemaSubscription),
        syncMoviesToSupabase(session.user.id, restoredProfile.movies),
      ]);
    }

    // Thème et langue sont initialisés par leurs Contexts : un rechargement les applique
    // immédiatement avec toutes les autres préférences restaurées.
    window.setTimeout(() => window.location.reload(), 0);
  };

  const handleSignOutConfirmed = async () => {
    haptics.medium();
    setShowSignOutConfirm(false);
    if (session) await (supabase?.auth as any).signOut();
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
  // Plus d'écran de connexion : l'app est 100% locale, on arrive directement sur
  // le choix / la création de profil. AuthScreen est conservé pour le jour où la
  // synchronisation de comptes sera de nouveau au point.
  if (showWelcome && !activeProfileId)
    return (
      <div className="relative min-h-screen">
        <WelcomePage
          existingProfiles={profiles}
          onSelectProfile={(id) => {
            setChoosingProfile(false);
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
            setChoosingProfile(false);
            setActiveProfileId(newP.id);
            setShowWelcome(false);
            // Uniquement à la création : sélectionner un profil existant ne propose rien.
            setPendingTour('main');
          }}
          onOpenAccountSync={() => setShowAccountSync(true)}
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

        {/* L'écran d'accueil est un retour anticipé : la modale doit être rendue
            ici aussi, sinon « J'ai déjà un compte » n'ouvrirait rien. */}
        <Suspense fallback={null}>
          {showAccountSync && (
            <AccountSyncModal
              accountEmail={session?.user?.email ?? null}
              accountId={session?.user?.id ?? null}
              isAnonymous={!!session?.user && !session.user.email}
              pendingCount={0}
              onBackfill={runBackfill}
              onClose={() => setShowAccountSync(false)}
            />
          )}
        </Suspense>
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
                    aria-label={t('nav.back')}
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
                {RELEASE_HISTORY[0].version} • {t('app.notes')}
              </button>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <ThemeToggle />
              <NotificationCenter movies={activeProfile?.movies || []} />
              {/* Le feedback vit dans les paramètres du profil : le header n'a de
                  place que pour les actions vraiment fréquentes. */}
              <button
                data-tour="nav-profile"
                onClick={() => {
                  haptics.soft();
                  setShowProfile(true);
                }}
                aria-label={t('nav.profile')}
                /* Un avatar apporte son propre fond : le cercle vert le rognerait
                   et jurerait avec lui. Il ne sert qu'au repli sur l'initiale. */
                className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shadow-md active:scale-90 transition-all overflow-hidden ${
                  avatarSrc(activeProfile?.avatarUrl)
                    ? 'bg-stone-100 dark:bg-[#252525]'
                    : 'bg-forest text-white shadow-forest/20'
                }`}
              >
                {avatarSrc(activeProfile?.avatarUrl) ? (
                  <img
                    src={avatarSrc(activeProfile?.avatarUrl) as string}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (activeProfile?.firstName?.[0]?.toUpperCase() ?? '?')
                )}
              </button>
            </div>
          </div>
        </header>
      )}

      {/* En mode espace partagé le header n'est pas rendu, donc plus personne ne
          réserve la hauteur de l'encoche : le bouton retour se retrouvait dessous,
          hors d'atteinte. C'est ici qu'il faut compenser, pas dans la vue. */}
      <main
        className="flex-1 px-6 pb-32"
        style={{
          paddingTop:
            viewMode === 'SharedSpace'
              ? 'calc(env(safe-area-inset-top, 0px) + 1.5rem)'
              : '1.5rem',
        }}
      >
        {/* Une erreur de rendu effaçait jusqu'ici tout l'écran, sans message ni
            moyen de repartir. La frontière est posée ici plutôt qu'à la racine :
            l'en-tête et la navigation restent debout, donc on peut toujours
            quitter l'écran fautif au lieu d'être coincé dedans.

            La clé sur `viewMode` la remet à zéro à chaque changement de vue :
            sans elle, une erreur survenue une fois resterait affichée même après
            avoir navigué ailleurs. */}
        <ErrorBoundary key={viewMode} where={viewMode === 'SharedSpace' ? 'Espace partagé' : undefined}>
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
              currentUserId={session?.user?.id || ''}
              onBack={handleBackToFeed}
              onAddMovie={() => setIsModalOpen(true)}
              onRateMovie={(movie, existingRating) => {
                setSharedMovieToRate(movie);
                setSharedRatingToEdit(existingRating);
                setIsModalOpen(true);
              }}
              myMovies={activeProfile?.movies ?? []}
              refreshTrigger={sharedSpaceRefreshTrigger}
            />
          ) : viewMode === 'Analytics' ? (
            <AnalyticsView
              movies={uniqueMovies.filter((m) => m.status === 'watched')}
              userProfile={activeProfile}
              onNavigateToCalendar={() => setViewMode('Calendar')}
              onRecalibrate={() => setShowCalibration(true)}
              onViewDirector={(name, id) => setPreviewDirector({ name, id })}
              onViewMovie={(movie) => {
                if (!movie.tmdbId) return;
                setPreviewTmdbId(movie.tmdbId);
                setPreviewMediaType(movie.mediaType ?? 'movie');
              }}
              onConfigureCinemaSubscription={() => setShowCinemaSetup(true)}
              onOpenCinemaDetails={() => setShowCinemaDetails(true)}
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
              spaces={mySpaces}
              onProposeToSpace={handleProposeToSpace}
            />
          ) : viewMode === 'Calendar' ? (
            <CalendarView
              movies={uniqueMovies}
              profileId={session?.user?.id}
              onAddToWatchlist={(tmdbId) => void handleQuickWatchlist(tmdbId, 'movie')}
              onToast={setToastMessage}
            />
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
                <div
                  data-tour="feed-empty"
                  className="flex flex-col items-center justify-center py-12 text-center"
                >
                  <div className="w-24 h-24 bg-white dark:bg-[#1a1a1a] rounded-[2.5rem] border border-sand dark:border-white/5 flex items-center justify-center text-stone-300 dark:text-stone-700 mb-8 shadow-sm transition-colors transition-all animate-bounce">
                    <Film size={40} />
                  </div>
                  <h2 className="text-2xl font-black mb-3 tracking-tighter">
                    {t('feed.startCollection')}
                  </h2>
                  <p className="text-stone-400 dark:text-stone-500 font-medium mb-10 max-w-xs mx-auto text-sm leading-relaxed">
                    {t('feed.startCollectionDesc')}
                  </p>

                  <div className="flex flex-col gap-3 w-full max-w-xs">
                    <button
                      onClick={() => setIsModalOpen(true)}
                      className="bg-charcoal dark:bg-forest text-white px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all hover:scale-105"
                    >
                      <Plus size={18} strokeWidth={3} /> {t('feed.addMovie')}
                    </button>
                    <button
                      onClick={() => setViewMode('Discover')}
                      className="bg-stone-100 dark:bg-[#1a1a1a] text-charcoal dark:text-white px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-widest border border-stone-200 dark:border-white/5 flex items-center justify-center gap-3 active:scale-95 transition-all hover:scale-105"
                    >
                      <Clapperboard size={18} /> {t('common.explore')}
                    </button>
                    {activeProfile && !activeProfile.isOnboarded && (
                      <button
                        onClick={() => { haptics.medium(); setShowCalibration(true); }}
                        className="bg-lime-400 text-black px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-lime-400/20 flex items-center justify-center gap-3 active:scale-95 transition-all hover:scale-105"
                      >
                        <Sparkles size={18} strokeWidth={2.5} /> {t('feed.completeProfile')}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-7">
                  <button
                    type="button"
                    onClick={() => {
                      haptics.soft();
                      setViewMode('Analytics');
                    }}
                    className="flex w-full items-end justify-between border-b border-stone-200/70 pb-4 text-left dark:border-white/10"
                  >
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600">
                        {t('nav.feed')}
                      </p>
                      <h1 className="mt-1 text-3xl font-black tracking-tight text-charcoal dark:text-white">
                        {uniqueMovies.length} {t('feed.filmsLabel')}
                      </h1>
                      <p className="mt-1 text-[11px] font-bold text-stone-400 dark:text-stone-500">
                        {feedStats?.watchedCount ?? 0} {t('feed.watched').toLowerCase()} · {feedStats?.queueCount ?? queueStats?.count ?? 0} {t('feed.toWatch').toLowerCase()}
                      </p>
                    </div>
                    <span className="mb-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500">
                      {t('feed.myStats')} <ChevronRight size={13} strokeWidth={2.5} />
                    </span>
                  </button>
                  <div className="space-y-2">
                    {false && (feedTab === 'history' ? feedStats : queueStats) && (
                    <div className="flex flex-col items-center">
                      <button
                        onClick={() => {
                          haptics.soft();
                          setShowFeedStats(!feedStatsOpen);
                        }}
                        aria-expanded={feedStatsOpen}
                        className="flex items-center gap-1.5 py-1 px-3 text-stone-400 dark:text-stone-600 hover:text-stone-600 dark:hover:text-stone-400 transition-colors"
                      >
                        <span className="text-[9px] font-black uppercase tracking-widest">
                          {t('feed.myStats')}
                        </span>
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                          className={`transition-transform duration-300 ${feedStatsOpen ? 'rotate-180' : ''}`}
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
                        className={`w-full overflow-hidden transition-all duration-300 ease-in-out ${feedStatsOpen ? 'max-h-32 opacity-100 mt-1' : 'max-h-0 opacity-0'}`}
                      >
                        <div className="flex justify-center items-center gap-6 py-3 px-5 bg-stone-50 dark:bg-[#161616] rounded-t-2xl border border-b-0 border-stone-100 dark:border-white/5">
                          {feedTab === 'history' && feedStats ? (
                            <>
                              <div className="text-center">
                                <p className="text-base font-black tracking-tight text-charcoal dark:text-white">
                                  {feedStats.watchedCount}
                                </p>
                                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400">
                                  {t('feed.filmsLabel')}
                                </p>
                              </div>
                              <div className="w-px h-8 bg-stone-200 dark:bg-white/10" />
                              <div className="text-center">
                                <p className="text-base font-black tracking-tight text-charcoal dark:text-white">
                                  {feedStats.avgRating.toFixed(1)}
                                </p>
                                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400">
                                  {t('feed.avgLabel')}
                                </p>
                              </div>
                              <div className="w-px h-8 bg-stone-200 dark:bg-white/10" />
                              <div className="text-center">
                                <p className="text-base font-black tracking-tight text-charcoal dark:text-white">
                                  {feedStats.totalHours}h
                                </p>
                                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400">
                                  {t('feed.watchedHours')}
                                </p>
                              </div>
                            </>
                          ) : queueStats ? (
                            <>
                              <div className="text-center">
                                <p className="text-base font-black tracking-tight text-charcoal dark:text-white">
                                  {queueStats.count}
                                </p>
                                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400">
                                  {t('feed.filmsLabel')}
                                </p>
                              </div>
                              <div className="w-px h-8 bg-stone-200 dark:bg-white/10" />
                              <div className="text-center">
                                <p className="text-base font-black tracking-tight text-charcoal dark:text-white">
                                  {queueStats.totalHours}h
                                </p>
                                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400">
                                  {t('feed.queueHours')}
                                </p>
                              </div>
                              <div className="w-px h-8 bg-stone-200 dark:bg-white/10" />
                              <div className="text-center">
                                <p className="text-base font-black tracking-tight text-charcoal dark:text-white">
                                  {queueStats.waitingDays}j
                                </p>
                                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400">
                                  {t('feed.queueOldest')}
                                </p>
                              </div>
                            </>
                          ) : null}
                        </div>
                        <button
                          onClick={() => {
                            haptics.soft();
                            setViewMode('Analytics');
                          }}
                          className="w-full flex items-center justify-center gap-1.5 py-2 px-5 bg-stone-100 dark:bg-[#111] rounded-b-2xl border border-stone-100 dark:border-white/5 text-[9px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 hover:text-stone-600 dark:hover:text-stone-400 transition-colors"
                        >
                          {t('feed.fullStats')}
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
                        {t('feed.watched')} {feedStats ? `(${feedStats.watchedCount})` : ''}
                      </button>
                      <button
                        onClick={() => {
                          haptics.soft();
                          setFeedTab('queue');
                          setWatchlistGenreFilter('all');
                        }}
                        className={`relative z-10 flex-1 py-3 rounded-full text-[11px] font-bold uppercase tracking-widest transition-colors duration-300 ${feedTab === 'queue' ? 'text-charcoal dark:text-white' : 'text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-400'}`}
                      >
                        {t('feed.toWatch')} {feedStats ? `(${feedStats.queueCount})` : ''}
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
                          {t('feed.emptyWatchlist')}
                        </h3>
                        <p className="text-stone-400 dark:text-stone-500 font-medium text-sm max-w-xs mx-auto leading-relaxed mb-6">
                          {t('feed.emptyWatchlistDesc')}
                        </p>
                        <button
                          onClick={() => setViewMode('Discover')}
                          className="bg-stone-100 dark:bg-[#1a1a1a] text-charcoal dark:text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest border border-stone-200 dark:border-white/5 active:scale-95 transition-all"
                        >
                          {t('common.explore')}
                        </button>
                      </div>
                    )}
                  {feedTab === 'queue' &&
                    activeProfile &&
                    activeProfile.movies.filter((m) => (m.status || 'watched') === 'watchlist')
                      .length > 0 && (
                      <div className="space-y-3 animate-[fadeIn_0.3s_ease-out]">
                        <button
                          type="button"
                          onClick={() => {
                            haptics.soft();
                            setShowTonightControls((open) => !open);
                          }}
                          aria-expanded={showTonightControls}
                          className="w-full rounded-[1.7rem] border border-white/10 bg-charcoal px-5 py-4 text-left text-white shadow-xl shadow-black/10 transition-all active:scale-[0.98] dark:bg-[#1a1a1a]"
                        >
                          <span className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-3">
                              <span className="grid h-10 w-10 place-items-center rounded-full bg-bitter-lime text-charcoal">
                                <Shuffle size={17} strokeWidth={2.5} />
                              </span>
                              <span>
                                <span className="block text-[9px] font-black uppercase tracking-[0.2em] text-bitter-lime">{t('feed.tonight')}</span>
                                <span className="mt-0.5 block text-sm font-black">
                                  {selectedMood ? t('feed.tonightMood', { mood: t(`mood.${selectedMood}`) }) : t('feed.suggestion')}
                                </span>
                              </span>
                            </span>
                            <ChevronRight size={18} className={`text-bitter-lime transition-transform ${showTonightControls ? 'rotate-90' : ''}`} />
                          </span>
                        </button>
                        {showTonightControls && (
                          <div className="space-y-4 rounded-[1.7rem] border border-stone-200/70 bg-white p-4 animate-[fadeIn_0.25s_ease-out] dark:border-white/10 dark:bg-[#161616]">
                            <MoodPicker
                              selectedMood={selectedMood}
                              onSelectMood={setSelectedMood}
                              activeVibeSort={activeVibeSort}
                              onSelectVibeSort={setActiveVibeSort}
                              matchCount={filteredAndSortedMovies.length}
                              vibeCount={watchlistVibeCount}
                              minVibes={MIN_MOVIES_FOR_VIBES}
                            />
                            <button
                              type="button"
                              onClick={handleTonightPick}
                              className="w-full rounded-2xl bg-bitter-lime py-3.5 text-[10px] font-black uppercase tracking-[0.16em] text-charcoal shadow-lg shadow-lime-400/20 active:scale-[0.98] transition-all"
                            >
                              {selectedMood ? t('feed.tonightMood', { mood: t(`mood.${selectedMood}`) }) : t('feed.tonight')}
                            </button>
                        {tonightPick && !isPickAnimating && (
                          <div className="bg-charcoal dark:bg-[#1a1a1a] text-white p-5 rounded-[2rem] shadow-2xl flex gap-4 items-center border border-white/5 animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)]">
                            {tonightPick.posterUrl && (
                              <div className="w-16 h-24 rounded-2xl overflow-hidden shrink-0 shadow-lg">
                                <img
                                  src={resizeTmdbImage(tonightPick.posterUrl, 'w185')}
                                  alt={tonightPick.title}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-[9px] font-black uppercase tracking-widest text-bitter-lime mb-1">
                                {selectedMood
                                  ? `🎯 ${t('feed.moodActive')} : ${t(`mood.${selectedMood}`)}`
                                  : t('feed.suggestion')}
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
                              aria-label={t('common.close')}
                              className="p-2 text-stone-500 hover:text-white transition-colors"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        )}
                          </div>
                        )}
                        {false && watchlistGenres.length > 1 && (
                          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            <button
                              onClick={() => setWatchlistGenreFilter('all')}
                              className={`flex-shrink-0 px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${watchlistGenreFilter === 'all' ? 'bg-charcoal dark:bg-forest text-white border-charcoal shadow-md' : 'bg-white dark:bg-[#1a1a1a] text-stone-400 dark:text-stone-600 border-stone-200 dark:border-white/5'}`}
                            >
                              {t('common.all')}
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

                  {false && feedTab === 'history' && historyGenres.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 animate-[fadeIn_0.3s_ease-out]">
                      <button
                        onClick={() => setHistoryGenreFilter('all')}
                        className={`flex-shrink-0 px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${historyGenreFilter === 'all' ? 'bg-charcoal dark:bg-forest text-white border-charcoal shadow-md' : 'bg-white dark:bg-[#1a1a1a] text-stone-400 dark:text-stone-600 border-stone-200 dark:border-white/5'}`}
                      >
                        {t('common.all')}
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
                        {feedTab === 'history' ? t('feed.filmsWatched') : t('feed.toWatchLabel')} (
                        {filteredAndSortedMovies.length})
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search
                          size={14}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                        />
                        <input
                          ref={searchInputRef}
                          type="search"
                          placeholder={t('feed.search')}
                          className="w-full bg-stone-100 dark:bg-[#1a1a1a] border border-transparent focus:border-stone-200 dark:focus:border-white/10 py-3 pl-9 pr-8 rounded-full font-medium text-xs outline-none transition-all text-charcoal dark:text-white"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            aria-label={t('feed.clearFilter')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-charcoal dark:hover:text-white"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          haptics.soft();
                          setShowAdvancedFilters((open) => !open);
                        }}
                        aria-expanded={showAdvancedFilters}
                        className={`grid h-10 min-w-10 place-items-center rounded-full border px-3 text-[10px] font-black uppercase tracking-widest transition-colors ${showAdvancedFilters || activeCollectionFilterCount > 0 ? 'border-forest bg-forest text-white dark:border-bitter-lime dark:bg-bitter-lime dark:text-charcoal' : 'border-stone-200 bg-white text-stone-500 dark:border-white/10 dark:bg-[#1a1a1a] dark:text-stone-400'}`}
                      >
                        <span className="flex items-center gap-1.5"><SlidersHorizontal size={14} /> <span className="hidden sm:inline">{t('feed.filters')}</span>{activeCollectionFilterCount > 0 && <span>· {activeCollectionFilterCount}</span>}</span>
                      </button>
                    </div>

                    {/* ── FILTRES AVANCÉS ── */}
                    <div className="hidden">
                      <button
                        onClick={() => setShowAdvancedFilters((p) => !p)}
                        className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${showAdvancedFilters || activeAdvancedFilterCount > 0 ? 'text-forest dark:text-bitter-lime' : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'}`}
                      >
                        <Filter size={11} />
                        {t('feed.filters')}
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
                          {t('feed.clearFilter')}
                        </button>
                      )}
                    </div>

                    {activeCollectionFilterCount > 0 && (
                      <div className="flex flex-wrap items-center gap-2 animate-[fadeIn_0.2s_ease-out]">
                        {(feedTab === 'history' ? historyGenreFilter : watchlistGenreFilter) !== 'all' && (
                          <span className="rounded-full bg-stone-100 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-stone-500 dark:bg-[#1a1a1a] dark:text-stone-400">
                            {feedTab === 'history' ? historyGenreFilter : watchlistGenreFilter}
                          </span>
                        )}
                        {minRatingFilter > 0 && <span className="rounded-full bg-stone-100 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-stone-500 dark:bg-[#1a1a1a] dark:text-stone-400">{minRatingFilter}+</span>}
                        {(yearMinFilter !== null || yearMaxFilter !== null) && <span className="rounded-full bg-stone-100 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-stone-500 dark:bg-[#1a1a1a] dark:text-stone-400">{yearMinFilter ?? yearBounds.min}–{yearMaxFilter ?? yearBounds.max}</span>}
                        {sortBy !== 'Date' && <span className="rounded-full bg-stone-100 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-stone-500 dark:bg-[#1a1a1a] dark:text-stone-400">{sortOptions.find((option) => option.value === sortBy)?.label}</span>}
                        <button type="button" onClick={resetCollectionFilters} className="grid h-7 w-7 place-items-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-charcoal dark:hover:bg-white/10 dark:hover:text-white" aria-label={t('feed.clearFilters')}><X size={13} strokeWidth={3} /></button>
                      </div>
                    )}

                    {showAdvancedFilters && (
                      <div className="bg-white dark:bg-[#1a1a1a] border border-sand dark:border-white/5 rounded-2xl p-4 space-y-5 animate-[fadeIn_0.2s_ease-out]">
                        <div className="grid grid-cols-2 gap-3">
                          <label className="space-y-2">
                            <span className="block text-[10px] font-black uppercase tracking-widest text-stone-400">
                              {t('profileModal.genre')}
                            </span>
                            <select
                              value={feedTab === 'history' ? historyGenreFilter : watchlistGenreFilter}
                              onChange={(event) => {
                                if (feedTab === 'history') setHistoryGenreFilter(event.target.value);
                                else setWatchlistGenreFilter(event.target.value);
                              }}
                              className="w-full appearance-none rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-xs font-bold text-charcoal outline-none focus:border-forest dark:border-white/10 dark:bg-[#111] dark:text-white dark:focus:border-bitter-lime"
                            >
                              <option value="all">{t('common.all')}</option>
                              {(feedTab === 'history' ? historyGenres : watchlistGenres).map((genre) => (
                                <option key={genre} value={genre}>{genre}</option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-2">
                            <span className="block text-[10px] font-black uppercase tracking-widest text-stone-400">
                              {t('feed.sortRecent')}
                            </span>
                            <select
                              value={sortBy}
                              onChange={(event) => setSortBy(event.target.value as SortOption)}
                              className="w-full appearance-none rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-xs font-bold text-charcoal outline-none focus:border-forest dark:border-white/10 dark:bg-[#111] dark:text-white dark:focus:border-bitter-lime"
                            >
                              {sortOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                        {/* Note minimum */}
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                              {t('feed.minRating')}
                            </span>
                            <span className="text-xs font-black text-charcoal dark:text-white">
                              {minRatingFilter > 0 ? `${minRatingFilter}+` : t('feed.allRatings')}
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
                            {t('feed.period')}
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
                              -
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
                        {activeCollectionFilterCount > 0 && (
                          <div className="flex justify-end border-t border-stone-100 pt-4 dark:border-white/5">
                            <button
                              type="button"
                              onClick={resetCollectionFilters}
                              className="text-[10px] font-black uppercase tracking-widest text-stone-400 transition-colors hover:text-charcoal dark:hover:text-white"
                            >
                              {t('feed.clearFilters')}
                            </button>
                          </div>
                        )}
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
                      <h3 className="text-base font-black tracking-tight mb-2">{t('feed.noResults')}</h3>
                      <p className="text-stone-400 dark:text-stone-500 font-medium text-sm max-w-xs mx-auto leading-relaxed mb-4">
                        {t('feed.noResultsDesc')}
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
                        {t('feed.clearFilters')}
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-8">
                      {visibleMovies.map((movie, index) => (
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
                          onRewatch={(m) => setRewatchMovie(m)}
                          onToggleDisplayMode={handleToggleMovieDisplayMode}
                        />
                      ))}
                      {visibleMovies.length < filteredAndSortedMovies.length && (
                        <button
                          onClick={() => setFeedPage((p) => p + 1)}
                          className="w-full py-3 text-xs font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 border border-stone-200 dark:border-white/5 rounded-2xl active:scale-95 transition-all"
                        >
                          {t('feed.loadMore')} · {filteredAndSortedMovies.length - visibleMovies.length}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Suspense>
        </ErrorBoundary>
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
        t={t}
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
              {t('app.undoDelete')}
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
              // Opt-out durable : plus aucune ouverture automatique, y compris aux
              // prochaines versions (le tutoriel reste accessible depuis le profil).
              localStorage.setItem(HIDE_NEW_FEATURES_KEY, '1');
            }}
          />
        )}
        {rewatchMovie && (
          <RewatchModal
            movie={rewatchMovie}
            onClose={() => setRewatchMovie(null)}
            onSave={handleSaveRewatch}
            cinemaSubscription={activeProfile?.cinemaSubscription}
          />
        )}
        {isModalOpen && (
          <AddMovieModal
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false);
              setEditingMovie(null);
              setTmdbIdToLoad(null);
              setSharedMovieToRate(null);
              setSharedRatingToEdit(null);
            }}
            onSave={handleSaveMovie}
            initialData={editingMovie}
            tmdbIdToLoad={tmdbIdToLoad}
            initialMediaType={mediaTypeToLoad}
            initialStatus={initialStatusForAdd}
            sharedSpace={viewMode === 'SharedSpace' ? activeSharedSpace : null}
            sharedMovieToRate={sharedMovieToRate}
            sharedRatingToEdit={sharedRatingToEdit}
            currentUserId={session?.user?.id}
            onSharedMovieAdded={() => setSharedSpaceRefreshTrigger((prev) => prev + 1)}
            onToast={setToastMessage}
            cinemaSubscription={activeProfile?.cinemaSubscription}
            tourForceBitterPlus={
              activeTour === 'rating' && !!tourStep?.id.startsWith('bitterplus')
            }
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
            userId={session?.user?.id || ''}
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
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 7rem)' }}
            aria-label={t('app.recosFABLabel')}
          >
            <Sparkles size={22} className="animate-sparkle" />
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
              setChoosingProfile(true);
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
            onImportBackup={handleImportBackup}
            onOpenSpaces={() => { setShowProfile(false); setShowSharedSpaces(true); }}
            onLetterboxdImport={() => { setShowProfile(false); setShowLetterboxdImport(true); }}
            onReplayTour={handleStartTour}
            onSendFeedback={() => {
              setShowProfile(false);
              setShowFeedbackModal(true);
            }}
            accountEmail={session?.user?.email ?? null}
            isSignedIn={!!session?.user}
            pendingSyncCount={pendingSyncCount}
            onOpenAccountSync={() => {
              setShowProfile(false);
              setShowAccountSync(true);
            }}
            onAvatarChange={async (descriptor) => {
              // Local d'abord : l'avatar doit changer à l'écran même sans compte,
              // et même si l'écriture distante échoue.
              updateActiveProfile((p) => ({ ...p, avatarUrl: descriptor ?? undefined }));

              const userId = session?.user?.id;
              if (!userId || !supabase) return;
              await supabase
                .from('profiles')
                .update({ avatar_url: descriptor, updated_at: new Date().toISOString() })
                .eq('id', userId);
            }}
            cinemaSubscription={activeProfile.cinemaSubscription}
            onManageCinemaSubscription={() => {
              setShowProfile(false);
              setShowCinemaSetup(true);
            }}
          />
        )}

        {showLetterboxdImport && activeProfile && (
          <LetterboxdImport
            userId={session?.user?.id || activeProfile.id}
            onImportMovies={(importedMovies) => {
              let addedCount = 0;
              setProfiles((prev) =>
                prev.map((p) => {
                  if (p.id !== activeProfileId) return p;
                  // IDs already in the watched list — can't import again
                  const watchedTmdbIds = new Set(
                    p.movies.filter((m) => m.status === 'watched').map((m) => m.tmdbId).filter(Boolean)
                  );
                  const newMovies = importedMovies.filter((m) => !m.tmdbId || !watchedTmdbIds.has(m.tmdbId));
                  addedCount = newMovies.length;
                  // Remove from watchlist any movie now being imported as watched
                  const importedTmdbIds = new Set(newMovies.map((m) => m.tmdbId).filter(Boolean));
                  const remainingMovies = p.movies.filter(
                    (m) => m.status !== 'watchlist' || !m.tmdbId || !importedTmdbIds.has(m.tmdbId)
                  );
                  return { ...p, movies: [...newMovies, ...remainingMovies] };
                })
              );
              setToastMessage(`${addedCount} film${addedCount !== 1 ? 's' : ''} importé${addedCount !== 1 ? 's' : ''} depuis Letterboxd !`);
            }}
            onClose={() => setShowLetterboxdImport(false)}
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
                {t('app.signOutTitle')}
              </h3>
              <p className="text-sm font-medium text-stone-500 dark:text-stone-400 leading-relaxed">
                {t('app.signOutDesc')}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleSignOutConfirmed}
                className="w-full py-5 rounded-[1.8rem] font-black text-sm uppercase tracking-widest bg-red-500 text-white shadow-xl shadow-red-500/20 active:scale-[0.98] transition-all"
              >
                {t('app.signOutConfirm')}
              </button>
              <button
                onClick={() => {
                  haptics.soft();
                  setShowSignOutConfirm(false);
                }}
                className="w-full py-5 rounded-[1.8rem] font-black text-sm uppercase tracking-widest bg-stone-100 dark:bg-[#202020] text-charcoal dark:text-white active:scale-[0.98] transition-all"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showFeedbackModal && (
        <FeedbackModal isOpen onClose={() => setShowFeedbackModal(false)} />
      )}

      <Suspense fallback={null}>
        {showAccountSync && (
          <AccountSyncModal
            accountEmail={session?.user?.email ?? null}
            accountId={session?.user?.id ?? null}
            isAnonymous={!!session?.user && !session.user.email}
            pendingCount={pendingSyncCount}
            onBackfill={runBackfill}
            onClose={() => setShowAccountSync(false)}
          />
        )}

        {mergeChoice && (
          <AccountMergeModal
            remoteCount={mergeChoice.remote}
            localCount={mergeChoice.local}
            onMerge={runBackfill}
            onKeepSeparate={() => {
              if (session?.user?.id) rememberMergeDeclined(session.user.id);
              setMergeChoice(null);
            }}
            onDone={() => setMergeChoice(null)}
          />
        )}

        {showCinemaSetup && (
          <CinemaSubscriptionSetupModal
            existing={activeProfile?.cinemaSubscription}
            onSave={handleSaveCinemaSubscription}
            onDelete={
              activeProfile?.cinemaSubscription ? handleDeleteCinemaSubscription : undefined
            }
            onClose={() => setShowCinemaSetup(false)}
            onImportHistory={() => {
              setShowCinemaSetup(false);
              setShowCinemaImport(true);
            }}
          />
        )}

        {showCinemaImport && activeProfile?.cinemaSubscription && (
          <CinemaHistoryImportModal
            movies={activeProfile.movies}
            subscription={activeProfile.cinemaSubscription}
            onConfirm={handleApplyCinemaHistory}
            onClose={() => setShowCinemaImport(false)}
            onSeeStats={() => {
              setShowCinemaImport(false);
              setViewMode('Analytics');
            }}
          />
        )}

        {showCinemaDetails && activeProfile?.cinemaSubscription && (
          <CinemaSubscriptionDetailsModal
            movies={activeProfile.movies}
            subscription={activeProfile.cinemaSubscription}
            onClose={() => setShowCinemaDetails(false)}
            onManage={() => {
              setShowCinemaDetails(false);
              setShowCinemaSetup(true);
            }}
          />
        )}
      </Suspense>

      {showProfileLinking && session && (
        <ProfileLinkingModal
          profiles={profiles}
          onLink={handleLinkProfile}
          onSkip={() => setShowProfileLinking(false)}
        />
      )}

      {pendingTour && !activeTour && (
        <TourPrompt
          variant={pendingTour}
          stepCount={(pendingTour === 'rating' ? RATING_TOUR_STEPS : TOUR_STEPS).length}
          onAccept={acceptTour}
          onDecline={declineTour}
        />
      )}

      {tourStep && (
        <GuidedTour
          step={tourStep}
          stepIndex={tourStepIndex}
          totalSteps={tourSteps.length}
          onNext={handleTourNext}
          onPrev={handleTourPrev}
          onSkip={finishTour}
        />
      )}
    </div>
  );
};

export default App;
