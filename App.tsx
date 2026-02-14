import React, { useState, useEffect, useMemo, lazy, Suspense, memo, useRef } from 'react';
import { Plus, Search, SlidersHorizontal, X, LayoutGrid, PieChart, Clock, CheckCircle2, Sparkles, PiggyBank, Radar, Activity, Heart, User, LogOut, Clapperboard, Wand2, CalendarDays, BarChart3, Hourglass, ArrowDown, Film, FlaskConical, Target, Instagram, Loader2, Star, Tags, ChevronLeft, MessageSquareText, Users, Globe, Info, Check, Shuffle } from 'lucide-react';
import { GENRES, TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from './constants';
import { Movie, MovieFormData, MovieStatus, UserProfile } from './types';
import { RELEASE_HISTORY } from './constants/changelog';
import { haptics } from './utils/haptics';
import { initAnalytics } from './utils/analytics';
import MovieCard from './components/MovieCard';
import WelcomePage from './components/WelcomePage';
import ConsentModal from './components/ConsentModal';
import { SharedSpace, supabase, getUserSpaces } from './services/supabase';
// Removed problematic import: import { Session } from '@supabase/supabase-js';
import AuthScreen from './components/AuthScreen';
import TutorialOverlay from './components/TutorialOverlay';
import { syncMovies, saveMovieToSupabase, deleteMovieFromSupabase } from './services/movieSync';

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

type SortOption = 'Date' | 'Rating' | 'Year' | 'Title';
type ViewMode = 'Feed' | 'Analytics' | 'Discover' | 'Calendar' | 'Deck' | 'SharedSpace';
type FeedTab = 'history' | 'queue';

const BottomNav = memo(({ viewMode, setViewMode, setIsModalOpen, feedTab, setInitialStatusForAdd }: { 
  viewMode: ViewMode, 
  setViewMode: (v: ViewMode) => void,
  setIsModalOpen: (o: boolean) => void,
  feedTab: FeedTab,
  setInitialStatusForAdd: (s: MovieStatus) => void
}) => {
    if (viewMode === 'SharedSpace') return null; // Hide bottom nav in shared space view for cleaner UI
    return (
        <nav 
          className="fixed left-6 right-6 z-50 max-w-sm mx-auto"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)' }}
        >
            <div className="bg-white/95 backdrop-blur-2xl border border-white/20 shadow-2xl rounded-[2.5rem] px-6 py-3.5 flex justify-between items-center" style={{ willChange: 'transform' }}>
            <button onClick={() => { haptics.soft(); setViewMode('Feed'); }} className={`p-3 rounded-full transition-colors duration-200 ${viewMode === 'Feed' ? 'bg-sand text-charcoal shadow-sm' : 'text-stone-300'}`}><LayoutGrid size={22} /></button>
            <button onClick={() => { haptics.soft(); setViewMode('Discover'); }} className={`p-3 rounded-full transition-colors duration-200 ${viewMode === 'Discover' ? 'bg-sand text-charcoal shadow-sm' : 'text-stone-300'}`}><Clapperboard size={22} /></button>
            <button onClick={() => { 
              haptics.medium(); 
              setInitialStatusForAdd(feedTab === 'queue' ? 'watchlist' : 'watched');
              setIsModalOpen(true); 
            }} className="bg-forest text-white p-4.5 rounded-full shadow-xl shadow-forest/20 mx-2 active:scale-90 transition-transform duration-150"><Plus size={24} strokeWidth={3} /></button>
            <button onClick={() => { haptics.soft(); setViewMode('Analytics'); }} className={`p-3 rounded-full transition-colors duration-200 ${viewMode === 'Analytics' ? 'bg-sand text-charcoal shadow-sm' : 'text-stone-300'}`}><PieChart size={22} /></button>
            <button onClick={() => { haptics.soft(); setViewMode('Calendar'); }} className={`p-3 rounded-full transition-colors duration-200 ${viewMode === 'Calendar' ? 'bg-sand text-charcoal shadow-sm' : 'text-stone-300'}`}><CalendarDays size={22} /></button>
            </div>
        </nav>
    );
});

const App: React.FC = () => {
  // STORAGE KEYS
  const STORAGE_KEY = 'the_bitter_profiles_v2';
  const LAST_PROFILE_ID_KEY = 'THE_BITTER_LAST_PROFILE_ID';
  const NEVER_SHOW_V0_73_KEY = 'the_bitter_never_show_v076';

  // SUPABASE SESSION STATE
  // Fixed: Use any for session state to avoid missing Session type error
  const [session, setSession] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // GUEST MODE STATE
  const [isGuestMode, setIsGuestMode] = useState(false);

  const [showWelcome, setShowWelcome] = useState(true);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  
  const [viewMode, setViewMode] = useState<ViewMode>('Feed');
  const [feedTab, setFeedTab] = useState<FeedTab>('history');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('Date');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [editingMovie, setEditingMovie] = useState<Movie | null>(null);
  const [tmdbIdToLoad, setTmdbIdToLoad] = useState<number | null>(null);
  const [initialStatusForAdd, setInitialStatusForAdd] = useState<MovieStatus>('watched');
  
  // Watchlist enhanced states
  const [watchlistGenreFilter, setWatchlistGenreFilter] = useState<string>('all');
  const [tonightPick, setTonightPick] = useState<Movie | null>(null);
  const [isPickAnimating, setIsPickAnimating] = useState(false);

  // New State for Media Type handling (Films vs Series)
  const [mediaTypeToLoad, setMediaTypeToLoad] = useState<'movie' | 'tv'>('movie');
  
  // New State for Movie Details
  const [previewTmdbId, setPreviewTmdbId] = useState<number | null>(null);
  const [previewMediaType, setPreviewMediaType] = useState<'movie' | 'tv'>('movie');
  
  // Collaborative Features
  const [showSharedSpaces, setShowSharedSpaces] = useState(false);
  const [activeSharedSpace, setActiveSharedSpace] = useState<SharedSpace | null>(null);
  const [sharedSpaceRefreshTrigger, setSharedSpaceRefreshTrigger] = useState(0);
  const [mySpaces, setMySpaces] = useState<SharedSpace[]>([]);
  
  const [showCalibration, setShowCalibration] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showConsent, setShowConsent] = useState(true);
  const [showCineAssistant, setShowCineAssistant] = useState(false);
  const [deckAdvanceTrigger, setDeckAdvanceTrigger] = useState(0);
  
  // New Feature Announcement State
  const [showNewFeatures, setShowNewFeatures] = useState(false);

  // Tutorial State
  const TUTORIAL_DONE_KEY = 'the_bitter_tutorial_done';
  const [showTutorial, setShowTutorial] = useState(false);
  const pendingTutorialRef = useRef(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const activeProfile = useMemo(() => profiles.find(p => p.id === activeProfileId) || null, [profiles, activeProfileId]);

  // --- INITIAL LOAD EFFECT ---
  useEffect(() => {
    // 1. Charger les profils locaux
    const savedProfiles = localStorage.getItem(STORAGE_KEY);
    let loadedProfiles: UserProfile[] = [];
    if (savedProfiles) {
      try { 
        loadedProfiles = JSON.parse(savedProfiles);
        setProfiles(loadedProfiles); 
      } catch (e) { 
        console.error("Error loading profiles", e);
      }
    }

    // 2. Vérifier le dernier profil actif (Priorité UX)
    const lastProfileId = localStorage.getItem(LAST_PROFILE_ID_KEY);
    if (lastProfileId) {
      const exists = loadedProfiles.some(p => p.id === lastProfileId);
      if (exists) {
        console.log('🟢 Dernier profil trouvé et chargé:', lastProfileId);
        setActiveProfileId(lastProfileId);
        setShowWelcome(false);
        setViewMode('Feed');
      } else {
        // Le lastProfileId n'existe plus dans les profils locaux
        console.warn('⚠️ Dernier profil introuvable, nettoyage localStorage');
        localStorage.removeItem(LAST_PROFILE_ID_KEY);
      }
    }
    
    // 3. Check for New Features Announcement
    const neverShowAgain = localStorage.getItem(NEVER_SHOW_V0_73_KEY);
    if (neverShowAgain !== 'true') {
        setShowNewFeatures(true);
    }
  }, []);

  // --- PERSIST ACTIVE PROFILE ID ---
  useEffect(() => {
    if (activeProfileId) {
      localStorage.setItem(LAST_PROFILE_ID_KEY, activeProfileId);
    }
  }, [activeProfileId]);

  // --- PERSIST PROFILES LIST ---
  useEffect(() => {
    if (profiles.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    }
  }, [profiles]);

  // Trigger Tutorial after Deck
  useEffect(() => {
    if (viewMode === 'Feed' && pendingTutorialRef.current) {
        pendingTutorialRef.current = false;
        // Petit délai pour laisser le temps au Feed de s'afficher
        setTimeout(() => setShowTutorial(true), 500);
    }
  }, [viewMode]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const handleTutorialComplete = () => {
    setShowTutorial(false);
    localStorage.setItem(TUTORIAL_DONE_KEY, 'true');
    haptics.success();
  };

  // Chargement du profil Supabase vers le state local
  const loadSupabaseProfile = async (userId: string) => {
    if (!supabase) return;
    
    console.log('📥 Tentative de chargement du profil Supabase:', userId);
    
    try {
      // 1. Fetch Profile Metadata
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error("Erreur chargement profil Supabase:", error);
        return;
      }
      
      if (data) {
        console.log('✅ Profil Supabase chargé pour:', data.first_name);

        // 2. SYNC MOVIES
        // Lecture directe du localStorage pour éviter les problèmes de fermeture de state
        const savedProfilesStr = localStorage.getItem(STORAGE_KEY);
        let localMovies: Movie[] = [];
        if (savedProfilesStr) {
            try {
                const savedProfiles = JSON.parse(savedProfilesStr);
                const p = savedProfiles.find((p: any) => p.id === userId);
                if (p) localMovies = p.movies || [];
            } catch(e) {}
        }
        
        // Sync avec Supabase (migration si nécessaire)
        const syncedMovies = await syncMovies(userId, localMovies);
        
        setProfiles(prev => {
          const existing = prev.find(p => p.id === data.id);
          
          if (existing) {
            console.log('🔄 Mise à jour du profil existant + Films Synced');
            return prev.map(p => p.id === data.id ? {
              ...p,
              firstName: data.first_name,
              lastName: data.last_name || p.lastName,
              severityIndex: data.severity_index || p.severityIndex,
              patienceLevel: data.patience_level || p.patienceLevel,
              favoriteGenres: data.favorite_genres || p.favoriteGenres,
              role: data.role || p.role,
              isOnboarded: data.is_onboarded || p.isOnboarded,
              joinedSpaceIds: p.joinedSpaceIds,
              movies: syncedMovies // Utilisation des films synchronisés
            } : p);
          } else {
            console.log('➕ Ajout d\'un nouveau profil mail + Films Synced');
            return [...prev, {
              id: data.id,
              firstName: data.first_name,
              lastName: data.last_name || '',
              movies: syncedMovies, // Utilisation des films synchronisés
              createdAt: new Date(data.created_at).getTime(),
              severityIndex: data.severity_index || 5,
              patienceLevel: data.patience_level || 5,
              favoriteGenres: data.favorite_genres || [],
              role: data.role,
              isOnboarded: data.is_onboarded || false,
              gender: 'h',
              age: 25
            }];
          }
        });
        
        // 🔥 LOGIQUE CRITIQUE : Respecter le lastProfileId (Priorité UX)
        const lastProfileId = localStorage.getItem(LAST_PROFILE_ID_KEY);
        console.log('🔍 Recherche de cohérence. Dernier ID stocké:', lastProfileId);

        setActiveProfileId(current => {
          console.log('🔍 Profil actuellement en mémoire (React):', current);
          
          if (current) {
            return current;
          }
          
          if (lastProfileId) {
            return lastProfileId;
          }
          
          return data.id;
        });
      }
    } catch (err) {
      console.error("Exception loading profile", err);
    }
  };

  // --- AUTH CHECK EFFECT ---
  useEffect(() => {
    if (supabase) {
      // Fixed: Cast auth to any to bypass missing getSession property error
      (supabase.auth as any).getSession().then(({ data: { session } }: any) => {
        setSession(session);
        setAuthLoading(false);
        if (session?.user) {
          loadSupabaseProfile(session.user.id);
        }
      });

      // Fixed: Cast auth to any to bypass missing onAuthStateChange property error
      const {
        data: { subscription },
      } = (supabase.auth as any).onAuthStateChange((_event: any, session: any) => {
        setSession(session);
        if (session?.user) {
          loadSupabaseProfile(session.user.id);
        }
      });

      return () => subscription.unsubscribe();
    } else {
        setAuthLoading(false);
    }
  }, []);

  // Load Joined Spaces
  useEffect(() => {
    const loadMySpaces = async () => {
        if (session?.user?.id) {
            const spaces = await getUserSpaces(session.user.id);
            setMySpaces(spaces);
        } else if (activeProfile?.joinedSpaceIds && activeProfile.joinedSpaceIds.length > 0) {
            const spaces = await getUserSpaces(activeProfile.id);
            setMySpaces(spaces);
        }
    };
    if (activeProfile) {
        loadMySpaces();
    }
  }, [activeProfile?.id, activeProfile?.joinedSpaceIds?.length, session]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (activeProfile && !showWelcome && !activeProfile.isOnboarded) {
      setShowCalibration(true);
    }
  }, [activeProfile, showWelcome]);

  // Fix: changed data.favorite_genres to data.favoriteGenres to match the type definition
  const handleCompleteCalibration = (data: { name: string; severityIndex: number; patienceLevel: number; favoriteGenres: string[]; role: string }) => {
    if (!activeProfileId) return;
    setProfiles(prev => prev.map(p => {
      if (p.id !== activeProfileId) return p;
      return { 
        ...p, 
        firstName: data.name, 
        severityIndex: data.severityIndex, 
        patienceLevel: data.patienceLevel, 
        favoriteGenres: data.favoriteGenres, 
        role: data.role, 
        isOnboarded: true 
      };
    }));
    setShowCalibration(false);
    setViewMode('Deck');
    
    // Marquer qu'un tuto est en attente (se déclenchera quand le user quittera le Deck)
    const tutorialDone = localStorage.getItem(TUTORIAL_DONE_KEY);
    if (tutorialDone !== 'true') {
        pendingTutorialRef.current = true;
    }

    haptics.success();
  };

  const handleSaveMovie = (data: MovieFormData) => {
    if (!activeProfileId) return;

    const hasRatings = data.ratings && (
      data.ratings.story > 0 || 
      data.ratings.visuals > 0 || 
      data.ratings.acting > 0 || 
      data.ratings.sound > 0
    );

    const determinedStatus: MovieStatus = hasRatings ? 'watched' : (data.status || 'watchlist');
    
    // Création de l'objet final AVANT mise à jour du state pour l'envoyer à Supabase
    let finalMovie: Movie;

    // Générer l'ID une seule fois (utilisé pour localStorage ET Supabase)
    const newMovieId = crypto.randomUUID();
    const newMovieTimestamp = Date.now();

    if (editingMovie) {
        finalMovie = { ...editingMovie, ...data, status: determinedStatus };
    } else {
        finalMovie = { 
          ...data, 
          id: newMovieId, 
          dateAdded: newMovieTimestamp,
          status: determinedStatus
        };
    }

    setProfiles(prev => prev.map(p => {
      if (p.id !== activeProfileId) return p;
      let updatedMovies = [...p.movies];
      
      if (editingMovie) {
        updatedMovies = updatedMovies.map(m => 
          m.id === finalMovie.id ? finalMovie : m
        );
      } else {
        updatedMovies = [finalMovie, ...updatedMovies];
      }
      return { ...p, movies: updatedMovies };
    }));

    // SAUVEGARDE DB SI CONNECTÉ
    if (session?.user?.id === activeProfileId) {
        const movieForSupabase: Movie = editingMovie 
            ? { ...editingMovie, ...data, status: determinedStatus }
            : { ...data, id: newMovieId, dateAdded: newMovieTimestamp, status: determinedStatus };
        
        saveMovieToSupabase(movieForSupabase, activeProfileId);
    }

    // Toast de confirmation
    if (editingMovie) {
      setToastMessage('Film modifié ✓');
    } else if (data.status === 'watchlist' || (!data.ratings?.story && !data.ratings?.visuals && !data.ratings?.acting && !data.ratings?.sound)) {
      setToastMessage('Ajouté à ta watchlist ✓');
    } else {
      setToastMessage('Film ajouté ✓');
    }

    setEditingMovie(null);
    setTmdbIdToLoad(null);
    setIsModalOpen(false);
    if (viewMode === 'Deck') {
      setDeckAdvanceTrigger(prev => prev + 1);
    }
  };

  const handleDeleteMovie = (id: string) => {
    if (!activeProfileId) return;
    
    setProfiles(prev => prev.map(p => 
      p.id === activeProfileId ? {...p, movies: p.movies.filter(m => m.id !== id)} : p
    ));

    // SUPPRESSION DB SI CONNECTÉ
    if (session?.user?.id === activeProfileId) {
        deleteMovieFromSupabase(id);
    }
  };

  const watchlistGenres = useMemo(() => {
    if (!activeProfile) return [];
    const genres = activeProfile.movies
      .filter(m => (m.status || 'watched') === 'watchlist')
      .map(m => m.genre)
      .filter(Boolean);
    return [...new Set(genres)];
  }, [activeProfile]);

  const filteredAndSortedMovies = useMemo(() => {
    if (!activeProfile) return [];
    const targetStatus: MovieStatus = feedTab === 'history' ? 'watched' : 'watchlist';
    
    return activeProfile.movies
      .filter(m => {
        const matchesStatus = (m.status || 'watched') === targetStatus;
        if (!matchesStatus) return false;
        
        // Filtre genre (watchlist uniquement)
        if (feedTab === 'queue' && watchlistGenreFilter !== 'all' && m.genre !== watchlistGenreFilter) {
          return false;
        }
        
        if (!debouncedSearch) return true;
        const q = debouncedSearch.toLowerCase();
        return m.title.toLowerCase().includes(q) || m.director.toLowerCase().includes(q);
      })
      .sort((a, b) => {
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
  }, [activeProfile, sortBy, debouncedSearch, feedTab, watchlistGenreFilter]);

  const handleTonightPick = () => {
    if (!activeProfile) return;
    const watchlist = activeProfile.movies.filter(m => (m.status || 'watched') === 'watchlist');
    if (watchlist.length === 0) return;
    
    haptics.medium();
    setIsPickAnimating(true);
    
    // Animation : cycle rapide de films pendant 1.5s puis ralentit
    let count = 0;
    const maxCycles = 12;
    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * watchlist.length);
      setTonightPick(watchlist[randomIndex]);
      count++;
      if (count >= maxCycles) {
        clearInterval(interval);
        // Sélection finale
        const finalIndex = Math.floor(Math.random() * watchlist.length);
        setTonightPick(watchlist[finalIndex]);
        setTimeout(() => setIsPickAnimating(false), 300);
      }
    }, 120);
  };

  const handleBackToFeed = () => {
    haptics.soft();
    if (viewMode === 'SharedSpace') {
        setActiveSharedSpace(null);
    }
    setViewMode('Feed');
  };

  const handleSignOut = async () => {
    haptics.medium();
    
    // Confirmation avant déconnexion pour éviter les erreurs
    const confirmSignOut = window.confirm("Souhaitez-vous vraiment vous déconnecter ? Vos profils locaux resteront accessibles sur cet appareil.");
    if (!confirmSignOut) return;

    if (session) {
        // Fixed: Cast auth to any to bypass missing signOut property error
        await (supabase?.auth as any).signOut();
    }
    
    // Reset complet de l'état applicatif
    setIsGuestMode(false);
    setActiveProfileId(null);
    setSession(null);
    setShowWelcome(true);
    setViewMode('Feed');
    setActiveSharedSpace(null);
    
    // Nettoyage de la persistance session
    localStorage.removeItem(LAST_PROFILE_ID_KEY);
  };

  // --- RENDER GATES ---

  if (authLoading) {
      return (
        <div className="min-h-screen bg-cream flex items-center justify-center">
             <Loader2 size={32} className="animate-spin text-forest" />
        </div>
      );
  }

  if (!session && !isGuestMode && !activeProfileId) {
      return <AuthScreen onContinueAsGuest={() => setIsGuestMode(true)} />;
  }

  if (showWelcome && !activeProfileId) return (
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
                isOnboarded: false 
              };
              setProfiles(p => [...p, newP]);
              setActiveProfileId(newP.id);
              setShowWelcome(false);
          }} 
          onDeleteProfile={id => {
            setProfiles(prev => {
              const updated = prev.filter(x => x.id !== id);
              if (activeProfileId === id) {
                setActiveProfileId(null);
                localStorage.removeItem(LAST_PROFILE_ID_KEY);
              }
              return updated;
            });
          }} 
      />
      {showConsent && <ConsentModal onAccept={() => { haptics.success(); setShowConsent(false); initAnalytics(); }} />}
    </div>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col text-charcoal font-sans relative overflow-x-hidden bg-cream">
      {/* Keyframe pour shimmer (si non présent en global) */}
      <style>{`
        @keyframes shimmer {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `}</style>

      {viewMode !== 'SharedSpace' && (
        <header 
          className="px-6 sticky top-0 z-40 bg-cream/95 backdrop-blur-xl border-b border-sand/40"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)' }}
        >
            <div className="flex items-center justify-between h-12 max-w-2xl mx-auto w-full" style={{ willChange: 'transform' }}>
            <div className="flex items-center gap-3">
                {viewMode !== 'Feed' ? (
                <button 
                    onClick={handleBackToFeed}
                    className="w-10 h-10 bg-white border border-sand rounded-2xl flex items-center justify-center shadow-soft active:scale-90 transition-transform duration-200"
                >
                    <ChevronLeft size={20} strokeWidth={3} />
                </button>
                ) : (
                <div 
                    onClick={() => { haptics.soft(); setShowChangelog(true); }}
                    className="w-10 h-10 bg-charcoal text-white rounded-2xl flex items-center justify-center shadow-lg rotate-3 cursor-pointer hover:rotate-0 transition-all duration-300 active:scale-95"
                >
                    <Film size={20} strokeWidth={2} />
                </div>
                )}
                <div>
                    <h1 className="text-xl font-black tracking-tighter leading-none text-charcoal">The Bitter</h1>
                    <button 
                        onClick={() => { haptics.soft(); setShowChangelog(true); }}
                        className="text-[9px] font-black uppercase tracking-widest text-stone-400 hover:text-forest transition-colors duration-200"
                    >
                        {RELEASE_HISTORY[0].version} • Notes
                    </button>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button 
                onClick={() => { 
                    haptics.soft(); 
                    if (!session) {
                        alert("Cette fonctionnalité nécessite un compte en ligne.");
                        return;
                    }
                    setShowSharedSpaces(true); 
                }} 
                className={`relative w-10 h-10 rounded-2xl border flex items-center justify-center shadow-soft active:scale-90 transition-transform duration-200 ${!session ? 'bg-stone-50 border-stone-100 text-stone-300' : 'bg-white border-sand text-charcoal'} group`}
                >
                <Users size={20} className="group-hover:scale-110 transition-transform" />
                {mySpaces.length > 0 && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-forest text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-sm">
                    {mySpaces.length}
                    </div>
                )}
                </button>
                
                {/* Bouton pour réactiver le tuto */}
                <button
                  onClick={() => {
                    haptics.soft();
                    localStorage.removeItem(TUTORIAL_DONE_KEY);
                    setShowTutorial(true);
                  }}
                  className="w-10 h-10 rounded-2xl bg-white border border-sand flex items-center justify-center shadow-soft active:scale-90 transition-transform duration-200 text-stone-400 hover:text-forest"
                  title="Revoir le tutoriel"
                >
                  <Info size={20} />
                </button>

                <button 
                  onClick={() => { 
                    haptics.soft(); 
                    // Pour changer de profil, on réinitialise l'actif pour forcer l'affichage de WelcomePage
                    setActiveProfileId(null);
                    localStorage.removeItem(LAST_PROFILE_ID_KEY);
                    setShowWelcome(true);
                    setViewMode('Feed');
                  }} 
                  className="w-10 h-10 rounded-2xl bg-white border border-sand flex items-center justify-center shadow-soft active:scale-90 transition-transform duration-200"
                >
                  <User size={20} />
                </button>
                <button onClick={handleSignOut} className="w-10 h-10 rounded-2xl bg-stone-100 border border-sand flex items-center justify-center shadow-soft active:scale-90 transition-transform duration-200 text-stone-400">
                <LogOut size={20} />
                </button>
            </div>
            </div>
        </header>
      )}

      <main className={`flex-1 px-6 ${viewMode === 'SharedSpace' ? 'pt-6' : 'pt-6'} pb-32`}>
        <Suspense fallback={<div className="flex-1 flex items-center justify-center py-20"><Loader2 className="animate-spin text-stone-300" size={32} /></div>}>
          {viewMode === 'SharedSpace' && activeSharedSpace ? (
              <Suspense fallback={
                <div className="flex items-center justify-center min-h-screen">
                  <div className="text-center">
                    <Loader2 className="animate-spin text-forest mx-auto mb-4" size={40} />
                    <p className="text-sm text-stone-500 font-medium animate-pulse">Chargement de l'espace partagé...</p>
                  </div>
                </div>
              }>
                <SharedSpaceView 
                    space={activeSharedSpace}
                    currentUserId={session?.user?.id || activeProfile?.id || ''}
                    onBack={handleBackToFeed}
                    onAddMovie={() => { setIsModalOpen(true); }}
                    refreshTrigger={sharedSpaceRefreshTrigger}
                />
              </Suspense>
          ) : viewMode === 'Analytics' ? (
            <AnalyticsView movies={activeProfile?.movies.filter(m => m.status === 'watched') || []} userProfile={activeProfile} onNavigateToCalendar={() => setViewMode('Calendar')} onRecalibrate={() => setShowCalibration(true)} />
          ) : viewMode === 'Discover' ? (
            <DiscoverView 
              onSelectMovie={(id, type) => { setTmdbIdToLoad(id); setMediaTypeToLoad(type); setIsModalOpen(true); }} 
              onPreview={(id, type) => { setPreviewTmdbId(id); setPreviewMediaType(type); }}
              userProfile={activeProfile} 
            />
          ) : viewMode === 'Calendar' ? (
            <CalendarView movies={activeProfile?.movies || []} />
          ) : viewMode === 'Deck' ? (
            <MovieDeck 
              onRate={(id) => { setTmdbIdToLoad(id); setMediaTypeToLoad('movie'); setIsModalOpen(true); }} 
              onClose={() => setViewMode('Feed')} 
              favoriteGenres={activeProfile?.favoriteGenres} 
              advanceTrigger={deckAdvanceTrigger}
            />
          ) : (
            <div className="max-w-md mx-auto w-full space-y-8 animate-[fadeIn_0.3s_ease-out]">
              {(!activeProfile || activeProfile.movies.length === 0) ? (
                 <div className="flex flex-col items-center justify-center py-24 text-center">
                      <div className="w-24 h-24 bg-stone-50 rounded-[2.5rem] flex items-center justify-center text-stone-300 mb-8 shadow-sm"><Film size={40} /></div>
                      <h2 className="text-2xl font-black mb-3 tracking-tighter">Démarrez votre collection</h2>
                      <p className="text-stone-400 font-medium mb-10 max-w-xs mx-auto text-sm leading-relaxed">Ajoutez des films pour voir vos statistiques d'analyste.</p>
                      <button onClick={() => { haptics.medium(); setViewMode('Discover'); }} className="bg-charcoal text-white px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center gap-3 active:scale-95 transition-all">
                          <Plus size={18} strokeWidth={3} /> Explorer
                      </button>
                 </div>
              ) : (
                 <div className="space-y-10">
                    <div className="flex justify-center w-full">
                      <div className="bg-stone-100 p-1.5 rounded-full flex w-full max-w-[280px] shadow-inner border border-stone-200/50">
                          <button onClick={() => { haptics.soft(); setFeedTab('history'); setWatchlistGenreFilter('all'); }} className={`flex-1 py-3.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${feedTab === 'history' ? 'bg-white text-charcoal shadow-md scale-[1.02]' : 'text-stone-400 hover:text-stone-500'}`}>Vu</button>
                          <button onClick={() => { haptics.soft(); setFeedTab('queue'); setWatchlistGenreFilter('all'); }} className={`flex-1 py-3.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${feedTab === 'queue' ? 'bg-white text-charcoal shadow-md scale-[1.02]' : 'text-stone-400 hover:text-stone-500'}`}>À voir</button>
                      </div>
                    </div>

                    {/* Enhanced Watchlist Controls */}
                    {feedTab === 'queue' && activeProfile && activeProfile.movies.filter(m => (m.status || 'watched') === 'watchlist').length > 0 && (
                      <div className="space-y-5 animate-[fadeIn_0.3s_ease-out]">
                        
                        {/* Bouton "Ce soir ?" */}
                        <button
                          onClick={handleTonightPick}
                          className="w-full bg-bitter-lime text-charcoal py-5 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-lime-400/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3 relative overflow-hidden"
                        >
                          <span className="relative z-10 flex items-center gap-3">
                            <Shuffle size={18} strokeWidth={2.5} />
                            Ce soir ?
                          </span>
                        </button>
                        
                        {/* Film sélectionné */}
                        {tonightPick && !isPickAnimating && (
                          <div className="bg-charcoal text-white p-5 rounded-[2rem] shadow-2xl animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] flex gap-4 items-center">
                            {tonightPick.posterUrl && (
                              <div className="w-16 h-24 rounded-2xl overflow-hidden shrink-0 shadow-lg">
                                <img src={tonightPick.posterUrl} alt={tonightPick.title} className="w-full h-full object-cover" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-[9px] font-black uppercase tracking-widest text-bitter-lime mb-1">🎲 The Bitter suggère</p>
                              <h4 className="font-black text-lg tracking-tight truncate">{tonightPick.title}</h4>
                              <p className="text-[10px] text-stone-400 font-bold mt-1">
                                {tonightPick.director} • {tonightPick.year} • {tonightPick.genre}
                              </p>
                            </div>
                            <button 
                              onClick={() => setTonightPick(null)} 
                              className="p-2 text-stone-500 hover:text-white transition-colors shrink-0"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        )}
                        
                        {/* Animation de cycle */}
                        {isPickAnimating && tonightPick && (
                          <div className="bg-stone-100 p-5 rounded-[2rem] flex gap-4 items-center animate-pulse">
                            <div className="w-16 h-24 rounded-2xl overflow-hidden shrink-0 bg-stone-200">
                              {tonightPick.posterUrl && (
                                <img src={tonightPick.posterUrl} alt="" className="w-full h-full object-cover opacity-60" />
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="text-[9px] font-black uppercase tracking-widest text-forest mb-1">🎰 Sélection en cours...</p>
                              <h4 className="font-black text-lg tracking-tight truncate text-charcoal">{tonightPick.title}</h4>
                            </div>
                          </div>
                        )}
                        
                        {/* Filtre par genre (chips) */}
                        {watchlistGenres.length > 1 && (
                          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            <button
                              onClick={() => { haptics.soft(); setWatchlistGenreFilter('all'); }}
                              className={`flex-shrink-0 px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${
                                watchlistGenreFilter === 'all'
                                  ? 'bg-charcoal text-white border-charcoal shadow-md'
                                  : 'bg-white text-stone-400 border-stone-200'
                              }`}
                            >
                              Tous
                            </button>
                            {watchlistGenres.map(genre => (
                              <button
                                key={genre}
                                onClick={() => { haptics.soft(); setWatchlistGenreFilter(genre); }}
                                className={`flex-shrink-0 px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${
                                  watchlistGenreFilter === genre
                                    ? 'bg-charcoal text-white border-charcoal shadow-md'
                                    : 'bg-white text-stone-400 border-stone-200'
                                }`}
                              >
                                {genre}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="relative group">
                      <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-stone-300 group-focus-within:text-charcoal transition-colors" />
                      <input 
                        type="text" 
                        placeholder="Rechercher dans ma collection..." 
                        className="w-full bg-white border border-sand p-5 pl-14 rounded-2xl font-black text-sm outline-none focus:border-stone-200 shadow-sm transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>

                    <div className="flex items-center justify-between border-b border-sand pb-4">
                       <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-300">
                          {feedTab === 'history' ? 'Films Vus' : 'À Voir'} ({filteredAndSortedMovies.length})
                       </h2>
                       <div className="flex items-center gap-2">
                           <SlidersHorizontal size={12} className="text-stone-300" />
                           <select value={sortBy} onChange={(e) => { haptics.soft(); setSortBy(e.target.value as SortOption); }} className="bg-transparent text-[10px] font-black uppercase text-charcoal outline-none cursor-pointer tracking-widest">
                              <option value="Date">Récents</option>
                              {feedTab === 'history' && <option value="Rating">Note</option>}
                              <option value="Year">Année</option>
                              <option value="Title">A-Z</option>
                           </select>
                       </div>
                    </div>

                    <div className="grid grid-cols-1 gap-8">
                        {filteredAndSortedMovies.map((movie, index) => (
                            <MovieCard 
                              key={movie.id} 
                              movie={movie} 
                              index={index} 
                              onDelete={handleDeleteMovie} 
                              onEdit={m => { setEditingMovie(m); setIsModalOpen(true); }}
                            />
                        ))}
                    </div>
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
            setMediaTypeToLoad('movie'); 
            setIsModalOpen(true); 
        }} 
        feedTab={feedTab} 
        setInitialStatusForAdd={setInitialStatusForAdd} 
      />

      {!showWelcome && activeProfile && viewMode !== 'SharedSpace' && (
        <button 
          onClick={() => { haptics.medium(); setShowCineAssistant(true); }}
          className="fixed bottom-32 right-6 z-50 w-16 h-16 bg-forest text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all group overflow-hidden"
        >
          <Sparkles size={24} fill="currentColor" className="group-hover:rotate-12 transition-transform" />
          <div className="absolute -top-1 -right-1 bg-bitter-lime text-charcoal text-[8px] font-black px-1.5 py-0.5 rounded-full border-2 border-white shadow-sm">AI</div>
        </button>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div 
          className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[200] animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]"
        >
          <div className="bg-charcoal text-white px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-2.5 border border-white/10">
            <div className="w-5 h-5 bg-forest rounded-full flex items-center justify-center shrink-0">
              <Check size={12} strokeWidth={3} />
            </div>
            <span className="text-sm font-bold tracking-tight">{toastMessage}</span>
          </div>
        </div>
      )}

      <Suspense fallback={<div className="fixed inset-0 z-[200] bg-charcoal/20 backdrop-blur-sm flex items-center justify-center"><Loader2 className="animate-spin text-white" size={48} /></div>}>
        {showTutorial && (
          <TutorialOverlay
            steps={[
              {
                title: "Bienvenue 👋",
                icon: <Film size={24} />,
                desc: (
                  <div className="space-y-3">
                    <p>The Bitter, c'est ton journal de cinéma. Tu notes chaque film que tu vois et on te dit quel type de cinéphile tu es.</p>
                    <p className="text-xs opacity-70">Voyons comment ça marche en 2 minutes.</p>
                  </div>
                )
              },
              {
                title: "La Home",
                icon: <LayoutGrid size={24} />,
                highlight: true,
                desc: (
                  <div className="space-y-3">
                    <p>Ta page d'accueil t'affiche :</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start gap-2">
                        <span className="font-black text-base">🎬</span>
                        <span><strong>Ton dernier film vu</strong> en grand avec son affiche</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-black text-base">🔢</span>
                        <span><strong>Tes compteurs :</strong> nombre de films vus et heures de cinéma</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-black text-base">📋</span>
                        <span><strong>Vu / À voir :</strong> bascule entre tes films déjà notés et ta watchlist</span>
                      </div>
                    </div>
                  </div>
                )
              },
              {
                title: "Ajouter un film",
                icon: <Plus size={24} />,
                desc: (
                  <div className="space-y-3">
                    <p>Appuie sur le <strong>bouton vert +</strong> au centre de la barre du bas pour ajouter un film.</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start gap-2">
                        <span className="font-black text-base">🔍</span>
                        <span><strong>Tape le titre</strong> — on cherche automatiquement dans la base TMDB</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-black text-base">📝</span>
                        <span><strong>Sélectionne un résultat</strong> — l'affiche, le réalisateur et le synopsis sont remplis pour toi</span>
                      </div>
                    </div>
                  </div>
                )
              },
              {
                title: "L'Analyse Bitter 🧪",
                icon: <FlaskConical size={24} />,
                highlight: true,
                desc: (
                  <div className="space-y-3">
                    <p>C'est le cœur de l'app ! Active le toggle <strong>"Analyse Bitter"</strong> pour noter un film en profondeur :</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start gap-2">
                        <span className="font-black text-base">✍️</span>
                        <span><strong>4 critères qualité</strong> — Écriture, Interprétation, Esthétique, Univers Sonore</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-black text-base">📱</span>
                        <span><strong>Indice de Distraction</strong> — Combien de temps sur ton tel pendant le film ?</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-black text-base">🎭</span>
                        <span><strong>4 vibes</strong> — Émotion, Tension, Divertissement, Cérébral</span>
                      </div>
                    </div>
                    <p className="text-xs opacity-70">C'est grâce à ces notes qu'on construit ton profil cinéphile.</p>
                  </div>
                )
              },
              {
                title: "Découvrir",
                icon: <Clapperboard size={24} />,
                desc: (
                  <div className="space-y-3">
                    <p>L'onglet <strong>Découvrir</strong> (2ème icône en bas) te propose :</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start gap-2">
                        <span className="font-black text-base">🔥</span>
                        <span><strong>Les tendances</strong> — Films populaires du moment</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-black text-base">🎲</span>
                        <span><strong>Des recommandations</strong> — Basées sur tes genres favoris</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-black text-base">👆</span>
                        <span>Appuie sur un film pour voir sa fiche, puis <strong>ajoute-le</strong> à ta collection ou watchlist</span>
                      </div>
                    </div>
                  </div>
                )
              },
              {
                title: "Ton Analyse 📊",
                icon: <PieChart size={24} />,
                highlight: true,
                desc: (
                  <div className="space-y-3">
                    <p>L'onglet <strong>Analytics</strong> (4ème icône) révèle ton profil cinéphile avec 3 sous-pages :</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start gap-2">
                        <span className="font-black text-base">🪪</span>
                        <span><strong>Mon Profil</strong> — Ton archétype (Intello, Popcorn, Esthète...) + tops réalisateurs/acteurs</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-black text-base">⭐</span>
                        <span><strong>Mes Goûts</strong> — Tes moyennes par critère, si tu notes sévèrement ou non</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-black text-base">🧬</span>
                        <span><strong>Mon ADN</strong> — Ce que tu recherches vraiment dans un film</span>
                      </div>
                    </div>
                    <p className="text-xs opacity-70">Plus tu notes de films, plus c'est précis !</p>
                  </div>
                )
              },
              {
                title: "Calendrier",
                icon: <CalendarDays size={24} />,
                desc: (
                  <div className="space-y-3">
                    <p>Le <strong>Calendrier</strong> (dernière icône) te montre mois par mois quand tu as regardé chaque film.</p>
                    <p className="text-sm">📅 Chaque point représente un film vu ce jour-là. Appuie dessus pour voir lequel.</p>
                  </div>
                )
              },
              {
                title: "L'assistant IA ✨",
                icon: <Sparkles size={24} />,
                highlight: true,
                desc: (
                  <div className="space-y-3">
                    <p>Tu vois le <strong>bouton vert flottant</strong> en bas à droite avec l'étiquette "AI" ?</p>
                    <p>C'est ton <strong>CinéAssistant</strong> : pose-lui une question, demande une recommandation, ou discute de tes goûts. Il connaît toute ta collection !</p>
                    <p className="text-xs opacity-70">Tu peux relancer ce tutoriel à tout moment via le bouton ℹ️ dans le header.</p>
                  </div>
                )
              }
            ]}
            onComplete={handleTutorialComplete}
          />
        )}

        {showNewFeatures && (
            <NewFeaturesModal 
                onClose={() => setShowNewFeatures(false)} 
                onNeverShowAgain={() => {
                    setShowNewFeatures(false);
                    localStorage.setItem(NEVER_SHOW_V0_73_KEY, 'true');
                }}
            />
        )}

        {isModalOpen && (
          <AddMovieModal 
            isOpen={isModalOpen} 
            onClose={() => { setIsModalOpen(false); setEditingMovie(null); setTmdbIdToLoad(null); }} 
            onSave={handleSaveMovie} 
            initialData={editingMovie} 
            tmdbIdToLoad={tmdbIdToLoad}
            initialMediaType={mediaTypeToLoad}
            initialStatus={initialStatusForAdd}
            sharedSpace={viewMode === 'SharedSpace' ? activeSharedSpace : null}
            currentUserId={session?.user?.id || activeProfile?.id}
            onSharedMovieAdded={() => setSharedSpaceRefreshTrigger(prev => prev + 1)}
          />
        )}
        
        {previewTmdbId && (
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
          />
        )}

        {showChangelog && <ChangelogModal isOpen={showChangelog} onClose={() => setShowChangelog(false)} />}
        
        {showSharedSpaces && activeProfile && (
          <SharedSpacesModal
            isOpen={showSharedSpaces}
            onClose={() => setShowSharedSpaces(false)}
            userId={session?.user?.id || activeProfile.id}
            onSelectSpace={(space) => {
              if (activeProfile && !activeProfile.joinedSpaceIds?.includes(space.id)) {
                setProfiles(prev => prev.map(p => {
                  if (p.id !== activeProfileId) return p;
                  return {
                    ...p,
                    joinedSpaceIds: [...(p.joinedSpaceIds || []), space.id]
                  };
                }));
              }
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
              setMediaTypeToLoad('movie');
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
      </Suspense>
    </div>
  );
};

export default App;