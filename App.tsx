
import React, { useState, useEffect, useMemo, lazy, Suspense, memo } from 'react';
import { Plus, Search, SlidersHorizontal, X, LayoutGrid, PieChart, Clock, CheckCircle2, Sparkles, PiggyBank, Radar, Activity, Heart, User, LogOut, Clapperboard, Wand2, CalendarDays, BarChart3, Hourglass, ArrowDown, Film, FlaskConical, Target, Instagram, Loader2, Star, Tags, ChevronLeft, MessageSquareText } from 'lucide-react';
import { GENRES, TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from './constants';
import { Movie, MovieFormData, MovieStatus, UserProfile } from './types';
import { RELEASE_HISTORY } from './constants/changelog';
import { haptics } from './utils/haptics';
import { initAnalytics } from './utils/analytics';
import MovieCard from './components/MovieCard';
import WelcomePage from './components/WelcomePage';
import ConsentModal from './components/ConsentModal';

// Lazy loading components
const AnalyticsView = lazy(() => import('./components/AnalyticsView'));
const DiscoverView = lazy(() => import('./components/DiscoverView'));
const CalendarView = lazy(() => import('./components/CalendarView'));
const MovieDeck = lazy(() => import('./components/MovieDeck'));
const AddMovieModal = lazy(() => import('./components/AddMovieModal'));
const ChangelogModal = lazy(() => import('./components/ChangelogModal'));
const OnboardingModal = lazy(() => import('./components/OnboardingModal'));
const CineAssistant = lazy(() => import('./components/CineAssistant'));

type SortOption = 'Date' | 'Rating' | 'Year' | 'Title';
type ViewMode = 'Feed' | 'Analytics' | 'Discover' | 'Calendar' | 'Deck';
type FeedTab = 'history' | 'queue';

const BottomNav = memo(({ viewMode, setViewMode, setIsModalOpen }: { 
  viewMode: ViewMode, 
  setViewMode: (v: ViewMode) => void,
  setIsModalOpen: (o: boolean) => void 
}) => (
  <nav className="fixed bottom-8 left-6 right-6 z-50 max-w-sm mx-auto">
    <div className="bg-white/95 backdrop-blur-2xl border border-white/20 shadow-2xl rounded-[2.5rem] px-6 py-3.5 flex justify-between items-center" style={{ willChange: 'transform' }}>
      <button onClick={() => { haptics.soft(); setViewMode('Feed'); }} className={`p-3 rounded-full transition-colors duration-200 ${viewMode === 'Feed' ? 'bg-sand text-charcoal shadow-sm' : 'text-stone-300'}`}><LayoutGrid size={22} /></button>
      <button onClick={() => { haptics.soft(); setViewMode('Discover'); }} className={`p-3 rounded-full transition-colors duration-200 ${viewMode === 'Discover' ? 'bg-sand text-charcoal shadow-sm' : 'text-stone-300'}`}><Clapperboard size={22} /></button>
      <button onClick={() => { haptics.medium(); setIsModalOpen(true); }} className="bg-forest text-white p-4.5 rounded-full shadow-xl shadow-forest/20 mx-2 active:scale-90 transition-transform duration-150"><Plus size={24} strokeWidth={3} /></button>
      <button onClick={() => { haptics.soft(); setViewMode('Analytics'); }} className={`p-3 rounded-full transition-colors duration-200 ${viewMode === 'Analytics' ? 'bg-sand text-charcoal shadow-sm' : 'text-stone-300'}`}><PieChart size={22} /></button>
      <button onClick={() => { haptics.soft(); setViewMode('Calendar'); }} className={`p-3 rounded-full transition-colors duration-200 ${viewMode === 'Calendar' ? 'bg-sand text-charcoal shadow-sm' : 'text-stone-300'}`}><CalendarDays size={22} /></button>
    </div>
  </nav>
));

const App: React.FC = () => {
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
  const [showCalibration, setShowCalibration] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showConsent, setShowConsent] = useState(true);
  const [showCineAssistant, setShowCineAssistant] = useState(false);
  const [deckAdvanceTrigger, setDeckAdvanceTrigger] = useState(0);

  const STORAGE_KEY = 'the_bitter_profiles_v2';

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setProfiles(JSON.parse(saved)); } catch (e) { setProfiles([]); }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  }, [profiles]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const activeProfile = useMemo(() => profiles.find(p => p.id === activeProfileId) || null, [profiles, activeProfileId]);

  // Effect pour forcer la calibration sur les nouveaux profils qui n'en ont pas
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
    // On envoie vers le Deck pour commencer à noter des films
    setViewMode('Deck');
    haptics.success();
  };

  const handleSaveMovie = (data: MovieFormData) => {
    if (!activeProfileId) return;
    setProfiles(prev => prev.map(p => {
      if (p.id !== activeProfileId) return p;
      let updatedMovies = [...p.movies];
      if (editingMovie) {
        updatedMovies = updatedMovies.map(m => m.id === editingMovie.id ? { ...m, ...data } : m);
      } else {
        const newMovie: Movie = { ...data, id: crypto.randomUUID(), dateAdded: Date.now() };
        updatedMovies = [newMovie, ...updatedMovies];
      }
      return { ...p, movies: updatedMovies };
    }));
    setEditingMovie(null);
    setTmdbIdToLoad(null);
    setIsModalOpen(false);

    // Si on était dans le Deck, on déclenche l'avancement automatique
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
    setViewMode('Feed');
  };

  if (showWelcome) return (
    <div className="relative min-h-screen">
      <WelcomePage 
          existingProfiles={profiles} 
          onSelectProfile={(id) => { setActiveProfileId(id); setShowWelcome(false); setViewMode('Feed'); }} 
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
                isOnboarded: false // Force l'onboarding au premier passage
              };
              setProfiles(p => [...p, newP]);
              setActiveProfileId(newP.id);
              setShowWelcome(false);
          }} 
          onDeleteProfile={id => {
            setProfiles(prev => {
              const updated = prev.filter(x => x.id !== id);
              localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
              return updated;
            });
          }} 
      />
      {showConsent && <ConsentModal onAccept={() => { haptics.success(); setShowConsent(false); initAnalytics(); }} />}
    </div>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col text-charcoal font-sans relative overflow-x-hidden bg-cream">
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
          <button onClick={() => { haptics.soft(); setShowWelcome(true); }} className="w-10 h-10 rounded-2xl bg-white border border-sand flex items-center justify-center shadow-soft active:scale-90 transition-transform duration-200">
             <User size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 pt-6 pb-32">
        <Suspense fallback={<div className="flex-1 flex items-center justify-center py-20"><Loader2 className="animate-spin text-stone-300" size={32} /></div>}>
          {viewMode === 'Analytics' ? (
            <AnalyticsView movies={activeProfile?.movies.filter(m => m.status === 'watched') || []} userProfile={activeProfile} onNavigateToCalendar={() => setViewMode('Calendar')} onRecalibrate={() => setShowCalibration(true)} />
          ) : viewMode === 'Discover' ? (
            <DiscoverView onSelectMovie={(id) => { setTmdbIdToLoad(id); setIsModalOpen(true); }} userProfile={activeProfile} />
          ) : viewMode === 'Calendar' ? (
            <CalendarView movies={activeProfile?.movies || []} />
          ) : viewMode === 'Deck' ? (
            <MovieDeck 
              onRate={(id) => { setTmdbIdToLoad(id); setIsModalOpen(true); }} 
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
                          <button onClick={() => { haptics.soft(); setFeedTab('history'); }} className={`flex-1 py-3.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${feedTab === 'history' ? 'bg-white text-charcoal shadow-md scale-[1.02]' : 'text-stone-400 hover:text-stone-500'}`}>Historique</button>
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
                          {feedTab === 'history' ? 'Ma Bibliothèque' : 'Watchlist'} ({filteredAndSortedMovies.length})
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

      <BottomNav viewMode={viewMode} setViewMode={setViewMode} setIsModalOpen={() => { setEditingMovie(null); setTmdbIdToLoad(null); setIsModalOpen(true); }} />

      {/* Floating Action Button for AI Assistant */}
      {!showWelcome && activeProfile && (
        <button 
          onClick={() => { haptics.medium(); setShowCineAssistant(true); }}
          className="fixed bottom-32 right-6 z-50 w-16 h-16 bg-forest text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all group"
        >
          <Sparkles size={24} fill="currentColor" className="group-hover:rotate-12 transition-transform" />
          <div className="absolute -top-1 -right-1 bg-bitter-lime text-charcoal text-[8px] font-black px-1.5 py-0.5 rounded-full border-2 border-white shadow-sm">AI</div>
        </button>
      )}

      <Suspense fallback={null}>
        {isModalOpen && (
          <AddMovieModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingMovie(null); setTmdbIdToLoad(null); }} onSave={handleSaveMovie} initialData={editingMovie} tmdbIdToLoad={tmdbIdToLoad} />
        )}
        {showChangelog && <ChangelogModal isOpen={showChangelog} onClose={() => setShowChangelog(false)} />}
        {showCineAssistant && activeProfile && (
          <CineAssistant 
            isOpen={showCineAssistant} 
            onClose={() => setShowCineAssistant(false)} 
            userProfile={activeProfile} 
            onAddToWatchlist={(id) => { 
              setTmdbIdToLoad(id); 
              setIsModalOpen(true); 
              setShowCineAssistant(false); 
            }}
          />
        )}
        {showCalibration && activeProfile && (
          <OnboardingModal initialName={activeProfile.firstName} onComplete={handleCompleteCalibration} />
        )}
      </Suspense>
    </div>
  );
};

export default App;
