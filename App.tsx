import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, SlidersHorizontal, X, LayoutGrid, PieChart, Clock, CheckCircle2, Sparkles, PiggyBank, Radar, Activity, Heart, User, LogOut, Clapperboard, Wand2, CalendarDays, BarChart3, Hourglass } from 'lucide-react';
import { GENRES, TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from './constants';
import { Movie, MovieFormData, MovieStatus, UserProfile } from './types';
import AnalyticsView from './components/AnalyticsView';
import MovieCard from './components/MovieCard';
import AddMovieModal from './components/AddMovieModal';
import WelcomePage from './components/WelcomePage';
import DiscoverView from './components/DiscoverView';
import CalendarView from './components/CalendarView';
import TutorialOverlay, { TutorialStep } from './components/TutorialOverlay';
import FilmographyModal from './components/FilmographyModal';
import ChangelogModal from './components/ChangelogModal';
import { RELEASE_HISTORY } from './constants/changelog';

type SortOption = 'Date' | 'Rating' | 'Year' | 'Title';
type ViewMode = 'Feed' | 'Analytics' | 'Discover' | 'Calendar';
type FeedTab = 'history' | 'queue';

const TUTORIALS: Record<string, TutorialStep[]> = {
  'Feed': [
    {
      title: "Votre Collection",
      desc: "Bienvenue dans votre espace personnel. Ici, retrouvez tous vos films vus (Historique) et ceux que vous prévoyez de voir (File d'attente).",
      icon: <LayoutGrid size={32} strokeWidth={1.5} />
    },
    {
      title: "Recherche Magique",
      desc: "Appuyez sur 'Nouveau Film' en bas. Tapez simplement un titre, et l'IA remplira tout pour vous : affiche, réalisateur, acteurs et synopsis !",
      icon: <Wand2 size={32} strokeWidth={1.5} />
    },
    {
      title: "Tri & Filtres",
      desc: "Utilisez les filtres en haut pour trier par genre, note ou date de visionnage afin de retrouver vos pépites instantanément.",
      icon: <SlidersHorizontal size={32} strokeWidth={1.5} />
    }
  ],
  'Discover': [
    {
      title: "À l'affiche",
      desc: "Explorez les sorties cinéma en France pour les 6 prochains mois. Ne ratez plus aucune pépite en salle.",
      icon: <Clapperboard size={32} strokeWidth={1.5} />
    },
    {
      title: "Planification",
      desc: "Un film vous intéresse ? Cliquez sur sa carte pour l'ajouter directement à votre liste 'À voir'.",
      icon: <CalendarDays size={32} strokeWidth={1.5} />
    }
  ],
  'Analytics': [
    {
      title: "Analyses",
      desc: "Visualisez vos habitudes cinéphiles. Découvrez vos genres préférés, vos acteurs fétiches et votre profil spectateur.",
      icon: <PieChart size={32} strokeWidth={1.5} />
    },
    {
      title: "Budget & Stats",
      desc: "Suivez votre rentabilité (Abo vs Tickets) et votre rythme de visionnage jour par jour.",
      icon: <BarChart3 size={32} strokeWidth={1.5} />
    }
  ],
  'Calendar': [
    {
      title: "Calendrier",
      desc: "Visualisez votre mois en un coup d'œil. Chaque affiche représente le jour où vous avez vu un film.",
      icon: <CalendarDays size={32} strokeWidth={1.5} />
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
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [activeGenre, setActiveGenre] = useState<string>('All');
  const [sortBy, setSortBy] = useState<SortOption>('Date');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [editingMovie, setEditingMovie] = useState<Movie | null>(null);
  const [tmdbIdToLoad, setTmdbIdToLoad] = useState<number | null>(null);
  const [activeTutorial, setActiveTutorial] = useState<TutorialStep[] | null>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [triggerMovieTitle, setTriggerMovieTitle] = useState<string | null>(null);
  const [maxDuration, setMaxDuration] = useState<number | null>(null);

  const [filmographyPerson, setFilmographyPerson] = useState<{ id: number; name: string } | null>(null);

  const currentVersion = RELEASE_HISTORY[0]?.version || 'v0.1';

  const STORAGE_KEY = 'the_bitter_profiles_v2';
  const LAST_PROFILE_KEY = 'the_bitter_last_profile';

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setProfiles(parsed);
      } catch (e) {
        setProfiles([]);
      }
    }
  }, []);

  useEffect(() => {
    if (profiles.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    }
  }, [profiles]);

  const activeProfile = useMemo(() => 
    profiles.find(p => p.id === activeProfileId) || null
  , [profiles, activeProfileId]);

  useEffect(() => {
    if (!activeProfile || activeProfile.movies.length === 0) {
      setRecommendations([]);
      return;
    }

    const sortedMovies = [...activeProfile.movies].sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
    
    const trigger = sortedMovies.find(m => {
      const avg = (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4;
      return (m.ratings.story >= 4 || avg >= 4) && m.tmdbId;
    });

    if (trigger && trigger.tmdbId) {
       setTriggerMovieTitle(trigger.title);
       
       const fetchRecommendations = async () => {
         try {
           const res = await fetch(`${TMDB_BASE_URL}/movie/${trigger.tmdbId}/recommendations?api_key=${TMDB_API_KEY}&language=fr-FR&page=1`);
           const data = await res.json();
           
           if (data.results) {
             const existingTmdbIds = new Set(activeProfile.movies.map(m => m.tmdbId).filter(Boolean));
             const existingTitles = new Set(activeProfile.movies.map(m => m.title.toLowerCase()));

             const filtered = data.results.filter((rec: any) => {
                return rec.poster_path && 
                       !existingTmdbIds.has(rec.id) && 
                       !existingTitles.has(rec.title.toLowerCase());
             });

             setRecommendations(filtered.slice(0, 10));
           }
         } catch (e) {
           console.error("Erreur reco", e);
         }
       };

       fetchRecommendations();
    } else {
      setRecommendations([]);
    }
  }, [activeProfile]);

  useEffect(() => {
    if (activeProfile && !showWelcome) {
      const seen = activeProfile.seenTutorials || [];
      if (TUTORIALS[viewMode] && !seen.includes(viewMode)) {
        const timer = setTimeout(() => {
          setActiveTutorial(TUTORIALS[viewMode]);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [viewMode, activeProfileId, showWelcome]);

  const handleCompleteTutorial = () => {
    if (!activeProfileId || !viewMode) return;
    setProfiles(prev => prev.map(p => {
      if (p.id !== activeProfileId) return p;
      const currentSeen = p.seenTutorials || [];
      if (currentSeen.includes(viewMode)) return p;
      return { ...p, seenTutorials: [...currentSeen, viewMode] };
    }));
    setActiveTutorial(null);
  };

  const handleCreateProfile = (firstName: string, lastName: string, favoriteMovie: string, gender: 'h' | 'f', age: number) => {
    const newProfile: UserProfile = {
      id: crypto.randomUUID(),
      firstName,
      lastName,
      favoriteMovie,
      gender,
      age,
      movies: [],
      createdAt: Date.now(),
      seenTutorials: []
    };
    setProfiles(prev => [...prev, newProfile]);
    setActiveProfileId(newProfile.id);
    localStorage.setItem(LAST_PROFILE_KEY, newProfile.id);
    setShowWelcome(false);
    setViewMode('Feed');
  };

  const handleSelectProfile = (id: string) => {
    setActiveProfileId(id);
    localStorage.setItem(LAST_PROFILE_KEY, id);
    setShowWelcome(false);
    setViewMode('Feed');
  };

  const handleLogout = () => {
    setShowWelcome(true);
    setActiveProfileId(null);
    setIsSearchOpen(false);
    setSearchQuery('');
    setActiveTutorial(null);
    setRecommendations([]);
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
  };

  const handleEditMovie = (movie: Movie) => {
    setEditingMovie(movie);
    setTmdbIdToLoad(null);
    setIsModalOpen(true);
  };

  const handleSelectDiscoverMovie = (tmdbId: number) => {
    setEditingMovie(null);
    setTmdbIdToLoad(tmdbId);
    setIsModalOpen(true);
    setFilmographyPerson(null);
  };

  const handleDeleteMovie = (id: string) => {
    if (!activeProfileId) return;
    setProfiles(prev => prev.map(p => {
      if (p.id !== activeProfileId) return p;
      return { ...p, movies: p.movies.filter(m => m.id !== id) };
    }));
  };

  const filteredAndSortedMovies = useMemo(() => {
    if (!activeProfile) return [];
    let result = [...activeProfile.movies];
    const targetStatus: MovieStatus = feedTab === 'history' ? 'watched' : 'watchlist';
    result = result.filter(m => (m.status || 'watched') === targetStatus);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m => 
        m.title.toLowerCase().includes(q) || 
        m.director.toLowerCase().includes(q) || 
        (m.actors && m.actors.toLowerCase().includes(q)) ||
        m.genre.toLowerCase().includes(q)
      );
    }

    if (feedTab === 'queue' && maxDuration) {
      result = result.filter(m => {
        return !m.runtime || m.runtime <= maxDuration;
      });
    }

    if (activeGenre !== 'All') result = result.filter(m => m.genre === activeGenre);

    result.sort((a, b) => {
      switch (sortBy) {
        case 'Date': return (b.dateWatched || b.dateAdded) - (a.dateWatched || a.dateAdded);
        case 'Year': return b.year - a.year;
        case 'Title': return a.title.localeCompare(b.title);
        case 'Rating': return ((b.ratings.story + b.ratings.visuals + b.ratings.acting + b.ratings.sound) / 4) - ((a.ratings.story + a.ratings.visuals + a.ratings.acting + a.ratings.sound) / 4);
        default: return 0;
      }
    });
    return result;
  }, [activeProfile, activeGenre, sortBy, searchQuery, feedTab, maxDuration]);

  const watchedMovies = useMemo(() => activeProfile?.movies.filter(m => m.status !== 'watchlist') || [], [activeProfile]);

  const getDynamicPlaceholder = () => {
    if (viewMode === 'Discover') return "Recherche non dispo ici...";
    if (feedTab === 'history') return "Titre, réalisateur...";
    return "Chercher dans ma file...";
  };

  const formatRuntime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h${m > 0 ? ` ${m}m` : ''}`;
  };

  if (showWelcome) return (
    <WelcomePage 
      existingProfiles={profiles} 
      onSelectProfile={handleSelectProfile} 
      onCreateProfile={handleCreateProfile} 
    />
  );

  return (
    <div className="min-h-screen pb-32 text-charcoal font-sans transition-colors duration-300 relative">
      <header className="pt-4 sm:pt-8 px-4 sm:px-6 sticky top-0 z-40 bg-cream/90 backdrop-blur-2xl pb-4 border-b border-sand/40">
        <div className="flex items-center gap-3 sm:gap-6 h-12 mb-0.5">
          
          <div className="flex items-center gap-2.5 shrink-0 group cursor-default">
            <div className="w-9 h-9 sm:w-11 sm:h-11 bg-forest text-white rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-forest/15 group-hover:rotate-6 transition-transform">
               <Heart size={20} fill="currentColor" />
            </div>
            <div className="flex flex-col items-start leading-none">
              <h1 className={`text-xl sm:text-2xl font-black tracking-tighter whitespace-nowrap hidden sm:block ${isSearchOpen ? 'lg:block hidden' : 'block'}`}>
                The Bitter
              </h1>
              <button 
                onClick={() => setIsChangelogOpen(true)}
                className="mt-0.5 px-1.5 py-0.5 bg-sand/40 border border-sand rounded-lg text-[9px] font-black text-stone-400 tracking-widest hover:bg-forest/5 hover:text-forest transition-all"
              >
                {currentVersion}
              </button>
            </div>
          </div>

          <div className={`flex-1 flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isSearchOpen ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0 sm:opacity-100 pointer-events-none sm:pointer-events-auto'}`}>
            {isSearchOpen ? (
                <div className="flex items-center gap-3 w-full max-w-lg bg-white border border-sand px-4 py-2.5 rounded-2xl shadow-inner focus-within:ring-2 focus-within:ring-forest/10 transition-all animate-[slideIn_0.2s_ease-out]">
                  <Search size={16} strokeWidth={2.5} className="text-stone-300 shrink-0" />
                  <input 
                    autoFocus
                    type="text" 
                    placeholder={getDynamicPlaceholder()}
                    className="flex-1 bg-transparent text-sm font-bold text-charcoal outline-none placeholder:text-stone-300 tracking-tight"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    disabled={viewMode === 'Discover'}
                  />
                  <button 
                    onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
                    className="p-1.5 bg-stone-100 rounded-full text-stone-500 hover:bg-stone-200 shrink-0 active:scale-90 transition-transform"
                  >
                    <X size={12} strokeWidth={3} />
                  </button>
                </div>
            ) : (
                <div className="hidden sm:flex flex-1" />
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
            {viewMode !== 'Discover' && !isSearchOpen && (
              <button 
                onClick={() => setIsSearchOpen(true)} 
                className="p-3 bg-white border border-sand shadow-soft rounded-2xl transition-all active:scale-90 hover:bg-sand"
                aria-label="Ouvrir la recherche"
              >
                <Search size={20} strokeWidth={2.5} />
              </button>
            )}
            
            <button 
              onClick={handleLogout} 
              className="group relative w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white border border-sand text-charcoal flex items-center justify-center font-black text-xs tracking-wider shadow-soft hover:bg-charcoal hover:text-white active:scale-90 transition-all overflow-hidden"
              title="Mon Profil"
            >
              {activeProfile ? (
                  <span className="relative z-10">{activeProfile.firstName[0]}{activeProfile.lastName[0]}</span>
              ) : (
                  <User size={20} />
              )}
              <div className="absolute inset-0 bg-charcoal opacity-0 group-hover:opacity-10 transition-opacity" />
            </button>
          </div>
        </div>
      </header>

      <main className="px-6 pt-4 pb-32">
        {viewMode === 'Analytics' ? (
          <AnalyticsView 
            movies={watchedMovies} 
            userName={activeProfile?.firstName} 
            onNavigateToCalendar={() => setViewMode('Calendar')}
          />
        ) : viewMode === 'Discover' ? (
          <DiscoverView onSelectMovie={handleSelectDiscoverMovie} userProfile={activeProfile} />
        ) : viewMode === 'Calendar' ? (
          <CalendarView movies={activeProfile?.movies || []} />
        ) : (
          <>
            {recommendations.length > 0 && !searchQuery && feedTab === 'history' && (
              <div className="mb-10 animate-[fadeIn_0.5s_ease-out]">
                 <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={12} className="text-tz-yellow animate-pulse" fill="currentColor" />
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">
                      Parce que tu as aimé <span className="text-charcoal">{triggerMovieTitle}</span>
                    </p>
                 </div>
                 
                 <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar -mx-6 px-6">
                    {recommendations.map(movie => (
                       <button 
                          key={movie.id} 
                          onClick={() => handleSelectDiscoverMovie(movie.id)}
                          className="flex-shrink-0 w-28 group relative"
                       >
                          <div className="w-full aspect-[2/3] rounded-2xl overflow-hidden bg-stone-100 mb-2 shadow-sm group-hover:shadow-lg transition-all relative">
                             <img 
                                src={`${TMDB_IMAGE_URL}${movie.poster_path}`} 
                                alt={movie.title} 
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                             />
                             <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Plus size={20} className="text-white drop-shadow-lg" strokeWidth={3} />
                             </div>
                             <div className="absolute top-1.5 right-1.5 bg-black/50 backdrop-blur-md text-white px-1.5 py-0.5 rounded-lg flex items-center gap-1">
                                <span className="text-[8px] font-bold">{movie.vote_average?.toFixed(1) || '--'}</span>
                             </div>
                          </div>
                          <h4 className="font-black text-[10px] text-charcoal leading-tight line-clamp-2 text-left group-hover:text-forest transition-colors uppercase tracking-tight">
                             {movie.title}
                          </h4>
                       </button>
                    ))}
                 </div>
              </div>
            )}

            <div className="bg-stone-100 p-1.5 rounded-full flex mx-auto max-w-sm mb-8 relative">
               <button 
                  onClick={() => setFeedTab('history')} 
                  className={`flex-1 py-3 rounded-full text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${feedTab === 'history' ? 'bg-white text-charcoal shadow-sm' : 'text-stone-400 hover:text-stone-500'}`}
               >
                  Historique
               </button>
               <button 
                  onClick={() => setFeedTab('queue')} 
                  className={`flex-1 py-3 rounded-full text-[11px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 ${feedTab === 'queue' ? 'bg-white text-charcoal shadow-sm' : 'text-stone-400 hover:text-stone-500'}`}
               >
                  File d'attente
                  {activeProfile?.movies.filter(m => m.status === 'watchlist').length > 0 && <span className="w-1.5 h-1.5 bg-forest rounded-full"></span>}
               </button>
            </div>
            
            {feedTab === 'queue' && (
              <div className="bg-white border border-sand p-6 rounded-3xl mb-8 shadow-sm animate-[fadeIn_0.3s_ease-out]">
                 <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                       <Hourglass size={16} className="text-forest" />
                       <span className="text-[11px] font-black uppercase tracking-widest text-charcoal">J'ai combien de temps ?</span>
                    </div>
                    <span className="text-sm font-bold text-forest bg-forest/10 px-3 py-1 rounded-full">
                       {maxDuration ? `Max: ${formatRuntime(maxDuration)}` : '∞ Illimité'}
                    </span>
                 </div>
                 
                 <input 
                    type="range" 
                    min="60" 
                    max="180" 
                    step="15"
                    value={maxDuration || 180} 
                    onChange={(e) => setMaxDuration(Number(e.target.value))}
                    className="w-full h-2 bg-sand rounded-lg appearance-none cursor-pointer accent-forest mb-6"
                 />
                 
                 <div className="flex gap-2">
                    <button onClick={() => setMaxDuration(90)} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${maxDuration === 90 ? 'bg-charcoal text-white' : 'bg-stone-50 text-stone-400 hover:bg-stone-100'}`}>{'< 1h30'}</button>
                    <button onClick={() => setMaxDuration(120)} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${maxDuration === 120 ? 'bg-charcoal text-white' : 'bg-stone-50 text-stone-400 hover:bg-stone-100'}`}>{'< 2h'}</button>
                    <button onClick={() => setMaxDuration(null)} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${maxDuration === null ? 'bg-sand text-charcoal border border-transparent' : 'bg-white border border-sand text-stone-400'}`}>Illimité</button>
                 </div>
              </div>
            )}

            <div className="mb-8 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">{searchQuery ? 'RÉSULTATS' : (feedTab === 'history' ? 'MA BIBLIOTHÈQUE' : 'PROCHAINEMENT')}</h2>
                <div className="flex items-center gap-2.5 group cursor-pointer">
                  <SlidersHorizontal size={14} strokeWidth={2.5} className="text-stone-300 group-hover:text-charcoal transition-colors" />
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className="bg-transparent text-[10px] font-black uppercase text-charcoal outline-none cursor-pointer tracking-widest">
                    <option value="Date">RÉCENTS</option>
                    <option value="Rating">NOTES</option>
                    <option value="Year">ANNÉE</option>
                    <option value="Title">A-Z</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2.5 overflow-x-auto pb-2 no-scrollbar -mx-6 px-6">
                <button onClick={() => setActiveGenre('All')} className={`whitespace-nowrap px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeGenre === 'All' ? 'bg-charcoal text-white shadow-lg' : 'bg-white border border-sand text-stone-400 hover:border-stone-200'}`}>Tout</button>
                {GENRES.map(genre => <button key={genre} onClick={() => setActiveGenre(genre)} className={`whitespace-nowrap px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeGenre === genre ? 'bg-charcoal text-white shadow-lg' : 'bg-white border border-sand text-stone-400 hover:border-stone-200'}`}>{genre}</button>)}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pb-20">
              {filteredAndSortedMovies.map((movie, index) => <MovieCard key={movie.id} movie={movie} index={index} onDelete={handleDeleteMovie} onEdit={handleEditMovie} onOpenFilmography={(id, name) => setFilmographyPerson({id, name})} searchQuery={searchQuery} />)}
            </div>
          </>
        )}
      </main>

      <nav className="fixed bottom-6 left-4 right-4 z-50 max-w-sm mx-auto">
         <div className="bg-white/95 backdrop-blur-xl border border-white/20 shadow-2xl rounded-[2.5rem] px-6 py-3 flex justify-between items-center relative">
            <button 
              onClick={() => setViewMode('Feed')} 
              className={`flex items-center justify-center transition-all duration-300 active:scale-90 ${viewMode === 'Feed' ? 'text-charcoal bg-sand/50 p-3 rounded-full' : 'text-stone-300 p-3 hover:text-stone-500'}`}
              aria-label="Collection"
            >
              <LayoutGrid size={22} strokeWidth={viewMode === 'Feed' ? 2.5 : 2} />
            </button>

            <button 
              onClick={() => setViewMode('Discover')} 
              className={`flex items-center justify-center transition-all duration-300 active:scale-90 ${viewMode === 'Discover' ? 'text-charcoal bg-sand/50 p-3 rounded-full' : 'text-stone-300 p-3 hover:text-stone-500'}`}
              aria-label="À l'affiche"
            >
              <Clapperboard size={22} strokeWidth={viewMode === 'Discover' ? 2.5 : 2} />
            </button>

            <button 
              onClick={() => { setEditingMovie(null); setTmdbIdToLoad(null); setIsModalOpen(true); }} 
              className="bg-forest text-white p-4 rounded-full shadow-xl shadow-forest/20 active:scale-90 hover:scale-105 transition-all mx-2"
              aria-label="Nouveau Film"
            >
               <Plus size={24} strokeWidth={3} />
            </button>

            <button 
              onClick={() => setViewMode('Analytics')} 
              className={`flex items-center justify-center transition-all duration-300 active:scale-90 ${viewMode === 'Analytics' ? 'text-charcoal bg-sand/50 p-3 rounded-full' : 'text-stone-300 p-3 hover:text-stone-500'}`}
              aria-label="Analyses"
            >
              <PieChart size={22} strokeWidth={viewMode === 'Analytics' ? 2.5 : 2} />
            </button>

            <button 
              onClick={() => setViewMode('Calendar')} 
              className={`flex items-center justify-center transition-all duration-300 active:scale-90 ${viewMode === 'Calendar' ? 'text-charcoal bg-sand/50 p-3 rounded-full' : 'text-stone-300 p-3 hover:text-stone-500'}`}
              aria-label="Calendrier"
            >
              <CalendarDays size={22} strokeWidth={viewMode === 'Calendar' ? 2.5 : 2} />
            </button>
         </div>
      </nav>

      <AddMovieModal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setEditingMovie(null); setTmdbIdToLoad(null); }} 
        onSave={handleSaveMovie} 
        initialData={editingMovie} 
        tmdbIdToLoad={tmdbIdToLoad} 
        onOpenFilmography={(id, name) => setFilmographyPerson({id, name})}
      />
      
      <FilmographyModal 
        isOpen={!!filmographyPerson} 
        personId={filmographyPerson?.id || 0} 
        personName={filmographyPerson?.name || ''} 
        onClose={() => setFilmographyPerson(null)}
        onSelectMovie={handleSelectDiscoverMovie}
      />

      <ChangelogModal 
        isOpen={isChangelogOpen} 
        onClose={() => setIsChangelogOpen(false)} 
      />

      {activeTutorial && <TutorialOverlay steps={activeTutorial} onComplete={handleCompleteTutorial} />}
    </div>
  );
};

export default App;
