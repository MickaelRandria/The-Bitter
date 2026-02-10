import React, { useState, useEffect, useMemo, lazy, Suspense, memo } from 'react';
import { Plus, Search, SlidersHorizontal, X, LayoutGrid, PieChart, Clock, CheckCircle2, Sparkles, PiggyBank, Radar, Activity, Heart, User, LogOut, Clapperboard, Wand2, CalendarDays, BarChart3, Hourglass, ArrowDown, Film, FlaskConical, Target, Instagram, Loader2, Star, Tags, ChevronLeft, MessageSquareText, Users, Globe } from 'lucide-react';
import { GENRES, TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from './constants';
import { Movie, MovieFormData, MovieStatus, UserProfile } from './types';
import { RELEASE_HISTORY } from './constants/changelog';
import { haptics } from './utils/haptics';
import { initAnalytics } from './utils/analytics';
import MovieCard from './components/MovieCard';
import WelcomePage from './components/WelcomePage';
import ConsentModal from './components/ConsentModal';
import { SharedSpace, supabase, getUserSpaces } from './services/supabase';
import { Session } from '@supabase/supabase-js';
import AuthScreen from './components/AuthScreen';

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

const BottomNav = memo(({ viewMode, setViewMode, setIsModalOpen }: { 
  viewMode: ViewMode, 
  setViewMode: (v: ViewMode) => void,
  setIsModalOpen: (o: boolean) => void 
}) => {
    if (viewMode === 'SharedSpace') return null; // Hide bottom nav in shared space view for cleaner UI
    return (
        <nav className="fixed bottom-8 left-6 right-6 z-50 max-w-sm mx-auto">
            <div className="bg-white/95 backdrop-blur-2xl border border-white/20 shadow-2xl rounded-[2.5rem] px-6 py-3.5 flex justify-between items-center" style={{ willChange: 'transform' }}>
            <button onClick={() => { haptics.soft(); setViewMode('Feed'); }} className={`p-3 rounded-full transition-colors duration-200 ${viewMode === 'Feed' ? 'bg-sand text-charcoal shadow-sm' : 'text-stone-300'}`}><LayoutGrid size={22} /></button>
            <button onClick={() => { haptics.soft(); setViewMode('Discover'); }} className={`p-3 rounded-full transition-colors duration-200 ${viewMode === 'Discover' ? 'bg-sand text-charcoal shadow-sm' : 'text-stone-300'}`}><Clapperboard size={22} /></button>
            <button onClick={() => { haptics.medium(); setIsModalOpen(true); }} className="bg-forest text-white p-4.5 rounded-full shadow-xl shadow-forest/20 mx-2 active:scale-90 transition-transform duration-150"><Plus size={24} strokeWidth={3} /></button>
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
  const NEVER_SHOW_V0_73_KEY = 'never_show_v0.73';

  // SUPABASE SESSION STATE
  const [session, setSession] = useState<Session | null>(null);
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

  // Chargement du profil Supabase vers le state local
  const loadSupabaseProfile = async (userId: string) => {
    if (!supabase) return;
    
    console.log('📥 Tentative de chargement du profil Supabase:', userId);
    
    try {
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
        
        setProfiles(prev => {
          const existing = prev.find(p => p.id === data.id);
          
          if (existing) {
            console.log('🔄 Mise à jour du profil existant');
            return prev.map(p => p.id === data.id ? {
              ...p,
              firstName: data.first_name,
              lastName: data.last_name || p.lastName,
              severityIndex: data.severity_index || p.severityIndex,
              patienceLevel: data.patience_level || p.patienceLevel,
              favoriteGenres: data.favorite_genres || p.favoriteGenres,
              role: data.role || p.role,
              isOnboarded: data.is_onboarded || p.isOnboarded,
              joinedSpaceIds: p.joinedSpaceIds
            } : p);
          } else {
            console.log('➕ Ajout d\'un nouveau profil mail');
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
        
        // 🔥 LOGIQUE CRITIQUE : Respecter le lastProfileId (Priorité UX)
        const lastProfileId = localStorage.getItem(LAST_PROFILE_ID_KEY);
        console.log('🔍 Recherche de cohérence. Dernier ID stocké:', lastProfileId);

        setActiveProfileId(current => {
          console.log('🔍 Profil actuellement en mémoire (React):', current);
          
          // 1. Si un profil est déjà actif (chargé par le useEffect initial), on ne change RIEN
          if (current) {
            console.log('✅ Profil déjà actif, on conserve la session en cours.');
            return current;
          }
          
          // 2. Si pas de profil actif en mémoire, mais un lastProfileId existe dans le storage
          if (lastProfileId) {
            console.log('✅ Utilisation de lastProfileId comme fallback prioritaire.');
            return lastProfileId;
          }
          
          // 3. SEULEMENT si aucun profil n'est actif ET aucun lastProfileId n'existe
          // Alors on active le profil lié au mail par défaut.
          console.log('🆕 Aucun profil trouvé, activation du profil mail par défaut.');
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
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setAuthLoading(false);
        if (session?.user) {
          loadSupabaseProfile(session.user.id);
        }
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
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
    haptics.success();
  };

  const handleSaveMovie = (data: MovieFormData) => {
    if (!activeProfileId) return;
    setProfiles(prev => prev.map(p => {
      if (p.id !== activeProfileId) return p;
      let updatedMovies = [...p.movies];
      
      const hasRatings = data.ratings && (
        data.ratings.story > 0 || 
        data.ratings.visuals > 0 || 
        data.ratings.acting > 0 || 
        data.ratings.sound > 0
      );

      const determinedStatus: MovieStatus = hasRatings ? 'watched' : (data.status || 'watchlist');

      if (editingMovie) {
        updatedMovies = updatedMovies.map(m => 
          m.id === editingMovie.id 
            ? { ...m, ...data, status: determinedStatus } 
            : m
        );
      } else {
        const newMovie: Movie = { 
          ...data, 
          id: crypto.randomUUID(), 
          dateAdded: Date.now(),
          status: determinedStatus
        };
        updatedMovies = [newMovie, ...updatedMovies];
      }
      return { ...p, movies: updatedMovies };
    }));
    setEditingMovie(null);
    setTmdbIdToLoad(null);
    setIsModalOpen(false);
    if (viewMode === 'Deck') {
      setDeckAdvanceTrigger(prev => prev + 1);
    }
  };

  const filteredAndSortedMovies = useMemo(() => {
    if (!activeProfile) return [];
    const targetStatus: MovieStatus = feedTab === 'history' ? 'watched' : 'watchlist';
    
    return activeProfile.movies
      .filter(m => {
        const matchesStatus = (m.status || 'watched') === targetStatus;
        if (!debouncedSearch) return matchesStatus;
        const q = debouncedSearch.toLowerCase();
        return matchesStatus && (m.title.toLowerCase().includes(q) || m.director.toLowerCase().includes(q));
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
  }, [activeProfile, sortBy, debouncedSearch, feedTab]);

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
        await supabase?.auth.signOut();
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
      {viewMode !== 'SharedSpace' && (
        <header className="pt-6 sm:pt-8 px-6 sticky top-0 z-40 bg-cream/95 backdrop-blur-xl border-b border-sand/40">
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
                          <button onClick={() => { haptics.soft(); setFeedTab('history'); }} className={`flex-1 py-3.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${feedTab === 'history' ? 'bg-white text-charcoal shadow-md scale-[1.02]' : 'text-stone-400 hover:text-stone-500'}`}>Vu</button>
                          <button onClick={() => { haptics.soft(); setFeedTab('queue'); }} className={`flex-1 py-3.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${feedTab === 'queue' ? 'bg-white text-charcoal shadow-md scale-[1.02]' : 'text-stone-400 hover:text-stone-500'}`}>À voir</button>
                      </div>
                    </div>

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
                              <option value="Rating">Note</option>
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
                              onDelete={id => setProfiles(prev => prev.map(p => p.id === activeProfileId ? {...p, movies: p.movies.filter(m => m.id !== id)} : p))} 
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

      <BottomNav viewMode={viewMode} setViewMode={setViewMode} setIsModalOpen={() => { setEditingMovie(null); setTmdbIdToLoad(null); setMediaTypeToLoad('movie'); setInitialStatusForAdd('watched'); setIsModalOpen(true); }} />

      {!showWelcome && activeProfile && viewMode !== 'SharedSpace' && (
        <button 
          onClick={() => { haptics.medium(); setShowCineAssistant(true); }}
          className="fixed bottom-32 right-6 z-50 w-16 h-16 bg-forest text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all group overflow-hidden"
        >
          <Sparkles size={24} fill="currentColor" className="group-hover:rotate-12 transition-transform" />
          <div className="absolute -top-1 -right-1 bg-bitter-lime text-charcoal text-[8px] font-black px-1.5 py-0.5 rounded-full border-2 border-white shadow-sm">AI</div>
        </button>
      )}

      <Suspense fallback={<div className="fixed inset-0 z-[200] bg-charcoal/20 backdrop-blur-sm flex items-center justify-center"><Loader2 className="animate-spin text-white" size={48} /></div>}>
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