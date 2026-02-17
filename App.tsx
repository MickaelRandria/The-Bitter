import { Plus, Search, SlidersHorizontal, X, LayoutGrid, PieChart, Clock, CheckCircle2, Sparkles, PiggyBank, Radar, Activity, Heart, User, LogOut, Clapperboard, Wand2, CalendarDays, BarChart3, Hourglass, ArrowDown, Film, FlaskConical, Target, Instagram, Loader2, Star, Tags, ChevronLeft, MessageSquareText, Users, Globe, Info, Check, Shuffle } from 'lucide-react';
import React, { useState, useEffect, useMemo, lazy, Suspense, memo, useRef } from 'react';
import { GENRES, TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from './constants';
import { Movie, MovieFormData, MovieStatus, UserProfile } from './types';
import { RELEASE_HISTORY } from './constants/changelog';
import { haptics } from './utils/haptics';
import { initAnalytics } from './utils/analytics';
import MovieCard from './components/MovieCard';
import WelcomePage from './components/WelcomePage';
import ConsentModal from './components/ConsentModal';
import { SharedSpace, supabase, getUserSpaces } from './services/supabase';
import AuthScreen from './components/AuthScreen';
import TutorialOverlay from './components/TutorialOverlay';
import ThemeToggle from './components/ThemeToggle';

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
    if (viewMode === 'SharedSpace') return null;
    return (
        <nav 
          className="fixed left-6 right-6 z-50 max-w-sm mx-auto"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)' }}
        >
            <div className="bg-white/95 dark:bg-black/95 backdrop-blur-2xl border border-white/20 dark:border-white/10 shadow-2xl rounded-[2.5rem] px-6 py-3.5 flex justify-between items-center transition-colors" style={{ willChange: 'transform' }}>
            <button onClick={() => { haptics.soft(); setViewMode('Feed'); }} className={`p-3 rounded-full transition-colors duration-200 ${viewMode === 'Feed' ? 'bg-sand dark:bg-[#1a1a1a] text-charcoal dark:text-white shadow-sm' : 'text-stone-300 dark:text-stone-600'}`}><LayoutGrid size={22} /></button>
            <button onClick={() => { haptics.soft(); setViewMode('Discover'); }} className={`p-3 rounded-full transition-colors duration-200 ${viewMode === 'Discover' ? 'bg-sand dark:bg-[#1a1a1a] text-charcoal dark:text-white shadow-sm' : 'text-stone-300 dark:text-stone-600'}`}><Clapperboard size={22} /></button>
            <button onClick={() => { 
              haptics.medium(); 
              setInitialStatusForAdd(feedTab === 'queue' ? 'watchlist' : 'watched');
              setIsModalOpen(true); 
            }} className="bg-forest text-white p-4.5 rounded-full shadow-xl shadow-forest/20 mx-2 active:scale-90 transition-transform duration-150"><Plus size={24} strokeWidth={3} /></button>
            <button onClick={() => { haptics.soft(); setViewMode('Analytics'); }} className={`p-3 rounded-full transition-colors duration-200 ${viewMode === 'Analytics' ? 'bg-sand dark:bg-[#1a1a1a] text-charcoal dark:text-white shadow-sm' : 'text-stone-300 dark:text-stone-600'}`}><PieChart size={22} /></button>
            <button onClick={() => { haptics.soft(); setViewMode('Calendar'); }} className={`p-3 rounded-full transition-colors duration-200 ${viewMode === 'Calendar' ? 'bg-sand dark:bg-[#1a1a1a] text-charcoal dark:text-white shadow-sm' : 'text-stone-300 dark:text-stone-600'}`}><CalendarDays size={22} /></button>
            </div>
        </nav>
    );
});

const App: React.FC = () => {
  const STORAGE_KEY = 'the_bitter_profiles_v2';
  const LAST_PROFILE_ID_KEY = 'THE_BITTER_LAST_PROFILE_ID';
  const NEVER_SHOW_V0_73_KEY = 'the_bitter_never_show_v076';

  const [session, setSession] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
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
  const [watchlistGenreFilter, setWatchlistGenreFilter] = useState<string>('all');
  const [tonightPick, setTonightPick] = useState<Movie | null>(null);
  const [isPickAnimating, setIsPickAnimating] = useState(false);
  const [mediaTypeToLoad, setMediaTypeToLoad] = useState<'movie' | 'tv'>('movie');
  const [previewTmdbId, setPreviewTmdbId] = useState<number | null>(null);
  const [previewMediaType, setPreviewMediaType] = useState<'movie' | 'tv'>('movie');
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
  const TUTORIAL_DONE_KEY = 'the_bitter_tutorial_done';
  const [showTutorial, setShowTutorial] = useState(false);
  const pendingTutorialRef = useRef(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  const activeProfile = useMemo(() => profiles.find(p => p.id === activeProfileId) || null, [profiles, activeProfileId]);

  useEffect(() => {
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
    const lastProfileId = localStorage.getItem(LAST_PROFILE_ID_KEY);
    if (lastProfileId) {
      const exists = loadedProfiles.some(p => p.id === lastProfileId);
      if (exists) {
        setActiveProfileId(lastProfileId);
        setShowWelcome(false);
        setViewMode('Feed');
      } else {
        localStorage.removeItem(LAST_PROFILE_ID_KEY);
      }
    }
    const neverShowAgain = localStorage.getItem(NEVER_SHOW_V0_73_KEY);
    if (neverShowAgain !== 'true') {
        setShowNewFeatures(true);
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
    if (viewMode === 'Feed' && pendingTutorialRef.current) {
        pendingTutorialRef.current = false;
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

  const loadSupabaseProfile = async (userId: string) => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (error) return;
      if (data) {
        setProfiles(prev => {
          const existing = prev.find(p => p.id === data.id);
          if (existing) {
            return prev.map(p => p.id === data.id ? {
              ...p,
              firstName: data.first_name,
              lastName: data.last_name || p.lastName,
              severityIndex: data.severity_index || p.severityIndex,
              patienceLevel: data.patience_level || p.patienceLevel,
              favoriteGenres: data.favorite_genres || p.favoriteGenres,
              role: data.role || p.role,
              isOnboarded: data.is_onboarded || p.isOnboarded,
              movies: p.movies 
            } : p);
          } else {
            return [...prev, {
              id: data.id,
              firstName: data.first_name,
              lastName: data.last_name || '',
              movies: [], 
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
        const lastProfileId = localStorage.getItem(LAST_PROFILE_ID_KEY);
        setActiveProfileId(current => current || lastProfileId || data.id);
      }
    } catch (err) {}
  };

  useEffect(() => {
    if (supabase) {
      (supabase.auth as any).getSession().then(({ data: { session } }: any) => {
        setSession(session);
        setAuthLoading(false);
        if (session?.user) loadSupabaseProfile(session.user.id);
      });
      const { data: { subscription } } = (supabase.auth as any).onAuthStateChange((_event: any, session: any) => {
        setSession(session);
        if (session?.user) loadSupabaseProfile(session.user.id);
      });
      return () => subscription.unsubscribe();
    } else {
        setAuthLoading(false);
    }
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
    if (activeProfile && !showWelcome && !activeProfile.isOnboarded) {
      setShowCalibration(true);
    }
  }, [activeProfile, showWelcome]);

  const handleCompleteCalibration = (data: { name: string; severityIndex: number; patienceLevel: number; favoriteGenres: string[]; role: string }) => {
    if (!activeProfileId) return;
    setProfiles(prev => prev.map(p => p.id === activeProfileId ? { ...p, firstName: data.name, severityIndex: data.severityIndex, patienceLevel: data.patienceLevel, favoriteGenres: data.favoriteGenres, role: data.role, isOnboarded: true } : p));
    setShowCalibration(false);
    setViewMode('Deck');
    const tutorialDone = localStorage.getItem(TUTORIAL_DONE_KEY);
    if (tutorialDone !== 'true') pendingTutorialRef.current = true;
    haptics.success();
  };

  const handleSaveMovie = (data: MovieFormData) => {
    if (!activeProfileId) return;
    const hasRatings = data.ratings && (data.ratings.story > 0 || data.ratings.visuals > 0 || data.ratings.acting > 0 || data.ratings.sound > 0);
    const determinedStatus: MovieStatus = hasRatings ? 'watched' : (data.status || 'watchlist');
    const newMovieId = crypto.randomUUID();
    const newMovieTimestamp = Date.now();
    let finalMovie: Movie = editingMovie ? { ...editingMovie, ...data, status: determinedStatus } : { ...data, id: newMovieId, dateAdded: newMovieTimestamp, status: determinedStatus };
    setProfiles(prev => prev.map(p => {
      if (p.id !== activeProfileId) return p;
      let updatedMovies = editingMovie ? p.movies.map(m => m.id === finalMovie.id ? finalMovie : m) : [finalMovie, ...p.movies];
      return { ...p, movies: updatedMovies };
    }));
    setToastMessage(editingMovie ? 'Film modifié ✓' : (data.status === 'watchlist' ? 'Ajouté à ta watchlist ✓' : 'Film ajouté ✓'));
    setEditingMovie(null);
    setTmdbIdToLoad(null);
    setIsModalOpen(false);
    if (viewMode === 'Deck') setDeckAdvanceTrigger(prev => prev + 1);
  };

  const handleDeleteMovie = (id: string) => {
    if (!activeProfileId) return;
    setProfiles(prev => prev.map(p => p.id === activeProfileId ? {...p, movies: p.movies.filter(m => id !== m.id)} : p));
  };

  const watchlistGenres = useMemo(() => {
    if (!activeProfile) return [];
    return [...new Set(activeProfile.movies.filter(m => (m.status || 'watched') === 'watchlist').map(m => m.genre).filter(Boolean))];
  }, [activeProfile]);

  const filteredAndSortedMovies = useMemo(() => {
    if (!activeProfile) return [];
    const targetStatus: MovieStatus = feedTab === 'history' ? 'watched' : 'watchlist';
    return activeProfile.movies
      .filter(m => {
        if ((m.status || 'watched') !== targetStatus) return false;
        if (feedTab === 'queue' && watchlistGenreFilter !== 'all' && m.genre !== watchlistGenreFilter) return false;
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
    let count = 0, maxCycles = 12;
    const interval = setInterval(() => {
      setTonightPick(watchlist[Math.floor(Math.random() * watchlist.length)]);
      if (++count >= maxCycles) {
        clearInterval(interval);
        setTonightPick(watchlist[Math.floor(Math.random() * watchlist.length)]);
        setTimeout(() => setIsPickAnimating(false), 300);
      }
    }, 120);
  };

  const handleBackToFeed = () => {
    haptics.soft();
    if (viewMode === 'SharedSpace') setActiveSharedSpace(null);
    setViewMode('Feed');
  };

  const handleSignOut = async () => {
    if (!window.confirm("Se déconnecter ? Vos profils locaux resteront sur cet appareil.")) return;
    if (session) await (supabase?.auth as any).signOut();
    setIsGuestMode(false); setActiveProfileId(null); setSession(null); setShowWelcome(true); setViewMode('Feed'); setActiveSharedSpace(null); setShowProfile(false);
    localStorage.removeItem(LAST_PROFILE_ID_KEY);
  };

  if (authLoading) return <div className="min-h-screen bg-cream dark:bg-[#0c0c0c] flex items-center justify-center transition-colors"><Loader2 size={32} className="animate-spin text-forest" /></div>;
  if (!session && !isGuestMode && !activeProfileId) return <AuthScreen onContinueAsGuest={() => setIsGuestMode(true)} />;
  if (showWelcome && !activeProfileId) return (
    <div className="relative min-h-screen">
      <WelcomePage 
          existingProfiles={profiles} 
          onSelectProfile={(id) => { setActiveProfileId(id); setShowWelcome(false); setViewMode('Feed'); haptics.medium(); }} 
          onCreateProfile={(f, l, g, a, vp, sp) => {
              const newP: UserProfile = { id: crypto.randomUUID(), firstName: f, lastName: l, gender: g, age: a, viewingPreference: vp, streamingPlatforms: sp, movies: [], createdAt: Date.now(), isOnboarded: false };
              setProfiles(p => [...p, newP]); setActiveProfileId(newP.id); setShowWelcome(false);
          }} 
          onDeleteProfile={id => {
            setProfiles(prev => {
              const updated = prev.filter(x => x.id !== id);
              if (activeProfileId === id) { setActiveProfileId(null); localStorage.removeItem(LAST_PROFILE_ID_KEY); }
              return updated;
            });
          }} 
      />
      {showConsent && <ConsentModal onAccept={() => { haptics.success(); setShowConsent(false); initAnalytics(); }} />}
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
                      <ChevronLeft size={16} strokeWidth={3} className="text-charcoal dark:text-white" />
                  </button>
                  )}
                  <h1 className="text-lg font-black tracking-tighter leading-none text-charcoal dark:text-white">The Bitter</h1>
                </div>
                <button onClick={() => { haptics.soft(); setShowChangelog(true); }} className="text-[8px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500 hover:text-forest transition-colors text-left mt-1.5">{RELEASE_HISTORY[0].version} • Notes</button>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
                <ThemeToggle />
                <button 
                onClick={() => { 
                    if (!session) { alert("Compte requis."); return; }
                    setShowSharedSpaces(true); 
                }} 
                className={`relative w-10 h-10 rounded-2xl border flex items-center justify-center shadow-soft dark:shadow-none active:scale-90 transition-all ${!session ? 'bg-stone-50 dark:bg-stone-900 border-stone-100 dark:border-stone-800 text-stone-300' : 'bg-white dark:bg-[#1a1a1a] border-sand dark:border-white/10 text-charcoal dark:text-white'}`}
                >
                <Users size={20} />
                {mySpaces.length > 0 && <div className="absolute -top-1 -right-1 w-5 h-5 bg-forest text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-sm">{mySpaces.length}</div>}
                </button>
                <button 
                  onClick={() => { haptics.soft(); setShowProfile(true); }}
                  className="w-10 h-10 rounded-full bg-forest text-white flex items-center justify-center font-black text-sm shadow-md active:scale-90 transition-all shadow-forest/20"
                >
                  {activeProfile?.firstName?.[0]?.toUpperCase() ?? '?'}
                </button>
            </div>
            </div>
        </header>
      )}

      <main className={`flex-1 px-6 ${viewMode === 'SharedSpace' ? 'pt-6' : 'pt-6'} pb-32`}>
        <Suspense fallback={<div className="flex-1 flex items-center justify-center py-20"><Loader2 className="animate-spin text-stone-300" size={32} /></div>}>
          {viewMode === 'SharedSpace' && activeSharedSpace ? (
                <SharedSpaceView space={activeSharedSpace} currentUserId={session?.user?.id || activeProfile?.id || ''} onBack={handleBackToFeed} onAddMovie={() => setIsModalOpen(true)} refreshTrigger={sharedSpaceRefreshTrigger} />
          ) : viewMode === 'Analytics' ? (
            <AnalyticsView movies={activeProfile?.movies.filter(m => m.status === 'watched') || []} userProfile={activeProfile} onNavigateToCalendar={() => setViewMode('Calendar')} onRecalibrate={() => setShowCalibration(true)} />
          ) : viewMode === 'Discover' ? (
            <DiscoverView onSelectMovie={(id, type) => { setTmdbIdToLoad(id); setMediaTypeToLoad(type); setIsModalOpen(true); }} onPreview={(id, type) => { setPreviewTmdbId(id); setPreviewMediaType(type); }} userProfile={activeProfile} />
          ) : viewMode === 'Calendar' ? (
            <CalendarView movies={activeProfile?.movies || []} />
          ) : viewMode === 'Deck' ? (
            <MovieDeck onRate={(id) => { setTmdbIdToLoad(id); setMediaTypeToLoad('movie'); setIsModalOpen(true); }} onClose={() => setViewMode('Feed')} favoriteGenres={activeProfile?.favoriteGenres} advanceTrigger={deckAdvanceTrigger} />
          ) : (
            <div className="max-w-md mx-auto w-full space-y-8 animate-[fadeIn_0.3s_ease-out]">
              {(!activeProfile || activeProfile.movies.length === 0) ? (
                 <div className="flex flex-col items-center justify-center py-24 text-center">
                      <div className="w-24 h-24 bg-white dark:bg-[#1a1a1a] rounded-[2.5rem] border border-sand dark:border-white/5 flex items-center justify-center text-stone-300 dark:text-stone-700 mb-8 shadow-sm transition-colors transition-all"><Film size={40} /></div>
                      <h2 className="text-2xl font-black mb-3 tracking-tighter">Démarrez votre collection</h2>
                      <p className="text-stone-400 dark:text-stone-500 font-medium mb-10 max-w-xs mx-auto text-sm leading-relaxed">Ajoutez des films pour voir vos statistiques d'analyste.</p>
                      <button onClick={() => setViewMode('Discover')} className="bg-charcoal dark:bg-forest text-white px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center gap-3 active:scale-95 transition-all"><Plus size={18} strokeWidth={3} /> Explorer</button>
                 </div>
              ) : (
                 <div className="space-y-10">
                    <div className="flex justify-center w-full">
                      <div className="bg-stone-100 dark:bg-[#161616] p-1.5 rounded-full flex w-full max-w-[280px] shadow-inner border border-stone-200/50 dark:border-white/5 transition-colors">
                          <button onClick={() => { haptics.soft(); setFeedTab('history'); }} className={`flex-1 py-3.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${feedTab === 'history' ? 'bg-white dark:bg-[#202020] text-charcoal dark:text-white shadow-md scale-[1.02]' : 'text-stone-400 dark:text-stone-600 hover:text-stone-500'}`}>Vu</button>
                          <button onClick={() => { haptics.soft(); setFeedTab('queue'); }} className={`flex-1 py-3.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${feedTab === 'queue' ? 'bg-white dark:bg-[#202020] text-charcoal dark:text-white shadow-md scale-[1.02]' : 'text-stone-400 dark:text-stone-600 hover:text-stone-500'}`}>À voir</button>
                      </div>
                    </div>
                    {feedTab === 'queue' && activeProfile && activeProfile.movies.filter(m => (m.status || 'watched') === 'watchlist').length > 0 && (
                      <div className="space-y-5 animate-[fadeIn_0.3s_ease-out]">
                        <button onClick={handleTonightPick} className="w-full bg-bitter-lime text-charcoal py-5 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-lime-400/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3"><Shuffle size={18} strokeWidth={2.5} /> Ce soir ?</button>
                        {tonightPick && !isPickAnimating && (
                          <div className="bg-charcoal dark:bg-[#1a1a1a] text-white p-5 rounded-[2rem] shadow-2xl flex gap-4 items-center border border-white/5 animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)]">
                            {tonightPick.posterUrl && <div className="w-16 h-24 rounded-2xl overflow-hidden shrink-0 shadow-lg"><img src={tonightPick.posterUrl} alt={tonightPick.title} className="w-full h-full object-cover" /></div>}
                            <div className="flex-1 min-w-0"><p className="text-[9px] font-black uppercase tracking-widest text-bitter-lime mb-1">🎲 Sugggestion</p><h4 className="font-black text-lg tracking-tight truncate">{tonightPick.title}</h4><p className="text-[10px] text-stone-400 font-bold mt-1">{tonightPick.director} • {tonightPick.year}</p></div>
                            <button onClick={() => setTonightPick(null)} className="p-2 text-stone-500 hover:text-white transition-colors"><X size={16} /></button>
                          </div>
                        )}
                        {watchlistGenres.length > 1 && (
                          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            <button onClick={() => setWatchlistGenreFilter('all')} className={`flex-shrink-0 px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${watchlistGenreFilter === 'all' ? 'bg-charcoal dark:bg-forest text-white border-charcoal shadow-md' : 'bg-white dark:bg-[#1a1a1a] text-stone-400 dark:text-stone-600 border-stone-200 dark:border-white/5'}`}>Tous</button>
                            {watchlistGenres.map(genre => (<button key={genre} onClick={() => setWatchlistGenreFilter(genre)} className={`flex-shrink-0 px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${watchlistGenreFilter === genre ? 'bg-charcoal dark:bg-forest text-white border-charcoal shadow-md' : 'bg-white dark:bg-[#1a1a1a] text-stone-400 dark:text-stone-600 border-stone-200 dark:border-white/5'}`}>{genre}</button>))}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="relative group">
                      <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-stone-300 dark:text-stone-700 group-focus-within:text-charcoal dark:group-focus-within:text-white transition-colors" />
                      <input type="text" placeholder="Rechercher..." className="w-full bg-white dark:bg-[#1a1a1a] border border-sand dark:border-white/5 p-5 pl-14 rounded-2xl font-black text-sm outline-none focus:border-stone-200 shadow-sm transition-all text-charcoal dark:text-white" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                    <div className="flex items-center justify-between border-b border-sand dark:border-white/5 pb-4">
                       <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-300 dark:text-stone-700">{feedTab === 'history' ? 'Films Vus' : 'À Voir'} ({filteredAndSortedMovies.length})</h2>
                       <div className="flex items-center gap-2"><SlidersHorizontal size={12} className="text-stone-300" /><select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className="bg-transparent text-[10px] font-black uppercase text-charcoal dark:text-white outline-none cursor-pointer tracking-widest"><option value="Date">Récents</option>{feedTab === 'history' && <option value="Rating">Note</option>}<option value="Year">Année</option><option value="Title">A-Z</option></select></div>
                    </div>
                    <div className="grid grid-cols-1 gap-8">{filteredAndSortedMovies.map((movie, index) => (<MovieCard key={movie.id} movie={movie} index={index} onDelete={handleDeleteMovie} onEdit={m => { setEditingMovie(m); setIsModalOpen(true); }} />))}</div>
                 </div>
              )}
            </div>
          )}
        </Suspense>
      </main>

      <BottomNav viewMode={viewMode} setViewMode={setViewMode} setIsModalOpen={() => { setEditingMovie(null); setTmdbIdToLoad(null); setIsModalOpen(true); }} feedTab={feedTab} setInitialStatusForAdd={setInitialStatusForAdd} />

      {!showWelcome && activeProfile && viewMode !== 'SharedSpace' && (
        <button onClick={() => setShowCineAssistant(true)} className="fixed bottom-32 right-6 z-50 w-16 h-16 bg-forest text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all group overflow-hidden">
          <Sparkles size={24} fill="currentColor" className="group-hover:rotate-12 transition-transform" />
          <div className="absolute -top-1 -right-1 bg-bitter-lime text-charcoal text-[8px] font-black px-1.5 py-0.5 rounded-full border-2 border-white dark:border-[#0c0c0c] shadow-sm">AI</div>
        </button>
      )}

      {toastMessage && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[200] animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]">
          <div className="bg-charcoal dark:bg-forest text-white px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-2.5 border border-white/10"><Check size={12} strokeWidth={3} /><span className="text-sm font-bold tracking-tight">{toastMessage}</span></div>
        </div>
      )}

      <Suspense fallback={<div className="fixed inset-0 z-[200] bg-charcoal/20 backdrop-blur-sm flex items-center justify-center"><Loader2 className="animate-spin text-white" size={48} /></div>}>
        {showTutorial && <TutorialOverlay steps={[
          {
            title: "Bienvenue sur The Bitter",
            icon: <Film size={24} />,
            desc: "Ton journal de cinéma personnel. Note chaque film que tu regardes, suis tes tendances et découvre ton profil de cinéphile. Tout se passe ici.",
          },
          {
            title: "Ta Collection",
            icon: <LayoutGrid size={24} />,
            desc: (
              <span>
                L'onglet <strong>Vu</strong> liste tes films notés, l'onglet <strong>À voir</strong> ta watchlist. Glisse une carte vers la gauche pour la supprimer, vers la droite pour l'éditer rapidement.
              </span>
            ),
          },
          {
            title: "Ajouter un Film",
            icon: <Plus size={24} />,
            highlight: true,
            desc: (
              <span>
                Le bouton <strong>+</strong> au centre de la barre ouvre le formulaire. Cherche ton film, il se remplit automatiquement via TMDB. Active l'<strong>Analyse Bitter</strong> pour noter les vibes et les critères détaillés — c'est ça qui alimente tes stats.
              </span>
            ),
          },
          {
            title: "Explore & Découvre",
            icon: <Clapperboard size={24} />,
            desc: (
              <span>
                La vue <strong>Explorateur</strong> te permet de parcourir les sorties par période et par plateforme de streaming. Appuie sur une affiche pour voir la fiche complète avant de l'ajouter.
              </span>
            ),
          },
          {
            title: "Tes Statistiques",
            icon: <PieChart size={24} />,
            desc: (
              <span>
                Après <strong>5 films notés</strong>, l'onglet Analytics se déverrouille. Tu y trouveras ton archétype cinéphile, tes genres dominants, ton palmarès personnel et ta sévérité comparée au reste du monde.
              </span>
            ),
          },
          {
            title: "Ton Calendrier",
            icon: <CalendarDays size={24} />,
            desc: "Visualise ton historique de visionnage mois par mois. Chaque point sur le calendrier correspond à un film vu ce jour-là. Clique sur une date pour voir le détail de ta séance.",
          },
          {
            title: "Ton Profil",
            icon: <User size={24} />,
            desc: (
              <span>
                L'<strong>avatar en haut à droite</strong> ouvre ta page profil. Tu y retrouves ton archétype (provisoire ou confirmé), tes stats clés, tes genres favoris et tes indices de calibration. C'est aussi là que tu peux recalibrer ton profil ou changer de compte.
              </span>
            ),
          },
          {
            title: "L'Assistant IA",
            icon: <Sparkles size={24} />,
            highlight: true,
            desc: (
              <span>
                Le bouton <strong>✦</strong> en bas à droite de l'écran ouvre le CineAssistant. Il connaît tes goûts et peut te recommander des films sur mesure, directement ajoutables à ta watchlist.
              </span>
            ),
          },
        ]} onComplete={handleTutorialComplete} />}
        {showNewFeatures && <NewFeaturesModal onClose={() => setShowNewFeatures(false)} onNeverShowAgain={() => { setShowNewFeatures(false); localStorage.setItem(NEVER_SHOW_V0_73_KEY, 'true'); }} />}
        {isModalOpen && <AddMovieModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingMovie(null); setTmdbIdToLoad(null); }} onSave={handleSaveMovie} initialData={editingMovie} tmdbIdToLoad={tmdbIdToLoad} initialMediaType={mediaTypeToLoad} initialStatus={initialStatusForAdd} sharedSpace={viewMode === 'SharedSpace' ? activeSharedSpace : null} currentUserId={session?.user?.id || activeProfile?.id} onSharedMovieAdded={() => setSharedSpaceRefreshTrigger(prev => prev + 1)} />}
        {previewTmdbId && <MovieDetailModal tmdbId={previewTmdbId} mediaType={previewMediaType} isOpen={!!previewTmdbId} onClose={() => setPreviewTmdbId(null)} onAction={(id, status) => { setPreviewTmdbId(null); setTmdbIdToLoad(id); setMediaTypeToLoad(previewMediaType); setInitialStatusForAdd(status); setTimeout(() => setIsModalOpen(true), 100); }} />}
        {showChangelog && <ChangelogModal isOpen={showChangelog} onClose={() => setShowChangelog(false)} />}
        {showSharedSpaces && activeProfile && <SharedSpacesModal isOpen={showSharedSpaces} onClose={() => setShowSharedSpaces(false)} userId={session?.user?.id || activeProfile.id} onSelectSpace={(space) => { setActiveSharedSpace(space); setShowSharedSpaces(false); setViewMode('SharedSpace'); haptics.medium(); }} />}
        {showCineAssistant && activeProfile && <CineAssistant isOpen={showCineAssistant} onClose={() => setShowCineAssistant(false)} userProfile={activeProfile} onAddToWatchlist={(id) => { setTmdbIdToLoad(id); setInitialStatusForAdd('watchlist'); setIsModalOpen(true); setShowCineAssistant(false); }} />}
        {showCalibration && activeProfile && <OnboardingModal initialName={activeProfile.firstName} userId={session?.user?.id || activeProfile.id} onComplete={handleCompleteCalibration} />}
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
            onShowTutorial={() => {
              setShowProfile(false);
              localStorage.removeItem(TUTORIAL_DONE_KEY);
              setShowTutorial(true);
            }}
            onSignOut={handleSignOut}
          />
        )}
      </Suspense>
    </div>
  );
};

export default App;