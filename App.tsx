import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, SlidersHorizontal, X, LayoutGrid, PieChart, Clock, CheckCircle2, Sparkles, PiggyBank, Radar, Activity } from 'lucide-react';
import { INITIAL_MOVIES, GENRES } from './constants';
import { Movie, MovieFormData, MovieStatus } from './types';
import AnalyticsView from './components/AnalyticsView';
import MovieCard from './components/MovieCard';
import AddMovieModal from './components/AddMovieModal';
import WelcomePage from './components/WelcomePage';
import TutorialOverlay, { TutorialStep } from './components/TutorialOverlay';

type SortOption = 'Date' | 'Rating' | 'Year' | 'Title';
type ViewMode = 'Feed' | 'Analytics';
type FeedTab = 'history' | 'queue';

const App: React.FC = () => {
  const [showWelcome, setShowWelcome] = useState(true);
  const [activeTutorial, setActiveTutorial] = useState<'Collection' | 'Analytics' | null>(null);
  
  const [movies, setMovies] = useState<Movie[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('Feed');
  const [feedTab, setFeedTab] = useState<FeedTab>('history');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeGenre, setActiveGenre] = useState<string>('All');
  const [sortBy, setSortBy] = useState<SortOption>('Date');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [editingMovie, setEditingMovie] = useState<Movie | null>(null);

  const STORAGE_KEY = 'the_bitter_data_clean_v1';

  // --- Initial Load ---
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setMovies(JSON.parse(saved));
      } catch (e) {
        setMovies(INITIAL_MOVIES);
      }
    } else {
      setMovies(INITIAL_MOVIES);
    }
    
    const hasVisited = localStorage.getItem('the_bitter_visited');
    if (hasVisited) {
       setShowWelcome(false);
       // Si déjà visité mais pas de tuto, on checke plus tard
       const hasSeenMain = localStorage.getItem('the_bitter_tutorial_seen');
       if (!hasSeenMain) setActiveTutorial('Collection');
    }
  }, []);

  // --- Auto-Save ---
  useEffect(() => {
    if (movies !== INITIAL_MOVIES) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(movies));
    }
  }, [movies]);

  // --- Contextual Tutorial Triggers ---
  useEffect(() => {
    if (viewMode === 'Analytics' && !localStorage.getItem('the_bitter_analytics_tutorial_seen')) {
      setActiveTutorial('Analytics');
    }
  }, [viewMode]);

  const handleEnterApp = () => {
      setShowWelcome(false);
      localStorage.setItem('the_bitter_visited', 'true');
      const hasSeenMain = localStorage.getItem('the_bitter_tutorial_seen');
      if (!hasSeenMain) setActiveTutorial('Collection');
  };

  const completeTutorial = (type: 'Collection' | 'Analytics') => {
    setActiveTutorial(null);
    if (type === 'Collection') localStorage.setItem('the_bitter_tutorial_seen', 'true');
    if (type === 'Analytics') localStorage.setItem('the_bitter_analytics_tutorial_seen', 'true');
  };

  // --- Movie Handlers ---
  const handleSaveMovie = (data: MovieFormData) => {
    if (editingMovie) {
      setMovies(prev => prev.map(m => m.id === editingMovie.id ? { ...m, ...data } : m));
      setEditingMovie(null);
    } else {
      const newMovie: Movie = { ...data, id: crypto.randomUUID(), dateAdded: Date.now() };
      setMovies(prev => [newMovie, ...prev]);
    }
    setIsModalOpen(false);
  };

  const handleEditMovie = (movie: Movie) => {
    setEditingMovie(movie);
    setIsModalOpen(true);
  };

  const handleDeleteMovie = (id: string) => {
    setMovies(prev => prev.filter(m => m.id !== id));
  };

  // --- Filtering ---
  const filteredAndSortedMovies = useMemo(() => {
    let result = [...movies];
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
  }, [movies, activeGenre, sortBy, searchQuery, feedTab]);

  const watchedMovies = useMemo(() => movies.filter(m => m.status !== 'watchlist'), [movies]);

  // --- Tutorial Steps Definitions ---
  const collectionSteps: TutorialStep[] = [
    {
      title: "Prêt pour le voyage ?",
      desc: "The Bitter est votre carnet de bord cinéma. Voici comment en tirer le meilleur parti.",
      icon: <Sparkles size={28} />
    },
    {
      title: "Recherche Intelligente",
      desc: "Utilisez la barre de recherche connectée à TMDB pour ajouter un film. Le titre, le réalisateur et le résumé seront remplis automatiquement !",
      icon: <Search size={28} />
    },
    {
      title: "Gestion de Collection",
      desc: "Basculez entre votre 'Historique' (films vus) et votre 'File d'attente' (vos futures envies).",
      icon: <LayoutGrid size={28} />
    }
  ];

  const analyticsSteps: TutorialStep[] = [
    {
      title: "Votre ADN Ciné",
      desc: "Bienvenue dans vos analyses. Ici, vos données racontent votre histoire de spectateur.",
      icon: <PieChart size={28} />
    },
    {
      title: "Radar de Goût",
      desc: "Le Radar Moyen synthétise vos préférences : êtes-vous plutôt porté sur le visuel, le jeu d'acteur ou le scénario ?",
      icon: <Radar size={28} />
    },
    {
      title: "Rentabilité Abo",
      desc: "La carte 'Abo Ciné' calcule vos économies réelles basées sur votre rythme de visionnage actuel.",
      icon: <PiggyBank size={28} />
    },
    {
      title: "Activité Hebdo",
      desc: "Visualisez vos jours de prédilection pour le cinéma. Idéal pour repérer vos routines.",
      icon: <Activity size={28} />
    }
  ];

  if (showWelcome) return <WelcomePage onEnter={handleEnterApp} />;

  return (
    <div className="min-h-screen pb-24 bg-cream text-charcoal font-sans transition-colors duration-300 animate-[fadeIn_0.5s_ease-out] relative">
      
      {activeTutorial === 'Collection' && (
        <TutorialOverlay steps={collectionSteps} onComplete={() => completeTutorial('Collection')} />
      )}
      {activeTutorial === 'Analytics' && (
        <TutorialOverlay steps={analyticsSteps} onComplete={() => completeTutorial('Analytics')} />
      )}

      {/* --- Header --- */}
      <header className="pt-6 px-6 sticky top-0 z-20 bg-cream/95 backdrop-blur-md pb-4 transition-colors duration-300">
        <div className="flex items-center justify-between mb-4 h-10">
            {isSearchOpen ? (
              <div className="flex-1 flex items-center gap-2 animate-[fadeIn_0.2s_ease-out]">
                  <Search size={18} className="text-stone-400" />
                  <input 
                    autoFocus
                    type="text" 
                    placeholder="Rechercher dans ma collection..." 
                    className="flex-1 bg-transparent text-lg font-bold text-charcoal outline-none placeholder:text-stone-300"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  <button 
                    onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
                    className="p-2 bg-stone-100 rounded-full text-stone-500 hover:bg-stone-200"
                  >
                    <X size={16} />
                  </button>
              </div>
            ) : (
              <>
                  <div className="text-2xl font-extrabold tracking-tighter text-charcoal">The Bitter</div>
                  <div className="flex items-center gap-3">
                     <button onClick={() => setIsSearchOpen(true)} className="p-2 hover:bg-sand rounded-full transition-colors text-charcoal">
                       <Search size={22} strokeWidth={2.5} />
                     </button>
                     <div className="w-9 h-9 rounded-full bg-forest text-white flex items-center justify-center font-bold text-xs tracking-wider shadow-md">JB</div>
                  </div>
              </>
            )}
        </div>

        {!isSearchOpen && (
            <div className="flex p-1.5 bg-white border border-stone-100 rounded-2xl shadow-sm relative">
                <button 
                  onClick={() => setViewMode('Feed')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 ${viewMode === 'Feed' ? 'bg-charcoal text-white shadow-md' : 'text-stone-400 hover:bg-stone-50'}`}
                >
                    <LayoutGrid size={14} strokeWidth={2.5} /> Collection
                </button>
                <button 
                  onClick={() => setViewMode('Analytics')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 ${viewMode === 'Analytics' ? 'bg-charcoal text-white shadow-md' : 'text-stone-400 hover:bg-stone-50'}`}
                >
                    <PieChart size={14} strokeWidth={2.5} /> Analyses
                </button>
            </div>
        )}
      </header>

      {/* --- Main Content --- */}
      <main className="px-6 pt-2">
        {viewMode === 'Analytics' ? (
            <AnalyticsView movies={watchedMovies} />
        ) : (
            <>
                <div className="flex items-center gap-6 mb-6 border-b border-stone-200/60 pb-1">
                    <button onClick={() => setFeedTab('history')} className={`pb-2 text-sm font-bold tracking-wide transition-all ${feedTab === 'history' ? 'text-charcoal border-b-2 border-charcoal' : 'text-stone-400 hover:text-stone-500'}`}>
                       Historique
                    </button>
                    <button onClick={() => setFeedTab('queue')} className={`pb-2 text-sm font-bold tracking-wide transition-all flex items-center gap-2 ${feedTab === 'queue' ? 'text-charcoal border-b-2 border-charcoal' : 'text-stone-400 hover:text-stone-500'}`}>
                       File d'attente
                       {movies.filter(m => m.status === 'watchlist').length > 0 && <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>}
                    </button>
                </div>

                <div className="mb-6 space-y-4">
                  <div className="flex justify-between items-center">
                     <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">
                       {searchQuery ? 'Résultats' : (feedTab === 'history' ? 'Votre Bibliothèque' : 'À voir')}
                     </h2>
                     <div className="flex items-center gap-2">
                        <SlidersHorizontal size={14} className="text-stone-400" />
                        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className="bg-transparent text-xs font-bold text-charcoal outline-none cursor-pointer">
                          <option value="Date">Récents</option>
                          <option value="Rating">Mieux notés</option>
                          <option value="Year">Année</option>
                          <option value="Title">A-Z</option>
                        </select>
                     </div>
                  </div>

                  <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar -mx-6 px-6">
                    <button onClick={() => setActiveGenre('All')} className={`whitespace-nowrap px-5 py-2.5 rounded-full text-xs font-bold transition-all ${activeGenre === 'All' ? 'bg-charcoal text-white shadow-lg shadow-charcoal/20' : 'bg-white border border-stone-100 text-stone-500 hover:bg-stone-50'}`}>Tout</button>
                    {GENRES.map(genre => (
                      <button key={genre} onClick={() => setActiveGenre(genre)} className={`whitespace-nowrap px-5 py-2.5 rounded-full text-xs font-bold transition-all ${activeGenre === genre ? 'bg-charcoal text-white shadow-lg shadow-charcoal/20' : 'bg-white border border-stone-100 text-stone-500 hover:bg-stone-50'}`}>{genre}</button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pb-10">
                   {filteredAndSortedMovies.map((movie, index) => (
                     <MovieCard key={movie.id} movie={movie} index={index} onDelete={handleDeleteMovie} onEdit={handleEditMovie} searchQuery={searchQuery} />
                   ))}
                </div>
                
                {filteredAndSortedMovies.length === 0 && (
                    <div className="py-24 text-center">
                      <div className="mb-4 inline-flex items-center justify-center w-16 h-16 rounded-full bg-stone-100 text-stone-300">
                          {feedTab === 'queue' ? <Clock size={32} /> : <CheckCircle2 size={32} />}
                      </div>
                      <p className="text-stone-300 font-bold text-lg mb-2">{feedTab === 'queue' ? 'Liste vide.' : 'Aucun film enregistré.'}</p>
                      <p className="text-stone-400 text-sm">Appuyez sur + pour ajouter.</p>
                    </div>
                )}
            </>
        )}
      </main>

      {viewMode === 'Feed' && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-30">
            <button
              onClick={() => { setEditingMovie(null); setIsModalOpen(true); }}
              className="group flex items-center gap-3 bg-forest text-white pl-6 pr-8 py-4 rounded-full shadow-xl shadow-forest/30 hover:scale-105 active:scale-95 transition-all duration-300 hover:shadow-2xl hover:shadow-forest/40"
            >
              <div className="bg-white/20 p-1 rounded-full"><Plus size={20} strokeWidth={3} /></div>
              <span className="font-extrabold tracking-wide text-sm">Ajouter</span>
            </button>
          </div>
      )}

      <AddMovieModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingMovie(null); }} onSave={handleSaveMovie} initialData={editingMovie} />
    </div>
  );
};

export default App;