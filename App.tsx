
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Search, SlidersHorizontal, X, LayoutGrid, PieChart, Clock, CheckCircle2, Sparkles, PiggyBank, Radar, Activity, Heart, User, LogOut, Clapperboard, Wand2, CalendarDays, BarChart3, Hourglass, ArrowDown, Film, FlaskConical, Target, Instagram, Loader2, Star, Tags } from 'lucide-react';
import { GENRES, TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from './constants';
import { Movie, MovieFormData, MovieStatus, UserProfile } from './types';
import AnalyticsView from './components/AnalyticsView';
import MovieCard from './components/MovieCard';
import AddMovieModal from './components/AddMovieModal';
import WelcomePage from './components/WelcomePage';
import DiscoverView from './components/DiscoverView';
import CalendarView from './components/CalendarView';
import MovieDeck from './components/MovieDeck';
import TutorialOverlay, { TutorialStep } from './components/TutorialOverlay';
import FilmographyModal from './components/FilmographyModal';
import ChangelogModal from './components/ChangelogModal';
import OnboardingModal from './components/OnboardingModal';
import RecommendationsModal from './components/RecommendationsModal';
import CookieBanner from './components/CookieBanner';
import { RELEASE_HISTORY } from './constants/changelog';
import { haptics } from './utils/haptics';
import { updateAppBadge } from './utils/badges';
import { trackPageView, initAnalytics } from './utils/analytics';
import html2canvas from 'html2canvas';

type SortOption = 'Date' | 'Rating' | 'Year' | 'Title';
type ViewMode = 'Feed' | 'Analytics' | 'Discover' | 'Calendar' | 'Deck';
type FeedTab = 'history' | 'queue';

const TUTORIALS: Record<string, TutorialStep[]> = {
  'Feed': [
    {
      title: "Votre Collection",
      desc: "Retrouvez vos films vus (Historique) et ceux à venir (File d'attente).",
      icon: <LayoutGrid size={32} strokeWidth={1.5} />
    }
  ],
  'Deck': [
    {
        title: "Judge or Skip",
        desc: "Notez rapidement 5 films cultes de vos genres préférés pour calibrer votre profil.",
        icon: <Target size={32} strokeWidth={1.5} />
    }
  ]
};

const App: React.FC = () => {
  const [showWelcome, setShowWelcome] = useState(true);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  
  const [viewMode, setViewMode] = useState<ViewMode>('Feed');
  const [feedTab, setFeedTab] = useState<FeedTab>('history');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('Date');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingMovie, setEditingMovie] = useState<Movie | null>(null);
  const [tmdbIdToLoad, setTmdbIdToLoad] = useState<number | null>(null);
  const [activeTutorial, setActiveTutorial] = useState<TutorialStep[] | null>(null);
  const [showCalibration, setShowCalibration] = useState(false);
  const [recSourceMovie, setRecSourceMovie] = useState<Movie | null>(null);
  const [showCookieBanner, setShowCookieBanner] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);

  // Pour le partage de story
  const [sharingMovie, setSharingMovie] = useState<Movie | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  // Pour l'auto-advance du deck
  const [deckSessionCount, setDeckSessionCount] = useState(0);

  const STORAGE_KEY = 'the_bitter_profiles_v2';

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setProfiles(JSON.parse(saved)); } catch (e) { setProfiles([]); }
    }
  }, []);

  useEffect(() => {
    if (profiles.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  }, [profiles]);

  const activeProfile = useMemo(() => profiles.find(p => p.id === activeProfileId) || null, [profiles, activeProfileId]);

  useEffect(() => {
    if (activeProfile && !showWelcome && activeProfile.severityIndex === undefined) {
      setShowCalibration(true);
    }
  }, [activeProfile, showWelcome]);

  const handleCompleteCalibration = (data: { name: string; severityIndex: number; patienceLevel: number; favoriteGenres: string[]; role: string }) => {
    if (!activeProfileId) return;
    setProfiles(prev => prev.map(p => {
      if (p.id !== activeProfileId) return p;
      return { ...p, firstName: data.name, severityIndex: data.severityIndex, patienceLevel: data.patienceLevel, favoriteGenres: data.favoriteGenres, isOnboarded: true, role: data.role };
    }));
    setShowCalibration(false);
    haptics.success();
    // Lance le deck automatiquement si la bibliothèque est vide
    if (activeProfile && activeProfile.movies.length === 0) setViewMode('Deck');
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
    
    // Auto-advance pour le MovieDeck
    if (viewMode === 'Deck') setDeckSessionCount(prev => prev + 1);
  };

  const handleShareMovie = async (movie: Movie) => {
      if (isSharing) return;
      setSharingMovie(movie);
      setIsSharing(true);
      haptics.medium();

      // Attendre le rendu du template caché
      setTimeout(async () => {
        if (!shareRef.current) {
            setIsSharing(false);
            return;
        }

        try {
            const canvas = await html2canvas(shareRef.current, {
                scale: 2,
                backgroundColor: '#0c0c0c',
                useCORS: true,
                allowTaint: true,
                logging: false,
                ignoreElements: (element) => element.tagName === 'IFRAME' // Avoid issues
            });

            canvas.toBlob(async (blob) => {
                if (!blob) { setIsSharing(false); return; }
                const file = new File([blob], 'bitter-story.png', { type: 'image/png' });

                if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({ files: [file] });
                        haptics.success();
                    } catch (e) {
                        console.log('Share cancelled');
                    }
                } else {
                    const link = document.createElement('a');
                    link.download = 'bitter-story.png';
                    link.href = canvas.toDataURL();
                    link.click();
                    haptics.success();
                }
                setIsSharing(false);
                setSharingMovie(null);
            }, 'image/png');
        } catch (error) {
            console.error(error);
            setIsSharing(false);
            setSharingMovie(null);
            haptics.error();
        }
      }, 500); // Délai pour charger l'image
  };

  const filteredAndSortedMovies = useMemo(() => {
    if (!activeProfile) return [];
    let result = [...activeProfile.movies];
    const targetStatus: MovieStatus = feedTab === 'history' ? 'watched' : 'watchlist';
    result = result.filter(m => (m.status || 'watched') === targetStatus);
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m => m.title.toLowerCase().includes(q) || m.director.toLowerCase().includes(q));
    }
    
    result.sort((a, b) => {
      if (sortBy === 'Date') return (b.dateWatched || b.dateAdded) - (a.dateWatched || a.dateAdded);
      if (sortBy === 'Year') return b.year - a.year;
      if (sortBy === 'Title') return a.title.localeCompare(b.title);
      if (sortBy === 'Rating') return ((b.ratings.story + b.ratings.visuals + b.ratings.acting + b.ratings.sound) / 4) - ((a.ratings.story + a.ratings.visuals + a.ratings.acting + a.ratings.sound) / 4);
      return 0;
    });
    return result;
  }, [activeProfile, sortBy, searchQuery, feedTab]);

  if (showWelcome) return (
    <WelcomePage 
        existingProfiles={profiles} 
        onSelectProfile={(id) => { setActiveProfileId(id); setShowWelcome(false); setViewMode('Feed'); }} 
        onCreateProfile={(f, l, m, g, a) => {
            const newP: UserProfile = { id: crypto.randomUUID(), firstName: f, lastName: l, favoriteMovie: m, gender: g, age: a, movies: [], createdAt: Date.now() };
            setProfiles(p => [...p, newP]);
            setActiveProfileId(newP.id);
            setShowWelcome(false);
        }} 
        onDeleteProfile={id => setProfiles(p => p.filter(x => x.id !== id))} 
    />
  );

  return (
    <div className="min-h-[100dvh] flex flex-col text-charcoal font-sans relative">
      <header className="pt-6 sm:pt-8 px-6 sticky top-0 z-40 bg-cream/95 backdrop-blur-xl border-b border-sand/40">
        <div className="flex items-center justify-between h-12 max-w-2xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div 
                onClick={() => { haptics.soft(); setShowChangelog(true); }}
                className="w-10 h-10 bg-charcoal text-white rounded-2xl flex items-center justify-center shadow-lg rotate-3 cursor-pointer hover:rotate-0 transition-all active:scale-95"
            >
                <Film size={20} strokeWidth={2} />
            </div>
            <div>
                <h1 className="text-xl font-black tracking-tighter leading-none text-charcoal">The Bitter</h1>
                <button 
                    onClick={() => { haptics.soft(); setShowChangelog(true); }}
                    className="text-[9px] font-black uppercase tracking-widest text-stone-400 hover:text-forest transition-colors"
                >
                    {RELEASE_HISTORY[0].version} • Notes
                </button>
            </div>
          </div>
          <button onClick={() => setShowWelcome(true)} className="w-10 h-10 rounded-2xl bg-white border border-sand flex items-center justify-center shadow-soft active:scale-90 transition-transform">
             <User size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 pt-6 pb-32">
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
            advanceTrigger={deckSessionCount} 
            favoriteGenres={activeProfile?.favoriteGenres} 
          />
        ) : (
          <div className="max-w-md mx-auto w-full space-y-8 animate-[fadeIn_0.5s_ease-out]">
            {(!activeProfile || activeProfile.movies.length === 0) ? (
               <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="w-24 h-24 bg-stone-50 rounded-[2.5rem] flex items-center justify-center text-stone-300 mb-8 shadow-sm"><Film size={40} /></div>
                    <h2 className="text-2xl font-black mb-3 tracking-tighter">Démarrez votre collection</h2>
                    <p className="text-stone-400 font-medium mb-10 max-w-xs mx-auto text-sm leading-relaxed">Calibrez votre analyste interne avec le deck de bienvenue de 5 films.</p>
                    <button onClick={() => setViewMode('Deck')} className="bg-lime-400 text-charcoal px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center gap-3 active:scale-95 transition-all">
                        <Target size={18} strokeWidth={3} /> Lancer le Deck
                    </button>
               </div>
            ) : (
               <div className="space-y-10">
                  {/* Onglets Centrés FIX */}
                  <div className="flex justify-center w-full">
                    <div className="bg-stone-100 p-1.5 rounded-full flex w-full max-w-[280px] shadow-inner border border-stone-200/50">
                        <button onClick={() => { haptics.soft(); setFeedTab('history'); }} className={`flex-1 py-3.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${feedTab === 'history' ? 'bg-white text-charcoal shadow-md scale-[1.02]' : 'text-stone-400 hover:text-stone-500'}`}>Historique</button>
                        <button onClick={() => { haptics.soft(); setFeedTab('queue'); }} className={`flex-1 py-3.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${feedTab === 'queue' ? 'bg-white text-charcoal shadow-md scale-[1.02]' : 'text-stone-400 hover:text-stone-500'}`}>À voir</button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-b border-sand pb-4">
                     <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-300">
                        {feedTab === 'history' ? 'Ma Bibliothèque' : 'Watchlist'}
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
                            onShowRecommendations={(m) => setRecSourceMovie(m)}
                            onShare={handleShareMovie}
                          />
                      ))}
                      {filteredAndSortedMovies.length === 0 && (
                          <div className="py-20 text-center opacity-30 flex flex-col items-center">
                              <Search size={32} className="mb-4" />
                              <p className="text-sm font-bold">Aucun film trouvé.</p>
                          </div>
                      )}
                  </div>
               </div>
            )}
          </div>
        )}
      </main>

      <nav className="fixed bottom-8 left-6 right-6 z-50 max-w-sm mx-auto">
         <div className="bg-white/95 backdrop-blur-2xl border border-white/20 shadow-2xl rounded-[2.5rem] px-6 py-3.5 flex justify-between items-center">
            <button onClick={() => { haptics.soft(); setViewMode('Feed'); }} className={`p-3 rounded-full transition-all ${viewMode === 'Feed' ? 'bg-sand text-charcoal shadow-sm' : 'text-stone-300'}`}><LayoutGrid size={22} /></button>
            <button onClick={() => { haptics.soft(); setViewMode('Discover'); }} className={`p-3 rounded-full transition-all ${viewMode === 'Discover' ? 'bg-sand text-charcoal shadow-sm' : 'text-stone-300'}`}><Clapperboard size={22} /></button>
            <button onClick={() => { haptics.medium(); setEditingMovie(null); setTmdbIdToLoad(null); setIsModalOpen(true); }} className="bg-forest text-white p-4.5 rounded-full shadow-xl shadow-forest/20 mx-2 active:scale-90 transition-transform"><Plus size={24} strokeWidth={3} /></button>
            <button onClick={() => { haptics.soft(); setViewMode('Analytics'); }} className={`p-3 rounded-full transition-all ${viewMode === 'Analytics' ? 'bg-sand text-charcoal shadow-sm' : 'text-stone-300'}`}><PieChart size={22} /></button>
            <button onClick={() => { haptics.soft(); setViewMode('Calendar'); }} className={`p-3 rounded-full transition-all ${viewMode === 'Calendar' ? 'bg-sand text-charcoal shadow-sm' : 'text-stone-300'}`}><CalendarDays size={22} /></button>
         </div>
      </nav>

      {/* FEEDBACK OVERLAY PENDANT GENERATION */}
      {isSharing && (
          <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
             <div className="bg-white p-6 rounded-3xl flex items-center gap-4 shadow-2xl">
                <Loader2 size={24} className="animate-spin text-charcoal" />
                <span className="text-xs font-black uppercase tracking-widest text-charcoal">Design Swiss Modern...</span>
             </div>
          </div>
      )}

      {/* --- HIDDEN STORY TEMPLATE (SWISS MODERN / FULL BLEED) --- */}
      <div style={{ position: 'fixed', top: 0, left: '-9999px', pointerEvents: 'none', zIndex: -50 }}>
        {sharingMovie && (
           <div 
                ref={shareRef}
                className="w-[1080px] h-[1920px] bg-black relative flex flex-col font-sans"
            >
                {/* Layer 1: Poster Full Screen */}
                {sharingMovie.posterUrl ? (
                    <img 
                        src={sharingMovie.posterUrl.replace('w780', 'original')} 
                        alt="" 
                        className="absolute inset-0 w-full h-full object-cover" 
                        crossOrigin="anonymous"
                    />
                ) : (
                    <div className="absolute inset-0 bg-stone-900 flex items-center justify-center">
                        <Clapperboard size={200} className="text-white/10" />
                    </div>
                )}

                {/* Layer 2: Gradients for readability */}
                <div className="absolute inset-x-0 top-0 h-[600px] bg-gradient-to-b from-black/90 via-black/40 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 h-[1000px] bg-gradient-to-t from-black via-black/90 to-transparent" />

                {/* Layer 3: Content */}
                <div className="relative z-10 flex flex-col h-full justify-between p-[80px]">
                    {/* Header */}
                    <div className="flex justify-between items-start pt-8">
                        <div>
                             <h2 className="text-white font-black text-3xl tracking-[0.4em] uppercase opacity-90 mb-2">The Bitter</h2>
                             <div className="h-1 w-20 bg-[#a3e635] rounded-full" />
                        </div>
                        <span className="text-white/60 font-bold text-3xl uppercase tracking-widest">
                            {sharingMovie.dateWatched ? new Date(sharingMovie.dateWatched).getFullYear() : sharingMovie.year}
                        </span>
                    </div>

                    {/* Footer */}
                    <div className="flex flex-col items-start pb-12">
                         {/* Title */}
                         <h1 className="text-white text-8xl font-black leading-[1.1] mb-8 max-w-4xl line-clamp-3 tracking-tight drop-shadow-2xl">
                            {sharingMovie.title}
                         </h1>
                         
                         {/* Genre Tag - FIX: Using sharingMovie.genre string */}
                         <div className="mb-12">
                             <span className="text-[#a3e635] text-2xl font-black uppercase tracking-[0.3em] border border-[#a3e635] px-6 py-2 rounded-full">
                                 {sharingMovie.genre || 'Cinéma'}
                             </span>
                         </div>

                         {/* Huge Score */}
                         <div className="flex flex-col">
                            {sharingMovie.smartphoneFactor && sharingMovie.smartphoneFactor > 50 ? (
                                <>
                                    <span className="text-[#ef4444] text-[350px] font-black leading-[0.8] tracking-tighter -ml-4 drop-shadow-lg">
                                        {sharingMovie.smartphoneFactor}<span className="text-[180px]">%</span>
                                    </span>
                                    <span className="text-white text-4xl font-bold uppercase tracking-[0.2em] mt-8 ml-2 opacity-90">
                                        Distraction Fatale
                                    </span>
                                </>
                            ) : (
                                <>
                                    <span className="text-[#a3e635] text-[350px] font-black leading-[0.8] tracking-tighter -ml-4 drop-shadow-lg">
                                        {((sharingMovie.ratings.story + sharingMovie.ratings.visuals + sharingMovie.ratings.acting + sharingMovie.ratings.sound) / 4).toFixed(1)}
                                    </span>
                                    <span className="text-white text-4xl font-bold uppercase tracking-[0.2em] mt-8 ml-2 opacity-90">
                                        Note Globale
                                    </span>
                                </>
                            )}
                         </div>
                    </div>
                </div>
            </div>
        )}
      </div>

      <AddMovieModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingMovie(null); setTmdbIdToLoad(null); }} onSave={handleSaveMovie} initialData={editingMovie} tmdbIdToLoad={tmdbIdToLoad} />
      
      <RecommendationsModal
        sourceMovie={recSourceMovie}
        isOpen={!!recSourceMovie}
        onClose={() => setRecSourceMovie(null)}
        onAddMovie={handleSaveMovie}
        existingTmdbIds={new Set(activeProfile?.movies.map(m => m.tmdbId).filter(Boolean) as number[])}
      />

      <ChangelogModal isOpen={showChangelog} onClose={() => setShowChangelog(false)} />

      {showCalibration && activeProfile && <OnboardingModal initialName={activeProfile.firstName} onComplete={handleCompleteCalibration} />}
      {showCookieBanner && <CookieBanner onAccept={() => { initAnalytics(); setShowCookieBanner(false); }} onDecline={() => setShowCookieBanner(false)} />}
    </div>
  );
};

export default App;
